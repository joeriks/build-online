/**
 * Förslag på förstärkning för delar som hållfasthetsanalysen underkänner (eller som ligger nära gränsen).
 * Varje förslag är en konkret ändring av konstruktionen som provkörs: vi räknar om analysen och
 * kostnaden på en kopia, så användaren ser "före → efter" innan hen accepterar.
 */
import type { Design, Material, Part, Workshop } from "./types";
import { analyzeStrength, type MemberResult, type StrengthReport } from "./strength";
import { purchases } from "./analysis";
import { newId, pickFrame } from "./generators/builder";
import { templateById } from "./generators";

export interface Suggestion {
  key: string;
  title: string;
  detail: string;
  /** Delar som förslaget gäller (en grupp likadana delar) */
  memberIds: string[];
  /** Utnyttjande före/efter för de berörda delarna och högsta i hela konstruktionen efteråt */
  before: number;
  after: number;
  worstAfter: number;
  costDelta: number;
  partsDelta: number;
  /** Den förstärkta konstruktionen och vilka delar som är nya/ändrade */
  design: Design;
  changedIds: string[];
}

type Axis = "x" | "z";
const TOL = 1.5;
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));
const cost = (d: Design, ws: Workshop) => purchases(d, ws).reduce((s, p) => s + (p.cost ?? 0), 0);

interface B { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
function bb(p: Part): B {
  return {
    min: { x: p.pos.x - p.dims.x / 2, y: p.pos.y - p.dims.y / 2, z: p.pos.z - p.dims.z / 2 },
    max: { x: p.pos.x + p.dims.x / 2, y: p.pos.y + p.dims.y / 2, z: p.pos.z + p.dims.z / 2 },
  };
}
const ov = (a: B, b: B, ax: "x" | "y" | "z") => Math.min(a.max[ax], b.max[ax]) - Math.max(a.min[ax], b.min[ax]);
const lenAxis = (p: Part): Axis => (p.dims.x >= p.dims.z ? "x" : "z");
const other = (a: Axis): Axis => (a === "x" ? "z" : "x");
const rotated = (p: Part) => !!(p.rot.x || p.rot.y || p.rot.z);

/** Utrymmet under en liggande del mellan stöden i ändarna – där en list kan sitta. */
function listSpan(d: Design, ws: Workshop, P: Part): { from: number; to: number } | null {
  const L = lenAxis(P);
  const pb = bb(P);
  let from = pb.min[L], to = pb.max[L];
  for (const Q of d.parts) {
    if (Q === P || rotated(Q) || ws.materials.find((m) => m.id === Q.materialId)?.kind === "mesh") continue;
    const qb = bb(Q);
    const under = Math.abs(qb.max.y - pb.min.y) <= TOL && ov(pb, qb, "x") > 2 && ov(pb, qb, "z") > 2;
    if (!under) continue;
    // Stöd som går längs hela delen (t.ex. en befintlig kantlist) räknas inte
    if (ov(pb, qb, L) > 0.5 * P.dims[L]) continue;
    const c = (qb.min[L] + qb.max[L]) / 2;
    if (c < (pb.min[L] + pb.max[L]) / 2) from = Math.max(from, qb.max[L]);
    else to = Math.min(to, qb.min[L]);
  }
  // Mittstöd gör det här förslaget meningslöst
  const mid = d.parts.some((Q) => {
    if (Q === P || rotated(Q)) return false;
    const qb = bb(Q);
    return Math.abs(qb.max.y - pb.min.y) <= TOL && ov(pb, qb, "x") > 2 && ov(pb, qb, "z") > 2 && qb.min[L] > from + 1 && qb.max[L] < to - 1;
  });
  if (mid || to - from < 150) return null;
  return { from, to };
}

/** Finns det redan något under delens kant (fram = största O, bak = minsta O)? */
function edgeOccupied(d: Design, P: Part, side: "front" | "back"): boolean {
  const L = lenAxis(P), O = other(L), pb = bb(P);
  return d.parts.some((Q) => {
    if (Q === P || rotated(Q)) return false;
    const qb = bb(Q);
    if (Math.abs(qb.max.y - pb.min.y) > TOL || ov(pb, qb, L) < 0.5 * P.dims[L] || ov(pb, qb, O) <= 0) return false;
    return side === "front" ? qb.max[O] > pb.max[O] - 60 : qb.min[O] < pb.min[O] + 60;
  });
}

function addEdgeList(d: Design, ws: Workshop, P: Part, side: "front" | "back", m: Material, span: { from: number; to: number }): Part {
  const L = lenAxis(P), O = other(L), pb = bb(P);
  const h = m.b; // på högkant under hyllan
  const size = { x: 0, y: h, z: 0 };
  size[L] = span.to - span.from;
  size[O] = m.a;
  const oMin = side === "front" ? pb.max[O] - m.a : pb.min[O];
  const pos = { x: 0, y: pb.min.y - h / 2, z: 0 };
  pos[L] = (span.from + span.to) / 2;
  pos[O] = oMin + m.a / 2;
  const part: Part = {
    id: newId(), name: `${P.name} – ${side === "front" ? "framkantslist" : "bakkantslist"}`, materialId: m.id,
    dims: size, pos, rot: { x: 0, y: 0, z: 0 }, endCuts: [0, 0], group: "förstärkning", ...(P.unit ? { unit: P.unit } : {}),
  };
  d.parts.push(part);
  return part;
}

function hw(d: Design, name: string, qty: number, unit = "st") {
  const h = d.hardware.find((x) => x.name === name);
  if (h) h.qty += qty;
  else d.hardware.push({ name, qty, unit });
}

/** Byt material på en liggande del men behåll undersidan på samma höjd. */
function changeMaterial(P: Part, m: Material, tall: boolean) {
  const O = other(lenAxis(P));
  const bottom = P.pos.y - P.dims.y / 2;
  if (m.kind === "sheet") {
    P.dims.y = m.a;
  } else {
    P.dims.y = tall ? m.b : m.a;
    P.dims[O] = tall ? m.a : m.b;
  }
  P.materialId = m.id;
  P.pos.y = bottom + P.dims.y / 2;
}

/** Alla förslag för en grupp likadana delar (samma resultat). */
export function suggestFor(design: Design, ws: Workshop, report: StrengthReport, group: MemberResult[]): Suggestion[] {
  const first = group[0];
  const ids = group.map((m) => m.id);
  const parts = ids.map((id) => design.parts.find((p) => p.id === id)).filter(Boolean) as Part[];
  if (!parts.length) return [];
  const P0 = parts[0];
  const mat0 = ws.materials.find((m) => m.id === P0.materialId);
  if (!mat0) return [];
  const before = first.util;
  const baseCost = cost(design, ws);
  const out: Suggestion[] = [];

  const evaluate = (key: string, title: string, detail: string, mutate: (d: Design) => string[] | null, templateRegen = false) => {
    const d = clone(design);
    const changed = mutate(d);
    if (!changed) return;
    if (!templateRegen) d.edited = true;
    const r = analyzeStrength(d, ws);
    const idSet = new Set(templateRegen ? [] : ids);
    const affected = r.members.filter((m) => idSet.has(m.id) || changed.includes(m.id));
    const after = templateRegen ? (r.worst?.util ?? 0) : Math.max(0, ...affected.map((m) => m.util));
    out.push({
      key, title, detail, memberIds: ids, before, after, worstAfter: r.worst?.util ?? 0,
      costDelta: Math.round(cost(d, ws) - baseCost), partsDelta: d.parts.length - design.parts.length, design: d, changedIds: changed,
    });
  };

  const isSurface = first.kind === "yta";
  const n = parts.length;
  const pl = n > 1 ? ` (${n} st)` : "";

  // 1. List under framkanten / båda kanterna (ytor som bara bärs i ändarna)
  // (bara för breda ytor – smala brädor bärs redan av det de vilar på)
  if (first.kind !== "stolpe" && (isSurface || P0.dims.y <= Math.min(P0.dims.x, P0.dims.z)) && P0.dims[other(lenAxis(P0))] >= 200) {
    const list = ws.materials.find((m) => m.id === "regel-45x45" && m.available) ?? pickFrame(ws, "square");
    for (const sides of [["front"], ["front", "back"]] as ("front" | "back")[][]) {
      evaluate(
        `list-${sides.join("-")}`,
        sides.length === 1 ? `List under framkanten${pl}` : `Lister under fram- och bakkant${pl}`,
        sides.length === 1
          ? `En ${list.name} på högkant under hyllans framkant, mellan stöden. Tar en stor del av lasten och stoppar svikten i framkant.`
          : `En ${list.name} under både fram- och bakkant – då bärs hyllan längs kanterna och spänner den korta vägen.`,
        (d) => {
          const changed: string[] = [];
          for (const id of ids) {
            const P = d.parts.find((p) => p.id === id)!;
            const span = listSpan(d, ws, P);
            if (!span) return null;
            for (const side of sides) {
              if (edgeOccupied(d, P, side)) continue;
              changed.push(addEdgeList(d, ws, P, side, list, span).id);
            }
          }
          if (!changed.length) return null;
          hw(d, "Träskruv 5×80 (kantlister)", changed.length * 4);
          return changed;
        },
      );
    }
  }

  // 2. Kraftigare material: tjockare skiva, grövre virke eller högkant
  if (first.kind !== "stolpe" && first.uConn < Math.max(first.uBend, first.uDefl)) {
    if (mat0.kind === "sheet") {
      const cands = ws.materials.filter((m) => m.kind === "sheet" && m.id !== mat0.id && m.a >= mat0.a && m.stockWidth >= Math.min(P0.dims.x, P0.dims.z));
      for (const m of cands)
        evaluate(`mat-${m.id}`, `Byt till ${m.name}${pl}`, `${m.name} är ${m.a > mat0.a ? "tjockare" : "styvare"} än ${mat0.name}.${m.available ? "" : " Behöver köpas in."}`, (d) => {
          for (const id of ids) changeMaterial(d.parts.find((p) => p.id === id)!, m, false);
          return ids;
        });
    } else if (mat0.kind === "linear") {
      const tall = P0.dims.y >= Math.min(P0.dims.x, P0.dims.z);
      if (!tall && mat0.b > mat0.a * 1.3)
        evaluate("hogkant", `Vänd på högkant${pl}`, `Samma ${mat0.name}, men stående – ${Math.round((mat0.b / mat0.a) ** 2 * 10) / 10}× styvare.`, (d) => {
          for (const id of ids) changeMaterial(d.parts.find((p) => p.id === id)!, mat0, true);
          return ids;
        });
      const bigger = ws.materials
        .filter((m) => m.kind === "linear" && m.id !== mat0.id && m.a >= mat0.a && m.b > mat0.b && m.stockLength >= Math.max(P0.dims.x, P0.dims.z))
        .sort((a, b) => a.a * a.b - b.a * b.b)
        .slice(0, 2);
      for (const m of bigger)
        evaluate(`mat-${m.id}`, `Byt till ${m.name} på högkant${pl}`, `Grövre virke.${m.available ? "" : " Behöver köpas in."}`, (d) => {
          for (const id of ids) changeMaterial(d.parts.find((p) => p.id === id)!, m, true);
          return ids;
        });
    }
  }

  // 3. Starkare infästning
  if (first.uConn > 0.5) {
    for (const [f, title, detail, hwName] of [
      ["skruv4", "4 skruvar per infästning", "Dubbla antalet skruvar där delen hänger i skruv.", "Träskruv 5×80 (extra för infästning)"],
      ["vinkel", "Vinkelbeslag i infästningarna", "Ett vinkelbeslag under varje ände bär mycket mer än skruv i sidled.", "Vinkelbeslag 70×70 med skruv"],
    ] as const) {
      if (P0.fastening === f || (f === "skruv4" && P0.fastening === "vinkel")) continue;
      evaluate(`fast-${f}`, `${title}${pl}`, detail, (d) => {
        for (const id of ids) d.parts.find((p) => p.id === id)!.fastening = f;
        hw(d, hwName, ids.length * (f === "skruv4" ? 4 : 2));
        return ids;
      });
    }
  }

  // 4. Stolpar: grövre virke
  if (first.kind === "stolpe" && mat0.kind === "linear") {
    const bigger = ws.materials.filter((m) => m.kind === "linear" && m.a * m.b > mat0.a * mat0.b).sort((a, b) => a.a * a.b - b.a * b.b)[0];
    if (bigger)
      evaluate(`post-${bigger.id}`, `Grövre stolpar: ${bigger.name}${pl}`, "Större tvärsnitt tål mer tryck och knäcks inte lika lätt.", (d) => {
        for (const id of ids) {
          const P = d.parts.find((p) => p.id === id)!;
          const bottom = P.pos.y - P.dims.y / 2;
          const wideX = P.dims.x >= P.dims.z;
          P.dims.x = wideX ? bigger.b : bigger.a;
          P.dims.z = wideX ? bigger.a : bigger.b;
          P.materialId = bigger.id;
          P.pos.y = bottom + P.dims.y / 2;
        }
        return ids;
      });
  }

  // 5. Mallar med "Max fackbredd": bygg om med kortare spann
  const t = templateById(design.templateId);
  if (t && !design.edited && t.params.some((p) => p.key === "maxSpan") && first.maxSpan && first.span > first.maxSpan) {
    const target = Math.max(300, Math.floor(first.maxSpan / 50) * 50);
    if (target < +design.params.maxSpan)
      evaluate("maxspan", `Minska max fackbredd till ${target} mm`, "Bygger om hela konstruktionen med fler gavlar/stegar och kortare hyllor.", (d) => {
        const params = { ...design.params, maxSpan: target };
        const nd = t.build(ws, params, design.prompt);
        nd.title = design.title;
        if (design.loadKgM2 != null) nd.loadKgM2 = design.loadKgM2;
        Object.assign(d, nd);
        return nd.parts.map((p) => p.id);
      }, true);
  }

  void report;
  // Bäst först: de som räcker (≤ 100 %) sorterade på kostnad, sedan resten på hur mycket de hjälper
  return out
    .filter((s) => s.after < before - 0.02)
    .sort((a, b) => {
      const okA = a.after <= 1, okB = b.after <= 1;
      if (okA !== okB) return okA ? -1 : 1;
      if (okA) return a.costDelta - b.costDelta || a.partsDelta - b.partsDelta;
      return a.after - b.after;
    });
}

/** Förstärk automatiskt: välj bästa förslaget för den svagaste delen, om och om igen. */
export function autoReinforce(design: Design, ws: Workshop, groupFn: (m: MemberResult[]) => MemberResult[][], maxSteps = 12): { design: Design; applied: string[] } {
  let d = design;
  const applied: string[] = [];
  const tried = new Set<string>();
  for (let i = 0; i < maxSteps; i++) {
    const r = analyzeStrength(d, ws);
    const failing = groupFn(r.members.filter((m) => m.util > 1)).filter((g) => !tried.has(g[0].id));
    if (!failing.length) break;
    const g = failing[0];
    const s = suggestFor(d, ws, r, g)[0];
    if (!s) {
      tried.add(g[0].id);
      continue;
    }
    d = s.design;
    applied.push(s.title);
  }
  return { design: d, applied };
}
