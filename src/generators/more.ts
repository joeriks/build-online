import type { Design, Material, Workshop } from "../types";
import { Builder, columns, fillSurface, panel, pickBoard, pickFrame, pickPanel, pickSheet } from "./builder";
import { panelThickness } from "./cabinet";

const deg = (rad: number) => (rad * 180) / Math.PI;

/** Material vi föredrar även om det inte är markerat som tillgängligt (det hamnar då på inköpslistan). */
function prefer(ws: Workshop, id: string): Material | undefined {
  return ws.materials.find((m) => m.id === id);
}

/** Liggande brädor längs X med luftspalt (t.ex. väggar på vedförråd). */
function slatsX(b: Builder, name: string, group: string, m: Material, x0: number, z0: number, y0: number, y1: number, len: number, gap: number) {
  const n = Math.max(1, Math.floor((y1 - y0 + gap) / (m.b + gap)));
  for (let i = 0; i < n; i++) b.box(`${name} ${i + 1}`, m, { x: x0, y: y0 + i * (m.b + gap), z: z0 }, { x: len, y: m.b, z: m.a }, group);
  return n;
}
function slatsZ(b: Builder, name: string, group: string, m: Material, x0: number, z0: number, y0: number, y1: number, len: number, gap: number) {
  const n = Math.max(1, Math.floor((y1 - y0 + gap) / (m.b + gap)));
  for (let i = 0; i < n; i++) b.box(`${name} ${i + 1}`, m, { x: x0, y: y0 + i * (m.b + gap), z: z0 }, { x: m.a, y: m.b, z: len }, group);
  return n;
}

// ---------------------------------------------------------------- Fågelholk

export function birdHouse(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const fi = +p.floor, Hf = +p.height, hole = +p.hole;
  const mat = pickPanel(ws, 22);
  const t = panelThickness(b, mat, 18);
  const W = fi + 2 * t, D = fi + 2 * t;
  const Hb = Hf + 40; // baksidan högre – taket lutar framåt
  const ang = Math.atan((Hb - Hf) / D);

  panel(b, "Bakstycke", "låda", mat, { x: t, y: 0, z: 0 }, { x: fi, y: Hb, z: t });
  panel(b, "Framstycke", "låda", mat, { x: t, y: 0, z: D - t }, { x: fi, y: Hf, z: t });
  // Sidorna kapas snett upptill (Hb bak → Hf fram); ritas med medelhöjden så de inte sticker genom taket
  const sideH = (Hb + Hf) / 2;
  b.box("Sida V", mat, { x: 0, y: 0, z: 0 }, { x: t, y: sideH, z: D }, "låda", { endCuts: [Math.round(deg(ang)), 0] });
  b.inUnit("Öppningsbar sida", () => b.box("Sida H (öppningsbar)", mat, { x: W - t, y: 0, z: 0 }, { x: t, y: sideH, z: D }, "låda", { endCuts: [Math.round(deg(ang)), 0] }));
  panel(b, "Botten", "låda", mat, { x: t, y: 0, z: t }, { x: fi, y: t, z: fi });
  // Tak: lutar ned mot framsidan, 50 mm utsprång fram
  const L = Math.hypot(D, Hb - Hf) + 60;
  b.inUnit("Tak", () =>
    b.box("Tak", mat, { x: -15, y: 0, z: 0 }, { x: W + 30, y: t, z: L }, "tak", {
      pos: { x: W / 2, y: (Hb + Hf) / 2 + t / 2, z: D / 2 + 25 },
      rot: { x: Math.round(deg(ang) * 10) / 10, y: 0, z: 0 },
    }),
  );
  const list = pickFrame(ws, "square");
  b.box("Upphängningslist", list, { x: W / 2 - list.a / 2, y: 0, z: -list.b }, { x: list.a, y: Hb + 150, z: list.b }, "upphängning");

  b.hw("Rostfri skruv 4×40", 16);
  b.hw("Spik eller skruv som gångjärn för öppningsbar sida", 2);
  b.step("Kapa", `Kapa delarna. Sidorna kapas snett upptill: ${Hb} mm bak och ${Hf} mm fram.`, []);
  b.step("Borra ingångshålet", `Borra hålet Ø${hole} mm i framstycket, ca ${Math.round(Hf - 50 - hole / 2)} mm över botten. Borra 2–4 dräneringshål Ø6 mm i botten.`, []);
  b.step("Sätt ihop lådan", "Skruva sidorna mot bak- och framstycke och botten. Den ena sidan fästs bara med en skruv upptill på varje kant så den kan vridas upp för rengöring.", ["låda"]);
  b.step("Tak och list", "Skruva taket så att regnvatten rinner framåt, och skruva upphängningslisten på baksidan.", ["tak", "upphängning"]);

  const bird = hole <= 28 ? "blåmes och andra små mesar" : hole <= 32 ? "talgoxe och svartvit flugsnappare" : hole <= 45 ? "stare" : "större fåglar";
  b.note(`Hål Ø${hole} mm passar ${bird}.`);
  b.note("Måla eller olja bara utsidan – obehandlat trä på insidan. Häng holken 2–4 m upp, med hålet mot öst eller syd-öst, före mars.");
  if (!b.has("borrmaskin") && !b.has("skruvdragare")) b.note("Du behöver en borr och en hålsåg för ingångshålet – annars kan hålet sågas med sticksåg.");
  else b.note(`Ingångshålet borras med en hålsåg Ø${hole} mm.`);
  return b.design(`Fågelholk Ø${hole}`, prompt, "birdHouse", p);
}

// ---------------------------------------------------------------- Vedförråd

export function woodShed(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, Hf = +p.height, Hb = Math.max(900, Hf - 250);
  const m = pickFrame(ws, "tall");
  const A = m.a, B = m.b;
  const slat = pickBoard(ws) ?? pickFrame(ws, "square");

  // Stolpar i hörnen (och mitt emellan vid bredd > 1200)
  const xs = columns(W, A, 1500);
  xs.forEach((x, i) => {
    b.post(`Stolpe fram ${i + 1}`, m, { x, y: 0, z: D - B }, Hf - B, "stomme", "z");
    b.post(`Stolpe bak ${i + 1}`, m, { x, y: 0, z: 0 }, Hb - B, "stomme", "z");
  });
  // Golvreglar på stolparnas insida (håller veden från marken)
  const floorY = B;
  b.beamX("Golvregel fram", m, { x: 0, y: 0, z: D - B - A }, W, "golv");
  b.beamX("Golvregel bak", m, { x: 0, y: 0, z: B }, W, "golv");
  if (D > 900) b.beamX("Golvregel mitt", m, { x: 0, y: 0, z: D / 2 - A / 2 }, W, "golv");
  // Golvribbor tvärs över golvreglarna (längs djupet) med luft emellan
  b.unit = "Golv";
  const fb = pickBoard(ws) ?? pickFrame(ws, "square");
  const nFloor = Math.max(1, Math.floor((W + 20) / (fb.b + 20)));
  const fgap = nFloor > 1 ? (W - nFloor * fb.b) / (nFloor - 1) : 0;
  for (let i = 0; i < nFloor; i++)
    b.box(`Golvribba ${i + 1}`, fb, { x: i * (fb.b + fgap), y: floorY, z: B }, { x: fb.b, y: fb.a, z: D - 2 * B }, "golv");
  b.unit = null;

  // Hammarband
  b.beamX("Hammarband fram", m, { x: 0, y: Hf - B, z: D - A }, W, "stomme");
  b.beamX("Hammarband bak", m, { x: 0, y: Hb - B, z: 0 }, W, "stomme");

  // Takstolar (takreglar) som lutar bakåt
  const ov = 200;
  const rise = Hf - Hb;
  const ang = Math.atan(rise / D);
  const L = Math.hypot(D, rise) + 2 * ov;
  const cy = (Hf + Hb) / 2 + B / 2;
  const rxs = columns(W, A, 600);
  rxs.forEach((x, i) =>
    b.box(`Takregel ${i + 1}`, m, { x, y: 0, z: 0 }, { x: A, y: B, z: L }, "tak", {
      pos: { x: x + A / 2, y: cy, z: D / 2 },
      rot: { x: -Math.round(deg(ang) * 10) / 10, y: 0, z: 0 },
    }),
  );
  // Takskiva ovanpå takreglarna
  const roofMat = pickSheet(ws, 12);
  const n = { y: Math.cos(ang), z: -Math.sin(ang) };
  const roofW = W + 200;
  b.unit = "Tak";
  if (roofMat && L <= roofMat.stockLength) {
    const pieces = Math.ceil(roofW / roofMat.stockWidth);
    const pw = roofW / pieces, off = B / 2 + roofMat.a / 2;
    for (let i = 0; i < pieces; i++)
      b.box(`Takskiva ${i + 1}`, roofMat, { x: 0, y: 0, z: 0 }, { x: pw, y: roofMat.a, z: L }, "tak", {
        pos: { x: -100 + pw * (i + 0.5), y: cy + n.y * off, z: D / 2 + n.z * off },
        rot: { x: -Math.round(deg(ang) * 10) / 10, y: 0, z: 0 },
      });
  } else {
    const rb = slat, cnt = Math.ceil(roofW / rb.b), off = B / 2 + rb.a / 2;
    for (let i = 0; i < cnt; i++)
      b.box(`Takbräda ${i + 1}`, rb, { x: 0, y: 0, z: 0 }, { x: rb.b, y: rb.a, z: L }, "tak", {
        pos: { x: -100 + rb.b * (i + 0.5), y: cy + n.y * off, z: D / 2 + n.z * off },
        rot: { x: -Math.round(deg(ang) * 10) / 10, y: 0, z: 0 },
      });
  }
  b.unit = null;

  // Väggar med luftspalt: bak och gavlar
  slatsX(b, "Vägg bak", "väggar", slat, 0, -slat.a, floorY, Hb - B - 20, W, 20);
  slatsZ(b, "Gavel V", "väggar", slat, -slat.a, 0, floorY, Hb - B - 20, D, 20);
  slatsZ(b, "Gavel H", "väggar", slat, W, 0, floorY, Hb - B - 20, D, 20);

  const roofArea = (roofW * L) / 1e6;
  b.hw("Takpapp (inkl. överlapp)", Math.ceil(roofArea * 1.15 * 10) / 10, "m²");
  b.hw("Pappspik", 1, "paket");
  b.hw("Plintar eller markplattor", xs.length * 2);
  b.hw("Vinkelbeslag / takstolsbeslag", rxs.length * 2 + xs.length * 2);
  b.hw("Träskruv 5×80 (utomhus)", xs.length * 8 + rxs.length * 4);
  b.hw("Träskruv 4,2×55 (brädor, utomhus)", Math.ceil(((2 * W + 4 * D) / 600) * 2 * ((Hb - B) / (slat.b + 20))));

  b.step("Kapa", "Kapa stolpar, reglar, takreglar och brädor. Takreglarna kapas snett i ändarna enligt taklutningen.", []);
  b.step("Stomme", "Ställ stolparna på plintar i våg. Skruva golvreglar och hammarband – kontrollera diagonalerna.", ["stomme", "golv"]);
  b.step("Tak", `Lägg takreglarna på hammarbanden (c/c ca 600), skruva takskivan och lägg takpapp. Lutning ca ${Math.round(deg(ang))}° bakåt.`, ["tak"]);
  b.step("Väggar", "Skruva väggbrädorna med ca 20 mm luftspalt – veden behöver ventilation för att torka.", ["väggar"]);
  b.note("Använd tryckimpregnerat virke (NTR AB) nära mark och placera förrådet med öppningen i medvind så regnet inte blåser in.");
  b.note("Låt fronten vara öppen – luft genom veden är viktigare än tak över allt.");
  return b.design(`Vedförråd ${W / 1000}×${D / 1000} m`, prompt, "woodShed", p);
}

// ---------------------------------------------------------------- Sandlåda

export function sandbox(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const board = prefer(ws, "bord-22x145")?.available ? prefer(ws, "bord-22x145")! : pickBoard(ws) ?? pickFrame(ws, "tall");
  const post = pickFrame(ws, "square");
  const t = board.a, bh = board.b;
  const courses = Math.max(1, Math.round(H / bh));
  const realH = courses * bh;
  for (let c = 0; c < courses; c++) {
    const y = c * bh;
    b.box(`Sida fram ${c + 1}`, board, { x: 0, y, z: D - t }, { x: W, y: bh, z: t }, "sidor");
    b.box(`Sida bak ${c + 1}`, board, { x: 0, y, z: 0 }, { x: W, y: bh, z: t }, "sidor");
    b.box(`Gavel V ${c + 1}`, board, { x: 0, y, z: t }, { x: t, y: bh, z: D - 2 * t }, "sidor");
    b.box(`Gavel H ${c + 1}`, board, { x: W - t, y, z: t }, { x: t, y: bh, z: D - 2 * t }, "sidor");
  }
  const pa = post.a;
  [[t, t], [W - t - pa, t], [t, D - t - pa], [W - t - pa, D - t - pa]].forEach(([x, z], i) =>
    b.box(`Hörnstolpe ${i + 1}`, post, { x, y: 0, z }, { x: pa, y: realH, z: pa }, "hörn"),
  );
  // Sittkant runt om, med 45° gering i hörnen
  const seat = pickBoard(ws) ?? board;
  const sw = seat.b;
  b.unit = "Sittkant";
  b.box("Sittkant fram", seat, { x: 0, y: realH, z: D - sw }, { x: W, y: seat.a, z: sw }, "sittkant", { endCuts: [45, 45] });
  b.box("Sittkant bak", seat, { x: 0, y: realH, z: 0 }, { x: W, y: seat.a, z: sw }, "sittkant", { endCuts: [45, 45] });
  b.box("Sittkant V", seat, { x: 0, y: realH, z: sw }, { x: sw, y: seat.a, z: D - 2 * sw }, "sittkant", { endCuts: [45, 45] });
  b.box("Sittkant H", seat, { x: W - sw, y: realH, z: sw }, { x: sw, y: seat.a, z: D - 2 * sw }, "sittkant", { endCuts: [45, 45] });
  b.unit = null;
  b.hw("Träskruv 5×60 (utomhus)", courses * 16 + 16);
  b.hw("Markduk (släpper igenom vatten)", Math.ceil((W * D) / 1e6 * 10) / 10, "m²");
  b.hw("Sand (ca)", Math.round(((W - 2 * t) * (D - 2 * t) * realH * 0.8) / 1e9 * 1.6 * 1000), "kg");
  b.step("Kapa", "Kapa sidor, gavlar, hörnstolpar och sittkant. Sittkanten kapas i 45° i hörnen.", []);
  b.step("Låda", "Skruva sidorna mot hörnstolparna varv för varv. Kontrollera diagonalerna.", ["hörn", "sidor"]);
  b.step("Sittkant", "Skruva sittkanten ovanpå – slipa alla kanter och hörn runda.", ["sittkant"]);
  b.note("Lägg markduk i botten (inte plast) så regnvatten rinner undan.");
  b.note("Använd obehandlat virke eller virke godkänt för lekmiljö. Gör gärna ett lock mot katter.");
  return b.design(`Sandlåda ${W}×${D} mm`, prompt, "sandbox", p);
}

// ---------------------------------------------------------------- Skohylla

export function shoeRack(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const n = Math.max(1, Math.round(+p.levels));
  const side = pickPanel(ws, 22);
  const t = panelThickness(b, side, 18);
  const rib = pickBoard(ws) ?? pickFrame(ws, "square");
  panel(b, "Sida V", "sidor", side, { x: 0, y: 0, z: 0 }, { x: t, y: H, z: D });
  panel(b, "Sida H", "sidor", side, { x: W - t, y: 0, z: 0 }, { x: t, y: H, z: D });
  panel(b, "Topp", "topp", side, { x: t, y: H - t, z: 0 }, { x: W - 2 * t, y: t, z: D });
  const inner = W - 2 * t;
  const gap = (H - t - 60) / n;
  let ribs = 0;
  for (let i = 0; i < n; i++) {
    const y = 60 + i * gap;
    b.unit = `Nivå ${i + 1}`;
    // Två ribbor per nivå – den bakre högre så skorna lutar
    b.box(`Ribba fram ${i + 1}`, rib, { x: t, y, z: D - rib.b - 20 }, { x: inner, y: rib.a, z: rib.b }, "ribbor");
    b.box(`Ribba bak ${i + 1}`, rib, { x: t, y: y + 60, z: 20 }, { x: inner, y: rib.a, z: rib.b }, "ribbor");
    ribs += 2;
  }
  b.unit = null;
  b.hw("Träskruv 4×50", ribs * 4 + 8);
  b.hw("Filttassar", 4);
  b.step("Kapa", "Kapa sidor, topp och ribbor.", []);
  b.step("Sidor och topp", "Skruva toppen mellan sidorna.", ["sidor", "topp"]);
  b.step("Ribbor", "Skruva ribborna – den bakre ribban på varje nivå sitter 60 mm högre så skorna lutar och klacken hakar i.", ["ribbor"]);
  b.note("Luft mellan ribborna gör att skorna torkar och att grus faller igenom.");
  return b.design(`Skohylla ${W} mm`, prompt, "shoeRack", p);
}

// ---------------------------------------------------------------- Förvaringskista

export function chest(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const mat = pickPanel(ws, 22);
  const t = panelThickness(b, mat, 18);
  const post = pickFrame(ws, "square");
  const pa = post.a;
  const bodyH = H - t;
  panel(b, "Framsida", "låda", mat, { x: 0, y: 0, z: D - t }, { x: W, y: bodyH, z: t });
  panel(b, "Baksida", "låda", mat, { x: 0, y: 0, z: 0 }, { x: W, y: bodyH, z: t });
  panel(b, "Gavel V", "låda", mat, { x: 0, y: 0, z: t }, { x: t, y: bodyH, z: D - 2 * t });
  panel(b, "Gavel H", "låda", mat, { x: W - t, y: 0, z: t }, { x: t, y: bodyH, z: D - 2 * t });
  [[t, t], [W - t - pa, t], [t, D - t - pa], [W - t - pa, D - t - pa]].forEach(([x, z], i) =>
    b.box(`Hörnlist ${i + 1}`, post, { x, y: t, z }, { x: pa, y: bodyH - t - 5, z: pa }, "hörn"),
  );
  panel(b, "Botten", "låda", mat, { x: t, y: 0, z: t }, { x: W - 2 * t, y: t, z: D - 2 * t });
  b.inUnit("Lock", () => {
    panel(b, "Lock", "lock", mat, { x: -5, y: bodyH, z: -5 }, { x: W + 10, y: t, z: D + 10 });
    const cleat = pickBoard(ws) ?? post;
    b.box("Lockribba V", cleat, { x: t + 5, y: bodyH - cleat.a, z: t + 5 }, { x: cleat.b, y: cleat.a, z: D - 2 * t - 10 }, "lock");
    b.box("Lockribba H", cleat, { x: W - t - 5 - cleat.b, y: bodyH - cleat.a, z: t + 5 }, { x: cleat.b, y: cleat.a, z: D - 2 * t - 10 }, "lock");
  });
  b.hw("Pianogångjärn eller 2 gångjärn", W > 700 ? 3 : 2);
  b.hw("Lockstöd/lockbroms (klämskydd)", 1);
  b.hw("Handtag", 2);
  b.hw("Träskruv 4×40", 40);
  b.hw("Trälim", 1, "flaska");
  b.step("Kapa", "Kapa sidor, botten, lock och hörnlister.", []);
  b.step("Låda", "Limma och skruva sidorna mot hörnlisterna. Skruva i botten.", ["låda", "hörn"]);
  b.step("Lock", "Skruva ribborna under locket (de håller det rakt och styr det på plats), montera gångjärn och lockstöd.", ["lock"]);
  b.note("Använd alltid ett lockstöd som håller locket öppet – ett fallande lock kan klämma barnfingrar. Borra gärna några lufthål.");
  if (mat.kind === "linear") b.note("Kistan görs av limmade remsor eftersom ingen skiva finns – plywood 12–18 mm blir enklare.");
  return b.design(`Förvaringskista ${W}×${D} mm`, prompt, "chest", p);
}

// ---------------------------------------------------------------- Trädäck / altan

export function deck(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const avail = ws.materials.filter((m) => m.kind === "linear" && m.available);
  const beam = avail.filter((m) => m.b >= 140).sort((x, y) => y.b - x.b)[0] ?? prefer(ws, "regel-45x145") ?? pickFrame(ws, "tall");
  const joist = beam;
  const deckMat = avail.find((m) => /trall/i.test(m.name)) ?? prefer(ws, "trall-28x120") ?? pickBoard(ws) ?? pickFrame(ws, "tall");
  const A = beam.a, B = beam.b, ta = deckMat.a;
  const joistY = H - ta - joist.b;
  // Bärlinor på högkant om höjden räcker, annars liggande – och vid mycket låg höjd läggs reglarna på marken
  let beamH = B;
  let beamTall = true;
  if (joistY - B < 0) {
    beamH = A;
    beamTall = false;
  }
  const useBeams = joistY - beamH >= 0;
  const beamY = joistY - beamH;
  if (!beamTall && useBeams) b.note(`Låg höjd – bärlinorna ligger ned (${A} mm höga). För mer ventilation under trallen, gör däcket högre.`);
  if (!useBeams) b.note(`Mycket låg höjd (${H} mm) – reglarna läggs direkt på plintar/markbalkar utan bärlinor. Minsta höjd med bärlinor är ${A + joist.b + ta} mm.`);

  // Bärlinor längs X, stolpar på plintar under dem
  const zs = columns(D, A, 1600);
  const pxs = columns(W, A, 1500);
  if (useBeams)
    zs.forEach((z, i) => {
      b.unit = `Bärlina ${i + 1}`;
      b.beamX(`Bärlina ${i + 1}`, beam, { x: 0, y: beamY, z }, W, "bärlinor", beamTall);
      if (beamY > 30) pxs.forEach((x, k) => b.post(`Stolpe ${i + 1}.${k + 1}`, beam, { x, y: 0, z }, beamY, "stolpar", "x"));
    });
  b.unit = null;
  // Reglar (bjälkar) längs Z ovanpå bärlinorna, c/c 600
  const jxs = columns(W, A, 600);
  jxs.forEach((x, i) => b.beamZ(`Regel ${i + 1}`, joist, { x, y: useBeams ? beamY + beamH : Math.max(0, joistY), z: 0 }, D, "reglar"));
  // Trall längs X
  const w = deckMat.b, gap = 5;
  const nBoards = Math.max(1, Math.floor((D + gap) / (w + gap)));
  const segs = Math.ceil(W / deckMat.stockLength);
  for (let i = 0; i < nBoards; i++)
    for (let s = 0; s < segs; s++)
      b.box(`Trall ${i + 1}${segs > 1 ? String.fromCharCode(97 + s) : ""}`, deckMat, { x: (W / segs) * s, y: H - ta, z: i * (w + gap) }, { x: W / segs, y: ta, z: w }, "trall");
  if (segs > 1) b.note("Trallen skarvas – lägg skarvarna mitt på en regel och sprid dem (förskjut varannan rad).");

  const posts = useBeams && beamY > 30 ? zs.length * pxs.length : 0;
  b.hw("Plintar (betong) + stolpfötter", Math.max(posts, zs.length * pxs.length));
  b.hw("Balkskor/vinkelbeslag (regel → bärlina)", jxs.length * zs.length * 2);
  b.hw("Trallskruv rostfri/varmförzinkad 4,2×55", nBoards * segs * jxs.length * 2);
  b.hw("Markduk", Math.ceil((W * D) / 1e6 * 1.1), "m²");
  b.step("Plintar", `Gjut eller gräv ned plintar i rader (${zs.length} rader × ${pxs.length}). Använd snöre och vattenpass – plintarna bestämmer hela däckets höjd.`, []);
  b.step("Bärlinor", "Montera stolparna i stolpfötterna och skruva bärlinorna. Ge däcket ca 1:100 lutning bort från huset.", ["stolpar", "bärlinor"]);
  b.step("Reglar", "Lägg reglarna c/c 600 och fäst med balkskor eller vinkelbeslag.", ["reglar"]);
  b.step("Trall", "Skruva trallen med ca 5 mm springa (använd en distansbit), två skruvar per regel, märgsidan (årsringarnas utsida) upp.", ["trall"]);
  b.note("Använd tryckimpregnerat virke NTR A ovan mark och NTR AB för stolpar nära mark.");
  if (B < 140) b.note(`Bärlinor och reglar av ${beam.name} är klena för ett däck – använd minst 45×145.`);
  return b.design(`Trädäck ${W / 1000}×${D / 1000} m`, prompt, "deck", p);
}

// ---------------------------------------------------------------- Soffbord

export function coffeeTable(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const m = pickFrame(ws, "square");
  const A = m.a, B = m.b;
  const tmp = new Builder(ws);
  const t = fillSurface(tmp, "x", "x", 0, 0, 0, W, D, { minSheet: 15, gap: 3 }).thickness;
  const inset = 40;
  const legH = H - t;
  const x0 = inset, x1 = W - inset - A, z0 = inset, z1 = D - inset - B;
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z], i) => b.post(`Ben ${i + 1}`, m, { x, y: 0, z }, legH, "ben", "z"));
  // Sarg mellan benen
  const rail = pickBoard(ws) ?? m;
  const rh = Math.min(rail.b, 95);
  b.box("Sarg fram", rail, { x: x0 + A, y: legH - rh, z: z1 + B - rail.a }, { x: x1 - x0 - A, y: rh, z: rail.a }, "sarg");
  b.box("Sarg bak", rail, { x: x0 + A, y: legH - rh, z: z0 }, { x: x1 - x0 - A, y: rh, z: rail.a }, "sarg");
  b.box("Sarg V", rail, { x: x0, y: legH - rh, z: z0 + B }, { x: rail.a, y: rh, z: z1 - z0 - B }, "sarg");
  b.box("Sarg H", rail, { x: x1 + A - rail.a, y: legH - rh, z: z0 + B }, { x: rail.a, y: rh, z: z1 - z0 - B }, "sarg");
  if (p.lowerShelf) {
    b.unit = "Underhylla";
    const y = 110;
    b.beamX("Hyllregel fram", m, { x: x0 + A, y, z: z1 }, x1 - x0 - A, "underhylla");
    b.beamX("Hyllregel bak", m, { x: x0 + A, y, z: z0 + B - m.a }, x1 - x0 - A, "underhylla");
    fillSurface(b, "Underhylla", "underhylla", x0 + A, y + m.b, z0 + B - m.a, x1 - x0 - A, z1 - z0 - B + 2 * m.a, { gap: 10, preferSheet: false, along: "z" });
    b.unit = null;
  }
  b.inUnit("Bordsskiva", () => fillSurface(b, "Bordsskiva", "skiva", 0, legH, 0, W, D, { minSheet: 15, gap: 3 }));
  b.hw("Träskruv 5×70", 16);
  b.hw("Träskruv 4×40 (skiva)", 12);
  b.hw("Trälim", 1, "flaska");
  b.step("Kapa", "Kapa ben, sarg och skivans delar.", []);
  b.step("Stomme", "Limma och skruva sargen mellan benen. Kontrollera att bordet står plant.", ["ben", "sarg"]);
  if (p.lowerShelf) b.step("Underhylla", "Skruva hyllreglarna mellan benen och lägg hyllan.", ["underhylla"]);
  b.step("Skiva", "Skruva skivan underifrån genom sargen och slipa kanterna.", ["skiva"]);
  b.note("Slipa i flera steg (80 → 120 → 180) och olja eller lacka – ett soffbord får mycket slitage.");
  return b.design(`Soffbord ${W}×${D} mm`, prompt, "coffeeTable", p);
}

// ---------------------------------------------------------------- Sittbänk med kattlådebox

/** Sittbänk med lyftbart sitslock, kattlåda i ena änden (ingång i gaveln) och förvaring i andra. */
export function catLitterBench(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const lw = +p.litterW, ld = +p.litterD;
  const left = !!p.entranceLeft;
  const mat = pickPanel(ws, 22);
  const t = panelThickness(b, mat, 18);
  const bodyH = H - t; // locket ligger ovanpå
  const innerH = bodyH - t;
  const compW = Math.min(W - 2 * t, lw + 80); // kattlådefackets bredd (luft för att kliva in)
  const storeW = W - 2 * t - compW - t;
  const divider = !!p.divider && storeW >= 200;

  // Ingångshålet i gaveln: 200 × 220 mm, med 60 mm tröskel så sanden stannar inne
  const ow = Math.min(200, D - 2 * t - 60), oh = Math.min(220, innerH - 80), sill = 60;
  const oz0 = (D - ow) / 2, oy0 = t + sill;
  const gx = left ? 0 : W - t;
  const otherX = left ? W - t : 0;
  b.unit = "Gavel med ingång";
  panel(b, "Ingångsgavel – nedre", "stomme", mat, { x: gx, y: 0, z: 0 }, { x: t, y: oy0, z: D });
  panel(b, "Ingångsgavel – övre", "stomme", mat, { x: gx, y: oy0 + oh, z: 0 }, { x: t, y: bodyH - oy0 - oh, z: D });
  panel(b, "Ingångsgavel – bak", "stomme", mat, { x: gx, y: oy0, z: 0 }, { x: t, y: oh, z: oz0 });
  panel(b, "Ingångsgavel – fram", "stomme", mat, { x: gx, y: oy0, z: oz0 + ow }, { x: t, y: oh, z: D - oz0 - ow });
  b.unit = null;
  panel(b, "Gavel", "stomme", mat, { x: otherX, y: 0, z: 0 }, { x: t, y: bodyH, z: D });
  panel(b, "Framsida", "stomme", mat, { x: t, y: 0, z: D - t }, { x: W - 2 * t, y: bodyH, z: t });
  panel(b, "Baksida", "stomme", mat, { x: t, y: 0, z: 0 }, { x: W - 2 * t, y: bodyH, z: t });
  panel(b, "Botten", "stomme", mat, { x: t, y: 0, z: t }, { x: W - 2 * t, y: t, z: D - 2 * t });
  if (divider) {
    const dx = left ? t + compW : W - t - compW - t;
    panel(b, "Mellanvägg", "stomme", mat, { x: dx, y: t, z: t }, { x: t, y: innerH - 20, z: D - 2 * t });
  }
  const litterH = Math.min(200, innerH - 60);

  // Sitslock med ribbor under, gångjärn bak
  b.inUnit("Sitslock", () => {
    panel(b, "Sitslock", "lock", mat, { x: 0, y: bodyH, z: 0 }, { x: W, y: t, z: D });
    const rib = pickBoard(ws) ?? pickFrame(ws, "square");
    b.box("Lockribba V", rib, { x: t + 10, y: bodyH - rib.a, z: t + 10 }, { x: rib.b, y: rib.a, z: D - 2 * t - 20 }, "lock");
    b.box("Lockribba H", rib, { x: W - t - 10 - rib.b, y: bodyH - rib.a, z: t + 10 }, { x: rib.b, y: rib.a, z: D - 2 * t - 20 }, "lock");
  });

  b.hw("Gångjärn (pianogångjärn eller 3 st)", W > 800 ? 3 : 2);
  b.hw("Lockstöd/lockbroms (klämskydd)", 1);
  b.hw("Sittdyna", 1);
  b.hw("Filttassar", 4);
  b.hw("Träskruv 4×40", 50);
  b.hw("Trälim", 1, "flaska");

  b.step("Kapa", "Kapa alla delar. Ingångsgaveln byggs av fyra bitar runt hålet – eller såga ut hålet med sticksåg ur en hel gavel.", []);
  b.step("Stomme", `Skruva botten, fram- och baksida mellan gavlarna${divider ? " och sätt in mellanväggen" : ""}.`, ["stomme"]);
  b.step("Sitslock", "Skruva ribborna under locket, montera gångjärn bak och lockstöd så locket stannar öppet när du byter sand.", ["lock"]);
  b.step("Ytbehandla", "Lacka eller olja insidan av kattlådefacket – det måste tåla fukt och gå att torka av.", []);

  const innerD = D - 2 * t;
  if (lw > compW - 20 || ld > innerD - 20) b.note(`Kattlådan (${lw}×${ld} mm) får knappt plats – facket är ${Math.round(compW)}×${Math.round(innerD)} mm invändigt. Öka bänkens djup eller längd.`);
  else b.note(`Kattlådefacket är ${Math.round(compW)}×${Math.round(innerD)}×${Math.round(innerH)} mm invändigt – plats för en kattlåda på ${lw}×${ld} mm (upp till ca ${litterH} mm hög).`);
  if (innerH < 350) b.note(`Invändig höjd ${Math.round(innerH)} mm är låg – de flesta katter vill kunna stå upp (ca 350 mm).`);
  b.note(`Ingången (${ow}×${oh} mm) sitter i ${left ? "vänstra" : "högra"} gaveln med ${sill} mm tröskel som håller kvar sanden.`);
  b.note("Borra några ventilationshål Ø20–30 mm högt upp i baksidan så lukt och fukt vädras ut.");
  if (divider) b.note(`Förvaringsfacket (${Math.round(storeW)} mm brett) passar för sand, påsar och skyffel.`);
  return b.design(`Sittbänk med kattlåda ${W} mm`, prompt, "catLitterBench", p);
}
