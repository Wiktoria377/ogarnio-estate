import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { logError } from "@/lib/observability";

/**
 * Transactional e-mail (invitations, lead notifications, payment notices) over
 * SMTP. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * (e.g. a transactional provider). Without SMTP_HOST e-mails are not sent and
 * callers show a copyable link instead, so nothing silently pretends to work.
 */
let transport: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "1",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    // Local test sinks don't speak TLS.
    ignoreTLS: process.env.SMTP_IGNORE_TLS === "1",
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Mail {
  to: string;
  subject: string;
  /** Plain paragraphs; a CTA button is rendered from `action`. */
  paragraphs: string[];
  action?: { label: string; url: string };
  replyTo?: string;
}

export function renderMail(m: Mail): { text: string; html: string } {
  const text = [...m.paragraphs, m.action ? `${m.action.label}: ${m.action.url}` : "", "", "— Ogarnio Estate"].join("\n\n");
  const html = `<!doctype html><html lang="pl"><body style="font-family:Arial,sans-serif;color:#1d1c1a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
${m.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n")}
${m.action ? `<p><a href="${escape(m.action.url)}" style="display:inline-block;background:#1d1c1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escape(m.action.label)}</a></p><p style="font-size:12px;color:#77736c">Jeśli przycisk nie działa, skopiuj adres: ${escape(m.action.url)}</p>` : ""}
<p style="font-size:12px;color:#77736c">Ogarnio Estate</p></body></html>`;
  return { text, html };
}

/** Returns true when the message was accepted by the SMTP server. */
export async function sendMail(m: Mail): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const { text, html } = renderMail(m);
    await getTransport().sendMail({ from: process.env.SMTP_FROM, to: m.to, subject: m.subject, text, html, replyTo: m.replyTo });
    return true;
  } catch (error) {
    await logError("mail", error, { context: { subject: m.subject } });
    return false;
  }
}
