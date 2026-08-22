import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Opportunities in a product — §2's "problem or outcome … holds an evidence
 * pile that outlives individual bets".
 *
 * Filters on `workspace_id` as well as `product_id`: the product id alone would
 * be enough for correctness given the composite foreign keys, but CLAUDE.md
 * asks every query to state the tenant it is reading, and a query that says so
 * is one a reviewer can check without tracing the schema.
 */

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
