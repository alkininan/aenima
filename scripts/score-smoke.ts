/**
 * One real scoring run, end to end, against the seeded Ghost mode PRD.
 *
 * What a unit test cannot reach: that a nineteen-check rubric and a real
 * document fit in one call, that a real model returns a verdict for every check
 * rather than the ones it found interesting, that its quotes are actually in the
 * artifact, and that §4's renormalization comes out where the document was
 * built to put it — 99, not 100 and not 105.
 *
 * It prints the score, the denominator, and every failed check with its quote,
 * which is §1 law 3 in the smallest possible surface: a number, and the exact
 * text behind it.
 *
 *   pnpm db:seed && pnpm score:smoke
 *
 * Run it twice. The second run reports `cached` and calls no provider — §5's
 * "results cache per artifact version", proved against a real database rather
 * than a fake.
 */
import { and, eq } from "drizzle-orm";

import { closeSharedDbClient, createDbClient } from "../src/db/client";
import { artifact, item, workspace } from "../src/db/schema";
import { scoreArtifact } from "../src/lib/scoring/run";
import { getPack, percentageOf } from "../src/packs";

const WORKSPACE_NAME = "Seed workspace";
const ITEM_TITLE = "Ghost mode";

async function main(): Promise<void> {
  const { db, sql } = createDbClient();

  try {
    const workspaces = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.name, WORKSPACE_NAME))
      .limit(1);

    const workspaceId = workspaces.at(0)?.id;
    if (!workspaceId) {
      console.error(`No "${WORKSPACE_NAME}" — run pnpm db:seed first.`);
      process.exit(1);
    }

    const items = await db
      .select({ id: item.id, key: item.key })
      .from(item)
      .where(and(eq(item.workspaceId, workspaceId), eq(item.title, ITEM_TITLE)))
      .limit(1);

    const scored = items.at(0);
    if (!scored) {
      console.error(`No item titled "${ITEM_TITLE}" — reseed against the current seed.`);
      process.exit(1);
    }

    const artifacts = await db
      .select({ id: artifact.id })
      .from(artifact)
      .where(and(eq(artifact.workspaceId, workspaceId), eq(artifact.itemId, scored.id)))
      .limit(1);

    const target = artifacts.at(0);
    if (!target) {
      console.error(`Item ${scored.key} carries no artifact.`);
      process.exit(1);
    }

    console.log(`scoring ${scored.key} — "${ITEM_TITLE}"\n`);

    const started = Date.now();
    const result = await scoreArtifact({
      workspaceId,
      artifactId: target.id,
      // §2's first-class agent. A smoke run is nobody's action but the system's.
      actor: { kind: "agent", name: "scorer" },
    });
    const elapsed = Date.now() - started;

    if (!result.ok) {
      console.error(`  not scored — ${result.reason}: ${result.detail}`);
      if (result.reason === "provider") {
        console.error(
          result.nextAttemptAt
            ? `  queued, next attempt ${result.nextAttemptAt.toISOString()}`
            : "  not queued — retrying would not help",
        );
      }
      process.exit(1);
    }

    const { run } = result;
    const pack = getPack(run.packId);

    console.log(
      `  ${run.score.toFixed(1)} / 100  (${run.earned} of ${run.denominator} points)` +
        `${result.cached ? "  — cached, no provider call" : ""}`,
    );
    console.log(
      `  ${run.packId}@${run.packVersion} · ${run.provider} · ${run.model} · ${elapsed}ms`,
    );
    console.log(
      `  conditions met: ${run.conditionsMet.length > 0 ? run.conditionsMet.join(", ") : "none"}`,
    );

    const failed = run.results.filter((result) => !result.passed);
    const musts = failed.filter(
      (result) => pack && findTag(pack, result.checkId) === "must",
    ).length;

    console.log(
      `\n  ${failed.length} of ${run.results.length} checks failed` +
        `${musts > 0 ? ` — ${musts} of them Must` : ""}:\n`,
    );

    for (const result of failed) {
      if (result.passed) continue;
      const tag = pack ? findTag(pack, result.checkId) : "?";
      console.log(`  ${result.checkId} (${tag})`);
      console.log(`    ${result.evidence}\n`);
    }

    // Says out loud what the arithmetic says, so a wrong denominator is visible
    // rather than merely printed.
    console.log(
      `  ${run.earned}/${run.denominator} = ${percentageOf(run.earned, run.denominator).toFixed(1)}`,
    );
  } finally {
    await sql.end();
    // The AI layer's connection outlives a request by design; a script says
    // when it is done or hangs on an open handle.
    await closeSharedDbClient();
  }
}

function findTag(
  pack: {
    checks: { id: string; tag: string }[];
    layers: { checks: { id: string; tag: string }[] }[];
  },
  checkId: string,
): string {
  const all = [...pack.checks, ...pack.layers.flatMap((layer) => layer.checks)];
  return all.find((check) => check.id === checkId)?.tag ?? "?";
}

main().catch((error: unknown) => {
  console.error("score smoke failed:", error);
  process.exit(1);
});
