"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export function LeadForm({ slug, link, utm, consent, color }: { slug: string; link: string; utm: Record<string, string>; consent: string; color: string }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  if (sent) return <div className="rounded-xl border border-line bg-surface p-5" role="status" data-testid="lead-sent"><p className="text-[15px] font-semibold">Dziękujemy, zapytanie zostało wysłane.</p><p className="mt-1 text-[13px] text-ink-3">Biuro odezwie się na podany kontakt.</p></div>;
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!agree) return setError("Zaznacz zgodę, abyśmy mogli odpowiedzieć.");
        setBusy(true);
        try {
          const res = await fetch(`/api/public/leads/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, consent: true, link, utm }) });
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) throw new Error(body.error ?? "Nie udało się wysłać zapytania.");
          setSent(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Nie udało się wysłać zapytania.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-[16px] font-semibold">Zapytaj o ofertę</h2>
      <Field label="Imię" htmlFor="lead-name"><Input id="lead-name" value={f.name} onChange={set("name")} required maxLength={120} autoComplete="name" /></Field>
      <Field label="E-mail" htmlFor="lead-email"><Input id="lead-email" type="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="email" /></Field>
      <Field label="Telefon" htmlFor="lead-phone"><Input id="lead-phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={30} autoComplete="tel" /></Field>
      <Field label="Wiadomość" htmlFor="lead-message" optional><Textarea id="lead-message" value={f.message} onChange={set("message")} maxLength={2000} /></Field>
      <div className="hidden" aria-hidden><label>Strona <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} name="website" /></label></div>
      <label className="flex items-start gap-2 text-[12px] leading-snug text-ink-3">
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>{consent}</span>
      </label>
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
      <Button type="submit" loading={busy} style={{ backgroundColor: color }}>Wyślij zapytanie</Button>
      <p className="text-[11.5px] text-ink-4">Podaj e-mail lub telefon. Dane trafiają wyłącznie do biura prowadzącego ofertę.</p>
    </form>
  );
}
