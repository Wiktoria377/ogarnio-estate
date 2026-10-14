import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotForm } from "@/components/auth/forms";

export const metadata = { title: "Reset hasła" };

export default function ForgotPage() {
  return (
    <>
      <AuthHeading title="Reset hasła" description="Podaj adres e-mail konta. Wyślemy link do ustawienia nowego hasła." />
      <ForgotForm />
      <p className="mt-6 text-center text-[13.5px] text-ink-3">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Wróć do logowania
        </Link>
      </p>
    </>
  );
}
