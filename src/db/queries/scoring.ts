import "server-only";

import { sharedDbClient } from "@/db/client";
import { createClient } from "@/lib/supabase/server";
import type { UsageActor } from "@/db/queries/ai-usage";
import type { GapWrite } from "@/lib/scoring/reconcile";
import type { ExistingGap } from "@/lib/scoring/reconcile";
import type { VerifiedVerdict } from "@/lib/scoring/answer";
import type { ProviderId } from "@/lib/ai/types";

/**
 * Persistence for §5's scoring engine.
 *
 * **Writes go over the direct connection**, like `ai_usage` and for the same
 * reason: `scoring_run` and `scoring_check_result` have no INSERT policy at
 * all, deliberately. A client that could write its own run row could write its
 * own score, and §1 law 1 has the whole product deriving from what artifacts
 * score. Reads for a surface go through PostgREST as the signed-in human, where
 * RLS decides what is visible, and `getLatestRunForItem` at the foot of this
 * file is that path — T2.4's meter, the first surface to read a run.
 *
 * **Two clients live here, and which one a function uses is load-bearing.** The
 * direct connection bypasses RLS, so **every statement on it filters
 * `workspace_id`** — the boundary is ours to hold on that path. The read path
 * uses `createClient()` and filters `workspace_id` as well, but that filter is
 * belt to RLS's braces: `scoring_run_select` also checks
 * `app.can_see_product(...)`, and a member who cannot see a product must not
 * read its scores. A workspace filter alone would hand them over.
 */

/** The artifact a run scores, and the version it scores. */
export type ScorableArtifact = {
  artifactId: string;
  itemId: string;
  productId: string;
  kind: string;
  versionId: string;
  versionNo: number;
  content: unknown;
};

/**
 * The artifact's latest version, or null when it has none.
 *
 * An `artifact` row is identity only — creating one authors nothing (§3) — so
 * an artifact with no versions is not scorable rather than scorable and empty.
 */
export async function readScorableArtifact(
  workspaceId: string,
  artifactId: string,
): Promise<ScorableArtifact | null> {
  const { sql } = sharedDbClient();

  const rows = await sql<
    {
      artifact_id: string;
      item_id: string;
      product_id: string;
      kind: string;
      version_id: string;
      version_no: number;
      content: unknown;
    }[]
  >`
    select a.id as artifact_id, a.item_id, i.product_id, a.kind::text as kind,
           v.id as version_id, v.version_no, v.content
      from artifact a
      join item i on i.workspace_id = a.workspace_id and i.id = a.item_id
      join artifact_version v
        on v.workspace_id = a.workspace_id and v.artifact_id = a.id
     where a.workspace_id = ${workspaceId} and a.id = ${artifactId}
     order by v.version_no desc
     limit 1
  `;

  const row = rows.at(0);
  if (!row) return null;

  return {
    artifactId: row.artifact_id,
    itemId: row.item_id,
    productId: row.product_id,
    kind: row.kind,
    versionId: row.version_id,
    versionNo: row.version_no,
    content: row.content,
  };
}

/** A stored run, as it reads back. The score is arithmetic over the last two. */
export type StoredRun = {
  id: string;
  packId: string;
  packVersion: string;
  protocolVersion: string;
  provider: ProviderId;
  model: string;
  conditionsMet: string[];
  earned: number;
  denominator: number;
  scoredAt: string;
};

/**
 * §5's cache: the run for this artifact version and this rubric version, if one
 * exists.
 *
 * The unique index behind this is what makes re-scoring an unchanged version
 * impossible rather than merely avoided — "asking twice and getting two
 * different scores" is the failure the cache exists to prevent, so the lookup
 * and the constraint are the same key.
 */
export async function findRunForVersion(
  workspaceId: string,
  versionId: string,
  packId: string,
  packVersion: string,
  protocolVersion: string,
): Promise<StoredRun | null> {
  const { sql } = sharedDbClient();

  const rows = await sql<
    {
      id: string;
      pack_id: string;
      pack_version: string;
      protocol_version: string;
      provider: ProviderId;
      model: string;
      conditions_met: string[];
      earned: number;
      denominator: number;
      /**
       * Text, not a Date: `postgres` parses timestamptz into a JS Date only for
       * types it was told about, and this query asks for none. It is rendered
       * in the workspace timezone anyway (CLAUDE.md), so ISO-8601 out of the
       * database is what a caller wants and one parse is one parse too many.
       */
      scored_at: string;
    }[]
  >`
    select id, pack_id, pack_version, protocol_version, provider, model, conditions_met,
           earned, denominator, to_char(scored_at at time zone 'utc',
                                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as scored_at
      from scoring_run
     where workspace_id = ${workspaceId}
       and artifact_version_id = ${versionId}
       and pack_id = ${packId}
       and pack_version = ${packVersion}
       and protocol_version = ${protocolVersion}
     limit 1
  `;

  const row = rows.at(0);
  if (!row) return null;

  return {
    id: row.id,
    packId: row.pack_id,
    packVersion: row.pack_version,
    protocolVersion: row.protocol_version,
    provider: row.provider,
    model: row.model,
    conditionsMet: row.conditions_met,
    earned: row.earned,
    denominator: row.denominator,
    scoredAt: row.scored_at,
  };
}

/**
 * Every check result of one run.
 *
 * **Unordered on purpose.** `check_id` sorts lexicographically — `prd-10` before
 * `prd-2` — and the database has no way to know a pack's order, which is what a
 * person reads a run in. `run.ts` sorts these back into it. Ordering here would
 * look like an answer and be the wrong one.
 */
export async function readRunResults(
  workspaceId: string,
  runId: string,
): Promise<VerifiedVerdict[]> {
  const { sql } = sharedDbClient();

  const rows = await sql<
    {
      check_id: string;
      tag: "must" | "should";
      points: number;
      passed: boolean;
      requirement_id: string | null;
      quote: string | null;
      note: string | null;
    }[]
  >`
    select check_id, tag, points, passed, requirement_id, quote, note
      from scoring_check_result
     where workspace_id = ${workspaceId} and run_id = ${runId}
  `;

  return rows.map((row) => ({
    checkId: row.check_id,
    tag: row.tag,
    points: row.points,
    passed: row.passed,
    requirementId: row.requirement_id,
    quote: row.quote,
    note: row.note,
    evidence: "",
  }));
}

/** Every gap on an item, in every disposition — law 7 needs all of them. */
export async function readGapsForItem(workspaceId: string, itemId: string): Promise<ExistingGap[]> {
  const { sql } = sharedDbClient();

  const rows = await sql<{ id: string; check_id: string; disposition: string }[]>`
    select id, check_id, disposition::text as disposition
      from gap
     where workspace_id = ${workspaceId} and item_id = ${itemId}
  `;

  return rows.map((row) => ({
    id: row.id,
    checkId: row.check_id,
    disposition: row.disposition as ExistingGap["disposition"],
  }));
}

/**
 * One check the run did not ask, as it is written.
 *
 * `tag` and `points` are what the check was worth had it been asked — the run's
 * denominator does not contain them. `conditionWhen` is the pack's own sentence,
 * written affirmatively and stored because it was *false* of this artifact.
 */
export type NotAskedWrite = {
  checkId: string;
  tag: "must" | "should";
  points: number;
  conditionId: string;
  conditionWhen: string;
};

export type RunToWrite = {
  workspaceId: string;
  productId: string;
  itemId: string;
  artifactId: string;
  versionId: string;
  packId: string;
  packVersion: string;
  protocolVersion: string;
  provider: ProviderId;
  model: string;
  conditionsMet: string[];
  earned: number;
  denominator: number;
  verdicts: readonly VerifiedVerdict[];
  /**
   * The checks §4 took out of the denominator, and the condition that did it.
   *
   * Stored rather than re-derived, for the reason `tag` and `points` are copied
   * onto a verdict: §5 versions rubrics like documents, so a rubric edit must
   * not be able to change what an old run says it did not ask. See
   * `drizzle/0011_scoring_check_not_asked.sql`.
   */
  notAsked: readonly NotAskedWrite[];
  gapWrites: readonly GapWrite[];
  /**
   * Checks whose evidence `readAnswer` clipped to fit its column.
   *
   * Almost always empty. It lands in the `score.recorded` ledger row rather
   * than in a column of its own: the gap already carries the elision mark a
   * reader sees, and this is the part that says which run shortened it — "the
   * gap holds the current answer; the ledger holds how it got there".
   */
  clippedChecks: readonly string[];
  actor: UsageActor;
};

/**
 * Writes one run, its verdicts, its gap moves and the ledger — **in one
 * transaction**.
 *
 * §5's "no partial gaps" is not a discipline here, it is a `BEGIN`. A run that
 * inserted three gaps and then failed would leave an item carrying debts that
 * no score explains, and the next run would find them open and update them
 * forever.
 *
 * **Every gap write re-checks `disposition = 'open'` in its own WHERE clause.**
 * The reconciler decided law 7 from a snapshot read *outside* this transaction
 * (`run.ts` reads the gaps, then calls this), so between the two a human can
 * accept the very gap a verdict is about — and an UPDATE that trusted the
 * snapshot would rewrite a named person's debt, which is the act §1 law 7
 * exists to forbid. The guard makes the snapshot's assumption a condition of
 * the write rather than a hope. Where nothing changes, no ledger row is
 * written: a `gap.restated` entry for a gap that was not restated is the ledger
 * saying something that did not happen.
 *
 * Every move that *does* happen writes an `activity` row (§2: "every mutating
 * action — human or agent — records its actor, timestamp, and trigger"), and the
 * run's own row is the one a freshness clock reads. The gap holds the current answer; the ledger
 * holds how it got there, which is where `no-longer-applicable` lives — a
 * closed gap's row cannot say why it closed, and this is the reason it does not
 * need to.
 */
export async function writeRun(run: RunToWrite): Promise<string> {
  const { sql } = sharedDbClient();

  const actorKind = run.actor.kind;
  const actorUserId = run.actor.kind === "human" ? run.actor.userId : null;
  const actorAgent = run.actor.kind === "agent" ? run.actor.name : null;
  // §2's trigger: a human asked, or the agent went looking. Phase 4's sweep and
  // §11's webhooks are the other two, and they arrive with the scheduler.
  const trigger = run.actor.kind === "human" ? "user" : "agent";

  return sql.begin(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      insert into scoring_run (
        workspace_id, item_id, artifact_id, artifact_version_id,
        pack_id, pack_version, protocol_version,
        provider, model, conditions_met, earned, denominator
      ) values (
        ${run.workspaceId}, ${run.itemId}, ${run.artifactId}, ${run.versionId},
        ${run.packId}, ${run.packVersion}, ${run.protocolVersion},
        ${run.provider}::ai_provider, ${run.model},
        ${run.conditionsMet}, ${run.earned}, ${run.denominator}
      )
      returning id
    `;

    const runId = inserted[0]!.id;

    for (const verdict of run.verdicts) {
      await tx`
        insert into scoring_check_result (
          workspace_id, run_id, check_id, tag, points, passed,
          requirement_id, quote, note
        ) values (
          ${run.workspaceId}, ${runId}, ${verdict.checkId}, ${verdict.tag}::gap_tag,
          ${verdict.points}, ${verdict.passed},
          ${verdict.requirementId}, ${verdict.quote}, ${verdict.note}
        )
      `;
    }

    // §4's other half, in the same transaction as the verdicts: between the two
    // tables the run holds one row for every check the rubric contained, which
    // is what lets the meter's expansion be read off the run alone.
    for (const skipped of run.notAsked) {
      await tx`
        insert into scoring_check_not_asked (
          workspace_id, run_id, check_id, tag, points, condition_id, condition_when
        ) values (
          ${run.workspaceId}, ${runId}, ${skipped.checkId}, ${skipped.tag}::gap_tag,
          ${skipped.points}, ${skipped.conditionId}, ${skipped.conditionWhen}
        )
      `;
    }

    /**
     * One ledger row.
     *
     * **`::text::jsonb`, not `::jsonb`.** A bare cast lets the driver decide what
     * the bound parameter is, and where it decides "jsonb" the JSON text is
     * stored as a jsonb *string* rather than parsed into an object — same bytes
     * to the eye, and `metadata->>'reason'` returns null against it. The double
     * cast says text first, so the server parses. §15 reads this column with
     * `->>`, and a ledger that answers null to every question about itself is
     * not a ledger. `scoring-write.db.test.ts` asserts `jsonb_typeof` is
     * `object`, because the wrong shape is invisible in every other way.
     */
    const logActivity = async (
      action: string,
      subjectTable: string,
      subjectId: string,
      metadata: Record<string, string | number | null>,
    ): Promise<void> => {
      await tx`
        insert into activity (
          workspace_id, product_id, actor_kind, actor_user_id, actor_agent,
          action, trigger_source, subject_table, subject_id, metadata
        ) values (
          ${run.workspaceId}, ${run.productId}, ${actorKind}::actor_kind,
          ${actorUserId}, ${actorAgent},
          ${action}, ${trigger}::activity_trigger, ${subjectTable}, ${subjectId},
          ${JSON.stringify(metadata)}::text::jsonb
        )
      `;
    };

    for (const write of run.gapWrites) {
      if (write.kind === "insert") {
        const gapRows = await tx<{ id: string }[]>`
          insert into gap (workspace_id, item_id, check_id, tag, evidence)
          values (
            ${run.workspaceId}, ${run.itemId}, ${write.checkId},
            ${write.tag}::gap_tag, ${write.evidence}
          )
          returning id
        `;
        await logActivity("gap.raised", "gap", gapRows[0]!.id, {
          checkId: write.checkId,
          tag: write.tag,
          runId,
        });
        continue;
      }

      if (write.kind === "update") {
        // `updated_at` is the touch trigger's, not ours.
        const restated = await tx`
          update gap set evidence = ${write.evidence}
           where workspace_id = ${run.workspaceId} and id = ${write.gapId}
             and disposition = 'open'
        `;
        // Nothing changed means the gap stopped being open between the read
        // and here — someone accepted it. The ledger says only what happened.
        if (restated.count > 0) {
          await logActivity("gap.restated", "gap", write.gapId, {
            checkId: write.checkId,
            runId,
          });
        }
        continue;
      }

      // `closed` is the machine's disposition: a time, no name, no note. The
      // reason is a ledger fact, which is why the column does not exist.
      const closed = await tx`
        update gap
           set disposition = 'closed'::gap_disposition, resolved_at = now()
         where workspace_id = ${run.workspaceId} and id = ${write.gapId}
           and disposition = 'open'
      `;
      if (closed.count > 0) {
        await logActivity("gap.closed", "gap", write.gapId, {
          checkId: write.checkId,
          reason: write.reason === "passed" ? "passed" : "no longer applicable",
          runId,
        });
      }
    }

    // A run that lands clears the retry §5 queued, whatever set it.
    await tx`
      update artifact set next_scoring_attempt_at = null
       where workspace_id = ${run.workspaceId} and id = ${run.artifactId}
         and next_scoring_attempt_at is not null
    `;

    await logActivity("score.recorded", "scoring_run", runId, {
      packId: run.packId,
      packVersion: run.packVersion,
      protocolVersion: run.protocolVersion,
      earned: run.earned,
      denominator: run.denominator,
      artifactId: run.artifactId,
      // Null rather than an empty string on an ordinary run, so `->> 'clipped'
      // is not null` is the whole query for "which runs shortened evidence".
      clipped: run.clippedChecks.length > 0 ? run.clippedChecks.join(" ") : null,
    });

    return runId;
  });
}

/**
 * §5: "Provider outages queue scoring silently; the timestamp does the honest
 * work."
 *
 * No run row, no gaps, no ledger entry — a failure that wrote to the ledger
 * would be the error banner §5 refuses, in another form. The one mark it leaves
 * is when to try again, and the call that failed is already in `ai_usage` with
 * its outcome, which is where §15 reads failure rates.
 *
 * **The timestamp goes over as an ISO string, and it has to.** `drizzle()`
 * mutates the postgres.js client it is handed, replacing the type handlers, so
 * postgres.js's own `Date` serializer no longer runs on a raw tagged template
 * from that client — a `Date` reaches the wire encoder unconverted and throws
 * `The "string" argument must be of type string`. Drizzle's query builder is
 * unaffected because it converts before it gets there; only the raw `sql` from
 * `sharedDbClient()` is. T2.7 found this the way it would have been found in
 * production: a provider outage made a retryable failure, and §5's queue path
 * threw instead of queueing.
 */
export async function scheduleRetry(
  workspaceId: string,
  artifactId: string,
  nextAttemptAt: Date,
): Promise<void> {
  const { sql } = sharedDbClient();

  await sql`
    update artifact set next_scoring_attempt_at = ${nextAttemptAt.toISOString()}
     where workspace_id = ${workspaceId} and id = ${artifactId}
  `;
}

/* -------------------------------------------------------------------------- */
/* The read path — T2.4's meter, as the signed-in human                       */
/* -------------------------------------------------------------------------- */

/** One check's stored verdict, exactly as `scoring_check_result` holds it. */
export type RunCheckRow = {
  checkId: string;
  /** Copied from the pack at run time, so a run stays readable against its own rubric. */
  tag: "must" | "should";
  points: number;
  passed: boolean;
  requirementId: string | null;
  quote: string | null;
  note: string | null;
};

/** One check the run did not ask, exactly as `scoring_check_not_asked` holds it. */
export type RunNotAskedRow = {
  checkId: string;
  tag: "must" | "should";
  points: number;
  conditionId: string;
  /** The condition that did **not** hold, in the words of the pack that ran. */
  conditionWhen: string;
};

/** The newest run on an item, with its verdicts and §5's queue flag. */
export type LatestRun = StoredRun & {
  artifactId: string;
  /**
   * §5's queue, from the run's own artifact. Non-null means a retry is pending
   * — §10's "scored 6 h ago — retrying", never an error banner.
   */
  nextScoringAttemptAt: string | null;
  /**
   * Every stored verdict, **unordered**, for the reason `readRunResults` gives:
   * `check_id` sorts `prd-10` before `prd-2` and the database cannot know a
   * pack's order. `src/lib/scoring/run-view.ts` sorts these into it.
   */
  results: RunCheckRow[];
  /**
   * §4's renormalization, as the run recorded it — **unordered**, for the same
   * reason. Together with `results` this is one row per check in the rubric the
   * run scored against, which is what lets the expansion be read off the run
   * rather than recomputed against a pack that has moved on.
   */
  notAsked: RunNotAskedRow[];
};

/**
 * The newest scoring run on an item — §8's meter, and everything it expands into.
 *
 * **Newest, not "the one the cache would return".** `findRunForVersion` answers a
 * different question: whether *this* version against *this* pack and protocol has
 * already been scored, which is what stops a second opinion. A surface wants the
 * last thing that actually happened, whatever pack version produced it — a run
 * stamped with an older protocol is still the run whose number is on screen, and
 * showing nothing because the fingerprint moved would blank a meter over a
 * change the reader cannot see.
 *
 * One request, and both halves of the run's own account of itself come back with
 * it: the verdicts it reached, and the checks §4 took out of its denominator.
 * Neither is recomputed against today's pack — see
 * `drizzle/0011_scoring_check_not_asked.sql`. It rides `scoring_run_item_idx` on
 * `(workspace_id, item_id, scored_at desc)`, which exists for this.
 *
 * **The retry flag comes through the run's own artifact**, embedded rather than
 * read off the item's artifact list. An item may hold several artifacts and only
 * one of them is this run's; a queue flag taken from the wrong one would put
 * "retrying" beside a number that is not being re-scored.
 *
 * Returns null when nothing has ever scored this item — which is §10's hollow
 * track, and is not an error.
 */
export async function getLatestRunForItem(
  workspaceId: string,
  itemId: string,
): Promise<LatestRun | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scoring_run")
    .select(
      `id, artifact_id, pack_id, pack_version, protocol_version, provider, model,
       conditions_met, earned, denominator, scored_at,
       artifact(next_scoring_attempt_at),
       scoring_check_result(check_id, tag, points, passed, requirement_id, quote, note),
       scoring_check_not_asked(check_id, tag, points, condition_id, condition_when)`,
    )
    .eq("workspace_id", workspaceId)
    .eq("item_id", itemId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not read the scoring run: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    packId: data.pack_id,
    packVersion: data.pack_version,
    protocolVersion: data.protocol_version,
    provider: data.provider,
    model: data.model,
    conditionsMet: data.conditions_met,
    earned: data.earned,
    denominator: data.denominator,
    scoredAt: data.scored_at,
    artifactId: data.artifact_id,
    nextScoringAttemptAt: data.artifact?.next_scoring_attempt_at ?? null,
    results: (data.scoring_check_result ?? []).map((row) => ({
      checkId: row.check_id,
      tag: row.tag,
      points: row.points,
      passed: row.passed,
      requirementId: row.requirement_id,
      quote: row.quote,
      note: row.note,
    })),
    notAsked: (data.scoring_check_not_asked ?? []).map((row) => ({
      checkId: row.check_id,
      tag: row.tag,
      points: row.points,
      conditionId: row.condition_id,
      conditionWhen: row.condition_when,
    })),
  };
}
