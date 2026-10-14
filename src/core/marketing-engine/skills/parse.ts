import { parse as parseYaml } from "yaml";
import { skillMetaSchema, type Skill } from "./types";

/** Phrases that would let an imported text act as instructions to the app or the model's tooling. */
const UNSAFE_PATTERNS = [
  /ignore (all|any|previous|the above) instructions/i,
  /zignoruj (wszystkie|poprzednie) instrukcje/i,
  /```(bash|sh|shell|zsh|powershell)/i,
  /\b(curl|wget)\s+https?:/i,
  /\brm\s+-rf\b/i,
  /<\/?(system|tool_use|function_calls)>/i,
  // Role takeover and overriding the app's rules.
  /\b(disregard|override|bypass) (all |any |the )?(previous |above |system )?(instructions|rules|guardrails)/i,
  /\byou are now\b|\bact as (a |an )?(system|developer|admin)/i,
  /(pomiń|obejdź|zignoruj) (zasady|reguły|ograniczenia|zabezpieczenia)/i,
  // Exfiltration: revealing prompts or secrets, sending data to external addresses.
  /(reveal|print|show|ujawnij|wypisz|pokaż) (the |your |swój |swoje )?(system prompt|prompt systemowy|instrukcje systemowe|api key|klucz api|token)/i,
  /!\[[^\]]*\]\(\s*https?:/i,
  /\b(javascript|data|vbscript):/i,
  /<\s*(script|iframe|object|embed)\b/i,
  // Code execution and tool calls.
  /\b(eval|exec|child_process|subprocess|os\.system|require\(|import\s*\()/i,
  /\b(sudo|chmod\s+\+x|powershell\s+-|bash\s+-c)\b/i,
  // Long opaque blobs (encoded payloads) have no place in a knowledge file.
  /[A-Za-z0-9+/]{200,}={0,2}/,
];

export const estimateTokens = (text: string) => Math.ceil(text.length / 3.6);

export function parseSkillFile(raw: string, file: string): Skill {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: brak frontmatter YAML`);
  const meta = skillMetaSchema.safeParse(parseYaml(match[1]!));
  if (!meta.success) {
    throw new Error(`${file}: ${meta.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  const instructions = match[2]!.trim();
  if (instructions.length < 80) throw new Error(`${file}: instrukcje są za krótkie`);
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(instructions)) throw new Error(`${file}: niedozwolona treść (${re.source}) — skills to wiedza, nie polecenia wykonawcze`);
  }
  return { ...meta.data, instructions, file, tokens: estimateTokens(instructions) };
}
