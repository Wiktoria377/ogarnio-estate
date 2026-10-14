import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/** Bundled OFL fonts for live previews in Brand Studio (same files the renderer uses). */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-z-]+-\d{3}\.ttf$/.test(file)) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "assets", "fonts", file));
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
