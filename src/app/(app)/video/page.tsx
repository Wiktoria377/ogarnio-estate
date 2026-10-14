import Link from "next/link";
import { FilmSlate, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { VIDEO_STYLES, videoDesignSchema } from "@/core/video/model";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "Video Studio" };

export default async function VideoPage() {
  const ctx = await requireWorkspace();
  const { data: items } = await ctx.supabase.from("content_items").select("id, title, status, updated_at, current_version").eq("workspace_id", ctx.workspace.id).eq("kind", "video").order("updated_at", { ascending: false }).limit(60);
  const ids = (items ?? []).map((i) => i.id);
  const [{ data: renders }, { data: versions }] = ids.length
    ? await Promise.all([
        ctx.supabase.from("rendered_files").select("content_item_id, meta, version, created_at").in("content_item_id", ids).eq("kind", "video_mp4").order("created_at", { ascending: false }),
        ctx.supabase.from("content_versions").select("item_id, version, body").in("item_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const firstPhotos = (versions ?? []).map((v) => videoDesignSchema.safeParse(v.body)).flatMap((d) => (d.success ? [d.data.scenes[0]!.photoId] : []));
  const { data: photos } = firstPhotos.length ? await ctx.supabase.from("property_photos").select("id, storage_path").in("id", [...new Set(firstPhotos)]).eq("workspace_id", ctx.workspace.id) : { data: [] };
  const photoPath = new Map((photos ?? []).map((p) => [p.id, p.storage_path]));
  const editable = canEdit(ctx.role);
  const cards = (items ?? []).map((it) => {
    const render = (renders ?? []).find((r) => r.content_item_id === it.id);
    const body = (versions ?? []).find((v) => v.item_id === it.id && v.version === it.current_version)?.body;
    const design = videoDesignSchema.safeParse(body);
    const poster = (render?.meta as { poster?: string } | null)?.poster ?? (design.success ? photoPath.get(design.data.scenes[0]!.photoId) : undefined);
    return { ...it, poster, render, design: design.success ? design.data : null };
  });
  return (
    <>
      <PageHeader
        title="Video Studio"
        description="Reels i TikTok 1080×1920 z prawdziwych zdjęć oferty: scenariusz AI do zatwierdzenia, animacje w stylu marki i plik MP4."
        actions={editable && <Button asChild><Link href="/video/new"><Plus weight="bold" /> Nowe wideo</Link></Button>}
      />
      {!cards.length ? (
        <EmptyState icon={<FilmSlate />} title="Nie masz jeszcze wideo" description="Wybierz nieruchomość, zdjęcia, styl i długość. AI przygotuje scenariusz, a po Twojej akceptacji wyrenderujemy MP4." action={editable ? <Button asChild><Link href="/video/new"><Plus weight="bold" /> Nowe wideo</Link></Button> : undefined} />
      ) : (
        <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
          {cards.map((v) => (
            <li key={v.id}>
              <Link href={`/video/${v.id}`} className="group block">
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-line bg-sunken shadow-xs transition-shadow group-hover:shadow-md">
                  {v.poster && <img src={`/api/files/${v.poster}`} alt="" loading="lazy" className="size-full object-cover" />}
                  <span className="absolute top-2 left-2">
                    {v.render ? <Badge tone="success">MP4 · v{v.render.version}</Badge> : v.design?.scriptApproved ? <Badge tone="accent">Gotowe do renderu</Badge> : <Badge tone="warning">Scenariusz do akceptacji</Badge>}
                  </span>
                </div>
                <span className="mt-2 line-clamp-2 block text-[13px] font-medium">{v.title}</span>
                <span className="text-[12px] text-ink-3" suppressHydrationWarning>{v.design ? `${VIDEO_STYLES[v.design.style].label} · ${v.design.length} s · ` : ""}{formatRelative(v.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
