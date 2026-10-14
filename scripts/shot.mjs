import { chromium } from "@playwright/test";
const [url, out, w = "1440", h = "900"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url, { waitUntil: "networkidle" });
await p.screenshot({ path: out, fullPage: false });
await b.close();
