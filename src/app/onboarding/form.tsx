"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createWorkspace } from "@/app/workspace-actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createWorkspace, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      {state && !state.ok && !fe && (
        <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {state.error}
        </div>
      )}
      <Field label="Nazwa biura" htmlFor="name" error={fe?.name} hint="Np. „Nowak Nieruchomości”. Możesz ją później zmienić.">
        <Input id="name" name="name" required autoFocus maxLength={120} className="h-11 text-[15px]" aria-invalid={!!fe?.name} />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="self-start">
        Utwórz biuro
      </Button>
    </form>
  );
}
