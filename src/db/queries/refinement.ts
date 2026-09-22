import "server-only";

import { createHash } from "node:crypto";

import { sharedDbClient } from "@/db/client";
import type { UsageActor } from "@/db/queries/ai-usage";
import type { RoundWrite } from "@/lib/authoring/loop";
import type { RoundOutcome, StoredRound } from "@/lib/authoring/rounds";

/**
 * Persistence for §6's author-critic loop — `refinement_round`, and the
 * artifact versions a revision cuts.
 *
 * **Over the direct connection, like `scoring_run` and for the same reason**:
 * `refinement_round` has no INSERT policy, because a client that could write its
 * own round could spend or skip the cap. The direct connection bypasses RLS, so
 * every statement here filters `workspace_id` — the boundary is ours to hold on
 * this path.
 */

/** The agent a revised section is attributed to — §0 law 4 renders agent-authored text violet. */
export const AUTHOR_AGENT = "author";

/**
 * Every round on one artifact, every section, unordered.
 *
 * Keying them by section and check is `nextMove`'s: the loop reads the ledger
 * whole so no read can blur two sections' counts together (AC7).
 */
export async function readRounds(workspaceId: string, artifactId: string): Promise<StoredRound[]> {
  const { sql } = sharedDbClient();

  const rows = await sql<
    {
      section_id: string;
      check_id: string;
      cycle_no: number;
      base_section_hash: string | null;
      round_no: number;
      outcome: RoundOutcome;
      reason: string;
      reason_truncated: boolean;
      evidence: string;
      evidence_truncated: boolean;
      author_position: string | null;
    }[]
  >`
    select section_id, check_id, cycle_no, base_section_hash,
           round_no, outcome::text as outcome,
           reason, reason_truncated, evidence, evidence_truncated, author_position
      from refinement_round
     where workspace_id = ${workspaceId} and artifact_id = ${artifactId}
  `;

  return rows.map((row) => ({
    sectionId: row.section_id,
    checkId: row.check_id,
    cycleNo: row.cycle_no,
    baseSectionHash: row.base_section_hash,
    roundNo: row.round_no,
    outcome: row.outcome,
    reason: row.reason,
    reasonTruncated: row.reason_truncated,
    evidence: row.evidence,
    evidenceTruncated: row.evidence_truncated,
    authorPosition: row.author_position,
  }));
}

/**
 * One artifact version's §4 conditions, or null when nothing has scored that
 * version.
 *
 * The checks in play for a section are the checks the applicability engine left
 * in the denominator, and the engine answers in the pass that scores. **The
 * version's own run, never the artifact's newest** (T3.1's addendum, AA2):
 * §5 caches results per artifact version, so applicability belongs to the
 * version too, and a run against an older version is an answer about text that
 * is no longer the one under refinement. A version nobody has scored has no
 * answer at all rather than a neighbour's, and the caller falls back to the
 * checks no condition governs.
 *
 * Newest still breaks the tie *within* the version: §5's cache key carries the
 * pack, its version and the protocol version beside the artifact version, so
 * one version can hold several runs, and the last one is the current reading.
 */
export async function readVersionConditions(
  workspaceId: string,
  artifactVersionId: string,
): Promise<string[] | null> {
  const { sql } = sharedDbClient();

  const rows = await sql<{ conditions_met: string[] }[]>`
    select conditions_met
      from scoring_run
     where workspace_id = ${workspaceId} and artifact_version_id = ${artifactVersionId}
     order by scored_at desc
     limit 1
  `;

  return rows.at(0)?.conditions_met ?? null;
}

/**
 * The newest **human-authored** version of an artifact — the baseline §6's cap
 * is counted against (AA1), and null for an artifact no human has written a
 * version of.
 *
 * Human-authored, because what reopens a surfaced check is the human rewriting
 * the section. The author's own revisions are `artifact_version` rows too, and
 * a baseline that moved with them would reopen every check the loop had just
 * closed; `rounds.ts` says why that does not terminate.
 */
export async function readHumanBaseline(
  workspaceId: string,
  artifactId: string,
): Promise<{ versionId: string; content: unknown } | null> {
  const { sql } = sharedDbClient();

  const rows = await sql<{ id: string; content: unknown }[]>`
    select id, content
      from artifact_version
     where workspace_id = ${workspaceId} and artifact_id = ${artifactId}
       and authored_by_kind = 'human'
     order by version_no desc
     limit 1
  `;

  const row = rows.at(0);
  return row ? { versionId: row.id, content: row.content } : null;
}

export type RoundToWrite = {
  workspaceId: string;
  productId: string;
  itemId: string;
  artifactId: string;
  round: RoundWrite;
  actor: UsageActor;
};

/**
 * Writes one round, and for a revised round the version it cuts — **in one
 * transaction**, so a version never exists without the round that explains it
 * and a revised round never names a version that was not written.
 *
 * Artifacts are immutable (CLAUDE.md): the revision is a new `artifact_version`
 * row, numbered by `app.assign_version_no()`, attributed to the author agent.
 * Every mutating action writes an `activity` row (§2): `artifact.version.added`
 * on the item, as the seed writes it, and `refinement.<outcome>` on the round.
 *
 * Returns the id of the version a revised round cut, and null for every other
 * outcome.
 */
export async function writeRound(write: RoundToWrite): Promise<{ versionId: string | null }> {
  const { sql } = sharedDbClient();
  const { round } = write;

  const actorKind = write.actor.kind;
  const actorUserId = write.actor.kind === "human" ? write.actor.userId : null;
  const actorAgent = write.actor.kind === "agent" ? write.actor.name : null;
  const trigger = write.actor.kind === "human" ? "user" : "agent";

  return sql.begin(async (tx) => {
    /**
     * `::text::jsonb`, not `::jsonb` — `writeRun`'s note on the ledger's
     * metadata holds for the version's content too: a bare cast can store the
     * JSON text as a jsonb *string*, and `content->>'body'` would read null.
     */
    const logActivity = async (
      action: string,
      subjectTable: string,
      subjectId: string,
      metadata: Record<string, string | number | boolean | null>,
    ): Promise<void> => {
      await tx`
        insert into activity (
          workspace_id, product_id, actor_kind, actor_user_id, actor_agent,
          action, trigger_source, subject_table, subject_id, metadata
        ) values (
          ${write.workspaceId}, ${write.productId}, ${actorKind}::actor_kind,
          ${actorUserId}, ${actorAgent},
          ${action}, ${trigger}::activity_trigger, ${subjectTable}, ${subjectId},
          ${JSON.stringify(metadata)}::text::jsonb
        )
      `;
    };

    let revisedVersionId: string | null = null;

    if (round.outcome === "revised") {
      if (round.revisedBody === null) throw new Error("a revised round carries no body");
      const body = round.revisedBody;
      // `version_no` is assigned by app.assign_version_no(). The column is NOT
      // NULL, so a placeholder goes in and the trigger overwrites it.
      const versions = await tx<{ id: string; version_no: number }[]>`
        insert into artifact_version (
          workspace_id, artifact_id, version_no, content, content_hash,
          authored_by_kind, authored_by_agent
        ) values (
          ${write.workspaceId}, ${write.artifactId}, 1,
          ${JSON.stringify({ body })}::text::jsonb,
          ${createHash("sha256").update(body).digest("hex")},
          'agent'::actor_kind, ${AUTHOR_AGENT}
        )
        returning id, version_no
      `;
      revisedVersionId = versions[0]!.id;
      await logActivity("artifact.version.added", "item", write.itemId, {
        artifactId: write.artifactId,
        versionId: revisedVersionId,
        versionNo: versions[0]!.version_no,
        sectionId: round.sectionId,
      });
    }

    const rounds = await tx<{ id: string }[]>`
      insert into refinement_round (
        workspace_id, item_id, artifact_id, artifact_version_id,
        section_id, check_id, cycle_no, base_section_hash, round_no, outcome,
        reason, reason_truncated, evidence, evidence_truncated,
        author_position, revised_version_id, outside_sections
      ) values (
        ${write.workspaceId}, ${write.itemId}, ${write.artifactId}, ${round.versionId},
        ${round.sectionId}, ${round.checkId}, ${round.cycleNo}, ${round.baseSectionHash},
        ${round.roundNo}, ${round.outcome}::refinement_outcome,
        ${round.reason}, ${round.reasonTruncated},
        ${round.evidence}, ${round.evidenceTruncated},
        ${round.authorPosition}, ${revisedVersionId}, ${round.outsideSections}
      )
      returning id
    `;

    await logActivity(`refinement.${round.outcome}`, "refinement_round", rounds[0]!.id, {
      artifactId: write.artifactId,
      sectionId: round.sectionId,
      checkId: round.checkId,
      cycleNo: round.cycleNo,
      roundNo: round.roundNo,
      // AA3: a cut objection is a recorded fact on the ledger too, not only on
      // the row — "nothing about this path may be silent".
      reasonTruncated: round.reasonTruncated,
      evidenceTruncated: round.evidenceTruncated,
    });

    return { versionId: revisedVersionId };
  });
}
