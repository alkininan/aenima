import "server-only";

import type { Database } from "@/db/database.types";
import { createClient } from "@/lib/supabase/server";
import { deriveStage, type ArtifactPresence, type Stage } from "@/lib/stage";

/**
 * Opportunities in a product — §2's "problem or outcome … holds an evidence
 * pile that outlives individual bets".
 *
 * Filters on `workspace_id` as well as `product_id`: the product id alone would
 * be enough for correctness given the composite foreign keys, but CLAUDE.md
 * asks every query to state the tenant it is reading, and a query that says so
 * is one a reviewer can check without tracing the schema.
 */

type ItemType = Database["public"]["Enums"]["item_type"];

export type OpportunitySummary = {
  id: string;
  title: string;
  summary: string | null;
};

export async function listOpportunities(
  workspaceId: string,
  productId: string,
): Promise<OpportunitySummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunity")
    .select("id, title, summary")
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read opportunities: ${error.message}`);
  return data ?? [];
}

/** One item as the opportunity page lists it — enough to name it and place it. */
export type OpportunityItem = {
  key: string;
  title: string;
  type: ItemType;
  /** Derived, never stored. See src/lib/stage.ts. */
  stage: Stage;
};

export type OpportunityPageDetail = {
  id: string;
  key: string;
  title: string;
  summary: string | null;
  productName: string;
  /** In creation order, which is the order they were bet on. */
  items: OpportunityItem[];
};

/**
 * The embedded tree the page reads.
 *
 * `artifact(kind, artifact_version(count))` is `ITEM_TREE`'s bargain, one table
 * over: stage is derived in TypeScript, so listing items means knowing every
 * item's artifacts, and asking for the *count* rather than the versions keeps a
 * page of item names from carrying a page of artifact bodies. PostgREST
 * resource embedding makes the whole thing one request with RLS applied to each
 * embedded relation independently.
 */
const OPPORTUNITY_PAGE_TREE = `id, key, title, summary,
   product(name),
   item(key, title, type, artifact(kind, artifact_version(count)))`;

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
 * One opportunity by the key people say out loud — `soc-3` — and the items that
 * belong to it.
 *
 * **Returns null for a key that does not exist and for a key in a workspace the
 * caller cannot see, and those are deliberately the same answer** — the
 * reasoning is `getItemByKey`'s, verbatim: the filter names `workspace_id` and
 * RLS narrows the same read again as the user, so a stranger's key produces no
 * row exactly as nobody's key does. The caller renders a 404 for both, because
 * telling them apart would answer "does this key exist somewhere?", which is
 * not a question a stranger gets to ask.
 *
 * One request, however many items and artifacts come back.
 */
export async function getOpportunityByKey(
  workspaceId: string,
  key: string,
): Promise<OpportunityPageDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunity")
    .select(OPPORTUNITY_PAGE_TREE)
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`Could not read opportunity: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    key: data.key,
    title: data.title,
    summary: data.summary,
    productName: data.product?.name ?? "",
    items: (data.item ?? []).map((item) => ({
      key: item.key,
      title: item.title,
      type: item.type,
      // `deriveStage` reads presence, which this satisfies structurally.
      stage: deriveStage({ artifacts: toArtifacts(item.artifact) }),
    })),
  };
}
