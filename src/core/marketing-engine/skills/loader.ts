import "server-only";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseSkillFile } from "./parse";
import type { Skill } from "./types";

let cache: Skill[] | null = null;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith(".md") && name !== "README.md" ? [full] : [];
  });
}

/** Loads and validates every skill in /skills. Invalid files fail loudly (they are app code). */
export function loadSkills(root = path.join(process.cwd(), "skills")): Skill[] {
  if (cache && root === path.join(process.cwd(), "skills")) return cache;
  const skills = walk(root).map((file) => parseSkillFile(readFileSync(file, "utf8"), path.relative(root, file)));
  const ids = new Set<string>();
  for (const s of skills) {
    if (ids.has(s.id)) throw new Error(`Zduplikowany identyfikator skill: ${s.id}`);
    ids.add(s.id);
  }
  cache = skills;
  return skills;
}
