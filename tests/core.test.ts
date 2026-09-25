import { describe, expect, it } from "vitest";
import { parsePrompt, paramsFromParsed, toMm } from "../src/parse";
import { TEMPLATES } from "../src/generators";
import { defaultWorkshop } from "../src/defaults";
import { checkDesign, cutList, packLinear, purchases } from "../src/analysis";

describe("parsePrompt", () => {
  it("förstår hyllsystem med mått", () => {
    const p = parsePrompt("bygg ett hyllsystem mot en vägg som är 2,5 meter bred och 3 meter hög");
    expect(p.template?.id).toBe("shelf");
    expect(p.dims.width).toBe(2500);
    expect(p.dims.height).toBe(3000);
  });
  it("förstår katt-patio", () => {
    const p = parsePrompt("Bygg en katt-patio mot huset, 2 x 1,2 m, utan dörr");
    expect(p.template?.id).toBe("catio");
    expect(p.dims).toMatchObject({ width: 2000, depth: 1200 });
    expect(p.againstWall).toBe(true);
    expect(p.door).toBe(false);
  });
  it("förstår byrå och pennställ", () => {
    expect(parsePrompt("byrå med lådor").template?.id).toBe("dresser");
    const p = parsePrompt("pennställ med låda, 20 cm bred");
    expect(p.template?.id).toBe("penHolder");
    expect(p.dims.width).toBe(200);
    expect(parsePrompt("en byrå med fyra lådor").count).toBe(4);
  });
  it("arbetsbänk med hylla blir arbetsbänk", () => {
    expect(parsePrompt("arbetsbänk med hylla under").template?.id).toBe("workbench");
  });
  it("enheter", () => {
    expect(toMm("45", "mm")).toBe(45);
    expect(toMm("2,5")).toBe(2500);
    expect(toMm("80")).toBe(800);
  });
});

describe("generatorer", () => {
  for (const t of TEMPLATES) {
    it(`${t.name} bygger giltiga delar`, () => {
      const ws = defaultWorkshop();
      const params = paramsFromParsed(t, parsePrompt(t.example));
      const d = t.build(ws, params, t.example);
      expect(d.parts.length).toBeGreaterThan(3);
      for (const p of d.parts) {
        for (const v of [p.dims.x, p.dims.y, p.dims.z]) expect(v).toBeGreaterThan(0);
        expect(ws.materials.some((m) => m.id === p.materialId)).toBe(true);
      }
      expect(cutList(d, ws).length).toBeGreaterThan(0);
      expect(purchases(d, ws).length).toBeGreaterThan(0);
      const errs = checkDesign(d, ws).filter((w) => w.level === "error");
      expect(errs.map((e) => e.text)).toEqual([]);
    });
  }
  it("fungerar med bara reglar 45×45 och handsåg", () => {
    const ws = defaultWorkshop();
    ws.materials.forEach((m) => (m.available = m.id === "regel-45x45"));
    ws.tools.forEach((t) => (t.available = ["handsag", "skruvdragare"].includes(t.id)));
    // Spånskivehyllan är per definition byggd av skivor
    for (const t of TEMPLATES.filter((x) => x.id !== "sheetShelf")) {
      const d = t.build(ws, paramsFromParsed(t, parsePrompt(t.example)), "");
      expect(d.parts.every((p) => p.materialId === "regel-45x45" || ws.materials.find((m) => m.id === p.materialId)!.kind === "mesh")).toBe(true);
    }
  });
});

describe("packLinear", () => {
  it("packar kapbitar på säljlängder", () => {
    const pieces = [1800, 1800, 1700, 1000, 500].map((l, i) => ({ length: l, name: "x", partId: String(i) }));
    const { bars } = packLinear(pieces, 3600, 3);
    expect(bars.length).toBe(2);
  });
});

import { bounds } from "../src/analysis";
describe("bounds", () => {
  it("snedstöd i katt-patio sticker inte ut utanför ramen", () => {
    const t = TEMPLATES.find((x) => x.id === "catio")!;
    const ws = defaultWorkshop();
    ws.materials.forEach((m) => (m.available = m.kind !== "sheet"));
    const d = t.build(ws, { width: 2400, depth: 1200, height: 2000, againstWall: false, door: true, shelves: 2 }, "");
    const b = bounds(d.parts.filter((p) => ws.materials.find((m) => m.id === p.materialId)!.kind === "linear"));
    expect(b.max.x - b.min.x).toBeLessThan(2410);
    expect(b.max.z - b.min.z).toBeLessThan(1210);
    expect(b.max.y - b.min.y).toBeLessThan(2010);
  });
});

describe("spånskivehylla", () => {
  it("känns igen och byggs av spånskiva 500×2500 utan klyvning", () => {
    const text = "gör ett hyllsystem med spånskivor, 2,5 m brett och 2,5 m högt";
    const parsed = parsePrompt(text);
    expect(parsed.template?.id).toBe("sheetShelf");
    const ws = defaultWorkshop();
    const d = parsed.template!.build(ws, paramsFromParsed(parsed.template!, parsed), text);
    expect(d.parts.every((p) => p.materialId === "spanskiva-18")).toBe(true);
    const buy = purchases(d, ws).find((p) => p.material.id === "spanskiva-18")!;
    // gavlar och hyllplan använder skivans hela bredd – ingen längsgående klyvning
    const panels = buy.sheets!.flatMap((s) => s.placed).filter((r) => /Gavel|hylla|Hyllplan/.test(r.name));
    expect(panels.filter((r) => r.h !== 500).map((r) => r.name)).toEqual([]);
    // 5 gavlar à 2500 + 24 hyllplan ~602 (4 per skiva) + sockel/fästlister
    expect(buy.qty).toBeLessThanOrEqual(13);
    expect(checkDesign(d, ws).filter((w) => w.level === "error")).toEqual([]);
  });
  it("vanligt hyllsystem väljs fortfarande utan skivord", () => {
    expect(parsePrompt("hyllsystem 2,5 m brett").template?.id).toBe("shelf");
  });
  it("arbetsbänkens skiva pusslas inte ihop av 50 cm-remsor", () => {
    const t = TEMPLATES.find((x) => x.id === "workbench")!;
    const d = t.build(defaultWorkshop(), paramsFromParsed(t, parsePrompt(t.example)), "");
    expect(d.parts.some((p) => p.materialId === "spanskiva-18")).toBe(false);
  });
});

describe("materialmått tolkas inte som konstruktionens mått", () => {
  it("50 cm breda och 2,5 m långa spånskivor", () => {
    const p = parsePrompt("gör ett hyllsystem med 50 cm breda och 2,5 m långa spånskivor 18 mm, 2,5 m brett och 2,5 m högt");
    expect(p.template?.id).toBe("sheetShelf");
    expect(p.dims).toEqual({ width: 2500, height: 2500 });
  });
  it("reglar 45x45 mm", () => {
    const p = parsePrompt("bygg en katt-patio av reglar 45x45 mm, 3 m bred");
    expect(p.dims).toEqual({ width: 3000 });
    expect(parsePrompt("katt-patio av 45×45 mm reglar").dims).toEqual({});
  });
  it("mått direkt efter materialet behålls när de beskriver konstruktionen", () => {
    expect(parsePrompt("hyllsystem av spånskivor 2,5 m brett").dims).toEqual({ width: 2500 });
  });
});

describe("spånskiva + reglar 45×45", () => {
  it("stegar av reglar och hyllplan av spånskiva kräver färre skivor", () => {
    const text = "hyllsystem av spånskivor och reglar 45x45 mm, 2,5 m brett och 2,5 m högt";
    const parsed = parsePrompt(text);
    expect(parsed.template?.id).toBe("sheetShelf");
    expect(parsed.dims).toEqual({ width: 2500, height: 2500 });
    const params = paramsFromParsed(parsed.template!, parsed);
    expect(params.studFrame).toBe(true);
    const ws = defaultWorkshop();
    const d = parsed.template!.build(ws, params, text);
    const mats = new Set(d.parts.map((p) => p.materialId));
    expect([...mats].sort()).toEqual(["regel-45x45", "spanskiva-18"]);
    expect(checkDesign(d, ws).filter((w) => w.level === "error")).toEqual([]);
    const sheets = purchases(d, ws).find((p) => p.material.id === "spanskiva-18")!.qty;
    const plain = parsed.template!.build(ws, { ...params, studFrame: false }, text);
    const plainSheets = purchases(plain, ws).find((p) => p.material.id === "spanskiva-18")!.qty;
    expect(sheets).toBeLessThan(plainSheets);
  });
});

describe("enheter (fack, gavlar, lådor)", () => {
  it("spånskivehyllans fack innehåller hyllplan men inte gavlarna", () => {
    const t = TEMPLATES.find((x) => x.id === "sheetShelf")!;
    const ws = defaultWorkshop();
    for (const studFrame of [false, true]) {
      const d = t.build(ws, { ...paramsFromParsed(t, parsePrompt(t.example)), studFrame }, "");
      const fack1 = d.parts.filter((p) => p.unit === "Fack 1");
      expect(fack1.some((p) => /hylla|Hyllplan/.test(p.name))).toBe(true);
      expect(fack1.some((p) => /Gavel|Stolpe/.test(p.name))).toBe(false);
      expect(d.parts.some((p) => p.unit === "Gavel 1")).toBe(true);
    }
  });
  it("byråns lådor är egna enheter med front", () => {
    const t = TEMPLATES.find((x) => x.id === "dresser")!;
    const d = t.build(defaultWorkshop(), paramsFromParsed(t, parsePrompt(t.example)), "");
    const l1 = d.parts.filter((p) => p.unit === "Låda 1").map((p) => p.name);
    expect(l1.some((n) => n.startsWith("Lådfront 1"))).toBe(true);
    expect(l1.some((n) => n.startsWith("Löplist"))).toBe(false);
  });
});
