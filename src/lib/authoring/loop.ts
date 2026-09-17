import type { AiFailure, AiResult } from "@/lib/ai/types";
import { allChecks } from "@/packs";
import type { SkillPack } from "@/packs";

import { admitObjections } from "./objection";
import { draftRequest, criticRequest, revisionRequest } from "./prompt";
import type { AssembledRequest, Turn } from "./prompt";
import { SURFACING_ROUND, nextMove } from "./rounds";
import type { RoundOutcome, StoredRound } from "./rounds";
import type { AuthorAnswer, CriticAnswer } from "./schema";
import { checkRevisionScope } from "./scope";
import { parseSections, slugOf, spliceSection } from "./sections";

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
  /** The author answered without a position, so a round could not say what it held. */
  | ({ ok: false; reason: "answer"; detail: string } & Standing);

export async function refineSection(
  input: RefineInput,
  agents: Agents,
  ledger: Ledger,
): Promise<RefineResult> {
  const { pack, checkIds, sectionId, conversation } = input;
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
    const objections = admitObjections(pack, section.text, tested.value.objections).filter(
      (objection) => objection.scope === section.id,
    );

    let retest = false;
    for (const objection of objections) {
      const move = nextMove(await ledger.rounds(), section.id, objection.checkId);
      if (move.kind === "closed") continue;

      const base = {
        sectionId: section.id,
        checkId: objection.checkId,
        roundNo: move.roundNo,
        reason: objection.reason,
        evidence: objection.evidence,
        versionId,
      };

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
      if (authorPosition === "") {
        return {
          ok: false,
          reason: "answer",
          detail: "the author's revision came back with no position",
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
