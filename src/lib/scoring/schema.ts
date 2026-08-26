import { z } from "zod";

import { allChecks, packConditions } from "@/packs";
import type { SkillPack } from "@/packs";

/**
 * The shape of a scoring answer — product-spec.md §5 and §4, and the answer to
 * "how do you keep the model from skipping a check".
 *
 * **The shape is what two providers will actually accept, and both limits were
 * found by a real call rather than read off a page.** The schema that expresses
 * the law best is an object keyed by check id — one required property per
 * check, so a missing verdict is unrepresentable on the wire under OpenAI's
 * strict mode. Anthropic refuses that schema twice over:
 *
 * 1. "Schemas contains too many parameters with union types … limit: 16." A
 *    nullable field is a union, and three nullable fields across twenty checks
 *    is sixty of them. So absent is spelled `""` and nothing here is nullable.
 * 2. "The compiled grammar is too large, which would cause performance issues."
 *    Twenty checks times four properties is eighty distinct properties, and
 *    constrained decoding compiles a grammar over all of them.
 *
 * An array collapses that grammar to one element schema, and it is what §12's
 * one-call-per-run needs in order to fit at all. **The cost is that a short
 * array is now possible**, so the completeness law moves out of the schema and
 * into `readAnswer`, which refuses a run whose results miss any applicable
 * check. The rule is unchanged and the wall is one layer further in: a partial
 * answer is a failed run, and §5's failed run writes nothing.
 *
 * `minItems` would put half the guarantee back and is not available: OpenAI's
 * strict mode rejects a schema carrying keywords it does not support, so a
 * length constraint costs the other provider entirely.
 *
 * Nothing here is `.optional()` — that rule is untouched. Every property is
 * required, and absent is spelled rather than omitted.
 *
 * **Conditions are asked separately from verdicts** because §4 makes them a
 * different question. A condition decides which checks count; a verdict decides
 * whether a check that counts is satisfied. Collapsing them into a third
 * verdict value would let "does not apply" do the work of "passes", and the
 * denominator — which is arithmetic, and ours — would come back as a judgment.
 * There are three conditions rather than twenty, so this half stays an object
 * and keeps the guarantee the results half had to give up.
 */

/**
 * One check's answer.
 *
 * Absent is `""` rather than `null` — see the union limit above. Nothing
 * downstream sees the sentinel: `readAnswer` trims and turns empty into null,
 * and the columns that store these are nullable.
 */
export type Verdict = {
  /** Which check this is about. Validated against the pack, never trusted. */
  checkId: string;
  passed: boolean;
  /** The artifact's own label for the story the gap sits in (`MN-2`), or "". */
  requirementId: string;
  /** Verbatim from the artifact, or "" when the failure is an absence. */
  quote: string;
  /** The reading. Empty exactly when the check passed. */
  note: string;
};

export type ScorerAnswer = {
  /** Every condition the pack can be asked about, answered. */
  conditions: Record<string, boolean>;
  /** One entry per check in the pack. Completeness is `readAnswer`'s to hold. */
  results: Verdict[];
};

const verdictSchema = z.object({
  checkId: z.string(),
  passed: z.boolean(),
  requirementId: z.string(),
  quote: z.string(),
  note: z.string(),
});

/**
 * The schema for one pack's scoring call.
 *
 * Built per pack because the conditions half names them: a pack with a
 * condition the schema did not ask about would be a condition nobody answers,
 * and §4's denominator would renormalize on a default rather than a judgment.
 */
export function verdictSchemaFor(pack: SkillPack): z.ZodType<ScorerAnswer> {
  const conditions = Object.fromEntries(
    packConditions(pack).map((condition) => [condition.id, z.boolean()]),
  );

  return z.object({
    conditions: z.object(conditions),
    results: z.array(verdictSchema),
  }) as unknown as z.ZodType<ScorerAnswer>;
}

/**
 * How many output tokens one run may take.
 *
 * **This budget covers the model's reasoning, not just its answer**, and that is
 * the whole reason the number is this large. Claude Sonnet 5 returns a
 * `thinking` block by default; the seam drops it — a verdict is the answer, and
 * the reasoning is not evidence — but the provider counts those tokens against
 * `max_tokens` all the same. A ceiling sized to the JSON therefore truncates
 * *sometimes*: the first run of the golden PRD spent 4,100 tokens thinking and
 * 800 answering, and cut off mid-quote at 4,900. Truncated JSON reads as a
 * flaky provider rather than as a ceiling, which is the expensive way to learn
 * this.
 *
 * Measured on the twenty-check `feature-prd` rubric against a real PRD:
 * ~800 output tokens of JSON, ~4,100 of thinking. 700 per check with a 2,000
 * floor leaves roughly triple that headroom, which covers a rubric whose checks
 * quote whole paragraphs and a document that gives the scorer more to weigh.
 *
 * **A ceiling is not a cost.** Nothing is billed for headroom — §15's meter
 * counts the tokens produced — so the only thing a generous number buys is that
 * a long answer finishes. A run that hits it anyway returns invalid JSON and
 * fails cleanly; it never returns a short answer that scores.
 */
export function maxTokensFor(pack: SkillPack): number {
  return 2_000 + 700 * allChecks(pack).length;
}
