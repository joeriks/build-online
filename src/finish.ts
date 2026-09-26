/**
 * Ytbehandling och bearbetning: kantfräsning, slipning, olja/vax/lasyr/lack/färg och kantband.
 * En del får sin behandling från (i tur och ordning) delen själv, dess grupp eller hela konstruktionen.
 */
import type { Design, Part, Step, Workshop } from "./types";
import { hasTool } from "./defaults";

export type Edge = "rak" | "fas" | "rundad" | "profil";
export type Coating = "ingen" | "olja" | "vax" | "lasyr" | "lack" | "farg";

export interface Finish {
  edge?: Edge;
  /** Fasens/radiens storlek, mm */
  edgeSize?: number;
  /** Slipat till korn (0 = oslipat) */
  sand?: number;
  coating?: Coating;
  /** Kulör för färg och lasyr */
  color?: string;
  /** Kantband på skivornas kanter */
  edgeBand?: boolean;
}

export const EDGES: { id: Edge; name: string; desc: string }[] = [
  { id: "rak", name: "Raka", desc: "Kanterna lämnas som de är från sågen (bryt dem lätt med sandpapper)." },
  { id: "fas", name: "Fasade", desc: "45° fas – modernt och tåligt, går att göra med hyvel eller slipkloss." },
  { id: "rundad", name: "Rundade", desc: "Rundade kanter – mjukt och barnvänligt, görs med rundfräs." },
  { id: "profil", name: "Profilerade", desc: "Dekorprofil (t.ex. karnis) – kräver överfräs och profilfräs." },
];

export interface CoatingInfo {
  id: Coating;
  name: string;
  desc: string;
  /** m² per liter och lager */
  coverage: number;
  coats: number;
  pricePerL: number;
  outdoor: boolean;
  /** Minuter per m² och lager, samt torktid mellan lager (h) */
  minPerM2: number;
  dryH: number;
  hasColor: boolean;
}

export const COATINGS: CoatingInfo[] = [
  { id: "ingen", name: "Obehandlat", desc: "Trät lämnas naturligt och grånar utomhus.", coverage: 0, coats: 0, pricePerL: 0, outdoor: true, minPerM2: 0, dryH: 0, hasColor: false },
  { id: "olja", name: "Olja", desc: "Möbel-/hårdvaxolja inne, träolja ute. Fördjupar färgen, lätt att bättra på.", coverage: 12, coats: 2, pricePerL: 260, outdoor: true, minPerM2: 8, dryH: 12, hasColor: false },
  { id: "vax", name: "Vax", desc: "Mjuk, sidenmatt yta för möbler inomhus. Tål inte vatten och värme.", coverage: 20, coats: 2, pricePerL: 350, outdoor: false, minPerM2: 10, dryH: 2, hasColor: false },
  { id: "lasyr", name: "Bets / lasyr", desc: "Färgar trät men ådringen syns. Lasyr skyddar även utomhus.", coverage: 9, coats: 2, pricePerL: 280, outdoor: true, minPerM2: 7, dryH: 6, hasColor: true },
  { id: "lack", name: "Lack", desc: "Hård, tålig yta för möbler och bänkskivor inomhus. Spricker utomhus.", coverage: 10, coats: 3, pricePerL: 300, outdoor: false, minPerM2: 8, dryH: 4, hasColor: false },
  { id: "farg", name: "Färg", desc: "Täckande färg – snickerifärg inne, utomhusfärg ute. Grunda först.", coverage: 8, coats: 2, pricePerL: 320, outdoor: true, minPerM2: 9, dryH: 6, hasColor: true },
];

export const SANDING = [0, 80, 120, 180, 240];
export const COLORS: { name: string; hex: string }[] = [
  { name: "Vit", hex: "#f4f2ec" },
  { name: "Grå", hex: "#9a9d9f" },
  { name: "Svart", hex: "#2b2b2b" },
  { name: "Faluröd", hex: "#8e2b1f" },
  { name: "Skogsgrön", hex: "#3f5b43" },
  { name: "Duvblå", hex: "#6f8fa6" },
  { name: "Ockra", hex: "#c9953b" },
  { name: "Valnöt", hex: "#6b4a2f" },
];

export const PRESETS: { name: string; finish: Finish }[] = [
  { name: "Obehandlat", finish: { edge: "rak", edgeSize: 0, sand: 0, coating: "ingen" } },
  { name: "Slipat + olja", finish: { edge: "rak", edgeSize: 0, sand: 120, coating: "olja" } },
  { name: "Rundade kanter + olja", finish: { edge: "rundad", edgeSize: 6, sand: 180, coating: "olja" } },
  { name: "Fasat + vit färg", finish: { edge: "fas", edgeSize: 4, sand: 120, coating: "farg", color: "#f4f2ec" } },
  { name: "Möbel: lackad", finish: { edge: "rundad", edgeSize: 3, sand: 240, coating: "lack" } },
  { name: "Utomhus: lasyr", finish: { edge: "fas", edgeSize: 3, sand: 80, coating: "lasyr", color: "#6b4a2f" } },
];

const NONE: Required<Finish> = { edge: "rak", edgeSize: 0, sand: 0, coating: "ingen", color: "#f4f2ec", edgeBand: false };

/** Behandlingen som gäller för en del: delen → gruppen → hela konstruktionen → obehandlat. */
export function effectiveFinish(design: Design, part: Part): Required<Finish> {
  const all = design.finishes?.["*"] ?? {};
  const grp = design.finishes?.[`g:${part.group}`] ?? {};
  return { ...NONE, ...all, ...grp, ...(part.finish ?? {}) };
}

export const coatingInfo = (c: Coating) => COATINGS.find((x) => x.id === c)!;

export function describeFinish(f: Required<Finish>): string {
  const bits: string[] = [];
  if (f.edge !== "rak" && f.edgeSize > 0) bits.push(`${EDGES.find((e) => e.id === f.edge)!.name.toLowerCase()} kanter ${f.edgeSize} mm`);
  if (f.sand) bits.push(`slipat ${f.sand}`);
  if (f.coating !== "ingen") bits.push(coatingInfo(f.coating).name.toLowerCase());
  if (f.edgeBand) bits.push("kantband");
  return bits.join(", ") || "obehandlat";
}

const OUTDOOR = new Set(["catio", "woodShed", "deck", "sandbox", "raisedBed", "birdHouse"]);

export interface FinishSummary {
  items: { name: string; qty: number; unit: string; cost: number }[];
  /** Arbetstid (h) och torktid totalt (h) */
  hours: number;
  dryHours: number;
  warnings: { level: "warn" | "info"; text: string; partIds: string[] }[];
  steps: Step[];
  /** Behandlad yta (m²) */
  area: number;
}

/** Åtgång, kostnad, tid, varningar och byggsteg för ytbehandlingen. */
export function finishSummary(design: Design, ws: Workshop): FinishSummary {
  const items = new Map<string, { name: string; qty: number; unit: string; cost: number }>();
  const add = (name: string, qty: number, unit: string, cost: number) => {
    const it = items.get(name) ?? { name, qty: 0, unit, cost: 0 };
    it.qty += qty;
    it.cost += cost;
    items.set(name, it);
  };
  const warnings: FinishSummary["warnings"] = [];
  const warn = (level: "warn" | "info", text: string, id: string) => {
    const w = warnings.find((x) => x.text === text);
    if (w) w.partIds.push(id);
    else warnings.push({ level, text, partIds: [id] });
  };
  let minutes = 0, area = 0;
  const coatArea = new Map<string, number>(); // nyckel coating|färg
  const sandArea = new Map<number, number>();
  const edgeLen = new Map<string, number>(); // "rundad|6"
  let bandLen = 0;
  const outdoor = OUTDOOR.has(design.templateId ?? "");
  const router = hasTool(ws, "overfras");
  const sander = hasTool(ws, "slipmaskin");

  for (const p of design.parts) {
    const mat = ws.materials.find((m) => m.id === p.materialId);
    if (!mat || mat.kind === "mesh") continue;
    const f = effectiveFinish(design, p);
    const { x, y, z } = p.dims;
    const a = (2 * (x * y + y * z + x * z)) / 1e6; // m², alla sidor
    const L = Math.max(x, y, z);
    if (f.coating !== "ingen") {
      const key = `${f.coating}|${coatingInfo(f.coating).hasColor ? f.color : ""}`;
      coatArea.set(key, (coatArea.get(key) ?? 0) + a);
      area += a;
    }
    if (f.sand) {
      // Slipa i steg upp till valt korn
      for (const g of SANDING.filter((g) => g && g <= f.sand)) sandArea.set(g, (sandArea.get(g) ?? 0) + a);
    }
    if (f.edge !== "rak" && f.edgeSize > 0) {
      // De fyra långa kanterna (plus kortändarna på skivor)
      const len = (mat.kind === "sheet" ? 2 * (L + [x, y, z].sort((m, n) => m - n)[1]) : 4 * L) / 1000;
      const key = `${f.edge}|${f.edgeSize}`;
      edgeLen.set(key, (edgeLen.get(key) ?? 0) + len);
      if (!router && (f.edge === "profil" || f.edge === "rundad" || f.edgeSize > 4))
        warn("warn", f.edge === "profil"
          ? "Profilerade kanter kräver överfräs – utan den: välj fas eller rundning ≤ 3 mm som görs med hyvel/slipkloss."
          : `Rundade/stora kanter (${f.edgeSize} mm) görs med överfräs och rundfräs. Utan överfräs: fasa med handhyvel eller runda med slipkloss (max ca 3 mm).`, p.id);
    }
    if (f.edgeBand) {
      if (mat.kind === "sheet") bandLen += (2 * (L + [x, y, z].sort((m, n) => m - n)[1])) / 1000;
      else warn("info", "Kantband används bara på skivor – ignoreras för virke.", p.id);
    }
    if (mat.kind === "sheet" && /spån/i.test(mat.name) && f.coating !== "ingen" && !f.edgeBand && f.coating !== "farg")
      warn("info", "Spånskivans kanter suger åt sig olja/lack och sväller – sätt kantband först.", p.id);
    if (outdoor && (f.coating === "lack" || f.coating === "vax"))
      warn("warn", `${coatingInfo(f.coating).name} passar inte utomhus – det spricker eller flagnar. Välj olja, lasyr eller utomhusfärg.`, p.id);
    if (["sandbox", "raisedBed"].includes(design.templateId ?? "") && f.coating !== "ingen" && f.coating !== "olja")
      warn("warn", design.templateId === "sandbox"
        ? "Sandlådan: använd bara barnsäker behandling (t.ex. ren linolja) – eller låt den vara obehandlad."
        : "Odlingslådan: behandla bara utsidan – insidan mot jorden ska vara obehandlad eller klädd med plast.", p.id);
    if (f.sand >= 180 && !sander) warn("info", `Slipning till korn ${f.sand} går för hand med slipkloss, men en excenterslip sparar mycket tid.`, p.id);
    if (f.coating === "farg" && f.sand === 0) warn("info", "Slipa lätt (korn 120) och grunda innan du målar, annars fäster färgen sämre.", p.id);
    if ((f.coating === "lack" || f.coating === "vax") && f.sand && f.sand < 180) warn("info", "Lack och vax ser bäst ut på yta slipad till korn 180–240.", p.id);
  }

  // Förbrukning och tid
  let dryHours = 0;
  for (const [key, a] of coatArea) {
    const [c, color] = key.split("|") as [Coating, string];
    const info = coatingInfo(c);
    const liters = Math.max(0.25, Math.ceil(((a * info.coats) / info.coverage) * 1.15 * 4) / 4);
    const cname = color ? ` (${COLORS.find((x) => x.hex === color)?.name ?? color})` : "";
    add(`${info.name}${cname}`, liters, "l", liters * info.pricePerL);
    if (c === "farg") {
      const primer = Math.max(0.25, Math.ceil((a / 10) * 1.15 * 4) / 4);
      add("Grundfärg", primer, "l", primer * 250);
      minutes += a * 6;
      dryHours += 6;
    }
    minutes += a * info.coats * info.minPerM2;
    dryHours = Math.max(dryHours, info.dryH * (info.coats - 1) + info.dryH);
    add("Pensel/roller, trasor", 1, "sats", 0);
  }
  for (const [g, a] of [...sandArea].sort((m, n) => m[0] - n[0])) {
    const sheets = Math.ceil(a / 0.6); // ca 0,6 m² per ark
    add(`Sandpapper korn ${g}`, sheets, "ark", sheets * 12);
    minutes += a * (sander ? 5 : 14);
  }
  for (const [key, len] of edgeLen) {
    const [e, size] = key.split("|");
    minutes += len * (router ? 1.5 : 5);
    if (router && e !== "fas") add(`${e === "profil" ? "Profilfräs" : "Rundfräs"} R${size} (om du saknar)`, 1, "st", 250);
    else if (router) add(`Fasfräs 45° (om du saknar)`, 1, "st", 200);
  }
  if (bandLen) {
    const m = Math.ceil(bandLen * 1.1);
    add("Kantband (förlimmat, 20–22 mm)", m, "m", m * 6);
    minutes += bandLen * 2;
  }

  // Byggsteg för ytbehandlingen
  const steps: Step[] = [];
  if (edgeLen.size) steps.push({ title: "Kanter", text: router ? `Fräs kanterna med överfräs (${[...edgeLen.keys()].map((k) => k.replace("|", " ") + " mm").join(", ")}). Fräs medsols och i flera tag.` : "Fasa kanterna med handhyvel eller runda dem med slipkloss innan montering.", groups: [] });
  if (bandLen) steps.push({ title: "Kantband", text: "Stryk på kantbandet med strykjärn (bomullsläge), putsa bort överskottet med kniv och slipkloss.", groups: [] });
  if (sandArea.size) steps.push({ title: "Slipning", text: `Slipa i steg: ${[...sandArea.keys()].sort((m, n) => m - n).map((g) => `korn ${g}`).join(" → ")}. Slipa längs ådringen och dammsug mellan stegen. Det är lättare att slipa delarna innan montering.`, groups: [] });
  for (const key of coatArea.keys()) {
    const [c] = key.split("|") as [Coating, string];
    const info = coatingInfo(c);
    const how: Record<Coating, string> = {
      ingen: "",
      olja: `Stryk på oljan, låt den verka 15–20 min och torka av överskottet noga med trasa. ${info.coats} gånger med ca ${info.dryH} h emellan. OBS: oljiga trasor kan självantända – blöt dem och lägg i en tät burk.`,
      vax: "Gnid in vaxet med trasa eller stålull 0000, låt torka och polera upp med en mjuk trasa.",
      lasyr: `Stryk ${info.coats} lager lasyr längs ådringen, ${info.dryH} h torktid mellan lagren.`,
      lack: `Stryk ${info.coats} tunna lager lack. Mellanslipa lätt med korn 240 mellan lagren (${info.dryH} h torktid).`,
      farg: `Grunda, mellanslipa lätt och måla ${info.coats} lager täckfärg. Måla gärna delarna innan montering och bättra efteråt.`,
    };
    steps.push({ title: info.name, text: how[c], groups: [] });
  }

  return { items: [...items.values()], hours: Math.round((minutes / 60) * 10) / 10, dryHours, warnings, steps, area: Math.round(area * 10) / 10 };
}
