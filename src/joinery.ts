/**
 * Fogguide: fogar som går att göra med en japansåg och en tving (plus lim, blyerts, vinkelhake och
 * sandpapper). Varje guide har användning, svårighet, steg-för-steg, skiss och vanliga misstag.
 */

export interface JoineryGuide {
  id: string;
  name: string;
  /** Vad fogen passar till */
  use: string;
  /** 1–3 */
  difficulty: number;
  strength: number;
  time: string;
  /** Verktyg som krävs (id:n i verktygslistan) och bra-att-ha */
  tools: string[];
  optional: string[];
  /** Förbrukning/småsaker */
  need: string[];
  intro: string;
  steps: { title: string; text: string; clamp?: string }[];
  mistakes: { problem: string; fix: string }[];
  svg: string;
}

const W1 = "#e6c893", W2 = "#d4ae6e", L = "#6b4a1f", CUT = "#c0392b", CL = "#2f6fd1";
const wrap = (body: string, h = 210) =>
  `<svg viewBox="0 0 320 ${h}" class="diagram" role="img" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="11">${body}</svg>`;
const txt = (x: number, y: number, s: string, anchor = "start", fill = "currentColor") => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}">${s}</text>`;
/** Enkel tving sedd från sidan */
const clamp = (x: number, y: number, h: number) =>
  `<g stroke="${CL}" stroke-width="3" fill="none"><path d="M${x} ${y} h14 v${h} h-14"/></g><rect x="${x - 4}" y="${y - 3}" width="10" height="6" fill="${CL}"/><rect x="${x - 4}" y="${y + h - 3}" width="10" height="6" fill="${CL}"/>`;

// ---------------------------------------------------------------- Skisser

const SVG_BASICS = wrap(`
  <rect x="20" y="120" width="280" height="14" fill="${W2}" stroke="${L}"/>
  <rect x="20" y="134" width="14" height="16" fill="${W1}" stroke="${L}"/>
  <rect x="270" y="104" width="14" height="16" fill="${W1}" stroke="${L}"/>
  ${txt(160, 130, "bänkhake (plywood)", "middle", L)}
  ${txt(20, 168, "list under hakar i bordskanten", "start")}
  ${txt(300, 86, "anslag", "end")}
  <rect x="60" y="92" width="210" height="28" fill="${W1}" stroke="${L}" opacity="0.95"/>
  ${txt(120, 110, "arbetsstycke", "middle", L)}
  <rect x="150" y="62" width="26" height="30" fill="${W2}" stroke="${L}"/>
  ${txt(163, 56, "sågkloss", "middle")}
  <line x1="177" y1="20" x2="177" y2="120" stroke="${CUT}" stroke-width="2" stroke-dasharray="5 3"/>
  ${txt(182, 24, "bladet löper", "start", CUT)}
  ${txt(182, 38, "mot klossen", "start", CUT)}
  ${clamp(150, 62, 58)}
  ${txt(20, 188, "Tvingen håller sågklossen och", "start")}
  ${txt(20, 202, "arbetsstycket mot bänkhaken.", "start")}
`);

const SVG_BLOCK = wrap(`
  <rect x="40" y="40" width="200" height="30" fill="${W1}" stroke="${L}"/>
  <rect x="40" y="70" width="30" height="110" fill="${W2}" stroke="${L}"/>
  <polygon points="70,70 110,70 70,110" fill="#b98545" stroke="${L}"/>
  ${txt(150, 60, "låda-/skåpsida", "middle", L)}
  ${txt(55, 150, "gavel", "middle", L)}
  ${txt(120, 100, "hörnkloss 20×20 mm", "start")}
  ${txt(120, 114, "limmad i båda riktningarna", "start")}
  ${txt(120, 140, "Ändträ mot sidoträ håller dåligt.", "start")}
  ${txt(120, 154, "Klossen ger långa limfogar", "start")}
  ${txt(120, 168, "sida mot sida – starkast.", "start")}
`);

const SVG_RABBET = wrap(`
  <rect x="30" y="60" width="200" height="40" fill="${W1}" stroke="${L}"/>
  <rect x="200" y="60" width="30" height="20" fill="#fff" stroke="${CUT}" stroke-dasharray="4 2"/>
  <line x1="200" y1="30" x2="200" y2="80" stroke="${CUT}" stroke-width="2"/>
  ${txt(196, 26, "1. ansats", "end", CUT)}
  <line x1="195" y1="80" x2="250" y2="80" stroke="${CUT}" stroke-width="2"/>
  ${txt(252, 96, "2. klyv", "start", CUT)}
  ${txt(110, 84, "långsida (framsida)", "middle", L)}
  <line x1="200" y1="110" x2="230" y2="110" stroke="currentColor"/>${txt(215, 124, "t", "middle")}
  <line x1="240" y1="60" x2="240" y2="80" stroke="currentColor"/>${txt(246, 72, "r ≈ t/2", "start")}
  ${txt(30, 50, "insida", "start")}
  <rect x="200" y="140" width="30" height="60" fill="${W2}" stroke="${L}"/>
  <rect x="30" y="140" width="200" height="40" fill="${W1}" stroke="${L}"/>
  <rect x="200" y="140" width="30" height="20" fill="${W2}" stroke="${L}"/>
  ${txt(110, 164, "färdig fals med gaveln på plats", "middle", L)}
`);

const SVG_LAP = wrap(`
  <rect x="20" y="40" width="170" height="40" fill="${W1}" stroke="${L}"/>
  <rect x="150" y="40" width="40" height="20" fill="#fff" stroke="${CUT}" stroke-dasharray="4 2"/>
  ${txt(90, 66, "bit A – urtag uppifrån", "middle", L)}
  <rect x="210" y="20" width="40" height="160" fill="${W2}" stroke="${L}"/>
  <rect x="230" y="20" width="20" height="40" fill="#fff" stroke="${CUT}" stroke-dasharray="4 2"/>
  ${txt(230, 120, "bit B", "middle", L)}
  ${txt(236, 196, "urtag underifrån", "middle")}
  <line x1="150" y1="30" x2="150" y2="60" stroke="${CUT}" stroke-width="2"/>${txt(148, 26, "ansats = B:s bredd", "end", CUT)}
  <line x1="150" y1="60" x2="198" y2="60" stroke="${CUT}" stroke-width="2"/>
  ${txt(20, 110, "Båda bitarna tappar halva tjockleken", "start")}
  ${txt(20, 124, "över den andras bredd. Märk halva", "start")}
  ${txt(20, 138, "tjockleken från SAMMA sida (ytsidan)", "start")}
  ${txt(20, 152, "på båda – då hamnar ytorna i nivå.", "start")}
`);

const SVG_CROSS = wrap(`
  <rect x="20" y="70" width="280" height="44" fill="${W1}" stroke="${L}"/>
  <rect x="130" y="70" width="46" height="22" fill="#fff" stroke="${CUT}" stroke-dasharray="4 2"/>
  <line x1="130" y1="50" x2="130" y2="92" stroke="${CUT}" stroke-width="2"/>
  <line x1="176" y1="50" x2="176" y2="92" stroke="${CUT}" stroke-width="2"/>
  ${[141, 153, 165].map((x) => `<line x1="${x}" y1="60" x2="${x}" y2="92" stroke="${CUT}" stroke-width="1.2"/>`).join("")}
  ${txt(153, 30, "ansatser + extra", "middle", CUT)}
  ${txt(153, 44, "sågspår var 4–6 mm", "middle", CUT)}
  ${txt(153, 108, "halva tjockleken", "middle", L)}
  ${txt(20, 140, "Bryt bort bitarna mellan spåren", "start")}
  ${txt(20, 154, "med skruvmejsel eller hammare.", "start")}
  ${txt(20, 172, "Plana botten med fil eller sandpapper", "start")}
  ${txt(20, 186, "på en kloss – kontrollera med linjal.", "start")}
`);

const SVG_MITER = wrap(`
  <rect x="30" y="60" width="200" height="34" fill="${W1}" stroke="${L}"/>
  <polygon points="200,60 230,60 230,94" fill="#fff" stroke="${CUT}" stroke-dasharray="4 2"/>
  <polygon points="150,26 190,26 230,60 190,60" fill="${W2}" stroke="${L}"/>
  ${txt(170, 16, "45°-sågkloss, spänd med tvingen", "middle")}
  <line x1="196" y1="44" x2="238" y2="98" stroke="${CUT}" stroke-width="2"/>
  ${txt(100, 82, "sida", "middle", L)}
  ${txt(20, 120, "45° utan gersåg: mät 50 mm på två", "start")}
  ${txt(20, 134, "kanter av en kloss, dra linjen = 45°.", "start")}
  ${txt(20, 158, "Kilar: såga spår tvärs över hörnet,", "start")}
  ${txt(20, 172, "limma i tunna remsor, såga och", "start")}
  ${txt(20, 186, "slipa jäms.", "start")}
`);

// ---------------------------------------------------------------- Guiderna

export const GUIDES: JoineryGuide[] = [
  {
    id: "grunder",
    name: "Grunderna: japansåg, bänkhake och sågkloss",
    use: "Läs först – det här gör alla fogar raka och täta med bara såg och tving.",
    difficulty: 1, strength: 0, time: "1 h att bygga hjälpmedlen",
    tools: ["ryggsag", "tving"], optional: [],
    need: ["Plywood- eller brädbit ca 300×200 mm", "Två lister", "Lim/skruv", "Vass blyerts eller kniv", "Vinkelhake", "Maskeringstejp"],
    intro: "En japansåg sågar på DRAGslaget och har ett tunt blad – den ger fina, raka snitt om man låter den arbeta och styr den mot en kloss. Tvingen blir din tredje hand: den håller arbetsstycket still och sågklossen på plats.",
    steps: [
      { title: "Håll sågen rätt", text: "Håll lätt längst bak på handtaget, med pekfingret längs sidan. Dra sågen mot dig med långa, lugna drag och tryck inte när du för den framåt. Trycker du hårt böjer sig det tunna bladet och snittet går snett." },
      { title: "Rita med kniv och vinkelhake", text: "Rita linjen runt ALLA synliga sidor med vinkelhake – helst med en vass kniv, annars med en mycket vass blyerts. Kryssa för avfallet. Sågspåret är ca 0,5–1 mm brett: såga alltid på avfallssidan så att linjen står kvar. Då blir fogen tät." },
      { title: "Bygg en bänkhake", text: "Skruva eller limma en list under ena kortsidan av plywoodbiten (den hakar i bordskanten) och en list ovanpå motsatta kortsida (anslag för arbetsstycket). Tryck arbetsstycket mot anslaget när du sågar – bänkhaken tar emot trycket.", clamp: "Spänn fast bänkhaken i bordet med tvingen om den glider." },
      { title: "Gör en sågkloss (guide)", text: "Ta en rak kloss, t.ex. en regelbit 45×45 × 150 mm. Kapa ena änden, kontrollera mot vinkelhaken åt båda hållen och putsa med sandpapper på en plan skiva tills den är exakt vinkelrät. Gör gärna en med 45° ände också (se Gering)." },
      { title: "Såga mot klossen", text: "Lägg klossen med den vinkelräta änden precis intill linjen, på den sida av linjen som ska stå kvar. Håll bladet plant mot klossen hela vägen – då blir snittet både rakt och vinkelrätt utan att du behöver sikta.", clamp: "Spänn klossen och arbetsstycket tillsammans med tvingen. Kontrollera att klossen inte flyttat sig när tvingen dragits åt." },
      { title: "Starta och håll djupet", text: "Starta med korta drag i bortre hörnet med tummen som stöd mot bladet. Sänk sedan sågen och följ linjen på två sidor samtidigt. För snitt som ska sluta på ett visst djup: sätt en tejpbit på bladet vid rätt djup och sluta när tejpen når ytan." },
      { title: "Putsa med slipkloss", text: "Limma eller tejpa sandpapper (korn 80–120) på en plan skiva eller rak kloss. Dra fogens ytor mot papperet i stället för tvärtom – då hålls ytorna plana. Provpassa ofta: det är lätt att ta bort, omöjligt att sätta tillbaka." },
      { title: "Provfoga i spill", text: "Gör alltid första fogen i en spillbit av samma virke. Det tar tio minuter och visar direkt om du sågar på rätt sida av linjen." },
    ],
    mistakes: [
      { problem: "Snittet vandrar åt sidan", fix: "Du trycker för hårt eller vrider handleden. Släpp greppet, låt sågens vikt räcka och använd sågkloss." },
      { problem: "Fogen blir glapp", fix: "Du har sågat på linjen eller på fel sida. Såga på avfallssidan – linjen ska synas kvar." },
      { problem: "Klossen glider under sågning", fix: "Spänn tvingen hårdare och lägg sandpapper mellan kloss och arbetsstycke för bättre grepp." },
    ],
    svg: SVG_BASICS,
  },
  {
    id: "hornkloss",
    name: "Stumfog med hörnkloss",
    use: "Lådor, skåp, sargar – den enklaste fogen som ändå håller bra utan skruv.",
    difficulty: 1, strength: 2, time: "15 min per hörn",
    tools: ["ryggsag", "tving"], optional: ["skruvdragare"],
    need: ["Trälim", "Lister ca 20×20 mm (kan klyvas ur spill)", "Vinkelhake"],
    intro: "Ändträ som limmas mot sidoträ håller dåligt. En liten kloss i innerhörnet ger i stället två långa limfogar sida-mot-sida – starkt, enkelt och helt dolt.",
    steps: [
      { title: "Kapa bitarna vinkelrätt", text: "Kapa sidorna med sågkloss i bänkhaken. Par ska vara exakt lika långa – kapa det andra paret mot en kloss som är fastspänd som stopp." },
      { title: "Kapa hörnklossarna", text: "Kapa en list 20×20 mm (eller något tunnare än sidornas höjd) i bitar lika långa som lådans invändiga höjd minus 2 mm." },
      { title: "Limma första hörnet", text: "Stryk lim på gavelns ände (två gånger – ändträ suger) och ställ den mot sidans insida. Stryk lim på två sidor av hörnklossen och tryck in den i hörnet. Kontrollera vinkeln med vinkelhake.", clamp: "Spänn tvingen över hörnklossen: ena käften på klossen, andra på utsidan – med en skyddsbit under käften. Vänta 20–30 minuter innan du flyttar tvingen till nästa hörn." },
      { title: "Resten av hörnen", text: "Gör hörn för hörn. Med en enda tving tar det sin tid – använd väntetiden till att förbereda nästa hörn. Dyckert eller en skruv genom sidan in i klossen låter dig flytta tvingen direkt." },
      { title: "Kontrollera diagonalerna", text: "När alla fyra hörn sitter: mät diagonalerna. Är de olika, tryck ihop den långa diagonalen försiktigt medan limmet fortfarande är mjukt." },
    ],
    mistakes: [
      { problem: "Hörnet blir inte 90°", fix: "Kontrollera med vinkelhake innan tvingen dras åt helt, och lägg en rät kloss i hörnet som mall." },
      { problem: "Limfläckar på utsidan", fix: "Torka bort med fuktig trasa direkt – torkat lim tar inte olja eller bets." },
    ],
    svg: SVG_BLOCK,
  },
  {
    id: "fals",
    name: "Falsfog (fals)",
    use: "Lådor och skåp: bitarna hittar sin plats själva, mer limyta och bara lite ändträ syns.",
    difficulty: 1, strength: 2, time: "20 min per hörn",
    tools: ["ryggsag", "tving"], optional: ["stamjarn", "skruvdragare"],
    need: ["Trälim", "Vinkelhake", "Tumstock/skjutmått", "Slipkloss"],
    intro: "En fals är ett L-format urtag i änden på långsidan som gaveln passar in i. Den görs med två sågsnitt per ände – ett tvärs (ansatsen) och ett längs (klyvsnittet). Enkelt, men klart starkare och snyggare än en stumfog.",
    steps: [
      { title: "Mät gavelns tjocklek", text: "Mät tjockleken (t) på brädan som ska sitta i falsen – på riktigt, med skjutmått. Falsens bredd = t. Falsens djup (r) = ungefär halva långsidans tjocklek." },
      { title: "Rita", text: "På långsidans INSIDA: en linje tvärs, t mm från änden (ansatsen). På båda kanterna och på änden: en linje r mm från insidan (djupet). Kryssa för avfallet (hörnet som ska bort)." },
      { title: "Såga ansatsen", text: "Lägg brädan i bänkhaken med insidan upp. Sätt sågklossen på den sida av ansatslinjen som ska stå kvar. Sätt en tejpbit på bladet på djupet r och såga ned till djuplinjen på båda kanterna – inte djupare.", clamp: "Spänn sågklossen och brädan mot bänkhaken med tvingen." },
      { title: "Såga klyvsnittet", text: "Ställ brädan upp med änden uppåt. Såga längs djuplinjen i änden, på avfallssidan, ned till ansatsen. Luta sågen lite mot dig så att du ser linjen på änden och kanten samtidigt, såga halvvägs, vänd brädan och såga från andra kanten, avsluta rakt.", clamp: "Spänn brädan stående mot bordsbenet eller bordskanten med tvingen, med en skyddsbit under käften." },
      { title: "Putsa falsen", text: "Avfallsbiten lossnar. Putsa falsens botten och ansats med slipklossen tills gaveln ligger an tätt och dess utsida går jäms med långsidans ände. Ett stämjärn går fortare, men slipklossen räcker." },
      { title: "Provmontera", text: "Sätt ihop hela lådan utan lim. Alla fyra hörn ska gå ihop utan att du behöver trycka hårt." },
      { title: "Limma", text: "Stryk lim i falsen (båda ytorna) och på gavelns ände. Tryck ihop och kontrollera vinkeln.", clamp: "Spänn tvingen tvärs över lådan – från ena långsidan till den andra – så pressas båda gavlarna in i sina falsar samtidigt. Lägg klossar under käftarna. Med en tving: limma två hörn, spänn, vänta 30 min, gör sedan resten. Dyckert genom långsidan in i gaveln håller ihop fogen medan limmet torkar." },
      { title: "Diagonaler och avslut", text: "Mät diagonalerna medan limmet är mjukt. När det torkat: slipa gavelns ände jäms med långsidan." },
    ],
    mistakes: [
      { problem: "Springa synlig vid ansatsen", fix: "Ansatsen är sågad för djupt eller snett. Använd tejp på bladet som djupstopp och sågkloss." },
      { problem: "Gaveln sticker ut", fix: "Falsen är för smal – putsa ansatsen med slipklossen tills gaveln går jäms." },
      { problem: "Långsidan spricker vid falsen", fix: "Falsen är för djup. Gör den högst halva tjockleken." },
    ],
    svg: SVG_RABBET,
  },
  {
    id: "hornbladning",
    name: "Hörnbladning (halvt överlapp)",
    use: "Ramar av regel eller läkt: bänkar, bordsramar, hyllgavlar, dörrar till katt-patio.",
    difficulty: 1, strength: 3, time: "20–30 min per hörn",
    tools: ["ryggsag", "tving"], optional: ["skruvdragare", "stamjarn"],
    need: ["Trälim", "Vinkelhake", "Tumstock", "Ev. 2 skruvar per fog"],
    intro: "Båda bitarna tappar halva tjockleken där de möts, så att de går omlott och ytorna hamnar i nivå. Mycket limyta – en av de starkaste fogarna för ramar, och helt görbar med bara såg.",
    steps: [
      { title: "Rita bredden direkt från den andra biten", text: "Lägg bitarna i kors precis som de ska sitta. Rita längs den andra bitens kant – det blir exaktare än att mäta. Dra linjen runt alla fyra sidor med vinkelhake." },
      { title: "Märk halva tjockleken från samma sida", text: "Mät halva tjockleken och rita på båda kanterna och på änden. Mät från YTSIDAN (den som ska synas) på båda bitarna – på bit A tas urtaget från ytsidan, på bit B från baksidan. Då blir ytorna jäms även om tjockleken inte är exakt." },
      { title: "Såga ansatsen", text: "Lägg biten i bänkhaken, sågklossen på den sida som ska stå kvar, och såga ned till mittlinjen på båda kanterna. Tejp på bladet som djupstopp.", clamp: "Spänn kloss och bit mot bänkhaken med tvingen." },
      { title: "Såga klyvsnittet", text: "Ställ biten med änden upp och såga längs mittlinjen, på avfallssidan, ned till ansatsen. Såga snett från ena kanten, vänd, snett från andra, avsluta rakt – då följer du linjen på tre sidor.", clamp: "Spänn biten stående mot bordskanten med tvingen." },
      { title: "Upprepa på bit B", text: "Samma sak, men urtaget på motsatt sida (baksidan)." },
      { title: "Provpassa", text: "Lägg ihop bitarna. Ytorna ska ligga jäms och hörnet vara 90°. För tjockt: putsa urtagets botten med slipklossen. För tunt: det kan fixas med ett tunnt spån limmat i botten." },
      { title: "Limma (och skruva)", text: "Stryk lim på båda urtagens ytor, lägg ihop och kontrollera vinkeln med vinkelhake. Två förborrade skruvar diagonalt genom fogen gör den ännu starkare och låter dig ta bort tvingen direkt.", clamp: "Spänn tvingen mitt över fogen med skyddsklossar. Kontrollera vinkeln igen efter åtdragning – tvingen kan vrida bitarna." },
    ],
    mistakes: [
      { problem: "Ytorna hamnar inte i nivå", fix: "Du har märkt halva tjockleken från olika sidor. Märk alltid från ytsidan på båda bitarna." },
      { problem: "Fogen glappar i bredd", fix: "Ansatsen sågad på linjen i stället för på avfallssidan. Rita bredden direkt från den andra biten." },
      { problem: "Klyvsnittet går snett ned i biten", fix: "Såga från båda kanterna in mot mitten och kontrollera linjerna på båda sidor ofta." },
    ],
    svg: SVG_LAP,
  },
  {
    id: "korsbladning",
    name: "Korsbladning / T-bladning",
    use: "När reglar korsar eller möts mitt på: mittslå i en ram, pinnar i en stege, krysstag.",
    difficulty: 2, strength: 3, time: "30 min per fog",
    tools: ["ryggsag", "tving"], optional: ["stamjarn"],
    need: ["Trälim", "Vinkelhake", "Grov fil eller slipkloss", "Hammare eller skruvmejsel"],
    intro: "Som hörnbladningen, men urtaget ligger mitt på biten – då går det inte att klyvsåga. I stället sågas ansatserna och flera extra spår emellan, och bitarna bryts bort.",
    steps: [
      { title: "Rita", text: "Lägg den korsande biten på plats och rita längs båda dess kanter. Dra linjerna runt kanterna och märk halva tjockleken från ytsidan på båda kanterna." },
      { title: "Såga ansatserna", text: "Såga de två ansatserna ned till djuplinjen, på avfallssidan (innanför linjerna). Använd sågkloss och tejp på bladet som djupstopp.", clamp: "Spänn biten plant i bänkhaken, eller direkt mot bordet, med tvingen." },
      { title: "Såga extra spår", text: "Såga flera spår mellan ansatserna, 4–6 mm isär, lika djupt. Ju tätare, desto lättare att bryta bort." },
      { title: "Bryt bort avfallet", text: "Bryt loss bitarna mellan spåren med en skruvmejsel eller slå dem försiktigt åt sidan med en hammare. Ett stämjärn gör detta snabbt och rent om du har ett." },
      { title: "Plana botten", text: "Fila eller slipa botten plan med en grov fil eller sandpapper på en kloss. Kontrollera med en linjal på högkant – botten ska vara rak från kant till kant och på rätt djup." },
      { title: "Provpassa och limma", text: "Den korsande biten ska gå ned med handkraft. Stryk lim och tryck ihop, kontrollera vinkeln.", clamp: "Spänn tvingen över korsningen med skyddsklossar. För en bladning mitt på båda bitarna (kors): gör samma urtag i den andra biten, från motsatt sida." },
    ],
    mistakes: [
      { problem: "Botten ojämn så biten gungar", fix: "Plana mer med fil/slipkloss och kontrollera med linjal – det är bottnen som bestämmer hur tätt fogen sluter." },
      { problem: "Urtaget för brett", fix: "Rita alltid direkt från den korsande biten och såga innanför linjerna." },
    ],
    svg: SVG_CROSS,
  },
  {
    id: "gering",
    name: "Gering med kilar",
    use: "Lådor, tavelramar och lister där inget ändträ ska synas.",
    difficulty: 2, strength: 2, time: "1–2 h för en låda (plus torktid)",
    tools: ["ryggsag", "tving"], optional: ["kapgersag", "bandtving"],
    need: ["Trälim", "Maskeringstejp", "Kloss för 45°-guide", "Tunna remsor 2–3 mm till kilar"],
    intro: "Geringen döljer ändträt men är i sig svag. Med en egen 45°-sågkloss blir snitten exakta, tejptricket gör limningen enkel med en tving, och kilar tvärs över hörnen gör fogen stark.",
    steps: [
      { title: "Gör en 45°-sågkloss", text: "Mät t.ex. 50 mm från ett hörn längs två kanter av en kloss och dra linjen mellan märkena – det är exakt 45°. Såga, och putsa med slipkloss. Kontroll: lägg två klossar ihop – de ska bilda 90° mot vinkelhaken." },
      { title: "Såga geringarna", text: "Rita längden på utsidan. Lägg klossen med 45°-sidan mot linjen och låt bladet löpa mot den. Kapa par exakt lika långa – det är viktigare än att måttet är exakt.", clamp: "Spänn klossen och biten tillsammans mot bänkhaken eller bordet med tvingen." },
      { title: "Provmontera", text: "Tejpa ihop hörnen utan lim och kontrollera att de sluter. Glipa på insidan eller utsidan betyder att vinkeln inte är 45° – justera geringen med slipklossen." },
      { title: "Tejptricket", text: "Lägg bitarna i rad med utsidan UPP och geringarna tätt mot varandra. Tejpa över varje fog. Vänd raden, stryk lim på geringarna (två gånger – ändträ), vik ihop till en ram/låda och tejpa sista hörnet.", clamp: "Tejpen fungerar som tving i hörnen. Använd tvingen över mitten (från sida till sida) med klossar, eller ett spännband/snöre runt hela lådan. Mät diagonalerna." },
      { title: "Såga kilspår", text: "När limmet torkat: såga 2–3 spår tvärs över varje hörn, ca 2/3 av tjockleken djupt. Håll sågen plant mot en kloss för raka spår.", clamp: "Spänn lådan/ramen så att hörnet sticker upp över bordskanten." },
      { title: "Limma kilar", text: "Stryk lim på remsor 2–3 mm tjocka, tryck in dem, låt torka, såga av överskottet och slipa jäms. Ett kontrastträ blir snyggt." },
    ],
    mistakes: [
      { problem: "Glipa i hörnen", fix: "Vinkeln är inte exakt 45° eller paren är olika långa. Kapa par mot samma stopp och justera med slipkloss." },
      { problem: "Geringen glider vid limning", fix: "Låt limmet dra några minuter innan du viker ihop, och tejpa hårt." },
    ],
    svg: SVG_MITER,
  },
];

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);
