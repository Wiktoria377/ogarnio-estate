"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function post(url: string, body?: unknown): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) return { error: data.error ?? "Nie udało się połączyć z operatorem płatności." };
  return data;
}

export function ChoosePlanButton({ planId, label, disabled, variant = "primary" }: { planId: string; label: string; disabled?: boolean; variant?: "primary" | "secondary" }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant={variant}
      className="w-full"
      disabled={disabled}
      loading={loading}
      data-testid={`choose-plan-${planId}`}
      onClick={async () => {
        setLoading(true);
        const r = await post("/api/billing/checkout", { planId });
        if (r.url) window.location.assign(r.url);
        else {
          toast.error(r.error);
          setLoading(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function PortalButton({ flow, children, variant = "secondary" }: { flow: "manage" | "update" | "cancel" | "payment_method"; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant={variant}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        const r = await post("/api/billing/portal", { flow });
        if (r.url) window.location.assign(r.url);
        else {
          toast.error(r.error);
          setLoading(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

export function ReactivateButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button
      loading={loading}
      onClick={async () => {
        setLoading(true);
        const r = await post("/api/billing/reactivate");
        setLoading(false);
        if (r.error) toast.error(r.error);
        else {
          toast.success("Wysłano do Stripe. Status odświeży się po potwierdzeniu.");
          router.refresh();
        }
      }}
    >
      Wycofaj rezygnację
    </Button>
  );
}

/** After returning from Checkout: refreshes until the webhook has updated the plan (max ~90 s). */
export function AwaitConfirmation({ confirmed }: { confirmed: boolean }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (confirmed || tries >= 30) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, 3000);
    return () => clearTimeout(t);
  }, [confirmed, tries, router]);
  if (confirmed) return <div role="status" className="rounded-md border border-success/20 bg-success-soft px-3 py-2.5 text-[13px] text-success">Płatność potwierdzona przez Stripe. Plan jest aktywny.</div>;
  return (
    <div role="status" className="rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
      {tries >= 30 ? "Nie otrzymaliśmy jeszcze potwierdzenia płatności od Stripe. Odśwież stronę za kilka minut. Jeśli płatność została pobrana, plan zmieni się automatycznie." : "Czekamy na potwierdzenie płatności od Stripe. Plan zmieni się dopiero po potwierdzeniu (zwykle kilka sekund)."}
    </div>
  );
}
