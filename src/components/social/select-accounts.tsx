"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectAccounts } from "@/app/(app)/connections/actions";

interface Account { key: string; name: string; platform: string; status: string; ok: boolean; note: string; parent: string | null }

export function SelectAccounts({ grantId, accounts }: { grantId: string; accounts: Account[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(accounts.filter((a) => a.ok).map((a) => a.key));
  const [pending, start] = useTransition();
  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {accounts.map((a) => (
          <li key={a.key}>
            <label className={`flex items-start gap-3 rounded-md border border-line px-3 py-2.5 text-[13.5px] ${a.ok ? "" : "opacity-60"}`}>
              <input type="checkbox" className="mt-1" checked={picked.includes(a.key)} disabled={!a.ok} onChange={() => toggle(a.key)} aria-label={`${a.platform}: ${a.name}`} />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{a.name}</span>
                <span className="block text-[12px] text-ink-3">{a.platform} · {a.status}</span>
                {a.note && <span className="block text-[12px] text-warning">{a.note}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/connections")}>Anuluj</Button>
        <Button loading={pending} disabled={!picked.length} onClick={() => start(async () => {
          const r = await connectAccounts(grantId, picked);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Połączono");
          router.push("/connections?connected=1");
          router.refresh();
        })}>Połącz zaznaczone ({picked.length})</Button>
      </div>
    </div>
  );
}
