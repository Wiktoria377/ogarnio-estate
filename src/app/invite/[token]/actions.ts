"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/session";
import type { ActionResult } from "@/lib/errors";

const MESSAGES: Record<string, string> = {
  invitation_invalid: "To zaproszenie nie istnieje albo zostało anulowane.",
  invitation_used: "To zaproszenie zostało już wykorzystane.",
  invitation_expired: "Zaproszenie wygasło. Poproś właściciela biura o nowe.",
  invitation_email_mismatch: "Zaproszenie zostało wysłane na inny adres e-mail. Zaloguj się na konto z tym adresem.",
  max_users: "Biuro wykorzystało limit użytkowników w planie. Poproś właściciela o zmianę planu.",
};

export async function acceptInvitation(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !data) {
    const key = Object.keys(MESSAGES).find((k) => error?.message?.includes(k));
    return { ok: false, error: key ? MESSAGES[key]! : "Nie udało się przyjąć zaproszenia. Spróbuj ponownie." };
  }
  (await cookies()).set(WORKSPACE_COOKIE, data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard?joined=1");
}
