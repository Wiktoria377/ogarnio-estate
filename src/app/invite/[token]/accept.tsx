"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      {error && <div role="alert" className="mb-3 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>}
      <Button size="lg" loading={pending} onClick={() => start(async () => { const r = await acceptInvitation(token); if (r && !r.ok) setError(r.error); })}>Dołącz do biura</Button>
    </div>
  );
}
