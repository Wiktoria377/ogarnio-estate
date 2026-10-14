import type { UsageSummary } from "@/lib/billing/usage";

function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const fmt = (n: number) => n.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
  return (
    <div className="rounded-md border border-line px-3 py-2.5" data-testid="usage-meter">
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-ink-3">{label}</span>
        <span className="font-medium text-ink tabular-nums">
          {fmt(used)} / {fmt(limit)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={pct >= 90 ? "h-full bg-danger" : pct >= 70 ? "h-full bg-warning" : "h-full bg-accent"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function UsageMeters({ usage }: { usage: UsageSummary }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Meter label="Generowania AI w tym miesiącu" used={usage.text.used} limit={usage.text.limit} />
      <Meter label="Eksporty grafik i PDF w tym miesiącu" used={usage.exports.used} limit={usage.exports.limit} />
      <Meter label="Rendery wideo w tym miesiącu" used={usage.renders.used} limit={usage.renders.limit} />
      <Meter label="Użytkownicy (z zaproszeniami)" used={usage.users.used} limit={usage.users.limit} />
      <Meter label="Aktywne oferty" used={usage.properties.used} limit={usage.properties.limit} />
      <Meter label="Połączone konta społecznościowe" used={usage.social.used} limit={usage.social.limit} />
      <Meter label="Miejsce na pliki" used={usage.storage.usedMb} limit={usage.storage.limitMb} unit="MB" />
    </div>
  );
}
