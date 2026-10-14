import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { toStrictJsonSchema } from "./json-schema";
import { LlmError, type LlmCall, type LlmProvider, type LlmResult } from "./provider";

/** Models that accept the server-side refusal fallback ("default" routing). */
const FALLBACK_CAPABLE = /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5)/;

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly models: { main: string; review: string },
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 });
  }

  async complete<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
    const model = this.models[call.tier];
    const schema = toStrictJsonSchema(call.schema);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = attempt === 0 ? call.user : `${call.user}\n\nPoprzednia odpowiedź nie była poprawnym JSON zgodnym ze schematem. Zwróć wyłącznie poprawny JSON.`;
      let message;
      try {
        message = await this.client.beta.messages.create({
          model,
          max_tokens: call.maxTokens ?? 16000,
          system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
          output_config: { effort: call.effort ?? "medium", format: { type: "json_schema", schema } },
          ...(FALLBACK_CAPABLE.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
      } catch (error) {
        throw mapError(error);
      }
      if (message.stop_reason === "refusal") {
        throw new LlmError("Model AI odmówił wykonania tego zadania. Zmień temat lub instrukcje i spróbuj ponownie.", "refusal");
      }
      if (message.stop_reason === "max_tokens") {
        throw new LlmError("Odpowiedź była zbyt długa. Wybierz krótszą długość lub mniej wariantów.", "too_long");
      }
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      try {
        const parsed = call.schema.safeParse(JSON.parse(text));
        if (parsed.success) {
          return {
            data: parsed.data,
            model: message.model,
            usage: {
              input: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
              output: message.usage.output_tokens,
            },
          };
        }
        lastError = parsed.error;
      } catch (error) {
        lastError = error;
      }
    }
    console.error("invalid model output", lastError);
    throw new LlmError("Model zwrócił odpowiedź w nieoczekiwanym formacie. Spróbuj ponownie.", "invalid_output");
  }
}

function mapError(error: unknown): LlmError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("anthropic auth error: check ANTHROPIC_API_KEY");
    return new LlmError("Usługa AI jest chwilowo niedostępna z powodu błędu konfiguracji. Administrator został powiadomiony.", "auth");
  }
  if (error instanceof Anthropic.RateLimitError)
    return new LlmError("Przekroczono limit zapytań do modelu AI. Spróbuj ponownie za chwilę.", "rate_limited");
  if (error instanceof Anthropic.BadRequestError) {
    console.error("anthropic bad request", error.message);
    return new LlmError("Model AI odrzucił zapytanie. Spróbuj skrócić dane wejściowe.", "unknown");
  }
  if (error instanceof Anthropic.InternalServerError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500))
    return new LlmError("Model AI jest chwilowo przeciążony. Spróbuj ponownie za minutę.", "overloaded");
  if (error instanceof Anthropic.APIConnectionError)
    return new LlmError("Brak połączenia z usługą AI. Sprawdź połączenie serwera z internetem.", "network");
  console.error("anthropic error", error);
  return new LlmError("Nie udało się wygenerować treści. Spróbuj ponownie.", "unknown");
}
