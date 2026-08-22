import "server-only";

import type { Database } from "@/db/database.types";
import { createClient } from "@/lib/supabase/server";
import { deriveStage, type ArtifactPresence, type Stage } from "@/lib/stage";

/**
 * Item reads — the bottom of the §2 tree, and the shape the list surface needs.
 *
 * **These queries fetch artifacts alongside items on purpose.** Stage is
 * derived in TypeScript (`src/lib/stage.ts`), so rendering a list of items
 * means knowing every item's artifacts. Fetching them per item would be an N+1
 * that grows with the workspace and would only be noticed once someone had a
 * hundred items. PostgREST resource embedding puts the whole tree in one
 * request, which the database executes as one statement with lateral joins and
 * RLS applied to each embedded relation independently.
 *
 * Nothing here stores or transmits a stage. `deriveStage` runs on the way out,
 * per read. There is no stage column to drift from the artifacts it describes.
 */

type ItemType = Database["public"]["Enums"]["item_type"];
type FlowIntent = Database["public"]["Enums"]["flow_intent"];
type GapTag = Database["public"]["Enums"]["gap_tag"];
type GapDisposition = Database["public"]["Enums"]["gap_disposition"];

export type ItemSummary = {
  id: string;
  title: string;
  type: ItemType;
  /** §4: null until the classifier ships. Not a default — a real state. */
  flowIntent: FlowIntent | null;
  opportunityId: string | null;
  /** Derived, never stored. See src/lib/stage.ts. */
  stage: Stage;
  artifacts: ArtifactPresence[];
  /** §13 sorts the at-risk bucket by blocking-gap age; this is the count behind it. */
  openGapCount: number;
};

export type GapDetail = {
  id: string;
  checkId: string;
  tag: GapTag;
  disposition: GapDisposition;
  evidence: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type DecisionDetail = {
  id: string;
  statement: string;
  reason: string;
  decidedByUserId: string;
  decidedAt: string;
  supersedesId: string | null;
};

export type ItemDetail = ItemSummary & {
  gaps: GapDetail[];
  decisions: DecisionDetail[];
};

/**
 * The embedded selection both reads share.
 *
 * `artifact_version(count)` asks PostgREST for the number of versions rather
 * than the versions themselves — `deriveStage` only needs to know whether an
 * artifact was ever authored into, and version *content* on a list screen would
 * be megabytes to answer a boolean.
 */
const ITEM_TREE =
  "id, title, type, flow_intent, opportunity_id, artifact(kind, artifact_version(count))";

/** PostgREST returns an embedded `count` as `[{ count: n }]`. */
type CountRow = { count: number }[];

function toArtifacts(
  rows: { kind: ArtifactPresence["kind"]; artifact_version: CountRow }[] | null,
): ArtifactPresence[] {
  return (rows ?? []).map((row) => ({
    kind: row.kind,
    versionCount: row.artifact_version[0]?.count ?? 0,
  }));
}

/**
 * Every item in a product, with what each owns and the stage that follows from
 * it. One request regardless of how many items come back.
 */
export async function listItemsForProduct(
  workspaceId: string,
  productId: string,
): Promise<ItemSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item")
    // The gap embed is filtered to open ones by the `gap.disposition` predicate
    // below — §13's buckets care about what is still outstanding, not the
    // gaps a human already accepted or excluded.
    .select(`${ITEM_TREE}, gap(count)`)
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .eq("gap.disposition", "open")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read items: ${error.message}`);

  return (data ?? []).map((row) => {
    const artifacts = toArtifacts(row.artifact);
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      flowIntent: row.flow_intent,
      opportunityId: row.opportunity_id,
      artifacts,
      openGapCount: (row.gap as CountRow)[0]?.count ?? 0,
      stage: deriveStage({ artifacts }),
    };
  });
}

/**
 * One item with everything it owns — artifacts, gaps in every disposition, and
 * the decision log attached to it. Also one request.
 *
 * Unlike the list, this returns gaps in all three dispositions: §5's negotiation
 * history is the point of an item page, and an accepted gap is the part §8's
 * ledger insists stays visible.
 */
export async function getItem(workspaceId: string, itemId: string): Promise<ItemDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item")
    .select(
      `${ITEM_TREE},
       gap(id, check_id, tag, disposition, evidence, resolved_by_user_id, resolved_at, resolution_note),
       decision(id, statement, reason, decided_by_user_id, decided_at, supersedes_id)`,
    )
    .eq("workspace_id", workspaceId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`Could not read item: ${error.message}`);
  if (!data) return null;

  const artifacts = toArtifacts(data.artifact);
  const gaps = data.gap.map((gap) => ({
    id: gap.id,
    checkId: gap.check_id,
    tag: gap.tag,
    disposition: gap.disposition,
    evidence: gap.evidence,
    resolvedByUserId: gap.resolved_by_user_id,
    resolvedAt: gap.resolved_at,
    resolutionNote: gap.resolution_note,
  }));

  return {
    id: data.id,
    title: data.title,
    type: data.type,
    flowIntent: data.flow_intent,
    opportunityId: data.opportunity_id,
    artifacts,
    gaps,
    openGapCount: gaps.filter((gap) => gap.disposition === "open").length,
    decisions: data.decision.map((decision) => ({
      id: decision.id,
      statement: decision.statement,
      reason: decision.reason,
      decidedByUserId: decision.decided_by_user_id,
      decidedAt: decision.decided_at,
      supersedesId: decision.supersedes_id,
    })),
    stage: deriveStage({ artifacts }),
  };
}
