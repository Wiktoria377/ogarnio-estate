import { NextResponse } from "next/server";
import { authorizePerm } from "@/lib/session";
import { apiError } from "@/lib/api";

/** Brand profile export (JSON): binding profile, version history, references and Brand Memory. Members with brand rights only. */
export async function GET() {
  try {
    const ctx = await authorizePerm("brand.edit");
    const ws = ctx.workspace.id;
    const [profile, versions, refs, assets, memory, decisions] = await Promise.all([
      ctx.supabase.from("brand_profiles").select("*").eq("workspace_id", ws).single(),
      ctx.supabase.from("brand_profile_versions").select("version, status, source, note, snapshot, confidence, created_at, decided_at").eq("workspace_id", ws).order("version"),
      ctx.supabase.from("brand_references").select("kind, title, pages, size_bytes, created_at, text_content").eq("workspace_id", ws).order("created_at"),
      ctx.supabase.from("brand_assets").select("id, kind, label, width, height, created_at").eq("workspace_id", ws).order("created_at"),
      ctx.supabase.from("brand_memory").select("level, status, kind, content, detail, source, evidence_count, evidence, created_at, decided_at").eq("workspace_id", ws).order("created_at"),
      ctx.supabase.from("brand_feedback_events").select("kind, subject_type, subject_id, data, created_at").eq("workspace_id", ws).order("created_at"),
    ]);
    const body = {
      exported_at: new Date().toISOString(),
      workspace: { id: ws, name: ctx.workspace.name },
      profile: profile.data,
      versions: versions.data ?? [],
      references: refs.data ?? [],
      assets: assets.data ?? [],
      memory: { enabled: profile.data?.memory_enabled ?? null, entries: memory.data ?? [], decisions: decisions.data ?? [] },
      note: "Pliki (logo, grafiki, PDF) nie są dołączone; identyfikatory pozwalają je odnaleźć w eksporcie danych konta.",
    };
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="profil-marki-${date}.json"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
