"use client";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash, Warning } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { changePassword, deleteAccount, deleteWorkspace, renameWorkspace, saveProfile } from "@/app/(app)/settings/actions";
import type { ActionResult } from "@/lib/errors";

function useToastResult(state: ActionResult | null, onOk?: () => void) {
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Zapisano");
      onOk?.();
    } else if (!state.fieldErrors) toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

const fe = (s: ActionResult | null) => (s && !s.ok ? s.fieldErrors : undefined);

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  useToastResult(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Imię i nazwisko" htmlFor="fullName" error={fe(state)?.fullName}>
          <Input id="fullName" name="fullName" defaultValue={fullName} maxLength={120} required />
        </Field>
        <Field label="E-mail" htmlFor="email" hint="Adres logowania. Zmiana adresu będzie dostępna w kolejnym etapie.">
          <Input id="email" value={email} disabled readOnly />
        </Field>
      </div>
      <div><Button type="submit" loading={pending}>Zapisz profil</Button></div>
    </form>
  );
}

export function WorkspaceForm({ name, canAdmin }: { name: string; canAdmin: boolean }) {
  const [state, action, pending] = useActionState(renameWorkspace, null);
  useToastResult(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nazwa biura" htmlFor="ws-name" error={fe(state)?.name} hint={canAdmin ? undefined : "Nazwę może zmienić właściciel lub administrator."}>
        <Input id="ws-name" name="name" defaultValue={name} maxLength={120} required disabled={!canAdmin} />
      </Field>
      {canAdmin && <div><Button type="submit" loading={pending}>Zapisz nazwę</Button></div>}
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  const [key, setKey] = useState(0);
  useToastResult(state, () => setKey((k) => k + 1));
  const errors = fe(state);
  return (
    <form key={key} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Obecne hasło" htmlFor="current" error={errors?.current}>
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Nowe hasło" htmlFor="password" error={errors?.password} hint="Min. 10 znaków, litera i cyfra">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Powtórz nowe hasło" htmlFor="confirm" error={errors?.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <div><Button type="submit" variant="secondary" loading={pending}>Zmień hasło</Button></div>
    </form>
  );
}

function DangerDialog({ trigger, title, description, confirmLabel, confirmHint, action, submitLabel }: { trigger: string; title: string; description: string; confirmLabel: string; confirmHint: string; action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = fe(state);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="danger-ghost"><Trash /> {trigger}</Button></DialogTrigger>
      <DialogContent title={title} description={description}>
        <form action={formAction} className="flex flex-col gap-4">
          {state && !state.ok && <p role="alert" className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"><Warning size={15} /> {state.error}</p>}
          <Field label={confirmLabel} htmlFor={`${submitLabel}-confirm`} error={errors?.confirm} hint={confirmHint}>
            <Input id={`${submitLabel}-confirm`} name="confirm" autoComplete="off" required />
          </Field>
          <Field label="Hasło" htmlFor={`${submitLabel}-password`} error={errors?.password}>
            <Input id={`${submitLabel}-password`} name="password" type="password" autoComplete="current-password" required />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="secondary">Anuluj</Button></DialogClose>
            <Button type="submit" variant="danger" loading={pending}>{submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteWorkspace({ name }: { name: string }) {
  return (
    <DangerDialog
      trigger="Usuń biuro"
      title="Usunąć biuro i wszystkie jego dane?"
      description="Usuniemy markę, nieruchomości, zdjęcia, materiały z historią wersji i dane członków zespołu w tym biurze. Tej operacji nie można cofnąć."
      confirmLabel="Nazwa biura"
      confirmHint={`Wpisz: ${name}`}
      action={deleteWorkspace}
      submitLabel="Usuń biuro na zawsze"
    />
  );
}

export function DeleteAccount() {
  return (
    <DangerDialog
      trigger="Usuń konto"
      title="Usunąć konto?"
      description="Usuniemy Twoje konto i profil. Biura, w których jesteś jedynym właścicielem, zostaną usunięte ze wszystkimi danymi i plikami. W biurach współdzielonych materiały zostaną w biurze, bez Twojego nazwiska."
      confirmLabel="Potwierdzenie"
      confirmHint="Wpisz: USUŃ"
      action={deleteAccount}
      submitLabel="Usuń konto na zawsze"
    />
  );
}
