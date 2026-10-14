import type { PostgrestError } from "@supabase/supabase-js";

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Reads every row of a query in pages. Supabase caps a single response
 * (`max_rows`, 1000 by default), so `.limit(50000)` alone silently returns
 * only the first 1000 rows. `page` must apply `.range(from, to)` to a query
 * with a stable order (e.g. by id). Pages advance by the rows actually
 * returned, so a lower server cap still reads everything.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, max = 50_000, size = 1000): Promise<{ data: T[]; error: PostgrestError | null; truncated: boolean }> {
  const out: T[] = [];
  while (out.length < max) {
    const { data, error } = await page(out.length, Math.min(out.length + size, max) - 1);
    if (error) return { data: out, error, truncated: false };
    if (!data?.length) return { data: out, error: null, truncated: false };
    out.push(...data);
  }
  return { data: out, error: null, truncated: true };
}
