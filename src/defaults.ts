import type { Material, Tool, Workshop } from "./types";

export const SAWS = ["handsag", "kapgersag", "bordssag", "cirkelsag", "sticksag"] as const;

export function defaultMaterials(): Material[] {
  const lin = (id: string, name: string, a: number, b: number, len: number, price: number, color: string, available = true): Material => ({
    id, name, kind: "linear", a, b, stockLength: len, stockWidth: 0, price, color, available,
  });
  return [
    lin("regel-45x45", "Regel 45×45", 45, 45, 3600, 55, "#d9b779"),
    lin("regel-45x70", "Regel 45×70", 45, 70, 3600, 75, "#d6b273", false),
    lin("regel-45x95", "Regel 45×95", 45, 95, 3600, 95, "#d3ad6c"),
    lin("bord-22x95", "Bräda 22×95", 22, 95, 3600, 60, "#e2c48e"),
    lin("bord-22x145", "Bräda 22×145", 22, 145, 3600, 90, "#e0c089", false),
    lin("lakt-28x70", "Läkt 28×70", 28, 70, 3600, 40, "#cfa968", false),
    lin("trall-28x120", "Trall 28×120 (tryckimpr.)", 28, 120, 3600, 85, "#b7a06a", false),
    {
      id: "plywood-12", name: "Plywood 12 mm", kind: "sheet", a: 12, b: 12,
      stockLength: 2440, stockWidth: 1220, price: 450, color: "#e8cf9c", available: true,
    },
    {
      id: "osb-18", name: "OSB 18 mm", kind: "sheet", a: 18, b: 18,
      stockLength: 2440, stockWidth: 1220, price: 380, color: "#c9a060", available: false,
    },
    {
      id: "kattnat", name: "Nät/volträd 19×19 mm", kind: "mesh", a: 1, b: 1,
      stockLength: 10000, stockWidth: 1000, price: 600, color: "#9aa3a8", available: true,
    },
  ];
}

export function defaultTools(): Tool[] {
  const t = (id: string, name: string, available: boolean): Tool => ({ id, name, available });
  return [
    t("handsag", "Vanlig handsåg", true),
    t("kapgersag", "Kap- & gersåg", true),
    t("bordssag", "Bordssåg", true),
    t("cirkelsag", "Cirkelsåg", false),
    t("sticksag", "Sticksåg", false),
    t("skruvdragare", "Skruvdragare", true),
    t("borrmaskin", "Borrmaskin", false),
    t("haftpistol", "Häftpistol", false),
    t("avbitare", "Avbitare / plåtsax", true),
    t("vinkelhake", "Vinkelhake & tumstock", true),
    t("tving", "Tvingar", false),
    t("vattenpass", "Vattenpass", true),
  ];
}

export function defaultWorkshop(): Workshop {
  return { materials: defaultMaterials(), tools: defaultTools(), kerf: 3 };
}

export function hasTool(ws: Workshop, id: string): boolean {
  return ws.tools.some((t) => t.id === id && t.available);
}
