import "server-only";
import { addDays, todayWarsaw, warsawToIso } from "@/core/planner/time";
import type { CampaignContext } from "@/lib/campaigns";
import { dbError } from "@/lib/errors";
import type { Json, ScheduleChannel } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { DELIVERABLES, type DeliverableId } from "@/verticals/real-estate/campaign";
import { JobDeferred } from "../types";

type Slot = { deliverable: DeliverableId; day: number; time: string; channel: ScheduleChannel; title: string; notes?: string };

/** Publication rhythm for a campaign: social first, ads from day 1, video mid-week. */
const BASE: Slot[] = [
  { deliverable: "ig_post", day: 0, time: "18:00", channel: "instagram", title: "Post na Instagram" },
  { deliverable: "stories", day: 0, time: "19:30", channel: "instagram", title: "Stories (seria 3 plansz)" },
  { deliverable: "brochure", day: 0, time: "10:00", channel: "email", title: "Broszura PDF do klientów z bazy", notes: "Wyślij broszurę osobom, które szukają podobnej nieruchomości." },
  { deliverable: "fb_post", day: 1, time: "18:00", channel: "facebook", title: "Post na Facebook" },
  { deliverable: "meta_ads", day: 1, time: "09:00", channel: "meta_ads", title: "Start reklamy Meta Ads", notes: "Nagłówki do testów są w materiale „Nagłówki reklamowe”." },
  { deliverable: "carousel", day: 2, time: "18:00", channel: "instagram", title: "Karuzela" },
  { deliverable: "reel", day: 4, time: "19:00", channel: "instagram", title: "Reels", notes: "Opis do wideo jest w materiale „Opis do wideo”." },
  { deliverable: "stories", day: 5, time: "19:30", channel: "instagram", title: "Stories: przypomnienie" },
];

export async function campaignSchedule(ctx: WorkspaceContext, c: CampaignContext, jobId: string): Promise<Json> {
  // The schedule links the other materials, so it runs after their jobs settle.
  const { data: pending } = await ctx.supabase
    .from("generation_jobs")
    .select("id")
    .eq("campaign_id", c.campaign.id)
    .eq("workspace_id", ctx.workspace.id)
    .neq("id", jobId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (pending?.length) throw new JobDeferred(5000);

  const { data: assets } = await ctx.supabase.from("campaign_assets").select("deliverable, content_item_id").eq("campaign_id", c.campaign.id).eq("workspace_id", ctx.workspace.id);
  const itemFor = new Map((assets ?? []).filter((a) => a.content_item_id).map((a) => [a.deliverable, a.content_item_id!]));
  const chosen = new Set(c.campaign.deliverables);
  const platforms = new Set(c.campaign.platforms);

  const slots = BASE.filter((s) => chosen.has(s.deliverable));
  if (chosen.has("reel") && platforms.has("tiktok")) slots.push({ deliverable: "reel", day: 4, time: "20:00", channel: "tiktok", title: "Wideo na TikTok", notes: "To samo MP4 co Reels; opis z materiału „Opis do wideo”." });
  if (chosen.has("fb_post") && platforms.has("linkedin")) slots.push({ deliverable: "fb_post", day: 3, time: "08:30", channel: "linkedin", title: "Post na LinkedIn (na bazie posta z Facebooka)", notes: "Dostosuj ton do LinkedIn przed publikacją." });

  let start = c.options.startDate ?? addDays(todayWarsaw(), 1);
  if (start < todayWarsaw()) start = todayWarsaw();
  const entries = slots.map((s) => ({
    workspace_id: ctx.workspace.id,
    campaign_id: c.campaign.id,
    content_item_id: itemFor.get(s.deliverable) ?? null,
    title: `${s.title} · ${c.campaign.name}`.slice(0, 200),
    channel: s.channel,
    scheduled_at: warsawToIso(addDays(start, s.day), s.time),
    status: (itemFor.has(s.deliverable) ? "for_approval" : "idea") as "for_approval" | "idea",
    notes: s.notes ?? null,
    publish_provider: "manual" as const,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }));
  if (c.campaign.goal === "open_house" && c.options.openHouseDate && c.options.openHouseFrom) {
    const before = addDays(c.options.openHouseDate, -1);
    if (before >= start)
      entries.push({ ...entries[0]!, content_item_id: itemFor.get("stories") ?? itemFor.get("ig_post") ?? null, channel: "instagram", title: `Przypomnienie: dzień otwarty jutro · ${c.campaign.name}`.slice(0, 200), scheduled_at: warsawToIso(before, "18:00"), status: "idea", notes: "Przypomnienie o dniu otwartym (termin z formularza kampanii)." });
  }

  // Idempotent on retry: the campaign plan is replaced, manual entries are kept.
  await ctx.supabase.from("schedule_plans").delete().eq("campaign_id", c.campaign.id).eq("workspace_id", ctx.workspace.id).like("name", "Plan kampanii%");
  const { data: plan, error } = await ctx.supabase
    .from("schedule_plans")
    .insert({ workspace_id: ctx.workspace.id, campaign_id: c.campaign.id, name: `Plan kampanii · ${c.campaign.name}`.slice(0, 160), start_date: start, days: 7, posts_per_week: Math.min(14, Math.max(1, entries.length)), channels: [...new Set(entries.map((e) => e.channel))], created_by: ctx.userId })
    .select("id")
    .single();
  if (error || !plan) throw dbError(error, "Nie udało się zapisać planu publikacji.");
  const { error: entriesError } = await ctx.supabase.from("schedule_entries").insert(entries.map((e) => ({ ...e, plan_id: plan.id })));
  if (entriesError) throw dbError(entriesError, "Nie udało się zapisać wpisów planu.");
  return { planId: plan.id, entries: entries.length, label: DELIVERABLES.schedule.label };
}
