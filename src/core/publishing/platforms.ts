/**
 * Platform capabilities and content rules (client-safe). Every platform has its
 * own formats and limits: nothing here assumes that one format behaves the same
 * everywhere. Sources: official docs, see docs/INTEGRATIONS_RESEARCH.md.
 */
import type { PublicationFormat, PublicationState, SocialPlatform, SocialStatus } from "@/lib/supabase/database.types";

export type Provider = "meta" | "linkedin" | "tiktok";

export interface FormatRule {
  format: PublicationFormat;
  label: string;
  /** Media count range. */
  min: number;
  max: number;
  kinds: ("image" | "video")[];
  /** Allowed aspect ratios (width / height). */
  aspect?: { min: number; max: number; label: string };
  videoSeconds?: { min: number; max: number };
  note?: string;
}

export interface PlatformInfo {
  id: SocialPlatform;
  provider: Provider;
  label: string;
  short: string;
  captionMax: number;
  hashtagMax?: number;
  formats: FormatRule[];
  /** Plain-language requirement shown in the Connections hub. */
  review: string;
  available: boolean;
  unavailableReason?: string;
}

export const PLATFORMS: Record<SocialPlatform, PlatformInfo> = {
  facebook_page: {
    id: "facebook_page",
    provider: "meta",
    label: "Strona na Facebooku",
    short: "Facebook",
    captionMax: 5000,
    formats: [
      { format: "text", label: "Post tekstowy", min: 0, max: 0, kinds: [] },
      { format: "photo", label: "Zdjęcie", min: 1, max: 1, kinds: ["image"] },
      { format: "photo_set", label: "Kilka zdjęć", min: 2, max: 10, kinds: ["image"], note: "Facebook pokazuje zestaw jako post z galerią (nie karuzelę reklamową)." },
      { format: "video", label: "Film", min: 1, max: 1, kinds: ["video"], videoSeconds: { min: 1, max: 1200 }, note: "Po wysłaniu Facebook przetwarza film; status sprawdzamy w API." },
    ],
    review: "Publikacja dla stron innych niż testowe wymaga zatwierdzenia aplikacji przez Meta (App Review: pages_manage_posts, pages_read_engagement) i weryfikacji firmy.",
    available: true,
  },
  instagram: {
    id: "instagram",
    provider: "meta",
    label: "Instagram (konto profesjonalne)",
    short: "Instagram",
    captionMax: 2200,
    hashtagMax: 30,
    formats: [
      { format: "photo", label: "Zdjęcie", min: 1, max: 1, kinds: ["image"], aspect: { min: 0.8, max: 1.91, label: "od 4:5 do 1,91:1" }, note: "Tylko JPEG; konwertujemy automatycznie." },
      { format: "carousel", label: "Karuzela", min: 2, max: 10, kinds: ["image", "video"], aspect: { min: 0.8, max: 1.91, label: "od 4:5 do 1,91:1" } },
      { format: "reel", label: "Rolka (Reels)", min: 1, max: 1, kinds: ["video"], videoSeconds: { min: 3, max: 900 }, aspect: { min: 0.01, max: 10, label: "zalecane 9:16" } },
    ],
    review: "Wymaga konta firmowego lub twórcy połączonego ze stroną na Facebooku oraz zatwierdzenia aplikacji przez Meta (instagram_content_publish). Limit: 100 publikacji przez API na 24 godziny. Posty tekstowe nie są możliwe.",
    available: true,
  },
  linkedin_org: {
    id: "linkedin_org",
    provider: "linkedin",
    label: "Strona firmowa LinkedIn",
    short: "LinkedIn",
    captionMax: 3000,
    formats: [
      { format: "text", label: "Post tekstowy", min: 0, max: 0, kinds: [] },
      { format: "photo", label: "Zdjęcie", min: 1, max: 1, kinds: ["image"] },
      { format: "photo_set", label: "Kilka zdjęć", min: 2, max: 20, kinds: ["image"] },
    ],
    review: "Publikacja na stronach firmowych wymaga dostępu do Community Management API (wniosek i zatwierdzenie przez LinkedIn). Wideo na LinkedIn nie jest jeszcze obsługiwane w tej wersji.",
    available: true,
  },
  linkedin_member: {
    id: "linkedin_member",
    provider: "linkedin",
    label: "Profil osobisty LinkedIn",
    short: "LinkedIn",
    captionMax: 3000,
    formats: [
      { format: "text", label: "Post tekstowy", min: 0, max: 0, kinds: [] },
      { format: "photo", label: "Zdjęcie", min: 1, max: 1, kinds: ["image"] },
      { format: "photo_set", label: "Kilka zdjęć", min: 2, max: 20, kinds: ["image"] },
    ],
    review: "Produkt „Share on LinkedIn” (w_member_social) jest dostępny bez dodatkowego wniosku. Token ważny 60 dni; potem trzeba połączyć konto ponownie.",
    available: true,
  },
  tiktok: {
    id: "tiktok",
    provider: "tiktok",
    label: "TikTok",
    short: "TikTok",
    captionMax: 2200,
    formats: [{ format: "video", label: "Film", min: 1, max: 1, kinds: ["video"], videoSeconds: { min: 3, max: 600 } }],
    review: "Content Posting API wymaga audytu aplikacji przez TikTok; przed audytem posty są widoczne tylko prywatnie.",
    available: false,
    unavailableReason: "Niedostępne w tej wersji: architektura jest gotowa, ale publikacja wymaga audytu aplikacji przez TikTok.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as SocialPlatform[];

export const SOCIAL_STATUS: Record<SocialStatus | "not_connected", { label: string; tone: "success" | "warning" | "danger" | "neutral" | "outline" }> = {
  not_connected: { label: "Niepołączone", tone: "outline" },
  connected: { label: "Połączone", tone: "success" },
  reauth_required: { label: "Wymaga ponownej autoryzacji", tone: "warning" },
  limited: { label: "Ograniczone uprawnienia", tone: "warning" },
  unavailable: { label: "Niedostępne", tone: "neutral" },
  error: { label: "Błąd integracji", tone: "danger" },
  disconnected: { label: "Niepołączone", tone: "outline" },
};

export const PUBLICATION_STATE: Record<PublicationState, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "outline" | "accent" }> = {
  draft: { label: "Szkic", tone: "outline" },
  pending_approval: { label: "Czeka na akceptację", tone: "warning" },
  scheduled: { label: "Zaplanowane", tone: "accent" },
  queued: { label: "W kolejce", tone: "accent" },
  publishing: { label: "W trakcie publikacji", tone: "accent" },
  processing: { label: "W trakcie przetwarzania przez platformę", tone: "accent" },
  published: { label: "Opublikowane", tone: "success" },
  failed: { label: "Niepowodzenie", tone: "danger" },
  action_required: { label: "Wymaga działania użytkownika", tone: "warning" },
  canceled: { label: "Anulowane", tone: "neutral" },
};

export const EDITABLE_STATES: PublicationState[] = ["draft", "pending_approval", "scheduled", "failed", "action_required"];
export const CANCELABLE_STATES: PublicationState[] = ["draft", "pending_approval", "scheduled", "failed", "action_required"];

export function formatRule(platform: SocialPlatform, format: PublicationFormat): FormatRule | undefined {
  return PLATFORMS[platform].formats.find((f) => f.format === format);
}

export interface MediaFacts {
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  durationMs?: number | null;
}

/** Content rules for one platform; returns readable problems (empty = OK). */
export function validatePublication(platform: SocialPlatform, format: PublicationFormat, caption: string, media: MediaFacts[]): string[] {
  const p = PLATFORMS[platform];
  const issues: string[] = [];
  if (!p.available) return [p.unavailableReason ?? "Platforma niedostępna."];
  const rule = formatRule(platform, format);
  if (!rule) return [`${p.label}: format „${format}” nie jest obsługiwany. Dostępne: ${p.formats.map((f) => f.label).join(", ")}.`];
  if (caption.length > p.captionMax) issues.push(`${p.short}: opis ma ${caption.length} znaków, limit to ${p.captionMax}.`);
  if (p.hashtagMax && (caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0) > p.hashtagMax) issues.push(`${p.short}: maksymalnie ${p.hashtagMax} hashtagów.`);
  if (format === "text" && !caption.trim()) issues.push(`${p.short}: post tekstowy wymaga treści.`);
  if (media.length < rule.min || media.length > rule.max) issues.push(rule.min === rule.max ? `${p.short}: ${rule.label} wymaga ${rule.min} ${rule.min === 1 ? "pliku" : "plików"}.` : `${p.short}: ${rule.label} wymaga od ${rule.min} do ${rule.max} plików (wybrano ${media.length}).`);
  media.forEach((m, i) => {
    const n = media.length > 1 ? ` (plik ${i + 1})` : "";
    if (!rule.kinds.includes(m.kind)) issues.push(`${p.short}${n}: ${rule.label} nie przyjmuje ${m.kind === "video" ? "filmów" : "zdjęć"}.`);
    if (rule.aspect && m.width && m.height) {
      const r = m.width / m.height;
      if (r < rule.aspect.min - 0.005 || r > rule.aspect.max + 0.005) issues.push(`${p.short}${n}: proporcje ${m.width}×${m.height} są poza zakresem ${rule.aspect.label}. Wybierz format 4:5 lub kwadrat.`);
    }
    if (m.kind === "video" && rule.videoSeconds && m.durationMs) {
      const s = m.durationMs / 1000;
      if (s < rule.videoSeconds.min || s > rule.videoSeconds.max) issues.push(`${p.short}${n}: film musi trwać od ${rule.videoSeconds.min} s do ${Math.round(rule.videoSeconds.max / 60)} min.`);
    }
  });
  return issues;
}

/** Picks the natural format for the selected media on a platform. */
export function defaultFormat(platform: SocialPlatform, media: MediaFacts[]): PublicationFormat | null {
  const formats = PLATFORMS[platform].formats.map((f) => f.format);
  const pick = (...c: PublicationFormat[]) => c.find((f) => formats.includes(f)) ?? null;
  if (!media.length) return pick("text");
  if (media.length === 1) return media[0]!.kind === "video" ? pick("reel", "video") : pick("photo");
  return pick("carousel", "photo_set");
}
