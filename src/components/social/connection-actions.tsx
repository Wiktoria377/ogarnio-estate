"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowsClockwise, PlugsConnected } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { disconnectAccount, recheckAccount, startConnect } from "@/app/(app)/connections/actions";

export function ConnectionActions({ id, name, reconnect }: { id: string; name: string; reconnect: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Gotowe");
      else toast.error(r.error ?? "Błąd");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      {reconnect && (
        <form action={startConnect}>
          <input type="hidden" name="provider" value={reconnect} />
          <Button size="sm" type="submit">Autoryzuj ponownie</Button>
        </form>
      )}
      <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => recheckAccount(id))} aria-label={`Sprawdź połączenie: ${name}`}><ArrowsClockwise /> Sprawdź</Button>
      <Button size="sm" variant="ghost" className="text-danger" loading={pending} onClick={() => { if (confirm(`Odłączyć „${name}”? Zapisane tokeny zostaną usunięte, a zaplanowane publikacje na to konto zatrzymane.`)) run(() => disconnectAccount(id)); }}><PlugsConnected /> Odłącz</Button>
    </div>
  );
}
