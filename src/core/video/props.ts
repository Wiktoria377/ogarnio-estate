import type { ReelProps } from "@/remotion/types";
import { REEL_FPS } from "@/remotion/types";
import type { VideoDesign } from "./model";

type FontRef = { family: string; src: string | null };

/**
 * Everything a Reel needs besides the design: brand, facts from the record and
 * resolved asset URLs. Built on the server; serialisable, so the editor can
 * recompute props instantly in the browser while the user edits the script.
 */
export interface ReelEnv {
  colors: ReelProps["colors"];
  /** Heading font in a lighter (cinematic/minimal) and a stronger weight. */
  heading: { light: FontRef; strong: FontRef };
  body: FontRef;
  company: string;
  contact: string[];
  facts: { price: string; priceValue: number | null; params: string[]; location: string };
  photos: Record<string, { src: string; isVisualization: boolean }>;
  logo: string | null;
  music: Record<string, string>;
}

export function reelPropsFrom(design: VideoDesign, env: ReelEnv): ReelProps {
  const light = design.style === "cinematic" || design.style === "minimal";
  const musicSrc = design.musicAssetId ? env.music[design.musicAssetId] : undefined;
  return {
    style: design.style,
    fps: REEL_FPS,
    durationInFrames: design.length * REEL_FPS,
    colors: env.colors,
    fonts: { heading: light ? env.heading.light : env.heading.strong, body: env.body },
    hook: design.hook,
    scenes: design.scenes.map((s) => {
      const p = env.photos[s.photoId];
      return { src: p?.src ?? "", headline: s.headline, subline: s.subline, motion: s.motion, isVisualization: p?.isVisualization ?? false };
    }),
    price: design.showPrice ? env.facts.price : "",
    priceValue: design.showPrice ? env.facts.priceValue : null,
    params: design.showParams ? env.facts.params : [],
    location: env.facts.location,
    cta: design.cta,
    contact: env.contact,
    company: env.company,
    logo: env.logo,
    music: musicSrc ? { src: musicSrc, volume: design.musicVolume } : null,
    labelVisualizations: design.labelVisualizations,
  };
}
