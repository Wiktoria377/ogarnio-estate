"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const COOKIE = "oe_stats";
const read = () => document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.split("=")[1] ?? null;
const write = (v: "1" | "0") => {
  document.cookie = `${COOKIE}=${v}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
};

function beacon() {
  const u = new URL(location.href);
  void fetch("/api/public/site-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ path: u.pathname, referrer: document.referrer, utm_source: u.searchParams.get("utm_source") ?? "", utm_campaign: u.searchParams.get("utm_campaign") ?? "" }),
  }).catch(() => undefined);
}

/**
 * Consent for anonymous visit statistics on the sales page. Nothing is sent
 * before "Zgadzam się"; the choice is kept in a first-party cookie (no tracking
 * scripts, no third parties). The choice can be changed from the footer.
 */
export function StatsConsent() {
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const c = read();
    setChoice(c);
    if (c === "1") beacon();
    const open = () => setChoice(null);
    window.addEventListener("oe-stats-settings", open);
    return () => window.removeEventListener("oe-stats-settings", open);
  }, []);
  if (choice !== null) return null;
  return (
    <div role="dialog" aria-label="Statystyki odwiedzin" data-testid="stats-consent" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-[13px] shadow-lg sm:flex-row sm:items-center">
      <p className="flex-1 text-ink-2">Czy możemy liczyć anonimowe odwiedziny tej strony (bez adresu IP, bez narzędzi firm trzecich)? Pomaga nam to ocenić, które treści są przydatne.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => { write("0"); setChoice("0"); }}>Nie, dziękuję</Button>
        <Button size="sm" onClick={() => { write("1"); setChoice("1"); beacon(); }}>Zgadzam się</Button>
      </div>
    </div>
  );
}

export function StatsSettingsLink() {
  return <button type="button" className="underline-offset-2 hover:underline" onClick={() => window.dispatchEvent(new Event("oe-stats-settings"))}>Ustawienia statystyk</button>;
}
