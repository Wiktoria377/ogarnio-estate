import "server-only";
import { SOCIAL_NETWORKS } from "@/core/brand/model";
import { parseExtended, profileSnapshotSchema, type ProfileSnapshot } from "@/core/brand/profile";
import type { BrandProfileRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import type { AssetOption } from "@/components/brand/profile-editor";

/** The binding profile as an editable snapshot (same shape as stored versions). */
export function rowToSnapshot(b: BrandProfileRow): ProfileSnapshot {
  const socials = Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, ((b.socials ?? {}) as Record<string, string>)[n] ?? ""]));
  const raw = {
    company_name: b.company_name,
    tagline: b.tagline ?? "",
    colors: b.colors,
    heading_font: b.heading_font,
    body_font: b.body_font,
    contact_email: b.contact_email ?? "",
    contact_phone: b.contact_phone ?? "",
    address: b.address ?? "",
    website: b.website ?? "",
    socials,
    brand_style: b.brand_style,
    personality: b.personality ?? "",
    target_audience: b.target_audience ?? "",
    communication_style: b.communication_style,
    address_form: b.address_form,
    emoji_policy: b.emoji_policy,
    preferred_phrases: b.preferred_phrases ?? "",
    avoided_phrases: b.avoided_phrases ?? "",
    logo_asset_id: b.logo_asset_id,
    extended: parseExtended(b.extended),
  };
  const r = profileSnapshotSchema.safeParse(raw);
  // Legacy rows can hold values written before validation existed; fall back to raw data.
  return r.success ? r.data : (raw as unknown as ProfileSnapshot);
}

/** Snapshots stored by older code may miss fields: fill them from the current profile. */
export function asSnapshot(value: unknown, fallback: ProfileSnapshot): ProfileSnapshot {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const merged = { ...fallback, ...v, extended: parseExtended(v.extended) };
  const r = profileSnapshotSchema.safeParse(merged);
  return r.success ? r.data : (merged as unknown as ProfileSnapshot);
}

/** Logos and reference images the profile can point to. */
export async function assetOptions(ctx: WorkspaceContext): Promise<AssetOption[]> {
  const { data } = await ctx.supabase
    .from("brand_assets")
    .select("id, kind, storage_path, label")
    .eq("workspace_id", ctx.workspace.id)
    .in("kind", ["logo", "reference"])
    .order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({ id: a.id, kind: a.kind, label: a.label, url: `/api/files/${a.storage_path}` }));
}
