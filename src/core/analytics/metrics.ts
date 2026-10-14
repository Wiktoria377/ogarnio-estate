/**
 * Common metric model for publications (client-safe). Values come only from the
 * platforms' official APIs; a metric the platform did not return is null and is
 * shown as "Brak danych", never as 0. Sums report how many publications actually
 * had the value (coverage), so a partial total is never presented as complete.
 */
export const METRIC_KEYS = ["views", "reach", "interactions", "likes", "comments", "shares", "saves", "clicks"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type Metrics = Partial<Record<MetricKey, number | null>>;

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Wyświetlenia",
  reach: "Zasięg (unikalni odbiorcy)",
  interactions: "Interakcje",
  likes: "Reakcje",
  comments: "Komentarze",
  shares: "Udostępnienia",
  saves: "Zapisania",
  clicks: "Kliknięcia (platforma)",
};

/** What each platform's API can provide (documented availability, ETAP 3 research). */
export const PLATFORM_METRICS: Record<string, { keys: MetricKey[]; note: string }> = {
  facebook_page: { keys: ["views", "reach", "likes", "comments", "shares", "interactions"], note: "Graph API: post_media_view, post_total_media_view_unique, reakcje, komentarze, udostępnienia (uprawnienie read_insights)." },
  instagram: { keys: ["views", "reach", "likes", "comments", "shares", "saves", "interactions"], note: "Instagram Graph API: views, reach, likes, comments, shares, saved, total_interactions (instagram_manage_insights)." },
  linkedin_org: { keys: ["views", "reach", "clicks", "likes", "comments", "shares", "interactions"], note: "organizationalEntityShareStatistics (rola ADMINISTRATOR strony, rw_organization_admin)." },
  linkedin_member: { keys: [], note: "LinkedIn nie udostępnia statystyk postów z profilu prywatnego w tym API (wymaga dostępu partnerskiego)." },
  tiktok: { keys: [], note: "Integracja niedostępna." },
};

export const NO_DATA = "Brak danych";

export function formatMetric(v: number | null | undefined): string {
  return v == null ? NO_DATA : new Intl.NumberFormat("pl-PL").format(v);
}

export interface Aggregate {
  value: number | null;
  /** Publications that reported this metric / publications considered. */
  covered: number;
  total: number;
}

export function aggregate(rows: Metrics[], key: MetricKey): Aggregate {
  let sum = 0;
  let covered = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      covered++;
    }
  }
  return { value: covered ? sum : null, covered, total: rows.length };
}

/** Ratio as a percentage, or null when the denominator is missing/zero. */
export function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function sanitizeMetrics(raw: Record<string, unknown>): Metrics {
  const out: Metrics = {};
  for (const k of METRIC_KEYS) {
    const v = raw[k];
    out[k] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  }
  return out;
}

/** ISO week buckets (Mon–Sun, Europe/Warsaw approximated by UTC date) for simple trend charts. */
export function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export const LEAD_STATUSES = {
  new: { label: "Nowy", tone: "accent" },
  contacted: { label: "Kontakt nawiązany", tone: "warning" },
  qualified: { label: "Zakwalifikowany", tone: "success" },
  won: { label: "Sukces (transakcja)", tone: "success" },
  lost: { label: "Utracony", tone: "muted" },
  spam: { label: "Spam", tone: "danger" },
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;

export const CONSENT_VERSION = "2026-10-v1";
export function consentText(office: string): string {
  return `Wyrażam zgodę na przetwarzanie moich danych osobowych przez ${office} w celu odpowiedzi na zapytanie dotyczące tej oferty. Administratorem danych jest ${office}. Zgodę mogę wycofać w każdej chwili.`;
}

/** UTM parameters: lowercase, safe characters only. */
export function utmValue(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "brak";
}

export function withUtm(url: string, utm: { source: string; medium: string; campaign: string; content?: string | null }): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", utm.source);
  u.searchParams.set("utm_medium", utm.medium);
  u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  return u.toString();
}

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|linkedinbot|embedly|preview|headless|python-requests|curl|wget|httpclient|monitor/i;
export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}
