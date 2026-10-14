/**
 * Props of the Reel composition. Everything is resolved before rendering:
 * texts, real photo URLs, brand colours/fonts and facts from the record.
 * The same props drive the browser preview (Player) and the server MP4 render.
 */
export type ReelStyle = "cinematic" | "modern" | "energetic" | "minimal" | "editorial";
export type SceneMotion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "parallax";

export interface ReelScene {
  src: string;
  headline: string;
  subline: string;
  motion: SceneMotion;
  isVisualization: boolean;
}

export interface ReelProps {
  [key: string]: unknown;
  style: ReelStyle;
  fps: number;
  durationInFrames: number;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: { family: string; src: string | null }; body: { family: string; src: string | null } };
  hook: string;
  scenes: ReelScene[];
  /** Facts from the record (never AI). Empty strings are not shown. */
  price: string;
  priceValue: number | null;
  params: string[];
  location: string;
  cta: string;
  contact: string[];
  company: string;
  logo: string | null;
  music: { src: string; volume: number } | null;
  labelVisualizations: boolean;
}

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
/** TikTok / Instagram UI: keep captions out of these bands. */
export const SAFE = { top: 250, bottom: 420, left: 72, right: 150 };
