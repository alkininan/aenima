import { describe, expect, it } from "vitest";
import { z } from "zod";

import { callAtTier, callPinned, jsonSchemaOf, validate } from "@/lib/ai/call";
import { ANTHROPIC_MODELS } from "@/lib/ai/router";
import type { CallUsage, Provider, ProviderResponse, ResolvedRequest } from "@/lib/ai/types";

/**
 * The seam, against a fake transport rather than the network.
 *
 * §12's escalation rule is the thing under test and it is exactly one sentence
 * long: "a routine-tier output that fails schema validation retries once on mid
 * — robustness, not optimization." One retry. On a schema failure. On the
 * routine tier. Every other combination has to stop at one attempt, and the
 * assertions below are mostly about the attempts that must *not* happen.
 */

const Answer = z.object({ verdict: z.string() });

const usage = (n: number): CallUsage => ({
  uncachedInputTokens: n,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: n,
});

/** A provider that replies from a script, and records what it was asked. */
function fakeProvider(replies: ProviderResponse[]) {
  const seen: ResolvedRequest[] = [];
  let next = 0;

  const provider: Provider = {
    id: "anthropic",
    modelFor: (tier) => ANTHROPIC_MODELS[tier],
    async send(request) {
      seen.push(request);
      const reply = replies[next];
      next += 1;
      if (!reply) throw new Error(`fake provider: no reply scripted for call ${next}`);
      return reply;
    },
  };

  return { provider, seen };
}

const ok = (text: string, tokens = 10): ProviderResponse => ({
  ok: true,
  text,
  usage: usage(tokens),
});

const request = {
  purpose: "classify" as const,
  context: "the stable prefix",
  input: "the changing part",
  schema: Answer,
  maxTokens: 256,
};

describe("validation", () => {
  it("turns valid JSON into a typed value", () => {
    expect(validate(Answer, '{"verdict":"yes"}')).toEqual({ ok: true, value: { verdict: "yes" } });
  });

  // Malformed JSON and well-formed JSON of the wrong shape are the same event:
  // the answer is not the thing that was asked for.
  it("rejects both malformed JSON and the wrong shape", () => {
    expect(validate(Answer, "not json at all").ok).toBe(false);
    expect(validate(Answer, '{"verdict":42}').ok).toBe(false);
    expect(validate(Answer, '{"other":"yes"}').ok).toBe(false);
  });

  // OpenAI's strict mode requires additionalProperties:false and every property
  // in `required`. If zod ever stopped producing that, every OpenAI call would
  // start failing at the API rather than here.
  it("produces a JSON Schema strict mode accepts", () => {
    const schema = jsonSchemaOf(Answer);
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["verdict"],
    });
  });
});

describe("a routine call", () => {
  it("returns the value and does not escalate when the answer is valid", async () => {
    const { provider, seen } = fakeProvider([ok('{"verdict":"yes"}')]);
    const result = await callAtTier(provider, "routine", request);

    expect(result.ok && result.value).toEqual({ verdict: "yes" });
    expect(result.ok && result.escalatedFrom).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.model).toBe(ANTHROPIC_MODELS.routine);
  });

  it("retries once on the analysis tier when the schema fails", async () => {
    const { provider, seen } = fakeProvider([ok("{{{ not json"), ok('{"verdict":"yes"}', 30)]);
    const result = await callAtTier(provider, "routine", request);

    expect(result.ok && result.value).toEqual({ verdict: "yes" });
    expect(result.ok && result.model).toBe(ANTHROPIC_MODELS.analysis);
    expect(result.ok && result.escalatedFrom).toBe("routine");
    expect(seen.map((call) => call.model)).toEqual([
      ANTHROPIC_MODELS.routine,
      ANTHROPIC_MODELS.analysis,
    ]);
    // Both attempts are billed, because both happened.
    expect(result.usage.outputTokens).toBe(40);
  });

  // The sentence says "retries once". Not twice, and not until it works.
  it("stops after the second failure and never tries a third time", async () => {
    const { provider, seen } = fakeProvider([ok("nope"), ok("still nope")]);
    const result = await callAtTier(provider, "routine", request);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("schema-invalid");
    expect(!result.ok && result.failure.retryable).toBe(false);
    expect(seen).toHaveLength(2);
  });

  // An outage is not a reason to spend more on a bigger model, and a refusal is
  // not a reason to ask the same question again.
  it("does not escalate an outage, a refusal or a rejection", async () => {
    for (const failure of [
      { kind: "unavailable", retryable: true, detail: "503" },
      { kind: "refused", retryable: false, detail: "declined" },
      { kind: "rejected", retryable: false, detail: "400" },
    ] as const) {
      const { provider, seen } = fakeProvider([{ ok: false, failure, usage: usage(0) }]);
      const result = await callAtTier(provider, "routine", request);

      expect(!result.ok && result.failure.kind).toBe(failure.kind);
      expect(seen).toHaveLength(1);
    }
  });

  it("never returns unvalidated text as a value", async () => {
    const { provider } = fakeProvider([ok('"just a string"'), ok('"still a string"')]);
    const result = await callAtTier(provider, "routine", request);
    expect(result.ok).toBe(false);
  });
});

describe("the tiers that cannot escalate", () => {
  it("does not retry a generation call — it is already the top", async () => {
    const { provider, seen } = fakeProvider([ok("nope")]);
    const result = await callAtTier(provider, "generation", request);

    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.model).toBe(ANTHROPIC_MODELS.generation);
  });

  it("does not retry an analysis call", async () => {
    const { provider, seen } = fakeProvider([ok("nope")]);
    await callAtTier(provider, "analysis", request);
    expect(seen).toHaveLength(1);
  });
});

describe("the pinned scorer", () => {
  const PINNED = "claude-sonnet-4-5-20250929";
  const scoring = { ...request, purpose: "score" as const };

  /**
   * §5: "the scoring model is pinned per workspace and never juggled for cost."
   *
   * The tier map here deliberately disagrees with the pin — this fake's
   * analysis tier is `claude-sonnet-5`, the pin is an older Sonnet. If routing
   * could reach the scorer, this is where it would show.
   */
  it("uses the pinned model, not the tier map's", async () => {
    const { provider, seen } = fakeProvider([ok('{"verdict":"pass"}')]);
    const result = await callPinned(provider, PINNED, scoring);

    expect(result.ok && result.model).toBe(PINNED);
    expect(seen[0]?.model).toBe(PINNED);
    expect(seen[0]?.model).not.toBe(ANTHROPIC_MODELS.analysis);
  });

  // The cost path is the escalation, and this is the assertion that it cannot
  // reach the pin: a schema failure here ends the call rather than moving it to
  // another model. A second attempt would also stamp the run with a model that
  // is not the pinned one, which §5 forbids twice over.
  it("does not escalate, retry or fall back on a schema failure", async () => {
    const { provider, seen } = fakeProvider([ok("nope"), ok('{"verdict":"pass"}')]);
    const result = await callPinned(provider, PINNED, scoring);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("schema-invalid");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.model).toBe(PINNED);
  });

  it("meters as analysis while running the pinned model", async () => {
    const { provider } = fakeProvider([ok('{"verdict":"pass"}')]);
    const result = await callPinned(provider, PINNED, scoring);

    expect(result.tier).toBe("analysis");
    expect(result.ok && result.model).toBe(PINNED);
  });

  it("has no tier to pass", () => {
    // @ts-expect-error — a scoring request cannot carry a tier, which is what
    // makes "never moved for cost" structural rather than a rule in a comment.
    const withTier: Parameters<typeof callPinned>[2] = { ...scoring, tier: "routine" };
    expect(withTier).toBeDefined();
  });
});

describe("the request that reaches a provider", () => {
  it("puts the stable prefix first and the changing part last", async () => {
    const { provider, seen } = fakeProvider([ok('{"verdict":"yes"}')]);
    await callAtTier(provider, "routine", request);

    expect(seen[0]?.context).toBe("the stable prefix");
    expect(seen[0]?.input).toBe("the changing part");
  });

  it("carries the schema and the caller's token ceiling", async () => {
    const { provider, seen } = fakeProvider([ok('{"verdict":"yes"}')]);
    await callAtTier(provider, "routine", request);

    expect(seen[0]?.jsonSchema).toMatchObject({ type: "object" });
    expect(seen[0]?.maxTokens).toBe(256);
  });
});
