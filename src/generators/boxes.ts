/**
 * Enkla lådor med tre olika hörnfogar – med utförliga byggbeskrivningar och fogskisser:
 *  - stumfog (limmad + skruvad eller dymlad) – enklast
 *  - fingerskarv – stark och snygg, bordssåg med jigg eller handsåg + stämjärn
 *  - gering med kilar – inget ändträ syns, kap- & gersåg + spännband
 */
import type { Design, Material, Workshop } from "../types";
import { Builder, panel, pickPanel } from "./builder";
import { panelThickness } from "./cabinet";

export type Joinery = "stumfog" | "finger" | "gering";
type Bottom = "auto" | "spar" | "under" | "lister";

/** Helst en bräda som räcker till hela höjden (inga limfogar), annars skiva/limmade remsor. */
function pickBoxMaterial(ws: Workshop, H: number): Material {
  const boards = ws.materials.filter((m) => m.kind === "linear" && m.available && m.a <= 30 && m.b >= H).sort((a, b) => a.a - b.a || a.b - b.b);
  return boards[0] ?? pickPanel(ws, 22);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- Fogskisser (SVG)

const svgWrap = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" class="diagram" role="img" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="11">${body}</svg>`;
const WOOD = "#e6c893", WOOD2 = "#d4ae6e", LINE = "#6b4a1f";

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, dx = 0, dy = -6) {
  return `<g stroke="currentColor" stroke-width="0.8" opacity="0.8"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1 - 3}" x2="${x1}" y2="${y1 + 3}"/><line x1="${x2}" y1="${y2 - 3}" x2="${x2}" y2="${y2 + 3}"/></g>
  <text x="${(x1 + x2) / 2 + dx}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" fill="currentColor">${label}</text>`;
}

function buttDiagram(t: number, screws: boolean): string {
  const s = 120 / Math.max(t, 12); // skala: tjockleken ritas stort
  const T = Math.min(40, t * s);
  const body = `
    <rect x="30" y="40" width="230" height="${T}" fill="${WOOD}" stroke="${LINE}"/>
    <rect x="30" y="${40 + T}" width="${T}" height="120" fill="${WOOD2}" stroke="${LINE}"/>
    <text x="150" y="${40 + T / 2 + 4}" text-anchor="middle" fill="${LINE}">framsida (hel längd)</text>
    <text x="${30 + T / 2}" y="${40 + T + 70}" text-anchor="middle" fill="${LINE}" transform="rotate(-90 ${30 + T / 2} ${40 + T + 70})">gavel</text>
    ${screws
      ? `<line x1="${30 + T / 2}" y1="34" x2="${30 + T / 2}" y2="${40 + T + 45}" stroke="#2f6fd1" stroke-width="2" stroke-dasharray="4 2"/><circle cx="${30 + T / 2}" cy="36" r="4" fill="#2f6fd1"/>
         <text x="${50 + T}" y="${40 + T + 30}" fill="currentColor">skruv ${Math.max(3.5, Math.round(t / 5))}×${Math.round(t * 2.2 / 5) * 5} mm</text>
         <text x="${50 + T}" y="${40 + T + 44}" fill="currentColor">mitt i gavelns tjocklek (${r1(t / 2)} mm in)</text>`
      : `<rect x="${30 + T / 2 - 4}" y="${40 + T - 12}" width="8" height="34" rx="3" fill="#2f6fd1" opacity="0.8"/>
         <text x="${50 + T}" y="${40 + T + 30}" fill="currentColor">dymling Ø8 × 30 mm</text>`}
    ${dimLine(30, 25, 30 + T, 25, `${t} mm`)}
    <text x="${50 + T}" y="${40 + T + 70}" fill="currentColor" opacity="0.8">Sett uppifrån: framsidan</text>
    <text x="${50 + T}" y="${40 + T + 84}" fill="currentColor" opacity="0.8">täcker gavelns ände.</text>`;
  return svgWrap(300, 205, body);
}

function fingerDiagram(t: number, H: number, n: number): string {
  const sc = 150 / H;
  const fw = H / n;
  const T = Math.max(14, t * sc);
  // Två brädor "utvikta": A (fram/bak, börjar med finger nertill) och B (gavel, börjar med urtag)
  let a = "", b = "";
  for (let i = 0; i < n; i++) {
    const y = 180 - (i + 1) * fw * sc;
    if (i % 2 === 0) a += `<rect x="${130}" y="${y}" width="${T}" height="${fw * sc}" fill="${WOOD}" stroke="${LINE}"/>`;
    else b += `<rect x="${170 - T}" y="${y}" width="${T}" height="${fw * sc}" fill="${WOOD2}" stroke="${LINE}"/>`;
  }
  const body = `
    <rect x="20" y="30" width="110" height="150" fill="${WOOD}" stroke="${LINE}"/>${a}
    <rect x="170" y="30" width="110" height="150" fill="${WOOD2}" stroke="${LINE}"/>${b}
    <text x="75" y="105" text-anchor="middle" fill="${LINE}">fram/bak</text>
    <text x="225" y="105" text-anchor="middle" fill="${LINE}">gavel</text>
    ${dimLine(130, 22, 130 + T, 22, `${t} mm`, 0, -5)}
    <text x="150" y="198" text-anchor="middle" fill="currentColor">${n} fingrar à ${r1(fw)} mm</text>
    <text x="150" y="213" text-anchor="middle" fill="currentColor">fingrarnas djup = brädans tjocklek</text>`;
  return svgWrap(300, 220, body);
}

function miterDiagram(t: number): string {
  const T = 34;
  const body = `
    <polygon points="30,40 260,40 ${260 - T},${40 + T} ${30 + T},${40 + T}" fill="${WOOD}" stroke="${LINE}"/>
    <polygon points="30,40 ${30 + T},${40 + T} ${30 + T},190 30,190" fill="${WOOD2}" stroke="${LINE}"/>
    <polygon points="22,32 ${30 + T * 0.75},${40 + T * 0.75} 22,${40 + T * 0.75 + 8}" fill="#8e5b2b" opacity="0.85"/>
    <text x="150" y="${40 + T / 2 + 4}" text-anchor="middle" fill="${LINE}">framsida – 45° i båda ändar</text>
    <text x="${30 + T / 2}" y="130" text-anchor="middle" fill="${LINE}" transform="rotate(-90 ${30 + T / 2} 130)">gavel – 45°</text>
    <text x="${50 + T}" y="95" fill="currentColor">kil (3 mm) limmas i ett sågspår</text>
    <text x="${50 + T}" y="109" fill="currentColor">tvärs över hörnet, ca ${Math.round(t * 0.7)} mm djupt</text>
    <text x="${50 + T}" y="130" fill="currentColor">Långsidans mått = lådans YTTERmått</text>
    ${dimLine(260 - T, 22, 260, 22, `${t} mm`)}`;
  return svgWrap(300, 205, body);
}

function grooveDiagram(t: number, tb: number, g: number): string {
  // Genomskärning av väggens nederkant: väggen står till vänster, bottnen går in i spåret
  const s = 44 / Math.max(t, 10); // väggens tjocklek ritas ca 44 px
  const T = t * s, G = g * s, TB = Math.max(6, tb * s), up = Math.max(6, t / 2) * s;
  const x0 = 40, yBot = 185; // väggens nederkant
  const yB = yBot - up - TB; // bottnens översida
  const body = `
    <rect x="${x0}" y="20" width="${T}" height="${yBot - 20}" fill="${WOOD}" stroke="${LINE}"/>
    <rect x="${x0 + T - G}" y="${yB}" width="${G}" height="${TB}" fill="#ffffff" stroke="${LINE}"/>
    <rect x="${x0 + T - G + 2}" y="${yB + 1}" width="${260 - T + G}" height="${TB - 2}" fill="${WOOD2}" stroke="${LINE}"/>
    <text x="${x0 + T / 2}" y="40" text-anchor="middle" fill="${LINE}" transform="rotate(-90 ${x0 + T / 2} 60)">vägg</text>
    <text x="${x0 + T + 60}" y="${yB + TB / 2 + 4}" fill="${LINE}">botten ${tb} mm</text>
    <text x="${x0 + T + 14}" y="36" fill="currentColor">Spår ${g} mm djupt, ${tb} mm brett</text>
    <text x="${x0 + T + 14}" y="52" fill="currentColor">underkant ${Math.max(6, Math.round(t / 2))} mm upp.</text>
    <text x="${x0 + T + 14}" y="72" fill="currentColor">Bottnen limmas INTE –</text>
    <text x="${x0 + T + 14}" y="88" fill="currentColor">den ska kunna röra sig.</text>
    <line x1="${x0 + T + 8}" y1="${yBot}" x2="${x0 + T + 8}" y2="${yBot - up}" stroke="currentColor" stroke-width="0.8"/>
    <text x="${x0 + T + 12}" y="${yBot - up / 2 + 4}" fill="currentColor" font-size="10">${Math.max(6, Math.round(t / 2))} mm</text>`;
  return svgWrap(300, 200, body);
}

// ---------------------------------------------------------------- Generator

export function simpleBox(ws: Workshop, p: Design["params"], prompt: string): Design {
  const b = new Builder(ws);
  const W = +p.width, D = +p.depth, H = +p.height;
  const joinery = (p.joinery as Joinery) ?? "stumfog";
  const mat = pickBoxMaterial(ws, H);
  const t = panelThickness(b, mat, 15);
  const botMat = pickPanel(ws, 12);
  const tb = Math.min(panelThickness(b, botMat, 9), 12);
  const saw = b.has("bordssag"), router = b.has("overfras"), miterSaw = b.has("kapgersag");
  const fineSaw = b.has("ryggsag") || b.has("handsag");
  const chisel = b.has("stamjarn");
  const drill = b.has("skruvdragare") || b.has("borrmaskin");
  const band = b.has("bandtving");
  let bottom = (p.bottom as Bottom) ?? "auto";
  if (bottom === "auto") bottom = joinery === "stumfog" ? "under" : saw || router ? "spar" : "lister";
  if (bottom === "spar" && !saw && !router) {
    b.note("Spår för botten kräver bordssåg eller överfräs – bottnen läggs på lister i stället.");
    bottom = "lister";
  }
  const g = bottom === "spar" ? Math.round(Math.max(5, Math.min(8, t / 2))) : 0; // spårdjup
  const grooveY = Math.max(6, Math.round(t / 2)); // spårets underkant från lådans nederkant

  const wallY = bottom === "under" ? tb : 0;
  const wallH = H - wallY - (p.lid ? t : 0);
  // Fingerskarv: udda antal fingrar ca 1,3 × tjockleken breda
  let n = Math.max(3, Math.round(wallH / (1.3 * t)));
  if (n % 2 === 0) n += 1;

  // ----- Väggar
  const walls = "väggar";
  if (joinery === "stumfog") {
    b.unit = "Låda";
    panel(b, "Framsida", "långsidor", mat, { x: 0, y: wallY, z: D - t }, { x: W, y: wallH, z: t });
    panel(b, "Baksida", "långsidor", mat, { x: 0, y: wallY, z: 0 }, { x: W, y: wallH, z: t });
    panel(b, "Gavel V", "gavlar", mat, { x: 0, y: wallY, z: t }, { x: t, y: wallH, z: D - 2 * t });
    panel(b, "Gavel H", "gavlar", mat, { x: W - t, y: wallY, z: t }, { x: t, y: wallH, z: D - 2 * t });
  } else {
    // Fingerskarv och gering: alla fyra väggar är lika långa som lådans yttermått
    b.unit = "Låda";
    const fj = (start: 0 | 1) => ({ type: "finger" as const, count: n, start });
    const mj = (inward: 1 | -1) => ({ type: "miter" as const, inward });
    const ends: [number, number] = joinery === "gering" ? [45, 45] : [0, 0];
    b.box("Framsida", mat, { x: 0, y: wallY, z: D - t }, { x: W, y: wallH, z: t }, "långsidor", { joint: joinery === "finger" ? fj(0) : mj(-1), endCuts: ends });
    b.box("Baksida", mat, { x: 0, y: wallY, z: 0 }, { x: W, y: wallH, z: t }, "långsidor", { joint: joinery === "finger" ? fj(0) : mj(1), endCuts: ends });
    b.box("Gavel V", mat, { x: 0, y: wallY, z: 0 }, { x: t, y: wallH, z: D }, "gavlar", { joint: joinery === "finger" ? fj(1) : mj(1), endCuts: ends });
    b.box("Gavel H", mat, { x: W - t, y: wallY, z: 0 }, { x: t, y: wallH, z: D }, "gavlar", { joint: joinery === "finger" ? fj(1) : mj(-1), endCuts: ends });
    if (mat.kind === "linear" && wallH > mat.b + 1) b.note(`Väggarna är högre än brädan (${mat.b} mm) – limma först ihop brädor till skivor, låt torka ett dygn och hyvla/slipa plant innan du gör fogarna.`);
    if (joinery === "gering") {
      // Kilar: horisontella tunna plattor tvärs över varje hörn
      const k = wallH <= 100 ? 2 : 3;
      const corners: [number, number, number][] = [[0, 0, 45], [W, 0, -45], [0, D, -45], [W, D, 45]];
      b.unit = "Kilar";
      corners.forEach(([cx, cz, rot], ci) => {
        for (let i = 0; i < k; i++) {
          const y = wallY + (wallH * (i + 1)) / (k + 1);
          const inX = cx === 0 ? 1 : -1, inZ = cz === 0 ? 1 : -1;
          // Kilen ligger tvärs över hörnet och slipas jäms med ytorna (ritas helt innanför yttermåttet)
          b.box(`Kil ${ci + 1}.${i + 1}`, mat, { x: 0, y: 0, z: 0 }, { x: t * 1.1, y: 3, z: t * 0.4 }, "kilar", {
            pos: { x: cx + inX * t * 0.56, y, z: cz + inZ * t * 0.56 },
            rot: { x: 0, y: rot, z: 0 },
          });
        }
      });
    }
    b.note(joinery === "finger"
      ? `Fingerskarv: ${n} fingrar à ${r1(wallH / n)} mm. Fram- och baksidan börjar med finger nertill, gavlarna med urtag.`
      : "Gering: alla fyra väggarna kapas till lådans yttermått med 45° i båda ändar – långsidorna lika långa, gavlarna lika långa.");
  }
  void walls;

  // ----- Botten
  b.unit = "Botten";
  if (bottom === "under") {
    panel(b, "Botten", "botten", botMat, { x: 0, y: 0, z: 0 }, { x: W, y: tb, z: D });
  } else if (bottom === "spar") {
    const inset = t - g + 1; // bottnen går in i spåret, 1 mm luft i botten av spåret
    panel(b, "Botten (i spår)", "botten", botMat, { x: inset, y: grooveY, z: inset }, { x: W - 2 * inset, y: tb, z: D - 2 * inset });
  } else {
    const ls = Math.max(10, Math.min(15, t));
    const lm = mat;
    b.box("Bottenlist fram", lm, { x: t, y: 0, z: D - t - ls }, { x: W - 2 * t, y: ls, z: ls }, "botten");
    b.box("Bottenlist bak", lm, { x: t, y: 0, z: t }, { x: W - 2 * t, y: ls, z: ls }, "botten");
    panel(b, "Botten (på lister)", "botten", botMat, { x: t + 1, y: ls, z: t + 1 }, { x: W - 2 * t - 2, y: tb, z: D - 2 * t - 2 });
  }

  // ----- Lock
  if (p.lid) {
    b.unit = "Lock";
    panel(b, "Lock", "lock", mat, { x: 0, y: H - t, z: 0 }, { x: W, y: t, z: D });
    const cl = Math.max(10, Math.min(20, t));
    b.box("Lockribba V", mat, { x: t + 1, y: H - t - cl, z: t + 20 }, { x: cl, y: cl, z: D - 2 * t - 40 }, "lock");
    b.box("Lockribba H", mat, { x: W - t - 1 - cl, y: H - t - cl, z: t + 20 }, { x: cl, y: cl, z: D - 2 * t - 40 }, "lock");
  }
  b.unit = null;

  // ----- Beslag
  b.hw("Trälim (vattenfast, t.ex. D3)", 1, "flaska");
  b.hw("Maskeringstejp", 1, "rulle");
  if (joinery === "stumfog") {
    if (drill) b.hw(`Träskruv ${Math.max(3.5, Math.round(t / 5))}×${Math.round((t * 2.2) / 5) * 5}`, 12);
    else b.hw("Dyckert/spik 1,6×40 (om skruvdragare saknas)", 16);
  }
  if (joinery === "gering") b.hw("Kilar: tunna remsor 3 mm (spill, fanér eller kontrastträ)", 1, "sats");
  if (bottom === "under") b.hw("Dyckert/skruv 3×25 (botten)", 12);
  if (bottom === "lister") b.hw("Dyckert 1,6×25 (lister)", 8);
  if (!band && joinery !== "stumfog") b.hw("Spännband / bandtving (om du saknar tvingar)", 1);

  // ----- Byggsteg
  const cutTool = miterSaw ? "kap- & gersågen" : saw ? "bordssågen" : "handsågen";
  b.step("Förbered virket", `Välj raka, plana brädor utan sprickor och stora kvistar. Märk ut en "god sida" (utsidan) och en "god kant" (nederkant) på varje bit – alla mått tas från dem. ${mat.kind === "sheet" ? "" : "Mät tjockleken med skjutmått: fogarna ritas efter den verkliga tjockleken, inte den nominella."}`, []);
  if (joinery === "stumfog") {
    b.step("Kapa väggarna", `Kapa fram- och baksida till ${W} mm och gavlarna till ${D - 2 * t} mm (= djupet minus två tjocklekar). Kapa på ${cutTool} mot ett stoppklossanslag så att par blir exakt lika långa. Kontrollera att ändarna är vinkelräta med vinkelhake – en sned ände ger glipa.`, []);
  } else if (joinery === "finger") {
    b.step("Kapa väggarna", `Kapa alla fyra väggar till lådans yttermått: fram/bak ${W} mm, gavlar ${D} mm. ${saw ? "Lägg till 0,5 mm på fingrarna så de sticker ut lite – de slipas jämna sist." : "Kapa extra noga vinkelrätt – hela fogen utgår från änden."}`, []);
  } else {
    b.step("Kapa geringarna", `Ställ sågen på exakt 45° ${miterSaw ? "(provkapa två spillbitar och kontrollera att de blir 90° tillsammans med vinkelhake)" : saw ? "(luta klingan 45° och provkapa)" : "(använd en geringslåda och en fin såg)"}. Kapa långsidorna till ${W} mm och gavlarna till ${D} mm, mätt på YTTERsidan. Kapa par mot samma stoppkloss – om motstående sidor skiljer 1 mm blir lådan skev.`, []);
  }
  if (bottom === "spar") b.step("Spår för botten", `Såga eller fräs ett spår på insidan av alla fyra väggar: ${g} mm djupt, ${tb} mm brett, med underkanten ${grooveY} mm från nederkanten. ${saw ? "På bordssågen: klinghöjd " + g + " mm, parallellanslaget " + grooveY + " mm, två–tre pass tills bottenskivan passar." : "Med överfräs: spårfräs, parallellanslag och flera tag."} ${joinery === "stumfog" ? "Spåret syns i gavlarnas ändar – det gör inget, eller fyll med en liten träbit." : joinery === "finger" ? "Lägg spåret inom det nedersta fingret på gavlarna så det inte syns utifrån." : "Med gering syns spåret inte alls."} Kapa bottnen till innermått + 2×${g - 1} mm.`, []);

  if (joinery === "stumfog") {
    b.step("Provmontera och märk", "Ställ upp lådan utan lim och håll ihop den med tejp eller tvingar. Kontrollera att den står plant och att hörnen är raka. Märk hörnen (A–A, B–B …) så bitarna hamnar på samma plats vid limningen.", ["långsidor", "gavlar"]);
    b.step("Förborra", drill
      ? `Rita en linje ${r1(t / 2)} mm från ändarna på fram- och baksidan. Borra tre hål per ände (${Math.round(wallH * 0.15)} mm från kanterna och ett i mitten), Ø3 mm genom framsidan och Ø2 mm en bit in i gaveln. Försänk så skruvhuvudet hamnar i nivå – eller borra Ø8 för en träplugg över skruven om den inte ska synas.`
      : "Utan skruvdragare: förborra för dyckert (Ø1,5 mm) så att tunna brädor inte spricker, och spika med dyckert 1,6×40.", []);
    b.step("Limma och skruva", "Stryk lim på gavlarnas ändträ – ändträ suger, så stryk en tunn första gång, vänta fem minuter och stryk igen. Skruva ihop ett hörn i taget. Mät diagonalerna: de ska vara lika långa – är de inte det, tryck ihop den långa diagonalen tills de är lika. Torka bort limsvett med en fuktig trasa direkt.", ["långsidor", "gavlar"]);
  } else if (joinery === "finger") {
    if (saw) {
      b.step("Bygg en fingerskarvsjigg", `Skruva en hjälpanslag av plywood på bordssågens geringsanslag. Såga ett spår ${r1(wallH / n)} mm brett (= fingerbredden, gärna med flera pass eller ett spårklingpaket) och ${t + 0.5} mm högt. Limma in en tapp i spåret. Flytta anslaget så att det är exakt en fingerbredd mellan tappen och klingan. Provsåga i spill tills fogen går ihop med handkraft – för trång: flytta anslaget 0,2 mm; för glapp: tvärtom.`, []);
      b.step("Såga fingrarna", "Fram- och baksida: ställ brädan mot tappen med nederkanten nedåt och såga första urtaget, flytta så urtaget sitter över tappen, såga nästa, osv. Gavlarna: börja med att lägga en fram-/baksida mot tappen som distans så att gavlarna börjar med ett urtag. Såga alltid med den goda sidan mot anslaget och samma kant nedåt.", []);
    } else {
      b.step("Rita fogarna", `Ställ märkmått (eller rita med vinkelhake och vass blyerts/kniv) på ${t} mm – brädans verkliga tjocklek – och rita en baslinje runt båda ändarna på alla fyra väggar. Dela höjden i ${n} lika delar (${r1(wallH / n)} mm) och rita linjerna vinkelrätt ned till baslinjen. Kryssa för det som ska bort: på fram/bak de jämna fälten (2, 4 …), på gavlarna de udda (1, 3 …).`, []);
      b.step("Såga och stämma", `${fineSaw ? "Såga med japansåg/ryggsåg" : "Såga med en fin handsåg"} på AVFALLSSIDAN av linjerna, rakt ned till baslinjen – aldrig förbi. ${chisel ? "Stämma bort avfallet med ett stämjärn som är lite smalare än urtaget: ställ eggen på baslinjen, slå lätt, vänd brädan och stämma halvvägs från andra sidan så att kanten inte slits upp." : "Utan stämjärn: såga flera snitt i avfallet och bryt loss bitarna, putsa sedan botten med en fil – ett stämjärn (12–20 mm) gör det mycket enklare."} Putsa tills fogen går ihop med lätta slag med en trähammare.`, []);
      if (!chisel) b.note("Fingerskarv för hand går mycket lättare med ett stämjärn – bocka i det under Verktyg om du har ett.");
    }
    b.step("Provmontera", "Sätt ihop alla fyra hörnen utan lim. Fogarna ska gå ihop med lätta slag – går de för trångt, putsa sidan på fingret (inte baslinjen). Kontrollera att lådan är rätvinklig och att botten (om den ligger i spår) passar.", ["långsidor", "gavlar"]);
    b.step("Limma", `Stryk lim sparsamt på fingrarnas sidor (inte i botten av urtagen). ${bottom === "spar" ? "Lägg in bottnen i spåret UTAN lim – den ska kunna röra sig med fukten. " : ""}Knacka ihop och spänn med ${band ? "spännband" : "tvingar (lägg klossar så trycket hamnar på fogen)"}. Mät diagonalerna. Låt torka minst en timme innan du släpper spännet.`, ["långsidor", "gavlar"]);
    b.step("Planslipa hörnen", "När limmet torkat: slipa eller hyvla fingrarna i nivå med ytorna. Slipa från hörnet in mot mitten så att fibrerna inte rivs upp.", []);
  } else {
    b.step("Tejpa och limma (tejptricket)", `Lägg de fyra väggarna i rad med utsidan UPP och geringarna tätt mot varandra: fram – gavel – bak – gavel. Tejpa över fogarna med maskeringstejp, tryck till ordentligt. Vänd hela raden. ${bottom === "spar" ? "Lägg bottnen i spåret (utan lim). " : ""}Stryk lim på geringarna – ändträ suger, stryk två gånger. Vik ihop lådan som en dragspelsbälg och tejpa sista hörnet. ${band ? "Spänn med spännband." : "Spänn med ett spännband eller flera varv tejp – tvingar fungerar dåligt på gering."} Mät diagonalerna.`, ["långsidor", "gavlar"]);
    b.step("Såga spår för kilar", `När limmet torkat (gärna över natten): bygg ett enkelt V-block (två brädbitar skruvade i 90°) som lådan kan ligga i med hörnet uppåt. Såga ${wallH <= 100 ? "två" : "tre"} spår per hörn, ${Math.round(t * 0.7)} mm djupa, med ${fineSaw ? "japansåg/ryggsåg" : "en fin såg"} – använd en kloss som styrning så spåren blir raka.${saw ? " (Eller på bordssågen med lådan i en 45°-jigg.)" : ""}`, []);
    b.step("Limma i kilar", "Kapa kilar av 3 mm tunna remsor (spill, fanér eller ett kontrastträ som ek/valnöt), lite för stora. Stryk lim och tryck in dem med fibrerna längs lådans kant. När limmet torkat: såga av överskottet med en fin såg och slipa jämnt.", ["kilar"]);
  }

  if (bottom === "under") b.step("Botten", `Kapa bottnen till ${W}×${D} mm (lådans yttermått). Stryk lim på väggarnas underkant, lägg på bottnen, rikta in kanterna och spika/skruva var 10:e cm.`, ["botten"]);
  if (bottom === "lister") b.step("Botten", "Limma och dyckerta bottenlisterna på insidan av fram- och baksidan, i nederkant. Lägg bottnen på listerna – limma den gärna fast, den gör lådan styvare.", ["botten"]);
  if (p.lid) b.step("Lock", "Kapa locket till lådans yttermått. Limma ribborna under locket en millimeter innanför väggarna – de håller locket på plats och rakt.", ["lock"]);
  b.step("Slipa och avsluta", "Slipa utsidan (korn 120 → 180), bryt alla kanter lätt och välj ytbehandling under fliken Ytbehandling.", []);

  // ----- Skisser
  const diagrams: NonNullable<Design["diagrams"]> = [];
  if (joinery === "stumfog") diagrams.push({ title: "Stumfog – hörnet uppifrån", svg: buttDiagram(t, drill), caption: "Enklast: framsidan täcker gavelns ände. Lim + skruv (eller dymlingar) håller." });
  if (joinery === "finger") {
    diagrams.push({ title: "Fingerskarv – brädornas ändar", svg: fingerDiagram(t, wallH, n), caption: "Fingrarna på fram/bak passar i urtagen på gavlarna. Mycket limyta – stark fog." });
  }
  if (joinery === "gering") diagrams.push({ title: "Gering med kil – hörnet uppifrån", svg: miterDiagram(t), caption: "45° i båda ändar, inget ändträ syns. Kilarna gör fogen stark." });
  if (bottom === "spar") diagrams.push({ title: "Botten i spår – genomskärning", svg: grooveDiagram(t, tb, g), caption: "Utan lim i spåret spricker inte lådan när träet rör sig med fukten." });

  // ----- Tips och varningar
  if (joinery === "gering" && !miterSaw && !saw) b.note("Utan kap- & gersåg eller bordssåg: använd en geringslåda och en fin såg, och justera geringarna med en slipkloss på en plan skiva.");
  if (joinery === "finger" && !saw && !fineSaw) b.note("Fingerskarv kräver en fin såg (japansåg/ryggsåg) eller bordssåg.");
  if (mat.kind === "sheet") b.note(`${mat.name}: ${joinery === "gering" ? "geringen döljer skivans kanter fint." : "skivans skikt syns i fogarna – det kan vara snyggt, eller använd massivt trä."}`);
  b.note("Var metodisk: mät två gånger, kapa en gång, provmontera alltid innan du limmar.");

  const title = `Låda ${W}×${D}×${H} – ${joinery === "stumfog" ? "stumfog" : joinery === "finger" ? "fingerskarv" : "gering med kilar"}`;
  const d = b.design(title, prompt, "box", p);
  d.diagrams = diagrams;
  return d;
}
