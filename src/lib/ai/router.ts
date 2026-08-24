import type { ProviderId, Tier } from "./types";

/**
 * §12's tier map, and §5's pin.
 *
 * "Three intra-provider tiers — routine (intake classification, applicability,
 * translation) on the cheap model; analysis (scoring, evidence extraction) on
 * mid; generation (drafts, questions, patches) on top. No cross-provider
 * juggling. The **scorer is pinned** and never moved for cost."
 *
 * Model IDs read from each provider's own documentation on 2026-08-24, not from
 * memory: a guessed model string fails at runtime rather than at build, on a
 * call a user is waiting for.
 *
 *   https://platform.claude.com/docs/en/about-claude/models/overview
 *   https://developers.openai.com/api/docs/models
 *
 * **The pin is not enforced here, and that is the design.** There is no
 * function in this file — or anywhere else — that takes a pinned model and a
 * fallback, and the scoring entry point in `index.ts` has no tier parameter to
 * pass. A cost path cannot reach the pinned model because no such path is
 * expressible, which is a stronger guarantee than a rule about one.
 */

export type TierMap = Readonly<Record<Tier, string>>;

/** Claude. Haiku is the cheap rung, Sonnet the mid, Opus the top. */
export const ANTHROPIC_MODELS: TierMap = {
  routine: "claude-haiku-4-5-20251001",
  analysis: "claude-sonnet-5",
  generation: "claude-opus-5",
};

/** GPT-5.6, in the same three rungs. */
export const OPENAI_MODELS: TierMap = {
  routine: "gpt-5.6-luna",
  analysis: "gpt-5.6-terra",
  generation: "gpt-5.6-sol",
};

export const TIER_MAPS: Readonly<Record<ProviderId, TierMap>> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
};

export function modelFor(provider: ProviderId, tier: Tier): string {
  return TIER_MAPS[provider][tier];
}

/**
 * The model a workspace's scorer pins to when its key is set.
 *
 * §12 puts scoring and evidence extraction on the analysis tier, so the pin
 * starts there — but it is copied into `workspace_ai_credential.scorer_model`
 * at that moment and read from the row forever after. That is the difference
 * between a pin and a lookup: a lookup would move the day this file moved, and
 * §5 requires that "numbers never wobble without explanation".
 */
export function initialScorerModel(provider: ProviderId): string {
  return modelFor(provider, "analysis");
}

/**
 * §12's one escalation: "a routine-tier output that fails schema validation
 * retries once on mid — robustness, not optimization."
 */
export const ESCALATES_TO = "analysis" satisfies Tier;

/**
 * Whether a call may escalate at all — and a narrowing, so the seam cannot
 * escalate anything else by accident.
 *
 * Analysis has nowhere useful to go, generation has nothing above it, and a
 * scoring call never reaches this question because it carries no tier to ask
 * about.
 */
export function canEscalate(tier: Tier): tier is "routine" {
  return tier === "routine";
}
