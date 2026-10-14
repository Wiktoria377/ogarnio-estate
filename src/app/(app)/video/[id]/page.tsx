import { qaFor } from "@/lib/qa-view";
import { notFound, redirect } from "next/navigation";
import { VideoEditor } from "@/components/video/video-editor";
import { videoDesignSchema } from "@/core/video/model";
import { JOB_COLUMNS, getRenderQuota } from "@/lib/jobs/queue";
import { canEdit, requireWorkspace } from "@/lib/session";
import { loadVideoProperty, reelEnvForPlayer } from "@/lib/video";

export const metadata = { title: "Wideo" };

export default async function VideoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const { data: item } = await ctx.supabase.from("content_items").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) notFound();
  if (item.kind !== "video") redirect(`/studio/${id}`);
  const { data: versions } = await ctx.supabase.from("content_versions").select("version, source, operation, created_at, body").eq("item_id", id).order("version", { ascending: false }).limit(30);
  const current = versions?.find((v) => v.version === item.current_version);
  const parsed = videoDesignSchema.safeParse(current?.body);
  if (!current || !parsed.success) notFound();
  const [env, { photos, property }, { data: music }, { data: renders }, { data: jobs }, quota] = await Promise.all([
    reelEnvForPlayer(ctx, parsed.data.propertyId),
    loadVideoProperty(ctx, parsed.data.propertyId),
    ctx.supabase.from("media_assets").select("id, label, created_at").eq("workspace_id", ctx.workspace.id).eq("kind", "audio").order("created_at", { ascending: false }),
    ctx.supabase.from("rendered_files").select("id, version, size_bytes, meta, created_at").eq("content_item_id", id).eq("workspace_id", ctx.workspace.id).eq("kind", "video_mp4").order("created_at", { ascending: false }).limit(20),
    ctx.supabase.from("generation_jobs").select(JOB_COLUMNS).eq("content_item_id", id).eq("workspace_id", ctx.workspace.id).eq("kind", "video_render").order("created_at", { ascending: false }).limit(5),
    getRenderQuota(ctx).catch(() => ({ used: 0, limit: 0 })),
  ]);
  return (
    <VideoEditor
      key={`${item.id}:${item.current_version}`}
      item={{ id: item.id, title: item.title, status: item.status, updatedAt: item.updated_at, version: item.current_version }}
      design={parsed.data}
      env={env}
      property={{ id: property.id, title: property.title }}
      photos={photos.map((p) => ({ id: p.id, url: `/api/files/${p.storage_path}`, isVisualization: p.is_visualization }))}
      music={(music ?? []).map((m) => ({ id: m.id, label: m.label }))}
      renders={(renders ?? []).map((r) => {
        const meta = (r.meta ?? {}) as { poster?: string; durationMs?: number; style?: string; length?: number };
        return { id: r.id, version: r.version, sizeBytes: r.size_bytes, createdAt: r.created_at, poster: meta.poster ? `/api/files/${meta.poster}` : null, length: meta.length ?? null };
      })}
      jobs={jobs ?? []}
      quota={quota}
      versions={(versions ?? []).map((v) => ({ version: v.version, operation: v.operation, source: v.source, createdAt: v.created_at }))}
      qa={qaFor(item)}
      editable={canEdit(ctx.role)}
    />
  );
}
