import { z } from "zod";
import { BUSINESS_GOALS, type BusinessGoal } from "@/core/strategy/director";
import type { Goal } from "@/core/marketing-engine/taxonomy";
import { addDays } from "@/core/planner/time";

/**
 * Campaign Autopilot: "Przygotuj mój marketing na najbliższy miesiąc".
 * The plan is deterministic (dates, pillars, channels, formats, offers and
 * the reason for each item); AI only writes the materials afterwards, within
 * a cost limit. Nothing is published and no paid campaign is started: every
 * material goes to the approval queue, and an accepted one can only be put in
 * the planner (publishing keeps its own approval).
 */
export const AUTOPILOT_VERSION = "autopilot-1.0.0";

export const AUTOPILOT_PLATFORMS = {
  instagram: { label: "Instagram", time: "18:00" },
  facebook: { label: "Facebook", time: "12:00" },
  linkedin: { label: "LinkedIn", time: "08:30" },
  tiktok: { label: "TikTok", time: "19:00" },
} as const;
export type AutopilotPlatform = keyof typeof AUTOPILOT_PLATFORMS;
export const AUTOPILOT_PLATFORM_IDS = Object.keys(AUTOPILOT_PLATFORMS) as [AutopilotPlatform, ...AutopilotPlatform[]];

export const PILLARS = {
  offers: { label: "Oferty biura", needsProperty: true, brief: "Pokaż konkretną ofertę: parametry i zdjęcia z karty oferty, korzyść dla odbiorcy, jedno CTA." },
  education: { label: "Edukacja kupujących i sprzedających", needsProperty: false, brief: "Praktyczna porada o kupnie, sprzedaży lub najmie: jeden problem, konkretne kroki, bez danych rynkowych bez źródła." },
  owners: { label: "Pozyskanie właścicieli", needsProperty: false, brief: "Pokaż właścicielom, jak biuro przygotowuje i prowadzi sprzedaż. Bez obietnic ceny ani czasu sprzedaży." },
  trust: { label: "Zaufanie i sposób pracy biura", needsProperty: false, brief: "Jak biuro pracuje: proces, zasady, przygotowanie dokumentów. Bez wymyślonych opinii, liczb i nagród." },
  brand: { label: "Zespół i marka", needsProperty: false, brief: "Ludzie i wartości biura. Wyłącznie informacje z profilu marki, bez wymyślonych historii." },
} as const;
export type Pillar = keyof typeof PILLARS;
export const PILLAR_IDS = Object.keys(PILLARS) as [Pillar, ...Pillar[]];

export const AUTOPILOT_KINDS = {
  post: { label: "Post", output: "text" },
  carousel: { label: "Karuzela", output: "graphic" },
  promo_graphic: { label: "Grafika promocyjna", output: "graphic" },
  video_script: { label: "Scenariusz wideo", output: "text" },
  ad_proposal: { label: "Propozycja reklamy (nie uruchamiana)", output: "text" },
} as const;
export type AutopilotKind = keyof typeof AUTOPILOT_KINDS;
export const AUTOPILOT_KIND_IDS = Object.keys(AUTOPILOT_KINDS) as [AutopilotKind, ...AutopilotKind[]];

export const MAX_ITEMS = 40;

export const autopilotInputSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().min(7).max(31).default(30),
    count: z.number().int().min(1).max(MAX_ITEMS).default(12),
    platforms: z.array(z.enum(AUTOPILOT_PLATFORM_IDS)).min(1).max(4),
    propertyIds: z.array(z.uuid()).max(10).default([]),
    pillars: z.array(z.enum(PILLAR_IDS)).min(1).max(5),
    goals: z.array(z.enum(Object.keys(BUSINESS_GOALS) as [BusinessGoal, ...BusinessGoal[]])).min(1).max(3),
    includeVideo: z.boolean().default(true),
    /** Ad copy proposals only: the system never starts or pays for a campaign. */
    includeAds: z.boolean().default(false),
    /** Maximum AI generations for this run (cost limit). */
    aiLimit: z.number().int().min(0).max(MAX_ITEMS).default(12),
    strategyId: z.uuid().nullable().default(null),
  })
  .superRefine((d, ctx) => {
    if (d.pillars.includes("offers") && d.propertyIds.length === 0) ctx.addIssue({ code: "custom", path: ["propertyIds"], message: "Filar „Oferty biura” wymaga wybrania co najmniej jednej oferty." });
    if (d.includeAds && d.propertyIds.length === 0) ctx.addIssue({ code: "custom", path: ["includeAds"], message: "Propozycje reklam dotyczą ofert: wybierz ofertę." });
  });
export type AutopilotInput = z.infer<typeof autopilotInputSchema>;

export interface PlanProperty {
  id: string;
  title: string;
  photos: number;
}

/** Material from an accepted strategy (AI Marketing Director). */
export interface StrategyMaterial {
  content_type: string;
  platform: string;
  property_id: string | null;
  topic: string;
  week: number;
  pillar: string;
}

export interface PlannedItem {
  position: number;
  kind: AutopilotKind;
  platform: AutopilotPlatform;
  pillar: Pillar;
  goal: BusinessGoal;
  propertyId: string | null;
  /** Content type of the text engine, or the graphic format. */
  contentType: string;
  format: "square" | "carousel" | "story" | null;
  date: string;
  time: string;
  topic: string;
  rationale: string;
}

const KIND_TEXT: Record<Pillar, string> = {
  offers: "property_sales_post",
  education: "buying_content",
  owners: "selling_content",
  trust: "trust_post",
  brand: "image_post",
};

/** Goal weights → how often a pillar appears (deterministic). */
export function pillarWeights(input: Pick<AutopilotInput, "pillars" | "goals">): Record<Pillar, number> {
  const g = new Set(input.goals);
  const w: Record<Pillar, number> = { offers: 0, education: 0, owners: 0, trust: 0, brand: 0 };
  for (const p of input.pillars) w[p] = 1;
  if (w.offers) w.offers += g.has("sell_listings") || g.has("leads") ? 2 : 0;
  if (w.owners) w.owners += g.has("acquire_listings") ? 2 : 0;
  if (w.education) w.education += g.has("expert_brand") || g.has("leads") ? 1 : 0;
  if (w.trust) w.trust += g.has("expert_brand") || g.has("acquire_listings") ? 1 : 0;
  if (w.brand) w.brand += g.has("agent_brand") || g.has("premium") ? 1 : 0;
  return w;
}

/** Smooth weighted round-robin: stable, proportional, no two heavy pillars bunched. */
export function weightedSequence<T extends string>(weights: Record<T, number>, n: number): T[] {
  const keys = (Object.keys(weights) as T[]).filter((k) => weights[k] > 0);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  const current = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  const out: T[] = [];
  for (let i = 0; i < n && keys.length; i++) {
    for (const k of keys) current[k] += weights[k];
    const best = keys.reduce((a, b) => (current[b] > current[a] ? b : a));
    current[best] -= total;
    out.push(best);
  }
  return out;
}

const goalFor = (pillar: Pillar, goals: BusinessGoal[]): BusinessGoal => {
  const pref: Record<Pillar, BusinessGoal[]> = {
    offers: ["sell_listings", "leads", "premium"],
    education: ["expert_brand", "leads", "agent_brand"],
    owners: ["acquire_listings", "expert_brand"],
    trust: ["expert_brand", "acquire_listings", "agent_brand"],
    brand: ["agent_brand", "premium", "expert_brand"],
  };
  return pref[pillar].find((g) => goals.includes(g)) ?? goals[0]!;
};

export function engineGoal(g: BusinessGoal): Goal {
  return BUSINESS_GOALS[g].engine as Goal;
}

const TOPICS: Record<Exclude<Pillar, "offers">, string[]> = {
  education: ["Jak przygotować się do oglądania mieszkania", "Dokumenty potrzebne przy zakupie mieszkania", "Na co zwrócić uwagę w umowie przedwstępnej", "Koszty dodatkowe przy zakupie nieruchomości", "Kredyt czy gotówka: pytania przed decyzją"],
  owners: ["Jak przygotowujemy mieszkanie do sesji zdjęciowej", "Od czego zależy cena ofertowa", "Jak wygląda sprzedaż z biurem krok po kroku", "Jakie dokumenty przygotować przed sprzedażą"],
  trust: ["Jak weryfikujemy stan prawny nieruchomości", "Jak prowadzimy prezentacje", "Co robimy po pierwszym kontakcie klienta"],
  brand: ["Kim jesteśmy i jak pracujemy", "Dzień pracy agenta", "Wartości, którymi się kierujemy"],
};

/**
 * Builds the publication plan. With an accepted strategy its materials come
 * first (mapped to the chosen channels and period); the rest follows the
 * weighted pillar rotation. Every item carries the reason it is there.
 */
export function buildAutopilotPlan(input: AutopilotInput, properties: PlanProperty[], strategy: StrategyMaterial[] = []): PlannedItem[] {
  const props = properties.filter((p) => input.propertyIds.includes(p.id));
  const platforms = input.platforms;
  const n = input.count;
  const items: Omit<PlannedItem, "position" | "date" | "time">[] = [];
  const counters = { offer: 0, platform: 0, topics: {} as Record<string, number>, video: 0 };
  const nextProperty = () => props.length ? props[counters.offer++ % props.length]! : null;

  // Ad proposals first (proposals only; one per offer, max 2).
  if (input.includeAds) {
    for (const p of props.slice(0, Math.min(2, n))) items.push({ kind: "ad_proposal", platform: platforms.includes("facebook") ? "facebook" : platforms.includes("instagram") ? "instagram" : platforms[0]!, pillar: "offers", goal: goalFor("offers", input.goals), propertyId: p.id, contentType: "property_meta_ad", format: null, topic: "", rationale: `Propozycja tekstu reklamy oferty „${p.title}”. Reklama nie zostanie uruchomiona ani opłacona przez system: to tylko tekst do Twojej decyzji w Menedżerze reklam.` });
  }

  // Materials of the accepted strategy.
  const strategyPillar = (m: StrategyMaterial): Pillar => (m.property_id ? "offers" : /właściciel|owner/i.test(m.pillar + m.content_type) ? "owners" : /zaufan|trust/i.test(m.pillar + m.content_type) ? "trust" : "education");
  for (const m of strategy) {
    if (items.length >= n) break;
    const pillar = strategyPillar(m);
    if (!input.pillars.includes(pillar)) continue;
    const platform = (platforms as readonly string[]).includes(m.platform) ? (m.platform as AutopilotPlatform) : platforms[counters.platform++ % platforms.length]!;
    const prop = m.property_id && input.propertyIds.includes(m.property_id) ? props.find((p) => p.id === m.property_id) ?? null : pillar === "offers" ? nextProperty() : null;
    if (pillar === "offers" && !prop) continue;
    items.push({ ...shape(pillar, platform, prop, input, counters), topic: m.topic.slice(0, 200), rationale: `Z zaakceptowanej strategii (tydzień ${m.week}, filar „${m.pillar}”). ${reasonFor(pillar, platform, prop, input)}` });
  }

  // Weighted rotation for the rest.
  const seq = weightedSequence(pillarWeights(input), n - items.length);
  for (const pillar of seq) {
    const platform = pickPlatform(pillar, platforms, counters);
    const prop = pillar === "offers" ? nextProperty() : null;
    const topics = pillar === "offers" ? [] : TOPICS[pillar];
    const t = counters.topics[pillar] ?? 0;
    counters.topics[pillar] = t + 1;
    items.push({ ...shape(pillar, platform, prop, input, counters), topic: topics.length ? topics[t % topics.length]! : "", rationale: reasonFor(pillar, platform, prop, input) });
  }

  // Dates: evenly over the period, at the channel's usual hour.
  return items.slice(0, n).map((it, i) => ({
    ...it,
    position: i + 1,
    date: addDays(input.startDate, Math.floor((i * input.days) / Math.max(1, Math.min(n, items.length)))),
    time: AUTOPILOT_PLATFORMS[it.platform].time,
  }));
}

function pickPlatform(pillar: Pillar, platforms: AutopilotPlatform[], c: { platform: number }): AutopilotPlatform {
  // LinkedIn suits owners/trust/education; offers rotate over all chosen channels.
  const preferred = pillar === "offers" ? platforms : platforms.filter((p) => p !== "tiktok" || pillar === "education");
  const list = preferred.length ? preferred : platforms;
  return list[c.platform++ % list.length]!;
}

function shape(pillar: Pillar, platform: AutopilotPlatform, prop: PlanProperty | null, input: AutopilotInput, c: { video: number }): Pick<PlannedItem, "kind" | "platform" | "pillar" | "goal" | "propertyId" | "contentType" | "format"> {
  const base = { platform, pillar, goal: goalFor(pillar, input.goals), propertyId: prop?.id ?? null };
  if (platform === "tiktok") return { ...base, kind: "video_script", contentType: prop ? "property_reels_script" : "short_video_script", format: null };
  if (pillar === "offers" && prop) {
    // Instagram/LinkedIn offers rotate: carousel, post, then a Reels script (when video is on).
    const slot = platform === "instagram" || platform === "linkedin" ? c.video++ % (input.includeVideo && platform === "instagram" ? 3 : 2) : -1;
    if (slot === 2) return { ...base, kind: "video_script", contentType: "property_reels_script", format: null };
    if (slot === 0 && prop.photos >= 3) return { ...base, kind: "carousel", contentType: "graphic_carousel", format: "carousel" };
    if (prop.photos >= 1 && platform === "facebook") return { ...base, kind: "promo_graphic", contentType: "graphic_square", format: "square" };
    return { ...base, kind: "post", contentType: "property_sales_post", format: null };
  }
  return { ...base, kind: "post", contentType: platform === "linkedin" && pillar !== "brand" ? "linkedin_post" : KIND_TEXT[pillar], format: null };
}

function reasonFor(pillar: Pillar, platform: AutopilotPlatform, prop: PlanProperty | null, input: AutopilotInput): string {
  const goal = BUSINESS_GOALS[goalFor(pillar, input.goals)].label.toLowerCase();
  const where = AUTOPILOT_PLATFORMS[platform].label;
  if (pillar === "offers" && prop) return `Filar „${PILLARS.offers.label}”, cel: ${goal}. Oferta „${prop.title}” (${prop.photos} ${prop.photos === 1 ? "zdjęcie" : "zdjęć"}) na ${where}.`;
  return `Filar „${PILLARS[pillar].label}”, cel: ${goal}. ${where}: ${pillar === "owners" || pillar === "trust" ? "treść budująca wiarygodność biura" : pillar === "education" ? "porada, którą odbiorcy zapisują i udostępniają" : "pokazuje ludzi stojących za biurem"}.`;
}

/** Run-level rationale from the plan and the office's own numbers (never invented). */
export function planRationale(input: AutopilotInput, plan: PlannedItem[], facts: { label: string; value: string }[]): string[] {
  const count = <K extends string>(f: (p: PlannedItem) => K) => plan.reduce((m, p) => m.set(f(p), (m.get(f(p)) ?? 0) + 1), new Map<K, number>());
  const pillars = [...count((p) => p.pillar)].map(([k, v]) => `${PILLARS[k].label}: ${v}`).join(", ");
  const platforms = [...count((p) => p.platform)].map(([k, v]) => `${AUTOPILOT_PLATFORMS[k].label}: ${v}`).join(", ");
  const kinds = [...count((p) => p.kind)].map(([k, v]) => `${AUTOPILOT_KINDS[k].label.toLowerCase()}: ${v}`).join(", ");
  const out = [
    `Cele: ${input.goals.map((g) => BUSINESS_GOALS[g].label.toLowerCase()).join("; ")}. Okres: ${input.days} dni od ${input.startDate}, ${plan.length} publikacji.`,
    `Podział na filary (częściej te, które najbardziej wspierają wybrane cele): ${pillars}.`,
    `Kanały: ${platforms}. Formaty: ${kinds}.`,
  ];
  const known = facts.filter((f) => f.value !== "Brak danych").slice(0, 6);
  if (known.length) out.push(`Dane biura użyte do planu: ${known.map((f) => `${f.label}: ${f.value}`).join("; ")}.`);
  const unknown = facts.filter((f) => f.value === "Brak danych").map((f) => f.label.toLowerCase());
  if (unknown.length) out.push(`Brak danych o: ${unknown.slice(0, 5).join(", ")}. Plan nie zakłada wyników, których nie da się sprawdzić.`);
  if (input.includeAds) out.push("Reklamy są tylko propozycjami tekstów. System nie uruchamia ani nie opłaca kampanii.");
  out.push("Żaden materiał nie zostanie opublikowany automatycznie: każdy trafia do kolejki akceptacji.");
  return out;
}
