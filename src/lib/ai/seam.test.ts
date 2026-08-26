import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

/** Every meter row the seam wrote, in order. */
const recorded = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

/** The credential the seam will find, and the reply script each call gets. */
const stub = vi.hoisted(() => ({
  credential: null as { provider: string; apiKey: string; scorerModel: string } | null,
  replies: [] as unknown[],
  asked: [] as { model: string; purpose: string }[],
  recordThrows: false,
}));

vi.mock("@/db/queries/ai-credential", () => ({
  readApiKey: async () => stub.credential,
}));

vi.mock("@/db/queries/ai-usage", () => ({
  recordUsage: async (entry: Record<string, unknown>) => {
    if (stub.recordThrows) throw new Error("meter unavailable");
    recorded.rows.push(entry);
  },
}));

/**
 * Both adapters, replaced by one scripted fake.
 *
 * The real ones build an SDK client from the key, so leaving them in place
 * would put this test on the network. `modelFor` still comes from the real tier
 * maps, which is what makes the pinned-model assertions mean anything.
 */
vi.mock("@/lib/ai/anthropic", async () => {
  const { ANTHROPIC_MODELS } = await import("@/lib/ai/router");
  return {
    createAnthropicProvider: () => ({
      id: "anthropic",
      modelFor: (tier: "routine" | "analysis" | "generation") => ANTHROPIC_MODELS[tier],
      send: async (request: { model: string; purpose: string }) => {
        stub.asked.push({ model: request.model, purpose: request.purpose });
        return stub.replies.shift();
      },
    }),
  };
});

vi.mock("@/lib/ai/openai", async () => {
  const { OPENAI_MODELS } = await import("@/lib/ai/router");
  return {
    createOpenAiProvider: () => ({
      id: "openai",
      modelFor: (tier: "routine" | "analysis" | "generation") => OPENAI_MODELS[tier],
      send: async (request: { model: string; purpose: string }) => {
        stub.asked.push({ model: request.model, purpose: request.purpose });
        return stub.replies.shift();
      },
    }),
  };
});

const { runGeneration, runRoutine, runScorer } = await import("@/lib/ai");
const { ANTHROPIC_MODELS } = await import("@/lib/ai/router");

/**
 * The metering seam, against rows the writer actually produces.
 *
 * Everything below asserts on what `recordUsage` was handed, not on a row shape
 * invented for the test. Two defects lived here for a commit precisely because
 * `meter.ts`'s arithmetic was tested against hand-built rows the failure path
 * never writes: a failed scoring call was metered against a tier-map lookup
 * instead of the pinned model, and a failed escalation lost `escalatedFrom` and
 * with it every trace of itself in §15's early-warning light.
 */

const KEY = "sk-ant-do-not-log-me-0000";

const Answer = z.object({ verdict: z.string() });

const usage = (n: number) => ({
  uncachedInputTokens: n,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: n,
});

const ok = (text: string, n = 10) => ({ ok: true, text, usage: usage(n) });
const failed = (failure: { kind: string; retryable: boolean; detail: string }, n = 0) => ({
  ok: false,
  failure,
  usage: usage(n),
});

const context = {
  workspaceId: "ws-1",
  productId: null,
  actor: { kind: "human" as const, userId: "user-1" },
};

const request = {
  purpose: "classify" as const,
  context: "the rubric",
  input: "the artifact",
  schema: Answer,
  maxTokens: 256,
};

const scoring = { ...request, purpose: "score" as const };

/** A pin that deliberately disagrees with today's tier map. */
const PINNED = "claude-sonnet-4-5-20250929";

beforeEach(() => {
  recorded.rows = [];
  stub.replies = [];
  stub.asked = [];
  stub.recordThrows = false;
  stub.credential = { provider: "anthropic", apiKey: KEY, scorerModel: PINNED };
});

const row = () => recorded.rows[0]!;

describe("a successful routine call", () => {
  it("meters the model that ran, with the provider's own token counts", async () => {
    stub.replies = [ok('{"verdict":"yes"}', 40)];
    const result = await runRoutine(context, request);

    expect(result.ok).toBe(true);
    expect(recorded.rows).toHaveLength(1);
    expect(row()).toMatchObject({
      workspaceId: "ws-1",
      provider: "anthropic",
      model: ANTHROPIC_MODELS.routine,
      tier: "routine",
      purpose: "classify",
      outcome: "ok",
      escalatedFrom: null,
      rateCard: "anthropic-2026-08",
      actor: { kind: "human", userId: "user-1" },
      usage: usage(40),
    });
  });

  it("records a latency the call actually took", async () => {
    stub.replies = [ok('{"verdict":"yes"}')];
    await runRoutine(context, request);
    expect(row().latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("a call that failed", () => {
  /**
   * This is the pair of rows the live smoke run produced before a key was in
   * place: `rejected`, zero tokens, a real latency. Nothing asserted it then.
   */
  it("still writes a row, with the outcome and no tokens billed", async () => {
    stub.replies = [failed({ kind: "rejected", retryable: false, detail: "401" })];
    const result = await runRoutine(context, request);

    expect(result.ok).toBe(false);
    expect(recorded.rows).toHaveLength(1);
    expect(row()).toMatchObject({
      outcome: "rejected",
      model: ANTHROPIC_MODELS.routine,
      tier: "routine",
      usage: usage(0),
      escalatedFrom: null,
    });
  });

  it("bills the tokens an outage burned before it failed", async () => {
    stub.replies = [failed({ kind: "unavailable", retryable: true, detail: "503" }, 300)];
    await runRoutine(context, request);

    expect(row()).toMatchObject({ outcome: "unavailable", usage: usage(300) });
  });

  it("maps each failure kind onto its own outcome", async () => {
    for (const [kind, outcome] of [
      ["unavailable", "unavailable"],
      ["rate-limited", "rate_limited"],
      ["refused", "refused"],
      ["rejected", "rejected"],
    ] as const) {
      recorded.rows = [];
      stub.replies = [failed({ kind, retryable: false, detail: "x" })];
      await runRoutine(context, request);
      expect(row().outcome).toBe(outcome);
    }
  });
});

describe("an escalated call", () => {
  it("meters the model it ended on and remembers where it began", async () => {
    stub.replies = [ok("not json"), ok('{"verdict":"yes"}', 25)];
    const result = await runRoutine(context, request);

    expect(result.ok).toBe(true);
    expect(row()).toMatchObject({
      model: ANTHROPIC_MODELS.analysis,
      tier: "analysis",
      escalatedFrom: "routine",
      outcome: "ok",
    });
    // Both attempts are billed, because both happened.
    expect(row().usage).toEqual(usage(35));
  });

  /**
   * The regression that matters most on this path.
   *
   * A routine call the cheap model could not answer *and* the mid model could
   * not answer either is the strongest evidence §15's early-warning light
   * exists to surface. Written with `escalatedFrom: null` it counts in neither
   * half of the rate, so the light dims exactly when quality is worst.
   */
  it("keeps escalatedFrom when the escalation itself failed", async () => {
    stub.replies = [ok("not json"), ok("still not json")];
    const result = await runRoutine(context, request);

    expect(result.ok).toBe(false);
    expect(row()).toMatchObject({
      model: ANTHROPIC_MODELS.analysis,
      tier: "analysis",
      escalatedFrom: "routine",
      outcome: "schema_invalid",
    });
  });

  it("counts that failed escalation in §15's rate", async () => {
    stub.replies = [ok("not json"), ok("still not json")];
    await runRoutine(context, request);

    const { escalationRate } = await import("@/lib/ai/meter");
    // The row as written, fed to the arithmetic as written. Neither side is a
    // shape invented for the test.
    const rate = escalationRate([
      {
        tier: row().tier as "analysis",
        model: row().model as string,
        rateCard: row().rateCard as string,
        actorUserId: "user-1",
        escalatedFrom: row().escalatedFrom as "routine",
        usage: usage(0),
      },
    ]);

    expect(rate).toEqual({ escalated: 1, routine: 1, rate: 1 });
  });
});

describe("the pinned scorer", () => {
  it("meters the pinned model on success, not the tier map's", async () => {
    stub.replies = [ok('{"verdict":"pass"}')];
    await runScorer(context, scoring);

    expect(stub.asked[0]?.model).toBe(PINNED);
    expect(row()).toMatchObject({ model: PINNED, tier: "analysis", purpose: "score" });
    expect(row().model).not.toBe(ANTHROPIC_MODELS.analysis);
  });

  /**
   * §5 stamps every scoring run with the model that produced it, and spend is
   * priced from that column. A failed scoring call spent tokens on the *pinned*
   * model; naming the tier map's analysis model instead misattributes the
   * attempt and prices it at the wrong rate — invisibly, for exactly as long as
   * the pin happens to equal the map.
   */
  it("meters the pinned model on failure too", async () => {
    stub.replies = [failed({ kind: "unavailable", retryable: true, detail: "503" }, 500)];
    await runScorer(context, scoring);

    expect(row()).toMatchObject({
      model: PINNED,
      tier: "analysis",
      purpose: "score",
      outcome: "unavailable",
      escalatedFrom: null,
      usage: usage(500),
    });
    expect(row().model).not.toBe(ANTHROPIC_MODELS.analysis);
  });

  it("does not escalate, so it writes exactly one row and asks once", async () => {
    stub.replies = [ok("not json"), ok('{"verdict":"pass"}')];
    await runScorer(context, scoring);

    expect(stub.asked).toHaveLength(1);
    expect(recorded.rows).toHaveLength(1);
    expect(row()).toMatchObject({ model: PINNED, outcome: "schema_invalid" });
  });
});

describe("a workspace with no key", () => {
  it("fails without calling a provider and without metering", async () => {
    stub.credential = null;
    const result = await runRoutine(context, request);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("no-credential");
    expect(stub.asked).toHaveLength(0);
    // Nothing was spent, so there is nothing to meter.
    expect(recorded.rows).toHaveLength(0);
  });
});

describe("the key", () => {
  /**
   * The ticket's rule was that a key is never logged, never returned and never
   * put in a metering row. It was stated in three docstrings and asserted
   * nowhere.
   */
  it("never reaches a meter row", async () => {
    stub.replies = [ok('{"verdict":"yes"}')];
    await runRoutine(context, request);

    expect(JSON.stringify(recorded.rows)).not.toContain(KEY);
    expect(JSON.stringify(recorded.rows)).not.toContain(KEY.slice(0, 12));
  });

  it("never reaches a failure, even one whose provider quoted it back", async () => {
    // The worst realistic case: an upstream error echoing the request.
    stub.replies = [
      failed({ kind: "rejected", retryable: false, detail: `invalid x-api-key: ${KEY}` }),
    ];
    const result = await runRoutine(context, request);

    // The seam must not add the key. What a provider puts in its own message is
    // the provider's doing — but the row the meter keeps forever must be clean.
    expect(result.ok).toBe(false);
    expect(JSON.stringify(recorded.rows)).not.toContain(KEY);
  });

  it("never reaches a successful result", async () => {
    stub.replies = [ok('{"verdict":"yes"}')];
    const result = await runRoutine(context, request);

    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("when the meter itself is broken", () => {
  // The value is already in hand; throwing it away to report a bookkeeping
  // problem would trade what the user asked for against a number nobody is
  // watching in real time.
  it("still returns the answer", async () => {
    stub.recordThrows = true;
    stub.replies = [ok('{"verdict":"yes"}')];

    const result = await runRoutine(context, request);
    expect(result.ok && result.value).toEqual({ verdict: "yes" });
  });
});

describe("the generation tier", () => {
  it("meters the top model and never escalates", async () => {
    stub.replies = [ok("not json")];
    const result = await runGeneration(context, { ...request, purpose: "draft" });

    expect(result.ok).toBe(false);
    expect(stub.asked).toHaveLength(1);
    expect(row()).toMatchObject({
      model: ANTHROPIC_MODELS.generation,
      tier: "generation",
      purpose: "draft",
      escalatedFrom: null,
    });
  });
});
