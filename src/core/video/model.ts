import { z } from "zod";
import { VIDEO_LENGTHS, PHOTO_SCENES, type VideoLength } from "@/remotion/timeline";
import type { ReelStyle, SceneMotion } from "@/remotion/types";

export { VIDEO_LENGTHS, PHOTO_SCENES, type VideoLength };

export const VIDEO_STYLES: Record<ReelStyle, { label: string; description: string; motions: SceneMotion[] }> = {
  cinematic: { label: "Kinowy premium", description: "Powolne zbliżenia, miękkie przenikania, szeryfowe napisy pojawiające się z rozmycia.", motions: ["zoom_in", "pan_left", "zoom_out", "pan_right", "parallax", "zoom_in"] },
  modern: { label: "Nowoczesny", description: "Przesuwane przejścia, napisy wysuwane spod maski, akcent w kolorze marki.", motions: ["zoom_in", "parallax", "pan_left", "zoom_out", "pan_right", "parallax"] },
  energetic: { label: "Dynamiczny", description: "Szybkie wejścia z przybliżeniem, duże napisy na pasku marki. Do Reels i TikToka.", motions: ["zoom_in", "zoom_out", "zoom_in", "pan_right", "zoom_out", "zoom_in"] },
  minimal: { label: "Minimalistyczny", description: "Spokojne panoramy, przejścia kurtyną, mało tekstu, jasne plansze.", motions: ["pan_right", "zoom_in", "pan_left", "zoom_out", "pan_right", "zoom_in"] },
  editorial: { label: "Magazynowy", description: "Paralaksa i ramki jak w magazynie, wjazdy pionowe, linie redakcyjne.", motions: ["parallax", "zoom_in", "parallax", "pan_left", "parallax", "zoom_out"] },
};
export const VIDEO_STYLE_IDS = Object.keys(VIDEO_STYLES) as [ReelStyle, ...ReelStyle[]];
export const SCENE_MOTIONS: Record<SceneMotion, string> = { zoom_in: "Zbliżenie", zoom_out: "Oddalenie", pan_left: "Panorama w lewo", pan_right: "Panorama w prawo", parallax: "Paralaksa" };
const MOTION_IDS = Object.keys(SCENE_MOTIONS) as [SceneMotion, ...SceneMotion[]];

export const videoSceneSchema = z.object({
  photoId: z.uuid(),
  headline: z.string().max(60).default(""),
  subline: z.string().max(80).default(""),
  motion: z.enum(MOTION_IDS).default("zoom_in"),
});
export type VideoScene = z.infer<typeof videoSceneSchema>;

export const videoDesignSchema = z
  .object({
    propertyId: z.uuid(),
    style: z.enum(VIDEO_STYLE_IDS),
    length: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
    hook: z.string().max(60).default(""),
    scenes: z.array(videoSceneSchema).min(1).max(6),
    cta: z.string().max(50).default("Umów prezentację"),
    caption: z.string().max(2200).default(""),
    showPrice: z.boolean().default(true),
    showParams: z.boolean().default(true),
    labelVisualizations: z.boolean().default(true),
    musicAssetId: z.uuid().nullable().default(null),
    musicVolume: z.number().min(0).max(1).default(0.6),
    /** The script must be approved before an MP4 can be rendered. */
    scriptApproved: z.boolean().default(false),
    scriptSource: z.enum(["ai", "manual"]).default("manual"),
    gaps: z.array(z.string().max(300)).max(10).default([]),
    warnings: z.array(z.string().max(300)).max(20).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.scenes.length !== PHOTO_SCENES[d.length]) ctx.addIssue({ code: "custom", path: ["scenes"], message: `Film ${d.length} s ma ${PHOTO_SCENES[d.length]} sceny ze zdjęciami.` });
  });
export type VideoDesign = z.infer<typeof videoDesignSchema>;

/** Adjusts the scene list to a new length, keeping texts and reusing photos in order. */
export function resizeScenes(scenes: VideoScene[], length: VideoLength, photoIds: string[], style: ReelStyle): VideoScene[] {
  const n = PHOTO_SCENES[length];
  const out = scenes.slice(0, n);
  const pool = photoIds.length ? photoIds : scenes.map((s) => s.photoId);
  for (let i = out.length; i < n; i++) {
    const unused = pool.find((id) => !out.some((s) => s.photoId === id)) ?? pool[i % pool.length]!;
    out.push({ photoId: unused, headline: "", subline: "", motion: VIDEO_STYLES[style].motions[i % 6]! });
  }
  return out;
}
