import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Rejestracja" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;
  return (
    <>
      <AuthHeading title="Załóż konto biura" description="Po rejestracji skonfigurujesz biuro i markę. Zajmie to kilka minut." />
      <SignupForm next={next} email={sp.email?.slice(0, 254)} />
      <p className="mt-6 text-center text-[13.5px] text-ink-3">
        Masz już konto?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-accent hover:underline">
          Zaloguj się
        </Link>
      </p>
    </>
  );
}
