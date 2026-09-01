/**
 * Score a markdown document the scorer has never seen.
 *
 *   pnpm score:file ./sample-prd.md
 *   pnpm score:file /Users/you/Documents/some-real-prd.md
 *
 * The path may be relative to the repo or absolute and anywhere on disk.
 *
 * **The document is whatever the file says.** It is read as bytes and stored
 * unedited — nothing trims it, reformats it, adds headings the rubric likes, or
 * strips ones it does not. A file that is not a PRD at all is a legitimate input
 * and a low score is a legitimate answer; the point of this script is to find
 * out what the shipped scorer does with prose written by somebody who had never
 * heard of the rubric, and cleaning the input first would answer a different
 * question.
 *
 * **Nothing about the run is special.** Same pack, same `PROTOCOL_VERSION`, same
 * pinned model on the workspace's own key, same `scoreArtifact` the item page
 * calls — the only thing this script does that `score:smoke` does not is choose
 * the document. It writes an artifact version into the seed workspace the way
 * `seed.ts` does, then hands the artifact id to the same function. If the
 * numbers here are wrong they are wrong in the product too.
 *
 * **One item per file, not one per run.** A file scored twice is two versions of
 * one artifact — the shape of a document somebody keeps editing — rather than
 * two items with the same title. The item is matched on its title and on the
 * artifact having been authored by this script, so a file named after a seeded
 * item cannot append a version to it.
 *
 * **The input is never committed.** `.gitignore` carries `sample*.md`, so a file
 * named that way stays out of the repository by construction. Anything you feed
 * it from outside the repo was never in it to begin with. Real product
 * documents are somebody's confidential work and this repository is public —
 * name your scratch files `sample-*.md` and keep the rest outside.
 *
 * **Every run is a paid provider call.** §5's cache is keyed per artifact
 * version and this writes a new one each time, so scoring the same file twice
 * costs twice. That is the honest behaviour — a second run is a second opinion
 * on the same text, which is exactly what the cache exists to stop happening by
 * accident — but it means re-running to fix a typo in your document is not free.
 * The token and cost lines below are printed so the price is on screen rather
 * than discovered on an invoice.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { and, desc, eq, gte } from "drizzle-orm";

import { closeSharedDbClient, createDbClient } from "../src/db/client";
import { readRunResults } from "../src/db/queries/scoring";
import { aiUsage, artifact, artifactVersion, item, product, workspace } from "../src/db/schema";
import { formatSpend } from "../src/lib/ai/meter";
import { cardById, spendOf } from "../src/lib/ai/pricing";
import { scoreArtifact } from "../src/lib/scoring/run";
import { percentageOf } from "../src/packs";

const WORKSPACE_NAME = "Seed workspace";
const PRODUCT_SLUG = "sociera";

/** `item_title_len`: 1..200 after trimming. A long filename is not an error. */
const TITLE_MAX = 200;

async function main(): Promise<void> {
  const given = process.argv[2];
  if (!given) {
    console.error("usage: pnpm score:file <path-to-markdown>");
    process.exit(1);
  }

  // Resolved against the working directory, which pnpm sets to the repo root —
  // so a relative path means what the person typing it meant, and an absolute
  // path outside the repo passes through untouched.
  const path = resolve(given);

  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch (error) {
    console.error(`cannot read ${path}: ${(error as Error).message}`);
    process.exit(1);
  }

  if (body.trim().length === 0) {
    console.error(`${path} is empty — there is nothing to score.`);
    process.exit(1);
  }

  const title =
    basename(path)
      .replace(/\.[^.]+$/, "")
      .slice(0, TITLE_MAX)
      .trim() || "Untitled";
  const words = body.trim().split(/\s+/).length;

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

    const products = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.workspaceId, workspaceId), eq(product.slug, PRODUCT_SLUG)))
      .limit(1);

    const productId = products.at(0)?.id;
    if (!productId) {
      console.error(`No "${PRODUCT_SLUG}" product — reseed against the current seed.`);
      process.exit(1);
    }

    // One item per file, not one per run. Re-scoring `sample-juno.md` five times
    // is five versions of one artifact — which is what the thing being modelled
    // actually is, a document somebody keeps editing — rather than five items
    // named the same thing. A workspace that fills up one item per experiment is
    // its own mess, and the seeded list surface stops being readable.
    //
    // Matched on title *and* on the artifact having been written by this script:
    // a file named `Ghost mode.md` must not append a version to the seeded golden
    // sample. `authored_by_agent` is already the provenance that says who wrote a
    // version, so this reuses it rather than inventing a marker column.
    const existing = await db
      .select({ itemId: item.id, artifactId: artifact.id })
      .from(item)
      .innerJoin(artifact, and(eq(artifact.itemId, item.id), eq(artifact.kind, "prd")))
      .innerJoin(
        artifactVersion,
        and(
          eq(artifactVersion.artifactId, artifact.id),
          eq(artifactVersion.authoredByAgent, "score:file"),
        ),
      )
      .where(
        and(
          eq(item.workspaceId, workspaceId),
          eq(item.productId, productId),
          eq(item.title, title),
        ),
      )
      .limit(1);

    const reused = existing.at(0);
    const itemId = reused?.itemId ?? randomUUID();
    const artifactId = reused?.artifactId ?? randomUUID();

    // One transaction: an item with no artifact is a row nothing can score, and
    // the scorer runs on its own connection so these have to be committed first.
    await db.transaction(async (tx) => {
      if (!reused) {
        await tx.insert(item).values({
          id: itemId,
          workspaceId,
          productId,
          opportunityId: null,
          type: "feature",
          // Assigned by `app.assign_item_key()`; overwritten whatever is passed.
          key: "",
          title,
          // Left null rather than guessed. §4 assigns flow intent by the same
          // classification call that proposes the type, and that call is Phase 3 —
          // an unclassified item is not a "value" item.
          flowIntent: null,
        });

        await tx.insert(artifact).values({ id: artifactId, workspaceId, itemId, kind: "prd" });
      }

      await tx.insert(artifactVersion).values({
        workspaceId,
        artifactId,
        // Assigned by trigger; Drizzle needs the column present. On a reused
        // artifact this is the next version, not another 1.
        versionNo: 1,
        content: { body },
        // A real digest of the real bytes. The cache is keyed per version rather
        // than per hash, so this is provenance — but a provenance column holding
        // a made-up value is worse than none.
        contentHash: createHash("sha256").update(body).digest("hex"),
        // §2's first-class agent: nobody typed this into aenima.
        authoredByKind: "agent",
        authoredByAgent: "score:file",
      });
    });

    const created = await db
      .select({ key: item.key })
      .from(item)
      .where(eq(item.id, itemId))
      .limit(1);

    const key = created.at(0)?.key ?? "?";

    // The trigger chose it, so it is read back rather than assumed — on a reused
    // artifact "v1" would be a lie, and the version is what the cache is keyed on.
    const versions = await db
      .select({ versionNo: artifactVersion.versionNo })
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, artifactId))
      .orderBy(desc(artifactVersion.versionNo))
      .limit(1);

    const versionNo = versions.at(0)?.versionNo ?? 1;

    console.log(`scoring ${path}`);
    console.log(
      `  ${words.toLocaleString()} words · ${body.length.toLocaleString()} characters` +
        ` → ${key} "${title}" v${versionNo}` +
        `${reused ? " (existing item, new version)" : " (new item)"}\n`,
    );

    const started = new Date();
    const result = await scoreArtifact({
      workspaceId,
      artifactId,
      actor: { kind: "agent", name: "scorer" },
    });
    const elapsed = Date.now() - started.getTime();

    if (!result.ok) {
      console.error(`  not scored — ${result.reason}: ${result.detail}`);
      if (result.reason === "provider") {
        console.error(
          result.nextAttemptAt
            ? `  queued, next attempt ${result.nextAttemptAt.toISOString()}`
            : "  not queued — retrying would not help",
        );
      }
      console.error(`\n  ${key} and its artifact stay behind, unscored.`);
      process.exit(1);
    }

    const { run } = result;

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

    await reportSpend(db, workspaceId, started);

    // The stored rows rather than the in-memory run: `CheckResult` carries
    // evidence only for a failure, and a passing check's quote — what the scorer
    // thinks it *found* — lives in `scoring_check_result`. Same read the item
    // page's expansion uses.
    const verdicts = await readRunResults(workspaceId, result.runId);
    const order = new Map(run.results.map((r, index) => [r.checkId, index]));
    verdicts.sort(
      (a, b) =>
        (order.get(a.checkId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.checkId) ?? Number.MAX_SAFE_INTEGER),
    );

    const unclear = verdicts.filter((v) => !v.passed);
    const passed = verdicts.filter((v) => v.passed);
    const musts = unclear.filter((v) => v.tag === "must").length;

    console.log(
      `\n  ${unclear.length} of ${verdicts.length} checks unclear` +
        `${musts > 0 ? ` — ${musts} of them Must` : ""}:\n`,
    );
    for (const verdict of unclear) print(verdict);

    // The other half of interrogating a number is seeing what the scorer
    // accepted, not only what it did not.
    //
    // **Today this prints nothing, and the reason is the protocol, not this
    // script.** `prompt.ts` tells the scorer "A passing verdict carries none of
    // the three. Leave all three empty", so `quote` is null on every passing row
    // in the database — 0 of 44 at the time of writing. The loop stays because
    // it is right the moment that sentence changes, and the line below says why
    // the count is zero rather than letting it read as a defect. Changing the
    // sentence is a real decision, not a tweak: `PROTOCOL_VERSION` is a hash of
    // the assembled context, so editing it moves the version, invalidates §5's
    // cache for every stored run, and triggers the re-baseline §5 requires.
    const cited = passed.filter((v) => v.quote !== null);
    console.log(`  ${passed.length} passed, ${cited.length} of them citing the document:\n`);
    if (passed.length > 0 && cited.length === 0) {
      console.log(
        "    (none can: the protocol tells the scorer a passing verdict carries\n" +
          "     no quote, no note and no requirement id. Nothing here suppresses\n" +
          "     them — they were never asked for.)\n",
      );
    }
    for (const verdict of cited) print(verdict);

    console.log(
      `  ${run.earned}/${run.denominator} = ${percentageOf(run.earned, run.denominator).toFixed(1)}`,
    );
    console.log(`  ${key} is on /i/${key} if you want to read it on the page.`);
  } finally {
    await sql.end();
    // The AI layer's connection outlives a request by design; a script says when
    // it is done or hangs on an open handle.
    await closeSharedDbClient();
  }
}

/** One check, as the scorer answered it. */
function print(verdict: {
  checkId: string;
  tag: string;
  points: number;
  requirementId: string | null;
  quote: string | null;
  note: string | null;
}): void {
  const requirement = verdict.requirementId ? ` · ${verdict.requirementId}` : "";
  console.log(`  ${verdict.checkId} (${verdict.tag}, ${verdict.points})${requirement}`);
  if (verdict.quote) console.log(`    quote: ${verdict.quote}`);
  if (verdict.note) console.log(`    note:  ${verdict.note}`);
  console.log();
}

/**
 * What the run cost, from the rows the meter already writes.
 *
 * Read back rather than threaded out of `scoreArtifact`: §15's meter is where
 * spend lives, the AI seam writes it on every call including the failures, and a
 * second path to the same number would be a second number.
 */
async function reportSpend(
  db: ReturnType<typeof createDbClient>["db"],
  workspaceId: string,
  since: Date,
): Promise<void> {
  const rows = await db
    .select({
      model: aiUsage.model,
      rateCard: aiUsage.rateCard,
      outcome: aiUsage.outcome,
      uncachedInputTokens: aiUsage.uncachedInputTokens,
      cacheReadTokens: aiUsage.cacheReadTokens,
      cacheWriteTokens: aiUsage.cacheWriteTokens,
      outputTokens: aiUsage.outputTokens,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.workspaceId, workspaceId), gte(aiUsage.occurredAt, since)))
    .orderBy(desc(aiUsage.occurredAt));

  if (rows.length === 0) {
    console.log("  tokens: none — the cache answered and no provider was called");
    return;
  }

  let spend = 0;
  let unpriced = 0;
  const total = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

  for (const row of rows) {
    total.input += row.uncachedInputTokens;
    total.cacheRead += row.cacheReadTokens;
    total.cacheWrite += row.cacheWriteTokens;
    total.output += row.outputTokens;

    const card = cardById(row.rateCard);
    const priced = card ? spendOf(card, row.model, row) : null;
    // Counted, never treated as zero: a call nobody can price is the one thing
    // a spend line must not round away.
    if (priced === null) unpriced += 1;
    else spend += priced;
  }

  const calls = rows.length > 1 ? ` over ${rows.length} calls` : "";
  console.log(
    `  tokens: ${total.input.toLocaleString()} in · ` +
      `${total.cacheWrite.toLocaleString()} cache write · ` +
      `${total.cacheRead.toLocaleString()} cache read · ` +
      `${total.output.toLocaleString()} out${calls}`,
  );
  console.log(
    `  cost:   $${formatSpend(spend)} (${spend.toLocaleString()} µ$)` +
      `${unpriced > 0 ? ` — ${unpriced} call(s) unpriced` : ""}`,
  );
}

main().catch((error: unknown) => {
  console.error("score:file failed:", error);
  process.exit(1);
});
