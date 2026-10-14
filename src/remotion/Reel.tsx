import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { timeline, TRANSITION, type Segment } from "./timeline";
import { REEL_HEIGHT, REEL_WIDTH, SAFE, type ReelProps, type ReelScene, type ReelStyle } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Loads brand fonts before the first frame is captured. */
function useBrandFonts(fonts: ReelProps["fonts"]) {
  const [handle] = useState(() => delayRender("Ładowanie czcionek marki"));
  useEffect(() => {
    const list = [fonts.heading, fonts.body].filter((f) => f.src);
    Promise.all(
      list.map(async (f) => {
        try {
          const face = new FontFace(f.family, `url(${f.src})`);
          await face.load();
          document.fonts.add(face);
        } catch {
          /* falls back to the system sans; never blocks the render */
        }
      }),
    ).finally(() => continueRender(handle));
  }, [fonts, handle]);
}

interface Look {
  headingFamily: string;
  bodyFamily: string;
  overlay: string;
  text: string;
  accent: string;
  upper: boolean;
  headlineSize: number;
}

function lookFor(p: ReelProps): Look {
  const heading = `"${p.fonts.heading.family}", "${p.fonts.body.family}", sans-serif`;
  const body = `"${p.fonts.body.family}", sans-serif`;
  switch (p.style) {
    case "cinematic":
      return { headingFamily: heading, bodyFamily: body, overlay: "linear-gradient(180deg, rgba(8,8,12,0.55) 0%, rgba(8,8,12,0) 28%, rgba(8,8,12,0) 45%, rgba(8,8,12,0.88) 100%)", text: "#F6F1E8", accent: p.colors.accent, upper: false, headlineSize: 84 };
    case "modern":
      return { headingFamily: body, bodyFamily: body, overlay: "linear-gradient(180deg, rgba(10,10,14,0.35) 0%, rgba(10,10,14,0) 30%, rgba(10,10,14,0.0) 50%, rgba(10,10,14,0.82) 100%)", text: "#FFFFFF", accent: p.colors.primary, upper: false, headlineSize: 80 };
    case "energetic":
      return { headingFamily: body, bodyFamily: body, overlay: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75) 100%)", text: "#FFFFFF", accent: p.colors.primary, upper: true, headlineSize: 92 };
    case "minimal":
      return { headingFamily: heading, bodyFamily: body, overlay: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.0) 55%, rgba(0,0,0,0.6) 100%)", text: "#FFFFFF", accent: "#FFFFFF", upper: false, headlineSize: 72 };
    case "editorial":
      return { headingFamily: heading, bodyFamily: body, overlay: "linear-gradient(180deg, rgba(12,10,16,0.45) 0%, rgba(12,10,16,0) 30%, rgba(12,10,16,0) 50%, rgba(12,10,16,0.85) 100%)", text: "#FFFFFF", accent: p.colors.accent, upper: false, headlineSize: 88 };
  }
}

/** Entering/exiting transform for a whole segment, per style. */
function segmentTransition(style: ReelStyle, frame: number, duration: number, first: boolean, last: boolean): React.CSSProperties {
  const tin = first ? 1 : interpolate(frame, [0, TRANSITION], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const tout = last ? 0 : interpolate(frame, [duration - TRANSITION, duration], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  switch (style) {
    case "cinematic":
      return { opacity: tin };
    case "modern":
      return { transform: `translateX(${(1 - tin) * 100 - tout * 25}%)`, opacity: 1 - tout * 0.4 };
    case "energetic":
      return { transform: `scale(${1 + (1 - tin) * 0.35})`, opacity: tin };
    case "minimal":
      return { clipPath: `inset(0 0 0 ${(1 - tin) * 100}%)` };
    case "editorial":
      return { transform: `translateY(${(1 - tin) * 100}%)` };
  }
}

/** Ken Burns / parallax camera on a real photo (no generative content). */
function PhotoLayer({ scene, frame, duration, style }: { scene: ReelScene; frame: number; duration: number; style: ReelStyle }) {
  const t = interpolate(frame, [0, duration], [0, 1], clamp);
  const strength = style === "energetic" ? 0.2 : style === "cinematic" ? 0.1 : 0.14;
  if (scene.motion === "parallax") {
    // Two depths: soft enlarged background drifts slowly, framed photo moves faster.
    const bg = 1.25 + t * 0.05;
    return (
      <AbsoluteFill>
        <Img src={scene.src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${bg}) translateY(${t * -2}%)`, filter: "blur(18px) brightness(0.7)" }} />
        <div style={{ position: "absolute", left: 80, right: 80, top: 330, height: 1060, overflow: "hidden", borderRadius: 18, boxShadow: "0 40px 80px rgba(0,0,0,0.45)", transform: `translateY(${interpolate(t, [0, 1], [40, -60])}px)` }}>
          <Img src={scene.src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.08 + t * 0.06})` }} />
        </div>
      </AbsoluteFill>
    );
  }
  let transform = "";
  if (scene.motion === "zoom_in") transform = `scale(${1 + t * strength})`;
  else if (scene.motion === "zoom_out") transform = `scale(${1 + strength - t * strength})`;
  else if (scene.motion === "pan_left") transform = `scale(${1 + strength}) translateX(${interpolate(t, [0, 1], [strength * 40, -strength * 40])}%)`;
  else transform = `scale(${1 + strength}) translateX(${interpolate(t, [0, 1], [-strength * 40, strength * 40])}%)`;
  return <Img src={scene.src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform }} />;
}

/** Word-by-word / line reveal tuned per style. */
function AnimatedText({ text, frame, fps, style, look, size, family, weight = 700, delay = 0, color }: { text: string; frame: number; fps: number; style: ReelStyle; look: Look; size: number; family: string; weight?: number; delay?: number; color?: string }) {
  if (!text) return null;
  const words = (look.upper ? text.toLocaleUpperCase("pl-PL") : text).split(/\s+/);
  const base: React.CSSProperties = { fontFamily: family, fontSize: size, fontWeight: weight, lineHeight: 1.08, color: color ?? look.text, letterSpacing: style === "energetic" ? "-0.01em" : style === "cinematic" ? "0.005em" : "-0.015em", textWrap: "balance" as never };
  return (
    <div style={base}>
      {words.map((w, i) => {
        const f = frame - delay - i * (style === "energetic" ? 2 : 3);
        const s = spring({ frame: f, fps, config: { damping: style === "energetic" ? 11 : 200, stiffness: style === "energetic" ? 180 : 120 } });
        let st: React.CSSProperties;
        switch (style) {
          case "cinematic":
            st = { opacity: interpolate(f, [0, 14], [0, 1], clamp), filter: `blur(${interpolate(f, [0, 14], [8, 0], clamp)}px)` };
            break;
          case "modern":
          case "editorial":
            st = { transform: `translateY(${(1 - s) * 105}%)`, display: "inline-block" };
            break;
          case "energetic":
            st = { transform: `scale(${s})`, display: "inline-block" };
            break;
          case "minimal":
            st = { opacity: s, transform: `translateY(${(1 - s) * 24}px)`, display: "inline-block" };
            break;
        }
        const mask = style === "modern" || style === "editorial";
        return (
          <span key={i} style={{ display: "inline-block", overflow: mask ? "hidden" : undefined, verticalAlign: "top", paddingBottom: mask ? "0.08em" : undefined, marginRight: "0.25em" }}>
            <span style={{ display: "inline-block", ...st }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

function VisualizationLabel({ show }: { show: boolean }) {
  if (!show) return null;
  return <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, padding: "10px 18px", borderRadius: 999, background: "rgba(20,18,24,0.72)", color: "#fff", fontFamily: "sans-serif", fontWeight: 700, fontSize: 24, letterSpacing: "0.08em" }}>WIZUALIZACJA</div>;
}

function PhotoScene({ p, look, scene, index, seg, total }: { p: ReelProps; look: Look; scene: ReelScene; index: number; seg: Segment; total: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isHook = index === 0 && !!p.hook;
  const out = interpolate(frame, [seg.duration - TRANSITION - 6, seg.duration - TRANSITION + 2], [1, 0], clamp);
  const headline = isHook ? p.hook : scene.headline;
  const sub = isHook ? scene.headline || scene.subline : scene.subline;
  const accentBar = interpolate(frame, [8, 26], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ ...segmentTransition(p.style, frame, seg.duration, index === 0, false), overflow: "hidden", background: "#000" }}>
      <PhotoLayer scene={scene} frame={frame} duration={seg.duration} style={p.style} />
      <AbsoluteFill style={{ background: look.overlay }} />
      <VisualizationLabel show={scene.isVisualization && p.labelVisualizations} />
      {isHook && p.location && (
        <div style={{ position: "absolute", top: SAFE.top + (scene.isVisualization && p.labelVisualizations ? 70 : 0), left: SAFE.left, right: SAFE.right, opacity: interpolate(frame, [0, 12], [0, 1], clamp), color: "#fff", fontFamily: look.bodyFamily, fontWeight: 600, fontSize: 30, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          {p.location}
        </div>
      )}
      <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, bottom: SAFE.bottom, opacity: out, display: "flex", flexDirection: "column", gap: 22 }}>
        {(p.style === "editorial" || p.style === "modern") && <div style={{ width: 120 * accentBar, height: 8, background: look.accent, borderRadius: 4 }} />}
        {p.style === "energetic" ? (
          <div style={{ alignSelf: "flex-start", background: look.accent, padding: "10px 22px 14px", transform: `skewX(-6deg) scaleX(${accentBar})`, transformOrigin: "left" }}>
            <div style={{ transform: "skewX(6deg)" }}>
              <AnimatedText text={headline} frame={frame} fps={fps} style={p.style} look={look} size={isHook ? 96 : look.headlineSize} family={look.headingFamily} delay={4} />
            </div>
          </div>
        ) : (
          <AnimatedText text={headline} frame={frame} fps={fps} style={p.style} look={look} size={isHook ? look.headlineSize + 14 : look.headlineSize} family={look.headingFamily} weight={p.style === "cinematic" || p.style === "minimal" ? 500 : 700} delay={4} />
        )}
        {sub && <AnimatedText text={sub} frame={frame} fps={fps} style={p.style === "energetic" ? "minimal" : p.style} look={{ ...look, upper: false }} size={44} family={look.bodyFamily} weight={500} delay={14} color="rgba(255,255,255,0.9)" />}
      </div>
      <Progress index={index} total={total} frame={frame} duration={seg.duration} color={look.accent} />
    </AbsoluteFill>
  );
}

function Progress({ index, total, frame, duration, color }: { index: number; total: number; frame: number; duration: number; color: string }) {
  const w = (REEL_WIDTH - SAFE.left - SAFE.right - (total - 1) * 10) / total;
  return (
    <div style={{ position: "absolute", top: SAFE.top - 40, left: SAFE.left, display: "flex", gap: 10 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ width: w, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
          <div style={{ height: "100%", background: color === "#FFFFFF" ? "#fff" : color, width: `${i < index ? 100 : i > index ? 0 : interpolate(frame, [0, duration], [0, 100], clamp)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Price and parameters: per-character roll-in (final value only) and staggered chips. */
function ParamsScene({ p, look, seg, bg }: { p: ReelProps; look: Look; seg: Segment; bg: ReelScene | undefined }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dark = p.style === "cinematic" || p.style === "editorial";
  const fill = p.style === "minimal" ? p.colors.background : dark ? p.colors.secondary : p.colors.primary;
  const fg = p.style === "minimal" ? p.colors.text : "#FFFFFF";
  return (
    <AbsoluteFill style={{ ...segmentTransition(p.style, frame, seg.duration, false, false), overflow: "hidden", background: fill }}>
      {bg && p.style !== "minimal" && (
        <>
          <Img src={bg.src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.1 + frame / 900})`, filter: "blur(24px)", opacity: 0.35 }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${fill}CC, ${fill}F2)` }} />
        </>
      )}
      <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, top: SAFE.top, bottom: SAFE.bottom, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36, color: fg }}>
        <div style={{ fontFamily: look.bodyFamily, fontWeight: 700, fontSize: 30, letterSpacing: "0.18em", opacity: interpolate(frame, [TRANSITION, TRANSITION + 12], [0, 1], clamp) }}>{p.price ? "CENA I PARAMETRY" : "PARAMETRY"}</div>
        {p.location && <div style={{ fontFamily: look.bodyFamily, fontWeight: 500, fontSize: 40, opacity: 0.85 * interpolate(frame, [TRANSITION + 6, TRANSITION + 18], [0, 1], clamp) }}>{p.location}</div>}
        {p.price && (
          <div style={{ display: "flex", flexWrap: "wrap", fontFamily: look.headingFamily, fontWeight: 600, fontSize: p.price.length > 14 ? 104 : 124, lineHeight: 1 }}>
            {[...p.price].map((ch, i) => {
              const s = spring({ frame: frame - TRANSITION - 4 - i * 2, fps, config: { damping: 18, stiffness: 140 } });
              return (
                <span key={i} style={{ display: "inline-block", overflow: "hidden", height: "1.08em" }}>
                  <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * 110}%)`, whiteSpace: "pre" }}>{ch}</span>
                </span>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10 }}>
          {p.params.map((t, i) => {
            const s = spring({ frame: frame - TRANSITION - 18 - i * 6, fps, config: { damping: 14 } });
            return (
              <div key={i} style={{ transform: `translateY(${(1 - s) * 40}px)`, opacity: s, padding: "18px 30px", borderRadius: 999, border: `2px solid ${fg}55`, background: p.style === "minimal" ? "transparent" : "rgba(255,255,255,0.08)", fontFamily: look.bodyFamily, fontWeight: 600, fontSize: 40 }}>
                {t}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function EndScreen({ p, look, seg }: { p: ReelProps; look: Look; seg: Segment }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - TRANSITION, fps, config: { damping: 200 } });
  const fill = p.style === "minimal" ? p.colors.background : p.colors.primary;
  const fg = p.style === "minimal" ? p.colors.text : "#FFFFFF";
  return (
    <AbsoluteFill style={{ ...segmentTransition(p.style, frame, seg.duration, false, true), background: fill, color: fg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: SAFE.top, bottom: SAFE.bottom, left: SAFE.right, right: SAFE.right, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 48, transform: `scale(${0.94 + s * 0.06})`, opacity: s }}>
        {p.logo ? (
          <div style={{ background: "#fff", borderRadius: 24, padding: "28px 40px" }}>
            <Img src={p.logo} style={{ maxWidth: 520, maxHeight: 170, objectFit: "contain", display: "block" }} />
          </div>
        ) : (
          <div style={{ fontFamily: look.headingFamily, fontWeight: 600, fontSize: 64, textAlign: "center" }}>{p.company}</div>
        )}
        <div style={{ width: 120, height: 4, background: fg, opacity: 0.5 }} />
        <div style={{ fontFamily: look.headingFamily, fontWeight: 600, fontSize: 92, lineHeight: 1.05, textAlign: "center", textWrap: "balance" as never }}>{p.cta}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, fontFamily: look.bodyFamily, fontWeight: 500, fontSize: 42, opacity: interpolate(frame, [TRANSITION + 10, TRANSITION + 24], [0, 1], clamp) }}>
          {p.contact.map((c, i) => <div key={i}>{c}</div>)}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const Reel: React.FC<ReelProps> = (p) => {
  useBrandFonts(p.fonts);
  const look = lookFor(p);
  const segs = timeline(p.durationInFrames / p.fps, p.scenes.length, !!(p.price || p.params.length));
  const photos = segs.filter((s) => s.kind === "photo");
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#000", width: REEL_WIDTH, height: REEL_HEIGHT }}>
      {segs.map((seg, i) => (
        <Sequence key={i} from={seg.from} durationInFrames={seg.duration} layout="none">
          {seg.kind === "photo" ? (
            <PhotoScene p={p} look={look} scene={p.scenes[seg.index]!} index={seg.index} seg={seg} total={photos.length} />
          ) : seg.kind === "params" ? (
            <ParamsScene p={p} look={look} seg={seg} bg={p.scenes[0]} />
          ) : (
            <EndScreen p={p} look={look} seg={seg} />
          )}
        </Sequence>
      ))}
      {p.music && <Audio src={p.music.src} volume={(f) => p.music!.volume * interpolate(f, [0, 15, durationInFrames - 30, durationInFrames], [0, 1, 1, 0], clamp)} />}
    </AbsoluteFill>
  );
};
