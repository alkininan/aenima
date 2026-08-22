import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Product and opportunity reads — the top two levels of the §2 object tree.
 *
 * Every query here takes `workspaceId` and filters on it, per CLAUDE.md, *and*
 * runs through the user's Supabase client so RLS filters it a second time. The
 * redundancy is the point: the explicit filter is what a reader can check, and
 * RLS is what holds when someone forgets one. Product isolation is a security
 * boundary, not a convenience.
 */

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  deciderUserId: string | null;
};

/** Products in a workspace, oldest first. RLS also hides ones the caller cannot see. */
export async function listProducts(workspaceId: string): Promise<ProductSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product")
    .select("id, name, slug, decider_user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not read products: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    deciderUserId: row.decider_user_id,
  }));
}
