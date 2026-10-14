"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";

export function ContactForm({ consent }: { consent: string }) {
  const [f, setF] = useState({ name: "", email: "", company: "", topic: "demo", message: "", website: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  if (sent) return <div className="rounded-xl border border-line bg-surface p-6" role="status" data-testid="contact-sent"><p className="text-[16px] font-semibold">Dziękujemy, wiadomość dotarła.</p><p className="mt-1 text-[14px] text-ink-3">Odpowiemy na podany adres e-mail.</p></div>;
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!agree) return setError("Zaznacz zgodę, abyśmy mogli odpowiedzieć.");
        setBusy(true);
        try {
          const res = await fetch("/api/public/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, consent: true }) });
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) throw new Error(body.error ?? "Nie udało się wysłać wiadomości.");
          setSent(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Nie udało się wysłać wiadomości.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Imię i nazwisko" htmlFor="c-name"><Input id="c-name" value={f.name} onChange={set("name")} maxLength={120} autoComplete="name" required /></Field>
        <Field label="E-mail" htmlFor="c-email"><Input id="c-email" type="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="email" required /></Field>
        <Field label="Biuro" htmlFor="c-company" optional><Input id="c-company" value={f.company} onChange={set("company")} maxLength={160} autoComplete="organization" /></Field>
        <Field label="Temat" htmlFor="c-topic">
          <NativeSelect id="c-topic" value={f.topic} onChange={set("topic")}><option value="demo">Prezentacja aplikacji</option><option value="pricing">Cennik i plany</option><option value="integration">Integracja z CRM</option><option value="other">Inne</option></NativeSelect>
        </Field>
      </div>
      <Field label="Wiadomość" htmlFor="c-message"><Textarea id="c-message" value={f.message} onChange={set("message")} maxLength={4000} rows={4} required /></Field>
      <div className="hidden" aria-hidden><label>Strona <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={set("website")} /></label></div>
      <label className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-3"><input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>{consent}</span></label>
      {error && <p className="text-[13px] text-danger" data-testid="contact-error">{error}</p>}
      <div><Button type="submit" loading={busy}>Wyślij wiadomość</Button></div>
    </form>
  );
}
