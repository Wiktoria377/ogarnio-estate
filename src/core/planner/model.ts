import type { ScheduleChannel, ScheduleStatus } from "@/lib/supabase/database.types";
import { addDays } from "./time";

export const SCHEDULE_STATUSES: Record<ScheduleStatus, { label: string; tone: "muted" | "neutral" | "warning" | "accent" | "success" }> = {
  idea: { label: "Pomysł", tone: "muted" },
  in_progress: { label: "W przygotowaniu", tone: "neutral" },
  for_approval: { label: "Do zatwierdzenia", tone: "warning" },
  ready: { label: "Gotowe", tone: "accent" },
  published: { label: "Opublikowane", tone: "success" },
};
export const SCHEDULE_STATUS_IDS = Object.keys(SCHEDULE_STATUSES) as [ScheduleStatus, ...ScheduleStatus[]];

export const SCHEDULE_CHANNELS: Record<ScheduleChannel, { label: string; time: string }> = {
  instagram: { label: "Instagram", time: "18:00" },
  facebook: { label: "Facebook", time: "18:30" },
  tiktok: { label: "TikTok", time: "20:00" },
  linkedin: { label: "LinkedIn", time: "08:30" },
  meta_ads: { label: "Meta Ads", time: "09:00" },
  email: { label: "E-mail", time: "10:00" },
  website: { label: "Strona www", time: "12:00" },
  other: { label: "Inne", time: "12:00" },
};
export const SCHEDULE_CHANNEL_IDS = Object.keys(SCHEDULE_CHANNELS) as [ScheduleChannel, ...ScheduleChannel[]];
export const PLAN_LENGTHS = [7, 14, 30] as const;
export type PlanLength = (typeof PLAN_LENGTHS)[number];

export interface PlanContent {
  id: string;
  kind: "text" | "graphic" | "video" | "document";
  contentType: string;
  title: string;
  platform: string | null;
}

export interface PlannedEntry {
  date: string;
  time: string;
  channel: ScheduleChannel;
  title: string;
  contentItemId: string | null;
  status: ScheduleStatus;
  notes: string | null;
}

/** Which channels a material fits (by kind and by the platform it was written for). */
export function channelsFor(c: PlanContent): ScheduleChannel[] {
  const p = (c.platform ?? "").toLowerCase();
  if (c.kind === "video") return ["instagram", "tiktok", "facebook"];
  if (c.kind === "document") return ["email", "website"];
  if (c.contentType.includes("meta_ads") || c.contentType.includes("ad_")) return ["meta_ads"];
  if (p.includes("linkedin")) return ["linkedin"];
  if (p.includes("facebook")) return ["facebook"];
  if (p.includes("instagram")) return ["instagram"];
  if (p.includes("tiktok")) return ["tiktok"];
  if (p.includes("e-mail") || p.includes("email")) return ["email"];
  if (p.includes("www") || p.includes("portal")) return ["website"];
  return c.kind === "graphic" ? ["instagram", "facebook"] : ["facebook", "instagram", "linkedin"];
}

/** Topic prompts for empty slots. They are ideas to fill, never claims about an offer. */
const IDEAS: Record<ScheduleChannel, string[]> = {
  instagram: ["Pomysł: prezentacja oferty w karuzeli", "Pomysł: kulisy pracy biura", "Pomysł: porada dla kupujących", "Pomysł: przed i po (home staging)"],
  facebook: ["Pomysł: post z nową ofertą", "Pomysł: porada prawna lub finansowa", "Pomysł: pytanie do obserwujących", "Pomysł: rynek w okolicy (dane ze źródłem)"],
  tiktok: ["Pomysł: krótki spacer po ofercie", "Pomysł: 3 rzeczy, które sprawdzić na prezentacji", "Pomysł: dzień z życia agenta"],
  linkedin: ["Pomysł: komentarz do sytuacji na rynku", "Pomysł: sukces zespołu (bez danych klientów)", "Pomysł: porada dla sprzedających"],
  meta_ads: ["Pomysł: kampania reklamowa oferty", "Pomysł: reklama pozyskania zleceń"],
  email: ["Pomysł: newsletter z nowymi ofertami", "Pomysł: e-mail do klientów z bazy"],
  website: ["Pomysł: wpis na blog biura", "Pomysł: aktualizacja oferty na stronie"],
  other: ["Pomysł: materiał do przygotowania"],
};

const statusForItem = (kind: PlanContent["kind"]): ScheduleStatus => (kind === "video" || kind === "graphic" ? "for_approval" : "in_progress");

/**
 * Deterministic publication plan: `postsPerWeek` spread evenly over `days`,
 * channels rotated, materials assigned to the first slot on a channel they
 * fit (each material once). Remaining slots become clearly marked ideas.
 */
export function generatePlan(o: { startDate: string; days: PlanLength; postsPerWeek: number; channels: ScheduleChannel[]; content: PlanContent[]; namePrefix?: string }): PlannedEntry[] {
  const total = Math.max(1, Math.round((o.postsPerWeek * o.days) / 7));
  const channels = o.channels.length ? o.channels : (["instagram"] as ScheduleChannel[]);
  const unused = [...o.content];
  const ideaIndex = new Map<ScheduleChannel, number>();
  const out: PlannedEntry[] = [];
  for (let i = 0; i < total; i++) {
    // Even spacing; several posts a day only when the frequency requires it.
    const day = Math.min(o.days - 1, Math.floor((i * o.days) / total));
    const channel = channels[i % channels.length]!;
    const sameDay = out.filter((e) => e.date === addDays(o.startDate, day) && e.channel === channel).length;
    const [hh, mm] = SCHEDULE_CHANNELS[channel].time.split(":").map(Number);
    const time = `${String(Math.min(22, hh! + sameDay * 2)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const fit = unused.findIndex((c) => channelsFor(c).includes(channel));
    if (fit >= 0) {
      const c = unused.splice(fit, 1)[0]!;
      out.push({ date: addDays(o.startDate, day), time, channel, title: `${SCHEDULE_CHANNELS[channel].label}: ${c.title}`.slice(0, 200), contentItemId: c.id, status: statusForItem(c.kind), notes: null });
    } else {
      const k = ideaIndex.get(channel) ?? 0;
      ideaIndex.set(channel, k + 1);
      const ideas = IDEAS[channel];
      out.push({ date: addDays(o.startDate, day), time, channel, title: ideas[k % ideas.length]!, contentItemId: null, status: "idea", notes: "Slot z planu. Przypisz materiał z biblioteki albo przygotuj nowy." });
    }
  }
  return out;
}

/** Monday-first grid of 6 weeks containing `anchor`'s month. */
export function monthGrid(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(anchor: string): string[] {
  const dow = (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(anchor, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAYS_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
export const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const WEEKDAYS_LONG = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];

export function dayLabel(date: string, withWeekday = true): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
  return `${withWeekday ? `${WEEKDAYS_LONG[dow]}, ` : ""}${d} ${MONTHS_GEN[m! - 1]}`;
}
