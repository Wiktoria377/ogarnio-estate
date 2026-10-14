import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/admin/stat";
import { adminPage } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
const TOPIC: Record<string, string> = { demo: "Prezentacja", pricing: "Cennik", integration: "Integracja", other: "Inne" };

export default async function AdminContact() {
  await adminPage();
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: messages }, { data: events }] = await Promise.all([
    db.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(100),
    fetchAll((lo, hi) => db.from("site_events").select("path, referrer_host, utm_source, visitor_hash").gte("created_at", since).order("id").range(lo, hi), 50000),
  ]);
  const ev = events ?? [];
  const sources = new Map<string, number>();
  for (const e of ev) { const k = e.utm_source ?? e.referrer_host ?? "bezpośrednio"; sources.set(k, (sources.get(k) ?? 0) + 1); }
  return (
    <div>
      <PageHeader title="Strona sprzedażowa" description="Wiadomości z formularza kontaktowego i odwiedziny strony, liczone wyłącznie u osób, które zgodziły się na statystyki (bez IP, skrót zmieniany codziennie)." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Odsłony za zgodą (30 dni)" value={ev.length} testId="site-views" />
        <Stat label="Odwiedzający za zgodą (30 dni, dzienne skróty)" value={new Set(ev.map((e) => e.visitor_hash)).size} />
        <Stat label="Wiadomości (30 dni)" value={(messages ?? []).filter((m) => m.created_at >= since).length} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Źródła odwiedzin (30 dni)" />
        <ul className="divide-y divide-line text-[13px]">{[...sources].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => <li key={k} className="flex justify-between px-5 py-2"><span>{k}</span><span className="tabular-nums">{n}</span></li>)}{!sources.size && <li className="px-5 py-3 text-ink-3">Brak danych.</li>}</ul>
      </Card>
      <Card className="mt-5">
        <CardHeader title="Wiadomości" description="Przechowywane 12 miesięcy, potem usuwane automatycznie." />
        <ul className="divide-y divide-line text-[13px]" data-testid="contact-messages">
          {(messages ?? []).map((m) => (
            <li key={m.id} className="px-5 py-3" data-testid="contact-message">
              <p><span className="font-medium">{m.name}</span> · <a className="underline" href={`mailto:${m.email}`}>{m.email}</a>{m.company ? ` · ${m.company}` : ""} · {TOPIC[m.topic]} · {dt(m.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-2">{m.message}</p>
              <p className="mt-1 text-[11.5px] text-ink-4">Zgoda {m.consent_version}</p>
            </li>
          ))}
          {!messages?.length && <li className="px-5 py-3 text-ink-3">Brak wiadomości.</li>}
        </ul>
      </Card>
    </div>
  );
}
