import "server-only";
import { z } from "zod";
import { visitorHash } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export const CONTACT_CONSENT_VERSION = "2026-10-site-v1";
export const CONTACT_CONSENT = "Wyrażam zgodę na przetwarzanie podanych danych w celu odpowiedzi na wiadomość. Administratorem danych jest operator serwisu Ogarnio Estate (dane w polityce prywatności). Zgodę mogę wycofać w każdej chwili.";
export const STATS_COOKIE = "oe_stats";

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko").max(120),
  email: z.string().trim().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Podaj poprawny adres e-mail"),
  company: z.string().trim().max(160).optional().default(""),
  topic: z.enum(["demo", "pricing", "integration", "other"]).default("other"),
  message: z.string().trim().min(10, "Napisz kilka słów (min. 10 znaków)").max(4000),
  consent: z.literal(true, { error: "Zgoda jest wymagana, abyśmy mogli odpowiedzieć." }),
  website: z.string().max(0).optional().default(""), // honeypot
});

/** Sales-page contact form. Returns false for silent spam drops (honeypot). */
export async function submitContact(input: unknown, req: Request): Promise<boolean> {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.length > 0) return false;
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Sprawdź formularz.", "validation", 422);
  const d = parsed.data;
  const vh = visitorHash(clientIp(req), req.headers.get("user-agent") ?? "");
  await rateLimit(`contact:${vh}`, 3, 3600, "Wysłano już kilka wiadomości. Spróbuj ponownie później albo napisz e-mail.");
  const { data, error } = await createAdminClient().from("contact_messages").insert({ name: d.name, email: d.email, company: d.company || null, topic: d.topic, message: d.message, consent_text: CONTACT_CONSENT, consent_version: CONTACT_CONSENT_VERSION, visitor_hash: vh }).select("id").single();
  if (error || !data) throw dbError(error, "Nie udało się wysłać wiadomości.");
  const to = process.env.CONTACT_EMAIL;
  // Notification without the message body; it is read in the admin panel.
  if (to) void sendMail({ to, subject: `Nowa wiadomość ze strony (${d.topic})`, paragraphs: [`Nowa wiadomość od ${d.name}. Treść jest w panelu administratora.`], action: { label: "Otwórz panel", url: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/admin/contact` } }).catch(() => undefined);
  return true;
}

const eventSchema = z.object({
  path: z.string().max(200).regex(/^\/[A-Za-z0-9/_\-.]*$/),
  referrer: z.string().max(500).optional().default(""),
  utm_source: z.string().max(80).optional().default(""),
  utm_campaign: z.string().max(120).optional().default(""),
});

/** Sales-page visit; recorded ONLY when the visitor accepted statistics (consent cookie checked server-side). */
export async function recordSiteEvent(input: unknown, req: Request, consented: boolean): Promise<boolean> {
  if (!consented) return false;
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|headless|preview/i.test(ua) || !ua) return false;
  const d = eventSchema.safeParse(input);
  if (!d.success) throw new AppError("Nieprawidłowe zdarzenie.", "validation", 422);
  const vh = visitorHash(clientIp(req), ua);
  await rateLimit(`site_ev:${vh}`, 60, 3600, "Za dużo zdarzeń.");
  const ref = (() => { try { return new URL(d.data.referrer).hostname.slice(0, 200) || null; } catch { return null; } })();
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 80) || null;
  await createAdminClient().from("site_events").insert({ path: d.data.path, referrer_host: ref, utm_source: clean(d.data.utm_source), utm_campaign: clean(d.data.utm_campaign), visitor_hash: vh });
  return true;
}
