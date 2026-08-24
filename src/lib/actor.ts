/**
 * Who did a thing — as much of it as the schema can honestly say.
 *
 * Migration 0003 removed the foreign key from `activity.actor_user_id` to
 * `auth.users`, so that deleting a person does not require rewriting history.
 * The cost, stated in that migration: an actor id can no longer be resolved to
 * a name, and doing so needs a snapshot taken at write time — deferred to Phase
 * 5 (build log, open question 2).
 *
 * So there are exactly three things this can return, and a uuid is not one of
 * them. A uuid on screen is not a name; it is an internal identifier that reads
 * as a bug, and it identifies the person no better than "someone" does to
 * anyone who is not holding the database.
 *
 * The same wall stands in front of `gap.resolved_by_user_id` and
 * `decision.decided_by_user_id`, which is why this takes an id rather than an
 * activity row: all three callers ask the same question.
 */

export type Actor =
  /** An agent, which §0 law 4 renders in `--agent`. Named, because agents have names. */
  | { kind: "agent"; name: string }
  /** The signed-in person. The one human the session can actually name. */
  | { kind: "self" }
  /** Any other human. Real, recorded, and unnameable until Phase 5. */
  | { kind: "other" };

export type ActorInput = {
  actorKind: "human" | "agent";
  actorUserId: string | null;
  actorAgent: string | null;
  /** The signed-in user's id, or null when there is no session. */
  viewerId: string | null;
};

export function describeActor({ actorKind, actorUserId, actorAgent, viewerId }: ActorInput): Actor {
  // The `activity_actor_shape` check makes exactly one of the two columns
  // non-null per row, so an agent always has a name. The fallback is for rows
  // that predate the check or arrive from a caller that is not the ledger.
  if (actorKind === "agent") return { kind: "agent", name: actorAgent ?? "" };

  // Null viewer means no session, which cannot happen behind the proxy — but
  // `null === null` would otherwise call an anonymous reader "you".
  if (viewerId !== null && actorUserId === viewerId) return { kind: "self" };

  return { kind: "other" };
}
