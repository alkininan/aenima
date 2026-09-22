import "server-only";

import type { UsageActor } from "@/db/queries/ai-usage";
import {
  readHumanBaseline,
  readRounds,
  readVersionConditions,
  writeRound,
} from "@/db/queries/refinement";
import { readScorableArtifact } from "@/db/queries/scoring";
import { runGeneration } from "@/lib/ai";
import type { CallContext } from "@/lib/ai";
import { packForKind } from "@/lib/scoring/run";
import { applicableChecks } from "@/packs";

import { refineSection } from "./loop";
import type { Agents, Ledger, RefineResult } from "./loop";
import type { Turn } from "./prompt";
import { parseSections, sectionHash } from "./sections";
import {
  AUTHOR_MAX_TOKENS,
  CRITIC_MAX_TOKENS,
  authorAnswerSchema,
  criticAnswerSchema,
} from "./schema";

/**
 * The loop wired to the product: T2.2's seam for the two agents, the database
 * for the ledger — product-spec.md §6.
 *
 * "Both run through T2.2's seam at the generation tier." The critic meters as
 * `critique` and the author as `draft`, so §15 can tell the judge's spend from
 * the writer's.
 */

/** The author and the critic, each one generation-tier call through the seam. */
export function seamAgents(context: CallContext): Agents {
  return {
    critic: (request) =>
      runGeneration(context, {
        purpose: "critique",
        ...request,
        schema: criticAnswerSchema,
        maxTokens: CRITIC_MAX_TOKENS,
      }),
    author: (request) =>
      runGeneration(context, {
        purpose: "draft",
        ...request,
        schema: authorAnswerSchema,
        maxTokens: AUTHOR_MAX_TOKENS,
      }),
  };
}

/**
 * A write the ledger refused. Tagged where it happens so that a bug elsewhere in
 * the loop — its pass limit, a thrown invariant — is not reported as the
 * database refusing a round.
 */
class LedgerWriteError extends Error {}

export type RefineArtifactInput = {
  workspaceId: string;
  artifactId: string;
  sectionId: string;
  conversation: readonly Turn[];
  actor: UsageActor;
};

export type RefineArtifactResult =
  | RefineResult
  | { ok: false; reason: "not-refinable"; detail: string }
  /** The ledger refused a write — a constraint, a connection gone mid-transaction. */
  | { ok: false; reason: "write"; detail: string };

/**
 * One section of an artifact's latest version, refined until it settles or
 * surfaces.
 *
 * The checks in play are the ones §4's engine left in the denominator on the
 * scoring run for **the version under refinement** (AA2); a version nothing has
 * scored has only the checks no condition governs, since no condition is known
 * to hold of it.
 *
 * §6's cap is counted against the section's **human baseline** (AA1) — its text
 * in the newest human-authored version — so that a surfaced check reopens when
 * the human rewrites the section and not when the author revises it.
 */
export async function refineArtifactSection(
  input: RefineArtifactInput,
): Promise<RefineArtifactResult> {
  const artifact = await readScorableArtifact(input.workspaceId, input.artifactId);
  if (!artifact) {
    return { ok: false, reason: "not-refinable", detail: "artifact has no versions" };
  }

  const pack = packForKind(artifact.kind);
  if (!pack) {
    return {
      ok: false,
      reason: "not-refinable",
      detail: `no pack ships for artifact kind ${artifact.kind}`,
    };
  }

  // Sections are a parse over a markdown body. Content of any other shape has
  // no `##` blocks to refine, and a revision written back as `{ body }` would
  // change its shape — so it is not refined rather than refined wrongly.
  const body = markdownBody(artifact.content);
  if (body === null) {
    return { ok: false, reason: "not-refinable", detail: "artifact content has no markdown body" };
  }

  const conditions = (await readVersionConditions(input.workspaceId, artifact.versionId)) ?? [];
  const checkIds = applicableChecks(pack, conditions).map((check) => check.id);

  // The cycle's baseline. An artifact no human has cut a version of, and a
  // section no human version holds, both give null: nothing the human wrote can
  // have changed, so every closure stands where it is.
  const baseline = await readHumanBaseline(input.workspaceId, input.artifactId);
  const baseBody = baseline === null ? null : markdownBody(baseline.content);
  const baseSectionHash =
    baseBody === null ? null : sectionHash(parseSections(baseBody), input.sectionId);

  const ledger: Ledger = {
    rounds: () => readRounds(input.workspaceId, input.artifactId),
    record: async (round) => {
      try {
        return await writeRound({
          workspaceId: input.workspaceId,
          productId: artifact.productId,
          itemId: artifact.itemId,
          artifactId: artifact.artifactId,
          round,
          actor: input.actor,
        });
      } catch (error) {
        throw new LedgerWriteError(error instanceof Error ? error.message : String(error));
      }
    },
  };

  try {
    return await refineSection(
      {
        pack,
        checkIds,
        body,
        versionId: artifact.versionId,
        sectionId: input.sectionId,
        baseSectionHash,
        conversation: input.conversation,
      },
      seamAgents({
        workspaceId: input.workspaceId,
        productId: artifact.productId,
        actor: input.actor,
      }),
      ledger,
    );
  } catch (error) {
    // Each round's transaction rolled back whole, so the ledger still says
    // exactly what happened up to the write that failed. Anything else that
    // throws is a bug, and is left to be one.
    if (error instanceof LedgerWriteError) {
      return { ok: false, reason: "write", detail: error.message };
    }
    throw error;
  }
}

/** `{ body: string }`'s body, or null for content of any other shape. */
export function markdownBody(content: unknown): string | null {
  if (content !== null && typeof content === "object" && "body" in content) {
    const { body } = content as { body: unknown };
    if (typeof body === "string") return body;
  }
  return null;
}
