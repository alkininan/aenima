import "server-only";

import {
  findRunForVersion,
  readGapsForItem,
  readRunResults,
  readScorableArtifact,
  scheduleRetry,
  writeRun,
} from "@/db/queries/scoring";
import type { UsageActor } from "@/db/queries/ai-usage";
import { runScorer } from "@/lib/ai";
import type { AiFailure } from "@/lib/ai";
import { allChecks, applicableChecks, listPacks, percentageOf, scoreRun } from "@/packs";
import type { ScoringRun, SkillPack } from "@/packs";

import { readAnswer } from "./answer";
import { renderEvidence } from "./evidence";
import { PROTOCOL_VERSION, assembleContext, renderArtifact } from "./prompt";
import { reconcileGaps } from "./reconcile";
import type { ReconcileVerdict } from "./reconcile";
import { maxTokensFor, verdictSchemaFor } from "./schema";

/**
 * The scoring run — product-spec.md §5.
 *
 * An artifact version and a pack go in; per-check verdicts with quoted evidence
 * come out, are stored, and open gaps appear. One call to one model per run,
 * not one per check: nineteen checks in nineteen calls is nineteen times the
 * same rubric prefix, which is the whole reason §12 structures caching around a
 * stable context.
 *
 * The shape, and where each step's authority comes from:
 *
 * 1. resolve the artifact's latest version and its pack
 * 2. **cache** — a run for this version, this rubric version and this protocol
 *    version already exists? return it, and never call a provider (§5)
 * 3. assemble the context (protocol + rubric) and the input (the artifact)
 * 4. one `runScorer` call — §5's pinned model, and no tier exists to pass
 * 5. a failure writes **nothing**, and queues a retry only if it is retryable
 * 6. code turns the answer into a score: conditions → applicable checks →
 *    verified quotes → renormalized denominator (§4, §12's code node law)
 * 7. one transaction writes the run, its verdicts, its gap moves and the ledger,
 *    and a transaction that refuses returns a failure rather than throwing
 */

/**
 * How long a queued re-score waits when the provider is simply unavailable.
 *
 * A placeholder for one thing only — the field's writer needs a number and
 * §5's scheduler is Phase 4, where the webhook, the debounce and the nightly
 * sweep are one piece of machinery. **Backoff belongs there, not here**; this
 * is a flat delay, and a provider that stays down produces a queue of artifacts
 * whose attempt time has passed, which is exactly what a sweep reads.
 */
const RETRY_DELAY_MS = 15 * 60 * 1000;

export type ScoreInput = {
  workspaceId: string;
  artifactId: string;
  actor: UsageActor;
};

export type ScoreResult =
  | {
      ok: true;
      /** True when §5's cache answered and no provider was called. */
      cached: boolean;
      runId: string;
      run: ScoringRun;
    }
  | { ok: false; reason: "not-scorable"; detail: string }
  | {
      ok: false;
      reason: "provider";
      detail: string;
      failure: AiFailure;
      /** When §5's queue will try again, or null for a failure that will not. */
      nextAttemptAt: Date | null;
    }
  | { ok: false; reason: "answer"; detail: string }
  /**
   * The transaction refused the run — a constraint, a deadlock, a connection
   * that went away mid-write.
   *
   * Typed rather than thrown, because a caller that has already paid for a
   * provider call deserves an answer it can act on: §5's four failure shapes
   * are what `score-smoke` prints and what T2.4's surface will read, and an
   * exception escaping past all of them is the one outcome none of them
   * describes. **No retry is queued**, for the same reason `answer` queues
   * none: the same verdicts written the same way will be refused the same way,
   * and §5's queue is for outages, not for bugs.
   */
  | { ok: false; reason: "write"; detail: string };

/**
 * The pack for an artifact kind.
 *
 * A plain lookup over the registry, which is all §7 asks for today. Build-log
 * open question 12 is where this gets harder: §7.2 is the *Feature* PRD rubric
 * and §4 gives each of the seven item types its own weight centre, so `prd` will
 * eventually have more than one pack and selection will need the item's type.
 * Nothing here decides that early.
 */
export function packForKind(kind: string): SkillPack | undefined {
  return listPacks().find((pack) => pack.artifactKind === kind);
}

export async function scoreArtifact(input: ScoreInput): Promise<ScoreResult> {
  const artifact = await readScorableArtifact(input.workspaceId, input.artifactId);
  if (!artifact) {
    return {
      ok: false,
      reason: "not-scorable",
      detail: "artifact has no versions — an artifact row is identity, not content",
    };
  }

  const pack = packForKind(artifact.kind);
  if (!pack) {
    return {
      ok: false,
      reason: "not-scorable",
      detail: `no pack ships for artifact kind ${artifact.kind}`,
    };
  }

  // §5: results cache per artifact version. An artifact version is immutable,
  // so this run cannot differ from the stored one — and asking a model again
  // could return a different number for text that did not change, which is the
  // failure the cache exists to prevent.
  const cached = await findRunForVersion(
    input.workspaceId,
    artifact.versionId,
    pack.id,
    pack.version,
    PROTOCOL_VERSION,
  );

  if (cached) {
    // Pack order, not the order the rows came back in. A run reads as a list of
    // checks a person compares against the last one, and `check_id` sorts
    // `prd-10` before `prd-2` — the same run would reshuffle between the write
    // and the read. `applicableChecks` is the order everything else uses.
    const order = new Map(
      applicableChecks(pack, cached.conditionsMet).map((check, index) => [check.id, index]),
    );
    const results = (await readRunResults(input.workspaceId, cached.id)).sort(
      (a, b) =>
        (order.get(a.checkId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.checkId) ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      ok: true,
      cached: true,
      runId: cached.id,
      run: {
        packId: cached.packId,
        packVersion: cached.packVersion,
        provider: cached.provider,
        model: cached.model,
        conditionsMet: cached.conditionsMet,
        // The parts are stored apart and rendered by the one renderer, so a
        // run read back reads exactly as it did when it was written.
        results: results.map((verdict) =>
          verdict.passed
            ? { checkId: verdict.checkId, passed: true }
            : {
                checkId: verdict.checkId,
                passed: false,
                evidence: renderEvidence({
                  requirementId: verdict.requirementId,
                  quote: verdict.quote,
                  note: verdict.note ?? "",
                }),
              },
        ),
        // The stored numbers are the run's; only the division happens here, in
        // the one place that divides.
        earned: cached.earned,
        denominator: cached.denominator,
        score: percentageOf(cached.earned, cached.denominator),
      },
    };
  }

  const artifactText = renderArtifact(artifact.content);

  const answer = await runScorer(
    {
      workspaceId: input.workspaceId,
      productId: artifact.productId,
      actor: input.actor,
    },
    {
      purpose: "score",
      context: assembleContext(pack),
      input: artifactText,
      schema: verdictSchemaFor(pack),
      maxTokens: maxTokensFor(pack),
    },
  );

  if (!answer.ok) {
    // §5: a failed run writes nothing. No run row, no partial gaps, no
    // half-scored artifact. The only mark is when to try again, and only when
    // trying again could help — a pinned model that answered off-schema is a
    // quality signal §15 reads out of the `ai_usage` row the seam wrote, not an
    // outage to queue behind.
    const nextAttemptAt = answer.failure.retryable
      ? new Date(Date.now() + retryDelayFor(answer.failure))
      : null;

    if (nextAttemptAt) {
      await scheduleRetry(input.workspaceId, artifact.artifactId, nextAttemptAt);
    }

    return {
      ok: false,
      reason: "provider",
      detail: answer.failure.detail,
      failure: answer.failure,
      nextAttemptAt,
    };
  }

  const read = readAnswer(pack, answer.value, artifactText);
  if (!read.ok) {
    // An answer that cannot be trusted is not scored down, it is not scored.
    return { ok: false, reason: "answer", detail: read.detail };
  }

  // §12's code node law: the model judged, and everything from here is
  // arithmetic. `scoreRun` is T2.1's pure function over the pack.
  const { earned, denominator, score } = scoreRun(pack, read.conditionsMet, read.results);

  const gaps = await readGapsForItem(input.workspaceId, artifact.itemId);
  const gapWrites = reconcileGaps({
    verdicts: read.verdicts.map((verdict): ReconcileVerdict => ({
      checkId: verdict.checkId,
      tag: verdict.tag,
      passed: verdict.passed,
      evidence: verdict.evidence,
    })),
    packCheckIds: allChecks(pack).map((check) => check.id),
    gaps,
  });

  let runId: string;
  try {
    runId = await writeRun({
      workspaceId: input.workspaceId,
      productId: artifact.productId,
      itemId: artifact.itemId,
      artifactId: artifact.artifactId,
      versionId: artifact.versionId,
      packId: pack.id,
      packVersion: pack.version,
      protocolVersion: PROTOCOL_VERSION,
      provider: answer.provider,
      model: answer.model,
      conditionsMet: read.conditionsMet,
      earned,
      denominator,
      verdicts: read.verdicts,
      gapWrites,
      clippedChecks: read.clipped,
      actor: input.actor,
    });
  } catch (error) {
    // The transaction rolled back, so §5's "a failed run writes nothing" still
    // holds — this is only about how the caller hears it. The provider call is
    // already in `ai_usage` with its outcome, which is where §15 reads from.
    return {
      ok: false,
      reason: "write",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    cached: false,
    runId,
    run: {
      packId: pack.id,
      packVersion: pack.version,
      provider: answer.provider,
      model: answer.model,
      conditionsMet: read.conditionsMet,
      results: read.results,
      earned,
      denominator,
      score,
    },
  };
}

/** The provider's own number when it sent one, and a flat delay when it did not. */
function retryDelayFor(failure: AiFailure): number {
  if (failure.kind === "rate-limited" && failure.retryAfterMs !== null) {
    return failure.retryAfterMs;
  }
  return RETRY_DELAY_MS;
}
