import type { Design, Material, Part, Workshop } from "./types";
import { hasTool } from "./defaults";
import { effectiveFinish } from "./finish";

export type Level = "error" | "warn" | "info";
export interface Warning {
  level: Level;
  text: string;
  partIds: string[];
}

export interface PartShape {
  kind: Material["kind"];
  /** linear: kaplängd. sheet/mesh: längsta sidan */
  length: number;
  /** linear: tvärsnitt [a, b]. sheet/mesh: [tjocklek, kortaste sidan] */
  section: [number, number];
  /** linear: måste klyvas (tvärsnitt mindre än virket) */
  rip: boolean;
  angled: boolean;
}

const TOL = 1.5;

export function partShape(part: Part, mat: Material): PartShape {
  const d = [part.dims.x, part.dims.y, part.dims.z].map((v) => Math.round(v)).sort((a, b) => a - b);
  const angled = part.endCuts.some((a) => Math.abs(a) > 0.1);
  if (mat.kind === "linear") {
    const rip = d[0] < mat.a - TOL || d[1] < mat.b - TOL;
    return { kind: "linear", length: d[2], section: [d[0], d[1]], rip, angled };
  }
  return { kind: mat.kind, length: d[2], section: [d[0], d[1]], rip: false, angled };
}

export interface CutRow {
  materialId: string;
  materialName: string;
  kind: Material["kind"];
  length: number;
  width: number;
  section: [number, number];
  endCuts: [number, number];
  rip: boolean;
  /** Kantbearbetning, t.ex. "rundad 6" (tom om raka kanter) */
  edge: string;
  qty: number;
  names: string[];
  partIds: string[];
}

export function cutList(design: Design, ws: Workshop): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const p of design.parts) {
    const mat = ws.materials.find((m) => m.id === p.materialId);
    if (!mat) continue;
    const s = partShape(p, mat);
    const cuts = [...p.endCuts].map((a) => Math.round(Math.abs(a))).sort((a, b) => a - b) as [number, number];
    const width = mat.kind === "linear" ? 0 : s.section[1];
    const f = mat.kind === "mesh" ? null : effectiveFinish(design, p);
    const edge = f && f.edge !== "rak" && f.edgeSize > 0 ? `${f.edge} ${f.edgeSize}` : "";
    const key = [mat.id, s.length, width, s.section.join("x"), cuts.join("/"), s.rip, edge].join("|");
    let row = rows.get(key);
    if (!row) {
      row = {
        materialId: mat.id, materialName: mat.name, kind: mat.kind, length: s.length, width,
        section: s.section, endCuts: cuts, rip: s.rip, edge, qty: 0, names: [], partIds: [],
      };
      rows.set(key, row);
    }
    row.qty++;
    if (!row.names.includes(p.name)) row.names.push(p.name);
    row.partIds.push(p.id);
  }
  return [...rows.values()].sort((a, b) =>
    a.materialName.localeCompare(b.materialName, "sv") || b.length - a.length || b.width - a.width,
  );
}

// ---------- Optimering av inköp ----------

export interface Bar {
  pieces: { length: number; name: string; partId: string }[];
  used: number;
  waste: number;
}

/** First-fit decreasing: fördela kapbitar på så få säljlängder som möjligt. */
export function packLinear(pieces: { length: number; name: string; partId: string }[], stock: number, kerf: number): { bars: Bar[]; tooLong: typeof pieces } {
  const tooLong = pieces.filter((p) => p.length > stock);
  const fit = pieces.filter((p) => p.length <= stock).sort((a, b) => b.length - a.length);
  const bars: Bar[] = [];
  for (const p of fit) {
    let bar = bars.find((b) => b.used + (b.pieces.length ? kerf : 0) + p.length <= stock);
    if (!bar) {
      bar = { pieces: [], used: 0, waste: 0 };
      bars.push(bar);
    }
    bar.used += (bar.pieces.length ? kerf : 0) + p.length;
    bar.pieces.push(p);
  }
  for (const b of bars) b.waste = stock - b.used;
  return { bars, tooLong };
}

export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  partId: string;
}
export interface Sheet {
  placed: Placed[];
}

/** Enkel hyllpackning (giljotinsnitt) av skivdelar på standardskivor. */
export function packSheets(panels: { w: number; h: number; name: string; partId: string }[], sheetL: number, sheetW: number, kerf: number): { sheets: Sheet[]; tooBig: typeof panels } {
  const tooBig: typeof panels = [];
  const items = panels
    .map((p) => {
      // längsta sidan längs skivans längd
      const l = Math.max(p.w, p.h), s = Math.min(p.w, p.h);
      return { ...p, w: l, h: s };
    })
    .filter((p) => {
      if (p.w > sheetL || p.h > sheetW) {
        tooBig.push(p);
        return false;
      }
      return true;
    })
    .sort((a, b) => b.h - a.h || b.w - a.w);

  type Shelf = { y: number; h: number; x: number };
  const sheets: { sheet: Sheet; shelves: Shelf[]; nextY: number }[] = [];
  for (const it of items) {
    let placed = false;
    for (const s of sheets) {
      for (const sh of s.shelves) {
        if (it.h <= sh.h && sh.x + it.w <= sheetL) {
          s.sheet.placed.push({ x: sh.x, y: sh.y, w: it.w, h: it.h, name: it.name, partId: it.partId });
          sh.x += it.w + kerf;
          placed = true;
          break;
        }
      }
      if (placed) break;
      if (s.nextY + it.h <= sheetW) {
        const sh: Shelf = { y: s.nextY, h: it.h, x: it.w + kerf };
        s.shelves.push(sh);
        s.sheet.placed.push({ x: 0, y: s.nextY, w: it.w, h: it.h, name: it.name, partId: it.partId });
        s.nextY += it.h + kerf;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const s = { sheet: { placed: [] as Placed[] }, shelves: [{ y: 0, h: it.h, x: it.w + kerf }], nextY: it.h + kerf };
      s.sheet.placed.push({ x: 0, y: 0, w: it.w, h: it.h, name: it.name, partId: it.partId });
      sheets.push(s);
    }
  }
  return { sheets: sheets.map((s) => s.sheet), tooBig };
}

export interface Purchase {
  material: Material;
  qty: number;
  unitLabel: string;
  cost: number | null;
  bars?: Bar[];
  sheets?: Sheet[];
  meshArea?: number;
  totalLength?: number;
}

export function purchases(design: Design, ws: Workshop): Purchase[] {
  const out: Purchase[] = [];
  for (const mat of ws.materials) {
    const parts = design.parts.filter((p) => p.materialId === mat.id);
    if (!parts.length) continue;
    if (mat.kind === "linear") {
      const pieces = parts.map((p) => ({ length: partShape(p, mat).length, name: p.name, partId: p.id }));
      const { bars, tooLong } = packLinear(pieces, mat.stockLength, ws.kerf);
      // för långa delar: räkna antal säljlängder som krävs för skarvning
      const extra = tooLong.reduce((n, p) => n + Math.ceil(p.length / mat.stockLength), 0);
      const qty = bars.length + extra;
      out.push({
        material: mat, qty, unitLabel: `st à ${mat.stockLength / 1000} m`, cost: mat.price != null ? qty * mat.price : null,
        bars, totalLength: pieces.reduce((s, p) => s + p.length, 0),
      });
    } else if (mat.kind === "sheet") {
      const panels = parts.map((p) => {
        const s = partShape(p, mat);
        return { w: s.length, h: s.section[1], name: p.name, partId: p.id };
      });
      const { sheets, tooBig } = packSheets(panels, mat.stockLength, mat.stockWidth, ws.kerf);
      const qty = sheets.length + tooBig.length;
      out.push({
        material: mat, qty, unitLabel: `skivor ${mat.stockLength}×${mat.stockWidth}`, cost: mat.price != null ? qty * mat.price : null, sheets,
      });
    } else {
      const area = parts.reduce((s, p) => {
        const sh = partShape(p, mat);
        return s + sh.length * sh.section[1];
      }, 0);
      // Nät: räkna löpmeter rulle (med 10 % spill)
      const runLen = (area / mat.stockWidth) * 1.1;
      const rolls = Math.max(1, Math.ceil(runLen / mat.stockLength));
      out.push({
        material: mat, qty: rolls, unitLabel: `rulle ${mat.stockWidth / 1000}×${mat.stockLength / 1000} m`,
        cost: mat.price != null ? rolls * mat.price : null, meshArea: area / 1e6, totalLength: runLen,
      });
    }
  }
  return out;
}

// ---------- Verktygs- och materialkontroll ----------

export function checkDesign(design: Design, ws: Workshop): Warning[] {
  const w: Warning[] = [];
  const has = (id: string) => hasTool(ws, id);
  const anySaw = ["handsag", "kapgersag", "bordssag", "cirkelsag", "sticksag"].some(has);
  const byMsg = new Map<string, Warning>();
  const add = (level: Level, text: string, partId?: string) => {
    const k = level + text;
    let x = byMsg.get(k);
    if (!x) {
      x = { level, text, partIds: [] };
      byMsg.set(k, x);
      w.push(x);
    }
    if (partId) x.partIds.push(partId);
  };

  if (!anySaw) add("error", "Du har ingen såg markerad – inget kan kapas.");

  for (const p of design.parts) {
    const mat = ws.materials.find((m) => m.id === p.materialId);
    if (!mat) {
      add("error", `Okänt material "${p.materialId}".`, p.id);
      continue;
    }
    if (!mat.available) add("warn", `${mat.name} är inte markerat som tillgängligt – behöver köpas in.`, p.id);
    const s = partShape(p, mat);

    if (mat.kind === "linear") {
      if (s.section[0] > mat.a + TOL || s.section[1] > mat.b + TOL)
        add("error", `Delen är grövre än ${mat.name} (${s.section.join("×")} mm) – måste limmas ihop av flera bitar.`, p.id);
      if (s.length > mat.stockLength)
        add("error", `Längre än säljlängden ${mat.stockLength} mm för ${mat.name} – måste skarvas.`, p.id);
      if (s.rip) {
        if (has("bordssag")) add("info", `Klyvs på bordssågen till ${s.section.join("×")} mm.`, p.id);
        else if (has("cirkelsag")) add("warn", `Klyvning till ${s.section.join("×")} mm med cirkelsåg – använd parallellanslag.`, p.id);
        else if (has("handsag")) add("warn", `Klyvning till ${s.section.join("×")} mm med handsåg är tungt och blir lätt snett.`, p.id);
        else add("error", `Delen måste klyvas (${s.section.join("×")} mm) men du saknar lämplig såg.`, p.id);
      }
      if (s.angled) {
        if (has("kapgersag")) add("info", "Vinkelkap görs enkelt på kap- & gersågen.", p.id);
        else if (has("bordssag")) add("info", "Vinkelkap: använd geringsanslaget på bordssågen.", p.id);
        else if (has("handsag")) add("warn", "Vinkelkap med handsåg – använd en geringslåda eller rita noga med vinkelhake.", p.id);
        else add("error", "Delen har vinkelkap men du saknar lämplig såg.", p.id);
      }
      if (s.section[1] > 300 && !has("bordssag") && !has("handsag") && !has("cirkelsag"))
        add("warn", "Bred del – kan vara för bred för kap- & gersågen.", p.id);
    } else if (mat.kind === "sheet") {
      if (s.length > mat.stockLength || s.section[1] > mat.stockWidth)
        add("error", `Skivdelen är större än en hel skiva (${mat.stockLength}×${mat.stockWidth}).`, p.id);
      if (has("bordssag") || has("cirkelsag")) {
        // ok
      } else if (has("sticksag")) add("warn", "Skivor sågas med sticksåg – spänn fast en rak ribba som anslag.", p.id);
      else if (has("handsag")) add("warn", "Skivor sågas med handsåg – går, men tar tid. Be ev. bygghandeln kapa.", p.id);
      else add("error", "Skivor behöver sågas men du saknar lämplig såg.", p.id);
    } else if (mat.kind === "mesh") {
      if (!has("avbitare")) add("warn", "Nät klipps enklast med avbitare/plåtsax.", p.id);
    }
  }

  if (design.parts.length && !has("skruvdragare") && !has("borrmaskin"))
    add("warn", "Ingen skruvdragare – räkna med att förborra och skruva för hand, eller spika.");
  if (design.parts.some((p) => ws.materials.find((m) => m.id === p.materialId)?.kind === "mesh") && !has("haftpistol"))
    add("info", "Nät fästs med häftpistol eller U-märlor och hammare.");

  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  return w.sort((a, b) => order[a.level] - order[b.level]);
}

/** Hörnen på en dels låda i världskoordinater (Euler XYZ som i three.js). */
export function corners(p: Part) {
  const r = (d: number) => (d * Math.PI) / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(r(p.rot.x)), Math.sin(r(p.rot.x)), Math.cos(r(p.rot.y)), Math.sin(r(p.rot.y)), Math.cos(r(p.rot.z)), Math.sin(r(p.rot.z))];
  // R = Rx · Ry · Rz
  const m = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
  const out: { x: number; y: number; z: number }[] = [];
  for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) {
    const v = [(i * p.dims.x) / 2, (j * p.dims.y) / 2, (k * p.dims.z) / 2];
    out.push({
      x: p.pos.x + m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      y: p.pos.y + m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      z: p.pos.z + m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    });
  }
  return out;
}

export function bounds(parts: Part[]) {
  if (!parts.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of parts)
    for (const c of corners(p))
      for (const k of ["x", "y", "z"] as const) {
        min[k] = Math.min(min[k], c[k]);
        max[k] = Math.max(max[k], c[k]);
      }
  return { min, max };
}
