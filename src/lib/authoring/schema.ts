import { z } from "zod";

/**
 * The two answers the loop asks a model for, as the seam sends them.
 *
 * `.nullable()` on every field an answer may leave out, never `.optional()`:
 * a provider's strict mode requires every property (CLAUDE.md). A null in an
 * objection is one of the ways it fails to be four fields, and
 * `admitObjections` discards it rather than this schema refusing the whole
 * answer — one incomplete objection is not a reason to throw away the others.
 */

export const criticAnswerSchema = z.object({
  objections: z.array(
    z.object({
      checkId: z.string().nullable(),
      reason: z.string().nullable(),
      evidence: z.string().nullable(),
      scope: z.string().nullable(),
    }),
  ),
});

export type CriticAnswer = z.infer<typeof criticAnswerSchema>;

/** A drafted or revised section, and the author's own account of it. */
export const authorAnswerSchema = z.object({
  section: z.string(),
  position: z.string(),
});

export type AuthorAnswer = z.infer<typeof authorAnswerSchema>;

/**
 * Output budgets — ceilings, not targets; a call is billed for what it used.
 *
 * A critic's answer is a short list of short objections and an author's is one
 * section, but **the model's thinking counts against the same ceiling**. The
 * generation tier takes the provider's default effort (`ResolvedRequest.effort`
 * is null off the pinned path), and the first live draft through this seam used
 * all 4,000 output tokens of its ceiling and returned about 2,500 characters of
 * JSON, cut off mid-string — most of the tokens went on thinking, and the answer
 * was a `schema-invalid` that was never finished. Room for the thinking
 * as well as the answer, in the proportion `maxTokensFor` gives the scorer.
 */
export const CRITIC_MAX_TOKENS = 12_000;
export const AUTHOR_MAX_TOKENS = 16_000;
