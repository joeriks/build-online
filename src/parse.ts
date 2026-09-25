import { TEMPLATES, type Template } from "./generators";

const WORDS: Record<string, number> = {
  en: 1, ett: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, nio: 9, tio: 10, elva: 11, tolv: 12,
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(mm|millimeter|cm|centimeter|dm|decimeter|m|meter)?`;

type DimKey = "width" | "height" | "depth" | "length";
const DIM_WORDS: [RegExp, DimKey][] = [
  [/^(bred|bredd|brett|breda)/, "width"],
  [/^(hög|höjd|högt|höga)/, "height"],
  [/^(djup|djupt|djupa)/, "depth"],
  [/^(lång|längd|långt|långa)/, "length"],
];

/** Tolka ett tal med enhet till millimeter. Utan enhet gissas enheten från storleken. */
export function toMm(num: string, unit?: string): number {
  const v = parseFloat(num.replace(",", "."));
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("mm") || u.startsWith("milli")) return v;
  if (u.startsWith("cm") || u.startsWith("centi")) return v * 10;
  if (u.startsWith("dm") || u.startsWith("deci")) return v * 100;
  if (u === "m" || u.startsWith("meter")) return v * 1000;
  // ingen enhet: små tal = meter, mellanstora = cm, stora = mm
  if (v <= 10) return v * 1000;
  if (v <= 300) return v * 10;
  return v;
}

function dimKey(word: string): DimKey | null {
  for (const [re, k] of DIM_WORDS) if (re.test(word)) return k;
  return null;
}

export interface Parsed {
  template: Template | null;
  dims: Partial<Record<DimKey, number>>;
  count: number | null;
  againstWall: boolean | null;
  door: boolean | null;
}

export function parsePrompt(text: string): Parsed {
  const s = text.toLowerCase().replace(/\s+/g, " ");
  // Mall: den vars nyckelord förekommer tidigast i texten
  let template: Template | null = null;
  let best = Infinity;
  for (const t of TEMPLATES) {
    const m = t.match.exec(s);
    if (m && m.index < best) {
      best = m.index;
      template = t;
    }
  }

  const dims: Parsed["dims"] = {};
  // "2,5 meter bred", "30 cm djup"
  const after = new RegExp(`${NUM}\\s*${UNIT}\\s+(?:och\\s+)?(\\p{L}+)`, "gu");
  for (const m of s.matchAll(after)) {
    const k = dimKey(m[3]);
    if (k && dims[k] == null) dims[k] = toMm(m[1], m[2]);
  }
  // "bredd 2,5 m", "höjden på 3 meter", "djup: 30 cm"
  const before = new RegExp(`(\\p{L}+)\\s*(?:på|:|=|om)?\\s*${NUM}\\s*${UNIT}(?![\\p{L}])`, "gu");
  for (const m of s.matchAll(before)) {
    const k = dimKey(m[1]);
    if (k && dims[k] == null) dims[k] = toMm(m[2], m[3]);
  }
  // "2 x 1,2 x 2 m"
  const box = new RegExp(`${NUM}\\s*[x×*]\\s*${NUM}(?:\\s*[x×*]\\s*${NUM})?\\s*${UNIT}`, "u").exec(s);
  if (box) {
    const u = box[4];
    const vals = [box[1], box[2], box[3]].filter(Boolean).map((v) => toMm(v!, u));
    if (template?.id === "shelf") {
      dims.width ??= vals[0];
      dims.height ??= vals[1];
      if (vals[2]) dims.depth ??= vals[2];
    } else {
      dims.width ??= vals[0];
      dims.depth ??= vals[1];
      if (vals[2]) dims.height ??= vals[2];
    }
  }

  // Antal: "5 hyllor", "fyra lådor", "3 hyllplan"
  let count: number | null = null;
  const cnt = /(\d+|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)\s+(hyllor|hyllplan|plan|lådor|låda|katthyllor)/u.exec(s);
  if (cnt) count = /\d/.test(cnt[1]) ? parseInt(cnt[1]) : WORDS[cnt[1]];

  let againstWall: boolean | null = null;
  if (/mot (?:en |ett )?(?:hus)?vägg|mot huset|mot fasaden/.test(s)) againstWall = true;
  if (/fristående|mitt på/.test(s)) againstWall = false;
  let door: boolean | null = null;
  if (/utan dörr/.test(s)) door = false;
  else if (/dörr/.test(s)) door = true;

  return { template, dims, count, againstWall, door };
}

/** Översätt tolkningen till mallens parametrar. */
export function paramsFromParsed(t: Template, parsed: Parsed): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const p of t.params) out[p.key] = p.default;
  const d = parsed.dims;
  const set = (key: string, v: number | undefined) => {
    const def = t.params.find((p) => p.key === key);
    if (v == null || !def) return;
    out[key] = Math.min(def.max ?? v, Math.max(def.min ?? v, Math.round(v)));
  };
  set("width", d.width ?? d.length);
  set("height", d.height);
  set("depth", d.depth);
  if (parsed.count != null) {
    const key = t.params.find((p) => ["shelves", "drawers"].includes(p.key))?.key;
    if (key) set(key, parsed.count);
  }
  if (parsed.againstWall != null && "againstWall" in out) out.againstWall = parsed.againstWall;
  if (parsed.door != null && "door" in out) out.door = parsed.door;
  // Hyllsystem: fler hyllplan om det är högt och antal inte angetts
  if (t.id === "shelf" && parsed.count == null) out.shelves = Math.max(2, Math.round(+out.height / 380));
  return out;
}
