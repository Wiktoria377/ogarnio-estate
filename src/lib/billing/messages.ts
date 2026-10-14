/** User-facing messages for plan limits (client-safe; used by dbError too). */
import { AppError } from "@/lib/errors";

type UsageMetric = "text_generation" | "graphic_export" | "video_render" | "publication" | "ai_insight";

const METRIC_LABEL: Record<UsageMetric, string> = {
  text_generation: "generowań AI",
  ai_insight: "generowań AI",
  graphic_export: "eksportów grafik i PDF",
  video_render: "renderów wideo",
  publication: "publikacji",
};

const ACCESS_REASON: Record<string, string> = {
  trial_expired: "Okres próbny się zakończył. Wybierz plan w Ustawienia → Plan i płatności, aby dalej generować materiały.",
  payment_failed: "Płatność za subskrypcję nie powiodła się. Zaktualizuj metodę płatności w Ustawienia → Plan i płatności.",
  canceled: "Subskrypcja została anulowana. Wznów ją w Ustawienia → Plan i płatności.",
  unpaid: "Subskrypcja jest nieopłacona. Ureguluj płatność w Ustawienia → Plan i płatności.",
  paused: "Subskrypcja jest wstrzymana.",
  incomplete_expired: "Płatność nie została dokończona. Wybierz plan ponownie.",
  payment_pending: "Czekamy na potwierdzenie płatności od operatora płatności.",
};

export function accessMessage(reason: string | null | undefined): string {
  return ACCESS_REASON[reason ?? ""] ?? "Twoje biuro ma dostęp tylko do odczytu. Sprawdź plan w ustawieniach.";
}

/** Maps ledger/limit errors raised by the database into user-facing Polish errors. */
export function usageError(message: string | undefined, reason?: string | null): AppError | null {
  if (!message) return null;
  if (message.includes("subscription_inactive")) return new AppError(accessMessage(reason), "subscription_inactive", 402);
  const m = message.match(/usage_limit_reached:([a-z_]+):(\d+):(\d+)/);
  if (m) {
    const metric = m[1] as UsageMetric;
    return new AppError(`Wykorzystano miesięczny limit ${METRIC_LABEL[metric] ?? "operacji"} w planie (${m[2]}/${m[3]}). Limit odnowi się 1. dnia miesiąca lub po zmianie planu.`, "usage_limit", 402);
  }
  const p = message.match(/plan_limit:([a-z_]+):(\d+)/);
  if (p) {
    const label: Record<string, string> = {
      max_properties: `Plan pozwala na ${p[2]} aktywnych ofert. Zarchiwizuj nieaktualne oferty albo zmień plan.`,
      storage_mb: `Wykorzystano miejsce na pliki w planie (${Math.round(Number(p[2]) / 1024)} GB). Usuń niepotrzebne pliki albo zmień plan.`,
      max_users: `Plan pozwala na ${p[2]} użytkowników (z zaproszeniami w toku). Zmień plan, aby dodać kolejne osoby.`,
      max_social_accounts: `Plan pozwala na ${p[2]} połączonych kont społecznościowych.`,
    };
    return new AppError(label[p[1]!] ?? "Osiągnięto limit planu.", "plan_limit", 402);
  }
  return null;
}

