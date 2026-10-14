import type { PlanRow } from "@/lib/supabase/database.types";

/** Price label that never guesses net/gross: the operator sets price_tax_mode. */
export function priceLabel(plan: Pick<PlanRow, "price_minor" | "currency" | "price_tax_mode" | "billing_interval">) {
  const amount = new Intl.NumberFormat("pl-PL", { style: "currency", currency: plan.currency, maximumFractionDigits: plan.price_minor % 100 ? 2 : 0 }).format(plan.price_minor / 100);
  const per = plan.billing_interval === "year" ? "rok" : "mies.";
  const tax = plan.price_tax_mode === "net" ? " netto + VAT" : plan.price_tax_mode === "gross" ? " brutto" : "";
  return { amount, per, tax, note: plan.price_tax_mode === "unspecified" ? "Sposób naliczenia VAT ustala operator przed sprzedażą." : null };
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  trialing: "Okres próbny",
  active: "Aktywna",
  past_due: "Zaległa płatność",
  canceled: "Anulowana",
  unpaid: "Nieopłacona",
  incomplete: "Płatność w toku",
  incomplete_expired: "Płatność niedokończona",
  paused: "Wstrzymana",
};

export function planLimitLines(p: Pick<PlanRow, "max_users" | "max_properties" | "monthly_text_generations" | "monthly_graphic_exports" | "monthly_video_renders" | "storage_mb" | "max_social_accounts">): string[] {
  const gb = p.storage_mb >= 1024 ? `${Math.round(p.storage_mb / 1024)} GB` : `${p.storage_mb} MB`;
  return [
    `${p.max_users} ${p.max_users === 1 ? "użytkownik" : p.max_users < 5 ? "użytkowników" : "użytkowników"}`,
    `${p.max_properties} aktywnych ofert`,
    `${p.monthly_text_generations} generowań AI / mies.`,
    `${p.monthly_graphic_exports} eksportów grafik i PDF / mies.`,
    `${p.monthly_video_renders} renderów wideo MP4 / mies.`,
    `${gb} na zdjęcia i pliki`,
    `${p.max_social_accounts} połączonych kont społecznościowych`,
  ];
}
