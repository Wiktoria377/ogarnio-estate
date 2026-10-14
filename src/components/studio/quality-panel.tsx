import { CheckCircle, Warning, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { QualityReport } from "@/core/marketing-engine/schemas";
import { cn } from "@/lib/utils";

export function QualityPanel({ report }: { report: QualityReport | null | undefined }) {
  if (!report?.checks) return <p className="text-[13px] text-ink-3">Brak raportu jakości dla tego wariantu.</p>;
  const tone = report.score >= 85 ? "text-success" : report.score >= 65 ? "text-warning" : "text-danger";
  const blocking = report.checks.some((c) => c.status === "fail");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className={cn("font-display text-[44px] leading-none", tone)}>{report.score}</div>
        <div className="text-[12.5px] leading-snug text-ink-3">
          <div className="font-medium text-ink-2">{blocking ? "Wymaga poprawek przed publikacją" : report.score >= 85 ? "Gotowe do publikacji" : "Do przejrzenia"}</div>
          {report.reviewedByAi ? "Reguły + recenzja drugiego modelu" : "Sprawdzone regułami"}
          {report.repaired && " · automatycznie poprawione"}
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {report.checks.map((c) => (
          <li key={c.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2 text-[13px]">
              {c.status === "pass" ? <CheckCircle size={16} weight="fill" className="text-success" /> : c.status === "warn" ? <Warning size={16} weight="fill" className="text-warning" /> : <XCircle size={16} weight="fill" className="text-danger" />}
              <span className={cn("font-medium", c.status === "pass" ? "text-ink-2" : "text-ink")}>{c.label}</span>
            </div>
            {c.findings.filter((f) => f.severity !== "info" || c.status !== "pass").length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1 pl-6">
                {c.findings.map((f, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-ink-3">
                    {f.message}
                    {f.excerpt && <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">„{f.excerpt}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {report.suggestions.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-3">Sugestie redaktora</div>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-ink-2">
            {report.suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
