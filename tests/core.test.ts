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
    for (const t of TEMPLATES) {
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
