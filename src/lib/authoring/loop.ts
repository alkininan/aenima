import type { AiFailure, AiResult } from "@/lib/ai/types";
import { allChecks } from "@/packs";
import type { SkillPack } from "@/packs";

import { admitObjections } from "./objection";
import { draftRequest, criticRequest, revisionRequest } from "./prompt";
import type { AssembledRequest, Turn } from "./prompt";
import { ROUND_TEXT_MAX, SECTION_ID_MAX, SURFACING_ROUND, nextMove } from "./rounds";
import type { RoundOutcome, StoredRound } from "./rounds";
import type { AuthorAnswer, CriticAnswer } from "./schema";
import { checkRevisionScope } from "./scope";
import { PREAMBLE_ID, parseSections, slugOf, spliceSection } from "./sections";

/**
 * The author-critic loop — product-spec.md §6, one section at a time.
 *
 *     critic tests the section → no objection it can act on: the section settles
 *     → objection: the author revises inside its scope → the critic re-tests
 *     → second objection: one more revision
 *     → third: an open question, and the section keeps its latest draft
 *
 * **Everything that decides is code.** Which objections the author may see is
 * `admitObjections` (bound to the pack, quoting the section) plus the scope
 * door below; whether a revision stayed inside its section is
 * `checkRevisionScope`; how many rounds a check has had and what the next one
 * is, is `nextMove` over rows the ledger returned. The two models draft and
 * judge, and nothing else.
 *
 * **Round state lives in the ledger and only there.** Every pass reads it back
 * before deciding a move — never a counter held in this function, which a reload
 * would reset (AC6) — and every round is written before the loop moves on, so a
 * loop that dies between two calls leaves the ledger saying exactly what
 * happened up to that point.
 *
 * The agents and the ledger are handed in. `run.ts` hands in the seam and the
 * database; a test hands in recorded answers and a ledger in memory, and
 * asserts over the requests the critic was actually sent.
 */

/** One round as the loop writes it: the stored parts, plus what a write needs beside them. */
export type RoundWrite = StoredRound & {
  /** The version the critic read when it raised this objection. */
  versionId: string;
  /** A refused round: every section the revision touched outside its scope. Null otherwise. */
  outsideSections: string[] | null;
  /** A revised round: the document with the revision in it, to store as the next version. Null otherwise. */
  revisedBody: string | null;
};

/** Where rounds are read from and written to. */
export type Ledger = {
  /**
   * Every round the ledger holds on this artifact, every section, in any order.
   * Keying them by section and check is `nextMove`'s, so two sections cannot
   * share a count however the ledger is read (AC7).
   */
  rounds(): Promise<StoredRound[]>;
  /**
   * Writes one round. A revised round writes its body as the artifact's next
   * version in the same breath, and the id of that version comes back; every
   * other outcome cuts no version and gets null.
   */
  record(round: RoundWrite): Promise<{ versionId: string | null }>;
};

/** The two models, each one call. */
export type Agents = {
  critic(request: AssembledRequest): Promise<AiResult<CriticAnswer>>;
  author(request: AssembledRequest): Promise<AiResult<AuthorAnswer>>;
};

export type RefineInput = {
  pack: SkillPack;
  /** The checks in play for this artifact — what the critic is shown. */
  checkIds: readonly string[];
  /** The document as its current version holds it. */
  body: string;
  versionId: string;
  sectionId: string;
  /**
   * The section's text in the newest human-authored version of the artifact,
   * hashed — what §6's cap is counted against, and what a human rewrite moves
   * (AA1). Null where no human version holds this section.
   */
  baseSectionHash: string | null;
  /** The author's interview so far. Never the critic's to read. */
  conversation: readonly Turn[];
};

/** How the document stands when the loop stopped, and every round it wrote on the way. */
type Standing = { body: string; versionId: string; rounds: RoundWrite[] };

export type RefineResult =
  /** Nothing left the loop could act on: every objection settled, surfaced, or already open. */
  | ({ ok: true } & Standing)
  | { ok: false; reason: "no-section"; detail: string }
  /** A call did not come back. The rounds written before it stand. */
  | ({ ok: false; reason: "provider"; failure: AiFailure } & Standing)
  /** The author answered with no position, or one longer than a round can hold. */
  | ({ ok: false; reason: "answer"; detail: string } & Standing);

/**
 * Text as a round can hold it: the whole of it, or its first `ROUND_TEXT_MAX`
 * characters and the word that it was cut (AA3).
 *
 * Cut by UTF-16 code units, which is the conservative side of the column's
 * character limit: Postgres `length()` counts characters, so a cut that fits
 * 2000 code units always fits 2000 characters, and a quote of astral characters
 * is cut earlier than it strictly need be. Nothing is appended to mark the cut —
 * the record is the flag on the row, not an ellipsis inside the text a surface
 * would then have to read back out.
 */
export function fit(text: string): { text: string; truncated: boolean } {
  if (text.length <= ROUND_TEXT_MAX) return { text, truncated: false };
  // Back off a code unit when the cut falls between a surrogate pair. A lone
  // surrogate is replaced on its way to the driver, and an evidence quote that
  // came back with a replacement character no longer occurs in the section it
  // was quoted from — the guard would reject a quote the critic really made.
  const cut = ROUND_TEXT_MAX;
  const code = text.charCodeAt(cut - 1);
  const whole = code >= 0xd800 && code <= 0xdbff ? cut - 1 : cut;
  return { text: text.slice(0, whole), truncated: true };
}

export async function refineSection(
  input: RefineInput,
  agents: Agents,
  ledger: Ledger,
): Promise<RefineResult> {
  const { pack, checkIds, sectionId, conversation, baseSectionHash } = input;
  // The text before the first `##` heading is a section only so that the scope
  // wall can see it. The addendum's section is a `##` block, and nothing is
  // refined — or stored under a section id — that is not one.
  if (sectionId === PREAMBLE_ID) {
    return {
      ok: false,
      reason: "no-section",
      detail: "the text before the first ## heading is not a section to refine",
    };
  }
  // A heading whose slug is longer than a round can store could be argued over
  // and never recorded; turned away before the first paid call.
  if (sectionId.length > SECTION_ID_MAX) {
    return {
      ok: false,
      reason: "no-section",
      detail: `a section id longer than ${SECTION_ID_MAX} characters cannot be refined`,
    };
  }
  let body = input.body;
  let versionId = input.versionId;
  const written: RoundWrite[] = [];
  const standing = (): Standing => ({ body, versionId, rounds: written });

  // Every pass that does not return writes a round, and one check on one section
  // holds at most SURFACING_ROUND of them — so a working loop ends well inside
  // this. It is here so that a ledger that fails to keep what it is handed costs
  // an exception rather than an unbounded run of paid calls.
  const passes = SURFACING_ROUND * allChecks(pack).length + 1;

  for (let pass = 0; pass < passes; pass += 1) {
    const sections = parseSections(body);
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      return {
        ok: false,
        reason: "no-section",
        detail: `the document has no section "${sectionId}"`,
      };
    }

    const tested = await agents.critic(criticRequest(pack, checkIds, section));
    if (!tested.ok)
      return { ok: false, reason: "provider", failure: tested.failure, ...standing() };

    // AC1 and AC5 are `admitObjections`: bound to a check the pack holds, and
    // quoting the text the critic was shown. Then scope: the critic was shown
    // one section, and an objection that names another cannot be acted on by a
    // call that receives only this one.
    //
    // **Size is not a door** (AA3). T3.1 dropped an objection longer than a
    // round can hold, which is a gap nobody hears about — §1 law 7 broken by a
    // column width. An over-long reason is cut to what the round holds and the
    // cut is recorded; an over-long *quote* is cut too, and because a cut quote
    // is no longer the verbatim evidence §1 law 3 asks for, that objection is
    // never sent to the author. It surfaces to the human instead.
    const objections = admitObjections(pack, section.text, tested.value.objections)
      .filter((objection) => objection.scope === section.id)
      .map((objection) => {
        const reason = fit(objection.reason);
        const evidence = fit(objection.evidence);
        // The scope is carried through so that what the author is sent is the
        // objection as the round records it, cut and all — the author never
        // argues from a sentence the ledger does not hold.
        return {
          checkId: objection.checkId,
          scope: objection.scope,
          reason: reason.text,
          reasonTruncated: reason.truncated,
          evidence: evidence.text,
          evidenceTruncated: evidence.truncated,
        };
      });

    let retest = false;
    for (const objection of objections) {
      const move = nextMove(await ledger.rounds(), section.id, objection.checkId, baseSectionHash);
      if (move.kind === "closed") continue;

      const base = {
        sectionId: section.id,
        checkId: objection.checkId,
        cycleNo: move.cycleNo,
        baseSectionHash,
        roundNo: move.roundNo,
        reason: objection.reason,
        reasonTruncated: objection.reasonTruncated,
        evidence: objection.evidence,
        evidenceTruncated: objection.evidenceTruncated,
        versionId,
      };

      // AA3: an objection whose quote had to be cut is one the author must not
      // be shown — a revision argued from a fragment is a revision argued from
      // something the critic did not say. It goes straight to the human, at
      // whatever round the cycle is on, with no author position, because the
      // author was never asked. Nothing about this path is silent.
      if (move.kind === "revise" && objection.evidenceTruncated) {
        const round: RoundWrite = {
          ...base,
          outcome: "surfaced",
          authorPosition: null,
          outsideSections: null,
          revisedBody: null,
        };
        await ledger.record(round);
        written.push(round);
        continue;
      }

      if (move.kind === "surface") {
        // AC3: no revision is asked for, the document stays as it stands, and
        // this row is the open question — the check, the evidence, the critic's
        // reason and the author's latest position. The section did not change,
        // so the rest of this answer still reads true and is worked through
        // without asking the critic again.
        const round: RoundWrite = {
          ...base,
          outcome: "surfaced",
          authorPosition: move.authorPosition,
          outsideSections: null,
          revisedBody: null,
        };
        await ledger.record(round);
        written.push(round);
        continue;
      }

      const answered = await agents.author(
        revisionRequest(pack, checkIds, objection, section, conversation),
      );
      if (!answered.ok) {
        return { ok: false, reason: "provider", failure: answered.failure, ...standing() };
      }
      const authorPosition = answered.value.position.trim();
      if (authorPosition === "" || authorPosition.length > ROUND_TEXT_MAX) {
        return {
          ok: false,
          reason: "answer",
          detail:
            authorPosition === ""
              ? "the author's revision came back with no position"
              : `the author's position runs past ${ROUND_TEXT_MAX} characters`,
          ...standing(),
        };
      }

      // AC2: the revision is spliced into the document and the whole document
      // is read again, so a revision that grows a heading, renames its own, or
      // swallows the next one is seen as touching sections it had no scope for.
      const revisedBody = spliceSection(sections, section.id, answered.value.section);
      const scope = checkRevisionScope(sections, parseSections(revisedBody), section.id);
      const outcome: RoundOutcome = !scope.ok
        ? "refused"
        : revisedBody === body
          ? "held"
          : "revised";

      const round: RoundWrite = {
        ...base,
        outcome,
        authorPosition,
        outsideSections: scope.ok ? null : scope.outside,
        revisedBody: outcome === "revised" ? revisedBody : null,
      };
      const stored = await ledger.record(round);
      written.push(round);

      if (outcome === "revised") {
        if (stored.versionId === null) {
          throw new Error("the ledger recorded a revised round without cutting a version");
        }
        body = revisedBody;
        versionId = stored.versionId;
      }

      // One objection per critic pass reaches the author. After a revision the
      // rest of the answer is about text that may no longer be there; after a
      // refusal or a hold it is the same text, and the critic reads it again
      // either way — "critic re-tests" — so every round is judged fresh.
      retest = true;
      break;
    }

    if (!retest) return { ok: true, ...standing() };
  }

  throw new Error(`the loop on "${sectionId}" ran past ${passes} passes without settling`);
}

export type DraftInput = {
  pack: SkillPack;
  checkIds: readonly string[];
  /** The heading the section is written under, without the `## `. */
  heading: string;
  /** What exists: a doc, a thread, a braindump. */
  material: string;
  conversation: readonly Turn[];
};

export type DraftResult =
  | { ok: true; text: string; position: string }
  | { ok: false; reason: "provider"; failure: AiFailure }
  | { ok: false; reason: "answer"; detail: string };

/**
 * The author's first draft of a section — "drafts from whatever exists".
 *
 * A draft is refused unless it reads as the one section it was asked for: one
 * `##` block, under the heading it was given, with nothing before it. Anything
 * else would put sections into the document that nobody asked the author to
 * write, which is the scope wall's concern arriving one step early.
 */
export async function draftSection(input: DraftInput, agents: Agents): Promise<DraftResult> {
  const answered = await agents.author(
    draftRequest(input.pack, input.checkIds, input.heading, input.material, input.conversation),
  );
  if (!answered.ok) return { ok: false, reason: "provider", failure: answered.failure };

  const text = answered.value.section.endsWith("\n")
    ? answered.value.section
    : `${answered.value.section}\n`;
  const sections = parseSections(text);
  const expected = slugOf(input.heading);
  if (sections.length !== 1 || sections[0]!.id !== expected) {
    return {
      ok: false,
      reason: "answer",
      detail: `the draft reads as sections [${sections.map((s) => s.id).join(", ")}], not one "${expected}"`,
    };
  }
  return { ok: true, text, position: answered.value.position.trim() };
}
