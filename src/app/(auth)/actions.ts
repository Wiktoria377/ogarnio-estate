"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { fieldErrors } from "@/lib/zod-form";
import type { ActionResult } from "@/lib/errors";

const email = z.email("Podaj poprawny adres e-mail").max(254).transform((v) => v.trim().toLowerCase());
const password = z.string().min(10, "Hasło musi mieć co najmniej 10 znaków").max(72, "Hasło może mieć maks. 72 znaki");

/** Only same-site relative paths are allowed as post-login destinations. */
function safeNext(value: FormDataEntryValue | null, fallback = "/dashboard"): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}

function authMessage(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login")) return "Nieprawidłowy e-mail lub hasło.";
  if (m.includes("not confirmed")) return "Najpierw potwierdź adres e-mail: link wysłaliśmy w wiadomości powitalnej.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Konto z tym adresem już istnieje. Zaloguj się lub zresetuj hasło.";
  if (m.includes("rate limit") || m.includes("too many")) return "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.";
  if (m.includes("weak") || m.includes("pwned")) return "To hasło jest zbyt słabe lub znalazło się w wycieku danych. Wybierz inne.";
  if (m.includes("same") && m.includes("password")) return "Nowe hasło musi różnić się od poprzedniego.";
  return "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

export async function signIn(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Podaj hasło") }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authMessage(error.message) };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Podaj imię i nazwisko").max(120),
      email,
      password,
      terms: z.literal("on", { error: "Zaakceptuj regulamin i politykę prywatności" }),
    })
    .safeParse({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password"), terms: form.get("terms") });
  if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next"), "/onboarding"))}`,
    },
  });
  if (error) return { ok: false, error: authMessage(error.message) };
  if (data.session) redirect(safeNext(form.get("next"), "/onboarding"));
  return { ok: true, data: undefined, message: "Wysłaliśmy link aktywacyjny. Kliknij go, aby potwierdzić adres e-mail i przejść dalej." };
}

export async function requestPasswordReset(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { ok: false, error: "Podaj poprawny adres e-mail.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit|too many/i.test(error.message)) return { ok: false, error: authMessage(error.message) };
  // Same answer whether or not the account exists (no account enumeration).
  return { ok: true, data: undefined, message: "Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła." };
}

export async function updatePassword(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Hasła nie są identyczne" })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Link wygasł. Poproś o nowy link do resetu hasła." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authMessage(error.message) };
  redirect("/dashboard?password=updated");
}
