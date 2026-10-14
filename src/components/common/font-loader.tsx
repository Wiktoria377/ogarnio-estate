"use client";
import { useEffect } from "react";
import { FONTS } from "@/core/brand/fonts";

const loaded = new Set<string>();

/** Loads bundled fonts into the page for live previews. Returns the CSS family name. */
export function fontFamily(id: string) {
  return `oe-${id}`;
}

export function useFonts(ids: (string | null | undefined)[]) {
  const key = ids.filter(Boolean).join(",");
  useEffect(() => {
    for (const id of key.split(",").filter(Boolean)) {
      const def = FONTS.find((f) => f.id === id);
      if (!def) continue;
      for (const w of def.weights) {
        const k = `${id}-${w}`;
        if (loaded.has(k)) continue;
        loaded.add(k);
        const face = new FontFace(fontFamily(id), `url(/api/fonts/${k}.ttf)`, { weight: String(w) });
        face.load().then((f) => document.fonts.add(f)).catch(() => loaded.delete(k));
      }
    }
  }, [key]);
}
