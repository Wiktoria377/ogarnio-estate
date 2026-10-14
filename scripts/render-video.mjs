#!/usr/bin/env node
/**
 * Renders the Reel composition to MP4 (+ JPG poster) in a separate process, so
 * Chromium and the encoder never block the web server. Used by the job worker.
 *
 *   node scripts/render-video.mjs <jobDir>
 *
 * <jobDir>/props.json holds ReelProps whose asset URLs start with "__BASE__/";
 * files next to it (photos, fonts, logo, music) are served on 127.0.0.1 only.
 * Progress and the result are printed as JSON lines on stdout.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jobDir = path.resolve(process.argv[2] ?? "");
const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

const TYPES = { ".jpg": "image/jpeg", ".png": "image/png", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".aac": "audio/aac" };

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const name = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
      // Flat directory, safe names only.
      if (!/^[a-z0-9_-]+\.(jpg|png|ttf|mp3|m4a|wav|aac)$/i.test(name)) return res.writeHead(404).end();
      const file = path.join(dir, name);
      if (!existsSync(file)) return res.writeHead(404).end();
      const size = statSync(file).size;
      const headers = { "Content-Type": TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes" };
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
        return createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...headers, "Content-Length": size });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** The webpack bundle is rebuilt only when the composition sources change. */
async function getBundle() {
  const { bundle } = await import("@remotion/bundler");
  const dir = path.join(root, "src", "remotion");
  const hash = createHash("sha1");
  for (const f of readdirSync(dir).sort()) hash.update(f).update(readFileSync(path.join(dir, f)));
  hash.update(JSON.parse(readFileSync(path.join(root, "node_modules", "remotion", "package.json"), "utf8")).version);
  const outDir = path.join(root, ".remotion-bundle", hash.digest("hex").slice(0, 16));
  if (existsSync(path.join(outDir, "index.html"))) return outDir;
  say({ type: "stage", value: "bundle" });
  return bundle({ entryPoint: path.join(dir, "index.ts"), outDir, enableCaching: true, onProgress: () => {} });
}

async function main() {
  const { renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
  const server = await serve(jobDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const inputProps = JSON.parse(readFileSync(path.join(jobDir, "props.json"), "utf8").replaceAll("__BASE__", base));
    const serveUrl = await getBundle();
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
    const common = { serveUrl, inputProps, browserExecutable, chromeMode: "headless-shell", logLevel: "error", timeoutInMilliseconds: 60_000 };
    const licenseKey = process.env.REMOTION_LICENSE_KEY || undefined;
    const composition = await selectComposition({ ...common, id: "Reel" });
    say({ type: "stage", value: "render" });
    const out = path.join(jobDir, "out.mp4");
    await renderMedia({
      ...common,
      composition,
      codec: "h264",
      crf: 20,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      outputLocation: out,
      concurrency: Number(process.env.REMOTION_CONCURRENCY || 2),
      onProgress: ({ progress }) => say({ type: "progress", value: Math.round(progress * 100) / 100 }),
      ...(licenseKey ? { licenseKey } : {}),
    });
    const poster = path.join(jobDir, "poster.jpg");
    await renderStill({ ...common, composition, frame: Math.min(composition.durationInFrames - 1, 40), output: poster, imageFormat: "jpeg", jpegQuality: 85, ...(licenseKey ? { licenseKey } : {}) });
    say({ type: "done", mp4: out, poster, durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000), width: composition.width, height: composition.height, fps: composition.fps });
  } finally {
    server.close();
  }
}

main().catch((e) => {
  say({ type: "error", message: String(e?.message ?? e).slice(0, 2000) });
  process.exit(1);
});
