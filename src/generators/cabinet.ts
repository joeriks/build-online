import type { Design, Material, Workshop } from "../types";
import { Builder, panel, pickPanel } from "./builder";

function thinnestLinear(ws: Workshop): Material | null {
  const list = ws.materials.filter((m) => m.kind === "linear" && m.available);
  return list.sort((x, y) => x.a * x.b - y.a * y.b)[0] ?? null;
}

/** Bygg en låda (utan front): botten, två sidor, bak- och innerstycke. */
function drawerBox(b: Builder, label: string, mat: Material, t: number, bottom: Material, bt: number, x0: number, y0: number, z0: number, w: number, h: number, d: number) {
  const g = `lådor`;
  panel(b, `${label} botten`, g, bottom, { x: x0, y: y0, z: z0 }, { x: w, y: bt, z: d });
  const y = y0 + bt, sh = h - bt;
  panel(b, `${label} sida V`, g, mat, { x: x0, y, z: z0 }, { x: t, y: sh, z: d });
  panel(b, `${label} sida H`, g, mat, { x: x0 + w - t, y, z: z0 }, { x: t, y: sh, z: d });
  panel(b, `${label} bakstycke`, g, mat, { x: x0 + t, y, z: z0 }, { x: w - 2 * t, y: sh, z: t });
  panel(b, `${label} innerfront`, g, mat, { x: x0 + t, y, z: z0 + d - t }, { x: w - 2 * t, y: sh, z: t });
}

/**
 * Tjocklek för panelmaterialet. Grovt virke klyvs tunnare om bordssåg/cirkelsåg finns,
 * annars används virkets tjocklek som den är.
 */
function panelThickness(b: Builder, mat: Material, target: number): number {
  if (mat.kind !== "linear" || mat.a <= target + 8) return mat.a;
  if (b.has("bordssag") || b.has("cirkelsag")) {
    b.note(`${mat.name} klyvs till ${target} mm tjocka remsor på ${b.has("bordssag") ? "bordssågen" : "cirkelsågen"} och limmas till paneler.`);
    return target;
  }
  return mat.a;
}

/** Byrå med lådor: stomme av skiva (eller limmade brädor), löplister av trä. */
export function dresser(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const n = Math.max(1, Math.round(+p.drawers));
  const b = new Builder(ws);
  const mat = pickPanel(ws, 25);
  const thin = pickPanel(ws, 12);
  const t = panelThickness(b, mat, 20), tb = panelThickness(b, thin, 12);
  const plinth = 70;
  const Dc = D - t; // stommens djup – fronterna ligger utanpå

  panel(b, "Sida V", "stomme", mat, { x: 0, y: 0, z: 0 }, { x: t, y: H - t, z: Dc });
  panel(b, "Sida H", "stomme", mat, { x: W - t, y: 0, z: 0 }, { x: t, y: H - t, z: Dc });
  panel(b, "Botten", "stomme", mat, { x: t, y: plinth, z: tb }, { x: W - 2 * t, y: t, z: Dc - tb });
  panel(b, "Sockel", "stomme", mat, { x: t, y: 0, z: Dc - t - 20 }, { x: W - 2 * t, y: plinth, z: t });
  panel(b, "Rygg", "rygg", thin, { x: t, y: plinth, z: 0 }, { x: W - 2 * t, y: H - t - plinth, z: tb });
  panel(b, "Topp", "topp", mat, { x: 0, y: H - t, z: 0 }, { x: W, y: t, z: D });

  const runner = thinnestLinear(ws);
  const innerW = W - 2 * t;
  const y0 = plinth + t, Hi = H - t - y0;
  const slot = Hi / n;
  const rh = runner ? runner.a : 0;
  const frontH = (H - t - plinth) / n;
  for (let i = 0; i < n; i++) {
    const sy = y0 + i * slot;
    if (runner) {
      b.box(`Löplist ${i + 1} V`, runner, { x: t, y: sy, z: tb }, { x: runner.b, y: runner.a, z: Dc - tb }, "löplister");
      b.box(`Löplist ${i + 1} H`, runner, { x: W - t - runner.b, y: sy, z: tb }, { x: runner.b, y: runner.a, z: Dc - tb }, "löplister");
    }
    const bh = Math.max(40, slot - rh - 20);
    const dl = Dc - tb - 20;
    b.inUnit(`Låda ${i + 1}`, () => {
      drawerBox(b, `Låda ${i + 1}`, mat, t, thin, tb, t + 2, sy + rh + 1, Dc - dl, innerW - 4, bh, dl);
      panel(b, `Lådfront ${i + 1}`, "fronter", mat, { x: 2, y: plinth + i * frontH + 1.5, z: Dc }, { x: W - 4, y: frontH - 3, z: t });
    });
  }

  b.hw("Träskruv 4×40", n * 12 + 24);
  b.hw("Spik/skruv 3×25 (rygg, lådbottnar)", 30 + n * 12);
  b.hw("Knopp eller handtag", n * (W > 700 ? 2 : 1));
  b.hw("Trälim", 1, "flaska");
  b.hw("Paraffin/stearin till löplisterna", 1, "st");

  b.step("Kapa", "Kapa alla delar enligt kapningslistan – skivdelar enligt skivschemat.", []);
  b.step("Stomme", "Skruva sidorna mot botten och sockel. Kontrollera diagonalerna så stommen blir rätvinklig.", ["stomme"]);
  b.step("Rygg", "Spika/skruva ryggen – den låser stommen i vinkel.", ["rygg"]);
  if (runner) b.step("Löplister", "Skruva löplisterna på sidornas insida. Mät från botten så de hamnar på exakt samma höjd på båda sidor.", ["löplister"]);
  b.step("Lådor", "Limma och skruva ihop lådorna. Gnid in löplister och lådsidor med paraffin så lådorna går lätt.", ["lådor"]);
  b.step("Fronter", "Lägg lådorna på plats, fäst fronterna med dubbelhäftande tejp, justera springorna (ca 3 mm) och skruva inifrån.", ["fronter"]);
  b.step("Topp", "Skruva toppen underifrån genom stommen.", ["topp"]);

  if (mat.kind === "linear") b.note("Ingen skiva tillgänglig – sidor och lådor görs av limmade brädor. Med en skiva (t.ex. 12–18 mm plywood) blir byrån både lättare och enklare att bygga.");
  if (!runner) b.note("Inget virke till löplister – lägg till t.ex. läkt eller regel.");
  b.note("Förankra byrån i väggen med ett tippskydd – särskilt om barn finns i hemmet.");
  return b.design(`Byrå ${W}×${H} mm, ${n} lådor`, prompt, "dresser", p);
}

/** Pennställ med ett fack upptill och en låda nertill. */
export function penHolder(ws: Workshop, p: Design["params"], prompt: string): Design {
  const W = +p.width, D = +p.depth, H = +p.height;
  const b = new Builder(ws);
  const mat = pickPanel(ws, 22);
  const t = panelThickness(b, mat, 12);
  const bottomMat = pickPanel(ws, 12);
  const bt = panelThickness(b, bottomMat, 8);
  const dh = Math.round(H * 0.4); // lådans höjd
  const iw = W - 2 * t;

  panel(b, "Botten", "stomme", mat, { x: 0, y: 0, z: 0 }, { x: W, y: t, z: D });
  panel(b, "Sida V", "stomme", mat, { x: 0, y: t, z: 0 }, { x: t, y: H - t, z: D });
  panel(b, "Sida H", "stomme", mat, { x: W - t, y: t, z: 0 }, { x: t, y: H - t, z: D });
  panel(b, "Rygg", "stomme", mat, { x: t, y: t, z: 0 }, { x: iw, y: H - t, z: t });
  const shelfY = t + dh + 2;
  panel(b, "Mellanbotten", "stomme", mat, { x: t, y: shelfY, z: t }, { x: iw, y: t, z: D - t });
  const lipH = Math.round((H - shelfY - t) * 0.55);
  panel(b, "Framkant fack", "fack", mat, { x: t, y: shelfY + t, z: D - t }, { x: iw, y: lipH, z: t });
  if (p.divider) panel(b, "Mellanvägg fack", "fack", mat, { x: W / 2 - t / 2, y: shelfY + t, z: t }, { x: t, y: H - shelfY - t - 10, z: D - 2 * t });

  // Låda (infälld front)
  const dw = iw - 3, dd = D - t - 5;
  const bh = dh - 4;
  const front = mat;
  b.inUnit("Låda", () => {
    drawerBox(b, "Låda", mat, t, bottomMat, bt, t + 1.5, t + 1, t + 5, dw, bh, dd - t);
    panel(b, "Lådfront", "lådor", front, { x: t + 1.5, y: t + 1, z: D - t }, { x: dw, y: bh, z: t });
  });

  b.hw("Trälim", 1, "flaska");
  b.hw("Dyckert/spik 1,6×30 eller skruv 3×30", 24);
  b.hw("Liten knopp", 1);
  b.step("Kapa", "Kapa alla delar. Små delar: använd ett stoppklossanslag så bitarna blir exakt lika långa.", []);
  b.step("Stomme", "Limma och spika botten, sidor, rygg och mellanbotten. Håll ihop med tvingar/tejp tills limmet torkat.", ["stomme"]);
  b.step("Fack", "Limma framkanten (och mellanväggen) i det övre facket.", ["fack"]);
  b.step("Låda", "Limma ihop lådan, provpassa och slipa tills den går lätt. Sätt knoppen.", ["lådor"]);
  if (t > 25) b.note(`Delarna blir ${t} mm tjocka eftersom inget tunnare material finns – överväg brädor eller plywood 12 mm.${b.has("bordssag") ? " Med bordssågen kan du också klyva virket tunnare." : ""}`);
  if (b.has("borrmaskin")) b.note("Tips: borra några hål Ø 12–14 mm i mellanbotten som hållare för pennor.");
  b.note("Slipa alla kanter och olja eller lacka.");
  return b.design(`Pennställ med låda ${W}×${D}×${H} mm`, prompt, "penHolder", p);
}
