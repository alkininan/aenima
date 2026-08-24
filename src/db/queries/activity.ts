import "server-only";

import type { Database } from "@/db/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * The activity ledger — product-spec.md §2: "Every mutating action — human or
 * agent — records its actor, timestamp, and trigger. The agent is a first-class
 * actor."
 *
 * **This is a separate request, and it has to be.** `activity` names its
 * subject polymorphically — `subject_table` plus `subject_id` — with no foreign
 * key to `item`, so PostgREST has no relationship to follow and an embed from
 * `item` does not merely cost more, it fails. The alternative would be a
 * computed relationship, which means inventing schema the ticket does not
 * define.
 *
 * **It is also unindexed.** The only index on `activity` is
 * `(workspace_id, occurred_at desc)`; nothing covers `(subject_table,
 * subject_id)`. One item's feed is therefore a workspace-scoped scan filtered
 * down. That is fine at this size and wrong at some larger one, and the fix is
 * an index rather than a different query shape.
 */

type ActorKind = Database["public"]["Enums"]["actor_kind"];
type TriggerSource = Database["public"]["Enums"]["activity_trigger"];

/**
 * How many ledger rows one item's feed will show.
 *
 * Bounded on purpose. A ledger is the fastest-growing table in the system and
 * an item that has been worked on for months has a long one; a page that reads
 * all of it gets slower every week without anyone changing a line. When this
 * starts truncating something people need, the answer is paging with a visible
 * "and N more" — never a larger silent number.
 */
export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityEntry = {
  id: string;
  /** §2's verb, e.g. `workspace.seeded`. Namespaced, never free text. */
  action: string;
  actorKind: ActorKind;
  /**
   * The acting human's id, or null for an agent.
   *
   * An id and not a name: migration 0003 removed the foreign key to
   * `auth.users` so a person can be deleted without rewriting history, which
   * means nothing can resolve this to a name. Callers compare it against the
   * signed-in user and say "you" or "someone" — see `src/lib/actor.ts`.
   */
  actorUserId: string | null;
  /** The acting agent's name, or null for a human. §0 law 4 renders it violet. */
  actorAgent: string | null;
  triggerSource: TriggerSource;
  /** ISO-8601, UTC. */
  occurredAt: string;
};

/**
 * One item's ledger rows, newest first.
 *
 * `subject_table` is filtered as well as `subject_id` because the id is a uuid
 * from a shared column: without it, a gap that happened to share an id with an
 * item would appear in the item's feed. That cannot happen with random uuids,
 * but the filter is what makes it structurally impossible rather than unlikely.
 */
export async function listItemActivity(
  workspaceId: string,
  itemId: string,
): Promise<ActivityEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity")
    .select("id, action, actor_kind, actor_user_id, actor_agent, trigger_source, occurred_at")
    // CLAUDE.md: every query filters workspace_id. RLS filters it again.
    .eq("workspace_id", workspaceId)
    .eq("subject_table", "item")
    .eq("subject_id", itemId)
    // `nullsFirst: false` matches `activity_subject_idx`, which Drizzle's
    // `.desc()` builds as DESC NULLS LAST. A bare `desc` means NULLS FIRST in
    // Postgres, and an ordering the index cannot supply is a sort the planner
    // has to do itself — invisible at this size, and the whole reason the index
    // was added. `occurred_at` is NOT NULL, so the two orderings return the same
    // rows either way; only the plan differs.
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(ACTIVITY_PAGE_SIZE);

  if (error) throw new Error(`Could not read activity: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    actorAgent: row.actor_agent,
    triggerSource: row.trigger_source,
    occurredAt: row.occurred_at,
  }));
}
