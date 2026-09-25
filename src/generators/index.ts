import type { Design, Workshop } from "../types";
import { shelf } from "./shelf";
import { catio } from "./catio";
import { bench, raisedBed, workbench } from "./furniture";
import { dresser, penHolder } from "./cabinet";

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
