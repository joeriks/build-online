import type { Design, Workshop } from "../types";
import { Builder, columns, fillSurface, pickBoard, pickFrame } from "./builder";

/** Arbetsbänk med skiva/brädor som bänkskiva och valfri hylla under. */
export function workbench(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const b = new Builder(ws);
  const m = pickFrame(ws, "tall");
  const A = m.a, B = m.b;
  const over = 30; // överhäng på skivan
  const fw = W - 2 * over, fd = D - 2 * over;
  const legsX = columns(fw, A, 1300);
  const zF = over + fd - B, zB = over;

  // Bänkskiva först för att få tjockleken
  const tmp = new Builder(ws);
  const t = fillSurface(tmp, "x", "x", 0, 0, 0, W, D, { minSheet: 15, gap: 0 }).thickness;
  const layers = t < 15 ? 2 : 1; // tunn skiva → dubbla lager
  const topY = H - t * layers;
  const legH = topY - B; // ramen (sargen) ligger ovanpå benen

  for (const [i, x] of legsX.entries()) {
    b.post(`Ben fram ${i + 1}`, m, { x: over + x, y: 0, z: zF }, legH, "ben");
    b.post(`Ben bak ${i + 1}`, m, { x: over + x, y: 0, z: zB }, legH, "ben");
  }
  // Sarg: längsgående ovanpå benen, tvärgående mellan
  b.beamX("Sarg fram", m, { x: over, y: legH, z: zF + B - A }, fw, "sarg");
  b.beamX("Sarg bak", m, { x: over, y: legH, z: zB }, fw, "sarg");
  for (const [i, x] of legsX.entries())
    b.beamZ(`Tvärslå ${i + 1}`, m, { x: over + x, y: legH, z: zB + A }, fd - 2 * A, "sarg");

  if (p.lowerShelf) {
    b.unit = "Underhylla";
    const y = 150;
    // Reglar på benens insida – då kan hyllan gå hel förbi mittbenen
    b.beamX("Hyllregel fram", m, { x: over, y, z: zF - A }, fw, "underhylla", true);
    b.beamX("Hyllregel bak", m, { x: over, y, z: zB + B }, fw, "underhylla", true);
    fillSurface(b, "Underhylla", "underhylla", over, y + B, zB + B, fw, zF - zB - B, { minSheet: 12 });
  }
  b.unit = "Bänkskiva";
  for (let l = 0; l < layers; l++)
    fillSurface(b, layers > 1 ? `Bänkskiva lager ${l + 1}` : "Bänkskiva", "skiva", 0, H - t * (layers - l), 0, W, D, { minSheet: 15, gap: 0 });

  b.unit = null;
  b.hw("Träskruv 6×100 (sarg → ben)", legsX.length * 2 * 2 + legsX.length * 2);
  b.hw("Träskruv 4×50 (skiva)", Math.ceil((W / 200) * 3) * layers);
  if (p.lowerShelf) b.hw("Träskruv 5×80 (hyllreglar)", 4 + legsX.length * 2);
  b.hw("Trälim", 1, "flaska");

  b.step("Kapa", "Kapa alla delar enligt kapningslistan.", []);
  b.step("Ben och sarg", "Bygg gavlarna först (två ben + tvärslå), ställ upp dem och skruva fast den långa sargen. Kontrollera att allt är i vinkel.", ["ben", "sarg"]);
  if (p.lowerShelf) b.step("Underhylla", "Skruva hyllreglarna mellan benen och lägg hyllan på dem.", ["underhylla"]);
  b.step("Bänkskiva", layers > 1 ? "Limma och skruva två lager skiva ovanpå varandra för en styv bänkskiva." : "Lägg bänkskivan ovanpå och skruva underifrån genom sargen.", ["skiva"]);
  b.note(`Stommen är gjord av ${m.name}.`);
  if (!pickBoard(ws) && t === m.a) {
    b.note("Bänkskivan blir av ribbor – limma ihop dem kant i kant (tvingar hjälper).");
  }
  return b.design(`Arbetsbänk ${W}×${D} mm`, prompt, "workbench", p);
}

/** Odlingslåda / pallkrage i virke. */
export function raisedBed(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const b = new Builder(ws);
  const post = pickFrame(ws, "square");
  const board = pickBoard(ws) ?? pickFrame(ws, "tall");
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
  const inner = [
    [t, t], [W - t - pa, t], [t, D - t - pa], [W - t - pa, D - t - pa],
  ];
  inner.forEach(([x, z], i) => b.box(`Hörnstolpe ${i + 1}`, post, { x, y: 0, z }, { x: pa, y: realH, z: pa }, "hörn"));
  if (W > 1500) {
    b.box("Mittstolpe fram", post, { x: W / 2 - pa / 2, y: 0, z: D - t - pa }, { x: pa, y: realH, z: pa }, "hörn");
    b.box("Mittstolpe bak", post, { x: W / 2 - pa / 2, y: 0, z: t }, { x: pa, y: realH, z: pa }, "hörn");
  }
  b.hw("Träskruv 5×60 (utomhus)", courses * 4 * 4 + (W > 1500 ? courses * 4 : 0));
  b.hw("Markduk / plast på insidan", Math.ceil((2 * (W + D) * realH) / 1e6), "m²");
  b.step("Kapa", "Kapa sidor, gavlar och hörnstolpar.", []);
  b.step("Hörn och första varvet", "Skruva första varvet av sidorna mot hörnstolparna. Kontrollera diagonalerna så lådan blir rätvinklig.", ["hörn"]);
  b.step("Resten av varven", "Bygg på varv för varv.", ["sidor"]);
  b.note(`Höjden blir ${realH} mm (${courses} varv à ${bh} mm).`);
  b.note("Använd tryckimpregnerat eller obehandlat virke av lärk/gran klass NTR AB om det ska vara mot jord. Klä insidan med plast.");
  return b.design(`Odlingslåda ${W}×${D}×${realH} mm`, prompt, "raisedBed", p);
}

/** Enkel sittbänk. */
export function bench(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const b = new Builder(ws);
  const m = pickFrame(ws, "tall");
  const A = m.a, B = m.b;
  const over = 20;
  const tmp = new Builder(ws);
  const t = fillSurface(tmp, "x", "x", 0, 0, 0, W, D, { preferSheet: false }).thickness;
  const legH = H - t - B;
  const fw = W - 2 * over - 100, fd = D - 2 * over;
  const x0 = over + 50;
  const legXs = columns(fw, A, 1200);
  for (const [i, x] of legXs.entries()) {
    b.post(`Ben fram ${i + 1}`, m, { x: x0 + x, y: 0, z: over + fd - B }, legH, "ben");
    b.post(`Ben bak ${i + 1}`, m, { x: x0 + x, y: 0, z: over }, legH, "ben");
    b.beamZ(`Tvärslå ${i + 1}`, m, { x: x0 + x, y: legH, z: over }, fd, "ram");
    b.beamZ(`Fotslå ${i + 1}`, m, { x: x0 + x, y: 120, z: over + B }, fd - 2 * B, "ram");
  }
  b.beamX("Längsregel", m, { x: x0, y: 120 + B, z: over + fd / 2 - A / 2 }, fw, "ram");
  b.inUnit("Sits", () => fillSurface(b, "Sits", "sits", 0, H - t, 0, W, D, { preferSheet: false, gap: 8 }));
  b.hw("Träskruv 5×80", legXs.length * 8 + 2);
  b.hw("Träskruv 4×50 (sits)", Math.ceil(W / 300) * 2 * legXs.length);
  b.step("Kapa", "Kapa alla delar.", []);
  b.step("Gavlar", "Skruva ihop varje gavel: två ben, tvärslå överst och fotslå nertill.", ["ben", "ram"]);
  b.step("Sits", "Skruva sitsbrädorna på tvärslåarna med jämnt mellanrum (använd en distansbit).", ["sits"]);
  b.note("Slipa kanterna på sitsen och olja bänken om den ska stå ute.");
  return b.design(`Sittbänk ${W} mm`, prompt, "bench", p);
}
