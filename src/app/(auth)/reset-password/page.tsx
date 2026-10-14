import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ResetForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/session";

export const metadata = { title: "Nowe hasło" };

export default async function ResetPage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/login?error=link");
  return (
    <>
      <AuthHeading title="Ustaw nowe hasło" description={`Konto: ${user.email ?? ""}`} />
      <ResetForm />
    </>
  );
}
