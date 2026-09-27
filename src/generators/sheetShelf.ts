import type { Design, Material, Workshop } from "../types";
import { Builder, columns, pickFrame } from "./builder";

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
  if (p.fullBoards) return withLadders(b, s, p, prompt);
  if (p.studFrame) return withStuds(b, s, p, prompt);
  const plinth = 80;
  const canDrill = b.has("borrmaskin") || b.has("skruvdragare");
  const adjustable = !!p.adjustable && canDrill;

  if (+p.depth > s.stockWidth) b.note(`Djupet är begränsat till skivans bredd, ${s.stockWidth} mm.`);
  if (H > s.stockLength) b.note(`Gavlarna (${H} mm) är längre än skivan (${s.stockLength} mm) – sänk höjden eller skarva gavlarna.`);

  const xs = columns(W, t, maxSpan);
  xs.forEach((x, i) => b.inUnit(`Gavel ${i + 1}`, () => b.box(`Gavel ${i + 1}`, s, { x, y: 0, z: 0 }, { x: t, y: H, z: D }, "gavlar")));

  // Hyllnivåer (översida): botten på sockeln, topp i gavlarnas överkant
  const bottomY = plinth, topY = H - t;
  const levels = Array.from({ length: n }, (_, i) => bottomY + ((topY - bottomY) * i) / (n - 1));
  const mid = Math.floor((n - 1) / 2);
  const isFixed = (i: number) => !adjustable || i === 0 || i === n - 1 || (n >= 5 && i === mid);

  let fixed = 0, loose = 0, edge = xs.length * H;
  for (let bay = 0; bay < xs.length - 1; bay++) {
    const x0 = xs[bay] + t, span = xs[bay + 1] - x0;
    const f = `${bay + 1}`;
    b.unit = `Fack ${f}`;
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
  b.unit = null;
  const bays = xs.length - 1;
  const spanMm = Math.round(xs[1] - xs[0] - t);

  b.hw("Spånskiveskruv 4,5×50", fixed * 2 * 3 + bays * 2 * 2 * 2);
  if (loose) b.hw("Hyllbärare Ø5 mm", loose * 4);
  b.hw("Väggskruv + plugg (genom fästlisten)", bays * 2);
  b.hw("Kantlist/kantband 20 mm (framkanter)", Math.ceil((edge / 1000) * 1.1), "m");

  sawNotes(b, s, D);
  if (spanMm > 700) b.note(`Fackbredden ${spanMm} mm är i överkant för ${t} mm spånskiva – tunga böcker får hyllorna att svikta med tiden. Välj max ca 700 mm, eller bygg gavlarna av reglar med en framkantslist under varje hylla.`);
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

/** Sågtips för skivorna – 500 mm breda kap är för breda för en vanlig kap- & gersåg. */
function sawNotes(b: Builder, s: Material, D: number) {
  if (b.has("bordssag")) b.note(`Kapa hyllplanen på bordssågen med geringsanslag eller släde. Ta hjälp att bära de ${s.stockLength} mm långa skivorna.`);
  else if (b.has("cirkelsag")) b.note("Kapa skivorna med cirkelsåg och en fastspänd rak list som anslag.");
  else if (b.has("sticksag")) b.note("Sticksåg ger ofta sneda kap i 18 mm skiva – spänn fast en list som anslag och såga långsamt.");
  else if (b.has("handsag")) b.note("Skivorna kapas med handsåg – rita med vinkelhake och såga med den fina sidan uppåt. Många bygghandlar kapar åt dig om du tar med kapningslistan.");
  if (b.has("kapgersag")) b.note(`Kap- & gersågen räcker oftast inte till för ${D} mm breda kap i skivan – men den är perfekt för reglarna.`);
  if (D < s.stockWidth) b.note(`Djupet ${D} mm betyder att hyllplanen måste klyvas på längden – med ${s.stockWidth} mm djup används skivans hela bredd.`);
}

/**
 * Variant: gavlar som "stegar" av reglar (helst 45×45) med bärlister,
 * hyllplan av skiva och en framkantslist under varje hylla som hindrar svikt.
 */
function withStuds(b: Builder, s: Material, p: Design["params"], prompt: string): Design {
  const ws = b.ws;
  const m = ws.materials.find((x) => x.id === "regel-45x45" && x.available) ?? pickFrame(ws, "square");
  const A = m.a, B = m.b, t = s.a;
  const W = +p.width, D = Math.min(+p.depth, s.stockWidth), H = +p.height;
  const n = Math.max(2, Math.round(+p.shelves));
  const xs = columns(W, A, +p.maxSpan);

  // Stegar: bakre och främre stolpe per gavel
  xs.forEach((x, i) => {
    b.unit = `Gavel ${i + 1}`;
    b.post(`Stolpe bak ${i + 1}`, m, { x, y: 0, z: 0 }, H, "stolpar", "z");
    b.post(`Stolpe fram ${i + 1}`, m, { x, y: 0, z: D - B }, H, "stolpar", "z");
  });

  // Hyllplanens undersida: nedersta 60 mm över golvet, översta i nivå med stolparna
  const bottomY = 60, topY = H - t;
  const levels = Array.from({ length: n }, (_, i) => bottomY + ((topY - bottomY) * i) / (n - 1));
  let cleats = 0, fronts = 0, shelves = 0, edge = 0;
  for (let bay = 0; bay < xs.length - 1; bay++) {
    const x0 = xs[bay] + A, x1 = xs[bay + 1];
    const f = bay + 1;
    b.unit = `Fack ${f}`;
    levels.forEach((y, i) => {
      const cy = Math.max(0, y - B);
      b.box(`Bärlist ${f}.${i + 1} V`, m, { x: x0, y: cy, z: 0 }, { x: A, y: y - cy, z: D }, "bärlister");
      b.box(`Bärlist ${f}.${i + 1} H`, m, { x: x1 - A, y: cy, z: 0 }, { x: A, y: y - cy, z: D }, "bärlister");
      cleats += 2;
      if (x1 - x0 - 2 * A > 150) {
        b.box(`Framkantslist ${f}.${i + 1}`, m, { x: x0 + A, y: cy, z: D - A }, { x: x1 - x0 - 2 * A, y: y - cy, z: A }, "framkantslister");
        fronts++;
      }
      const name = i === 0 ? `Bottenhylla fack ${f}` : i === n - 1 ? `Topphylla fack ${f}` : `Hyllplan ${i} fack ${f}`;
      b.box(name, s, { x: x0 + 1, y, z: 0 }, { x: x1 - x0 - 2, y: t, z: D }, "hyllplan");
      shelves++;
      edge += x1 - x0;
    });
  }
  b.unit = null;
  const spanMm = Math.round(xs[1] - xs[0] - A);

  b.hw("Träskruv 5×80 (bärlist → stolpe, framkantslist)", cleats * 4 + fronts * 4);
  b.hw("Spånskiveskruv 4×30 (hyllplan → list)", shelves * 4);
  b.hw("Vinkeljärn / väggbeslag", xs.length * 2);
  b.hw("Väggskruv + plugg (anpassa efter väggtyp)", xs.length * 2);
  b.hw("Kantlist/kantband 20 mm (framkanter)", Math.ceil((edge / 1000) * 1.1), "m");

  sawNotes(b, s, D);
  if (b.has("kapgersag")) b.note(`Reglarna (${m.name}) kapas snabbt och exakt på kap- & gersågen – sätt ett stoppklossanslag så alla bärlister blir lika långa.`);
  b.note(`Framkantslisten under varje hylla gör att ${t} mm spånskiva klarar ca 1000 mm fackbredd utan att svikta${spanMm > 1000 ? ` – nu är facken ${spanMm} mm, minska max fackbredd` : ""}.`);
  b.note("Hyllorna vilar på bärlister och är fasta. Vill du ha ställbara hyllor, bygg gavlarna av skiva i stället.");
  b.note("Spånskiva suger fukt i kanterna – kantlista synliga kanter och placera inte hyllan i våtutrymmen.");

  b.step("Kapa", "Kapa stolpar, bärlister och framkantslister på kap- & gersågen och hyllplanen ur skivorna enligt skivschemat. Märk delarna.", []);
  b.step("Stegar", "Lägg två stolpar på golvet och skruva bärlisterna på insidan – varje gavel blir en stege. Mät från golvet så alla bärlister hamnar i samma höjd.", ["stolpar", "bärlister"]);
  b.step("Res och förankra", "Res stegarna mot väggen, kontrollera lod med vattenpass och fäst dem med vinkeljärn.", []);
  b.step("Framkantslister", "Skruva framkantslisterna mellan bärlisterna i framkant.", ["framkantslister"]);
  b.step("Hyllplan", "Lägg hyllplanen på listerna och skruva ned dem – då låses stegarna ihop till en stabil hylla.", ["hyllplan"]);
  b.step("Kantlist", "Stryk på kantband på hyllplanens framkanter.", []);

  return b.design(`Hylla av reglar & spånskiva ${W / 1000}×${H / 1000} m`, prompt, "sheetShelf", p, { width: W + 600, height: Math.max(H + 300, 2400) });
}

/**
 * Variant: stegar av reglar med stolparna UTANFÖR skivan (bak och fram) och tvärpinnar emellan.
 * Hyllplanen är hela skivor som går igenom alla stegar – skivorna behöver oftast inte sågas alls.
 */
function withLadders(b: Builder, s: Material, p: Design["params"], prompt: string): Design {
  const ws = b.ws;
  const m = ws.materials.find((x) => x.id === "regel-45x45" && x.available) ?? pickFrame(ws, "square");
  const A = m.a, B = m.b, t = s.a;
  const W = +p.width, H = +p.height;
  const Sd = Math.min(+p.depth, s.stockWidth); // hyllplanens djup
  const D = Sd + 2 * B; // totalt djup med stolpar bak och fram
  const n = Math.max(2, Math.round(+p.shelves));
  const xs = columns(W, A, +p.maxSpan);
  const centers = xs.map((x) => x + A / 2);

  // Hyllnivåer = hyllplanens undersida (= pinnarnas översida)
  const bottomY = 80, topY = H - t;
  const levels = Array.from({ length: n }, (_, i) => bottomY + ((topY - bottomY) * i) / (n - 1));

  let rungs = 0;
  xs.forEach((x, i) => {
    b.unit = `Stege ${i + 1}`;
    b.post(`Stolpe bak ${i + 1}`, m, { x, y: 0, z: 0 }, H, "stegar", "z");
    b.post(`Stolpe fram ${i + 1}`, m, { x, y: 0, z: B + Sd }, H, "stegar", "z");
    levels.forEach((y, li) => {
      b.box(`Pinne ${i + 1}.${li + 1}`, m, { x, y: y - B, z: B }, { x: A, y: B, z: Sd }, "stegar");
      rungs++;
    });
  });

  // Hyllplanens längd: hela bredden, skarvade över en stege om skivan är för kort
  const cuts: [number, number][] = [];
  let start = 0;
  while (W - start > s.stockLength) {
    const c = [...centers].reverse().find((c) => c > start + 100 && c - start <= s.stockLength);
    if (c == null) break;
    cuts.push([start, c]);
    start = c;
  }
  cuts.push([start, W]);
  let boards = 0;
  levels.forEach((y, li) => {
    b.unit = `Hyllplan ${li + 1}`;
    cuts.forEach(([x0, x1], k) => {
      b.box(cuts.length > 1 ? `Hyllplan ${li + 1}${String.fromCharCode(97 + k)}` : `Hyllplan ${li + 1}`, s, { x: x0 + (k ? 1 : 0), y, z: B }, { x: x1 - x0 - (k ? 1 : 0), y: t, z: Sd }, "hyllplan");
      boards++;
    });
  });
  b.unit = null;

  const spanMm = Math.round(xs[1] - xs[0] - A);
  const uncut = cuts.length === 1 && Math.abs(W - s.stockLength) <= 3 && Sd === s.stockWidth;

  b.hw("Träskruv 5×100 (genom stolpe in i pinne, förborra)", rungs * 4);
  b.hw("Spånskiveskruv 4×40 (hyllplan → pinne)", n * xs.length * 2);
  b.hw("Vinkeljärn / väggbeslag (bakre stolpar)", xs.length * 2);
  b.hw("Väggskruv + plugg (anpassa efter väggtyp)", xs.length * 2);
  b.hw("Kantlist/kantband 20 mm (framkanter)", Math.ceil((n * W) / 1000 * 1.05), "m");

  if (uncut) b.note(`Hyllplanen är hela skivor (${s.stockLength}×${s.stockWidth}) – ingen skiva behöver sågas. Bara reglarna kapas.`);
  else sawNotes(b, s, Sd);
  if (cuts.length > 1) b.note("Hyllplanen är skarvade – skarven ligger mitt på en stege så båda ändarna vilar på pinnen.");
  if (b.has("kapgersag")) b.note(`Stolpar och pinnar kapas på kap- & gersågen – sätt ett stoppklossanslag så alla ${rungs} pinnar blir exakt ${Sd} mm.`);
  if (spanMm > 850) b.note(`Avståndet mellan stegarna (${spanMm} mm) är stort för ${t} mm spånskiva – minska "Max fackbredd" till ca 800 mm.`);
  b.note(`Stolparna står utanför hyllplanen, så hyllan blir ${D} mm djup totalt. Det ger en luftig "stegehylla" där hyllplanen går hela vägen utan avbrott.`);
  b.note("Förborra pinnarna så de inte spricker. Stegarna blir stadiga när hyllplanen skruvas fast och hyllan förankras i väggen.");

  b.step("Kapa reglarna", `Kapa ${xs.length * 2} stolpar à ${H} mm och ${rungs} pinnar à ${Sd} mm.`, []);
  b.step("Bygg stegarna", "Lägg två stolpar på golvet, lägg pinnarna emellan på rätt höjd (använd en distansbit) och skruva två skruvar genom stolpen in i varje pinnände. Kontrollera diagonalerna.", ["stegar"]);
  b.step("Res och förankra", "Res stegarna mot väggen med rätt avstånd och fäst de bakre stolparna i väggen med vinkeljärn.", []);
  b.step("Lägg i hyllplanen", "Trä in hyllplanen mellan stolparna, lägg dem på pinnarna och skruva ned dem i varje pinne. Då låses stegarna ihop.", ["hyllplan"]);
  b.step("Kantlist", "Stryk på kantband på hyllplanens framkanter.", []);

  return b.design(`Stegehylla ${W / 1000}×${H / 1000} m`, prompt, "sheetShelf", p, { width: W + 600, height: Math.max(H + 300, 2400) });
}
