import { describe, expect, it } from "vitest";
import { PHOTO_SCENES, VIDEO_LENGTHS, resizeScenes, videoDesignSchema } from "@/core/video/model";
import { reelPropsFrom, type ReelEnv } from "@/core/video/props";
import { TRANSITION, timeline } from "@/remotion/timeline";
import { REEL_FPS } from "@/remotion/types";

const P = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3"];
const env: ReelEnv = {
  colors: { primary: "#6D4AFF", secondary: "#1B1A1F", accent: "#C9B8FF", background: "#FAF9F7", text: "#1B1A1F" },
  heading: { light: { family: "H500", src: "/h500.ttf" }, strong: { family: "H600", src: "/h600.ttf" } },
  body: { family: "B", src: "/b.ttf" },
  company: "Biuro Testowe",
  contact: ["+48 600 000 000"],
  facts: { price: "899 000 zł", priceValue: 899000, params: ["54,5 m²", "3 pokoje"], location: "Mokotów · Warszawa" },
  photos: { [P[0]!]: { src: "/a.jpg", isVisualization: false }, [P[1]!]: { src: "/b.jpg", isVisualization: true }, [P[2]!]: { src: "/c.jpg", isVisualization: false } },
  logo: null,
  music: { "00000000-0000-4000-8000-0000000000b1": "/m.mp3" },
};

describe("video timeline", () => {
  for (const len of VIDEO_LENGTHS) {
    for (const withParams of [true, false]) {
      it(`${len} s (${withParams ? "with" : "without"} params) fills exactly ${len * REEL_FPS} frames`, () => {
        const segs = timeline(len, PHOTO_SCENES[len], withParams);
        const last = segs.at(-1)!;
        expect(last.kind).toBe("end");
        expect(last.from + last.duration).toBe(len * REEL_FPS);
        expect(segs.filter((s) => s.kind === "photo")).toHaveLength(PHOTO_SCENES[len]);
        for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toBe(segs[i - 1]!.from + segs[i - 1]!.duration - TRANSITION);
        for (const s of segs.filter((x) => x.kind === "photo")) expect(s.duration).toBeGreaterThanOrEqual(1.4 * REEL_FPS);
      });
    }
  }
});

describe("video design", () => {
  it("requires the scene count of the chosen length", () => {
    expect(videoDesignSchema.safeParse({ propertyId: P[0], style: "modern", length: 15, scenes: [{ photoId: P[0] }] }).success).toBe(false);
    expect(videoDesignSchema.safeParse({ propertyId: P[0], style: "modern", length: 10, scenes: [{ photoId: P[0] }, { photoId: P[1] }] }).success).toBe(true);
  });
  it("resizes scenes keeping texts and using unused photos first", () => {
    const s = resizeScenes([{ photoId: P[0]!, headline: "A", subline: "", motion: "zoom_in" }, { photoId: P[1]!, headline: "B", subline: "", motion: "zoom_in" }], 15, P, "modern");
    expect(s.map((x) => x.photoId)).toEqual(P);
    expect(s.map((x) => x.headline)).toEqual(["A", "B", ""]);
    expect(resizeScenes(s, 10, P, "modern")).toHaveLength(2);
  });
  it("props take facts from the record, not from the design, and honour toggles", () => {
    const d = videoDesignSchema.parse({ propertyId: P[0], style: "cinematic", length: 10, hook: "Hak", scenes: [{ photoId: P[1] }, { photoId: P[0] }], musicAssetId: "00000000-0000-4000-8000-0000000000b1" });
    const p = reelPropsFrom(d, env);
    expect(p.price).toBe("899 000 zł");
    expect(p.params).toEqual(["54,5 m²", "3 pokoje"]);
    expect(p.fonts.heading.family).toBe("H500");
    expect(p.scenes[0]).toMatchObject({ src: "/b.jpg", isVisualization: true });
    expect(p.music).toEqual({ src: "/m.mp3", volume: 0.6 });
    expect(p.durationInFrames).toBe(300);
    const hidden = reelPropsFrom({ ...d, showPrice: false, showParams: false, musicAssetId: null, style: "energetic" }, env);
    expect(hidden.price).toBe("");
    expect(hidden.priceValue).toBeNull();
    expect(hidden.params).toEqual([]);
    expect(hidden.music).toBeNull();
    expect(hidden.fonts.heading.family).toBe("H600");
  });
});
