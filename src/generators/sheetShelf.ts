import type { Design, Material, Workshop } from "../types";
import { Builder, columns } from "./builder";

/** Spånskiva (eller annan skiva ≥ 15 mm) – helst den smala 500×2500. */
function pickShelfSheet(ws: Workshop): Material | null {
  const sheets = ws.materials.filter((m) => m.kind === "sheet" && m.a >= 15);
  const score = (m: Material) => (m.available ? 100 : 0) + (m.id === "spanskiva-18" ? 50 : 0) - Math.abs(m.a - 18);
  return sheets.sort((x, y) => score(y) - score(x))[0] ?? null;
}

/** Hyllsystem där gavlar och hyllplan sågas ur skivor (t.ex. spånskiva 18 × 500 × 2500). */
export function sheetShelf(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const s = pickShelfSheet(ws);
  if (!s) throw new Error("Ingen skiva på minst 15 mm finns i materiallistan – lägg till t.ex. spånskiva 18 mm.");
  const t = s.a;
  const W = +p.width, D = Math.min(+p.depth, s.stockWidth), H = +p.height;
  const n = Math.max(2, Math.round(+p.shelves));
  const maxSpan = +p.maxSpan;
  const plinth = 80;
  const canDrill = b.has("borrmaskin") || b.has("skruvdragare");
  const adjustable = !!p.adjustable && canDrill;

  if (+p.depth > s.stockWidth) b.note(`Djupet är begränsat till skivans bredd, ${s.stockWidth} mm.`);
  if (H > s.stockLength) b.note(`Gavlarna (${H} mm) är längre än skivan (${s.stockLength} mm) – sänk höjden eller skarva gavlarna.`);

  const xs = columns(W, t, maxSpan);
  xs.forEach((x, i) => b.box(`Gavel ${i + 1}`, s, { x, y: 0, z: 0 }, { x: t, y: H, z: D }, "gavlar"));

  // Hyllnivåer (översida): botten på sockeln, topp i gavlarnas överkant
  const bottomY = plinth, topY = H - t;
  const levels = Array.from({ length: n }, (_, i) => bottomY + ((topY - bottomY) * i) / (n - 1));
  const mid = Math.floor((n - 1) / 2);
  const isFixed = (i: number) => !adjustable || i === 0 || i === n - 1 || (n >= 5 && i === mid);

  let fixed = 0, loose = 0, edge = xs.length * H;
  for (let bay = 0; bay < xs.length - 1; bay++) {
    const x0 = xs[bay] + t, span = xs[bay + 1] - x0;
    const f = `${bay + 1}`;
    levels.forEach((y, i) => {
      const fx = isFixed(i);
      const name = i === 0 ? `Bottenhylla fack ${f}` : i === n - 1 ? `Topphylla fack ${f}` : `Hyllplan ${i} fack ${f}`;
      const gap = fx ? 0 : 1; // lösa hyllor lite kortare så de går att lyfta ur
      b.box(name, s, { x: x0 + gap, y, z: 0 }, { x: span - 2 * gap, y: t, z: D }, fx ? "fasta hyllor" : "lösa hyllor");
      if (fx) fixed++;
      else loose++;
      edge += span;
    });
    b.box(`Sockel fack ${f}`, s, { x: x0, y: 0, z: D - t - 30 }, { x: span, y: plinth, z: t }, "sockel");
    b.box(`Fästlist fack ${f}`, s, { x: x0, y: topY - 100, z: 0 }, { x: span, y: 100, z: t }, "fästlist");
  }
  const bays = xs.length - 1;
  const spanMm = Math.round(xs[1] - xs[0] - t);

  b.hw("Spånskiveskruv 4,5×50", fixed * 2 * 3 + bays * 2 * 2 * 2);
  if (loose) b.hw("Hyllbärare Ø5 mm", loose * 4);
  b.hw("Väggskruv + plugg (genom fästlisten)", bays * 2);
  b.hw("Kantlist/kantband 20 mm (framkanter)", Math.ceil((edge / 1000) * 1.1), "m");

  // Sågning: 500 mm breda kap är för breda för en vanlig kap- & gersåg
  if (b.has("bordssag")) b.note(`Kapa hyllplanen på bordssågen med geringsanslag eller släde. Ta hjälp att bära de ${s.stockLength} mm långa skivorna.`);
  else if (b.has("cirkelsag")) b.note("Kapa skivorna med cirkelsåg och en fastspänd rak list som anslag.");
  else if (b.has("sticksag")) b.note("Sticksåg ger ofta sneda kap i 18 mm skiva – spänn fast en list som anslag och såga långsamt.");
  else if (b.has("handsag")) b.note("Skivorna kapas med handsåg – rita med vinkelhake och såga med den fina sidan uppåt. Många bygghandlar kapar åt dig om du tar med kapningslistan.");
  if (b.has("kapgersag")) b.note(`Kap- & gersågen räcker oftast inte till för ${D} mm breda kap.`);
  if (spanMm > 700) b.note(`Fackbredden ${spanMm} mm är i överkant för ${t} mm spånskiva – tunga böcker får hyllorna att svikta med tiden. Välj max ca 700 mm.`);
  if (D < s.stockWidth) b.note(`Djupet ${D} mm betyder att alla delar måste klyvas på längden – med ${s.stockWidth} mm djup används skivans hela bredd.`);
  if (p.adjustable && !adjustable) b.note("Ställbara hyllor kräver borrmaskin eller skruvdragare för hålraderna – nu skruvas alla hyllor fast.");
  b.note("Spånskiva suger fukt i kanterna – kantlista synliga kanter och placera inte hyllan i våtutrymmen.");

  b.step("Kapa skivorna", "Kapa gavlar, hyllplan, sockel och fästlister enligt skivschemat. Märk varje bit och vilken sida som är framkant.", []);
  if (adjustable) b.step("Borra hålrader", "Borra två hålrader Ø5 mm, 12 mm djupa, på insidan av varje gavel, 37 mm från fram- och bakkant. Använd en borrmall och ett djupstopp på borret så hålen hamnar i samma höjd på alla gavlar.", []);
  b.step("Stomme", `Skruva ${adjustable ? "de fasta hyllorna" : "hyllorna"}, sockeln och fästlisten mellan gavlarna – förborra och skruva 3 skruvar i varje ände. Mät diagonalerna så facken blir rätvinkliga.`, ["gavlar", "fasta hyllor", "sockel", "fästlist"]);
  b.step("Res och förankra", "Res hyllan, justera med vattenpass och skruva fästlisterna i väggen.", []);
  if (loose) b.step("Lösa hyllplan", "Sätt i hyllbärarna och lägg in de lösa hyllplanen på önskad höjd.", ["lösa hyllor"]);
  b.step("Kantlist", "Stryk på kantband på alla synliga framkanter och putsa av överskottet.", []);

  return b.design(`Spånskivehylla ${W / 1000}×${H / 1000} m`, prompt, "sheetShelf", p, { width: W + 600, height: Math.max(H + 300, 2400) });
}
