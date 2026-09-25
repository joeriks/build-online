import type { Design, Workshop } from "../types";
import { Builder, columns, fillSurface, pickFrame, pickMesh, pickSheet } from "./builder";

/** Positioner (stolpens vänsterkant) mellan två stolpar, med max spännvidd. */
function between(x0: number, x1: number, a: number, maxSpan: number): number[] {
  return columns(x1 - x0 + a, a, maxSpan).map((x) => x0 + x);
}

export function catio(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const wall = !!p.againstWall;
  let door = !!p.door;
  const nShelves = Math.max(0, Math.round(+p.shelves));
  const b = new Builder(ws);
  const m = pickFrame(ws, "square");
  const mesh = pickMesh(ws);
  const A = m.a, B = m.b;
  const maxSpan = 1200;
  const doorW = 600, doorH = Math.min(1700, H - B - 150);

  if (door && W < doorW + 4 * A + 200) {
    door = false;
    b.note("Patiot är för smal för en dörr – dörren är borttagen.");
  }

  // --- Stolpar ---
  const backXs = columns(W, A, maxSpan);
  let frontXs: number[];
  let dl = 0, dr = 0;
  if (door) {
    dl = Math.round(W / 2 - doorW / 2 - A); // vänster dörrstolpe
    dr = dl + A + doorW; // höger dörrstolpe
    frontXs = [...between(0, dl, A, maxSpan), ...between(dr, W - A, A, maxSpan)];
  } else frontXs = backXs;
  const sideZs = columns(D, B, maxSpan).slice(1, -1); // mellanstolpar på gavlarna
  const postH = H - B;

  frontXs.forEach((x, i) => b.post(`Stolpe fram ${i + 1}`, m, { x, y: 0, z: D - B }, postH, "stolpar"));
  backXs.forEach((x, i) => b.post(`Stolpe bak ${i + 1}`, m, { x, y: 0, z: 0 }, postH, "stolpar"));
  sideZs.forEach((z, i) => {
    b.post(`Stolpe gavel V ${i + 1}`, m, { x: 0, y: 0, z }, postH, "stolpar");
    b.post(`Stolpe gavel H ${i + 1}`, m, { x: W - A, y: 0, z }, postH, "stolpar");
  });

  // --- Reglar mellan stolpar ---
  const midY = Math.round(H * 0.45);
  let rails = 0;
  const railsX = (xs: number[], z: number, label: string, skipMid: boolean) => {
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i] + A, len = xs[i + 1] - x0;
      if (door && label === "fram" && xs[i] === dl) continue; // dörröppningen
      if (len < 20) continue;
      b.beamX(`Syll ${label} ${i + 1}`, m, { x: x0, y: 0, z }, len, "syllar");
      rails++;
      if (!skipMid) {
        b.beamX(`Mellanregel ${label} ${i + 1}`, m, { x: x0, y: midY, z }, len, "mellanreglar");
        rails++;
      }
    }
  };
  railsX(frontXs, D - A, "fram", false);
  railsX(backXs, 0, "bak", wall);
  const zs = [0, ...sideZs, D - B];
  for (const [side, x] of [["V", 0], ["H", W - A]] as const) {
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i] + B, len = zs[i + 1] - z0;
      b.beamZ(`Syll gavel ${side} ${i + 1}`, m, { x, y: 0, z: z0 }, len, "syllar");
      b.beamZ(`Mellanregel gavel ${side} ${i + 1}`, m, { x, y: midY, z: z0 }, len, "mellanreglar");
      rails += 2;
    }
  }

  // --- Hammarband och takreglar ---
  b.beamX("Hammarband fram", m, { x: 0, y: postH, z: D - A }, W, "hammarband");
  b.beamX("Hammarband bak", m, { x: 0, y: postH, z: 0 }, W, "hammarband");
  const joistXs = columns(W, A, 800);
  joistXs.forEach((x, i) => b.beamZ(`Takregel ${i + 1}`, m, { x, y: postH, z: A }, D - 2 * A, "takreglar"));

  // --- Dörr ---
  if (door) {
    b.beamX("Dörröverstycke", m, { x: dl + A, y: doorH, z: D - A }, doorW, "dörr");
    const lx = dl + A + 5, lw = doorW - 10, ly = 15, lh = doorH - 20;
    b.unit = "Dörrblad";
    b.box("Dörr – sidostycke V", m, { x: lx, y: ly, z: D - B }, { x: A, y: lh, z: B }, "dörr");
    b.box("Dörr – sidostycke H", m, { x: lx + lw - A, y: ly, z: D - B }, { x: A, y: lh, z: B }, "dörr");
    b.box("Dörr – underslå", m, { x: lx + A, y: ly, z: D - B }, { x: lw - 2 * A, y: A, z: B }, "dörr");
    b.box("Dörr – överslå", m, { x: lx + A, y: ly + lh - A, z: D - B }, { x: lw - 2 * A, y: A, z: B }, "dörr");
    if (mesh) b.box("Nät dörr", mesh, { x: lx, y: ly, z: D }, { x: lw, y: lh, z: 1 }, "nät");
    b.unit = null;
    b.hw("Gångjärn", 2);
    b.hw("Haspe / kattsäker regel", 1);
  }

  // --- Snedstöd (eller hörnplåtar av skiva om vinkelkap är svårt) ---
  const s = 280, len = Math.round(s * Math.SQRT2 + A);
  const canMiter = b.has("kapgersag") || b.has("bordssag");
  const gusset = !canMiter ? pickSheet(ws, 9) : null;
  const yb = postH - s / 2;
  const faces: { plane: "xy" | "zy"; c: { x: number; y: number; z: number }; dir: 1 | -1; label: string }[] = [
    { plane: "xy", c: { x: A + s / 2, y: yb, z: D - A / 2 }, dir: 1, label: "fram V" },
    { plane: "xy", c: { x: W - A - s / 2, y: yb, z: D - A / 2 }, dir: -1, label: "fram H" },
    { plane: "zy", c: { x: A / 2, y: yb, z: B + s / 2 }, dir: 1, label: "gavel V bak" },
    { plane: "zy", c: { x: A / 2, y: yb, z: D - B - s / 2 }, dir: -1, label: "gavel V fram" },
    { plane: "zy", c: { x: W - A / 2, y: yb, z: B + s / 2 }, dir: 1, label: "gavel H bak" },
    { plane: "zy", c: { x: W - A / 2, y: yb, z: D - B - s / 2 }, dir: -1, label: "gavel H fram" },
  ];
  if (!wall) {
    faces.push({ plane: "xy", c: { x: A + s / 2, y: yb, z: A / 2 }, dir: 1, label: "bak V" });
    faces.push({ plane: "xy", c: { x: W - A - s / 2, y: yb, z: A / 2 }, dir: -1, label: "bak H" });
  }
  for (const f of faces) {
    if (gusset) {
      const g = 250, t = gusset.a;
      const y0 = H - g;
      if (f.plane === "xy") {
        const x0 = f.dir === 1 ? 0 : W - g;
        const z0 = f.c.z > D / 2 ? D : -t;
        b.box(`Hörnplåt ${f.label}`, gusset, { x: x0, y: y0, z: z0 }, { x: g, y: g, z: t }, "snedstöd");
      } else {
        const z0 = f.dir === 1 ? 0 : D - g;
        const x0 = f.c.x < W / 2 ? -t : W;
        b.box(`Hörnplåt ${f.label}`, gusset, { x: x0, y: y0, z: z0 }, { x: t, y: g, z: g }, "snedstöd");
      }
    } else b.brace(`Snedstöd ${f.label}`, m, f.c, len, f.plane, f.dir, "snedstöd");
  }
  if (gusset) b.note("Istället för snedstöd med 45°-kap används hörnplåtar av skiva – lättare utan kap- & gersåg.");

  // --- Nät ---
  if (mesh) {
    const net = (name: string, min: { x: number; y: number; z: number }, size: { x: number; y: number; z: number }) =>
      b.box(name, mesh, min, size, "nät");
    if (door) {
      net("Nät fram V", { x: 0, y: 0, z: D }, { x: dl + A, y: H, z: 1 });
      net("Nät fram H", { x: dr, y: 0, z: D }, { x: W - dr, y: H, z: 1 });
      net("Nät över dörr", { x: dl + A, y: doorH, z: D }, { x: doorW, y: H - doorH, z: 1 });
    } else net("Nät fram", { x: 0, y: 0, z: D }, { x: W, y: H, z: 1 });
    net("Nät gavel V", { x: -1, y: 0, z: 0 }, { x: 1, y: H, z: D });
    net("Nät gavel H", { x: W, y: 0, z: 0 }, { x: 1, y: H, z: D });
    if (!wall) net("Nät bak", { x: 0, y: 0, z: -1 }, { x: W, y: H, z: 1 });
    net("Nät tak", { x: 0, y: H, z: 0 }, { x: W, y: 1, z: D });
    const perim = 2 * (W + H) * 2 + 2 * (D + H) * 2 + 2 * (W + D);
    b.hw(b.has("haftpistol") ? "Häftklammer 10–14 mm" : "U-märlor", Math.ceil(perim / 100));
    if (mesh.stockWidth < Math.min(H, D)) b.note(`Nätrullen är ${mesh.stockWidth} mm bred – nätet läggs i våder med ca 50 mm överlapp över en regel.`);
  }

  // --- Katthyllor på bakväggen ---
  const sd = 250;
  const bays = backXs.length - 1;
  const lo = 450, hi = H - 450;
  for (let i = 0; i < nShelves; i++) {
    let y = nShelves === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (nShelves - 1);
    if (Math.abs(y - midY) < B + 40) y = midY + B + 60;
    const bay = i % Math.max(1, bays);
    const x0 = backXs[bay] + A, x1 = backXs[bay + 1] ?? W - A;
    b.unit = `Katthylla ${i + 1}`;
    b.box(`Hyllkonsol ${i + 1} V`, m, { x: x0, y: y - B, z: 0 }, { x: A, y: B, z: sd + A }, "hyllor");
    b.box(`Hyllkonsol ${i + 1} H`, m, { x: x1 - A, y: y - B, z: 0 }, { x: A, y: B, z: sd + A }, "hyllor");
    fillSurface(b, `Katthylla ${i + 1}`, "hyllor", x0 + 2, y, A, x1 - x0 - 4, sd, { gap: 4, minSheet: 12 });
  }

  b.unit = null;

  // --- Beslag ---
  b.hw("Vinkelbeslag", rails * 2);
  b.hw("Träskruv 5×80", rails * 4 + joistXs.length * 4 + nShelves * 4);
  b.hw("Träskruv 5×100 (hammarband → stolpe)", (frontXs.length + backXs.length) * 2);
  b.hw("Träskruv 4×40 (hyllor)", nShelves * 6);
  if (wall) b.hw("Väggskruv + plugg (bakre stolpar → husvägg)", backXs.length * 3);

  // --- Byggsteg ---
  b.step("Kapa allt virke", "Kapa enligt kapningslistan och märk delarna.", []);
  b.step("Stolpar och syllar", `Bygg ramen på plant underlag. Syllarna (nedre reglarna) skruvas mellan stolparna med vinkelbeslag. ${wall ? "Bakre stolpar skruvas fast i husväggen." : ""}`, ["stolpar", "syllar"]);
  b.step("Mellanreglar", `Mellanreglarna sitter ca ${midY} mm upp och gör nätet stadigt.`, ["mellanreglar"]);
  b.step("Hammarband och takreglar", "Lägg hammarbanden ovanpå stolparna och skruva uppifrån. Skruva takreglarna mellan hammarbanden.", ["hammarband", "takreglar"]);
  b.step(gusset ? "Hörnplåtar" : "Snedstöd", gusset ? "Skruva hörnplåtarna i de övre hörnen – de hindrar ramen från att bli skev." : "Kapa snedstöden 45° i båda ändar och skruva i de övre hörnen – de gör ramen stabil.", ["snedstöd"]);
  if (door) b.step("Dörr", "Bygg dörrbladet liggande, kontrollera att det är rätvinkligt (mät diagonalerna), häng upp det med gångjärn och sätt en kattsäker regel.", ["dörr"]);
  b.step("Nät", "Spänn nätet på utsidan och fäst var 10:e cm. Vik in eller fila vassa ändar.", ["nät"]);
  if (nShelves) b.step("Katthyllor", "Skruva konsolerna på insidan av stolparna och lägg hyllorna ovanpå – i olika höjd så katten kan klättra.", ["hyllor"]);

  b.note(`Stommen är gjord av ${m.name}. Utomhus: använd tryckimpregnerat virke eller måla/olja träet.`);
  b.note("Kontrollera att det inte finns glipor större än ca 5 cm – katter tar sig igenom små hål.");

  return b.design(`Katt-patio ${W / 1000}×${D / 1000}×${H / 1000} m`, prompt, "catio", p, wall ? { width: W + 1200, height: H + 500 } : null);
}
