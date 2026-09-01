import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { ANTHROPIC_MODELS } from "./router";
import type { AiFailure, CallUsage, Provider, ProviderResponse, ResolvedRequest } from "./types";
import { NO_USAGE } from "./types";

/**
 * The Claude adapter — verified against the current API on 2026-08-24, not
 * against training data.
 *
 * Three things this absorbs so the seam never sees them:
 *
 * 1. **Structured outputs** are `output_config.format`, GA and needing no beta
 *    header since the `structured-outputs-2025-11-13` era. The older
 *    `output_format` parameter is deprecated.
 *    https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 *
 * 2. **Prompt caching** is explicit here: a `cache_control` breakpoint on the
 *    last stable block, with the hierarchy `tools → system → messages`, so the
 *    stable prefix must come first. That is why `AiRequest` splits `context`
 *    from `input` at all.
 *    https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 *
 * 3. **Token accounting**: `input_tokens` here means "after the last cache
 *    breakpoint", i.e. uncached, with the cached halves reported separately.
 *    That maps to `CallUsage` directly, and it is the OpenAI adapter that has
 *    to do subtraction.
 *
 * The raw JSON Schema goes over the wire rather than the SDK's `zodOutputFormat`
 * helper and `messages.parse`. One validation path — ours, in `index.ts`, the
 * same for both providers — and no exposure to helper/Zod-version skew.
 *
 * 4. **Sampling is not a control surface on these models.** Verified against the
 *    live API on `claude-sonnet-5`, 2026-09-02: `temperature` at any value but
 *    1.0 returns 400 "`temperature` is deprecated for this model", as do
 *    `top_p: 0.1` and `top_k: 1`. Nothing here sends any of the three, and
 *    nothing should — see `SCORER_EFFORT` in `router.ts` for what replaced them.
 */

/**
 * The minimum prompt a model will cache at all, per the caching docs.
 *
 * Haiku's is four times Sonnet's and eight times Opus's, so the routine tier
 * earns no cache hit until the pack context passes 4,096 tokens. Shorter
 * prompts are processed without caching and **no error is returned** — which is
 * exactly how a cache-hit rate of zero looks like a bug. Recorded in
 * docs/build-log.md so the next person finds the explanation instead.
 */
export const CACHE_MINIMUM_TOKENS: Readonly<Record<string, number>> = {
  "claude-haiku-4-5-20251001": 4_096,
  "claude-sonnet-5": 1_024,
  "claude-opus-5": 512,
};

/** The request body, separated from the call so a test can read it. */
export function anthropicBody(request: ResolvedRequest) {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    // The stable prefix, and the only block carrying a breakpoint. Everything
    // that changes per call lives in the message below it, so the hash of this
    // prefix is the same request after request.
    system: [
      {
        type: "text" as const,
        text: request.context,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: request.input }],
    output_config: {
      // §5's pin, on the path that has one. `output_config` already existed for
      // the schema, so effort costs no new structure. Omitted entirely when
      // null, which is the tier-routed path taking the provider's default.
      ...(request.effort === null ? {} : { effort: request.effort }),
      format: {
        type: "json_schema" as const,
        schema: request.jsonSchema,
      },
    },
  };
}

/** Anthropic's usage block, in `CallUsage`'s four numbers. */
export function readUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): CallUsage {
  return {
    // Already excludes anything served from cache — no subtraction needed.
    uncachedInputTokens: usage.input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

/**
 * An SDK error, in this layer's taxonomy.
 *
 * The key is never in the result. `error.message` from this SDK carries the
 * request id and the provider's own message, not the credential, and nothing
 * here interpolates the key into anything.
 */
export function classifyError(error: unknown): AiFailure {
  const status = error instanceof Anthropic.APIError ? error.status : undefined;
  const detail = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    const header =
      error instanceof Anthropic.APIError ? error.headers?.get?.("retry-after") : undefined;
    const seconds = header ? Number(header) : Number.NaN;
    return {
      kind: "rate-limited",
      retryable: true,
      detail,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : null,
    };
  }

  // No status at all is a connection or timeout error, which is the same
  // situation as a 5xx from where the caller stands: try again later.
  if (status === undefined || status >= 500) {
    return { kind: "unavailable", retryable: true, detail };
  }

  return { kind: "rejected", retryable: false, detail };
}

/** Reads the text out of a response, whatever blocks it came back in. */
function textOf(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

export function createAnthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey });

  return {
    id: "anthropic",
    modelFor: (tier) => ANTHROPIC_MODELS[tier],
    async send(request) {
      try {
        const response = await client.messages.create(anthropicBody(request));
        const usage = readUsage(response.usage ?? {});

        // `refusal` is a stop reason rather than a content block here: the model
        // declined, which is neither an outage nor our bug.
        if (response.stop_reason === "refusal") {
          return {
            ok: false,
            usage,
            failure: { kind: "refused", retryable: false, detail: "stop_reason: refusal" },
          } satisfies ProviderResponse;
        }

        return { ok: true, text: textOf(response.content), usage } satisfies ProviderResponse;
      } catch (error) {
        return { ok: false, failure: classifyError(error), usage: NO_USAGE };
      }
    },
  };
}
