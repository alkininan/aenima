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
 * Output budgets. A critic's answer is a short list of short objections; an
 * author's is one section of a document. Both are ceilings, not targets.
 */
export const CRITIC_MAX_TOKENS = 2_000;
export const AUTHOR_MAX_TOKENS = 4_000;
