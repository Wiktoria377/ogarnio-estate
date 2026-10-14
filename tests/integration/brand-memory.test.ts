/**
 * Brand Memory against the local stack: decisions → suggestions (only after
 * repetition), explicit memory, accept/dismiss, disable, delete, export data,
 * office isolation and roles (RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearMemory, decideSuggestion, deleteEntry, loadMemoryContext, recordFeedback, saveExplicit, setMemoryEnabled } from "@/lib/brand-memory/service";
import { loadBrandKit } from "@/lib/ai";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { BrandMemoryRow, WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `mem-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Memory-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Memory-Test-2026" });
  return { id: data.user.id, email, sb };
}

async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}

const memory = async (ws: string) => ((await admin.from("brand_memory").select("*").eq("workspace_id", ws).order("created_at")).data ?? []) as BrandMemoryRow[];
const edit = (ctx: WorkspaceContext, cta: string, removed: string[] = []) =>
  recordFeedback(ctx, { kind: "content_edited", subjectType: "content_item", subjectId: null, data: { contentType: "property_sales_post", platform: "instagram", cta: { before: "Napisz wiadomość", after: cta }, headline: null, removed } });

let owner: Awaited<ReturnType<typeof user>>;
let agent: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let agentCtx: WorkspaceContext;

beforeAll(async () => {
  owner = await user("owner");
  agent = await user("agent");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Pamięci" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro pamięci" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: agent.id, role: "agent", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  agentCtx = await ctxFor(agent, ws, "agent");
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("learning from decisions", () => {
  it("one edit is recorded but creates no suggestion", async () => {
    await edit(agentCtx, "Zadzwoń do biura", ["okazja"]);
    const { count } = await admin.from("brand_feedback_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    expect(count).toBe(1);
    expect(await memory(ws)).toHaveLength(0);
  });

  it("a repeated decision becomes a suggestion with its evidence, not used until accepted", async () => {
    await edit(ctx, "Zadzwoń do biura!", ["okazja"]);
    const m = await memory(ws);
    expect(m.map((x) => [x.kind, x.level, x.content])).toEqual(expect.arrayContaining([["cta", "suggested", "Zadzwoń do biura"], ["avoid", "suggested", "okazja"]]));
    expect(m.find((x) => x.kind === "cta")!.evidence_count).toBe(2);
    expect(await loadMemoryContext(ctx, true)).toBeNull();
  });

  it("accepting makes it explicit and part of the brand context; dismissing keeps it out for good", async () => {
    const m = await memory(ws);
    await decideSuggestion(agentCtx, m.find((x) => x.kind === "cta")!.id, "accept");
    await decideSuggestion(ctx, m.find((x) => x.kind === "avoid")!.id, "dismiss");
    await edit(ctx, "Zadzwoń do biura", ["okazja"]); // a third time: still not proposed again
    const after = await memory(ws);
    expect(after.filter((x) => x.kind === "avoid")).toHaveLength(1);
    expect(after.find((x) => x.kind === "avoid")!.status).toBe("dismissed");
    const kit = await loadBrandKit(ctx);
    expect(kit.memory?.ctas).toEqual(["Zadzwoń do biura"]);
    expect(kit.memory?.avoid).toEqual([]);
  });

  it("explicit preferences can be saved directly and duplicates merge", async () => {
    await saveExplicit(agentCtx, { kind: "headline_style", content: "Krótkie nagłówki, bez wykrzykników", source: "manual" });
    await saveExplicit(ctx, { kind: "headline_style", content: "krótkie nagłówki bez wykrzykników", source: "manual" });
    const hs = (await memory(ws)).filter((x) => x.kind === "headline_style");
    expect(hs).toHaveLength(1);
    expect((await loadBrandKit(ctx)).memory?.headlineStyle).toEqual(["Krótkie nagłówki, bez wykrzykników"]);
  });

  it("accepted texts are offered as style examples", async () => {
    await recordFeedback(ctx, { kind: "content_accepted", subjectType: "content_item", subjectId: null, data: { contentType: "property_sales_post", platform: "instagram", headline: "Dom z ogrodem", hook: "Hook", cta: "Zadzwoń", excerpt: "Fragment tekstu" } });
    const kit = await loadBrandKit(ctx);
    expect(kit.memory?.examples.map((e) => e.headline)).toContain("Dom z ogrodem");
  });
});

describe("privacy controls", () => {
  it("with memory disabled nothing is recorded and nothing reaches generation", async () => {
    await setMemoryEnabled(ctx, false);
    const before = (await admin.from("brand_feedback_events").select("id").eq("workspace_id", ws)).data!.length;
    await edit(ctx, "Inne CTA");
    expect((await admin.from("brand_feedback_events").select("id").eq("workspace_id", ws)).data!.length).toBe(before);
    expect((await loadBrandKit(ctx)).memory).toBeNull();
    await expect(saveExplicit(ctx, { kind: "cta", content: "Coś", source: "manual" })).rejects.toThrow(/wyłączona/);
    await setMemoryEnabled(ctx, true);
    expect((await loadBrandKit(ctx)).memory?.ctas).toEqual(["Zadzwoń do biura"]);
  });

  it("an agent cannot switch memory off or clear it", async () => {
    await expect(setMemoryEnabled(agentCtx, false)).rejects.toThrow(/uprawnień/);
    await expect(clearMemory(agentCtx)).rejects.toThrow();
  });

  it("an agent deletes only own explicit entries; the owner deletes any", async () => {
    const cta = (await memory(ws)).find((x) => x.kind === "cta")!; // created by the server (suggestion)
    await expect(deleteEntry(agentCtx, cta.id)).rejects.toThrow(/Nie możesz/);
    const own = (await memory(ws)).find((x) => x.kind === "headline_style")!;
    expect(own.created_by).toBe(agent.id);
    await deleteEntry(agentCtx, own.id);
    expect((await memory(ws)).some((x) => x.id === own.id)).toBe(false);
    await deleteEntry(ctx, cta.id);
    expect((await loadBrandKit(ctx)).memory?.ctas ?? []).toEqual([]);
  });

  it("clients cannot create suggestions or tamper with protected columns", async () => {
    const ins = await agent.sb.from("brand_memory").insert({ workspace_id: ws, level: "suggested", kind: "cta", content: "x", dedupe_key: "cta:x", source: "suggestion" });
    expect(ins.error).not.toBeNull();
    const id = await saveExplicit(agentCtx, { kind: "note", content: "Notatka agenta", source: "manual" });
    const moved = await agent.sb.from("brand_memory").update({ workspace_id: otherWs }).eq("id", id);
    expect(moved.error).not.toBeNull();
    const down = await agent.sb.from("brand_memory").update({ level: "suggested" }).eq("id", id);
    expect(down.error).not.toBeNull();
    const fake = await agent.sb.from("brand_feedback_events").insert({ workspace_id: ws, kind: "content_edited", subject_type: "content_item", created_by: owner.id });
    expect(fake.error).not.toBeNull();
  });

  it("another office sees nothing and cannot write into this office's memory", async () => {
    for (const t of ["brand_memory", "brand_feedback_events"] as const) {
      const { data } = await outsider.sb.from(t).select("id").eq("workspace_id", ws);
      expect(data ?? []).toHaveLength(0);
    }
    const ins = await outsider.sb.from("brand_memory").insert({ workspace_id: ws, level: "explicit", kind: "cta", content: "x", dedupe_key: "cta:x2", source: "manual", created_by: outsider.id });
    expect(ins.error).not.toBeNull();
    const outCtx = await ctxFor(outsider, otherWs, "owner");
    expect(await loadMemoryContext(outCtx, true)).toBeNull();
    const { error } = await outsider.sb.rpc("clear_brand_memory", { p_ws: ws });
    expect(error).not.toBeNull();
  });

  it("the owner clears all memory and decisions", async () => {
    const r = await clearMemory(ctx);
    expect(r.memory).toBeGreaterThan(0);
    expect(r.events).toBeGreaterThan(0);
    expect(await memory(ws)).toHaveLength(0);
    expect((await admin.from("brand_feedback_events").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
  });

  it("retention removes old decisions and old dismissed suggestions", async () => {
    // (insert sets updated_at directly; the guard trigger only runs on update)
    await admin.from("brand_feedback_events").insert({ workspace_id: ws, kind: "content_edited", subject_type: "content_item", created_by: owner.id, created_at: new Date(Date.now() - 400 * 864e5).toISOString() });
    await admin.from("brand_memory").insert({ workspace_id: ws, level: "suggested", status: "dismissed", kind: "cta", content: "stare", dedupe_key: "cta:stare", source: "suggestion", updated_at: new Date(Date.now() - 200 * 864e5).toISOString() });
    const { data, error } = await admin.rpc("run_retention");
    expect(error).toBeNull();
    expect((data as Record<string, number>).brand_memory_dismissed).toBeGreaterThanOrEqual(1);
    expect((data as Record<string, number>).brand_feedback_events).toBeGreaterThanOrEqual(1);
  });
});
