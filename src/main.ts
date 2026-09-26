import "./style.css";
import type { Design, Material, Part, Workshop } from "./types";
import { defaultMaterials, defaultTools, defaultWorkshop } from "./defaults";
import { TEMPLATES, emptyDesign, templateById, type Template } from "./generators";
import { newId } from "./generators/builder";
import { parsePrompt, paramsFromParsed, type Parsed } from "./parse";
import { bounds, checkDesign, cutList, partShape, purchases, type Warning } from "./analysis";
import { Viewer } from "./viewer";
import { AI_MODELS, aiDesign, aiErrorMessage, type AiSettings } from "./ai";
import { LOAD_PRESETS, analyzeStrength, defaultLoad, type MemberResult, type StrengthReport } from "./strength";
import { autoReinforce, suggestFor, type Suggestion } from "./reinforce";
import { COATINGS, COLORS, EDGES, PRESETS, SANDING, coatingInfo, describeFinish, effectiveFinish, finishSummary, type Finish, type FinishSummary } from "./finish";

// ---------------------------------------------------------------- state

/** Bygget för claude.ai-artefakter: där fungerar inte nedladdning, utskrift eller externa API-anrop. */
const ARTIFACT = import.meta.env.VITE_ARTIFACT === "1";
if (ARTIFACT) document.querySelectorAll<HTMLElement>('[data-act="export"], [data-act="screenshot"], [data-act="print"]').forEach((b) => b.remove());

const KEY = "bygglabbet:v1";
const PROJECTS = "bygglabbet:projects";

interface State {
  ws: Workshop;
  design: Design;
  customTitle: boolean;
  ai: AiSettings & { remember: boolean };
  theme: "auto" | "light" | "dark";
}

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* privat läge m.m. */
  }
}

function initialState(): State {
  const saved = safeGet<Partial<State> | null>(KEY, null);
  const shelfT = TEMPLATES[0];
  const ws = saved?.ws ?? defaultWorkshop();
  // Nya standardmaterial i senare versioner läggs till i sparade verkstäder
  for (const m of defaultMaterials()) if (!ws.materials.some((x) => x.id === m.id)) ws.materials.push(m);
  for (const t of defaultTools()) if (!ws.tools.some((x) => x.id === t.id)) ws.tools.push(t);
  const design = saved?.design ?? shelfT.build(ws, paramsFromParsed(shelfT, parsePrompt(shelfT.example)), shelfT.example);
  return {
    ws,
    design,
    customTitle: saved?.customTitle ?? false,
    ai: { apiKey: "", model: AI_MODELS[0].id, remember: false, ...(saved?.ai ?? {}) },
    theme: saved?.theme ?? "auto",
  };
}

const state = initialState();
if (!state.design.prompt) state.design.prompt = "";
/** Markerade delar (id). Flera = hel enhet, t.ex. ett fack. */
let selection: string[] = [];
let moveMode = false;
let stepIdx = -1;
let lastParsed: Parsed | null = null;
let aiBusy = false;
let aiReply = "";
const undoStack: string[] = [];
const redoStack: string[] = [];

function persist() {
  const ai = state.ai.remember ? state.ai : { ...state.ai, apiKey: "" };
  safeSet(KEY, { ...state, ai });
}

const snapshot = () => JSON.stringify({ ws: state.ws, design: state.design });

/** Gör en ändring som kan ångras. */
function commit(fn: () => void, opts: { fit?: boolean; keepBuild?: boolean } = {}) {
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  fn();
  afterChange(opts);
}

function afterChange(opts: { fit?: boolean; keepBuild?: boolean } = {}) {
  if (selection.length) selection = selection.filter((id) => state.design.parts.some((p) => p.id === id));
  if (stepIdx >= state.design.steps.length) stepIdx = -1;
  persist();
  renderAll(opts);
}

function restore(snap: string) {
  const s = JSON.parse(snap);
  state.ws = s.ws;
  state.design = s.design;
  afterChange();
}
function undo() {
  const s = undoStack.pop();
  if (!s) return;
  redoStack.push(snapshot());
  restore(s);
}
function redo() {
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push(snapshot());
  restore(s);
}

// ---------------------------------------------------------------- helpers

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE");
const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;
const matOf = (id: string) => state.ws.materials.find((m) => m.id === id);
const body = (name: string) => $(`[data-body="${name}"]`);

function toast(msg: string, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((t as unknown as { _t: number })._t);
  (t as unknown as { _t: number })._t = window.setTimeout(() => (t.hidden = true), ms);
}

function download(name: string, data: string, type: string) {
  const a = document.createElement("a");
  a.href = data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
}

function slug(s: string) {
  return s.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "projekt";
}

// ---------------------------------------------------------------- generering

function regenerate(t: Template, params: Design["params"], prompt: string) {
  const title = state.customTitle ? state.design.title : null;
  // Behåll vald last för hållfasthetsanalysen när samma mall byggs om
  const load = state.design.templateId === t.id ? state.design.loadKgM2 : undefined;
  const d = t.build(state.ws, params, prompt);
  if (title) d.title = title;
  if (load != null) d.loadKgM2 = load;
  // Ytbehandling per grupp/helhet följer med när mallen byggs om
  if (state.design.finishes && state.design.templateId === t.id) d.finishes = state.design.finishes;
  state.design = d;
  stepIdx = -1;
}

/** När material/verktyg ändras: bygg om mallen så den anpassas. */
function adaptToWorkshop() {
  const t = templateById(state.design.templateId);
  if (t && !state.design.edited) regenerate(t, state.design.params, state.design.prompt);
}

function runPrompt() {
  const text = ($("#prompt") as HTMLTextAreaElement).value.trim();
  if (!text) return toast("Skriv vad du vill bygga först.");
  const parsed = parsePrompt(text);
  lastParsed = parsed;
  if (!parsed.template) {
    if (state.ai.apiKey) return runAi(text);
    renderBuild();
    return toast("Hittade ingen passande mall. Välj en mall nedan – eller lägg in en API-nyckel så kan AI:n rita vad som helst.", 6000);
  }
  const params = paramsFromParsed(parsed.template, parsed);
  state.customTitle = false;
  aiReply = "";
  commit(() => regenerate(parsed.template!, params, text), { fit: true });
}

async function runAi(text?: string) {
  const request = text ?? ($("#prompt") as HTMLTextAreaElement).value.trim();
  if (!request) return toast("Skriv vad du vill bygga eller ändra först.");
  if (!state.ai.apiKey) {
    ($("#ai-settings") as HTMLDetailsElement).open = true;
    return toast("Lägg in din Anthropic API-nyckel under AI-inställningar.");
  }
  const base = ($("#ai-base") as HTMLInputElement | null)?.checked && state.design.parts.length ? state.design : null;
  aiBusy = true;
  aiReply = "";
  renderBuild();
  try {
    const { design, reply } = await aiDesign(state.ai, state.ws, request, base, (n) => {
      const el = $("#ai-progress");
      if (el) el.textContent = `Ritar… (${fmt(n)} tecken)`;
    });
    aiReply = reply;
    state.customTitle = false;
    commit(() => {
      state.design = { ...design, edited: true };
      stepIdx = -1;
    }, { fit: true });
  } catch (e) {
    toast(aiErrorMessage(e), 7000);
  } finally {
    aiBusy = false;
    renderBuild();
  }
}

// ---------------------------------------------------------------- viewer

const viewer = new Viewer($("#viewport"), {
  onSelect: (id, mode) => select(id, mode),
  onMove: (ids, delta) => moveParts(ids, delta),
  onHover: (part, x, y) => {
    const tip = $("#tooltip");
    if (!part) return void (tip.hidden = true);
    const m = matOf(part.materialId);
    const s = m ? partShape(part, m) : null;
    tip.textContent = `${part.name} · ${m?.name ?? "?"}${s ? ` · ${fmt(s.length)} mm` : ""}`;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.hidden = false;
  },
});

/** Delar som hör till samma enhet (t.ex. "Fack 2") – eller samma grupp om delen saknar enhet. */
function unitMates(id: string): string[] {
  const p = state.design.parts.find((x) => x.id === id);
  if (!p) return [];
  return state.design.parts.filter((x) => (p.unit ? x.unit === p.unit : x.group === p.group)).map((x) => x.id);
}

function select(id: string | null, mode: "replace" | "toggle" | "unit" = "replace", scroll = true) {
  if (!id) selection = [];
  else if (mode === "toggle") selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
  else if (mode === "unit") selection = unitMates(id);
  else selection = [id];
  setSelection(selection, scroll);
}

function setSelection(ids: string[], scroll = true) {
  selection = ids;
  viewer.select(selection, moveMode);
  viewer.setHighlight([]);
  renderParts();
  if (finScope === "sel" || (ids.length && !body("finish").hidden)) {
    if (ids.length && !body("finish").hidden) finScope = "sel";
    renderFinish();
  }
  if (selection.length && scroll && body("finish").hidden) switchTab("right", "parts");
}

/** Flytta flera delar lika mycket (mm). */
function moveParts(ids: string[], delta: { x: number; y: number; z: number }) {
  const set = new Set(ids);
  commit(() => {
    for (const p of state.design.parts)
      if (set.has(p.id)) {
        p.pos.x += delta.x;
        p.pos.y += delta.y;
        p.pos.z += delta.z;
      }
    state.design.edited = true;
  });
}

function applySteps() {
  const steps = state.design.steps;
  if (stepIdx < 0 || !steps.length) {
    viewer.setSteps(null, null);
  } else {
    const referenced = new Set(steps.flatMap((s) => s.groups));
    const visible = new Set(steps.slice(0, stepIdx + 1).flatMap((s) => s.groups));
    for (const p of state.design.parts) if (!referenced.has(p.group)) visible.add(p.group);
    viewer.setSteps(visible, new Set(steps[stepIdx].groups));
  }
  renderStepbar();
}

// ---------------------------------------------------------------- tabs

function switchTab(side: "left" | "right", tab: string) {
  const nav = $(`[data-tabs="${side}"]`);
  nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const panel = nav.parentElement!;
  panel.querySelectorAll<HTMLElement>(".tab-body").forEach((b) => (b.hidden = b.dataset.body !== tab));
}
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((nav) =>
  nav.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b?.dataset.tab) switchTab(nav.dataset.tabs as "left" | "right", b.dataset.tab);
  }),
);

// ---------------------------------------------------------------- render: Bygg

function renderBuild() {
  const d = state.design;
  const t = templateById(d.templateId);
  const el = body("build");
  const promptVal = ($("#prompt") as HTMLTextAreaElement | null)?.value ?? d.prompt;
  let interp = "";
  if (lastParsed) {
    const bits: string[] = [];
    if (lastParsed.template) bits.push(`<strong>${esc(lastParsed.template.name)}</strong>`);
    const names: Record<string, string> = { width: "bredd", height: "höjd", depth: "djup", length: "längd" };
    for (const [k, v] of Object.entries(lastParsed.dims)) bits.push(`${names[k]} ${fmt(v!)} mm`);
    if (lastParsed.count != null && lastParsed.template?.params.some((p) => ["shelves", "drawers", "levels"].includes(p.key))) bits.push(`antal ${lastParsed.count}`);
    if (lastParsed.hole != null && lastParsed.template?.id === "birdHouse") bits.push(`hål Ø${lastParsed.hole} mm`);
    if (lastParsed.againstWall != null) bits.push(lastParsed.againstWall ? "mot vägg" : "fristående");
    if (lastParsed.door != null) bits.push(lastParsed.door ? "med dörr" : "utan dörr");
    interp = `<div class="interp">Tolkat: ${bits.join(" · ") || "<em>inget känt</em>"}</div>`;
  }
  el.innerHTML = `
    <h3>Vad vill du bygga?</h3>
    <textarea id="prompt" placeholder="t.ex. Bygg ett hyllsystem mot en vägg som är 2,5 meter bred och 3 meter hög">${esc(promptVal)}</textarea>
    <div class="actions">
      <button id="go" class="btn primary">Bygg</button>
      <button id="ai-go" class="btn" ${aiBusy || ARTIFACT ? "disabled" : ""}>${aiBusy ? `<span class="spinner"></span> <span id="ai-progress">Tänker…</span>` : "✨ Bygg/ändra med AI"}</button>
    </div>
    ${state.design.parts.length && !ARTIFACT ? `<label class="switch small muted" style="margin-top:8px"><input type="checkbox" id="ai-base" checked /> AI utgår från nuvarande konstruktion</label>` : ""}
    ${interp}
    ${aiReply ? `<div class="ai-reply">${esc(aiReply)}</div>` : ""}
    ${d.edited && t ? `<div class="interp">Konstruktionen är ändrad för hand. <button class="btn small" id="regen">Generera om från mallen</button></div>` : ""}

    <h3>Mallar</h3>
    <div class="templates">
      ${TEMPLATES.map((x) => `<button class="tpl ${x.id === d.templateId ? "active" : ""}" data-tpl="${x.id}" title="${esc(x.example)}"><span class="ico">${x.icon}</span>${esc(x.name)}</button>`).join("")}
    </div>

    ${t ? `<h3>Mått & inställningar – ${esc(t.name)}</h3><div id="params">${t.params.map((p) => paramHtml(p, d.params[p.key])).join("")}</div>` : ""}

    <h3>AI</h3>
    ${ARTIFACT ? `<p class="small muted">AI-läget fungerar i den fristående versionen av appen (kör <code>npm run dev</code> eller GitHub Pages) – här kan du använda mallarna och fri redigering.</p>` : `<details class="card" id="ai-settings" ${!state.ai.apiKey ? "" : ""}>
      <summary>AI-inställningar ${state.ai.apiKey ? "✓" : ""}</summary>
      <p class="small muted">Med en egen Anthropic API-nyckel kan Claude rita helt fria konstruktioner ("bygg en fågelholk", "gör hyllan 20 cm djupare och lägg till en lucka") utifrån dina material och verktyg. Nyckeln används bara direkt från din webbläsare.</p>
      <label class="field"><span>API-nyckel</span><input type="password" id="ai-key" value="${esc(state.ai.apiKey)}" placeholder="sk-ant-…" autocomplete="off" /></label>
      <label class="field"><span>Modell</span><select id="ai-model">${AI_MODELS.map((m) => `<option value="${m.id}" ${m.id === state.ai.model ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
      <label class="switch small"><input type="checkbox" id="ai-remember" ${state.ai.remember ? "checked" : ""}/> Kom ihåg nyckeln i den här webbläsaren</label>
    </details>`}`;
}

function paramHtml(p: Template["params"][number], v: number | boolean | undefined) {
  if (p.type === "bool")
    return `<label class="switch"><input type="checkbox" data-param="${p.key}" ${v ? "checked" : ""}/> ${esc(p.label)}</label>`;
  const val = Number(v ?? p.default);
  return `<div class="param"><div class="head"><span>${esc(p.label)}</span><span><input type="number" data-param="${p.key}" data-num value="${val}" min="${p.min}" max="${p.max}" step="${p.step}"/> <span class="muted small">${p.unit ?? "st"}</span></span></div>
    <input type="range" data-param="${p.key}" value="${val}" min="${p.min}" max="${p.max}" step="${p.step}"/></div>`;
}

const buildEl = body("build");
buildEl.addEventListener("click", (e) => {
  const tgt = e.target as HTMLElement;
  if (tgt.closest("#go")) runPrompt();
  else if (tgt.closest("#ai-go")) runAi();
  else if (tgt.closest("#regen")) {
    const t = templateById(state.design.templateId)!;
    commit(() => regenerate(t, state.design.params, state.design.prompt), { fit: true });
  } else {
    const tpl = tgt.closest<HTMLElement>("[data-tpl]");
    if (tpl) {
      const t = templateById(tpl.dataset.tpl!)!;
      ($("#prompt") as HTMLTextAreaElement).value = t.example;
      lastParsed = parsePrompt(t.example);
      state.customTitle = false;
      aiReply = "";
      commit(() => regenerate(t, paramsFromParsed(t, lastParsed!), t.example), { fit: true });
    }
  }
});
buildEl.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).id === "prompt" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) runPrompt();
});

let paramTimer = 0;
buildEl.addEventListener("input", (e) => {
  const tgt = e.target as HTMLInputElement;
  if (tgt.id === "ai-key") {
    state.ai.apiKey = tgt.value.trim();
    return persist();
  }
  const key = tgt.dataset.param;
  if (!key) return;
  const t = templateById(state.design.templateId);
  if (!t) return;
  const v = tgt.type === "checkbox" ? tgt.checked : Number(tgt.value);
  if (tgt.type !== "checkbox") buildEl.querySelectorAll<HTMLInputElement>(`[data-param="${key}"]`).forEach((i) => i !== tgt && (i.value = String(v)));
  if (tgt.type === "number" && (Number.isNaN(v) || tgt.value === "")) return;
  // Slider: uppdatera direkt men spara ångra-steg först när användaren släpper
  clearTimeout(paramTimer);
  const params = { ...state.design.params, [key]: v };
  const apply = () => regenerate(t, params, state.design.prompt);
  if (tgt.type === "range") {
    apply();
    renderAll({ keepBuild: true });
    paramTimer = window.setTimeout(() => {
      undoStack.push(snapshot());
      persist();
    }, 400);
  } else commit(apply, { keepBuild: true });
});
buildEl.addEventListener("change", (e) => {
  const tgt = e.target as HTMLInputElement | HTMLSelectElement;
  if (tgt.id === "ai-model") state.ai.model = tgt.value;
  if (tgt.id === "ai-remember") state.ai.remember = (tgt as HTMLInputElement).checked;
  persist();
});

// ---------------------------------------------------------------- render: Material

let editingMat: string | null = null;

function matMeta(m: Material) {
  if (m.kind === "linear") return `${m.a}×${m.b} mm · ${m.stockLength / 1000} m${m.price != null ? ` · ${m.price} kr/st` : ""}`;
  if (m.kind === "sheet") return `${m.a} mm · skiva ${m.stockLength}×${m.stockWidth}${m.price != null ? ` · ${m.price} kr` : ""}`;
  return `nät · rulle ${m.stockWidth / 1000}×${m.stockLength / 1000} m${m.price != null ? ` · ${m.price} kr` : ""}`;
}

function matForm(m: Material) {
  const lin = m.kind === "linear";
  return `<div class="edit-box" data-form="${m.id}">
    <label class="field"><span>Namn</span><input type="text" name="name" value="${esc(m.name)}"/></label>
    <div class="grid2">
      <label>Typ<select name="kind"><option value="linear" ${lin ? "selected" : ""}>Virke (regel, bräda, läkt)</option><option value="sheet" ${m.kind === "sheet" ? "selected" : ""}>Skiva</option><option value="mesh" ${m.kind === "mesh" ? "selected" : ""}>Nät</option></select></label>
      <label>Färg<input type="color" name="color" value="${m.color}" style="height:34px;padding:2px"/></label>
    </div>
    <div class="grid3" style="margin-top:6px">
      <label>${lin ? "Tjocklek" : "Tjocklek"} (mm)<input type="number" name="a" value="${m.a}"/></label>
      <label>${lin ? "Bredd (mm)" : "Bredd (mm)"}<input type="number" name="${lin ? "b" : "stockWidth"}" value="${lin ? m.b : m.stockWidth}"/></label>
      <label>Längd (mm)<input type="number" name="stockLength" value="${m.stockLength}"/></label>
    </div>
    <div class="grid2" style="margin-top:6px"><label>Pris (kr/st)<input type="number" name="price" value="${m.price ?? ""}"/></label></div>
    <div class="actions"><button class="btn primary small" data-save="${m.id}">Spara</button><button class="btn small" data-cancel>Avbryt</button><button class="btn small danger" data-del="${m.id}" style="margin-left:auto">Ta bort</button></div>
  </div>`;
}

function renderMaterials() {
  const el = body("materials");
  const used = new Set(state.design.parts.map((p) => p.materialId));
  const groups: [Material["kind"], string][] = [["linear", "Virke"], ["sheet", "Skivor"], ["mesh", "Nät"]];
  el.innerHTML = `
    <p class="small muted" style="margin-top:0">Bocka i det du har tillgång till. Mallarna anpassar sig automatiskt – finns bara reglar 45×45 byggs allt av dem.</p>
    ${groups.map(([k, label]) => {
      const list = state.ws.materials.filter((m) => m.kind === k);
      if (!list.length) return "";
      return `<h3>${label}</h3><div class="list">${list.map((m) => `
        <div class="item ${m.available ? "" : "off"}">
          <input type="checkbox" data-avail="${m.id}" ${m.available ? "checked" : ""} aria-label="Tillgänglig"/>
          <span class="swatch" style="background:${m.color}"></span>
          <div class="grow"><div class="name">${esc(m.name)} ${used.has(m.id) ? `<span class="tag">används</span>` : ""}</div><div class="meta">${esc(matMeta(m))}</div></div>
          <button class="btn ghost small" data-edit="${m.id}" title="Ändra">✎</button>
        </div>${editingMat === m.id ? matForm(m) : ""}`).join("")}</div>`;
    }).join("")}
    ${editingMat === "__new" ? matForm(newMaterialDraft) : ""}
    <div class="actions">
      <button class="btn" id="mat-add">+ Lägg till material</button>
      <button class="btn ghost small" id="mat-reset">Återställ standard</button>
    </div>
    <h3>Snabbval</h3>
    <div class="actions" style="margin-top:0">
      <button class="btn small" data-preset="only4545">Bara reglar 45×45</button>
      <button class="btn small" data-preset="all">Allt tillgängligt</button>
    </div>`;
}

let newMaterialDraft: Material = {
  id: "__new", name: "Nytt virke", kind: "linear", a: 45, b: 45, stockLength: 3000, stockWidth: 0, price: undefined, color: "#d8b27a", available: true,
};

const matEl = body("materials");
matEl.addEventListener("change", (e) => {
  const tgt = e.target as HTMLInputElement;
  if (tgt.dataset.avail) {
    commit(() => {
      const m = matOf(tgt.dataset.avail!);
      if (m) m.available = tgt.checked;
      adaptToWorkshop();
    });
  }
});
matEl.addEventListener("click", (e) => {
  const tgt = e.target as HTMLElement;
  const b = tgt.closest<HTMLElement>("button");
  if (!b) return;
  if (b.dataset.edit) {
    editingMat = editingMat === b.dataset.edit ? null : b.dataset.edit;
    renderMaterials();
  } else if (b.id === "mat-add") {
    newMaterialDraft = { ...newMaterialDraft, id: "__new" };
    editingMat = "__new";
    renderMaterials();
  } else if (b.hasAttribute("data-cancel")) {
    editingMat = null;
    renderMaterials();
  } else if (b.dataset.del) {
    const id = b.dataset.del;
    if (id === "__new") return void ((editingMat = null), renderMaterials());
    if (state.design.parts.some((p) => p.materialId === id) && b.dataset.confirm !== "1") {
      b.dataset.confirm = "1";
      b.textContent = "Används – klicka igen för att ta bort";
      return;
    }
    editingMat = null;
    commit(() => {
      state.ws.materials = state.ws.materials.filter((m) => m.id !== id);
      adaptToWorkshop();
    });
  } else if (b.dataset.save) {
    const form = matEl.querySelector<HTMLElement>(`[data-form="${b.dataset.save}"]`)!;
    const val = (n: string) => (form.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? "";
    const kind = val("kind") as Material["kind"];
    const a = Math.max(0.5, Number(val("a")) || 1);
    const second = Number(val(kind === "linear" && form.querySelector('[name="b"]') ? "b" : "stockWidth")) || a;
    const upd: Material = {
      id: b.dataset.save === "__new" ? `m-${newId()}` : b.dataset.save,
      name: val("name") || "Material",
      kind,
      a: kind === "linear" ? Math.min(a, second) : a,
      b: kind === "linear" ? Math.max(a, second) : a,
      stockLength: Math.max(1, Number(val("stockLength")) || 3000),
      stockWidth: kind === "linear" ? 0 : second,
      price: val("price") === "" ? undefined : Number(val("price")),
      color: val("color") || "#d8b27a",
      available: b.dataset.save === "__new" ? true : matOf(b.dataset.save)?.available ?? true,
    };
    editingMat = null;
    commit(() => {
      const i = state.ws.materials.findIndex((m) => m.id === upd.id);
      if (i >= 0) state.ws.materials[i] = upd;
      else state.ws.materials.push(upd);
      adaptToWorkshop();
    });
  } else if (b.id === "mat-reset") {
    commit(() => {
      state.ws.materials = defaultMaterials();
      adaptToWorkshop();
    });
  } else if (b.dataset.preset) {
    const p = b.dataset.preset;
    commit(() => {
      state.ws.materials.forEach((m) => (m.available = p === "all" ? true : m.id === "regel-45x45" || m.kind === "mesh"));
      adaptToWorkshop();
    });
  }
});

// ---------------------------------------------------------------- render: Verktyg

function renderTools() {
  const el = body("tools");
  el.innerHTML = `
    <p class="small muted" style="margin-top:0">Konstruktionen och byggtipsen anpassas efter dina verktyg – t.ex. hörnplåtar istället för 45°-snedstöd om du saknar kap- & gersåg, och ingen klyvning utan bordssåg.</p>
    <div class="list">${state.ws.tools.map((t) => `
      <label class="item ${t.available ? "" : "off"}">
        <input type="checkbox" data-tool="${t.id}" ${t.available ? "checked" : ""}/>
        <div class="grow">${esc(t.name)}</div>
        ${t.custom ? `<button class="btn ghost small" data-tool-del="${t.id}" title="Ta bort">✕</button>` : ""}
      </label>`).join("")}</div>
    <div class="row" style="margin-top:10px"><input type="text" id="tool-new" placeholder="Annat verktyg, t.ex. överfräs"/><button class="btn" id="tool-add">Lägg till</button></div>
    <h3>Inställningar</h3>
    <label class="field"><span>Sågbladets bredd (sågspår), mm – används i kapoptimeringen</span><input type="number" id="kerf" value="${state.ws.kerf}" min="0" max="10" step="0.5"/></label>
    <button class="btn ghost small" id="tools-reset">Återställ standardverktyg</button>`;
}

const toolEl = body("tools");
toolEl.addEventListener("change", (e) => {
  const tgt = e.target as HTMLInputElement;
  if (tgt.dataset.tool)
    commit(() => {
      const t = state.ws.tools.find((x) => x.id === tgt.dataset.tool);
      if (t) t.available = tgt.checked;
      adaptToWorkshop();
    });
  if (tgt.id === "kerf") commit(() => (state.ws.kerf = Math.max(0, Number(tgt.value) || 0)));
});
toolEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!b) return;
  if (b.id === "tool-add") {
    const name = ($("#tool-new") as HTMLInputElement).value.trim();
    if (!name) return;
    commit(() => state.ws.tools.push({ id: `t-${newId()}`, name, available: true, custom: true }));
  } else if (b.dataset.toolDel) {
    e.preventDefault();
    commit(() => (state.ws.tools = state.ws.tools.filter((t) => t.id !== b.dataset.toolDel)));
  } else if (b.id === "tools-reset") {
    commit(() => {
      state.ws.tools = defaultTools();
      adaptToWorkshop();
    });
  }
});
toolEl.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).id === "tool-new" && e.key === "Enter") $("#tool-add").click();
});

// ---------------------------------------------------------------- render: Översikt

let warnings: Warning[] = [];

function renderOverview() {
  const d = state.design;
  const el = body("overview");
  const buy = purchases(d, state.ws);
  const cost = buy.reduce((s, p) => s + (p.cost ?? 0), 0);
  const lin = buy.filter((p) => p.material.kind === "linear").reduce((s, p) => s + (p.totalLength ?? 0), 0);
  const sheets = buy.filter((p) => p.material.kind === "sheet").reduce((s, p) => s + p.qty, 0);
  const b = bounds(d.parts);
  const size = d.parts.length ? `${fmt(b.max.x - b.min.x)} × ${fmt(b.max.z - b.min.z)} × ${fmt(b.max.y - b.min.y)} mm` : "–";
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="v">${d.parts.length}</div><div class="k">delar</div></div>
      ${lin || !sheets ? `<div class="stat"><div class="v">${(lin / 1000).toFixed(1)} m</div><div class="k">virke</div></div>` : `<div class="stat"><div class="v">${sheets}</div><div class="k">skivor</div></div>`}
      <div class="stat"><div class="v">${cost ? kr(cost) : "–"}</div><div class="k">ca materialkostnad</div></div>
    </div>
    <div class="small muted">Yttermått (B × D × H): <span class="num">${size}</span></div>
    ${warnings.length ? `<h3>Kontroll av material & verktyg</h3>${warnings.map((w, i) => `
      <div class="warn-item ${w.level}" data-warn="${i}"><span>${w.level === "error" ? "⛔" : w.level === "warn" ? "⚠️" : "ℹ️"}</span><span>${esc(w.text)}</span>${w.partIds.length ? `<span class="cnt">${w.partIds.length} del${w.partIds.length > 1 ? "ar" : ""}</span>` : ""}</div>`).join("")}` : d.parts.length ? `<h3>Kontroll</h3><div class="warn-item info">✅ Allt kan byggas med dina material och verktyg.</div>` : ""}
    ${strength && strength.members.length ? (() => {
      const over = strength.members.filter((m) => m.util > 1).length;
      const u = strength.worst!.util;
      return `<h3>Hållfasthet</h3><div class="warn-item ${over ? "error" : u > 0.8 ? "warn" : "info"}" data-goto="strength"><span>${over ? "⛔" : u > 0.8 ? "⚠️" : "✅"}</span><span>${over ? `För svagt på ${over} ställe${over > 1 ? "n" : ""}` : u > 0.8 ? "Håller, men nära gränsen" : "Håller"} vid ${strength.loadKgM2} kg/m² – högsta utnyttjande ${Math.round(u * 100)} %.</span><span class="cnt">Visa →</span></div>`;
    })() : ""}
    ${d.notes.length ? `<h3>Att tänka på</h3><ul class="notes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${d.hardware.length ? `<h3>Skruv & beslag (ca)</h3><table class="tbl">${d.hardware.map((h) => `<tr><td>${esc(h.name)}</td><td class="r">${fmt(h.qty)} ${esc(h.unit)}</td></tr>`).join("")}</table>` : ""}`;
}

body("overview").addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("[data-goto]")) return switchTab("right", "strength");
  const w = (e.target as HTMLElement).closest<HTMLElement>("[data-warn]");
  if (!w) return;
  const ids = warnings[+w.dataset.warn!]?.partIds ?? [];
  if (ids.length) {
    selection = [];
    viewer.select([], false);
    viewer.setHighlight(ids);
    toast(`Markerat ${ids.length} del${ids.length > 1 ? "ar" : ""} i 3D-vyn.`);
  }
});

// ---------------------------------------------------------------- render: Delar

function renderParts() {
  const d = state.design;
  const el = body("parts");
  const sel = new Set(selection);
  const p = selection.length === 1 ? d.parts.find((x) => x.id === selection[0]) : undefined;
  const matOptions = (cur: string) =>
    state.ws.materials.map((m) => `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${esc(m.name)}${m.available ? "" : " (ej tillg.)"}</option>`).join("");
  const num = (name: string, v: number, label: string) => `<label>${label}<input type="number" name="${name}" value="${Math.round(v * 10) / 10}" step="1"/></label>`;
  const moveBtn = `<button class="btn small ${moveMode ? "primary" : ""}" data-pact="move">✥ Flytta i 3D</button>`;

  let editor: string;
  if (p) {
    editor = `
    <div class="card" data-part="${p.id}">
      <label class="field"><span>Namn</span><input type="text" name="name" value="${esc(p.name)}"/></label>
      <div class="grid2"><label>Material<select name="materialId">${matOptions(p.materialId)}</select></label><label>Grupp<input type="text" name="group" value="${esc(p.group)}"/></label></div>
      <div class="small muted" style="margin-top:8px">Ytbehandling: ${esc(describeFinish(effectiveFinish(d, p)))} <button class="btn ghost small" data-pact="finish">Ändra</button></div>
      <div class="actions" style="margin-top:8px">
        ${p.unit ? `<button class="btn small" data-pact="selunit">Markera hela ${esc(p.unit)}</button>` : ""}
        <button class="btn small" data-pact="selgroup">Markera alla "${esc(p.group)}"</button>
      </div>
      <h3>Storlek (mm)</h3><div class="grid3">${num("dims.x", p.dims.x, "X (bredd)")}${num("dims.y", p.dims.y, "Y (höjd)")}${num("dims.z", p.dims.z, "Z (djup)")}</div>
      <h3>Position – mittpunkt (mm)</h3><div class="grid3">${num("pos.x", p.pos.x, "X")}${num("pos.y", p.pos.y, "Y")}${num("pos.z", p.pos.z, "Z")}</div>
      <h3>Rotation (°) & vinkelkap</h3><div class="grid3">${num("rot.x", p.rot.x, "Rot X")}${num("rot.y", p.rot.y, "Rot Y")}${num("rot.z", p.rot.z, "Rot Z")}</div>
      <div class="grid2" style="margin-top:6px">${num("endCuts.0", p.endCuts[0], "Kapvinkel ände 1")}${num("endCuts.1", p.endCuts[1], "Kapvinkel ände 2")}</div>
      <div class="actions">
        <button class="btn small" data-pact="dup">Duplicera</button>
        <button class="btn small" data-pact="rotate">Vrid 90°</button>
        ${moveBtn}
        <button class="btn small danger" data-pact="del" style="margin-left:auto">Ta bort</button>
      </div>
    </div>`;
  } else if (selection.length > 1) {
    const parts = d.parts.filter((x) => sel.has(x.id));
    const units = [...new Set(parts.map((x) => x.unit ?? "–"))];
    const label = units.length === 1 && units[0] !== "–" ? esc(units[0]) : `${parts.length} delar`;
    const b = bounds(parts);
    editor = `
    <div class="card">
      <div class="row" style="justify-content:space-between"><strong>${label}</strong><span class="small muted">${parts.length} delar markerade</span></div>
      <div class="small muted" style="margin-top:4px">${fmt(b.max.x - b.min.x)} × ${fmt(b.max.z - b.min.z)} × ${fmt(b.max.y - b.min.y)} mm (B × D × H)</div>
      <h3>Flytta alla (mm)</h3>
      <div class="grid3"><label>ΔX<input type="number" id="dx" value="0" step="10"/></label><label>ΔY<input type="number" id="dy" value="0" step="10"/></label><label>ΔZ<input type="number" id="dz" value="0" step="10"/></label></div>
      <div class="actions">
        <button class="btn small" data-pact="nudge">Flytta</button>
        ${moveBtn}
        <button class="btn small" data-pact="dup">Duplicera</button>
        <button class="btn small" data-pact="finish">Ytbehandling …</button>
        <button class="btn small ghost" data-pact="clear">Avmarkera</button>
        <button class="btn small danger" data-pact="del" style="margin-left:auto">Ta bort alla</button>
      </div>
    </div>`;
  } else editor = `<p class="small muted" style="margin-top:0">Klicka på en del i 3D-vyn eller i listan för att ändra den. <strong>Dubbelklicka</strong> för att markera hela enheten (t.ex. ett fack) och Shift-klicka för att lägga till eller ta bort delar.</p>`;

  // Snabbval av enheter (fack, gavlar, lådor …)
  const units: string[] = [];
  for (const x of d.parts) if (x.unit && !units.includes(x.unit)) units.push(x.unit);
  const unitChips = units.length
    ? `<h3>Markera enhet</h3><div class="actions" style="margin-top:0">${units.map((u) => {
        const ids = d.parts.filter((x) => x.unit === u).map((x) => x.id);
        const on = ids.length === selection.length && ids.every((id) => sel.has(id));
        return `<button class="chip ${on ? "on" : ""}" data-unit="${esc(u)}">${esc(u)}</button>`;
      }).join("")}</div>`
    : "";

  const groups = new Map<string, Part[]>();
  for (const x of d.parts) groups.set(x.group, [...(groups.get(x.group) ?? []), x]);
  el.innerHTML = `${editor}
    ${unitChips}
    <p class="small muted" style="margin:10px 0 0">Piltangenter flyttar markeringen 10 mm (Shift = 100 mm), PgUp/PgDn i höjd, Delete tar bort.</p>
    <div class="actions" style="margin:8px 0 4px"><button class="btn small" id="part-add">+ Ny del</button></div>
    ${[...groups].map(([g, list]) => `<h3>${esc(g)} (${list.length})</h3><table class="tbl">${list.map((x) => {
      const m = matOf(x.materialId);
      const s = m ? partShape(x, m) : null;
      return `<tr class="click ${sel.has(x.id) ? "sel" : ""}" data-sel="${x.id}"><td>${esc(x.name)}<div class="small muted">${esc(m?.name ?? "?")}${x.unit ? ` · ${esc(x.unit)}` : ""}</div></td><td class="r small">${s ? (m!.kind === "linear" ? `${fmt(s.length)} mm` : `${fmt(s.length)}×${fmt(s.section[1])}`) : ""}</td></tr>`;
    }).join("")}</table>`).join("")}`;
}

const partsEl = body("parts");
partsEl.addEventListener("click", (e) => {
  const tgt = e.target as HTMLElement;
  const row = tgt.closest<HTMLElement>("[data-sel]");
  if (row) return select(row.dataset.sel!, e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "replace", false);
  const chip = tgt.closest<HTMLElement>("[data-unit]");
  if (chip) return setSelection(state.design.parts.filter((x) => x.unit === chip.dataset.unit).map((x) => x.id), false);
  const b = tgt.closest<HTMLElement>("button");
  if (!b) return;
  if (b.id === "part-add") return addPart();
  const act = b.dataset.pact;
  if (act === "move") {
    moveMode = !moveMode;
    $("#v-move").classList.toggle("on", moveMode);
    viewer.select(selection, moveMode);
    return renderParts();
  }
  if (act === "del") return deleteSelected();
  if (act === "finish") {
    finScope = "sel";
    switchTab("right", "finish");
    return renderFinish();
  }
  if (act === "dup") return duplicateSelected();
  if (act === "clear") return select(null, "replace", false);
  if (act === "nudge") {
    const v = (id: string) => Number(($(`#${id}`) as HTMLInputElement).value) || 0;
    const delta = { x: v("dx"), y: v("dy"), z: v("dz") };
    if (delta.x || delta.y || delta.z) moveParts(selection, delta);
    return;
  }
  const p = selection.length === 1 ? state.design.parts.find((x) => x.id === selection[0]) : undefined;
  if (!p) return;
  if (act === "selunit" && p.unit) setSelection(unitMates(p.id), false);
  else if (act === "selgroup") setSelection(state.design.parts.filter((x) => x.group === p.group).map((x) => x.id), false);
  else if (act === "rotate") {
    commit(() => {
      // vrid 90° runt Y genom att byta X och Z
      [p.dims.x, p.dims.z] = [p.dims.z, p.dims.x];
      state.design.edited = true;
    });
  }
});
partsEl.addEventListener("change", (e) => {
  const tgt = e.target as HTMLInputElement;
  const card = tgt.closest<HTMLElement>("[data-part]");
  if (!card) return;
  const p = state.design.parts.find((x) => x.id === card.dataset.part);
  if (!p) return;
  commit(() => {
    const [a, k] = tgt.name.split(".");
    if (k != null) {
      const v = Number(tgt.value);
      if (Number.isNaN(v)) return;
      if (a === "endCuts") p.endCuts[+k as 0 | 1] = v;
      else (p[a as "dims" | "pos" | "rot"] as unknown as Record<string, number>)[k] = a === "dims" ? Math.max(0.5, Math.abs(v)) : v;
    } else if (tgt.name === "materialId") {
      const m = matOf(tgt.value);
      p.materialId = tgt.value;
      // anpassa tvärsnittet till det nya virket
      if (m?.kind === "linear") {
        const ax = (["x", "y", "z"] as const).slice().sort((u, w) => p.dims[u] - p.dims[w]);
        p.dims[ax[0]] = m.a;
        p.dims[ax[1]] = m.b;
      } else if (m) {
        const ax = (["x", "y", "z"] as const).slice().sort((u, w) => p.dims[u] - p.dims[w]);
        p.dims[ax[0]] = m.a;
      }
    } else (p as unknown as Record<string, string>)[tgt.name] = tgt.value;
    state.design.edited = true;
  });
});

function addPart() {
  const m = state.ws.materials.find((x) => x.available && x.kind === "linear") ?? state.ws.materials[0];
  if (!m) return toast("Lägg till ett material först.");
  const b = bounds(state.design.parts);
  const cx = state.design.parts.length ? (b.min.x + b.max.x) / 2 : 0;
  const cz = state.design.parts.length ? b.max.z + 300 : 0;
  const dims = m.kind === "linear" ? { x: 1000, y: m.b, z: m.a } : m.kind === "sheet" ? { x: 600, y: m.a, z: 400 } : { x: 1000, y: 1000, z: 1 };
  const p: Part = { id: newId(), name: "Ny del", materialId: m.id, dims, pos: { x: cx, y: dims.y / 2, z: cz }, rot: { x: 0, y: 0, z: 0 }, endCuts: [0, 0], group: "egna delar" };
  commit(() => {
    state.design.parts.push(p);
    state.design.edited = true;
  });
  moveMode = true;
  $("#v-move").classList.add("on");
  select(p.id);
}

function deleteSelected() {
  if (!selection.length) return;
  const ids = new Set(selection);
  selection = [];
  commit(() => {
    state.design.parts = state.design.parts.filter((x) => !ids.has(x.id));
    state.design.edited = true;
  });
}

/** Duplicera markeringen och lägg kopian bredvid (enheter får eget namn så de hänger ihop). */
function duplicateSelected() {
  const src = state.design.parts.filter((x) => selection.includes(x.id));
  if (!src.length) return;
  const b = bounds(src);
  const dx = Math.round(b.max.x - b.min.x + 100);
  const units = new Map<string, string>();
  const copies = src.map((p) => {
    const c: Part = JSON.parse(JSON.stringify(p));
    c.id = newId();
    c.name = src.length > 1 ? p.name : `${p.name} (kopia)`;
    c.pos.x += dx;
    if (p.unit) {
      if (!units.has(p.unit)) units.set(p.unit, uniqueUnit(`${p.unit} kopia`));
      c.unit = units.get(p.unit);
    }
    return c;
  });
  commit(() => {
    state.design.parts.push(...copies);
    state.design.edited = true;
  });
  setSelection(copies.map((c) => c.id));
}

function uniqueUnit(base: string) {
  const used = new Set(state.design.parts.map((p) => p.unit));
  let name = base, i = 2;
  while (used.has(name)) name = `${base} ${i++}`;
  return name;
}

// ---------------------------------------------------------------- render: Kapning

function barSvg(pieces: { length: number; name: string }[], stock: number, kerf: number, color: string) {
  const W = 340, H = 22;
  let x = 0;
  const rects = pieces.map((p) => {
    const w = (p.length / stock) * W;
    const r = `<g><title>${esc(p.name)} – ${fmt(p.length)} mm</title><rect x="${x}" y="0" width="${Math.max(1, w - 0.6)}" height="${H}" rx="2" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="0.6"/>${w > 34 ? `<text x="${x + w / 2}" y="${H / 2 + 4}" text-anchor="middle" font-size="10" fill="#3a2a14">${fmt(p.length)}</text>` : ""}</g>`;
    x += w + (kerf / stock) * W;
    return r;
  }).join("");
  return `<svg class="bar-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kapschema"><rect width="${W}" height="${H}" rx="3" fill="none" stroke="var(--line)" stroke-dasharray="3 2"/>${rects}</svg>`;
}

function renderCuts() {
  const rows = cutList(state.design, state.ws);
  const el = body("cuts");
  if (!rows.length) return void (el.innerHTML = `<p class="muted">Inga delar ännu.</p>`);
  const byMat = new Map<string, typeof rows>();
  for (const r of rows) byMat.set(r.materialName, [...(byMat.get(r.materialName) ?? []), r]);
  el.innerHTML = [...byMat].map(([name, list]) => `
    <h3>${esc(name)}</h3>
    <table class="tbl">
      <tr><th class="r">St</th><th class="r">${list[0].kind === "linear" ? "Längd" : "Mått"}</th><th>Bearbetning</th><th>Delar</th></tr>
      ${list.map((r, i) => `<tr class="click" data-cut="${esc(name)}|${i}">
        <td class="r"><strong>${r.qty}</strong></td>
        <td class="r num">${r.kind === "linear" ? fmt(r.length) : `${fmt(r.length)}×${fmt(r.width)}`}</td>
        <td>${r.rip ? `<span class="tag rip">klyv ${r.section.join("×")}</span>` : ""}${r.endCuts.some((a) => a) ? `<span class="tag ang">${r.endCuts.filter((a) => a).map((a) => `${a}°`).join(" / ")}</span>` : ""}${r.edge ? `<span class="tag fin">${esc(r.edge)} mm</span>` : ""}${!r.rip && !r.endCuts.some((a) => a) && !r.edge ? `<span class="tag">rakt</span>` : ""}</td>
        <td class="small">${esc(r.names.slice(0, 3).join(", "))}${r.names.length > 3 ? ` +${r.names.length - 3}` : ""}</td></tr>`).join("")}
    </table>`).join("") + `<p class="small muted">Klicka på en rad för att se delarna i 3D. Mått i mm.</p>`;
  (el as HTMLElement & { _rows?: typeof byMat })._rows = byMat;
}
body("cuts").addEventListener("click", (e) => {
  const r = (e.target as HTMLElement).closest<HTMLElement>("[data-cut]");
  if (!r) return;
  const [name, i] = r.dataset.cut!.split("|");
  const rows = (body("cuts") as HTMLElement & { _rows?: Map<string, ReturnType<typeof cutList>> })._rows;
  const row = rows?.get(name)?.[+i];
  if (row) {
    selection = [];
    viewer.select([], false);
    viewer.setHighlight(row.partIds);
  }
});

// ---------------------------------------------------------------- render: Inköp

function renderBuy() {
  const el = body("buy");
  const buy = purchases(state.design, state.ws);
  if (!buy.length) return void (el.innerHTML = `<p class="muted">Inga delar ännu.</p>`);
  const total = buy.reduce((s, p) => s + (p.cost ?? 0), 0);
  el.innerHTML = `
    <table class="tbl">
      <tr><th>Material</th><th class="r">Antal</th><th class="r">Kostnad</th></tr>
      ${buy.map((p) => `<tr><td>${esc(p.material.name)}${p.material.available ? ` <span class="tag">har</span>` : ""}<div class="small muted">${esc(p.unitLabel)}</div></td><td class="r"><strong>${p.qty}</strong></td><td class="r">${p.cost != null ? kr(p.cost) : "–"}</td></tr>`).join("")}
      ${state.design.hardware.map((h) => `<tr><td>${esc(h.name)}</td><td class="r">${fmt(h.qty)} ${esc(h.unit)}</td><td></td></tr>`).join("")}
      ${finSummary?.items.length ? `<tr><td colspan="3" class="small muted" style="padding-top:12px"><strong>Ytbehandling</strong></td></tr>${finSummary.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="r">${it.qty} ${esc(it.unit)}</td><td class="r">${it.cost ? kr(it.cost) : ""}</td></tr>`).join("")}` : ""}
      <tr><td><strong>Summa</strong> <span class="small muted">(ungefärliga priser)</span></td><td></td><td class="r"><strong>${kr(total + (finSummary?.items.reduce((a, b) => a + b.cost, 0) ?? 0))}</strong></td></tr>
    </table>
    <div class="actions"><button class="btn small" id="copy-buy">Kopiera inköpslista</button></div>
    ${buy.map((p) => {
      if (p.bars?.length) {
        const waste = p.bars.reduce((s, b) => s + b.waste, 0);
        return `<h3>Kapschema – ${esc(p.material.name)}</h3><div class="small muted">${p.bars.length} × ${fmt(p.material.stockLength)} mm · spill ${fmt(waste)} mm</div><div class="bars">${p.bars.map((b) => barSvg(b.pieces, p.material.stockLength, state.ws.kerf, p.material.color)).join("")}</div>`;
      }
      if (p.sheets?.length) {
        const L = p.material.stockLength, Wd = p.material.stockWidth;
        return `<h3>Skivschema – ${esc(p.material.name)}</h3>${p.sheets.map((s, i) => `<div class="small muted">Skiva ${i + 1}</div>
          <svg class="sheet-svg" viewBox="0 0 ${L} ${Wd}" role="img" aria-label="Skivschema"><rect width="${L}" height="${Wd}" fill="var(--panel-2)" stroke="var(--line)" stroke-width="8"/>
          ${s.placed.map((r) => `<g><title>${esc(r.name)} – ${fmt(r.w)}×${fmt(r.h)}</title><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${p.material.color}" stroke="#6b4a1f" stroke-width="5"/>${r.w > 260 && r.h > 90 ? `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 22}" text-anchor="middle" font-size="64" fill="#3a2a14">${fmt(r.w)}×${fmt(r.h)}</text>` : ""}</g>`).join("")}</svg>`).join("")}`;
      }
      return "";
    }).join("")}`;
}
body("buy").addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest("#copy-buy")) return;
  const buy = purchases(state.design, state.ws);
  const lines = [
    `Inköpslista – ${state.design.title}`,
    ...buy.map((p) => `${p.qty} × ${p.material.name} (${p.unitLabel})`),
    ...state.design.hardware.map((h) => `${h.qty} ${h.unit} ${h.name}`),
    ...(finSummary?.items ?? []).map((it) => `${it.qty} ${it.unit} ${it.name}`),
  ];
  navigator.clipboard?.writeText(lines.join("\n")).then(() => toast("Inköpslistan är kopierad."), () => toast("Kunde inte kopiera."));
});

// ---------------------------------------------------------------- render: Steg

function renderSteps() {
  const el = body("steps");
  const steps = state.design.steps;
  el.innerHTML = steps.length
    ? `<p class="small muted" style="margin-top:0">Klicka på ett steg för att se hur konstruktionen växer fram.</p>
      <ol class="steps-list">${steps.map((s, i) => `<li data-step="${i}" class="${i === stepIdx ? "active" : ""}"><div class="t">${esc(s.title)}</div><div class="small">${esc(s.text)}</div></li>`).join("")}${(finSummary?.steps ?? []).map((s) => `<li class="fin-step"><div class="t">${esc(s.title)} <span class="tag fin">ytbehandling</span></div><div class="small">${esc(s.text)}</div></li>`).join("")}</ol>
      <button class="btn small" data-step="-1">Visa allt</button>`
    : `<p class="muted">Inga byggsteg.</p>`;
}
body("steps").addEventListener("click", (e) => {
  const s = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
  if (!s) return;
  stepIdx = +s.dataset.step!;
  applySteps();
  renderSteps();
});

function renderStepbar() {
  const bar = $("#stepbar");
  const steps = state.design.steps;
  if (!steps.length || !state.design.parts.length) return void (bar.innerHTML = "");
  const label = stepIdx < 0 ? `Hela konstruktionen · ${steps.length} steg` : `Steg ${stepIdx + 1}/${steps.length}: ${steps[stepIdx].title}`;
  bar.innerHTML = `<button class="icon-btn" data-sb="-1" ${stepIdx < 0 ? "disabled" : ""} title="Föregående steg">◀</button>
    <span class="label">${esc(label)}</span>
    <button class="icon-btn" data-sb="1" ${stepIdx >= steps.length - 1 ? "disabled" : ""} title="Nästa steg">▶</button>
    ${stepIdx >= 0 ? `<button class="btn small" data-sb="all">Visa allt</button>` : ""}`;
}
$("#stepbar").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-sb]");
  if (!b) return;
  const v = b.dataset.sb!;
  stepIdx = v === "all" ? -1 : Math.max(-1, Math.min(state.design.steps.length - 1, stepIdx + +v));
  applySteps();
  renderSteps();
});

// ---------------------------------------------------------------- render: Hållfasthet

let strength: StrengthReport | null = null;
let heatOn = false;
/** Förslag per grupp (nyckel = första delens id), räknas om efter varje ändring */
let sugCache = new Map<string, Suggestion[]>();
const sugOpen = new Set<string>();
const pct = (u: number) => `${Math.round(u * 100)} %`;

/** Slå ihop likadana resultat (t.ex. 24 identiska hyllplan) till en rad. */
function groupMembers(list: MemberResult[]) {
  const groups = new Map<string, MemberResult[]>();
  for (const m of list) {
    const base = m.name.replace(/[\s–-]*(\d+[a-z]?(\.\d+)?|[VH])(\s|$)/g, " ").replace(/\s+/g, " ").trim();
    const key = [base, m.kind, m.materialName, m.span, m.deflection, Math.round(m.util * 100)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.values()];
}

function renderStrength() {
  const el = body("strength");
  const d = state.design;
  const r = strength;
  if (!r || !d.parts.length) return void (el.innerHTML = `<p class="muted">Inga delar ännu.</p>`);
  const suggested = defaultLoad(d.templateId);
  const over = r.members.filter((m) => m.util > 1);
  const near = r.members.filter((m) => m.util > 0.8 && m.util <= 1);
  const worst = r.worst;
  const status = over.length
    ? `<div class="status error"><strong>För svagt på ${over.length} ställe${over.length > 1 ? "n" : ""}</strong>Högsta utnyttjande ${pct(worst!.util)} (${esc(worst!.name)}). Se förslagen nedan.</div>`
    : near.length
      ? `<div class="status warn"><strong>Håller – men nära gränsen</strong>Högsta utnyttjande ${pct(worst!.util)} (${esc(worst!.name)}).</div>`
      : `<div class="status ok"><strong>Håller</strong>${worst ? `Högsta utnyttjande ${pct(worst.util)} (${esc(worst.name)}).` : "Inga bärande delar att räkna på."}</div>`;
  const groups = groupMembers(r.members).slice(0, 40);
  const color = (u: number) => (u >= 1 ? "#d8342c" : u >= 0.8 ? "#f0a020" : u >= 0.5 ? "#9cc43a" : "#2e9e5b");
  const rows = groups.map((g, gi) => {
    const m = g[0];
    const what = m.kind === "stolpe" ? "tryck" : m.uConn >= Math.max(m.uBend, m.uDefl) && m.uConn > 0 ? "infästning" : m.uDefl >= m.uBend ? "svikt" : "böjning";
    const sub = [
      m.kind === "stolpe" ? `stolpe ${fmt(m.span)} mm` : `spann ${fmt(m.span)} mm${m.cantilever ? ` (utkragning ${fmt(m.cantilever)})` : ""}`,
      m.kind !== "stolpe" ? `svikt ${m.deflection} mm (max ${m.limit})` : "",
      m.maxKg != null ? `tål ca ${fmt(m.maxKg)} kg (${fmt(m.maxKgM2!)} kg/m²)` : "",
    ].filter(Boolean).join(" · ");
    const key = m.id;
    const showSug = m.util > 1 || sugOpen.has(key);
    let sugHtml = "";
    if (showSug) {
      let list = sugCache.get(key);
      if (!list) {
        list = suggestFor(d, state.ws, r, g).slice(0, 4);
        sugCache.set(key, list);
      }
      sugHtml = list.length
        ? `<div class="sugs">${list.map((sg, si) => `
            <div class="sug ${sg.after <= 1 ? "ok" : ""}" data-sug="${esc(key)}|${si}">
              <div class="grow"><strong>${esc(sg.title)}</strong><div class="small muted">${esc(sg.detail)}</div>
                <div class="small num">${pct(sg.before)} → <b style="color:${color(sg.after)}">${pct(sg.after)}</b>${sg.worstAfter > sg.after + 0.01 ? ` · högsta i hela: ${pct(sg.worstAfter)}` : ""} · ${sg.costDelta >= 0 ? "+" : "−"}${kr(Math.abs(sg.costDelta))}${sg.partsDelta ? ` · ${sg.partsDelta > 0 ? "+" : ""}${sg.partsDelta} delar` : ""}</div></div>
              <button class="btn small ${si === 0 ? "primary" : ""}" data-accept="${esc(key)}|${si}">Acceptera</button>
            </div>`).join("")}</div>`
        : `<div class="small muted" style="margin-top:6px">Inga automatiska förslag – ${esc(m.advice ?? "ändra konstruktionen för hand.")}</div>`;
    }
    return `<tr class="click" data-sg="${gi}">
      <td>${esc(m.name)}${g.length > 1 ? ` <span class="tag">×${g.length}</span>` : ""}<div class="small muted">${esc(m.materialName)} · ${sub}</div>${m.advice && !showSug ? `<div class="advice">${esc(m.advice)}</div>` : ""}
        ${m.util > 0.8 && m.util <= 1 && !sugOpen.has(key) ? `<button class="btn ghost small" data-sugopen="${esc(key)}" style="padding-left:0">Visa förslag på förstärkning</button>` : ""}</td>
      <td style="width:110px"><div class="small r num" style="text-align:right">${pct(m.util)} <span class="muted">${what}</span></div><div class="ubar ${m.util > 1 ? "over" : ""}"><span style="width:${Math.min(100, m.util * 100)}%;background:${color(m.util)}"></span></div></td>
    </tr>${sugHtml ? `<tr class="sugrow"><td colspan="2">${sugHtml}</td></tr>` : ""}`;
  }).join("");
  el.innerHTML = `
    <h3 style="margin-top:0">Last på ytor</h3>
    <div class="load-row"><input type="number" id="load" value="${r.loadKgM2}" min="0" max="2000" step="10"/> <span>kg/m²</span>
      ${d.loadKgM2 != null && d.loadKgM2 !== suggested ? `<button class="btn ghost small" data-load="${suggested}">Återställ (${suggested})</button>` : `<span class="small muted">förslag för projektet</span>`}</div>
    <div class="actions" style="margin-top:8px">${LOAD_PRESETS.map((p) => `<button class="chip ${p.kg === r.loadKgM2 ? "on" : ""}" data-load="${p.kg}">${p.label} ${p.kg}</button>`).join("")}</div>
    <p class="small muted">Lasten läggs på allt man ställer saker på – hyllplan, sitsar, lock, trall – och förs ned genom konstruktionen.</p>
    ${status}
    ${over.length ? `<div class="actions" style="margin:-2px 0 8px"><button class="btn primary" id="auto-reinforce">Förstärk automatiskt</button><span class="small muted" style="align-self:center">väljer det billigaste förslaget som räcker för varje svag del</span></div>` : ""}
    <div class="warn-item ${r.tipping.level === "warn" ? "warn" : "info"}"><span>${r.tipping.level === "warn" ? "⚠️" : "↕"}</span><span>${esc(r.tipping.text)}</span></div>
    ${r.unsupported.length ? `<div class="warn-item warn"><span>⚠️</span><span>Delar utan stöd: ${esc(r.unsupported.slice(0, 5).join(", "))}${r.unsupported.length > 5 ? " …" : ""}</span></div>` : ""}
    <label class="switch" style="margin-top:10px"><input type="checkbox" id="heat" ${heatOn ? "checked" : ""}/> Visa utnyttjandegrad i 3D</label>
    <div class="legend"><span><i style="background:#2e9e5b"></i>&lt; 50 %</span><span><i style="background:#9cc43a"></i>50–80 %</span><span><i style="background:#f0a020"></i>80–100 %</span><span><i style="background:#d8342c"></i>&gt; 100 %</span></div>
    <h3>Delar (${r.members.length})</h3>
    ${rows ? `<table class="tbl">${rows}</table>` : `<p class="muted">Inga liggande delar att räkna på.</p>`}
    <p class="small muted">Förenklad kontroll med ungefärliga värden för C24/C18-virke, spånskiva, plywood och OSB: böjning, svikt (L/${d.templateId === "deck" || d.templateId === "woodShed" ? 300 : 200} efter krypning) och skruvinfästningar (2 skruvar per anslutning). Den ersätter inte en konstruktionsberäkning för bärande konstruktioner som altaner högt över mark.</p>`;
  (el as HTMLElement & { _groups?: MemberResult[][] })._groups = groups;
}

const strengthEl = body("strength");
strengthEl.addEventListener("click", (e) => {
  const tgt = e.target as HTMLElement;
  const lb = tgt.closest<HTMLElement>("[data-load]");
  if (lb) return setLoad(Number(lb.dataset.load));
  const acc = tgt.closest<HTMLElement>("[data-accept]");
  if (acc) {
    const [key, si] = acc.dataset.accept!.split("|");
    const sg = sugCache.get(key)?.[+si];
    if (sg) acceptSuggestion(sg);
    return;
  }
  const so = tgt.closest<HTMLElement>("[data-sugopen]");
  if (so) {
    sugOpen.add(so.dataset.sugopen!);
    return renderStrength();
  }
  if (tgt.closest("#auto-reinforce")) {
    const res = autoReinforce(state.design, state.ws, groupMembers);
    if (!res.applied.length) return toast("Hittade inga förslag som hjälper – ändra konstruktionen för hand.");
    commit(() => (state.design = res.design), { keepBuild: true });
    const left = strength?.members.filter((m) => m.util > 1).length ?? 0;
    toast(`Förstärkt: ${res.applied.join(", ")}.${left ? ` ${left} del(ar) är fortfarande för svaga.` : " Allt håller nu."}`, 7000);
    return;
  }
  if (tgt.closest(".sugrow")) return;
  const row = tgt.closest<HTMLElement>("[data-sg]");
  if (row) {
    const g = (strengthEl as HTMLElement & { _groups?: MemberResult[][] })._groups?.[+row.dataset.sg!];
    if (g) {
      selection = [];
      viewer.select([], false);
      viewer.setHighlight(g.map((m) => m.id));
    }
  }
});
strengthEl.addEventListener("change", (e) => {
  const tgt = e.target as HTMLInputElement;
  if (tgt.id === "load") setLoad(Number(tgt.value));
  if (tgt.id === "heat") {
    heatOn = tgt.checked;
    viewer.setHeatmap(heatOn && strength ? new Map(strength.members.map((m) => [m.id, m.util])) : null);
    applySteps();
  }
});

function acceptSuggestion(sg: Suggestion) {
  commit(() => (state.design = sg.design), { keepBuild: !sg.key.startsWith("maxspan") });
  viewer.setHighlight(sg.changedIds.slice(0, 200));
  toast(`${sg.title}: ${pct(sg.before)} → ${pct(sg.after)}. Kapnings- och inköpslistan är uppdaterade – ångra med Ctrl+Z.`, 6000);
}

// Hovra över ett förslag för att se vilka delar det gäller
strengthEl.addEventListener("mouseover", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-sug]");
  if (!el) return;
  const [key, si] = el.dataset.sug!.split("|");
  const sg = sugCache.get(key)?.[+si];
  if (sg) viewer.setHighlight(sg.memberIds);
});

function setLoad(kg: number) {
  if (!Number.isFinite(kg) || kg < 0) return;
  commit(() => (state.design.loadKgM2 = kg), { keepBuild: true });
}

// ---------------------------------------------------------------- render: Ytbehandling

/** Vad inställningarna gäller: "*" = allt, "g:<grupp>" = en grupp, "sel" = markerade delar */
let finScope = "*";
let finSummary: FinishSummary | null = null;
const NO_FINISH: Required<Finish> = { edge: "rak", edgeSize: 0, sand: 0, coating: "ingen", color: "#f4f2ec", edgeBand: false };

function scopeFinish(): Required<Finish> {
  const d = state.design;
  if (finScope === "sel") {
    const p = d.parts.find((x) => x.id === selection[0]);
    return p ? effectiveFinish(d, p) : NO_FINISH;
  }
  if (finScope === "*") return { ...NO_FINISH, ...(d.finishes?.["*"] ?? {}) };
  return { ...NO_FINISH, ...(d.finishes?.["*"] ?? {}), ...(d.finishes?.[finScope] ?? {}) };
}

function setFinish(patch: Finish | null) {
  commit(() => {
    const d = state.design;
    if (finScope === "sel") {
      for (const p of d.parts) if (selection.includes(p.id)) p.finish = patch ? { ...(p.finish ?? {}), ...patch } : undefined;
    } else {
      d.finishes = { ...(d.finishes ?? {}) };
      if (patch) d.finishes[finScope] = { ...(d.finishes[finScope] ?? {}), ...patch };
      else delete d.finishes[finScope];
    }
  }, { keepBuild: true });
}

function renderFinish() {
  const el = body("finish");
  const d = state.design;
  if (!d.parts.length) return void (el.innerHTML = `<p class="muted">Inga delar ännu.</p>`);
  if (finScope === "sel" && !selection.length) finScope = "*";
  if (finScope.startsWith("g:") && !d.parts.some((p) => `g:${p.group}` === finScope)) finScope = "*";
  const f = scopeFinish();
  const groups = [...new Set(d.parts.filter((p) => matOf(p.materialId)?.kind !== "mesh").map((p) => p.group))];
  const chip = (on: boolean, attr: string, label: string, title = "") => `<button class="chip ${on ? "on" : ""}" ${attr} ${title ? `title="${esc(title)}"` : ""}>${label}</button>`;
  const info = coatingInfo(f.coating);
  const sum = finSummary!;
  const total = sum.items.reduce((a, b) => a + b.cost, 0);
  const own = d.parts.filter((p) => p.finish).length;
  el.innerHTML = `
    <h3 style="margin-top:0">Gäller</h3>
    <div class="actions" style="margin-top:0">
      ${chip(finScope === "*", 'data-scope="*"', "Hela konstruktionen")}
      ${chip(finScope === "sel", `data-scope="sel" ${selection.length ? "" : "disabled"}`, `Markerade delar${selection.length ? ` (${selection.length})` : ""}`, "Markera delar i 3D-vyn (dubbelklick = hel enhet)")}
      <select id="fin-group" style="width:auto;flex:1;min-width:140px"><option value="">Grupp …</option>${groups.map((g) => `<option value="g:${esc(g)}" ${finScope === `g:${g}` ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>
    </div>
    <h3>Snabbval</h3>
    <div class="actions" style="margin-top:0">${PRESETS.map((p, i) => chip(false, `data-preset-fin="${i}"`, esc(p.name))).join("")}</div>

    <h3>Kanter</h3>
    <div class="actions" style="margin-top:0">${EDGES.map((e) => chip(f.edge === e.id, `data-edge="${e.id}"`, e.name, e.desc)).join("")}</div>
    ${f.edge !== "rak" ? `<div class="actions">${[2, 3, 4, 6, 10].map((n) => chip(f.edgeSize === n, `data-esize="${n}"`, `${n} mm`)).join("")}</div>
      <p class="small muted">${esc(EDGES.find((e) => e.id === f.edge)!.desc)}</p>` : ""}

    <h3>Slipning</h3>
    <div class="actions" style="margin-top:0">${SANDING.map((g) => chip(f.sand === g, `data-sand="${g}"`, g ? `Korn ${g}` : "Ingen")).join("")}</div>

    <h3>Behandling</h3>
    <div class="actions" style="margin-top:0">${COATINGS.map((c) => chip(f.coating === c.id, `data-coat="${c.id}"`, c.name, c.desc)).join("")}</div>
    <p class="small muted">${esc(info.desc)}${info.coats ? ` ${info.coats} lager.` : ""}</p>
    ${info.hasColor ? `<div class="swatches">${COLORS.map((c) => `<button class="swatch-btn ${f.color === c.hex ? "on" : ""}" data-color="${c.hex}" title="${c.name}" style="background:${c.hex}"></button>`).join("")}<input type="color" id="fin-color" value="${f.color}" title="Egen kulör"/></div>` : ""}
    <label class="switch" style="margin-top:10px"><input type="checkbox" id="fin-band" ${f.edgeBand ? "checked" : ""}/> Kantband på skivornas kanter</label>
    <div class="actions"><button class="btn ghost small" id="fin-reset">Ta bort behandling för ${finScope === "*" ? "hela konstruktionen" : finScope === "sel" ? "markerade delar" : `gruppen ${esc(finScope.slice(2))}`}</button></div>

    <h3>Åtgång & kostnad</h3>
    ${sum.items.length ? `<table class="tbl">${sum.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="r">${it.qty} ${esc(it.unit)}</td><td class="r">${it.cost ? kr(it.cost) : ""}</td></tr>`).join("")}
      <tr><td><strong>Summa</strong></td><td></td><td class="r"><strong>${kr(total)}</strong></td></tr></table>
      <p class="small muted">Behandlad yta ca ${sum.area} m² · arbetstid ca ${sum.hours} h${sum.dryHours ? ` + torktid ca ${sum.dryHours} h` : ""}.</p>` : `<p class="small muted">Ingen ytbehandling vald.</p>`}
    ${sum.warnings.map((w, i) => `<div class="warn-item ${w.level}" data-finwarn="${i}"><span>${w.level === "warn" ? "⚠️" : "ℹ️"}</span><span>${esc(w.text)}</span><span class="cnt">${w.partIds.length} del${w.partIds.length > 1 ? "ar" : ""}</span></div>`).join("")}

    <h3>I konstruktionen</h3>
    <ul class="notes small">
      <li>Hela: ${esc(describeFinish({ ...NO_FINISH, ...(d.finishes?.["*"] ?? {}) }))}</li>
      ${Object.entries(d.finishes ?? {}).filter(([k]) => k.startsWith("g:")).map(([k, v]) => `<li>Gruppen ${esc(k.slice(2))}: ${esc(describeFinish({ ...NO_FINISH, ...(d.finishes?.["*"] ?? {}), ...v }))}</li>`).join("")}
      ${own ? `<li>${own} del${own > 1 ? "ar" : ""} med egen behandling</li>` : ""}
    </ul>
    <label class="switch"><input type="checkbox" id="fin-show" ${viewer.showFinish ? "checked" : ""}/> Visa ytbehandling i 3D</label>`;
}

const finEl = body("finish");
finEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button, [data-finwarn]");
  if (!b) return;
  const ds = b.dataset;
  if (ds.scope) {
    finScope = ds.scope;
    return renderFinish();
  }
  if (ds.presetFin) return setFinish({ ...PRESETS[+ds.presetFin].finish });
  if (ds.edge) return setFinish({ edge: ds.edge as Finish["edge"], edgeSize: ds.edge === "rak" ? 0 : scopeFinish().edgeSize || 3 });
  if (ds.esize) return setFinish({ edgeSize: +ds.esize });
  if (ds.sand) return setFinish({ sand: +ds.sand });
  if (ds.coat) return setFinish({ coating: ds.coat as Finish["coating"] });
  if (ds.color) return setFinish({ color: ds.color });
  if (b.id === "fin-reset") return setFinish(null);
  if (ds.finwarn) {
    const ids = finSummary?.warnings[+ds.finwarn]?.partIds ?? [];
    viewer.setHighlight(ids);
  }
});
finEl.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === "fin-group" && t.value) {
    finScope = t.value;
    renderFinish();
  } else if (t.id === "fin-color") setFinish({ color: t.value });
  else if (t.id === "fin-band") setFinish({ edgeBand: t.checked });
  else if (t.id === "fin-show") {
    viewer.setShowFinish(t.checked);
    applySteps();
  }
});

// ---------------------------------------------------------------- render: allt

function setBadge() {
  const btn = $(`[data-tabs="right"] [data-tab="overview"]`);
  const errs = warnings.filter((w) => w.level === "error").length;
  const warns = warnings.filter((w) => w.level === "warn").length;
  btn.innerHTML = `Översikt${errs ? `<span class="badge">${errs}</span>` : warns ? `<span class="badge warn">${warns}</span>` : ""}`;
  const over = strength?.members.filter((m) => m.util > 1).length ?? 0;
  $(`[data-tabs="right"] [data-tab="strength"]`).innerHTML = `Hållfasthet${over ? `<span class="badge">${over}</span>` : ""}`;
}

function renderAll(opts: { fit?: boolean; keepBuild?: boolean } = {}) {
  const d = state.design;
  finSummary = finishSummary(d, state.ws);
  warnings = [...checkDesign(d, state.ws), ...finSummary.warnings];
  strength = analyzeStrength(d, state.ws);
  sugCache = new Map();
  viewer.setHeatmap(heatOn ? new Map(strength.members.map((m) => [m.id, m.util])) : null, false);
  const title = $("#title") as HTMLInputElement;
  if (document.activeElement !== title) title.value = d.title;
  viewer.setDesign(d, state.ws.materials, opts.fit);
  viewer.select(selection, moveMode);
  applySteps();
  if (!opts.keepBuild) renderBuild();
  renderMaterials();
  renderTools();
  renderOverview();
  renderParts();
  renderCuts();
  renderBuy();
  renderSteps();
  renderStrength();
  renderFinish();
  setBadge();
  $("#empty").hidden = d.parts.length > 0;
  ($("#undo") as HTMLButtonElement).disabled = !undoStack.length;
  ($("#redo") as HTMLButtonElement).disabled = !redoStack.length;
}

// ---------------------------------------------------------------- topbar & meny

$("#title").addEventListener("change", (e) => {
  const v = (e.target as HTMLInputElement).value.trim() || "Projekt";
  state.customTitle = true;
  commit(() => (state.design.title = v));
});
$("#undo").addEventListener("click", undo);
$("#redo").addEventListener("click", redo);

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = state.theme;
  const dark = state.theme === "dark" || (state.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  viewer.setTheme(dark);
  viewer.setDesign(state.design, state.ws.materials);
  viewer.select(selection, moveMode);
  applySteps();
}
$("#theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  state.theme = dark ? "light" : "dark";
  persist();
  applyTheme();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.theme === "auto" && applyTheme());

const menu = $("#menu");
$("#menu-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener("click", () => (menu.hidden = true));
menu.addEventListener("click", (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
  menu.hidden = true;
  if (act === "new") {
    state.customTitle = false;
    lastParsed = null;
    aiReply = "";
    commit(() => (state.design = emptyDesign()));
  } else if (act === "save") saveProject();
  else if (act === "open") openProjects();
  else if (act === "export") download(`${slug(state.design.title)}.json`, JSON.stringify({ app: "bygglabbet", version: 1, design: state.design, workshop: state.ws }, null, 2), "application/json");
  else if (act === "import") $("#file").click();
  else if (act === "screenshot") download(`${slug(state.design.title)}.png`, viewer.screenshot(), "image/png");
  else if (act === "print") printView();
});

$("#file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.design?.parts) throw new Error();
    commit(() => {
      state.design = data.design;
      if (data.workshop?.materials) state.ws = data.workshop;
    }, { fit: true });
    toast("Projektet är importerat.");
  } catch {
    toast("Filen kunde inte läsas som ett Bygglabbet-projekt.");
  }
  (e.target as HTMLInputElement).value = "";
});

interface SavedProject {
  id: string;
  savedAt: string;
  design: Design;
  ws: Workshop;
}

function saveProject() {
  const list = safeGet<SavedProject[]>(PROJECTS, []);
  const existing = list.find((p) => p.design.title === state.design.title);
  const entry: SavedProject = { id: existing?.id ?? newId(), savedAt: new Date().toISOString(), design: state.design, ws: state.ws };
  safeSet(PROJECTS, [entry, ...list.filter((p) => p.id !== entry.id)]);
  toast(`"${state.design.title}" är sparat i webbläsaren.`);
}

function openProjects() {
  const list = safeGet<SavedProject[]>(PROJECTS, []);
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);padding:16px;width:min(440px,92vw)";
  dlg.innerHTML = `<h3 style="margin-top:0">Sparade projekt</h3>
    ${list.length ? `<div class="list">${list.map((p) => `<div class="item"><div class="grow"><div class="name">${esc(p.design.title)}</div><div class="meta">${new Date(p.savedAt).toLocaleString("sv-SE")} · ${p.design.parts.length} delar</div></div><button class="btn small" data-open="${p.id}">Öppna</button><button class="btn ghost small" data-rm="${p.id}" title="Ta bort">✕</button></div>`).join("")}</div>` : `<p class="muted">Inga sparade projekt ännu.</p>`}
    <div class="actions"><button class="btn" data-close style="margin-left:auto">Stäng</button></div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    if (b.dataset.open) {
      const p = list.find((x) => x.id === b.dataset.open)!;
      state.customTitle = true;
      commit(() => {
        state.design = p.design;
        state.ws = p.ws;
      }, { fit: true });
      dlg.close();
    } else if (b.dataset.rm) {
      safeSet(PROJECTS, list.filter((x) => x.id !== b.dataset.rm));
      dlg.close();
      openProjects();
    } else if (b.hasAttribute("data-close")) dlg.close();
  });
  dlg.showModal();
}

function printView() {
  const img = viewer.screenshot();
  const d = state.design;
  const rows = cutList(d, state.ws);
  const buy = purchases(d, state.ws);
  const div = document.createElement("div");
  div.className = "print-only";
  div.innerHTML = `<h1>${esc(d.title)}</h1><img src="${img}" alt="3D-vy"/>
    <h2>Kapningslista</h2><table class="tbl"><tr><th>Material</th><th class="r">St</th><th class="r">Mått (mm)</th><th>Bearbetning</th><th>Delar</th></tr>
    ${rows.map((r) => `<tr><td>${esc(r.materialName)}</td><td class="r">${r.qty}</td><td class="r">${r.kind === "linear" ? fmt(r.length) : `${fmt(r.length)}×${fmt(r.width)}`}</td><td>${r.rip ? `klyv ${r.section.join("×")} ` : ""}${r.endCuts.some((a) => a) ? r.endCuts.join("/") + "° " : ""}${r.edge ? `kant ${esc(r.edge)} mm` : ""}</td><td>${esc(r.names.join(", "))}</td></tr>`).join("")}</table>
    <h2>Inköp</h2><ul>${buy.map((p) => `<li>${p.qty} × ${esc(p.material.name)} (${esc(p.unitLabel)})</li>`).join("")}${d.hardware.map((h) => `<li>${h.qty} ${esc(h.unit)} ${esc(h.name)}</li>`).join("")}</ul>
    ${finSummary?.items.length ? `<h2>Ytbehandling</h2><ul>${finSummary.items.map((it) => `<li>${it.qty} ${esc(it.unit)} ${esc(it.name)}</li>`).join("")}</ul>` : ""}
    <h2>Byggsteg</h2><ol>${[...d.steps, ...(finSummary?.steps ?? [])].map((s) => `<li><strong>${esc(s.title)}</strong> – ${esc(s.text)}</li>`).join("")}</ol>
    ${d.notes.length ? `<h2>Att tänka på</h2><ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
  document.body.appendChild(div);
  const done = () => div.remove();
  window.addEventListener("afterprint", done, { once: true });
  setTimeout(() => window.print(), 50);
}

// ---------------------------------------------------------------- vy-verktyg

$("#v-fit").addEventListener("click", () => viewer.fit());
$("#v-dims").addEventListener("click", (e) => {
  const on = !(e.currentTarget as HTMLElement).classList.contains("on");
  (e.currentTarget as HTMLElement).classList.toggle("on", on);
  viewer.setShowDims(on);
});
$("#v-xray").addEventListener("click", (e) => {
  const on = !(e.currentTarget as HTMLElement).classList.contains("on");
  (e.currentTarget as HTMLElement).classList.toggle("on", on);
  viewer.setXray(on);
  applySteps();
});
$("#v-move").addEventListener("click", (e) => {
  moveMode = !moveMode;
  (e.currentTarget as HTMLElement).classList.toggle("on", moveMode);
  viewer.select(selection, moveMode);
  if (moveMode && !selection.length) toast("Klicka på en del för att flytta den – dubbelklicka för att ta hela facket/enheten.");
  renderParts();
});
$("#v-explode").addEventListener("input", (e) => viewer.setExplode(Number((e.target as HTMLInputElement).value)));

// ---------------------------------------------------------------- tangentbord

document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) {
    e.preventDefault();
    return redo();
  }
  if (typing) return;
  if (e.key === "Escape") return select(null, "replace", false);
  if (!selection.length) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    return deleteSelected();
  }
  const step = e.shiftKey ? 100 : 10;
  const moves: Record<string, [keyof Part["pos"], number]> = {
    ArrowLeft: ["x", -step], ArrowRight: ["x", step], ArrowUp: ["z", -step], ArrowDown: ["z", step], PageUp: ["y", step], PageDown: ["y", -step],
  };
  const mv = moves[e.key];
  if (mv) {
    e.preventDefault();
    moveParts(selection, { x: 0, y: 0, z: 0, [mv[0]]: mv[1] });
  }
});

// ---------------------------------------------------------------- start

applyTheme();
renderAll({ fit: true });
