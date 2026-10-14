import "server-only";
import type { BrandKit } from "@/core/brand/model";
import type { GraphicDesign } from "@/core/graphics/design";
import type { RenderInput, RenderPhoto } from "@/core/graphics/templates";
import { getStorage } from "@/lib/storage";
import type { WorkspaceContext } from "@/lib/session";

/** Loads only the photos a design references, and only from this workspace. */
export async function loadRenderInput(ctx: WorkspaceContext, design: GraphicDesign, brand: BrandKit): Promise<RenderInput> {
  const ids = [...new Set(design.slides.flatMap((s) => s.photoIds))];
  const storage = getStorage(ctx.supabase);
  const photos = new Map<string, RenderPhoto>();
  if (ids.length) {
    const { data } = await ctx.supabase.from("property_photos").select("id, storage_path, is_visualization").in("id", ids).eq("workspace_id", ctx.workspace.id);
    await Promise.all(
      (data ?? []).map(async (p) => {
        try {
          photos.set(p.id, { id: p.id, data: await storage.get(p.storage_path), isVisualization: p.is_visualization });
        } catch {
          /* missing file: renderer shows a placeholder and a warning */
        }
      }),
    );
  }
  let logo: Buffer | null = null;
  if (brand.logoKey && design.showLogo) logo = await storage.get(brand.logoKey).catch(() => null);
  return { design, brand, photos, logo };
}
