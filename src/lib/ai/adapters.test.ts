import { describe, expect, it, vi } from "vitest";

// Both adapters are `server-only` — an AI call from a Client Component has to
// be a build error, per the ticket's own rule. The repo's established way to
// exercise such a module in a node test is to stub the marker, as
// `src/db/queries/item.test.ts` does.
vi.mock("server-only", () => ({}));

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import * as anthropic from "@/lib/ai/anthropic";
import * as openai from "@/lib/ai/openai";
import { ANTHROPIC_MODELS, OPENAI_MODELS, SCORER_EFFORT } from "@/lib/ai/router";
import type { ResolvedRequest } from "@/lib/ai/types";

/**
 * What each adapter absorbs, asserted on the request it builds and the usage it
 * reads — no network, because none of this is about the network.
 *
 * The interesting property is that two providers which disagree about
 * structured outputs, caching and token accounting produce the same four
 * numbers and the same guarantees at the seam. Where they differ, the
 * difference stops inside these two files.
 */

const request: ResolvedRequest = {
  model: "test-model",
  purpose: "score",
  context: "the rubric, which repeats",
  input: "the artifact, which does not",
  jsonSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  maxTokens: 512,
  // The tier-routed shape: no effort, each provider's default. The pinned
  // shape is asserted separately below.
  effort: null,
};

describe("the Claude request", () => {
  const body = anthropic.anthropicBody(request);

  // §12 wants caching structured in from day one. The breakpoint goes on the
  // last stable block, and everything variable lives after it — a breakpoint on
  // a block that changes per call never matches a prefix hash, so the cache is
  // written and never read.
  it("caches the stable prefix and nothing that changes", () => {
    expect(body.system[0]).toMatchObject({
      type: "text",
      text: "the rubric, which repeats",
      cache_control: { type: "ephemeral" },
    });
    expect(body.messages[0]).toMatchObject({
      role: "user",
      content: "the artifact, which does not",
    });
    expect(JSON.stringify(body.messages)).not.toContain("cache_control");
  });

  it("asks for structured output through output_config", () => {
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema).toBe(request.jsonSchema);
    // The deprecated parameter is not present under any spelling.
    expect(JSON.stringify(body)).not.toContain("output_format");
  });
});

describe("the OpenAI request", () => {
  const body = openai.openaiBody(request);

  // There is no breakpoint to place here — caching is automatic — so ordering
  // is the whole strategy, and it has to be right.
  it("puts static content first and variable content last", () => {
    expect(body.input.map((message) => message.role)).toEqual(["system", "user"]);
    expect(body.input[0]?.content).toBe("the rubric, which repeats");
    expect(body.input[1]?.content).toBe("the artifact, which does not");
  });

  it("sends a cache key shared by requests with the same prefix", () => {
    expect(body.prompt_cache_key).toBe("aenima:score");
  });

  it("asks for strict structured output through text.format", () => {
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.text.format.schema).toBe(request.jsonSchema);
  });
});

/**
 * The accounting difference, which is the one most likely to go unnoticed:
 * Anthropic's `input_tokens` excludes what came from cache, OpenAI's includes
 * it. Given the same real call, both must produce the same four numbers.
 */
describe("token accounting", () => {
  it("normalizes Anthropic's shape without subtracting", () => {
    expect(
      anthropic.readUsage({
        input_tokens: 120,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 40,
        output_tokens: 60,
      }),
    ).toEqual({
      uncachedInputTokens: 120,
      cacheReadTokens: 900,
      cacheWriteTokens: 40,
      outputTokens: 60,
    });
  });

  it("normalizes OpenAI's shape by subtracting the cached share", () => {
    expect(
      openai.readUsage({
        // 1020 total, of which 900 were cached — the same call as above.
        input_tokens: 1020,
        input_tokens_details: { cached_tokens: 900 },
        output_tokens: 60,
      }),
    ).toEqual({
      uncachedInputTokens: 120,
      cacheReadTokens: 900,
      // Automatic caching has no write charge. Zero because it is zero.
      cacheWriteTokens: 0,
      outputTokens: 60,
    });
  });

  it("treats a missing usage block as zero rather than NaN", () => {
    expect(anthropic.readUsage({})).toEqual({
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
    expect(openai.readUsage({})).toEqual({
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
  });

  it("never reports negative input, whatever the provider says", () => {
    const usage = openai.readUsage({
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 99 },
    });
    expect(usage.uncachedInputTokens).toBe(0);
  });
});

describe("error classification", () => {
  // A plain Error — a socket that closed, a DNS failure — is not an SDK error
  // and has no status. It is still an outage from where the caller stands.
  it("treats an error with no status as an outage, on both providers", () => {
    for (const classify of [anthropic.classifyError, openai.classifyError]) {
      const failure = classify(new Error("socket hang up"));
      expect(failure.kind).toBe("unavailable");
      expect(failure.retryable).toBe(true);
    }
  });

  /**
   * A 429, on both providers, with the provider's own `retry-after`.
   *
   * `retryAfterMs` is the number §5's queue will eventually pace itself by, so
   * seconds arriving as milliseconds — or a missing header arriving as `NaN`,
   * or as zero — is a scheduler that retries immediately, forever, into a rate
   * limit.
   */
  it("reads a rate limit and its retry-after, on both providers", () => {
    for (const { classify, Ctor } of [
      { classify: anthropic.classifyError, Ctor: Anthropic.APIError },
      { classify: openai.classifyError, Ctor: OpenAI.APIError },
    ]) {
      const error = new Ctor(429, undefined, "slow down", new Headers({ "retry-after": "30" }));
      const failure = classify(error);

      expect(failure.kind).toBe("rate-limited");
      expect(failure.retryable).toBe(true);
      expect(failure).toMatchObject({ retryAfterMs: 30_000 });
    }
  });

  it("reports a missing retry-after as null, never as zero or NaN", () => {
    const error = new Anthropic.APIError(429, undefined, "slow down", new Headers());
    expect(anthropic.classifyError(error)).toMatchObject({ retryAfterMs: null });
  });

  it("treats a 5xx as an outage on both providers", () => {
    for (const { classify, Ctor } of [
      { classify: anthropic.classifyError, Ctor: Anthropic.APIError },
      { classify: openai.classifyError, Ctor: OpenAI.APIError },
    ]) {
      const failure = classify(new Ctor(503, undefined, "upstream", new Headers()));
      expect(failure.kind).toBe("unavailable");
      expect(failure.retryable).toBe(true);
    }
  });

  /**
   * The half the original test named and never checked.
   *
   * A 4xx marked retryable is a caller that queues a request with a bad key and
   * re-sends it forever — §5's queue reads nothing but this flag.
   */
  it("says not retryable for a 4xx, on both providers", () => {
    for (const { classify, Ctor } of [
      { classify: anthropic.classifyError, Ctor: Anthropic.APIError },
      { classify: openai.classifyError, Ctor: OpenAI.APIError },
    ]) {
      for (const status of [400, 401, 403, 404]) {
        const failure = classify(new Ctor(status, undefined, "no", new Headers()));
        expect(failure.kind, `status ${status}`).toBe("rejected");
        expect(failure.retryable, `status ${status}`).toBe(false);
      }
    }
  });

  it("never puts a key in a failure, even when the provider quotes one back", () => {
    const key = "sk-ant-do-not-log-me-0000";
    for (const { classify, Ctor } of [
      { classify: anthropic.classifyError, Ctor: Anthropic.APIError },
      { classify: openai.classifyError, Ctor: OpenAI.APIError },
    ]) {
      // The adapter builds its client from the key; nothing it constructs may
      // carry one. A provider echoing the request is its own business — this
      // asserts we add nothing.
      const failure = classify(new Ctor(401, undefined, "invalid x-api-key", new Headers()));
      expect(JSON.stringify(failure)).not.toContain(key);
    }
  });
});

describe("what the adapters agree on", () => {
  it("maps §12's three tiers to a model each, with no overlap", () => {
    for (const map of [ANTHROPIC_MODELS, OPENAI_MODELS]) {
      const models = [map.routine, map.analysis, map.generation];
      expect(new Set(models).size).toBe(3);
      expect(models.every((model) => model.length > 0)).toBe(true);
    }
  });

  // Not a routing rule — a documented fact that makes a zero cache-hit rate on
  // the routine tier an explanation rather than a bug report.
  it("records Haiku's cache minimum as the largest of the three", () => {
    const minimums = anthropic.CACHE_MINIMUM_TOKENS;
    expect(minimums[ANTHROPIC_MODELS.routine]).toBe(4096);
    expect(minimums[ANTHROPIC_MODELS.analysis]).toBe(1024);
    expect(minimums[ANTHROPIC_MODELS.generation]).toBe(512);
    expect(openai.CACHE_MINIMUM_TOKENS).toBe(1024);
  });
});

/**
 * §5's pin, second half — T2.7.
 *
 * The ticket that produced this went looking for a sampling temperature behind
 * the scoring wobble. There isn't one to find: `claude-sonnet-5` rejects
 * `temperature`, `top_p` and `top_k` with a 400, and the seam was already
 * running at the only sampling setting the model accepts. `effort` is what
 * replaced them, and these assertions are what stop it drifting back onto a
 * caller's request or onto the tier-routed path.
 */
describe("the scorer's effort pin", () => {
  const pinned: ResolvedRequest = { ...request, effort: SCORER_EFFORT };

  it("rides in the output_config Claude already had", () => {
    const body = anthropic.anthropicBody(pinned);

    expect(body.output_config).toMatchObject({ effort: SCORER_EFFORT });
    // And the schema it shares that object with is untouched.
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("is spelled reasoning.effort on OpenAI, which is the same pin", () => {
    // The seam absorbs the difference; nothing above the adapter knows there
    // was one. Field shape from the installed SDK's `Shared.Reasoning`.
    expect(openai.openaiBody(pinned)).toMatchObject({ reasoning: { effort: SCORER_EFFORT } });
  });

  it("is absent, not null, when the path is tier-routed", () => {
    // `null` has to mean "send nothing" rather than "send null" — a provider
    // reading an explicit null would not give us its default.
    expect(anthropic.anthropicBody(request).output_config).not.toHaveProperty("effort");
    expect(openai.openaiBody(request)).not.toHaveProperty("reasoning");
  });

  it("sends no sampling parameter on either provider, at any effort", () => {
    // The load-bearing one. `temperature: 0` on the pinned model is a 400 —
    // "`temperature` is deprecated for this model" — so a well-meaning later
    // edit that adds one to buy determinism breaks every scoring run instead.
    for (const body of [
      anthropic.anthropicBody(pinned) as Record<string, unknown>,
      anthropic.anthropicBody(request) as Record<string, unknown>,
      openai.openaiBody(pinned) as Record<string, unknown>,
      openai.openaiBody(request) as Record<string, unknown>,
    ]) {
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
      expect(body).not.toHaveProperty("top_k");
    }
  });
});
