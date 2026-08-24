import { describe, expect, it } from "vitest";

import { ANTHROPIC_MODELS, OPENAI_MODELS, TIER_MAPS } from "@/lib/ai/router";
import {
  ANTHROPIC_2026_08,
  OPENAI_2026_08,
  cardById,
  currentCard,
  ratesFor,
  spendOf,
} from "@/lib/ai/pricing";
import type { CallUsage } from "@/lib/ai/types";

/**
 * Spend, which §12's code node law makes arithmetic rather than a stored
 * number, and which §12's Owner-set cap makes worth getting right: a cap
 * computed from a wrong rate is a cap that does not hold.
 */

const MTOK = 1_000_000;

const tokens = (over: Partial<CallUsage> = {}): CallUsage => ({
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  ...over,
});

describe("rate cards", () => {
  it("prices every model the router can route to", () => {
    for (const [provider, map] of Object.entries(TIER_MAPS)) {
      const card = currentCard(provider as keyof typeof TIER_MAPS);
      for (const model of Object.values(map)) {
        expect(card.models[model], `${provider}/${model}`).toBeDefined();
      }
    }
  });

  // Nothing detects a stale card — no check can be written against a price page
  // — so the next best thing is that verifying one is a fetch rather than an
  // investigation. Recorded as an open question in docs/build-log.md.
  it("carries a source and a read date, so verifying is a fetch", () => {
    for (const card of [ANTHROPIC_2026_08, OPENAI_2026_08]) {
      expect(card.source).toMatch(/^https:\/\//);
      expect(card.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cardById(card.id)).toBe(card);
    }
  });
});

describe("what a call costs", () => {
  // One million input tokens on Haiku is $1.00, which the docs state plainly.
  // If this number moves, either a rate is wrong or the unit is.
  it("charges the published rate per million tokens", () => {
    const cost = spendOf(
      ANTHROPIC_2026_08,
      ANTHROPIC_MODELS.routine,
      tokens({ uncachedInputTokens: MTOK }),
    );
    expect(cost).toBe(1_000_000); // micro-dollars: $1.00
  });

  it("charges cache reads at a tenth and cache writes above base", () => {
    const model = ANTHROPIC_MODELS.generation; // $5 base
    expect(spendOf(ANTHROPIC_2026_08, model, tokens({ cacheReadTokens: MTOK }))).toBe(500_000);
    expect(spendOf(ANTHROPIC_2026_08, model, tokens({ cacheWriteTokens: MTOK }))).toBe(6_250_000);
  });

  it("adds the four components", () => {
    const cost = spendOf(
      ANTHROPIC_2026_08,
      ANTHROPIC_MODELS.analysis,
      tokens({ uncachedInputTokens: MTOK, cacheReadTokens: MTOK, outputTokens: MTOK }),
    );
    // $2 + $0.20 + $10
    expect(cost).toBe(12_200_000);
  });

  // A model with no rate is an unknown cost. Reporting it as free is the one
  // answer guaranteed to be wrong, and it would silently widen a spend cap.
  it("returns null for a model it cannot price", () => {
    expect(spendOf(ANTHROPIC_2026_08, "some-model-nobody-priced", tokens())).toBeNull();
  });
});

/**
 * OpenAI re-prices the **whole request** above 272k input tokens — 2× input,
 * 1.5× output — and Anthropic does not, since its 1M window bills at standard
 * rates end to end. Both facts are encoded; the comparison is a no-op on the
 * Anthropic card.
 */
describe("the long-context band", () => {
  const model = OPENAI_MODELS.analysis; // terra: $2 short, $4 long

  it("uses base rates at and below the threshold", () => {
    const rates = ratesFor(OPENAI_2026_08, model, tokens({ uncachedInputTokens: 272_000 }));
    expect(rates?.input).toBe(2_000_000);
  });

  it("re-prices the whole request one token above it", () => {
    const rates = ratesFor(OPENAI_2026_08, model, tokens({ uncachedInputTokens: 272_001 }));
    expect(rates?.input).toBe(4_000_000);
    expect(rates?.output).toBe(18_000_000);
  });

  // "Prompts with >272K input tokens" is the prompt, not the part that missed
  // the cache: tokens served from cache still had to be sent once.
  it("measures the threshold over the whole prompt, cached tokens included", () => {
    const split = tokens({ uncachedInputTokens: 200_000, cacheReadTokens: 100_000 });
    expect(ratesFor(OPENAI_2026_08, model, split)?.input).toBe(4_000_000);
  });

  it("charges the long band on a real long call", () => {
    const usage = tokens({ uncachedInputTokens: 300_000, outputTokens: 10_000 });
    // 300k × $4/MTok + 10k × $18/MTok = $1.20 + $0.18
    expect(spendOf(OPENAI_2026_08, model, usage)).toBe(1_380_000);
  });

  it("is a no-op on Anthropic, whose 1M window bills at standard rates", () => {
    const short = tokens({ uncachedInputTokens: 1_000 });
    const long = tokens({ uncachedInputTokens: 900_000 });
    const model = ANTHROPIC_MODELS.generation;

    expect(ratesFor(ANTHROPIC_2026_08, model, short)).toEqual(
      ratesFor(ANTHROPIC_2026_08, model, long),
    );
    expect(ANTHROPIC_2026_08.longContext).toBeUndefined();
  });
});
