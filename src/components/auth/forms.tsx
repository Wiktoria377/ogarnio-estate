"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle, Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/(auth)/actions";
import type { ActionResult } from "@/lib/errors";

function FormError({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
      {state.error}
    </div>
  );
}

function Success({ message }: { message: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-lg border border-success/20 bg-success-soft p-4 text-[13.5px] leading-relaxed text-success">
      <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function PasswordInput({ id, name, autoComplete, error }: { id: string; name: string; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required className="pr-10" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label={show ? "Ukryj hasło" : "Pokaż hasło"}>
        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      {notice && <Success message={notice} />}
      <FormError state={state} />
      <Field label="E-mail" htmlFor="email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus aria-invalid={!!fe?.email} />
      </Field>
      <Field label="Hasło" htmlFor="password" error={fe?.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" error={fe?.password} />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-ink-3 hover:text-ink">
          Nie pamiętasz hasła?
        </Link>
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Zaloguj się
      </Button>
    </form>
  );
}

export function SignupForm({ next, email }: { next?: string; email?: string } = {}) {
  const [state, action, pending] = useActionState(signUp, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok && state.message) return <Success message={state.message} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Imię i nazwisko" htmlFor="fullName" error={fe?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required autoFocus aria-invalid={!!fe?.fullName} />
      </Field>
      <Field label="E-mail służbowy" htmlFor="email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} aria-invalid={!!fe?.email} />
      </Field>
      <Field label="Hasło" htmlFor="password" error={fe?.password} hint="Co najmniej 10 znaków.">
        <PasswordInput id="password" name="password" autoComplete="new-password" error={fe?.password} />
      </Field>
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-2">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--color-accent)]" />
        <span>
          Akceptuję <a href="/regulamin" target="_blank" className="underline">regulamin</a> i <a href="/polityka-prywatnosci" target="_blank" className="underline">politykę prywatności</a>. Dane przetwarzamy wyłącznie w celu świadczenia usługi; konto i dane możesz usunąć w ustawieniach.
        </span>
      </label>
      {fe?.terms && <p className="-mt-2 text-[12.5px] text-danger">{fe.terms}</p>}
      <Button type="submit" size="lg" loading={pending}>
        Załóż konto
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok && state.message) return <Success message={state.message} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />
      <Field label="E-mail" htmlFor="email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus aria-invalid={!!fe?.email} />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Wyślij link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />
      <Field label="Nowe hasło" htmlFor="password" error={fe?.password} hint="Co najmniej 10 znaków.">
        <PasswordInput id="password" name="password" autoComplete="new-password" error={fe?.password} />
      </Field>
      <Field label="Powtórz hasło" htmlFor="confirm" error={fe?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" error={fe?.confirm} />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Ustaw hasło
      </Button>
    </form>
  );
}
