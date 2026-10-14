/** Simple accessible SVG bars: clicks and leads per week (own measurements only). */
export function BarChart({ weeks }: { weeks: { week: string; clicks: number; leads: number }[] }) {
  if (!weeks.length) return <p className="mt-3 text-[13px] text-ink-3">Brak danych.</p>;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.clicks, w.leads)));
  const W = 560;
  const H = 180;
  const band = W / weeks.length;
  const bw = Math.max(2, Math.min(18, band / 3));
  const y = (v: number) => H - 20 - (v / max) * (H - 40);
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Kliknięcia i zapytania tygodniowo">
        <line x1="0" x2={W} y1={H - 20} y2={H - 20} stroke="currentColor" className="text-line" />
        {weeks.map((w, i) => {
          const x = i * band + band / 2;
          return (
            <g key={w.week}>
              <title>{`Tydzień od ${w.week}: kliknięcia ${w.clicks}, zapytania ${w.leads}`}</title>
              <rect x={x - bw - 1} y={y(w.clicks)} width={bw} height={H - 20 - y(w.clicks)} rx="2" className="fill-accent/70" />
              <rect x={x + 1} y={y(w.leads)} width={bw} height={H - 20 - y(w.leads)} rx="2" className="fill-success" />
              {(weeks.length <= 14 || i % Math.ceil(weeks.length / 12) === 0) && <text x={x} y={H - 5} textAnchor="middle" className="fill-ink-4 text-[10px]">{w.week.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[12px] text-ink-3"><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-accent/70" /> kliknięcia</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success" /> zapytania</span><span>maks. {max}</span></figcaption>
    </figure>
  );
}
