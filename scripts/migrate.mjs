#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in name order, each once, in its own
 * transaction. Applied versions are recorded in
 * supabase_migrations.schema_migrations (the table the Supabase CLI uses), so
 * `supabase db push` and this script agree on what is already applied.
 *
 *   DATABASE_URL=postgresql://... node scripts/migrate.mjs [--dry-run]
 *
 * Run at container start (Dockerfile) before the server; a failing migration
 * stops the deploy instead of starting the app on a half-migrated database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");
const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set. Skipping is not allowed: set it to the Supabase session pooler connection string.");
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const client = new pg.Client({ connectionString: url, ssl: /sslmode=disable|@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : { rejectUnauthorized: false }, application_name: "ogarnio-migrate" });
await client.connect();
try {
  // One deploy at a time: concurrent starts wait here instead of racing.
  await client.query("select pg_advisory_lock(727274001)");
  await client.query("create schema if not exists supabase_migrations");
  await client.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f.split("_")[0]));
  console.info(`[migrate] ${files.length} files, ${applied.size} applied, ${pending.length} pending`);
  for (const f of pending) {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    if (dryRun) {
      console.info(`[migrate] would apply ${f}`);
      continue;
    }
    const sql = readFileSync(path.join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [version, rest.join("_"), [sql]]);
      await client.query("commit");
      console.info(`[migrate] applied ${f}`);
    } catch (e) {
      await client.query("rollback");
      console.error(`[migrate] FAILED ${f}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!dryRun && pending.length && !process.exitCode) await client.query("notify pgrst, 'reload schema'");
} finally {
  await client.end();
}
