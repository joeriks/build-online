import type { Design, Hardware, Material, Part, Step, Vec3, Workshop } from "../types";
import { hasTool } from "../defaults";

let counter = 0;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Hjälpklass för att bygga upp en konstruktion av axelriktade delar. */
export class Builder {
  parts: Part[] = [];
  steps: Step[] = [];
  hardware: Hardware[] = [];
  notes: string[] = [];

  constructor(public ws: Workshop) {}

  has(tool: string) {
    return hasTool(this.ws, tool);
  }

  /** Lägg till en låda given minsta hörn + storlek. */
  box(name: string, mat: Material, min: Vec3, size: Vec3, group: string, extra: Partial<Part> = {}): Part {
    const p: Part = {
      id: newId(),
      name,
      materialId: mat.id,
      dims: { x: r(size.x), y: r(size.y), z: r(size.z) },
      pos: { x: min.x + size.x / 2, y: min.y + size.y / 2, z: min.z + size.z / 2 },
      rot: { x: 0, y: 0, z: 0 },
      endCuts: [0, 0],
      group,
      ...extra,
    };
    this.parts.push(p);
    return p;
  }

  /** Linjärt virke längs X. `tall` = virkets breda sida står i Y-led. */
  beamX(name: string, m: Material, min: Vec3, len: number, group: string, tall = true) {
    return this.box(name, m, min, { x: len, y: tall ? m.b : m.a, z: tall ? m.a : m.b }, group);
  }
  beamZ(name: string, m: Material, min: Vec3, len: number, group: string, tall = true) {
    return this.box(name, m, min, { x: tall ? m.a : m.b, y: tall ? m.b : m.a, z: len }, group);
  }
  /** Stående virke. `wideAlong` = den breda sidan längs X eller Z. */
  post(name: string, m: Material, min: Vec3, len: number, group: string, wideAlong: "x" | "z" = "z") {
    return this.box(name, m, min, { x: wideAlong === "x" ? m.b : m.a, y: len, z: wideAlong === "z" ? m.b : m.a }, group);
  }

  /** Snedstöd i ett plan (xy eller zy), 45°. center = mittpunkt. */
  brace(name: string, m: Material, center: Vec3, len: number, plane: "xy" | "zy", dir: 1 | -1, group: string) {
    const p: Part = {
      id: newId(),
      name,
      materialId: m.id,
      dims: plane === "xy" ? { x: r(len), y: m.a, z: m.a } : { x: m.a, y: m.a, z: r(len) },
      pos: { ...center },
      rot: plane === "xy" ? { x: 0, y: 0, z: 45 * dir } : { x: -45 * dir, y: 0, z: 0 },
      endCuts: [45, 45],
      group,
    };
    this.parts.push(p);
    return p;
  }

  step(title: string, text: string, groups: string[]) {
    this.steps.push({ title, text, groups });
  }

  hw(name: string, qty: number, unit = "st") {
    if (qty <= 0) return;
    const ex = this.hardware.find((h) => h.name === name);
    if (ex) ex.qty += qty;
    else this.hardware.push({ name, qty, unit });
  }

  note(text: string) {
    if (!this.notes.includes(text)) this.notes.push(text);
  }

  design(title: string, prompt: string, templateId: string, params: Design["params"], wall: Design["wall"] = null): Design {
    return {
      title, prompt, templateId, params, wall,
      parts: this.parts, steps: this.steps, hardware: this.hardware, notes: this.notes,
    };
  }
}

const r = (v: number) => Math.round(v * 10) / 10;

// ---------- Materialval ----------

const avail = (ws: Workshop, kind: Material["kind"]) => ws.materials.filter((m) => m.kind === kind && m.available);
const all = (ws: Workshop, kind: Material["kind"]) => ws.materials.filter((m) => m.kind === kind);

/** Stolpar/ramvirke: grövsta tillgängliga (helst minst 45 mm). */
export function pickFrame(ws: Workshop, prefer: "square" | "tall" = "square"): Material {
  const list = avail(ws, "linear").filter((m) => m.a >= 34);
  const pool = list.length ? list : avail(ws, "linear").length ? avail(ws, "linear") : all(ws, "linear");
  if (!pool.length) throw new Error("Inget virke finns i materiallistan – lägg till minst en regel.");
  const score = (m: Material) =>
    prefer === "square" ? -Math.abs(m.b - m.a) * 0.5 + m.a * 2 + Math.min(m.b, 95) * 0.3 : m.b + m.a * 0.5;
  return [...pool].sort((x, y) => score(y) - score(x))[0];
}

/** Brädor (tunt och brett) om sådana finns. */
export function pickBoard(ws: Workshop): Material | null {
  const list = avail(ws, "linear").filter((m) => m.a <= 30 && m.b >= 70);
  return list.sort((x, y) => y.b - x.b)[0] ?? null;
}

export function pickSheet(ws: Workshop, minThick = 9): Material | null {
  const list = avail(ws, "sheet").filter((m) => m.a >= minThick);
  return list.sort((x, y) => x.a - y.a)[0] ?? null;
}

export function pickMesh(ws: Workshop): Material | null {
  return avail(ws, "mesh")[0] ?? all(ws, "mesh")[0] ?? null;
}

/** Fördela ett avstånd i jämna fack med max bredd `maxSpan`. Returnerar startpositioner för stolpar. */
export function columns(total: number, postW: number, maxSpan: number): number[] {
  const inner = total - postW;
  const n = Math.max(1, Math.ceil(inner / maxSpan));
  return Array.from({ length: n + 1 }, (_, i) => (inner * i) / n);
}

export interface SurfaceOpts {
  gap?: number;
  preferSheet?: boolean;
  minSheet?: number;
  label?: string;
}

/**
 * Täck en rektangel (lx × lz) med bästa tillgängliga material:
 * skiva → brädor → ribbor av ramvirke. Returnerar tjockleken.
 * Delarna läggs med undersida på y0.
 */
export function fillSurface(b: Builder, name: string, group: string, x0: number, y0: number, z0: number, lx: number, lz: number, opts: SurfaceOpts = {}): { thickness: number; kind: string } {
  const gap = opts.gap ?? 6;
  const sheet = opts.preferSheet !== false ? pickSheet(b.ws, opts.minSheet ?? 9) : null;
  if (sheet) {
    const along = lz <= sheet.stockWidth ? sheet.stockLength : lz <= sheet.stockLength ? sheet.stockWidth : 0;
    if (along) {
      // dela längs X om det behövs
      const nx = Math.ceil(lx / along);
      const seg = lx / nx;
      for (let i = 0; i < nx; i++)
        b.box(nx > 1 ? `${name} ${i + 1}` : name, sheet, { x: x0 + i * seg, y: y0, z: z0 }, { x: seg, y: sheet.a, z: lz }, group);
      if (nx > 1) b.note(`${name}: skivan är skarvad – se till att skarven hamnar över ett stöd.`);
      return { thickness: sheet.a, kind: "sheet" };
    }
  }
  const board = pickBoard(b.ws);
  const m = board ?? pickFrame(b.ws);
  const w = m.b; // bredsidan uppåt
  let n = Math.max(1, Math.floor((lz + gap) / (w + gap)));
  let pieceW = w;
  let g = n > 1 ? (lz - n * w) / (n - 1) : 0;
  if (n * w > lz) {
    n = 1;
    g = 0;
  }
  // Om det blir en stor lucka och vi kan klyva – lägg till en klyvd bit
  let ripped = 0;
  if (g > gap * 2.5 && (b.has("bordssag") || b.has("cirkelsag"))) {
    const rest = lz - n * (w + gap);
    if (rest > 30) {
      ripped = Math.round(rest);
      g = gap;
    }
  }
  const segs = Math.ceil(lx / m.stockLength);
  const segL = lx / segs;
  let z = z0;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < segs; s++)
      b.box(`${name} – ${board ? "bräda" : "ribba"} ${i + 1}${segs > 1 ? String.fromCharCode(97 + s) : ""}`, m, { x: x0 + s * segL, y: y0, z }, { x: segL, y: m.a, z: pieceW }, group);
    z += pieceW + g;
  }
  if (ripped) {
    for (let s = 0; s < segs; s++)
      b.box(`${name} – klyvd bit`, m, { x: x0 + s * segL, y: y0, z }, { x: segL, y: m.a, z: ripped }, group);
  }
  if (segs > 1) b.note(`${name}: delarna är längre än säljlängden och skarvas – lägg skarvarna över ett stöd.`);
  if (!board) b.note(`${name} görs av ${m.name} med bredsidan upp eftersom inga brädor eller skivor är tillgängliga.`);
  return { thickness: m.a, kind: board ? "board" : "slat" };
}

/** Material för paneler (lådor, stommar): tunnaste skivan, annars brädor, annars ramvirke. */
export function pickPanel(ws: Workshop, maxThick = 25): Material {
  const sheets = avail(ws, "sheet").filter((m) => m.a <= maxThick).sort((x, y) => x.a - y.a);
  if (sheets.length) return sheets[0];
  const board = avail(ws, "linear").filter((m) => m.a <= 30).sort((x, y) => x.a - y.a || y.b - x.b)[0];
  return board ?? pickFrame(ws);
}

/**
 * En plan panel (min + storlek, tunnaste axeln = tjocklek). Skiva blir en del;
 * virke blir remsor som limmas kant i kant (sista remsan klyvs vid behov).
 */
export function panel(b: Builder, name: string, group: string, mat: Material, min: Vec3, size: Vec3): void {
  if (mat.kind !== "linear") {
    b.box(name, mat, min, size, group);
    return;
  }
  const axes = (["x", "y", "z"] as const).slice().sort((p, q) => size[p] - size[q]);
  const wAx = axes[1]; // bredden som fylls med remsor; längsta axeln = remsornas längd
  const total = size[wAx];
  const n = Math.max(1, Math.ceil(total / mat.b - 0.02));
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const w = total / n; // jämnt breda remsor istället för en smal sista sticka
    const s = { ...size, [wAx]: w } as Vec3;
    const o = { ...min, [wAx]: min[wAx] + pos } as Vec3;
    b.box(n > 1 ? `${name} (remsa ${i + 1})` : name, mat, o, s, group);
    pos += w;
  }
  if (n > 1) b.note(`${name} limmas ihop av ${n} remsor ${mat.name} kant i kant.`);
}
