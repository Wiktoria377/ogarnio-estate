import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/forms";

export const metadata = { title: "Logowanie" };

const NOTICES: Record<string, string> = {
  confirmed: "Adres e-mail potwierdzony. Zaloguj się, aby kontynuować.",
  "signed-out": "Wylogowano.",
  deleted: "Konto i wszystkie dane zostały usunięte.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <AuthHeading title="Witaj ponownie" description="Zaloguj się do panelu swojego biura." />
      {sp.error === "link" && (
        <div role="alert" className="mb-4 rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
          Link jest nieprawidłowy lub wygasł. Spróbuj ponownie.
        </div>
      )}
      <LoginForm next={sp.next} notice={sp.notice ? NOTICES[sp.notice] : undefined} />
      <p className="mt-6 text-center text-[13.5px] text-ink-3">
        Nie masz konta?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Załóż konto
        </Link>
      </p>
    </>
  );
}
