import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Design, Workshop } from "./types";
import { newId } from "./generators/builder";

export const AI_MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5 (bäst)" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5 (snabbare, billigare)" },
];

const vec = z.object({ x: z.number(), y: z.number(), z: z.number() });

const DesignSchema = z.object({
  title: z.string(),
  parts: z.array(
    z.object({
      name: z.string(),
      materialId: z.string(),
      dims: vec,
      pos: vec,
      rot: vec,
      endCuts: z.array(z.number()),
      group: z.string(),
      unit: z.string(),
    }),
  ),
  steps: z.array(z.object({ title: z.string(), text: z.string(), groups: z.array(z.string()) })),
  hardware: z.array(z.object({ name: z.string(), qty: z.number(), unit: z.string() })),
  notes: z.array(z.string()),
  wall: z.object({ present: z.boolean(), width: z.number(), height: z.number() }),
  reply: z.string(),
});

const SYSTEM = `Du är en erfaren snickare och konstruktör som hjälper en hemmabyggare att planera byggprojekt i trä.
Du svarar alltid med en komplett 3D-modell av konstruktionen som en lista av rätblocksformade delar, plus byggsteg, beslag och tips. All text på svenska.

KOORDINATSYSTEM OCH ENHETER
- Alla mått i millimeter.
- X = bredd (vänster→höger), Y = höjd (golvet är y=0, uppåt positivt), Z = djup (z=0 är baksidan/väggen, framsidan har störst z).
- Varje del är ett rätblock: "dims" = utsträckning längs delens lokala x/y/z-axlar, "pos" = blockets MITTPUNKT i världen, "rot" = Euler-rotation i grader (XYZ). Använd rot {0,0,0} för allt som inte är snett (snedstöd).
- För ett snedstöd: lägg längden längs lokal x och rotera runt z (eller längden längs lokal z och rotera runt x), och ange endCuts, t.ex. [45,45].
- "endCuts" = geringsvinkel i grader i delens två ändar, [0,0] för raka kap.

MATERIAL OCH VERKTYG
- Använd ENBART materialId från listan över material. Använd i första hand material som är markerade som tillgängliga.
- Linjärt virke: delens två minsta mått ska vara lika med virkets tvärsnitt (a×b). Mindre tvärsnitt betyder att virket måste klyvas – gör det bara om bordssåg eller cirkelsåg finns.
- Ingen del får vara längre än materialets säljlängd; skarva annars över ett stöd.
- Skivmaterial: tunnaste måttet = skivans tjocklek, övriga får inte överstiga skivans mått.
- Nät: tjocklek 1 mm, placera på utsidan av ramen.
- Anpassa konstruktionen efter verktygen: utan kap- & gersåg eller bordssåg – undvik vinkelkap (använd t.ex. hörnplåtar). Utan bordssåg – undvik klyvning.

KONSTRUKTION
- Delarna ska ligga an mot varandra (inga svävande delar) och inte överlappa i onödan.
- Bygg stabilt och realistiskt, som en riktig snickare skulle göra. Tänk på bärighet, spännvidder och förankring.
- "unit": delar som hör ihop fysiskt och kan flyttas som en enhet (t.ex. "Fack 2", "Gavel 1", "Låda 3", "Dörrblad") får samma unit. Tom sträng om delen inte hör till någon enhet.
- Ge varje del ett tydligt svenskt namn, och en "group" (t.ex. "stolpar", "reglar", "hyllplan"). Byggstegen refererar till grupperna i monteringsordning.
- Om konstruktionen står mot en vägg: sätt wall.present = true och ange väggens bredd/höjd, annars present=false och 0 som mått.
- "reply": 1–3 meningar till användaren om vad du byggt eller ändrat och viktiga val du gjort.`;

export interface AiSettings {
  apiKey: string;
  model: string;
}

function workshopText(ws: Workshop): string {
  const mats = ws.materials
    .map((m) => {
      const size = m.kind === "linear" ? `tvärsnitt ${m.a}×${m.b} mm, säljlängd ${m.stockLength} mm` : m.kind === "sheet" ? `tjocklek ${m.a} mm, skiva ${m.stockLength}×${m.stockWidth} mm` : `nät, rulle ${m.stockWidth}×${m.stockLength} mm`;
      return `- id "${m.id}": ${m.name} (${m.kind}), ${size}${m.available ? " – TILLGÄNGLIGT" : " – kan köpas"}`;
    })
    .join("\n");
  const tools = ws.tools.filter((t) => t.available).map((t) => t.name).join(", ") || "inga";
  return `MATERIAL:\n${mats}\n\nVERKTYG SOM FINNS: ${tools}\nSågbladets bredd: ${ws.kerf} mm`;
}

export async function aiDesign(
  settings: AiSettings,
  ws: Workshop,
  request: string,
  current: Design | null,
  onProgress?: (chars: number) => void,
): Promise<{ design: Design; reply: string }> {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

  let user = `${workshopText(ws)}\n\n`;
  if (current && current.parts.length) {
    const compact = {
      title: current.title,
      parts: current.parts.map(({ id: _id, ...p }) => ({ ...p, unit: p.unit ?? "" })),
      steps: current.steps,
      hardware: current.hardware,
      notes: current.notes,
      wall: current.wall,
    };
    user += `NUVARANDE KONSTRUKTION (ändra i den enligt önskemålet och returnera HELA den uppdaterade konstruktionen):\n${JSON.stringify(compact)}\n\n`;
  }
  user += `ÖNSKEMÅL: ${request}`;

  const stream = client.beta.messages.stream({
    model: settings.model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(DesignSchema) },
  });
  let chars = 0;
  stream.on("text", (t) => {
    chars += t.length;
    onProgress?.(chars);
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Modellen avböjde förfrågan.");
  if (msg.stop_reason === "max_tokens") throw new Error("Svaret blev för långt – försök med en enklare konstruktion.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = DesignSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Kunde inte tolka svaret från AI:n.");
  const d = parsed.data;
  const ids = new Set(ws.materials.map((m) => m.id));
  const design: Design = {
    title: d.title,
    prompt: request,
    templateId: null,
    params: {},
    parts: d.parts
      .filter((p) => ids.has(p.materialId))
      .map((p) => ({
        id: newId(),
        name: p.name,
        materialId: p.materialId,
        dims: { x: Math.abs(p.dims.x), y: Math.abs(p.dims.y), z: Math.abs(p.dims.z) },
        pos: p.pos,
        rot: p.rot,
        endCuts: [p.endCuts[0] ?? 0, p.endCuts[1] ?? 0],
        group: p.group,
        ...(p.unit ? { unit: p.unit } : {}),
      })),
    steps: d.steps,
    hardware: d.hardware,
    notes: d.notes,
    wall: d.wall.present ? { width: d.wall.width, height: d.wall.height } : null,
  };
  return { design, reply: d.reply };
}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Ogiltig API-nyckel.";
  if (e instanceof Anthropic.RateLimitError) return "För många förfrågningar – vänta en stund och försök igen.";
  if (e instanceof Anthropic.APIConnectionError) return "Kunde inte nå Anthropic API (nätverk/CORS).";
  if (e instanceof Anthropic.APIError) return `API-fel ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
