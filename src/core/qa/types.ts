/**
 * Quality assurance report shared by texts, graphics and videos. Every check
 * is deterministic (rules, measurements of the rendered pixels or the file);
 * "estimate" marks heuristics (readability, contrast over a photo) that point
 * at a likely problem but are not an objective judgement.
 */
export const QA_VERSION = "qa-1.0.0";

export type QaSeverity = "ok" | "info" | "warning" | "problem";
export type QaKind = "text" | "graphic" | "video";

export interface QaCheck {
  /** Area shown as a group heading (e.g. "Kontrast", "Fakty"). */
  area: string;
  code: string;
  severity: QaSeverity;
  message: string;
  /** Proposed fix, in plain words. The user decides. */
  fix?: string;
  /** Measured value (e.g. "3,1:1", "18 px"). */
  measured?: string;
  /** Where (slide, scene, section). */
  where?: string;
  method: "rule" | "measurement" | "estimate";
}

export interface QaReport {
  version: string;
  kind: QaKind;
  checks: QaCheck[];
  summary: { problems: number; warnings: number; infos: number; passed: number };
  checkedAt: string;
}

export const QA_NOTE = "Kontrola automatyczna: reguły i pomiary. Wskazuje prawdopodobne problemy i proponuje poprawki, nie jest obiektywną oceną materiału.";

const ORDER: Record<QaSeverity, number> = { problem: 0, warning: 1, info: 2, ok: 3 };

export function buildReport(kind: QaKind, checks: QaCheck[], now = new Date()): QaReport {
  const sorted = [...checks].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return {
    version: QA_VERSION,
    kind,
    checks: sorted,
    summary: {
      problems: checks.filter((c) => c.severity === "problem").length,
      warnings: checks.filter((c) => c.severity === "warning").length,
      infos: checks.filter((c) => c.severity === "info").length,
      passed: checks.filter((c) => c.severity === "ok").length,
    },
    checkedAt: now.toISOString(),
  };
}

const pl = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
export const fmt = (n: number) => pl.format(n);
