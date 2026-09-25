import type { Design, Workshop } from "../types";
import { shelf } from "./shelf";
import { catio } from "./catio";
import { bench, raisedBed, workbench } from "./furniture";
import { dresser, penHolder } from "./cabinet";
import { sheetShelf } from "./sheetShelf";
import { birdHouse, catLitterBench, chest, coffeeTable, deck, sandbox, shoeRack, woodShed } from "./more";

export interface ParamDef {
  key: string;
  label: string;
  type: "number" | "bool";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default: number | boolean;
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  /** Nyckelord (regex) som känner igen mallen i fritext */
  match: RegExp;
  /** Högre prioritet vinner över mallar som matchar tidigare i texten (för mer specifika mallar) */
  priority?: number;
  example: string;
  params: ParamDef[];
  build: (ws: Workshop, p: Design["params"], prompt: string) => Design;
}

const mm = (key: string, label: string, def: number, min: number, max: number, step = 10): ParamDef => ({
  key, label, type: "number", min, max, step, unit: "mm", default: def,
});

export const TEMPLATES: Template[] = [
  {
    id: "shelf", name: "Hyllsystem mot vägg", icon: "📚",
    match: /hyll|bokhyll|förvaringssystem|väggförvaring/i,
    example: "Bygg ett hyllsystem mot en vägg som är 2,5 meter bred och 3 meter hög",
    params: [mm("width", "Bredd", 2500, 400, 6000), mm("height", "Höjd", 2400, 400, 4000), mm("depth", "Djup", 300, 150, 700),
      { key: "shelves", label: "Hyllplan per fack", type: "number", min: 1, max: 12, step: 1, default: 6 }],
    build: shelf,
  },
  {
    id: "sheetShelf", name: "Hyllsystem av spånskivor", icon: "🗃️",
    match: /spånskiv|spånplatt|skivhyll|hyll\S* av skivor|stegehyll/i,
    priority: 1,
    example: "Bygg ett hyllsystem av spånskivor 18 mm, 2,5 m brett och 2,5 m högt",
    params: [mm("width", "Bredd", 2500, 400, 6000), mm("height", "Höjd", 2500, 400, 3000), mm("depth", "Djup", 500, 150, 600),
      { key: "shelves", label: "Hyllplan per fack (inkl. topp & botten)", type: "number", min: 2, max: 12, step: 1, default: 6 },
      mm("maxSpan", "Max fackbredd", 800, 300, 1200),
      { key: "fullBoards", label: "Stegehylla: hela skivor genom stegar av reglar", type: "bool", default: false },
      { key: "studFrame", label: "Gavlar av reglar 45×45 med bärlister", type: "bool", default: false },
      { key: "adjustable", label: "Ställbara hyllor (borrade hålrader, bara skivgavlar)", type: "bool", default: true }],
    build: sheetShelf,
  },
  {
    id: "catio", name: "Katt-patio", icon: "🐈",
    match: /katt|catio|kattgård|kattbur|kattvoljär/i,
    example: "Bygg en katt-patio mot husväggen, 2 m bred, 1,2 m djup",
    params: [mm("width", "Bredd", 2000, 900, 5000), mm("depth", "Djup", 1200, 600, 3000), mm("height", "Höjd", 2000, 1200, 2600),
      { key: "againstWall", label: "Mot husvägg", type: "bool", default: true },
      { key: "door", label: "Dörr", type: "bool", default: true },
      { key: "shelves", label: "Katthyllor", type: "number", min: 0, max: 8, step: 1, default: 3 }],
    build: catio,
  },
  {
    id: "workbench", name: "Arbetsbänk", icon: "🛠️",
    match: /arbetsbänk|hyvelbänk|snickarbänk|verkstadsbänk|arbetsbord/i,
    example: "Bygg en arbetsbänk 1,6 m lång med hylla under",
    params: [mm("width", "Längd", 1600, 600, 3000), mm("depth", "Djup", 700, 400, 1000), mm("height", "Höjd", 900, 600, 1100),
      { key: "lowerShelf", label: "Hylla under", type: "bool", default: true }],
    build: workbench,
  },
  {
    id: "dresser", name: "Byrå med lådor", icon: "🗄️",
    match: /byrå|lådhurts|hurts|kommod|lådor/i,
    example: "Bygg en byrå med 4 lådor, 80 cm bred och 90 cm hög",
    params: [mm("width", "Bredd", 800, 300, 1600), mm("depth", "Djup", 450, 250, 650), mm("height", "Höjd", 900, 300, 1500),
      { key: "drawers", label: "Antal lådor", type: "number", min: 1, max: 8, step: 1, default: 4 }],
    build: dresser,
  },
  {
    id: "penHolder", name: "Pennställ med låda", icon: "✏️",
    match: /penn|skrivbordsställ|skrivbordsorganiser/i,
    example: "Bygg ett pennställ med en låda",
    params: [mm("width", "Bredd", 220, 100, 500, 5), mm("depth", "Djup", 140, 80, 300, 5), mm("height", "Höjd", 160, 80, 350, 5),
      { key: "divider", label: "Mellanvägg i facket", type: "bool", default: true }],
    build: penHolder,
  },
  {
    id: "raisedBed", name: "Odlingslåda", icon: "🌱",
    match: /odling|pallkrage|planteringslåda|blomlåda|växtlåda/i,
    example: "Bygg en odlingslåda 1,2 × 0,8 m",
    params: [mm("width", "Längd", 1200, 400, 3000), mm("depth", "Bredd", 800, 300, 1500), mm("height", "Höjd", 400, 100, 900)],
    build: raisedBed,
  },
  {
    id: "birdHouse", name: "Fågelholk", icon: "🐦",
    match: /fågelholk|fågelhus|fågelbo|holk/i,
    example: "Bygg en fågelholk för talgoxe med 32 mm hål",
    params: [mm("floor", "Bottenmått (invändigt)", 120, 90, 200, 5), mm("height", "Höjd fram", 220, 150, 350, 5), mm("hole", "Ingångshål Ø", 32, 25, 60, 1)],
    build: birdHouse,
  },
  {
    id: "woodShed", name: "Vedförråd", icon: "🪵",
    match: /vedförråd|vedskjul|vedbod|vedstapel|vedhylla|vedställ|vedtak/i,
    priority: 1,
    example: "Bygg ett vedförråd 2 m brett och 80 cm djupt",
    params: [mm("width", "Bredd", 2000, 800, 4000), mm("depth", "Djup", 800, 400, 1500), mm("height", "Höjd fram", 1900, 1000, 2400)],
    build: woodShed,
  },
  {
    id: "sandbox", name: "Sandlåda", icon: "🏖️",
    match: /sandlåda|sandlåd/i,
    priority: 1,
    example: "Bygg en sandlåda 1,5 × 1,5 m med sittkant",
    params: [mm("width", "Bredd", 1500, 800, 3000), mm("depth", "Djup", 1500, 800, 3000), mm("height", "Höjd", 290, 140, 500, 5)],
    build: sandbox,
  },
  {
    id: "shoeRack", name: "Skohylla", icon: "👟",
    match: /skohyll|skoställ|skoförvaring|skobänk/i,
    priority: 1,
    example: "Bygg en skohylla 80 cm bred med 3 nivåer",
    params: [mm("width", "Bredd", 800, 400, 1600), mm("depth", "Djup", 300, 200, 400), mm("height", "Höjd", 600, 300, 1200),
      { key: "levels", label: "Nivåer", type: "number", min: 1, max: 6, step: 1, default: 3 }],
    build: shoeRack,
  },
  {
    id: "chest", name: "Förvaringskista", icon: "🧰",
    match: /kista|förvaringslåda|leksakslåda|dynbox|dynlåda|förvaringsbox/i,
    priority: 1,
    example: "Bygg en förvaringskista med lock, 90 cm bred",
    params: [mm("width", "Bredd", 900, 400, 1800), mm("depth", "Djup", 450, 300, 800), mm("height", "Höjd", 450, 250, 800)],
    build: chest,
  },
  {
    id: "deck", name: "Trädäck / altan", icon: "🏡",
    match: /trädäck|altan|terrass|uteplats|trall(?:däck|golv)/i,
    example: "Bygg ett trädäck 3 x 2 m, 40 cm högt",
    params: [mm("width", "Bredd", 3000, 1000, 8000, 50), mm("depth", "Djup", 2000, 800, 5000, 50), mm("height", "Höjd", 300, 150, 1200, 10)],
    build: deck,
  },
  {
    id: "coffeeTable", name: "Soffbord", icon: "☕",
    match: /soffbord|sidobord|kaffebord|vardagsrumsbord/i,
    priority: 1,
    example: "Bygg ett soffbord 110 × 60 cm med hylla under",
    params: [mm("width", "Längd", 1100, 400, 2000), mm("depth", "Bredd", 600, 300, 1000), mm("height", "Höjd", 450, 300, 700),
      { key: "lowerShelf", label: "Hylla under", type: "bool", default: true }],
    build: coffeeTable,
  },
  {
    id: "catLitterBench", name: "Sittbänk med kattlåda", icon: "🐾",
    match: /kattlåd|kattoalett|kattsand|kattlådebänk/i,
    priority: 2,
    example: "Bygg en sittbänk med box för kattlåda, 1 m lång",
    params: [mm("width", "Längd", 1000, 600, 2000), mm("depth", "Djup", 500, 380, 700), mm("height", "Sitthöjd", 480, 380, 600),
      mm("litterW", "Kattlådans längd", 500, 300, 700), mm("litterD", "Kattlådans bredd", 400, 250, 550),
      { key: "entranceLeft", label: "Ingång i vänster gavel (annars höger)", type: "bool", default: false },
      { key: "divider", label: "Förvaringsfack bredvid", type: "bool", default: true }],
    build: catLitterBench,
  },
  {
    id: "bench", name: "Sittbänk", icon: "🪑",
    match: /sittbänk|bänk|parkbänk|hallbänk/i,
    example: "Bygg en sittbänk som är 1,4 m lång",
    params: [mm("width", "Längd", 1400, 500, 3000), mm("depth", "Djup", 350, 250, 600), mm("height", "Höjd", 450, 300, 700)],
    build: bench,
  },
];

export function templateById(id: string | null) {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function defaultParams(t: Template): Design["params"] {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}

export function emptyDesign(prompt = ""): Design {
  return { title: "Nytt projekt", prompt, templateId: null, params: {}, parts: [], steps: [], hardware: [], notes: [], wall: null };
}
