import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Design, Material, Part, Vec3 } from "./types";
import { bounds } from "./analysis";

const S = 0.001; // mm → meter i scenen

export interface ViewerOptions {
  /** mode: "replace" = vanligt klick, "toggle" = Shift/Ctrl-klick, "unit" = dubbelklick (hela enheten) */
  onSelect: (id: string | null, mode: "replace" | "toggle" | "unit") => void;
  /** Markerade delar har flyttats `delta` mm */
  onMove: (ids: string[], delta: Vec3) => void;
  onHover: (part: Part | null, x: number, y: number) => void;
}

function woodTexture(color: string, kind: Material["kind"]): THREE.Texture | null {
  if (kind === "mesh") {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 64);
  // enkel ådring
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    const y = rnd() * 64;
    g.strokeStyle = `rgba(90,55,20,${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * (1 + rnd() * 2.5));
    g.stroke();
  }
  if (kind === "sheet") {
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, 0, 256, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Viewer {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gizmo: TransformControls;
  root = new THREE.Group();
  dimGroup = new THREE.Group();
  env = new THREE.Group();
  meshes = new Map<string, THREE.Mesh>();
  matCache = new Map<string, THREE.MeshStandardMaterial>();
  selected = new Set<string>();
  /** Osynligt handtag i mitten av markeringen som flyttpilarna sitter på */
  private pivot = new THREE.Object3D();
  private dragStart: { pivot: THREE.Vector3; meshes: Map<string, THREE.Vector3> } | null = null;
  explode = 0;
  showDims = true;
  xray = false;
  private design: Design | null = null;
  private materials: Material[] = [];
  private visibleGroups: Set<string> | null = null;
  private activeGroups: Set<string> | null = null;
  private hlIds = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt = { x: 0, y: 0 };
  private dark = false;

  constructor(private el: HTMLElement, private opts: ViewerOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    el.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
    this.camera.position.set(3, 2.2, 4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setTranslationSnap(5 * S);
    this.gizmo.setSize(0.8);
    this.scene.add(this.pivot);
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.controls.enabled = !e.value;
      if (e.value) {
        this.dragStart = {
          pivot: this.pivot.position.clone(),
          meshes: new Map([...this.selected].flatMap((id) => {
            const m = this.meshes.get(id);
            return m ? [[id, m.position.clone()] as const] : [];
          })),
        };
      } else if (this.dragStart) {
        const d = this.pivot.position.clone().sub(this.dragStart.pivot);
        this.dragStart = null;
        const delta = { x: Math.round(d.x / S), y: Math.round(d.y / S), z: Math.round(d.z / S) };
        if (delta.x || delta.y || delta.z) this.opts.onMove([...this.selected], delta);
      }
    });
    // Flytta alla markerade delar live medan handtaget dras
    this.gizmo.addEventListener("objectChange", () => {
      if (!this.dragStart) return;
      const d = this.pivot.position.clone().sub(this.dragStart.pivot);
      for (const [id, start] of this.dragStart.meshes) this.meshes.get(id)?.position.copy(start).add(d);
    });
    this.scene.add(this.gizmo.getHelper());

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d7a60, 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -6;
    sc.right = sc.top = 6;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.scene.add(this.env, this.root, this.dimGroup);

    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    dom.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4) return;
      if ((this.gizmo as unknown as { dragging: boolean }).dragging) return;
      const hit = this.pick(e);
      this.opts.onSelect(hit, e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "replace");
    });
    dom.addEventListener("dblclick", (e) => {
      const hit = this.pick(e as PointerEvent);
      if (hit) this.opts.onSelect(hit, "unit");
    });
    dom.addEventListener("pointermove", (e) => {
      const id = this.pick(e);
      const part = id ? this.design?.parts.find((p) => p.id === id) ?? null : null;
      const r = this.el.getBoundingClientRect();
      this.opts.onHover(part, e.clientX - r.left, e.clientY - r.top);
    });
    dom.addEventListener("pointerleave", () => this.opts.onHover(null, 0, 0));

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  setTheme(dark: boolean) {
    this.dark = dark;
    this.scene.background = new THREE.Color(dark ? 0x1c1f24 : 0xeef1f4);
    this.buildEnv();
  }

  private resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pick(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()].filter((m) => m.visible), false);
    // Ignorera nät om något annat träffas bakom
    const solid = hits.find((h) => !h.object.userData.mesh);
    return ((solid ?? hits[0])?.object.userData.id as string) ?? null;
  }

  /** Färgkarta för hållfasthet: utnyttjandegrad per del (saknas = ej beräknad) */
  private heat: Map<string, number> | null = null;

  /** Färg efter utnyttjandegrad: grön < 50 %, gulgrön < 80 %, orange < 100 %, röd ≥ 100 % */
  static heatColor(u: number): string {
    return u >= 1 ? "#d8342c" : u >= 0.8 ? "#f0a020" : u >= 0.5 ? "#9cc43a" : "#2e9e5b";
  }

  private heatMaterial(u: number | undefined, mat: Material | undefined): THREE.MeshStandardMaterial {
    const key = u == null ? `heat-none-${mat?.kind}` : `heat-${Viewer.heatColor(u)}`;
    let m = this.matCache.get(key);
    if (m) return m;
    m = u == null
      ? new THREE.MeshStandardMaterial({ color: this.dark ? 0x5a6069 : 0xc4c8cf, roughness: 0.9, transparent: true, opacity: mat?.kind === "mesh" ? 0.08 : 0.55, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: Viewer.heatColor(u), roughness: 0.7 });
    this.matCache.set(key, m);
    return m;
  }

  /** Sätt färgkartan. `rebuild = false` när setDesign ändå anropas direkt efteråt. */
  setHeatmap(heat: Map<string, number> | null, rebuild = true) {
    this.heat = heat;
    // färgerna för "ej beräknad" beror på temat – rensa cachen
    for (const k of [...this.matCache.keys()]) if (k.startsWith("heat-none")) this.matCache.delete(k);
    if (!rebuild) return;
    if (this.design) this.setDesign(this.design, this.materials);
    this.select([...this.selected], !!this.gizmo.object);
  }

  private material(mat: Material | undefined): THREE.MeshStandardMaterial {
    const key = mat ? `${mat.id}|${mat.color}|${this.xray}` : "unknown";
    let m = this.matCache.get(key);
    if (m) return m;
    if (!mat) m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    else if (mat.kind === "mesh")
      m = new THREE.MeshStandardMaterial({
        color: mat.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, metalness: 0.3, roughness: 0.5,
      });
    else
      m = new THREE.MeshStandardMaterial({
        color: 0xffffff, map: woodTexture(mat.color, mat.kind), roughness: 0.8,
        transparent: this.xray, opacity: this.xray ? 0.35 : 1, depthWrite: !this.xray,
      });
    this.matCache.set(key, m);
    return m;
  }

  private explodeOffset(p: Part): Vec3 {
    if (!this.explode || !this.design) return { x: 0, y: 0, z: 0 };
    const b = bounds(this.design.parts);
    const c = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
    const k = this.explode;
    return { x: (p.pos.x - c.x) * k, y: (p.pos.y - b.min.y) * k * 0.6, z: (p.pos.z - c.z) * k };
  }

  setDesign(design: Design, materials: Material[], fit = false) {
    this.design = design;
    this.materials = materials;
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      m.children.forEach((c) => (c as THREE.LineSegments).geometry?.dispose());
    }
    this.root.clear();
    this.meshes.clear();
    const edgeMat = new THREE.LineBasicMaterial({ color: this.dark ? 0x000000 : 0x5a4225, transparent: true, opacity: 0.45 });
    for (const p of design.parts) {
      const mat = materials.find((m) => m.id === p.materialId);
      const geo = new THREE.BoxGeometry(Math.max(p.dims.x, 0.5) * S, Math.max(p.dims.y, 0.5) * S, Math.max(p.dims.z, 0.5) * S);
      const material = this.heat ? this.heatMaterial(this.heat.get(p.id), mat) : this.material(mat);
      if (mat && mat.kind !== "mesh" && material.map) {
        // skala texturen så ådringen följer delens längd ungefär
        const uv = geo.attributes.uv;
        const len = Math.max(p.dims.x, p.dims.y, p.dims.z) / 600;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
      }
      if (mat?.kind === "mesh") {
        const uv = geo.attributes.uv;
        const d = [p.dims.x, p.dims.y, p.dims.z].sort((a, b) => b - a);
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * d[0]) / 19, (uv.getY(i) * d[1]) / 19);
      }
      const mesh = new THREE.Mesh(geo, material);
      mesh.userData = { id: p.id, mesh: mat?.kind === "mesh" };
      mesh.castShadow = mat?.kind !== "mesh";
      mesh.receiveShadow = true;
      if (mat?.kind !== "mesh") {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
        edges.raycast = () => {};
        mesh.add(edges);
      }
      this.root.add(mesh);
      this.meshes.set(p.id, mesh);
    }
    this.layout();
    this.buildEnv();
    this.buildDims();
    if (fit) this.fit();
  }

  /** Placera delar (med ev. sprängvy) och uppdatera synlighet/markering. */
  layout() {
    if (!this.design) return;
    for (const p of this.design.parts) {
      const m = this.meshes.get(p.id);
      if (!m) continue;
      const off = this.explodeOffset(p);
      m.position.set((p.pos.x + off.x) * S, (p.pos.y + off.y) * S, (p.pos.z + off.z) * S);
      m.rotation.set(THREE.MathUtils.degToRad(p.rot.x), THREE.MathUtils.degToRad(p.rot.y), THREE.MathUtils.degToRad(p.rot.z));
      m.visible = !this.visibleGroups || this.visibleGroups.has(p.group);
    }
    this.applyHighlight();
  }

  private applyHighlight() {
    for (const [id, m] of this.meshes) {
      const part = this.design?.parts.find((p) => p.id === id);
      const sel = this.selected.has(id);
      const active = (this.activeGroups && part && this.activeGroups.has(part.group)) || this.hlIds.has(id);
      const base = m.material as THREE.MeshStandardMaterial;
      if (sel || active) {
        if (!m.userData.hl) {
          m.userData.base = base;
          m.material = base.clone();
          m.userData.hl = true;
        }
        const mm = m.material as THREE.MeshStandardMaterial;
        mm.emissive.set(sel ? 0x2f7de1 : 0xe07b00);
        mm.emissiveIntensity = sel ? 0.55 : 0.35;
      } else if (m.userData.hl) {
        (m.material as THREE.Material).dispose();
        m.material = m.userData.base;
        m.userData.hl = false;
      }
    }
  }

  select(ids: string[], move: boolean) {
    this.selected = new Set(ids.filter((id) => this.meshes.has(id)));
    this.applyHighlight();
    if (!move || !this.selected.size) return void this.gizmo.detach();
    // Handtaget placeras i mitten av markeringens omslutande låda
    const box = new THREE.Box3();
    for (const id of this.selected) box.expandByObject(this.meshes.get(id)!);
    box.getCenter(this.pivot.position);
    this.gizmo.attach(this.pivot);
  }

  setHighlight(ids: string[]) {
    this.hlIds = new Set(ids);
    this.applyHighlight();
  }

  setSteps(visible: Set<string> | null, active: Set<string> | null) {
    this.visibleGroups = visible;
    this.activeGroups = active;
    this.layout();
  }

  setExplode(v: number) {
    this.explode = v;
    this.layout();
    this.buildDims();
  }

  setXray(v: boolean) {
    this.xray = v;
    if (this.design) this.setDesign(this.design, this.materials);
    this.select([...this.selected], !!this.gizmo.object);
  }

  setShowDims(v: boolean) {
    this.showDims = v;
    this.buildDims();
  }

  private buildEnv() {
    this.env.clear();
    const d = this.design;
    const b = d ? bounds(d.parts) : { min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 1000, z: 1000 } };
    const size = Math.max(4000, (b.max.x - b.min.x) * 2.5, (b.max.z - b.min.z) * 2.5);
    const cx = ((b.min.x + b.max.x) / 2) * S, cz = ((b.min.z + b.max.z) / 2) * S;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size * S, size * S),
      new THREE.MeshStandardMaterial({ color: this.dark ? 0x2a2e35 : 0xdfe3e8, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.001, cz);
    ground.receiveShadow = true;
    ground.raycast = () => {};
    this.env.add(ground);
    const grid = new THREE.GridHelper((size * S), Math.round(size / 100), this.dark ? 0x3b414a : 0xc9ced6, this.dark ? 0x31363e : 0xd6dae0);
    grid.position.set(cx, 0, cz);
    grid.raycast = () => {};
    this.env.add(grid);
    if (d?.wall) {
      const w = d.wall;
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w.width * S, w.height * S, 0.1),
        new THREE.MeshStandardMaterial({ color: this.dark ? 0x4a4f57 : 0xf6f2ea, roughness: 0.95 }),
      );
      wall.position.set(cx, (w.height / 2) * S, -0.05 - 0.002);
      wall.receiveShadow = true;
      wall.raycast = () => {};
      this.env.add(wall);
    }
  }

  private buildDims() {
    this.dimGroup.clear();
    // ta bort gamla CSS-etiketter
    this.labels.domElement.querySelectorAll(".dim").forEach((n) => n.remove());
    if (!this.showDims || !this.design?.parts.length || this.explode) return;
    const vis = this.design.parts.filter((p) => !this.visibleGroups || this.visibleGroups.has(p.group));
    if (!vis.length) return;
    const b = bounds(vis);
    const col = this.dark ? 0x9fc3ff : 0x1d5fbf;
    const lm = new THREE.LineBasicMaterial({ color: col });
    const o = Math.max(25, Math.min(150, Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * 0.08)); // avstånd från konstruktionen
    const line = (a: Vec3, c: Vec3, text: string) => {
      const pts = [new THREE.Vector3(a.x * S, a.y * S, a.z * S), new THREE.Vector3(c.x * S, c.y * S, c.z * S)];
      this.dimGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
      const div = document.createElement("div");
      div.className = "dim";
      div.textContent = text;
      const lab = new CSS2DObject(div);
      lab.position.set(((a.x + c.x) / 2) * S, ((a.y + c.y) / 2) * S, ((a.z + c.z) / 2) * S);
      this.dimGroup.add(lab);
    };
    const W = Math.round(b.max.x - b.min.x), H = Math.round(b.max.y - b.min.y), D = Math.round(b.max.z - b.min.z);
    line({ x: b.min.x, y: b.min.y, z: b.max.z + o }, { x: b.max.x, y: b.min.y, z: b.max.z + o }, `${W} mm`);
    line({ x: b.max.x + o, y: b.min.y, z: b.max.z }, { x: b.max.x + o, y: b.max.y, z: b.max.z }, `${H} mm`);
    line({ x: b.max.x + o, y: b.min.y, z: b.min.z }, { x: b.max.x + o, y: b.min.y, z: b.max.z }, `${D} mm`);
  }

  fit() {
    if (!this.design?.parts.length) return;
    const b = bounds(this.design.parts);
    const c = new THREE.Vector3(((b.min.x + b.max.x) / 2) * S, ((b.min.y + b.max.y) / 2) * S, ((b.min.z + b.max.z) / 2) * S);
    const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * S;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.95 + r * 0.3;
    const dir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.005, r / 200);
    this.camera.far = Math.max(50, r * 40);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.controls.update();
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
}
