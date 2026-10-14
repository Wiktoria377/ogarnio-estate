import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { can, canEditProperty } from "@/core/auth/permissions";
import { METRIC_KEYS, aggregate, isBot, rate, utmValue, weekKey, type Aggregate, type MetricKey, type Metrics, type LeadStatus, CONSENT_VERSION, consentText } from "@/core/analytics/metrics";
import { visitorHash } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, LeadRow, PropertyRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Own measurements (tracked-link clicks, offer page views, leads) and the
 * analytics report. Platform metrics come only from publication_metrics,
 * filled from the official APIs; nothing here estimates or invents numbers.
 */

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function slug(len = 10) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const publicSlugFor = (p: Pick<PropertyRow, "title" | "id">) =>
  `${utmValue(p.title).replace(/[_.]+/g, "-").slice(0, 60)}-${p.id.slice(0, 6)}`.replace(/-+/g, "-").replace(/^-/, "");

/** Enables or disables the public offer page (needed for lead forms and offer-page links). */
export async function setPublicPage(ctx: WorkspaceContext, propertyId: string, enabled: boolean): Promise<string | null> {
  const { data: p } = await ctx.supabase.from("properties").select("id, title, agent_id, created_by, public_slug").eq("id", propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!p) throw new AppError("Nie znaleziono oferty.", "not_found", 404);
  if (!canEditProperty(ctx.role, ctx.userId, p)) throw new AppError("Stronę oferty włącza agent prowadzący, właściciel lub administrator.", "forbidden", 403);
  const public_slug = p.public_slug ?? publicSlugFor(p);
  const { error } = await ctx.supabase.from("properties").update({ public_enabled: enabled, public_slug }).eq("id", p.id).eq("workspace_id", ctx.workspace.id);
  if (error) throw dbError(error);
  return enabled ? public_slug : null;
}

export const linkSchema = z.object({
  label: z.string().trim().min(1, "Podaj nazwę linku").max(160),
  target: z.enum(["offer_page", "external"]),
  propertyId: z.uuid().optional().nullable(),
  url: z.string().trim().max(2000).optional().nullable(),
  campaignId: z.uuid().optional().nullable(),
  publicationId: z.uuid().optional().nullable(),
  channel: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().min(1, "Podaj źródło (utm_source)").max(80),
  medium: z.string().trim().min(1, "Podaj medium (utm_medium)").max(80),
  campaign: z.string().trim().min(1, "Podaj kampanię (utm_campaign)").max(120),
  content: z.string().trim().max(120).optional().nullable(),
});

export async function createTrackedLink(ctx: WorkspaceContext, input: z.input<typeof linkSchema>) {
  if (!can(ctx.role, "content.edit")) throw new AppError("Twoja rola nie pozwala tworzyć linków.", "forbidden", 403);
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane linku.", "validation", 422);
  const d = parsed.data;
  let target_url: string | null = null;
  if (d.target === "external") {
    try {
      const u = new URL(d.url ?? "");
      if (u.protocol !== "https:") throw new Error();
      target_url = u.toString();
    } catch {
      throw new AppError("Adres docelowy musi zaczynać się od https://.", "validation", 422);
    }
  } else {
    if (!d.propertyId) throw new AppError("Wybierz ofertę.", "validation", 422);
    const { data: p } = await ctx.supabase.from("properties").select("public_enabled").eq("id", d.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!p) throw new AppError("Nie znaleziono oferty.", "not_found", 404);
    if (!p.public_enabled) throw new AppError("Najpierw włącz publiczną stronę tej oferty.", "page_disabled", 409);
  }
  const row = {
    workspace_id: ctx.workspace.id, slug: slug(), label: d.label, target: d.target, target_url, property_id: d.propertyId ?? null, campaign_id: d.campaignId ?? null, publication_id: d.publicationId ?? null,
    channel: d.channel || null, utm_source: utmValue(d.source), utm_medium: utmValue(d.medium), utm_campaign: utmValue(d.campaign), utm_content: d.content ? utmValue(d.content) : null, created_by: ctx.userId,
  };
  const { data, error } = await createAdminClient().from("tracked_links").insert(row).select("*").single();
  if (error || !data) throw dbError(error);
  return { ...data, shortUrl: `${appUrl()}/l/${data.slug}` };
}

/** Resolves a short link, records the click (bots flagged) and returns the redirect target. */
export async function resolveClick(linkSlug: string, req: Request): Promise<string | null> {
  if (!/^[A-Za-z0-9]{8,16}$/.test(linkSlug)) return null;
  const admin = createAdminClient();
  const { data: link } = await admin.from("tracked_links").select("*").eq("slug", linkSlug).eq("archived", false).maybeSingle();
  if (!link) return null;
  let base: string | null = link.target_url;
  if (link.target === "offer_page") {
    const { data: p } = link.property_id ? await admin.from("properties").select("public_slug, public_enabled").eq("id", link.property_id).maybeSingle() : { data: null };
    if (!p?.public_enabled || !p.public_slug) return `${appUrl()}/o/niedostepna`;
    base = `${appUrl()}/o/${p.public_slug}`;
  }
  if (!base) return null;
  const ua = req.headers.get("user-agent");
  const ref = (() => { try { return new URL(req.headers.get("referer") ?? "").hostname.slice(0, 200) || null; } catch { return null; } })();
  await admin.from("web_events").insert({ workspace_id: link.workspace_id, kind: "click", link_id: link.id, property_id: link.property_id, visitor_hash: visitorHash(clientIp(req), ua ?? ""), is_bot: isBot(ua), referrer_host: ref });
  const u = new URL(base);
  u.searchParams.set("utm_source", link.utm_source);
  u.searchParams.set("utm_medium", link.utm_medium);
  u.searchParams.set("utm_campaign", link.utm_campaign);
  if (link.utm_content) u.searchParams.set("utm_content", link.utm_content);
  if (link.target === "offer_page") u.searchParams.set("l", link.slug);
  return u.toString();
}

export async function recordPageView(property: { id: string; workspace_id: string }, linkSlug: string | null, headers: Headers) {
  const admin = createAdminClient();
  let linkId: string | null = null;
  if (linkSlug && /^[A-Za-z0-9]{8,16}$/.test(linkSlug)) {
    const { data } = await admin.from("tracked_links").select("id").eq("slug", linkSlug).eq("workspace_id", property.workspace_id).maybeSingle();
    linkId = data?.id ?? null;
  }
  const ua = headers.get("user-agent");
  const ip = (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "0.0.0.0").trim();
  await admin.from("web_events").insert({ workspace_id: property.workspace_id, kind: "page_view", link_id: linkId, property_id: property.id, visitor_hash: visitorHash(ip, ua ?? ""), is_bot: isBot(ua) });
}

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Podaj imię").max(120),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  consent: z.literal(true, { error: "Zgoda jest wymagana, abyśmy mogli odpowiedzieć." }),
  website: z.string().max(0, "spam").optional().default(""), // honeypot
  link: z.string().max(16).optional().default(""),
  utm: z.record(z.string(), z.string().max(120)).optional().default({}),
});

/** Public lead form submit. Returns false for silent spam drops (honeypot). */
export async function submitLead(publicSlug: string, input: unknown, req: Request): Promise<boolean> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("properties").select("id, title, workspace_id, agent_id, public_enabled, workspaces(name)").eq("public_slug", publicSlug).maybeSingle();
  if (!p?.public_enabled) throw new AppError("Ta oferta nie przyjmuje już zapytań.", "not_found", 404);
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.length > 0) return false;
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Sprawdź formularz.", "validation", 422);
  const d = parsed.data;
  const email = d.email || null;
  const phone = d.phone ? d.phone.replace(/\s+/g, " ") : null;
  if (!email && !phone) throw new AppError("Podaj e-mail lub telefon.", "validation", 422);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("Nieprawidłowy adres e-mail.", "validation", 422);
  if (phone && !/^[0-9 +()-]{6,30}$/.test(phone)) throw new AppError("Nieprawidłowy numer telefonu.", "validation", 422);
  const ua = req.headers.get("user-agent") ?? "";
  const vh = visitorHash(clientIp(req), ua);
  await rateLimit(`lead:${vh}`, 5, 3600, "Wysłano już kilka zapytań. Spróbuj ponownie później.");
  let link: { id: string; campaign_id: string | null; channel: string | null; utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string | null } | null = null;
  if (d.link && /^[A-Za-z0-9]{8,16}$/.test(d.link)) {
    const { data } = await admin.from("tracked_links").select("id, campaign_id, channel, utm_source, utm_medium, utm_campaign, utm_content").eq("slug", d.link).eq("workspace_id", p.workspace_id).maybeSingle();
    link = data;
  }
  const office = (p.workspaces as unknown as { name: string } | null)?.name ?? "biuro nieruchomości";
  const utm = link ? { utm_source: link.utm_source, utm_medium: link.utm_medium, utm_campaign: link.utm_campaign, ...(link.utm_content ? { utm_content: link.utm_content } : {}) } : Object.fromEntries(Object.entries(d.utm).filter(([k]) => /^utm_(source|medium|campaign|content)$/.test(k)).map(([k, v]) => [k, utmValue(v)]));
  const { data: lead, error } = await admin
    .from("leads")
    .insert({ workspace_id: p.workspace_id, property_id: p.id, link_id: link?.id ?? null, campaign_id: link?.campaign_id ?? null, channel: link?.channel ?? (utm.utm_source as string | undefined) ?? "strona_oferty", utm: utm as Json, name: d.name, email, phone, message: d.message || null, consent_contact: true, consent_text: consentText(office), consent_version: CONSENT_VERSION, visitor_hash: vh, assigned_to: p.agent_id })
    .select("id")
    .single();
  if (error || !lead) throw dbError(error, "Nie udało się wysłać zapytania.");
  await admin.from("lead_events").insert({ lead_id: lead.id, workspace_id: p.workspace_id, kind: "created", detail: { channel: link?.channel ?? null } });
  void notifyOffice(p.workspace_id, p.agent_id, p.title, lead.id).catch((e) => console.error("[leads] notify failed", e));
  return true;
}

async function notifyOffice(ws: string, agentId: string | null, title: string, leadId: string) {
  if (!mailConfigured()) return;
  const admin = createAdminClient();
  const { data: members } = await admin.from("workspace_members").select("user_id, role").eq("workspace_id", ws).eq("status", "active").in("role", ["owner", "admin", "agent"]);
  const ids = (members ?? []).filter((m) => m.role !== "agent" || m.user_id === agentId).map((m) => m.user_id);
  for (const id of ids.slice(0, 10)) {
    const { data } = await admin.auth.admin.getUserById(id);
    const to = data.user?.email;
    // The e-mail carries no personal data of the lead: details stay behind login.
    if (to) await sendMail({ to, subject: `Nowe zapytanie: ${title}`.slice(0, 150), paragraphs: [`Ktoś wysłał zapytanie o ofertę „${title}”. Szczegóły zobaczysz po zalogowaniu.`], action: { label: "Otwórz zapytanie", url: `${appUrl()}/leads/${leadId}` } });
  }
}

export async function updateLead(ctx: WorkspaceContext, id: string, patch: { status?: LeadStatus; assignedTo?: string | null; note?: string }) {
  if (!can(ctx.role, "leads.manage")) throw new AppError("Twoja rola nie pozwala zmieniać zapytań.", "forbidden", 403);
  // Visibility through RLS: an agent only reaches leads assigned to them or to their offers.
  const { data: lead } = await ctx.supabase.from("leads").select("id, workspace_id, status, assigned_to, notes").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!lead) throw new AppError("Nie znaleziono zapytania.", "not_found", 404);
  const admin = createAdminClient();
  const update: Partial<LeadRow> = {};
  const events: { kind: "status" | "assigned" | "note"; detail: Json }[] = [];
  if (patch.status && patch.status !== lead.status) {
    update.status = patch.status;
    events.push({ kind: "status", detail: { from: lead.status, to: patch.status } });
  }
  if (patch.assignedTo !== undefined && patch.assignedTo !== lead.assigned_to) {
    if (!can(ctx.role, "leads.view_all")) throw new AppError("Przypisanie zmienia właściciel, administrator lub marketing.", "forbidden", 403);
    if (patch.assignedTo) {
      const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ctx.workspace.id).eq("user_id", patch.assignedTo).eq("status", "active").maybeSingle();
      if (!m || !["owner", "admin", "agent"].includes(m.role)) throw new AppError("Wybrana osoba nie może prowadzić zapytań.", "validation", 422);
    }
    update.assigned_to = patch.assignedTo;
    events.push({ kind: "assigned", detail: { to: patch.assignedTo } });
  }
  if (patch.note?.trim()) {
    const stamp = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
    update.notes = `${lead.notes ? `${lead.notes}\n` : ""}[${stamp}, ${ctx.userName}] ${patch.note.trim()}`.slice(-4000);
    events.push({ kind: "note", detail: {} });
  }
  if (!events.length) return;
  const { error } = await admin.from("leads").update(update).eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) throw dbError(error);
  await admin.from("lead_events").insert(events.map((e) => ({ lead_id: id, workspace_id: ctx.workspace.id, kind: e.kind, detail: e.detail, actor: ctx.userId })));
}

// ── Report ──────────────────────────────────────────────────────────────────

export interface PublicationReportRow {
  id: string;
  platform: string;
  account: string;
  caption: string;
  publishedAt: string;
  campaignId: string | null;
  externalUrl: string | null;
  metrics: Metrics | null;
  fetchedAt: string | null;
  source: string | null;
}

export interface AnalyticsReport {
  from: string;
  to: string;
  mock: boolean;
  publications: PublicationReportRow[];
  totals: Record<MetricKey, Aggregate>;
  clicks: number;
  pageViews: number;
  leads: number;
  leadsByStatus: Record<string, number>;
  clickToLead: number | null;
  byChannel: { channel: string; publications: number; views: Aggregate; clicks: number; leads: number }[];
  byCampaign: { id: string; name: string; publications: number; views: Aggregate; clicks: number; leads: number }[];
  weeks: { week: string; clicks: number; leads: number; publications: number }[];
}

const CHANNEL_OF: Record<string, string> = { facebook_page: "Facebook", instagram: "Instagram", linkedin_org: "LinkedIn", linkedin_member: "LinkedIn", tiktok: "TikTok" };

export async function buildReport(ctx: WorkspaceContext, from: Date, to: Date): Promise<AnalyticsReport> {
  if (!can(ctx.role, "analytics.view")) throw new AppError("Twoja rola nie ma dostępu do analityki.", "forbidden", 403);
  const ws = ctx.workspace.id;
  const sb = ctx.supabase;
  const [fromIso, toIso] = [from.toISOString(), to.toISOString()];
  const [{ data: pubs }, { data: conns }, { data: events }, { data: leads }, { data: campaigns }, { data: links }] = await Promise.all([
    fetchAll((lo, hi) => sb.from("publications").select("id, connection_id, caption, published_at, campaign_id, external_url").eq("workspace_id", ws).eq("state", "published").gte("published_at", fromIso).lt("published_at", toIso).order("published_at").order("id").range(lo, hi), 2000),
    sb.from("social_connections").select("id, platform, name").eq("workspace_id", ws),
    fetchAll((lo, hi) => sb.from("web_events").select("kind, link_id, created_at").eq("workspace_id", ws).eq("is_bot", false).gte("created_at", fromIso).lt("created_at", toIso).order("id").range(lo, hi), 50000),
    fetchAll((lo, hi) => sb.from("leads").select("id, status, channel, campaign_id, link_id, created_at").eq("workspace_id", ws).neq("status", "spam").gte("created_at", fromIso).lt("created_at", toIso).order("id").range(lo, hi), 20000),
    sb.from("campaigns").select("id, name").eq("workspace_id", ws),
    sb.from("tracked_links").select("id, channel, campaign_id, publication_id").eq("workspace_id", ws),
  ]);
  const pubIds = (pubs ?? []).map((p) => p.id);
  const latest = new Map<string, { metrics: Metrics; fetched_at: string; source: string }>();
  for (let i = 0; i < pubIds.length; i += 200) {
    const { data: m } = await sb.from("publication_metrics").select("publication_id, metrics, fetched_at, source").in("publication_id", pubIds.slice(i, i + 200)).order("fetched_at", { ascending: false });
    for (const r of m ?? []) if (!latest.has(r.publication_id)) latest.set(r.publication_id, { metrics: r.metrics as Metrics, fetched_at: r.fetched_at, source: r.source });
  }
  const connById = new Map((conns ?? []).map((c) => [c.id, c]));
  const rows: PublicationReportRow[] = (pubs ?? []).map((p) => {
    const c = connById.get(p.connection_id);
    const m = latest.get(p.id);
    return { id: p.id, platform: c?.platform ?? "facebook_page", account: c?.name ?? "Konto", caption: p.caption.slice(0, 140), publishedAt: p.published_at!, campaignId: p.campaign_id, externalUrl: p.external_url, metrics: m?.metrics ?? null, fetchedAt: m?.fetched_at ?? null, source: m?.source ?? null };
  });
  const metricRows = rows.map((r) => r.metrics ?? {});
  const totals = Object.fromEntries(METRIC_KEYS.map((k) => [k, aggregate(metricRows, k)])) as Record<MetricKey, Aggregate>;
  const clicks = (events ?? []).filter((e) => e.kind === "click");
  const linkById = new Map((links ?? []).map((l) => [l.id, l]));
  const leadsByStatus: Record<string, number> = {};
  for (const l of leads ?? []) leadsByStatus[l.status] = (leadsByStatus[l.status] ?? 0) + 1;

  const channels = new Map<string, { publications: PublicationReportRow[]; clicks: number; leads: number }>();
  const ch = (name: string) => channels.get(name) ?? channels.set(name, { publications: [], clicks: 0, leads: 0 }).get(name)!;
  for (const r of rows) ch(CHANNEL_OF[r.platform] ?? r.platform).publications.push(r);
  const channelName = (raw: string | null | undefined) => {
    const v = (raw ?? "").toLowerCase();
    return v.includes("facebook") || v === "fb" ? "Facebook" : v.includes("instagram") || v === "ig" ? "Instagram" : v.includes("linkedin") ? "LinkedIn" : raw ? raw : "Inne / bezpośrednio";
  };
  for (const e of clicks) ch(channelName(e.link_id ? linkById.get(e.link_id)?.channel : null)).clicks++;
  for (const l of leads ?? []) ch(channelName(l.channel)).leads++;

  const camp = new Map<string, { publications: PublicationReportRow[]; clicks: number; leads: number }>();
  const cp = (id: string) => camp.get(id) ?? camp.set(id, { publications: [], clicks: 0, leads: 0 }).get(id)!;
  for (const r of rows) if (r.campaignId) cp(r.campaignId).publications.push(r);
  for (const e of clicks) { const c = e.link_id ? linkById.get(e.link_id)?.campaign_id : null; if (c) cp(c).clicks++; }
  for (const l of leads ?? []) if (l.campaign_id) cp(l.campaign_id).leads++;
  const campName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  const weeks = new Map<string, { clicks: number; leads: number; publications: number }>();
  const wk = (iso: string) => weeks.get(weekKey(iso)) ?? weeks.set(weekKey(iso), { clicks: 0, leads: 0, publications: 0 }).get(weekKey(iso))!;
  for (let d = new Date(from); d < to; d = new Date(d.getTime() + 7 * 86400_000)) wk(d.toISOString());
  for (const e of clicks) wk(e.created_at).clicks++;
  for (const l of leads ?? []) wk(l.created_at).leads++;
  for (const r of rows) wk(r.publishedAt).publications++;

  return {
    from: fromIso,
    to: toIso,
    mock: rows.some((r) => r.source === "mock"),
    publications: rows,
    totals,
    clicks: clicks.length,
    pageViews: (events ?? []).filter((e) => e.kind === "page_view").length,
    leads: leads?.length ?? 0,
    leadsByStatus,
    clickToLead: rate(leads?.length ?? 0, clicks.length || null),
    byChannel: [...channels].map(([channel, v]) => ({ channel, publications: v.publications.length, views: aggregate(v.publications.map((p) => p.metrics ?? {}), "views"), clicks: v.clicks, leads: v.leads })).sort((a, b) => b.leads - a.leads || b.clicks - a.clicks),
    byCampaign: [...camp].map(([id, v]) => ({ id, name: campName.get(id) ?? "Kampania", publications: v.publications.length, views: aggregate(v.publications.map((p) => p.metrics ?? {}), "views"), clicks: v.clicks, leads: v.leads })).sort((a, b) => b.leads - a.leads),
    weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v })),
  };
}

