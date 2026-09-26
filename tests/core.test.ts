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
    // Spånskivehyllan är av skivor och trädäcket kräver trall och grövre virke
    for (const t of TEMPLATES.filter((x) => !["sheetShelf", "deck"].includes(x.id))) {
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

describe("stegehylla med hela skivor", () => {
  const t = () => TEMPLATES.find((x) => x.id === "sheetShelf")!;
  it("hyllplanen är osågade 2500×500-skivor och stolparna står utanför", () => {
    const text = "stegehylla av spånskivor och reglar 45x45, 2,5 m bred och 3 m hög";
    const parsed = parsePrompt(text);
    expect(parsed.template?.id).toBe("sheetShelf");
    const params = paramsFromParsed(t(), parsed);
    expect(params.fullBoards).toBe(true);
    const ws = defaultWorkshop();
    const d = t().build(ws, params, text);
    const shelves = d.parts.filter((p) => p.materialId === "spanskiva-18");
    expect(shelves.length).toBe(+params.shelves);
    expect(shelves.every((p) => p.dims.x === 2500 && p.dims.z === 500)).toBe(true);
    expect(purchases(d, ws).find((p) => p.material.id === "spanskiva-18")!.qty).toBe(+params.shelves);
    expect(checkDesign(d, ws).filter((w) => w.level === "error")).toEqual([]);
    // inga hyllplan krockar med stolparna i djupled
    const posts = d.parts.filter((p) => p.name.startsWith("Stolpe"));
    for (const s of shelves)
      for (const p of posts) expect(Math.abs(s.pos.z - p.pos.z)).toBeGreaterThanOrEqual((s.dims.z + p.dims.z) / 2);
  });
  it("bredare än en skiva skarvas över en stege", () => {
    const ws = defaultWorkshop();
    const d = t().build(ws, { width: 4000, height: 2000, depth: 500, shelves: 4, maxSpan: 800, fullBoards: true, studFrame: false, adjustable: false }, "");
    const lvl1 = d.parts.filter((p) => p.unit === "Hyllplan 1");
    expect(lvl1.length).toBe(2);
    expect(lvl1.every((p) => p.dims.x <= 2500)).toBe(true);
    expect(checkDesign(d, ws).filter((w) => w.level === "error")).toEqual([]);
  });
});

describe("nya projekt", () => {
  it("känns igen i fritext", () => {
    const cases: [string, string][] = [
      ["bygg en fågelholk för blåmes", "birdHouse"],
      ["vedförråd 2 m brett", "woodShed"],
      ["sandlåda med sittkant", "sandbox"],
      ["skohylla med 4 nivåer", "shoeRack"],
      ["dynbox till altanen", "chest"],
      ["trädäck 3 x 2 m", "deck"],
      ["soffbord med hylla", "coffeeTable"],
      ["sittbänk med box för kattlåda", "catLitterBench"],
      ["katt-patio mot huset", "catio"],
      ["sittbänk 1,4 m", "bench"],
    ];
    for (const [text, id] of cases) expect([text, parsePrompt(text).template?.id]).toEqual([text, id]);
    expect(parsePrompt("fågelholk med 28 mm hål").hole).toBe(28);
    expect(parsePrompt("fågelholk för talgoxe").hole).toBe(32);
  });
  it("kattlådefacket rymmer kattlådan", () => {
    const t = TEMPLATES.find((x) => x.id === "catLitterBench")!;
    const d = t.build(defaultWorkshop(), paramsFromParsed(t, parsePrompt(t.example)), "");
    expect(d.notes.some((n) => n.includes("får knappt plats"))).toBe(false);
    expect(d.parts.filter((p) => p.unit === "Sitslock").length).toBeGreaterThan(1);
  });
});

import { analyzeStrength, matProps } from "../src/strength";
import type { Design, Part } from "../src/types";
describe("hållfasthet", () => {
  const box = (id: string, materialId: string, min: [number, number, number], size: [number, number, number]): Part => ({
    id, name: id, materialId, dims: { x: size[0], y: size[1], z: size[2] },
    pos: { x: min[0] + size[0] / 2, y: min[1] + size[1] / 2, z: min[2] + size[2] / 2 }, rot: { x: 0, y: 0, z: 0 }, endCuts: [0, 0], group: "g",
  });
  const design = (parts: Part[], load: number): Design => ({ title: "t", prompt: "", templateId: null, params: {}, parts, steps: [], hardware: [], notes: [], wall: null, loadKgM2: load });

  it("fritt upplagd bräda ger samma nedböjning som handräkning", () => {
    const ws = defaultWorkshop();
    // Bräda 22×95, 1000 mm, vilar på två reglar 45×45 med 955 mm mellan mitten på stöden
    const parts = [
      box("stod1", "regel-45x45", [0, 0, 0], [45, 400, 45]),
      box("stod2", "regel-45x45", [955, 0, 0], [45, 400, 45]),
      box("brada", "bord-22x95", [0, 400, 0], [1000, 22, 95]),
    ];
    const r = analyzeStrength(design(parts, 100), ws);
    const m = r.members.find((x) => x.id === "brada")!;
    const pr = matProps(ws.materials.find((x) => x.id === "bord-22x95")!)!;
    const L = 977.5; // mitt på stöd 1 (22,5) till mitt på stöd 2 (977,5) … = 955
    const Ls = 955;
    const w = (100 * 9.81 * 95) / 1e6 + (pr.rho * 9.81 * 95 * 22) / 1e9;
    const EI = (pr.E * 95 * 22 ** 3) / 12;
    const expected = ((5 * w * Ls ** 4) / (384 * EI)) * (1 + pr.kdef * 0.3);
    void L;
    expect(m.span).toBe(955);
    expect(m.deflection).toBeCloseTo(expected, 0);
    // dubbla lasten ger ungefär dubbla utnyttjandet
    const r2 = analyzeStrength(design(parts, 200), ws);
    expect(r2.members.find((x) => x.id === "brada")!.uDefl / m.uDefl).toBeGreaterThan(1.8);
  });

  it("konsol (bara ett stöd) räknas som utkragning och infästning kontrolleras", () => {
    const ws = defaultWorkshop();
    const parts = [
      box("stolpe", "regel-45x45", [0, 0, 0], [45, 1000, 45]),
      box("konsol", "regel-45x45", [45, 900, 0], [45, 45, 400]),
    ];
    const r = analyzeStrength(design(parts, 100), ws);
    const k = r.members.find((x) => x.id === "konsol")!;
    expect(k.cantilever).toBeGreaterThan(300);
    expect(k.uConn).toBeGreaterThan(0);
  });

  it("alla mallar bär sina delar – inget svävar fritt", () => {
    for (const t of TEMPLATES) {
      const ws = defaultWorkshop();
      const d = t.build(ws, paramsFromParsed(t, parsePrompt(t.example)), t.example);
      expect([t.id, analyzeStrength(d, ws).unsupported]).toEqual([t.id, []]);
    }
  });

  it("trädäcket räknar trall, reglar och bärlinor och pinnar i stegehyllan får last", () => {
    const ws = defaultWorkshop();
    const deck = TEMPLATES.find((x) => x.id === "deck")!;
    const r = analyzeStrength(deck.build(ws, paramsFromParsed(deck, parsePrompt(deck.example)), ""), ws);
    for (const name of ["Trall", "Regel", "Bärlina"]) expect([name, r.members.some((m) => m.name.startsWith(name))]).toEqual([name, true]);
    const shelf = TEMPLATES.find((x) => x.id === "sheetShelf")!;
    const d = shelf.build(ws, { width: 2500, height: 2500, depth: 500, shelves: 6, maxSpan: 800, fullBoards: true }, "");
    const pin = analyzeStrength(d, ws).members.find((m) => m.name.startsWith("Pinne"))!;
    expect(pin.util).toBeGreaterThan(0.02);
  });

  it("hyllplan mellan två gavlar räknas även när facket är smalare än djupet", () => {
    const t = TEMPLATES.find((x) => x.id === "sheetShelf")!;
    const ws = defaultWorkshop();
    const d = t.build(ws, { width: 2500, height: 2500, depth: 500, shelves: 6, maxSpan: 450, adjustable: false }, "");
    const r = analyzeStrength(d, ws);
    const shelf = r.members.find((m) => m.name.startsWith("Hyllplan 2 fack 1"))!;
    expect(shelf).toBeTruthy();
    expect(shelf.span).toBeGreaterThan(350);
    expect(shelf.span).toBeLessThan(460);
  });

  it("stegehyllan med hela skivor klarar mer än skivgavlar med samma fackbredd", () => {
    const t = TEMPLATES.find((x) => x.id === "sheetShelf")!;
    const ws = defaultWorkshop();
    const base = { width: 2500, height: 2500, depth: 500, shelves: 6, maxSpan: 800, adjustable: false, studFrame: false };
    const worst = (extra: object) => analyzeStrength(t.build(ws, { ...base, ...extra }, ""), ws).worst!.util;
    expect(worst({ fullBoards: true })).toBeLessThan(worst({ fullBoards: false }));
  });
});

import { autoReinforce, suggestFor } from "../src/reinforce";
describe("förstärkning", () => {
  const group = (list: ReturnType<typeof analyzeStrength>["members"]) => {
    const m = new Map<string, typeof list>();
    for (const x of list) {
      const k = [x.kind, x.span, x.deflection, Math.round(x.util * 100)].join("|");
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...m.values()];
  };
  it("föreslår åtgärder som sänker utnyttjandet och räknar kostnad", () => {
    const t = TEMPLATES.find((x) => x.id === "sheetShelf")!;
    const ws = defaultWorkshop();
    const d = t.build(ws, paramsFromParsed(t, parsePrompt(t.example)), "");
    const r = analyzeStrength(d, ws);
    const g = group(r.members.filter((m) => m.util > 1))[0];
    const ss = suggestFor(d, ws, r, g);
    expect(ss.length).toBeGreaterThan(1);
    expect(ss.every((s) => s.after < s.before)).toBe(true);
    const list = ss.find((s) => s.key === "list-front")!;
    expect(list.after).toBeLessThan(1);
    expect(list.partsDelta).toBe(g.length);
    // originalet är orört
    expect(analyzeStrength(d, ws).worst!.util).toBeCloseTo(r.worst!.util, 5);
  });
  it("förstärk automatiskt ger en konstruktion som håller", () => {
    for (const [id, load] of [["sheetShelf", 100], ["shoeRack", 150], ["catLitterBench", 400]] as const) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const ws = defaultWorkshop();
      const d = t.build(ws, paramsFromParsed(t, parsePrompt(t.example)), "");
      d.loadKgM2 = load;
      const res = autoReinforce(d, ws, group);
      expect([id, res.applied.length > 0]).toEqual([id, true]);
      expect([id, analyzeStrength(res.design, ws).worst!.util <= 1]).toEqual([id, true]);
    }
  });
  it("starkare infästning höjer bärförmågan", () => {
    const ws = defaultWorkshop();
    const box = (id: string, min: [number, number, number], size: [number, number, number]): Part => ({
      id, name: id, materialId: "regel-45x45", dims: { x: size[0], y: size[1], z: size[2] },
      pos: { x: min[0] + size[0] / 2, y: min[1] + size[1] / 2, z: min[2] + size[2] / 2 }, rot: { x: 0, y: 0, z: 0 }, endCuts: [0, 0], group: "g",
    });
    const d: Design = { title: "t", prompt: "", templateId: null, params: {}, steps: [], hardware: [], notes: [], wall: null, loadKgM2: 100,
      parts: [box("stolpe", [0, 0, 0], [45, 1000, 45]), box("konsol", [45, 900, 0], [45, 45, 400])] };
    const u2 = analyzeStrength(d, ws).members.find((m) => m.id === "konsol")!.uConn;
    d.parts[1].fastening = "vinkel";
    const uV = analyzeStrength(d, ws).members.find((m) => m.id === "konsol")!.uConn;
    expect(uV).toBeLessThan(u2);
  });
});

import { effectiveFinish, finishSummary } from "../src/finish";
describe("ytbehandling", () => {
  const build = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    const ws = defaultWorkshop();
    return { ws, d: t.build(ws, paramsFromParsed(t, parsePrompt(t.example)), "") };
  };
  it("del → grupp → helhet", () => {
    const { d } = build("bench");
    d.finishes = { "*": { coating: "olja", sand: 120 }, "g:sits": { edge: "rundad", edgeSize: 6 } };
    const seat = d.parts.find((p) => p.group === "sits")!;
    const leg = d.parts.find((p) => p.group === "ben")!;
    expect(effectiveFinish(d, seat)).toMatchObject({ coating: "olja", sand: 120, edge: "rundad", edgeSize: 6 });
    expect(effectiveFinish(d, leg)).toMatchObject({ coating: "olja", edge: "rak" });
    leg.finish = { coating: "farg", color: "#2b2b2b" };
    expect(effectiveFinish(d, leg).coating).toBe("farg");
  });
  it("räknar åtgång, tid och byggsteg", () => {
    const { d, ws } = build("coffeeTable");
    d.finishes = { "*": { coating: "farg", color: "#f4f2ec", sand: 120, edge: "fas", edgeSize: 3 } };
    const s = finishSummary(d, ws);
    expect(s.items.some((i) => i.name.startsWith("Färg") && i.unit === "l")).toBe(true);
    expect(s.items.some((i) => i.name === "Grundfärg")).toBe(true);
    expect(s.items.some((i) => i.name === "Sandpapper korn 80")).toBe(true);
    expect(s.hours).toBeGreaterThan(0);
    expect(s.steps.map((x) => x.title)).toEqual(expect.arrayContaining(["Kanter", "Slipning", "Färg"]));
  });
  it("varnar för lack utomhus och profilfräsning utan överfräs", () => {
    const { d, ws } = build("deck");
    d.finishes = { "*": { coating: "lack", edge: "profil", edgeSize: 6 } };
    const w = finishSummary(d, ws).warnings.map((x) => x.text).join(" ");
    expect(w).toMatch(/passar inte utomhus/);
    expect(w).toMatch(/överfräs/);
  });
  it("kantbearbetning syns i kapningslistan", () => {
    const { d, ws } = build("bench");
    d.finishes = { "g:sits": { edge: "rundad", edgeSize: 6 } };
    expect(cutList(d, ws).some((r) => r.edge === "rundad 6")).toBe(true);
  });
});

describe("lådor med olika hörnfogar", () => {
  const ws = () => defaultWorkshop();
  it("känns igen och byggs med rätt fog", () => {
    expect(parsePrompt("låda med fingerskarvar 40 x 30 cm").template?.id).toBe("boxFinger");
    expect(parsePrompt("en geringslåda med kilar").template?.id).toBe("boxMiter");
    expect(parsePrompt("enkel låda med stumfog").template?.id).toBe("boxButt");
  });
  it("väggarnas längder följer fogen", () => {
    for (const id of ["boxButt", "boxFinger", "boxMiter"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const w = ws();
      const d = t.build(w, { ...paramsFromParsed(t, parsePrompt(t.example)), width: 400, depth: 300, height: 150 }, "");
      const gavel = d.parts.find((p) => p.name === "Gavel V")!;
      const thick = Math.min(gavel.dims.x, gavel.dims.z);
      const len = Math.max(gavel.dims.x, gavel.dims.z);
      if (id === "boxButt") expect(len).toBeCloseTo(300 - 2 * thick, 0);
      else expect(len).toBe(300);
      if (id === "boxFinger") {
        expect(gavel.joint?.type).toBe("finger");
        expect((gavel.joint as { count: number }).count % 2).toBe(1);
      }
      if (id === "boxMiter") {
        expect(gavel.endCuts).toEqual([45, 45]);
        expect(d.parts.some((p) => p.name.startsWith("Kil"))).toBe(true);
      }
      expect(d.steps.length).toBeGreaterThanOrEqual(6);
      expect(d.diagrams?.length).toBeGreaterThan(0);
      expect(checkDesign(d, w).filter((x) => x.level === "error")).toEqual([]);
    }
  });
  it("botten i spår kräver bordssåg eller överfräs", () => {
    const t = TEMPLATES.find((x) => x.id === "boxMiter")!;
    const w = ws();
    w.tools.forEach((x) => (x.available = ["handsag", "kapgersag"].includes(x.id)));
    const d = t.build(w, { ...paramsFromParsed(t, parsePrompt(t.example)), bottom: "spar" }, "");
    expect(d.parts.some((p) => p.name.includes("på lister"))).toBe(true);
    expect(d.notes.some((n) => n.includes("Spår för botten kräver"))).toBe(true);
  });
});
