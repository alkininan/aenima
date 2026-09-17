import { allChecks, type SkillPack } from "@/packs";
import { quoteOccursIn } from "@/lib/scoring/evidence";

/**
 * The critic's objection, and the two doors it passes before the author sees it
 * — product-spec.md §6.
 *
 * "Every objection must bind to a rubric check ID; unbound objections are
 * discarded (the structural cure for nitpicking). An objection carries four
 * things — the check id it binds to, the reason, the quoted evidence, and its
 * **scope**: which section it may change."
 *
 * Both doors are code, never a model's judgement (T3.1's rules): whether a
 * check id names a check is a set lookup, and whether a quote is in the
 * artifact is T2.3's fabrication guard, the same function a failure quote
 * passes before it is written to a gap. A discarded objection is not an error
 * and is not reported — the round carries on as if it had never been made.
 */

/** An objection that passed both doors. Every field is present and non-blank. */
export type Objection = {
  checkId: string;
  reason: string;
  /** Quoted from the artifact, and verified to be there. */
  evidence: string;
  /** The one section this objection lets the author change. */
  scope: string;
};

/**
 * An objection as a model returns it.
 *
 * Every field nullable rather than optional: a provider's strict mode forbids
 * optional properties (CLAUDE.md), so a field the critic did not fill arrives
 * as `null`, and a null is one of the ways an objection fails to be four
 * fields.
 */
export type ObjectionDraft = {
  checkId: string | null;
  reason: string | null;
  evidence: string | null;
  scope: string | null;
};

/**
 * "An objection is four fields, or it is discarded." Blank is absent: a reason
 * of spaces gives the author nothing to correct, and a scope of spaces names
 * no section. The check id is the one field left as it came — binding is an
 * exact match, so a padded id is a near miss for `bindObjections` to refuse,
 * not something to tidy into a binding here.
 */
function asObjection(draft: ObjectionDraft): Objection | null {
  const checkId = draft.checkId?.trim() ? draft.checkId : null;
  const reason = draft.reason?.trim();
  const evidence = draft.evidence?.trim();
  const scope = draft.scope?.trim();
  if (!checkId || !reason || !evidence || !scope) return null;
  return { checkId, reason, evidence, scope };
}

/**
 * The objections that bind to a check the loaded pack contains.
 *
 * The pack's whole id space, base and layered, because that is one space
 * (`allChecks`). Exact match: a check id is an identifier, and `prd-3 ` or
 * `PRD-3` naming `prd-3` would be the model's paraphrase of a binding, not a
 * binding.
 */
export function bindObjections(pack: SkillPack, objections: readonly Objection[]): Objection[] {
  const ids = new Set(allChecks(pack).map((check) => check.id));
  return objections.filter((objection) => ids.has(objection.checkId));
}

/**
 * The objections whose evidence is really in the artifact.
 *
 * `artifactText` is the text the critic was shown — the same string a quote is
 * checked against, or a quote could verify on the way in and fail on the way
 * out (`renderArtifact`'s note in `src/lib/scoring/prompt.ts`).
 */
export function verifyObjections(
  artifactText: string,
  objections: readonly Objection[],
): Objection[] {
  return objections.filter((objection) => quoteOccursIn(objection.evidence, artifactText));
}

/**
 * What the critic returned, reduced to what the author may see: complete,
 * bound, and quoting the artifact. Order is kept, so the author reads the
 * objections in the order the critic raised them.
 */
export function admitObjections(
  pack: SkillPack,
  artifactText: string,
  drafts: readonly ObjectionDraft[],
): Objection[] {
  const whole = drafts.map(asObjection).filter((o): o is Objection => o !== null);
  return verifyObjections(artifactText, bindObjections(pack, whole));
}
