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
  /** Texten nämner reglar */
  studs: boolean;
  /** Texten vill ha hela skivor som hyllplan genom stegar */
  fullBoards: boolean;
  /** Fågelholkens ingångshål (mm) */
  hole: number | null;
  /** Lådans hörnfog */
  joinery: "stumfog" | "finger" | "gering" | null;
}

const MAT_NOUN = String.raw`(?:spånskiv|spånplatt|skiv|bräd|regl|regel|läkt|plank|virke|plywood|osb|trall)\p{L}*`;
// "50 cm breda och 2,5 m långa spånskivor", "18 mm tjocka skivor"
const MAT_DESC_BEFORE = new RegExp(String.raw`(?:${NUM}\s*${UNIT}\s*(?:breda|långa|tjocka|höga|djupa)\s*(?:,|och)?\s*)+${MAT_NOUN}`, "gu");
// "reglar 45x45 mm", "spånskivor 18 mm", "plywood 12 mm"
// (bara tvärsnitt "45x45" eller tjocklek i mm – "spånskivor 2,5 m brett" ska vara kvar)
const MAT_DESC_AFTER = new RegExp(String.raw`${MAT_NOUN}\s*(?:på|om|i)?\s*(?:${NUM}(?:\s*[x×*]\s*${NUM})+\s*(?:mm)?|${NUM}\s*mm)(?!\s*(?:bred|hög|djup|lång))`, "gu");
// "45x45 mm reglar"
const MAT_SIZE_BEFORE = new RegExp(String.raw`${NUM}(?:\s*[x×*]\s*${NUM})+\s*${UNIT}\s*${MAT_NOUN}`, "gu");

export function parsePrompt(text: string): Parsed {
  const raw = text.toLowerCase().replace(/\s+/g, " ");
  // Mått som beskriver materialet ska inte tolkas som konstruktionens mått
  const s = raw.replace(MAT_DESC_BEFORE, " ").replace(MAT_SIZE_BEFORE, " ").replace(MAT_DESC_AFTER, " ");
  // Mall: högst prioritet, därefter den vars nyckelord förekommer tidigast i texten
  let template: Template | null = null;
  let best = { prio: -Infinity, index: Infinity };
  for (const t of TEMPLATES) {
    const m = t.match.exec(raw);
    if (!m) continue;
    const prio = t.priority ?? 0;
    if (prio > best.prio || (prio === best.prio && m.index < best.index)) {
      best = { prio, index: m.index };
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

  const studs = /regel|reglar|regelvirke|45\s*[x×]\s*45/.test(raw);

  // Fågelholk: "32 mm hål", "hål på 28 mm", eller fågelart
  let hole: number | null = null;
  const h1 = /(\d+)\s*mm\s*(?:stort\s*)?(?:ingångs|flyg|in)?hål/.exec(raw) ?? /hål\S*\s*(?:på|om|:)?\s*(?:ø\s*)?(\d+)\s*mm/.exec(raw);
  if (h1) hole = parseInt(h1[1]);
  else if (/blåmes|entita|tofsmes/.test(raw)) hole = 28;
  else if (/talgoxe|flugsnappare|pilfink|gråsparv/.test(raw)) hole = 32;
  else if (/stare/.test(raw)) hole = 45;

  const fullBoards = /hela skivor|osågade skivor|genomgående hyll|stegehyll|stegar/.test(raw);

  // Lådor: vilken hörnfog
  const joinery = /fingerskarv|fingertapp|fingerfog|finger/.test(raw) ? "finger" : /gering|kilar/.test(raw) ? "gering" : /stumfog|skruvad|dymling/.test(raw) ? "stumfog" : null;

  return { template, dims, count, againstWall, door, studs, fullBoards, hole, joinery };
}

/** Översätt tolkningen till mallens parametrar. */
export function paramsFromParsed(t: Template, parsed: Parsed): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
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
    const key = t.params.find((p) => ["shelves", "drawers", "levels"].includes(p.key))?.key;
    if (key) set(key, parsed.count);
  }
  if (parsed.againstWall != null && "againstWall" in out) out.againstWall = parsed.againstWall;
  if (parsed.door != null && "door" in out) out.door = parsed.door;
  // "spånskivor och reglar" → gavlar av reglar
  if ("studFrame" in out && parsed.studs) out.studFrame = true;
  // "hela skivor", "genomgående hyllplan", "stegehylla" → hyllplan av hela skivor genom stegar
  if ("fullBoards" in out && parsed.fullBoards) out.fullBoards = true;
  if (parsed.hole != null) set("hole", parsed.hole);
  if (parsed.joinery && "joinery" in out) out.joinery = parsed.joinery;
  // Hyllsystem: fler hyllplan om det är högt och antal inte angetts
  if (t.id === "shelf" && parsed.count == null) out.shelves = Math.max(2, Math.round(+out.height / 380));
  return out;
}
