import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { featurePrdPack, packConditions } from "@/packs";

import { PROTOCOL_VERSION } from "./prompt";
import type { AiResult } from "@/lib/ai";

import type { ScorerAnswer } from "./schema";

/**
 * The orchestration — §5's cache, and §5's failed run that writes nothing.
 *
 * Everything below the seam is a fake, because what is under test is the shape
 * of the run rather than what a model says: how many times a provider is
 * called, and what reaches the database when one fails.
 */

const db = vi.hoisted(() => ({
  artifact: null as Record<string, unknown> | null,
  storedRun: null as Record<string, unknown> | null,
  storedResults: [] as Record<string, unknown>[],
  gaps: [] as { id: string; checkId: string; disposition: string }[],
  writes: [] as Record<string, unknown>[],
  retries: [] as { artifactId: string; at: Date }[],
  lookups: [] as unknown[][],
  writeError: null as Error | null,
}));

const ai = vi.hoisted(() => ({
  calls: [] as { purpose: string; context: string; input: string }[],
  reply: null as unknown,
}));

vi.mock("@/db/queries/scoring", () => ({
  readScorableArtifact: async () => db.artifact,
  findRunForVersion: async (...args: unknown[]) => {
    db.lookups.push(args);
    return db.storedRun;
  },
  readRunResults: async () => db.storedResults,
  readGapsForItem: async () => db.gaps,
  writeRun: async (run: Record<string, unknown>) => {
    if (db.writeError) throw db.writeError;
    db.writes.push(run);
    return "run-1";
  },
  scheduleRetry: async (_workspaceId: string, artifactId: string, at: Date) => {
    db.retries.push({ artifactId, at });
  },
}));

vi.mock("@/lib/ai", () => ({
  runScorer: async (
    _context: unknown,
    request: { purpose: string; context: string; input: string },
  ) => {
    ai.calls.push({ purpose: request.purpose, context: request.context, input: request.input });
    return ai.reply as AiResult<ScorerAnswer>;
  },
}));

const { scoreArtifact } = await import("./run");

const ARTIFACT_TEXT = "# Ghost mode\n\nWHEN the member leaves the venue THE SYSTEM SHALL stop.";

/** An answer where every check passes, so a test can look at the run's shape. */
function passingAnswer(): ScorerAnswer {
  const results: ScorerAnswer["results"] = [
    ...featurePrdPack.checks,
    ...featurePrdPack.layers.flatMap((layer) => layer.checks),
  ].map((check) => ({
    checkId: check.id,
    passed: true,
    requirementId: "",
    quote: "",
    note: "",
  }));

  return {
    conditions: Object.fromEntries(packConditions(featurePrdPack).map((c) => [c.id, false])),
    results,
  };
}

/** Replaces one check's verdict in place, leaving the rest passing. */
function withVerdict(answer: ScorerAnswer, verdict: ScorerAnswer["results"][number]): ScorerAnswer {
  return {
    conditions: answer.conditions,
    results: answer.results.map((entry) => (entry.checkId === verdict.checkId ? verdict : entry)),
  };
}

const INPUT = {
  workspaceId: "w1",
  artifactId: "a1",
  actor: { kind: "agent", name: "scorer" } as const,
};

beforeEach(() => {
  db.artifact = {
    artifactId: "a1",
    itemId: "i1",
    productId: "p1",
    kind: "prd",
    versionId: "v1",
    versionNo: 1,
    content: { body: ARTIFACT_TEXT },
  };
  db.storedRun = null;
  db.storedResults = [];
  db.gaps = [];
  db.writes = [];
  db.retries = [];
  db.lookups = [];
  db.writeError = null;
  ai.calls = [];
  ai.reply = {
    ok: true,
    value: passingAnswer(),
    provider: "anthropic",
    model: "pinned-model",
    tier: "analysis",
    usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
    escalatedFrom: null,
  };
});

describe("scoreArtifact", () => {
  it("scores an artifact in one call and writes one run", async () => {
    const result = await scoreArtifact(INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One call for nineteen checks. Nineteen calls would be nineteen copies of
    // the same rubric prefix, which is what §12 structures caching to avoid.
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.purpose).toBe("score");
    expect(db.writes).toHaveLength(1);
    expect(result.cached).toBe(false);
  });

  it("sends the rubric as context and the artifact as input", async () => {
    await scoreArtifact(INPUT);

    // §12's cache split: the stable prefix is separable from the part that
    // changes, or there is nothing for a provider to cache.
    expect(ai.calls[0]!.context).toContain(featurePrdPack.version);
    expect(ai.calls[0]!.input).toBe(ARTIFACT_TEXT);
    expect(ai.calls[0]!.context).not.toContain("Ghost mode");
  });

  it("keys the cache on the protocol version, and stamps it on the run", async () => {
    // The protocol is the other half of the prompt, and editing it changes
    // verdicts. If it were missing from the lookup, an edit would keep serving
    // the score the old question produced; if it were missing from the row,
    // there would be no way to find the runs an edit made stale.
    await scoreArtifact(INPUT);

    expect(db.lookups[0]).toEqual([
      "w1",
      "v1",
      featurePrdPack.id,
      featurePrdPack.version,
      PROTOCOL_VERSION,
    ]);
    expect(db.writes[0]).toMatchObject({ protocolVersion: PROTOCOL_VERSION });
  });

  it("stamps the model that ran, not the pack's idea of one", async () => {
    await scoreArtifact(INPUT);

    expect(db.writes[0]).toMatchObject({
      provider: "anthropic",
      model: "pinned-model",
      packId: featurePrdPack.id,
      packVersion: featurePrdPack.version,
      versionId: "v1",
    });
  });

  describe("§5's cache", () => {
    it("returns the stored run and calls no provider", async () => {
      db.storedRun = {
        id: "run-0",
        packId: featurePrdPack.id,
        packVersion: featurePrdPack.version,
        protocolVersion: "1.0.0",
        provider: "anthropic",
        model: "pinned-model",
        conditionsMet: [],
        earned: 94,
        denominator: 94,
        scoredAt: "2026-08-26T00:00:00.000Z",
      };
      db.storedResults = [
        {
          checkId: "prd-19",
          tag: "must",
          points: 8,
          passed: false,
          requirementId: "GM-2",
          quote: "WHEN the member leaves the venue THE SYSTEM SHALL stop.",
          note: "Two readings.",
          evidence: "",
        },
      ];

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.cached).toBe(true);
      // The assertion the whole cache exists for: asking twice cannot produce
      // two different numbers, because the second ask never happens.
      expect(ai.calls).toHaveLength(0);
      expect(db.writes).toHaveLength(0);
      expect(result.run.score).toBe(100);
      expect(result.run.results[0]).toEqual({
        checkId: "prd-19",
        passed: false,
        evidence: "GM-2: 'WHEN the member leaves the venue THE SYSTEM SHALL stop.' — Two readings.",
      });
    });

    it("serves a cached run in pack order, not the order the rows came back", async () => {
      // `check_id` sorts `prd-10` before `prd-2`, so a run written in pack order
      // would read back reshuffled — and §8's meter expansion is a list a person
      // compares against the last run. The scrambling here is what the database
      // would hand back; the assertion is the order a reader needs.
      db.storedRun = {
        id: "run-0",
        packId: featurePrdPack.id,
        packVersion: featurePrdPack.version,
        protocolVersion: "1.0.0",
        provider: "anthropic",
        model: "pinned-model",
        conditionsMet: [],
        earned: 88,
        denominator: 88,
        scoredAt: "2026-08-26T00:00:00.000Z",
      };
      db.storedResults = ["prd-19", "prd-10", "prd-2"].map((checkId) => ({
        checkId,
        tag: "must",
        points: 5,
        passed: true,
        requirementId: null,
        quote: null,
        note: null,
        evidence: "",
      }));

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.run.results.map((entry) => entry.checkId)).toEqual([
        "prd-2",
        "prd-10",
        "prd-19",
      ]);
    });

    it("scores again when the artifact has a new version", async () => {
      // The cache is keyed on the version, and a version is immutable. A new
      // version is new content, so it is a new run rather than a stale hit.
      db.storedRun = null;
      await scoreArtifact(INPUT);

      expect(ai.calls).toHaveLength(1);
      expect(db.writes).toHaveLength(1);
    });
  });

  describe("§5's failed run", () => {
    it("writes nothing and queues a retry when the provider is down", async () => {
      ai.reply = {
        ok: false,
        failure: { kind: "unavailable", retryable: true, detail: "503" },
      };

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      // No run row, no partial gaps, no half-scored artifact.
      expect(db.writes).toHaveLength(0);
      expect(db.retries).toHaveLength(1);
      expect(db.retries[0]!.artifactId).toBe("a1");
      expect(result.reason).toBe("provider");
    });

    it("uses the provider's own retry-after when it sent one", async () => {
      ai.reply = {
        ok: false,
        failure: {
          kind: "rate-limited",
          retryable: true,
          detail: "429",
          retryAfterMs: 90_000,
        },
      };

      const before = Date.now();
      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok || result.reason !== "provider") return;

      expect(result.nextAttemptAt!.getTime() - before).toBeGreaterThanOrEqual(90_000);
      expect(result.nextAttemptAt!.getTime() - before).toBeLessThan(120_000);
    });

    it("does not queue a failure that retrying cannot fix", async () => {
      // §5 queues outages. A pinned model that answered off-schema is a quality
      // signal §15 reads out of the meter row the seam already wrote, and
      // asking the same model again is the cost-driven retry §5 forbids.
      ai.reply = {
        ok: false,
        failure: { kind: "schema-invalid", retryable: false, detail: "missing prd-10" },
      };

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      expect(db.writes).toHaveLength(0);
      expect(db.retries).toHaveLength(0);
    });

    it("returns a typed failure when the transaction refuses the run", async () => {
      // The four failure shapes are what `score-smoke` prints and what T2.4's
      // surface will read. An exception escaping past all of them is the one
      // outcome none of them describes — and it would escape *after* the
      // provider call was made and billed.
      db.writeError = Object.assign(new Error("gap_evidence_len"), { code: "23514" });

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("write");
      expect(result.detail).toContain("gap_evidence_len");
      // Not queued: the same verdicts written the same way fail the same way,
      // and §5's queue is for outages.
      expect(db.retries).toHaveLength(0);
    });

    it("writes nothing when a quote turns out to be invented", async () => {
      const answer = withVerdict(passingAnswer(), {
        checkId: "prd-19",
        passed: false,
        requirementId: "",
        quote: "A sentence this artifact never contained.",
        note: "Ambiguous.",
      });
      ai.reply = {
        ok: true,
        value: answer,
        provider: "anthropic",
        model: "pinned-model",
        tier: "analysis",
        usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
        escalatedFrom: null,
      };

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("answer");
      // An answer that cannot be trusted is not scored down, it is not scored.
      expect(db.writes).toHaveLength(0);
      expect(db.retries).toHaveLength(0);
    });
  });

  describe("what cannot be scored", () => {
    it("refuses an artifact with no versions", async () => {
      db.artifact = null;

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-scorable");
      expect(ai.calls).toHaveLength(0);
    });

    it("refuses an artifact kind no pack ships for", async () => {
      db.artifact = { ...db.artifact!, kind: "design_package" };

      const result = await scoreArtifact(INPUT);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-scorable");
      expect(ai.calls).toHaveLength(0);
    });
  });

  it("hands the write path the checks whose evidence was clipped", async () => {
    const answer = withVerdict(passingAnswer(), {
      checkId: "prd-19",
      passed: false,
      requirementId: "",
      quote: "",
      note: "n".repeat(4000),
    });
    ai.reply = {
      ok: true,
      value: answer,
      provider: "anthropic",
      model: "pinned-model",
      tier: "analysis",
      usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
      escalatedFrom: null,
    };

    const result = await scoreArtifact(INPUT);

    // The run lands — a long note is compliance, not corruption — and the
    // ledger is told which check was shortened.
    expect(result.ok).toBe(true);
    expect(db.writes[0]).toMatchObject({ clippedChecks: ["prd-19"] });
  });

  it("passes reconciled gap writes to the one transaction that stores them", async () => {
    const answer = withVerdict(passingAnswer(), {
      checkId: "prd-19",
      passed: false,
      requirementId: "GM-2",
      quote: "WHEN the member leaves the venue THE SYSTEM SHALL stop.",
      note: "Leaves how?",
    });
    ai.reply = {
      ok: true,
      value: answer,
      provider: "anthropic",
      model: "pinned-model",
      tier: "analysis",
      usage: { uncachedInputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
      escalatedFrom: null,
    };
    db.gaps = [{ id: "g-old", checkId: "prd-11", disposition: "open" }];

    await scoreArtifact(INPUT);

    // Pack order, which is what keeps a per-check list a person reads from
    // reshuffling between runs.
    expect(db.writes[0]!.gapWrites).toEqual([
      { kind: "close", gapId: "g-old", checkId: "prd-11", reason: "passed" },
      {
        kind: "insert",
        checkId: "prd-19",
        tag: "must",
        evidence: "GM-2: 'WHEN the member leaves the venue THE SYSTEM SHALL stop.' — Leaves how?",
      },
    ]);
  });
});
