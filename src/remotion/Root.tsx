import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, type ReelProps } from "./types";

const placeholder: ReelProps = {
  style: "modern",
  fps: REEL_FPS,
  durationInFrames: 15 * REEL_FPS,
  colors: { primary: "#6D4AFF", secondary: "#1B1A1F", accent: "#C9B8FF", background: "#FAF9F7", text: "#1B1A1F" },
  fonts: { heading: { family: "sans-serif", src: null }, body: { family: "sans-serif", src: null } },
  hook: "",
  scenes: [],
  price: "",
  priceValue: null,
  params: [],
  location: "",
  cta: "",
  contact: [],
  company: "",
  logo: null,
  music: null,
  labelVisualizations: true,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={REEL_WIDTH}
    height={REEL_HEIGHT}
    fps={REEL_FPS}
    durationInFrames={placeholder.durationInFrames}
    defaultProps={placeholder}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames, fps: props.fps })}
  />
);
