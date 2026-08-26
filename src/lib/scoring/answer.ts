import { allChecks, applicableChecks, packConditions } from "@/packs";
import type { CheckResult, CheckTag, SkillPack } from "@/packs";

import {
  NOTE_LIMIT,
  REQUIREMENT_ID_LIMIT,
  STORED_QUOTE_LIMIT,
  clip,
  quoteOccursIn,
  renderEvidence,
} from "./evidence";
import type { ScorerAnswer } from "./schema";

/**
 * Turning one answer into the run — product-spec.md §4, §5 and §12's code node
 * law.
 *
 * Everything here is code doing what code must do. The model decided two things
 * and only two: whether each condition holds, and whether each check is
 * satisfied. Which checks that leaves in play, what they are worth, whether a
 * quote is real, and what the evidence sentence reads like are all
 * transformations with exactly one correct answer, so none of them is a
 * judgment and none of them is asked of a model.
 *
 * The whole file is pure, so the rules are unit tests rather than fixtures, and
 * `run.ts` can be read as an orchestration without any of this inlined into it.
 */

/** A verdict as it lands in `scoring_check_result`, verified and rendered. */
export type VerifiedVerdict = {
  checkId: string;
  tag: CheckTag;
  points: number;
  passed: boolean;
  requirementId: string | null;
  quote: string | null;
  note: string | null;
  /** The rendered gap sentence. Empty for a pass. */
  evidence: string;
};

export type ReadAnswer =
  | {
      ok: true;
      /** §4's conditions that held, in pack order. */
      conditionsMet: string[];
      /** One entry per applicable check, in the pack's own order. */
      verdicts: VerifiedVerdict[];
      /** The same verdicts as T2.1's contract, for `scoreRun`. */
      results: CheckResult[];
      /**
       * The checks whose evidence was clipped to fit its column, in pack order.
       *
       * Empty on every ordinary run. `writeRun` puts these in the ledger, so a
       * shortened reading is a recorded fact rather than a silent one — the
       * gap text itself carries the elision mark, and this says which run did
       * it. See `evidence.ts`'s limits for why clipping beats refusing.
       */
      clipped: string[];
    }
  | { ok: false; detail: string };

/**
 * Reads an answer that already passed schema validation, and refuses it if it
 * cannot be trusted.
 *
 * Five ways to be refused, and all five end the run — §5's failed run writes
 * nothing, so a doubtful answer produces no score rather than a soft one:
 *
 * 1. **A verdict naming a check the pack does not have.** The pack is law: a
 *    rubric cannot gain a check because a model wrote one down.
 * 2. **Two verdicts for one check.** An answer that says both is an answer that
 *    says neither, and picking one would be us deciding the check.
 * 3. **A missing verdict for an applicable check** — the short array the schema
 *    can no longer forbid (see `schema.ts`). This is where that law lives now,
 *    and it is why the whole run fails rather than the check being skipped: a
 *    skipped check would score as a failure, silently inventing a gap.
 * 4. **A failure with no reading.** §5's checks are binary *with evidence*: a
 *    failure that says nothing is a number that cannot be interrogated.
 * 5. **A quote that is not in the artifact.** §1 law 3 — the quote is the
 *    evidence, and an invented one is worse than no score.
 *
 * An empty quote is legal and is not the same as a missing verdict: some checks
 * fail because something is absent, and there is nothing to point at when the
 * out-of-scope list does not exist. The note carries those.
 *
 * **Over-long is not a sixth way to be refused.** A note or a quote past what
 * its column holds is clipped here, before it reaches a statement, and the
 * check id is returned so the ledger can say so. The verdict is sound; only the
 * evidence is long, and discarding a whole run over the length of one sentence
 * would cost every other check's verdict to fix nothing.
 */
export function readAnswer(
  pack: SkillPack,
  answer: ScorerAnswer,
  artifactText: string,
): ReadAnswer {
  const conditionsMet = packConditions(pack)
    .filter((condition) => answer.conditions[condition.id] === true)
    .map((condition) => condition.id);

  const known = new Set(allChecks(pack).map((check) => check.id));
  const byCheck = new Map<string, ScorerAnswer["results"][number]>();

  for (const verdict of answer.results) {
    const checkId = verdict.checkId.trim();

    if (!known.has(checkId)) {
      return { ok: false, detail: `verdict for ${JSON.stringify(checkId)}, which is not a check` };
    }
    if (byCheck.has(checkId)) {
      return { ok: false, detail: `two verdicts for check ${checkId}` };
    }

    byCheck.set(checkId, verdict);
  }

  const verdicts: VerifiedVerdict[] = [];
  const clipped: string[] = [];

  for (const check of applicableChecks(pack, conditionsMet)) {
    const verdict = byCheck.get(check.id);

    if (!verdict) {
      return { ok: false, detail: `no verdict for applicable check ${check.id}` };
    }

    if (verdict.passed) {
      // A pass carries no evidence. Anything the model attached to it is
      // dropped rather than stored: there is no gap for it to be evidence of.
      verdicts.push({
        checkId: check.id,
        tag: check.tag,
        points: check.points,
        passed: true,
        requirementId: null,
        quote: null,
        note: null,
        evidence: "",
      });
      continue;
    }

    // `""` is the wire's "absent" — see `Verdict`. It is turned back into null
    // here, so nothing below this line knows the sentinel exists.
    const rawNote = verdict.note.trim();
    if (rawNote.length === 0) {
      return { ok: false, detail: `check ${check.id} failed with no reading` };
    }

    // **The guard runs on the quote the model actually sent**, before any
    // clipping. Verifying a shortened quote would verify a prefix, and a prefix
    // of an invented sentence is still invented.
    const rawQuote = verdict.quote.trim();
    if (rawQuote.length > 0 && !quoteOccursIn(rawQuote, artifactText)) {
      return {
        ok: false,
        detail: `check ${check.id} quotes text that is not in the artifact: ${JSON.stringify(
          rawQuote.slice(0, 120),
        )}`,
      };
    }

    const note = clip(rawNote, NOTE_LIMIT);
    const quote = clip(rawQuote, STORED_QUOTE_LIMIT);
    const requirementId = clip(verdict.requirementId.trim(), REQUIREMENT_ID_LIMIT);

    if (note.clipped || quote.clipped || requirementId.clipped) clipped.push(check.id);

    const storedRequirementId = requirementId.text.length > 0 ? requirementId.text : null;
    const storedQuote = quote.text.length > 0 ? quote.text : null;

    verdicts.push({
      checkId: check.id,
      tag: check.tag,
      points: check.points,
      passed: false,
      requirementId: storedRequirementId,
      quote: storedQuote,
      note: note.text,
      evidence: renderEvidence({
        requirementId: storedRequirementId,
        quote: storedQuote,
        note: note.text,
      }),
    });
  }

  const results: CheckResult[] = verdicts.map((verdict) =>
    verdict.passed
      ? { checkId: verdict.checkId, passed: true }
      : { checkId: verdict.checkId, passed: false, evidence: verdict.evidence },
  );

  return { ok: true, conditionsMet, verdicts, results, clipped };
}
