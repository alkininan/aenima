import { allChecks } from "@/packs";
import type { SkillPack } from "@/packs";

import type { Objection } from "./objection";
import type { Section } from "./scope";

/**
 * What the author and the critic are told — product-spec.md §6.
 *
 * The line falls where `src/lib/scoring/prompt.ts` draws it: **the protocol is
 * the loop's, the rubric's words are the pack's.** Everything written here is
 * about how to answer — that the critic cites and never rewrites, that an
 * objection names one check and one section, that a revision corrects rather
 * than improves. Every check id, check sentence, probe and critic test comes
 * from the pack as it ships.
 *
 * Each request is split the way §12 wants a call split: `context` is what
 * repeats — the protocol and the checks in play — and `input` is the part that
 * changes, last.
 *
 * **The critic's request is assembled from three things and has no way to take
 * a fourth**: the pack, the ids of the checks in play, and the section under
 * refinement. `criticRequest` has no parameter a conversation could arrive
 * through, and the loop's test asserts over the request actually sent (AC4). §6:
 * "it sees only the artifact and the rubric — never the conversation, the
 * author's confidence, or the owner's pushback."
 */

/** One turn of the interview the author conducts. The critic never reads one. */
export type Turn = { speaker: "human" | "author"; text: string };

/** One model request, before the seam adds purpose, schema and budget. */
export type AssembledRequest = { context: string; input: string };

export const CRITIC_PROTOCOL = `You are the critic. You test one section of a document against the rubric checks listed below.

You detect and cite. You never rewrite the section, never suggest wording, and never judge anything but the section in front of you.

Raise an objection only where the section fails one of the checks listed below. Return no objection for a check the section satisfies, and none for a check this section is not the place to answer — another section of the document may answer it, and you are not shown the others.

Every objection carries four things:

- checkId: the id of the check the section fails, exactly as it is listed. An objection naming no listed check is discarded.
- reason: what the section leaves unclear, in one or two sentences. Say the specific gap, not the check restated.
- evidence: the exact text from the section that the gap lives in, copied character for character. Never a paraphrase, never a summary. When the gap is something the section leaves out, quote the sentence nearest to where it belongs.
- scope: the id of the section you were given. An objection may change that section and no other.

When the section gives you nothing to object to, return an empty list of objections.

Write every reason in English.`;

export const AUTHOR_PROTOCOL = `You are the author of a document, written one section at a time from what the people working on it have said.

When you draft a section, write it from the material and the conversation you are given, under the heading you are given.

When you revise a section, a critic has objected to it against one rubric check. Correct the section so it answers that objection, and change nothing the objection does not concern. A returned section is corrected, not improved: leave every sentence the objection is not about exactly as it is, character for character.

Either way:

- section: the whole section as it should now read, starting with its heading line. Keep the heading as it is and add no other headings.
- position: one or two sentences saying how the section answers the objection, or, when you draft, what it is built from.

Never invent a fact. Use only what the material, the conversation, the section and the objection give you. When answering an objection needs something nobody has said, return the section unchanged and say in your position what you would need to know.

Write the position in English.`;

/**
 * The checks in play, one line each in the pack's own words, with each check's
 * probes and the interview bank's critic test beneath it.
 *
 * Pack order, whatever order the ids arrive in, so one set of checks renders to
 * one string and the context caches as one prefix. An id the pack does not hold
 * renders nothing: the checks in play are read from the pack, never invented
 * from a list.
 */
export function renderChecks(pack: SkillPack, checkIds: readonly string[]): string {
  const inPlay = new Set(checkIds);
  return allChecks(pack)
    .filter((check) => inPlay.has(check.id))
    .map((check) => {
      const probes = (check.probes ?? []).map((probe) => `  probe: ${probe}`);
      const tests = pack.interview
        .filter((question) => question.checkId === check.id)
        .map((question) => `  critic test: ${question.criticTest}`);
      return [`${check.id} (${check.tag}): ${check.prose}`, ...probes, ...tests].join("\n");
    })
    .join("\n");
}

function checksBlock(pack: SkillPack, checkIds: readonly string[]): string {
  return `RUBRIC ${pack.id} version ${pack.version}\n\nCHECKS\n${renderChecks(pack, checkIds)}`;
}

function sectionBlock(section: Section): string {
  return `SECTION ${section.id}\n${section.text}`;
}

function conversationBlock(conversation: readonly Turn[]): string {
  const turns = conversation.map((turn) => `${turn.speaker}: ${turn.text}`);
  return `CONVERSATION\n${turns.length > 0 ? turns.join("\n") : "(none yet)"}`;
}

/**
 * The critic's request: the checks in play, and the one section under
 * refinement. Nothing else is expressible here, and that is the point.
 */
export function criticRequest(
  pack: SkillPack,
  checkIds: readonly string[],
  section: Section,
): AssembledRequest {
  return {
    context: `${CRITIC_PROTOCOL}\n\n${checksBlock(pack, checkIds)}`,
    input: sectionBlock(section),
  };
}

/**
 * The author's revision request: the objection, the scoped section and nothing
 * else of the document — "the author's revision call receives only the scoped
 * section" — and the conversation, which the author conducts.
 *
 * The objection's check is named with its sentence so the author corrects
 * against the rubric's words rather than the critic's reading of them.
 */
export function revisionRequest(
  pack: SkillPack,
  checkIds: readonly string[],
  objection: Objection,
  section: Section,
  conversation: readonly Turn[],
): AssembledRequest {
  const check = allChecks(pack).find((candidate) => candidate.id === objection.checkId);
  return {
    context: `${AUTHOR_PROTOCOL}\n\n${checksBlock(pack, checkIds)}`,
    input: [
      `OBJECTION`,
      `check: ${objection.checkId}${check ? ` — ${check.prose}` : ""}`,
      `reason: ${objection.reason}`,
      `evidence: ${objection.evidence}`,
      "",
      sectionBlock(section),
      conversationBlock(conversation),
    ].join("\n"),
  };
}

/** The author's draft request: a heading to write under, the material, the conversation. */
export function draftRequest(
  pack: SkillPack,
  checkIds: readonly string[],
  heading: string,
  material: string,
  conversation: readonly Turn[],
): AssembledRequest {
  return {
    context: `${AUTHOR_PROTOCOL}\n\n${checksBlock(pack, checkIds)}`,
    input: [
      `DRAFT the section headed: ## ${heading}`,
      "",
      `MATERIAL\n${material}`,
      "",
      conversationBlock(conversation),
    ].join("\n"),
  };
}
