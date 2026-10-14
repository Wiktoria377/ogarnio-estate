"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/errors";

export function ConfirmDelete({ title, description, action, label = "Usuń", onDone, trigger }: { title: string; description: string; action: () => Promise<ActionResult | void>; label?: string; onDone?: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button variant="danger-ghost" size="sm"><Trash /> {label}</Button>}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="secondary">Anuluj</Button></DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await action();
                if (res && !res.ok) toast.error(res.error);
                else {
                  setOpen(false);
                  onDone?.();
                }
              })
            }
          >
            {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
