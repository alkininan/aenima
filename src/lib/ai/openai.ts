import "server-only";

import OpenAI from "openai";

import { OPENAI_MODELS } from "./router";
import type { AiFailure, CallUsage, Provider, ProviderResponse, ResolvedRequest } from "./types";
import { NO_USAGE } from "./types";

/**
 * The OpenAI adapter — verified against the current API on 2026-08-24.
 *
 * The same three differences the Claude adapter absorbs, absorbed the other way
 * round. None of this reaches the seam.
 *
 * 1. **Structured outputs** live on the Responses API as `text.format` with
 *    `strict: true`, which requires `additionalProperties: false` and **every**
 *    property listed in `required`. That is the constraint behind the rule that
 *    our zod schemas use `.nullable()` and never `.optional()`.
 *    https://developers.openai.com/api/docs/guides/structured-outputs
 *
 * 2. **Prompt caching is automatic** above 1,024 tokens — there is no
 *    `cache_control` to place. What the caller controls is ordering (static
 *    first, variable last, which `AiRequest` enforces by having two fields) and
 *    `prompt_cache_key`, which improves the hit rate for requests sharing a
 *    prefix.
 *    https://developers.openai.com/api/docs/guides/prompt-caching
 *
 * 3. **Token accounting** counts cached tokens *inside* `input_tokens` and
 *    reports the cached share as a detail — the opposite of Anthropic. This
 *    adapter subtracts, so both providers arrive as the same four numbers.
 *
 * The SDK's `zodTextFormat` helper is not used: raw JSON Schema goes over the
 * wire and validation happens once, in `index.ts`, for both providers. That
 * also sidesteps the helper's open incompatibility with Zod 4
 * (openai/openai-node#1602), which this project is on.
 */

/** Automatic caching starts here — below it, nothing is cached and nothing errors. */
export const CACHE_MINIMUM_TOKENS = 1_024;

/** The request body, separated from the call so a test can read it. */
export function openaiBody(request: ResolvedRequest) {
  return {
    model: request.model,
    // Static content first, variable content last. This ordering *is* the
    // caching strategy on this provider — there is no breakpoint to place.
    input: [
      { role: "system" as const, content: request.context },
      { role: "user" as const, content: request.input },
    ],
    max_output_tokens: request.maxTokens,
    text: {
      format: {
        type: "json_schema" as const,
        name: `aenima_${request.purpose}`,
        schema: request.jsonSchema,
        strict: true,
      },
    },
    // Requests sharing a prefix share a key, which is what the docs ask for.
    // The purpose is enough: the context is the pack material for that purpose,
    // and it is the same string across the calls that reuse it.
    prompt_cache_key: `aenima:${request.purpose}`,
    // §5's pin, spelled this provider's way — `reasoning.effort` rather than
    // Anthropic's `output_config.effort`, the same absorption the rest of this
    // file does. Field shape and the value set read off the installed SDK's own
    // types (`openai@7.5.0`, `Shared.Reasoning`), which name
    // none/minimal/low/medium/high/xhigh/max; ours is a subset of that.
    // **Untested against the live API** — this project has no OpenAI key, so
    // unlike the Anthropic half nothing here was probed. Recorded in the build
    // log rather than left to look verified.
    ...(request.effort === null ? {} : { reasoning: { effort: request.effort } }),
  };
}

/** OpenAI's usage block, in `CallUsage`'s four numbers. */
export function readUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_tokens_details?: { cached_tokens?: number | null } | null;
}): CallUsage {
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const input = usage.input_tokens ?? 0;

  return {
    // `input_tokens` includes the cached share here, so it comes back out.
    // Clamped at zero: a provider that ever reported more cached than total
    // would otherwise produce a negative bill.
    uncachedInputTokens: Math.max(0, input - cached),
    cacheReadTokens: cached,
    // Automatic caching has no write charge. A real zero, not an unknown.
    cacheWriteTokens: 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

/** An SDK error, in this layer's taxonomy. The key never enters the result. */
export function classifyError(error: unknown): AiFailure {
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const detail = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    const header =
      error instanceof OpenAI.APIError ? error.headers?.get?.("retry-after") : undefined;
    const seconds = header ? Number(header) : Number.NaN;
    return {
      kind: "rate-limited",
      retryable: true,
      detail,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : null,
    };
  }

  if (status === undefined || status >= 500) {
    return { kind: "unavailable", retryable: true, detail };
  }

  return { kind: "rejected", retryable: false, detail };
}

type OutputItem = {
  type: string;
  content?: Array<{ type: string; text?: string; refusal?: string }>;
};

/**
 * The text, or the refusal that came instead of it.
 *
 * A refusal arrives as a content item rather than an error, so a reader that
 * only looked for text would see an empty answer and report it as a schema
 * failure — which would then be retried, once, for nothing.
 */
export function readOutput(output: OutputItem[]): { text: string; refusal: string | null } {
  const blocks = output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);

  const refusal = blocks.find((block) => block.type === "refusal")?.refusal ?? null;
  const text = blocks
    .filter((block) => block.type === "output_text")
    .map((block) => block.text ?? "")
    .join("");

  return { text, refusal };
}

export function createOpenAiProvider(apiKey: string): Provider {
  const client = new OpenAI({ apiKey });

  return {
    id: "openai",
    modelFor: (tier) => OPENAI_MODELS[tier],
    async send(request) {
      try {
        const response = await client.responses.create(openaiBody(request));
        const usage = readUsage(response.usage ?? {});
        const { text, refusal } = readOutput((response.output ?? []) as OutputItem[]);

        if (refusal !== null) {
          return {
            ok: false,
            usage,
            failure: { kind: "refused", retryable: false, detail: refusal },
          } satisfies ProviderResponse;
        }

        return { ok: true, text, usage } satisfies ProviderResponse;
      } catch (error) {
        return { ok: false, failure: classifyError(error), usage: NO_USAGE };
      }
    },
  };
}
