/**
 * One end-to-end run of §6's author-critic loop on a markdown file — T3.1's
 * recorded run.
 *
 *   pnpm refine:file ../sample-juno-feature.md
 *   pnpm refine:file ../sample-juno-feature.md --heading "Date & Meet"
 *   pnpm refine:file ../sample-juno-feature.md --memory
 *
 * **The file is material, not the document.** The author drafts one section from
 * it under the heading given (or the file's first `##` heading), and the loop
 * refines that draft: the critic tests it, the author revises inside its scope,
 * and a third disagreement surfaces as an open question. Every round, the
 * section as it ends, and what the calls cost are printed.
 *
 * **Nothing about the run is special.** The same `draftSection`, the same
 * `refineArtifactSection` an item page would call, the same seam on the seed
 * workspace's own key. The draft is written as version 1 of a new item's PRD in
 * the seed workspace, attributed to the author agent, and every round lands in
 * `refinement_round`.
 *
 * `--memory` runs the same loop with the same models and keeps the rounds and
 * versions in this process instead — for a database that does not have migration
 * 0015 yet. The seam still meters every call to `ai_usage`.
 *
 * **Every run is paid provider calls**, one per critic pass and one per author
 * turn, at the generation tier. The input is never committed: `.gitignore`
 * carries `sample*.md`.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { and, eq, gte } from "drizzle-orm";

import { closeSharedDbClient, createDbClient } from "../src/db/client";
import { readRounds } from "../src/db/queries/refinement";
import { aiUsage, artifact, artifactVersion, item, product, workspace } from "../src/db/schema";
import { draftSection, refineSection } from "../src/lib/authoring/loop";
import type { Ledger, RefineResult, RoundWrite } from "../src/lib/authoring/loop";
import type { StoredRound } from "../src/lib/authoring/rounds";
import { refineArtifactSection, seamAgents } from "../src/lib/authoring/run";
import { parseSections, slugOf } from "../src/lib/authoring/sections";
import { formatSpend } from "../src/lib/ai/meter";
import { cardById, spendOf } from "../src/lib/ai/pricing";
import { applicableChecks, featurePrdPack } from "../src/packs";

const WORKSPACE_NAME = "Seed workspace";
const PRODUCT_SLUG = "sociera";
const ACTOR = { kind: "agent", name: "refine:file" } as const;

function argument(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main(): Promise<void> {
  const given = process.argv[2];
  if (!given || given.startsWith("--")) {
    console.error('usage: pnpm refine:file <path-to-markdown> [--heading "…"] [--memory]');
    process.exit(1);
  }
  const path = resolve(given);
  const material = await readFile(path, "utf8");
  const memory = process.argv.includes("--memory");

  const firstHeading = /^ {0,3}## +(.+?)\s*$/m.exec(material)?.[1];
  const heading = argument("--heading") ?? firstHeading ?? basename(path).replace(/\.[^.]+$/, "");

  const { db, sql } = createDbClient();
  try {
    const [ws] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.name, WORKSPACE_NAME))
      .limit(1);
    if (!ws) throw new Error(`No "${WORKSPACE_NAME}" — run pnpm db:seed first.`);
    const [prod] = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.workspaceId, ws.id), eq(product.slug, PRODUCT_SLUG)))
      .limit(1);
    if (!prod) throw new Error(`No "${PRODUCT_SLUG}" product in the seed workspace.`);

    const pack = featurePrdPack;
    const checkIds = applicableChecks(pack, []).map((check) => check.id);
    const agents = seamAgents({ workspaceId: ws.id, productId: prod.id, actor: ACTOR });
    const started = new Date();

    console.log(`material: ${path}`);
    console.log(
      `heading:  ## ${heading}   (${memory ? "rounds kept in memory" : "rounds stored"})`,
    );
    console.log(`checks in play: ${checkIds.join(", ")}\n`);

    const draft = await draftSection(
      { pack, checkIds, heading, material, conversation: [] },
      agents,
    );
    if (!draft.ok) {
      console.error(`draft not taken — ${draft.reason}: ${"detail" in draft ? draft.detail : ""}`);
      if (draft.reason === "provider")
        console.error(`  ${draft.failure.kind}: ${draft.failure.detail}`);
      process.exit(1);
    }
    console.log("── the author's draft ──────────────────────────────────────────");
    console.log(draft.text);
    console.log(`position: ${draft.position}\n`);

    const sectionId = slugOf(heading);
    let result: RefineResult | { ok: false; reason: string; detail: string };
    let rounds: (StoredRound & Partial<Pick<RoundWrite, "outsideSections">>)[];

    if (memory) {
      const kept: RoundWrite[] = [];
      let versions = 1;
      const ledger: Ledger = {
        rounds: async () => kept.map((round) => ({ ...round })),
        record: async (round) => {
          kept.push({ ...round });
          if (round.outcome !== "revised") return { versionId: null };
          versions += 1;
          return { versionId: `memory-v${versions}` };
        },
      };
      result = await refineSection(
        {
          pack,
          checkIds,
          body: draft.text,
          versionId: "memory-v1",
          sectionId,
          // In memory there is no human version, so there is no baseline: every
          // cycle is the first, which is what one run over one draft is (AA1).
          baseSectionHash: null,
          conversation: [],
        },
        agents,
        ledger,
      );
      rounds = kept;
    } else {
      const itemId = randomUUID();
      const artifactId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(item).values({
          id: itemId,
          workspaceId: ws.id,
          productId: prod.id,
          type: "feature",
          key: "",
          title: `${heading} (refine:file)`.slice(0, 200),
        });
        await tx
          .insert(artifact)
          .values({ id: artifactId, workspaceId: ws.id, itemId, kind: "prd" });
        await tx.insert(artifactVersion).values({
          workspaceId: ws.id,
          artifactId,
          versionNo: 1,
          content: { body: draft.text },
          contentHash: createHash("sha256").update(draft.text).digest("hex"),
          authoredByKind: "agent",
          authoredByAgent: "author",
        });
      });
      const [created] = await db.select({ key: item.key }).from(item).where(eq(item.id, itemId));
      console.log(`stored as ${created?.key ?? itemId} v1\n`);

      result = await refineArtifactSection({
        workspaceId: ws.id,
        artifactId,
        sectionId,
        conversation: [],
        actor: ACTOR,
      });
      rounds = await readRounds(ws.id, artifactId);
    }

    console.log("── rounds ──────────────────────────────────────────────────────");
    for (const round of [...rounds].sort(
      (a, b) =>
        a.checkId.localeCompare(b.checkId) || a.cycleNo - b.cycleNo || a.roundNo - b.roundNo,
    )) {
      // The cycle, because a cycle-1 round 1 and a cycle-2 round 1 are different
      // rounds about different text; and the cuts, because AA3's "nothing about
      // this path may be silent" is a claim about what a reader sees.
      const cut = (truncated: boolean) => (truncated ? " (cut to fit)" : "");
      console.log(
        `${round.checkId} · cycle ${round.cycleNo} · round ${round.roundNo} · ${round.outcome}`,
      );
      console.log(`  critic:   ${round.reason}${cut(round.reasonTruncated)}`);
      console.log(`  evidence: ${round.evidence}${cut(round.evidenceTruncated)}`);
      // A surfacing the author was never shown has no position, and a printed
      // `null` reads as one it gave.
      if (round.authorPosition !== null) console.log(`  author:   ${round.authorPosition}`);
      if (round.outsideSections) {
        console.log(`  outside:  ${round.outsideSections.join(", ")}`);
      }
      console.log();
    }

    if (!result.ok) {
      console.log(`loop stopped — ${result.reason}`);
      if ("failure" in result) console.log(`  ${result.failure.kind}: ${result.failure.detail}`);
      if ("detail" in result) console.log(`  ${result.detail}`);
    }
    if ("body" in result) {
      const section = parseSections(result.body).find((s) => s.id === sectionId);
      console.log("── the section as it stands ────────────────────────────────────");
      console.log(section?.text ?? "(missing)");
      console.log(`version: ${result.versionId}`);
    }

    const surfaced = rounds.filter((round) => round.outcome === "surfaced");
    console.log(`\nopen questions surfaced: ${surfaced.length}`);
    await reportSpend(db, ws.id, started);
  } finally {
    await sql.end();
    await closeSharedDbClient();
  }
}

/** What the run cost, from the rows the seam's meter wrote. */
async function reportSpend(
  db: ReturnType<typeof createDbClient>["db"],
  workspaceId: string,
  since: Date,
): Promise<void> {
  const rows = await db
    .select()
    .from(aiUsage)
    .where(and(eq(aiUsage.workspaceId, workspaceId), gte(aiUsage.occurredAt, since)));

  let spend = 0;
  const byPurpose = new Map<string, number>();
  for (const row of rows) {
    byPurpose.set(row.purpose, (byPurpose.get(row.purpose) ?? 0) + 1);
    const card = cardById(row.rateCard);
    spend += (card ? spendOf(card, row.model, row) : null) ?? 0;
  }
  const calls = [...byPurpose].map(([purpose, n]) => `${n} ${purpose}`).join(", ");
  console.log(`calls: ${calls || "none"} · cost $${formatSpend(spend)}`);
}

main().catch((error: unknown) => {
  console.error("refine:file failed:", error);
  process.exit(1);
});
