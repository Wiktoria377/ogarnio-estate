// Regenerates skills/skills.lock.json: id → version + sha256 of the skill file.
// The unit test fails when a skill's content changes without a version bump,
// so every change to what the model reads is a deliberate, versioned change.
// Usage: node scripts/skills-lock.mjs   (after bumping `version:` in the edited skill)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = path.join(process.cwd(), "skills");
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : n.endsWith(".md") && n !== "README.md" ? [f] : [];
  });

const lockPath = path.join(root, "skills.lock.json");
let previous = {};
try { previous = JSON.parse(readFileSync(lockPath, "utf8")).skills ?? {}; } catch { /* first run */ }

const skills = {};
const problems = [];
for (const file of walk(root).sort()) {
  const raw = readFileSync(file, "utf8");
  const meta = parse(raw.match(/^---\n([\s\S]*?)\n---\n/)[1]);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const before = previous[meta.id];
  if (before && before.sha256 !== sha256 && before.version === meta.version) problems.push(`${meta.id}: treść zmieniona bez zmiany wersji (${meta.version})`);
  skills[meta.id] = { version: meta.version, file: path.relative(root, file), sha256 };
}
if (problems.length) {
  console.error(`Podbij wersję w zmienionych skills:\n${problems.join("\n")}`);
  process.exit(1);
}
writeFileSync(lockPath, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), skills }, null, 2)}\n`);
console.log(`skills.lock.json: ${Object.keys(skills).length} skills`);
