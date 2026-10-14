import "server-only";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { serverEnv } from "@/lib/env";
import type { ServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

export const BUCKET = "workspace-files";

/**
 * Object storage abstraction. Keys always start with the workspace id, which is
 * how both drivers (and the Supabase Storage RLS policies) enforce tenancy.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[a-z-]+(\/[0-9a-f-]{36})?\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|pdf|mp3|m4a|wav|aac)$/;

export function assertSafeKey(key: string, workspaceId: string) {
  if (!KEY_RE.test(key) || !key.startsWith(`${workspaceId}/`)) {
    throw new AppError("Nieprawidłowa ścieżka pliku.", "bad_key", 400);
  }
}

class SupabaseDriver implements StorageDriver {
  constructor(private readonly supabase: ServerSupabase) {}
  async put(key: string, data: Buffer, contentType: string) {
    const { error } = await this.supabase.storage.from(BUCKET).upload(key, data, { contentType, upsert: false });
    if (error) throw new AppError("Nie udało się zapisać pliku w magazynie.", "storage_put", 500);
  }
  async get(key: string) {
    const { data, error } = await this.supabase.storage.from(BUCKET).download(key);
    if (error || !data) throw new AppError("Nie znaleziono pliku.", "storage_get", 404);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(keys: string[]) {
    if (keys.length === 0) return;
    const { error } = await this.supabase.storage.from(BUCKET).remove(keys);
    if (error) throw new AppError("Nie udało się usunąć pliku.", "storage_rm", 500);
  }
}

/** Filesystem driver for development, automated tests and single-server self-hosting. */
class LocalDriver implements StorageDriver {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new AppError("Nieprawidłowa ścieżka.", "bad_key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: "wx" });
  }
  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch {
      throw new AppError("Nie znaleziono pliku.", "storage_get", 404);
    }
  }
  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => rm(this.resolve(k), { force: true })));
  }
}

export function getStorage(supabase: ServerSupabase): StorageDriver {
  const env = serverEnv();
  if (env.STORAGE_DRIVER === "local") return new LocalDriver(path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.LOCAL_STORAGE_DIR));
  return new SupabaseDriver(supabase);
}

/** Removes every object of a workspace (used when deleting an account / workspace). */
export async function listWorkspaceKeys(supabase: ServerSupabase, workspaceId: string): Promise<string[]> {
  const [photos, assets, rendered, media] = await Promise.all([
    supabase.from("property_photos").select("storage_path").eq("workspace_id", workspaceId),
    supabase.from("brand_assets").select("storage_path").eq("workspace_id", workspaceId),
    supabase.from("rendered_files").select("storage_path").eq("workspace_id", workspaceId),
    supabase.from("media_assets").select("storage_path").eq("workspace_id", workspaceId),
  ]);
  return [...(photos.data ?? []), ...(assets.data ?? []), ...(rendered.data ?? []), ...(media.data ?? [])].map((r) => r.storage_path);
}
