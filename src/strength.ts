/**
 * Förenklad hållfasthetsanalys (bärighet och svikt).
 *
 * Konstruktionen består av lådor. Vi letar upp vilka delar som vilar på eller är skruvade mot
 * vilka, lägger en jämnt fördelad last på alla "ytor" (hyllplan, sitsar, trall …) och för lasten
 * nedåt genom konstruktionen. Varje liggande del kontrolleras som en balk per spann:
 * böjspänning, nedböjning (inkl. krypning) och – för delar som hänger i skruv – infästningen.
 * Värdena är ungefärliga (Eurokod 5-liknande) och ersätter inte en konstruktionsberäkning.
 */
import type { Design, Material, Part, Workshop } from "./types";

const G = 9.81;

export interface MatProps {
  label: string;
  /** E-modul, MPa */
  E: number;
  /** Dimensionerande böjhållfasthet, MPa */
  fmd: number;
  /** Dimensionerande tryckhållfasthet, MPa */
  fcd: number;
  /** Krypfaktor */
  kdef: number;
  /** Densitet kg/m³ */
  rho: number;
  /** Bärförmåga per skruv i skjuvning, N */
  screw: number;
}

export function matProps(m: Material): MatProps | null {
  const n = m.name.toLowerCase();
  const mk = (label: string, E: number, fmk: number, fck: number, kmod: number, gm: number, kdef: number, rho: number, screw: number): MatProps => ({
    label, E, fmd: (fmk * kmod) / gm, fcd: (fck * kmod) / gm, kdef, rho, screw,
  });
  if (m.kind === "mesh") return null;
  if (m.kind === "sheet") {
    if (/spån|spånplatt|p2|p4/.test(n)) return mk("Spånskiva", 3200, 14.2, 10, 0.45, 1.3, 2.25, 650, 350);
    if (/osb/.test(n)) return mk("OSB/3", 4930, 18, 15, 0.55, 1.2, 1.5, 600, 500);
    if (/mdf/.test(n)) return mk("MDF", 3000, 20, 12, 0.45, 1.3, 2.25, 750, 350);
    return mk("Plywood", 8000, 23, 20, 0.8, 1.2, 0.8, 500, 600);
  }
  if (m.a >= 40) return mk("Konstruktionsvirke C24", 11000, 24, 21, 0.8, 1.3, 0.6, 420, 700);
  return mk("Virke C18", 9000, 18, 18, 0.8, 1.3, 0.6, 380, 500);
}

/** Förslag på last (kg/m²) per typ av projekt. */
export function defaultLoad(templateId: string | null): number {
  const m: Record<string, number> = {
    shelf: 100, sheetShelf: 100, catio: 50, workbench: 200, dresser: 50, penHolder: 20, raisedBed: 100, bench: 300,
    birdHouse: 20, woodShed: 400, sandbox: 300, shoeRack: 50, chest: 300, deck: 250, coffeeTable: 100, catLitterBench: 300,
  };
  return templateId && m[templateId] != null ? m[templateId] : 100;
}

export const LOAD_PRESETS: { label: string; kg: number }[] = [
  { label: "Lätt", kg: 50 },
  { label: "Normal", kg: 100 },
  { label: "Böcker", kg: 150 },
  { label: "Sittyta", kg: 300 },
  { label: "Altan", kg: 250 },
  { label: "Ved/förråd", kg: 400 },
];

/** Bärförmåga (N) för en infästning, givet bärförmågan per skruv i det svagaste materialet. */
export function connectionCapacity(f: Part["fastening"], perScrew: number): number {
  if (f === "vinkel") return Math.max(4 * perScrew, 2500); // vinkelbeslag med 4–6 skruvar
  if (f === "skruv4") return 4 * perScrew;
  return 2 * perScrew;
}

type Axis = "x" | "y" | "z";
interface Box {
  p: Part;
  min: Record<Axis, number>;
  max: Record<Axis, number>;
  props: MatProps;
}

export interface MemberResult {
  id: string;
  name: string;
  materialName: string;
  kind: "balk" | "yta" | "stolpe";
  /** Största spann (mm) och eventuellt utkragande ände */
  span: number;
  cantilever: number;
  /** Nedböjning efter krypning, mm, och gräns */
  deflection: number;
  limit: number;
  /** Utnyttjandegrad böjning/tryck, nedböjning och infästning (1 = gräns) */
  uBend: number;
  uDefl: number;
  uConn: number;
  util: number;
  /** Ytor: ungefärlig max last kg/m² respektive kg totalt */
  maxKgM2?: number;
  maxKg?: number;
  /** Förslag på max spann för samma tvärsnitt och last */
  maxSpan?: number;
  advice?: string;
}

export interface StrengthReport {
  loadKgM2: number;
  members: MemberResult[];
  worst: MemberResult | null;
  tipping: { level: "ok" | "info" | "warn"; text: string };
  unsupported: string[];
}

const TOL = 1.5;

function boxes(design: Design, ws: Workshop): Box[] {
  const out: Box[] = [];
  for (const p of design.parts) {
    const mat = ws.materials.find((m) => m.id === p.materialId);
    const props = mat ? matProps(mat) : null;
    // Roterade delar (snedstöd, tak) räknas inte i den förenklade analysen
    if (!props || p.rot.x || p.rot.y || p.rot.z) continue;
    const h = { x: p.dims.x / 2, y: p.dims.y / 2, z: p.dims.z / 2 };
    out.push({
      p, props,
      min: { x: p.pos.x - h.x, y: p.pos.y - h.y, z: p.pos.z - h.z },
      max: { x: p.pos.x + h.x, y: p.pos.y + h.y, z: p.pos.z + h.z },
    });
  }
  return out;
}

const overlap = (a: Box, b: Box, ax: Axis) => Math.min(a.max[ax], b.max[ax]) - Math.max(a.min[ax], b.min[ax]);

interface Support {
  /** position längs delens längdaxel (mm från delens början) */
  from: number;
  to: number;
  by: Box;
  /** skruvad mot sidan (inte vilande ovanpå) */
  side: boolean;
}

interface PointLoad {
  at: number;
  F: number;
}

export function analyzeStrength(design: Design, ws: Workshop): StrengthReport {
  const q = design.loadKgM2 ?? defaultLoad(design.templateId);
  const storage = ["shelf", "sheetShelf", "woodShed", "dresser", "shoeRack"].includes(design.templateId ?? "");
  const psi2 = storage ? 0.8 : 0.3;
  const limitDiv = ["deck", "woodShed"].includes(design.templateId ?? "") ? 300 : 200;
  const bs = boxes(design, ws);
  const members: MemberResult[] = [];
  const unsupported: string[] = [];
  const loads = new Map<string, PointLoad[]>();
  const axial = new Map<string, number>();

  // Liggande del: tunnast i höjdled (skiva/bräda) eller en regel/balk som ligger ned.
  // Höga stående skivor (fronter, väggar) räknas som stående – de böjer inte i sitt eget plan.
  const isHorizontal = (b: Box) => {
    const d = b.p.dims;
    if (d.y <= Math.min(d.x, d.z)) return true;
    return d.y < Math.max(d.x, d.z) && d.y < 150;
  };
  const lenAxis = (b: Box): Axis => (b.p.dims.x >= b.p.dims.z ? "x" : "z");
  const other = (ax: Axis): Axis => (ax === "x" ? "z" : "x");
  // "Yta" = platt liggande del (tjocklek i höjdled) som man ställer saker på
  const isSurface = (b: Box) => {
    const ax = lenAxis(b);
    return b.p.dims.y <= Math.min(b.p.dims[ax], b.p.dims[other(ax)]) && b.p.dims[other(ax)] >= 60;
  };

  // Behandla uppifrån och ned så lasten hinner samlas på delarna under
  const order = [...bs].sort((a, b) => b.max.y - a.max.y);
  for (const P of order) {
    const pid = P.p.id;
    if (!isHorizontal(P)) {
      // Stående del: tryck + knäckning (förenklat)
      const N = axial.get(pid) ?? 0;
      const selfN = P.props.rho * G * (P.p.dims.x * P.p.dims.y * P.p.dims.z) / 1e9;
      if (N > 1) {
        const a = Math.min(P.p.dims.x, P.p.dims.z), bb = Math.max(P.p.dims.x, P.p.dims.z);
        const A = a * bb;
        const i = a / Math.sqrt(12);
        // Knäcklängd: liggande delar som är fästa mot sidan stagar stolpen/gaveln
        const braces = bs.filter((Q) => Q !== P && isHorizontal(Q) && overlap(P, Q, "y") > 5 &&
          (["x", "z"] as const).some((ax) => (Math.abs(Q.max[ax] - P.min[ax]) <= TOL || Math.abs(Q.min[ax] - P.max[ax]) <= TOL) && overlap(P, Q, other(ax)) > 5)).length;
        const lambda = P.p.dims.y / (braces + 1) / i;
        const sigE = (Math.PI ** 2 * P.props.E) / lambda ** 2;
        const kc = sigE / (sigE + P.props.fcd);
        const u = (N + selfN) / (A * P.props.fcd * kc);
        members.push({
          id: pid, name: P.p.name, materialName: P.props.label, kind: "stolpe", span: Math.round(P.p.dims.y), cantilever: 0,
          deflection: 0, limit: 0, uBend: u, uDefl: 0, uConn: 0, util: u,
          advice: u > 1 ? "Stolpen är för klen för lasten – använd grövre virke eller fler stolpar." : undefined,
        });
      }
      // Stående delar för lasten vidare till det de står på
      const below = bs.filter((Q) => Q !== P && Math.abs(Q.max.y - P.min.y) <= TOL && overlap(P, Q, "x") > 2 && overlap(P, Q, "z") > 2);
      for (const Q of below) axial.set(Q.p.id, (axial.get(Q.p.id) ?? 0) + (N + selfN) / below.length);
      continue;
    }

    const res = checkBeam(P);
    if (res) members.push(res);
  }

  /** Lägg en kraft på delen Q (punktlast om den ligger ned, annars tryck). */
  function transfer(Q: Box, atWorld: number, F: number) {
    if (isHorizontal(Q)) {
      const QL = lenAxis(Q);
      const at = Math.min(Math.max(atWorld, Q.min[QL]), Q.max[QL]) - Q.min[QL];
      const list = loads.get(Q.p.id) ?? [];
      list.push({ at, F });
      loads.set(Q.p.id, list);
    } else axial.set(Q.p.id, (axial.get(Q.p.id) ?? 0) + F);
  }

  /** Lägg reaktionen från P på Q, mitt i kontaktytan mellan dem (längs Q:s längdriktning). */
  function transferFrom(Q: Box, P: Box, F: number) {
    const QL = lenAxis(Q);
    transfer(Q, (Math.max(P.min[QL], Q.min[QL]) + Math.min(P.max[QL], Q.max[QL])) / 2, F);
  }

  function checkBeam(P: Box): MemberResult | null {
    const pid = P.p.id;
    const L0 = lenAxis(P);
    const h = P.p.dims.y;

    // Alla kontakter som kan bära P
    type Contact = { Q: Box; side: boolean; face: "under" | "end" | "long" };
    const contacts: Contact[] = [];
    for (const Q of bs) {
      if (Q === P) continue;
      if (Math.abs(Q.max.y - P.min.y) <= TOL && overlap(P, Q, "x") > 2 && overlap(P, Q, "z") > 2) {
        contacts.push({ Q, side: false, face: "under" });
        continue;
      }
      if (overlap(P, Q, "y") < 10) continue;
      for (const ax of ["x", "z"] as const) {
        const touch = Math.abs(Q.max[ax] - P.min[ax]) <= TOL || Math.abs(Q.min[ax] - P.max[ax]) <= TOL;
        if (!touch || overlap(P, Q, other(ax)) <= 10) continue;
        // Mot änden (kortsidan) bär alltid; mot långsidan bär bara stående delar (skruvad)
        if (ax === L0) contacts.push({ Q, side: true, face: "end" });
        else if (!isHorizontal(Q)) contacts.push({ Q, side: true, face: "long" });
      }
    }
    const onGround = P.min.y <= TOL;
    const pts0 = loads.get(pid) ?? [];
    if (!contacts.length) {
      // Rapportera bara delar som inte rör något alls (t.ex. ribbor under ett lock hänger i locket)
      const touchesAbove = bs.some((Q) => Q !== P && Math.abs(Q.min.y - P.max.y) <= TOL && overlap(P, Q, "x") > 2 && overlap(P, Q, "z") > 2);
      if (!onGround && !touchesAbove) unsupported.push(P.p.name);
      return null;
    }
    if (onGround) return null; // ligger på marken

    const covered = bs.some((Q) => Q !== P && isSurface(Q) && Math.abs(Q.min.y - P.max.y) <= TOL && overlap(P, Q, "x") > 2 && overlap(P, Q, "z") > 2 && overlap(P, Q, other(L0)) > P.p.dims[other(L0)] * 0.5);
    const surface = isSurface(P) && !covered;

    // Stöd längs hela delen: "fullt" (delen kan inte böja) eller "kantlinje" (bär bara ena kanten)
    const along = (c: Contact, ax: Axis) => overlap(P, c.Q, ax);
    const full = contacts.filter((c) =>
      along(c, L0) >= 0.8 * P.p.dims[L0] && (c.face === "under" ? along(c, other(L0)) >= 0.6 * P.p.dims[other(L0)] : c.face === "long" && overlap(P, c.Q, "y") >= 0.6 * h),
    );
    const selfTotal = (P.props.rho * G * P.p.dims.x * P.p.dims.y * P.p.dims.z) / 1e9;
    const areaTotal = surface ? (q * G * P.p.dims.x * P.p.dims.z) / 1e6 : 0;
    const ptsTotal = pts0.reduce((sum, pl) => sum + pl.F, 0);
    // Skruvad mot väggar på BÅDA långsidorna (t.ex. ett hyllplan mellan två gavlar som är
    // smalare än djupet): då spänner delen tvärs över mellan dem – inte "fullt stödd"
    const longFull = full.filter((c) => c.face === "long");
    const O0 = other(L0);
    const bothSides = longFull.some((c) => c.Q.max[O0] <= P.min[O0] + TOL) && longFull.some((c) => c.Q.min[O0] >= P.max[O0] - TOL);
    const acrossWalls = bothSides && !full.some((c) => c.face === "under") ? longFull : null;
    if (full.length && !acrossWalls) {
      const F = (selfTotal + areaTotal + ptsTotal) / full.length;
      for (const c of full) transferFrom(c.Q, P, F);
      return null;
    }
    const edgeLines = contacts.filter((c) => c.face === "under" && along(c, L0) >= 0.8 * P.p.dims[L0]);
    // Smal bräda som vilar längs en vägg/kant (t.ex. sittkant) böjer inte på längden
    if (edgeLines.length && P.p.dims[other(L0)] <= 200) {
      const F = (selfTotal + areaTotal + ptsTotal) / edgeLines.length;
      for (const c of edgeLines) transferFrom(c.Q, P, F);
      return null;
    }
    const normal = contacts.filter((c) => !edgeLines.includes(c));

    // Välj riktning: ligger delen på två långa kanter (t.ex. ett lock på fyra väggar) spänner den
    // den kortare vägen tvärs över – annars längs längden
    let L: Axis = L0, supportsC = normal, edgeShare = 0;
    if (acrossWalls) {
      L = O0;
      supportsC = acrossWalls.map((c) => ({ ...c, face: "end" as const }));
    } else if (edgeLines.length >= 2) {
      L = other(L0);
      supportsC = edgeLines;
    } else if (!normal.length) {
      unsupported.push(P.p.name);
      return null;
    } else if (edgeLines.length) edgeShare = 0.4; // förenkling: kantlisten tar ca 40 % av lasten
    const O = other(L);
    const len = P.p.dims[L], width = P.p.dims[O];
    const x0 = P.min[L];

    const supports = supportsC.map((c) => {
      const from = c.face === "end" ? (Math.abs(c.Q.max[L] - P.min[L]) <= TOL ? 0 : len) : Math.max(P.min[L], c.Q.min[L]) - x0;
      const to = c.face === "end" ? from : Math.min(P.max[L], c.Q.max[L]) - x0;
      return { c: (from + to) / 2, Q: c.Q, side: c.side };
    }).sort((a, b) => a.c - b.c);

    const self = (P.props.rho * G * width * h) / 1e9; // N/mm
    const area = surface ? (q * G * width) / 1e6 : 0; // N/mm
    const w = (self + area) * (1 - edgeShare);
    // Punktlaster: längs L, eller mitt på om vi spänner tvärs
    const pts = (L === L0 ? pts0 : pts0.map((pl) => ({ at: len / 2, F: pl.F }))).map((pl) => ({ ...pl, F: pl.F * (1 - edgeShare) }));
    if (edgeShare) {
      const shareF = (self + area) * edgeShare * len + ptsTotal * edgeShare;
      for (const c of edgeLines) for (const f of [0.25, 0.5, 0.75]) transfer(c.Q, x0 + f * len, shareF / edgeLines.length / 3);
    }

    // Stödpunkter: slå ihop stöd som sitter tätt, använd mitten av stödytan
    const groups: { c: number; members: typeof supports }[] = [];
    for (const s of supports) {
      const g = groups[groups.length - 1];
      if (g && s.c - g.c < 30) g.members.push(s);
      else groups.push({ c: s.c, members: [s] });
    }
    const cs = groups.map((g) => g.c);
    const reactions = new Array(groups.length).fill(0);
    const EI = (P.props.E * width * h ** 3) / 12; // N·mm²
    const Wm = (width * h ** 2) / 6; // mm³
    let worstM = 0, worstD = 0, maxSpan = 0, cant = 0, worstSpanW = w;

    // Utkragande ände utanför första (start) eller sista (end) stödet
    const cantilever = (side: "start" | "end") => {
      const idx = side === "start" ? 0 : cs.length - 1;
      const c = cs[idx];
      const arm = side === "start" ? c : len - c;
      const armPts = side === "start" ? pts.filter((pl) => pl.at < c) : pts.filter((pl) => pl.at > c);
      reactions[idx] += w * Math.max(arm, 0) + armPts.reduce((sum, pl) => sum + pl.F, 0);
      if (arm < 60) return; // kort överhäng – försumbart
      const M = (w * arm ** 2) / 2 + armPts.reduce((sum, pl) => sum + pl.F * Math.abs(pl.at - c), 0);
      const d = (w * arm ** 4) / (8 * EI) + armPts.reduce((sum, pl) => {
        const a = Math.abs(pl.at - c);
        return sum + (pl.F * a ** 2 * (3 * arm - a)) / (6 * EI);
      }, 0);
      worstM = Math.max(worstM, M);
      worstD = Math.max(worstD, d);
      cant = Math.max(cant, arm);
    };
    // Spann mellan stöd räknas som fritt upplagda balkar
    for (let k = 0; k < cs.length - 1; k++) {
      const a = cs[k], bE = cs[k + 1], Ls = bE - a;
      const inSpan = pts.filter((pl) => pl.at >= a && pl.at < bE);
      // Kontinuitet: delen fortsätter över stödet på ena/båda sidor → mindre nedböjning
      // (tvåfältsbalk ≈ 0,42, mellanfält ≈ 0,2 av fritt upplagd)
      const contL = k > 0, contR = k < cs.length - 2;
      const kCont = contL && contR ? 0.2 : contL || contR ? 0.42 : 1;
      let M = (w * Ls ** 2) / 8, d = (kCont * 5 * w * Ls ** 4) / (384 * EI);
      reactions[k] += (w * Ls) / 2;
      reactions[k + 1] += (w * Ls) / 2;
      for (const pl of inSpan) {
        const u = pl.at - a, v = bE - pl.at, m = Math.min(u, v);
        M += (pl.F * u * v) / Ls;
        d += (pl.F * m * (3 * Ls ** 2 - 4 * m ** 2)) / (48 * EI);
        reactions[k] += (pl.F * v) / Ls;
        reactions[k + 1] += (pl.F * u) / Ls;
      }
      worstM = Math.max(worstM, M);
      worstD = Math.max(worstD, d);
      if (Ls > maxSpan) {
        maxSpan = Ls;
        worstSpanW = w + inSpan.reduce((sum, pl) => sum + pl.F, 0) / Ls;
      }
    }
    cantilever("start");
    cantilever("end");

    const span = Math.max(maxSpan, cant);
    const creep = 1 + P.props.kdef * psi2;
    const dFin = worstD * creep;
    const limit = Math.max(span, 1) / limitDiv;
    const uBend = worstM / Wm / P.props.fmd;
    const uDefl = span > 0 ? dFin / limit : 0;

    // Fördela reaktionerna till stöden; skruvade stöd kontrolleras som infästning (2 skruvar)
    let uConn = 0;
    groups.forEach((g, gi) => {
      const R = reactions[gi] / g.members.length;
      for (const s of g.members) {
        // Stöd tvärs under delen: lasten hamnar där delen vilar på stödet. Parallellt stöd
        // (samma riktning): vid stödpunktens läge längs delen.
        if (isHorizontal(s.Q) && lenAxis(s.Q) === L) transfer(s.Q, x0 + g.c, R);
        else transferFrom(s.Q, P, R);
        if (s.side) uConn = Math.max(uConn, R / connectionCapacity(P.p.fastening, Math.min(P.props.screw, s.Q.props.screw)));
      }
    });

    const util = Math.max(uBend, uDefl, uConn);
    const res: MemberResult = {
      id: pid, name: P.p.name, materialName: P.props.label, kind: surface ? "yta" : "balk",
      span: Math.round(span), cantilever: Math.round(cant), deflection: Math.round(dFin * 10) / 10, limit: Math.round(limit * 10) / 10,
      uBend, uDefl, uConn, util,
    };
    if (surface && util > 0 && area > 0) {
      // Utnyttjandet är ungefär proportionellt mot lasten – egenvikten ligger kvar
      const loadShare = area / (self + area);
      const perKg = (util * loadShare) / q;
      const room = util - util * loadShare;
      res.maxKgM2 = Math.max(0, Math.round((1 - room) / perKg));
      res.maxKg = Math.round((res.maxKgM2 * P.p.dims.x * P.p.dims.z) / 1e6);
    }
    if (maxSpan > 0 && worstSpanW > 0) {
      const byDefl = Math.cbrt((384 * EI) / (5 * worstSpanW * creep * limitDiv));
      const byBend = Math.sqrt((8 * P.props.fmd * Wm) / worstSpanW);
      res.maxSpan = Math.round(Math.min(byDefl, byBend) / 10) * 10;
    }
    if (util > 1) {
      if (uConn >= Math.max(uBend, uDefl)) res.advice = "Infästningen är svagast – fler eller grövre skruvar, eller låt delen vila på en list i stället för att hänga i skruv.";
      else if (res.maxSpan && maxSpan > res.maxSpan) res.advice = `Minska spannet till ca ${res.maxSpan} mm (fler stöd) eller använd tjockare material${h < width ? "" : " – eller vänd virket på högkant"}.`;
      else if (cant > maxSpan) res.advice = "Den utstickande delen är för lång – korta den eller stötta änden.";
      else res.advice = "Använd kraftigare material eller lägg till ett stöd under.";
    } else if (util > 0.8) res.advice = "Nära gränsen – fungerar, men med liten marginal.";
    return res;
  }

  // Tipprisk (inte för saker som hängs upp)
  let tipping: StrengthReport["tipping"] = { level: "ok", text: "Stabil – ingen tipprisk att tala om." };
  if (design.templateId === "birdHouse") tipping = { level: "ok", text: "Holken hängs upp – ingen tipprisk." };
  else if (bs.length) {
    const minY = Math.min(...bs.map((b) => b.min.y)), maxY = Math.max(...bs.map((b) => b.max.y));
    const dx = Math.max(...bs.map((b) => b.max.x)) - Math.min(...bs.map((b) => b.min.x));
    const dz = Math.max(...bs.map((b) => b.max.z)) - Math.min(...bs.map((b) => b.min.z));
    const ratio = (maxY - minY) / Math.max(1, Math.min(dx, dz));
    if (ratio > 2.5 && design.wall) tipping = { level: "info", text: `Hög och smal (höjd/djup ≈ ${ratio.toFixed(1)}) – den ska förankras i väggen, vilket den här konstruktionen är tänkt för.` };
    else if (ratio > 2.5) tipping = { level: "warn", text: `Risk att välta (höjd/djup ≈ ${ratio.toFixed(1)}) – förankra i vägg eller gör basen bredare.` };
    else if (ratio > 1.6) tipping = { level: "info", text: `Ganska hög i förhållande till djupet (≈ ${ratio.toFixed(1)}) – förankra om barn klättrar eller lasten är tung upptill.` };
  }

  members.sort((a, b) => b.util - a.util);
  return { loadKgM2: q, members, worst: members[0] ?? null, tipping, unsupported };
}
