"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowsClockwise, Copy, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import type { Insights } from "@/core/analytics/insights";
import { createLink, generateReportInsights, refreshPublicationMetrics } from "@/app/(app)/analytics/actions";

export function InsightsPanel({ days, last, canGenerate }: { days: number; last: { insights: Insights; dropped: string[]; model: string; createdAt: string } | null; canGenerate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const test = last?.model === "offline-test-provider";
  return (
    <Card className="mt-5 p-5" data-testid="insights">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Sparkle className="text-accent" weight="fill" /> Wnioski AI</h2>
          <p className="text-[12.5px] text-ink-3">Model widzi tylko policzone liczby z tego raportu. Obserwacje, hipotezy i rekomendacje są rozdzielone; to nie są prognozy wyników.</p>
        </div>
        {canGenerate && <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => {
          const r = await generateReportInsights(days);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Gotowe.");
          router.refresh();
        })}>{last ? "Przygotuj ponownie" : "Przygotuj wnioski"}</Button>}
      </div>
      {last ? (
        <div className="mt-4 grid gap-4 text-[13px] md:grid-cols-3">
          {test && <p className="text-[12px] text-warning md:col-span-3">Treść testowa (dostawca offline, bez AI): złożona mechanicznie z liczb raportu.</p>}
          <section>
            <h3 className="font-semibold">Co pokazują dane</h3>
            <ul className="mt-1 list-disc pl-4 text-ink-2" data-testid="observations">{last.insights.observations.map((o, i) => <li key={i}>{o.text}</li>)}</ul>
            {last.dropped.length > 0 && <p className="mt-1 text-[11.5px] text-ink-4">Pominięto {last.dropped.length} zdań z liczbami, których nie ma w raporcie.</p>}
          </section>
          <section>
            <h3 className="font-semibold">Hipotezy do sprawdzenia</h3>
            <ul className="mt-1 list-disc pl-4 text-ink-2" data-testid="hypotheses">{last.insights.hypotheses.map((h, i) => <li key={i}>{h.text} <span className="text-ink-3">Jak sprawdzić: {h.verify}</span></li>)}</ul>
          </section>
          <section>
            <h3 className="font-semibold">Rekomendacje</h3>
            <ul className="mt-1 flex flex-col gap-2 text-ink-2" data-testid="recommendations">{last.insights.recommendations.map((r, i) => <li key={i}><b>{r.what}</b><br />Dlaczego: {r.why}<br />Dane: {r.data}<br />Działanie: {r.action}<br />Miernik: {r.metric}</li>)}</ul>
          </section>
          {last.insights.limitations.length > 0 && <p className="text-[12px] text-ink-3 md:col-span-3">Ograniczenia: {last.insights.limitations.join(" ")}</p>}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">Brak wniosków dla tego biura. Wymagają danych z co najmniej jednej publikacji, kliknięcia lub zapytania.</p>
      )}
    </Card>
  );
}

export function RefreshMetrics({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Odśwież statystyki" loading={pending} onClick={() => start(async () => {
      const r = await refreshPublicationMetrics(id);
      if (r.ok) toast.success(r.message ?? "Pobrano.");
      else toast.error(r.error);
      router.refresh();
    })}><ArrowsClockwise /></Button>
  );
}

export function LinkForm({ properties, campaigns }: { properties: { id: string; title: string; public: boolean }[]; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ label: "", target: "offer_page" as "offer_page" | "external", propertyId: properties.find((p) => p.public)?.id ?? "", url: "", campaignId: "", channel: "facebook", source: "facebook", medium: "social", campaign: "", content: "" });
  const [made, setMade] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <Field label="Nazwa linku" htmlFor="ln-label"><Input id="ln-label" value={f.label} onChange={set("label")} maxLength={160} /></Field>
      <Field label="Cel" htmlFor="ln-target">
        <NativeSelect id="ln-target" value={f.target} onChange={set("target")}><option value="offer_page">Strona oferty (z formularzem)</option><option value="external">Inny adres https</option></NativeSelect>
      </Field>
      {f.target === "offer_page" ? (
        <Field label="Oferta" htmlFor="ln-prop" hint="Lista zawiera oferty; strona musi być włączona na karcie oferty.">
          <NativeSelect id="ln-prop" value={f.propertyId} onChange={set("propertyId")}>
            <option value="">Wybierz ofertę</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}{p.public ? "" : " (strona wyłączona)"}</option>)}
          </NativeSelect>
        </Field>
      ) : (
        <Field label="Adres docelowy" htmlFor="ln-url"><Input id="ln-url" type="url" value={f.url} onChange={set("url")} placeholder="https://" /></Field>
      )}
      <Field label="Kanał" htmlFor="ln-channel">
        <NativeSelect id="ln-channel" value={f.channel} onChange={(e) => setF((s) => ({ ...s, channel: e.target.value, source: e.target.value }))}>
          {["facebook", "instagram", "linkedin", "email", "portal", "inne"].map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </Field>
      <Field label="utm_campaign" htmlFor="ln-camp"><Input id="ln-camp" value={f.campaign} onChange={set("campaign")} placeholder="np. jesien_2026" maxLength={120} /></Field>
      <Field label="Kampania w aplikacji" htmlFor="ln-cid" optional>
        <NativeSelect id="ln-cid" value={f.campaignId} onChange={set("campaignId")}><option value="">Brak</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
      </Field>
      <div className="flex flex-wrap items-center gap-2 md:col-span-3">
        <Button size="sm" loading={pending} onClick={() => start(async () => {
          const r = await createLink({ label: f.label, target: f.target, propertyId: f.target === "offer_page" ? f.propertyId || null : null, url: f.target === "external" ? f.url : null, campaignId: f.campaignId || null, channel: f.channel, source: f.source, medium: f.channel === "email" ? "email" : f.channel === "portal" ? "referral" : "social", campaign: f.campaign, content: f.content || null });
          if (!r.ok) return void toast.error(r.error);
          setMade(r.data.shortUrl);
          toast.success(r.message ?? "Utworzono.");
          router.refresh();
        })}>Utwórz link</Button>
        {made && <span className="flex items-center gap-2 text-[13px]" data-testid="new-link"><code className="rounded bg-sunken px-1.5 py-0.5">{made}</code><Button size="icon-sm" variant="ghost" aria-label="Kopiuj link" onClick={() => navigator.clipboard.writeText(made).then(() => toast.success("Skopiowano."))}><Copy /></Button></span>}
      </div>
    </div>
  );
}
