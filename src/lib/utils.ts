import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nbsp = " ";

export function formatNumber(value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: maxFractionDigits }).format(value).replace(/ /g, nbsp);
}

export function formatPrice(value: number | null | undefined, currency = "PLN"): string | null {
  if (value == null) return null;
  const symbol = currency === "PLN" ? "zł" : currency === "EUR" ? "€" : "$";
  return `${formatNumber(Math.round(value), 0)}${nbsp}${symbol}`;
}

export function formatArea(value: number | null | undefined): string | null {
  if (value == null) return null;
  return `${formatNumber(value, 2)}${nbsp}m²`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pl-PL", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

/** Polish plural: plural(5, ["pokój", "pokoje", "pokoi"]) -> "pokoi". */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms[0];
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
