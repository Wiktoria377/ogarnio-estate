#!/usr/bin/env node
/**
 * Grants or revokes access to the platform admin panel (/admin).
 * Run on a trusted machine with the service-role key; there is no UI for this
 * on purpose, so a compromised admin session cannot create more admins.
 *
 *   node --env-file=.env.local scripts/platform-admin.mjs grant  someone@firma.pl [admin|viewer] "powód"
 *   node --env-file=.env.local scripts/platform-admin.mjs revoke someone@firma.pl "powód"
 *   node --env-file=.env.local scripts/platform-admin.mjs list
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Brak NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const [cmd, email, a3, a4] = process.argv.slice(2);

async function findUser(mail) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === mail.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function audit(action, user, detail, reason) {
  const { error } = await db.from("admin_audit_log").insert({ actor: null, actor_email: `cli:${process.env.USER ?? "?"}`.slice(0, 200), action, target_type: "platform_admin", target_id: user.id, reason: reason ?? null, detail });
  if (error) throw error;
}

if (cmd === "list") {
  const { data } = await db.from("platform_admins").select("user_id, role, created_at, note");
  for (const r of data ?? []) {
    const { data: u } = await db.auth.admin.getUserById(r.user_id);
    console.log(`${u.user?.email ?? r.user_id}\t${r.role}\t${r.created_at}\t${r.note ?? ""}`);
  }
} else if ((cmd === "grant" || cmd === "revoke") && email) {
  const user = await findUser(email);
  if (!user) {
    console.error("Nie znaleziono konta o tym adresie (użytkownik musi najpierw założyć konto).");
    process.exit(1);
  }
  if (cmd === "grant") {
    const role = a3 === "viewer" ? "viewer" : "admin";
    const reason = (role === a3 ? a4 : a3) ?? null;
    await audit("cli_grant_admin", user, { email, role }, reason);
    const { error } = await db.from("platform_admins").upsert({ user_id: user.id, role, note: reason?.slice(0, 200) ?? null });
    if (error) throw error;
    console.log(`Nadano rolę ${role} dla ${email}.`);
  } else {
    await audit("cli_revoke_admin", user, { email }, a3 ?? null);
    await db.from("platform_admins").delete().eq("user_id", user.id);
    console.log(`Odebrano dostęp ${email}.`);
  }
} else {
  console.log("Użycie: platform-admin.mjs grant <email> [admin|viewer] [powód] | revoke <email> [powód] | list");
  process.exit(1);
}
