import { z } from "zod";

type JsonSchema = { [key: string]: unknown };

/**
 * Converts a zod schema into the strict JSON Schema subset accepted by
 * structured outputs: every object closed (additionalProperties: false) and
 * every property required.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as JsonSchema;
  delete raw.$schema;
  return strictify(raw);
}

function strictify(node: unknown): JsonSchema {
  if (Array.isArray(node)) return node.map(strictify) as unknown as JsonSchema;
  if (!node || typeof node !== "object") return node as JsonSchema;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) {
    if (["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern", "format", "default"].includes(k)) continue;
    out[k] = typeof v === "object" ? strictify(v) : v;
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}
