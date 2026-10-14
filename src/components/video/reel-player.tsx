"use client";
import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef } from "react";
import { Reel } from "@/remotion/Reel";
import { REEL_HEIGHT, REEL_WIDTH, type ReelProps } from "@/remotion/types";

/** Live preview: the same composition the server renders to MP4. */
const ReelPlayer = forwardRef<PlayerRef, { props: ReelProps }>(function ReelPlayer({ props }, ref) {
  return (
    <Player
      ref={ref}
      component={Reel}
      inputProps={props}
      durationInFrames={props.durationInFrames}
      fps={props.fps}
      compositionWidth={REEL_WIDTH}
      compositionHeight={REEL_HEIGHT}
      controls
      loop
      initialFrame={40}
      clickToPlay
      showVolumeControls={!!props.music}
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden", background: "#111" }}
    />
  );
});
export default ReelPlayer;
