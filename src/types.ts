// Alla mått i millimeter. Koordinatsystem: X = bredd (vänster→höger),
// Y = höjd (golv = 0, uppåt), Z = djup (0 = vägg/baksida, positivt = framåt).

export type Vec3 = { x: number; y: number; z: number };

export type MaterialKind = "linear" | "sheet" | "mesh";

export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  /** linear: tvärsnitt (a ≤ b), sheet/mesh: tjocklek i a */
  a: number;
  b: number;
  /** linear: säljlängd. sheet: skivans längd. mesh: rullens längd */
  stockLength: number;
  /** sheet: skivans bredd. mesh: rullens bredd */
  stockWidth: number;
  /** pris per styck (valfritt, kr) */
  price?: number;
  color: string;
  available: boolean;
}

export interface Tool {
  id: string;
  name: string;
  available: boolean;
  custom?: boolean;
}

export interface Part {
  id: string;
  name: string;
  materialId: string;
  /** Lådans utsträckning i delens lokala koordinatsystem */
  dims: Vec3;
  /** Delens mittpunkt i världen */
  pos: Vec3;
  /** Rotation i grader (Euler XYZ) */
  rot: Vec3;
  /** Geringsvinkel i grader i respektive ände (0 = rakt kap) */
  endCuts: [number, number];
  /** Monteringsgrupp – kopplas till byggsteg */
  group: string;
  /** Enhet som hör ihop och kan markeras/flyttas tillsammans, t.ex. "Fack 2" eller "Låda 1" */
  unit?: string;
}

export interface Step {
  title: string;
  text: string;
  /** Grupper som monteras i detta steg */
  groups: string[];
}

export interface Hardware {
  name: string;
  qty: number;
  unit: string;
}

export interface Design {
  title: string;
  prompt: string;
  templateId: string | null;
  params: Record<string, number | boolean>;
  parts: Part[];
  steps: Step[];
  hardware: Hardware[];
  notes: string[];
  /** Omgivning att rita: vägg bakom (bredd × höjd) */
  wall: { width: number; height: number } | null;
  /** Sant om delar ändrats för hand (då genereras inte om automatiskt) */
  edited?: boolean;
}

export interface Workshop {
  materials: Material[];
  tools: Tool[];
  /** sågbladets bredd, mm */
  kerf: number;
}
