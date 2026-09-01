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
 * The reasoning effort the pinned scorer runs at — §5's pin, second half.
 *
 * **There is no sampling parameter to pin, and that is the finding this
 * constant records.** T2.7 went looking for a loose temperature behind the
 * scoring wobble and found that the models this project pins to do not accept
 * one. Probed against the live API on `claude-sonnet-5` with a real key:
 * `temperature: 0` and `temperature: 0.2` both return 400 —
 * "`temperature` is deprecated for this model" — as do `top_p: 0.1` and
 * `top_k: 1`. Only `temperature: 1.0`, the default, is accepted, for backwards
 * compatibility. Anthropic's reference says the same of everything released
 * after Opus 4.6. So the seam sending nothing was already running at the only
 * sampling setting the model has, and "pin the temperature" is not an available
 * move on this model family.
 *
 * `effort` is what replaced it: how much the model thinks, `low` through `max`,
 * GA and defaulting to `high`. It is not a sampling control and it buys no
 * determinism — nothing on this model does — but it is the one configuration
 * surface left that changes how a judgment check is answered, so it belongs
 * with the model pin for §5's reason: "the scoring model is pinned per
 * workspace and never juggled". A provider that moved its own default would
 * otherwise move every score in the product silently, which is precisely the
 * wobble-without-explanation §5 forbids.
 *
 * **Pinned at `high`, today's default, because the rungs above it do not fit.**
 * T2.7 tried to measure `xhigh` and `max` and could run neither. Effort is
 * charged against the same `max_tokens` as the answer, so both spend the
 * scorer's whole 16,000-token ceiling thinking and return truncated JSON —
 * `schema_invalid`, output exactly 16,000, three attempts for three.
 *
 * **The blocker is the wall clock, not the adapter.** The SDK's "Streaming is
 * required for operations that may take longer than 10 minutes" fires only
 * where no explicit timeout is set; probed with one, non-streaming accepts
 * 24,000 and 64,000 without complaint. Anthropic puts `xhigh` at 64,000
 * max_tokens, which by the SDK's own formula is a half-hour non-streaming call
 * — and §5's meter re-scores on every edit. A scorer that answers in thirty
 * minutes is not a lever this product can pull, whatever the adapter does.
 * Pinning the current default is still worth the line: it is what stops the
 * number moving on the day the provider's default does.
 *
 * A **constant, not a column.** `scorer_model` is a stored column because it is
 * captured per workspace when a key is set and must not move when this file
 * moves. No workspace has ever needed a different effort, §5 names no
 * per-workspace choice, and AGENTS.md rules that an abstraction the spec does
 * not name is speculation. A column is one migration away the day that changes.
 *
 * **Not in `PROTOCOL_VERSION`.** This changes verdicts and leaves §5's cache key
 * untouched — see docs/build-log.md, which files it beside migration 0010's
 * renderer gap because it is the same hole.
 *
 *   https://platform.claude.com/docs/en/api/messages
 */
export type ScorerEffort = "low" | "medium" | "high" | "xhigh" | "max";

export const SCORER_EFFORT: ScorerEffort = "high";

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
