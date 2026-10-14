"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Przegląd" },
  { href: "/admin/offices", label: "Biura" },
  { href: "/admin/costs", label: "Koszty i budżety" },
  { href: "/admin/plans", label: "Plany" },
  { href: "/admin/health", label: "Błędy i zadania" },
  { href: "/admin/contact", label: "Strona i kontakt" },
  { href: "/admin/audit", label: "Dziennik działań" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Panel administratora">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} className={cn("rounded-md px-3 py-1.5 text-[13px]", active ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken")}>{i.label}</Link>;
      })}
    </nav>
  );
}
