import { describe, expect, it } from "vitest";

import { describeActor } from "@/lib/actor";

const VIEWER = "11111111-1111-4000-8000-000000000001";
const OTHER = "22222222-2222-4000-8000-000000000002";

describe("describeActor", () => {
  it("names an agent, because agents have names", () => {
    expect(
      describeActor({
        actorKind: "agent",
        actorUserId: null,
        actorAgent: "scorer",
        viewerId: VIEWER,
      }),
    ).toEqual({ kind: "agent", name: "scorer" });
  });

  it("recognises the signed-in person", () => {
    expect(
      describeActor({
        actorKind: "human",
        actorUserId: VIEWER,
        actorAgent: null,
        viewerId: VIEWER,
      }),
    ).toEqual({ kind: "self" });
  });

  /**
   * The honest limit. `activity.actor_user_id` has no foreign key to
   * `auth.users` (migration 0003), so nothing can turn this id into a name —
   * and a uuid on screen is not a name, it is an internal identifier that
   * reads as a bug.
   */
  it("cannot name anyone else, and does not try", () => {
    const actor = describeActor({
      actorKind: "human",
      actorUserId: OTHER,
      actorAgent: null,
      viewerId: VIEWER,
    });

    expect(actor).toEqual({ kind: "other" });
    // The id does not survive into what gets rendered.
    expect(JSON.stringify(actor)).not.toContain(OTHER);
  });

  /**
   * Null viewer means no session. `null === null` would otherwise greet an
   * anonymous reader as the person who did the thing.
   */
  it("does not call an anonymous reader 'you'", () => {
    expect(
      describeActor({
        actorKind: "human",
        actorUserId: null,
        actorAgent: null,
        viewerId: null,
      }),
    ).toEqual({ kind: "other" });
  });
});
