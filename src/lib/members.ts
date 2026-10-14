import "server-only";
import type { WorkspaceContext } from "@/lib/session";

export async function loadMembers(ctx: WorkspaceContext): Promise<{ id: string; name: string; role: string }[]> {
  const { data: members } = await ctx.supabase.from("workspace_members").select("user_id, role").eq("workspace_id", ctx.workspace.id).eq("status", "active");
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await ctx.supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  return (members ?? []).map((m) => ({ id: m.user_id, role: m.role, name: names.get(m.user_id) || (m.user_id === ctx.userId ? ctx.userName : "Członek zespołu") }));
}

/** Properties for pickers (wizards): title, short subtitle, cover photo. */
export async function loadPropertyOptions(ctx: WorkspaceContext) {
  const { data: props } = await ctx.supabase.from("properties").select("id, title, city, district, area_m2, rooms, status").eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(200);
  const ids = (props ?? []).map((p) => p.id);
  const { data: photos } = ids.length ? await ctx.supabase.from("property_photos").select("id, property_id, storage_path, position, is_visualization").in("property_id", ids).order("position") : { data: [] };
  return (props ?? []).map((p) => {
    const ph = (photos ?? []).filter((x) => x.property_id === p.id);
    return {
      id: p.id,
      title: p.title,
      subtitle: [[p.district, p.city].filter(Boolean).join(", "), p.area_m2 ? `${String(p.area_m2).replace(".", ",")} m²` : null, p.rooms != null ? `${p.rooms} pok.` : null].filter(Boolean).join(" · "),
      cover: ph[0] ? `/api/files/${ph[0].storage_path}` : null,
      photos: ph.map((x) => ({ id: x.id, url: `/api/files/${x.storage_path}`, isVisualization: x.is_visualization })),
    };
  });
}

/** Active members who can lead an offer (owner, admin, agent). */
export async function loadAgents(ctx: WorkspaceContext) {
  return (await loadMembers(ctx)).filter((m) => ["owner", "admin", "agent"].includes(m.role));
}
