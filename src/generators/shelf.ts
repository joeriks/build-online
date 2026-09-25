import type { Design, Workshop } from "../types";
import { Builder, columns, fillSurface, pickBoard, pickFrame, pickSheet } from "./builder";

export function shelf(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, H = +p.height, D = +p.depth;
  const n = Math.max(1, Math.round(+p.shelves));
  const b = new Builder(ws);
  const m = pickFrame(ws, "tall");

  // Spännvidd beror på hyllplanens material
  const sheet = pickSheet(ws, 12);
  const board = pickBoard(ws);
  const maxSpan = sheet ? 800 : board ? 900 : 1000;
  const xs = columns(W, m.a, maxSpan);

  // Gavlar ("stegar"): en bakre och en främre stolpe per gavel
  for (const [i, x] of xs.entries()) {
    b.unit = `Gavel ${i + 1}`;
    b.post(`Stolpe bak ${i + 1}`, m, { x, y: 0, z: 0 }, H, "stolpar", "z");
    b.post(`Stolpe fram ${i + 1}`, m, { x, y: 0, z: D - m.b }, H, "stolpar", "z");
  }

  // Hyllnivåer: jämnt fördelade från 100 mm till toppen
  const bottom = 100;
  const top = H - 30;
  const levels = n === 1 ? [bottom] : Array.from({ length: n }, (_, i) => bottom + ((top - bottom) * i) / (n - 1));

  let shelfCount = 0, cleatCount = 0;
  for (let bay = 0; bay < xs.length - 1; bay++) {
    b.unit = `Fack ${bay + 1}`;
    const x0 = xs[bay] + m.a, x1 = xs[bay + 1];
    const span = x1 - x0;
    for (const [li, yTop] of levels.entries()) {
      const cleatH = m.b;
      // Bärlister på insidan av båda gavlarna – hyllplanet vilar på dem
      const y = Math.max(0, yTop - 25 - cleatH);
      b.box(`Bärlist ${bay + 1}.${li + 1} V`, m, { x: x0, y, z: 0 }, { x: m.a, y: cleatH, z: D }, "bärlister");
      b.box(`Bärlist ${bay + 1}.${li + 1} H`, m, { x: x1 - m.a, y, z: 0 }, { x: m.a, y: cleatH, z: D }, "bärlister");
      cleatCount += 2;
      // Hyllplanet ligger mellan stolparna (fram/bak) ovanpå listerna
      fillSurface(b, `Hyllplan ${bay + 1}.${li + 1}`, "hyllplan", x0 + 2, y + cleatH, 0, span - 4, D, { minSheet: 12 });
      shelfCount++;
    }
  }

  b.unit = null;
  b.hw("Träskruv 5×80 (list → stolpe)", cleatCount * 2);
  b.hw("Träskruv 4×40 (hyllplan)", shelfCount * 6);
  b.hw("Vinkeljärn / väggbeslag", xs.length * 2);
  b.hw("Väggskruv + plugg (anpassa efter väggtyp)", xs.length * 2);

  b.step("Kapa allt virke", "Kapa enligt kapningslistan. Märk delarna med blyerts så de är lätta att hitta.", []);
  b.step("Res gavlarna", `Ställ stolparna parvis (bak och fram) med ${D} mm totalt djup. Skruva fast dem mot väggen med vinkeljärn – kontrollera lod med vattenpass.`, ["stolpar"]);
  b.step("Skruva bärlisterna", "Skruva bärlisterna på insidan av gavlarna, två skruvar i varje stolpe. Mät från golvet så listerna hamnar i våg.", ["bärlister"]);
  b.step("Lägg hyllplanen", "Lägg hyllplanen på listerna och skruva ned dem.", ["hyllplan"]);

  b.note(`Stolparna är ${m.name}. Hyllorna förankras i väggen – ett högt hyllsystem utan förankring kan välta.`);
  if (H > m.stockLength) b.note(`Höjden ${H} mm är längre än säljlängden (${m.stockLength} mm) – välj längre virke eller skarva stolparna.`);

  return b.design(`Hyllsystem ${W / 1000}×${H / 1000} m`, prompt, "shelf", p, { width: W + 600, height: Math.max(H + 300, 2400) });
}
