import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * `settleGap` — the action behind §5's third move.
 *
 * What this file covers is the part that is *not* SQL: what the action refuses
 * before it reaches the database, what it derives rather than trusts, when it
 * revalidates, and where it sends a person afterwards. The move's own semantics
 * — the stamp, the guard, the §14 gate, atomicity — are proved against a real
 * Postgres in `src/db/gap-accept.db.test.ts`, because none of them survives a
 * mock.
 *
 * `"use server"` is inert under vitest, so the exported function is called
 * directly. `redirect` throws by design, and every path ends in one, so each
 * test asserts on the thrown destination.
 */

const hooks = vi.hoisted(() => ({
  session: vi.fn(),
  accept: vi.fn(),
  reopen: vi.fn(),
  revalidatePath: vi.fn(),
}));

/** `redirect` throws in Next; the tests read the destination off the throw. */
class Redirected extends Error {
  constructor(
    readonly url: string,
    readonly kind: string | undefined,
  ) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string, kind?: string) => {
    throw new Redirected(url, kind);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: hooks.revalidatePath }));
vi.mock("@/db/queries/session", () => ({ getSessionUser: hooks.session }));
vi.mock("@/db/queries/gap", () => ({ acceptGap: hooks.accept, reopenGap: hooks.reopen }));

const { settleGap } = await import("./actions");

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

const GAP = "11111111-2222-4000-8000-333333333333";

const submit = async (fields: Record<string, string>): Promise<Redirected> => {
  try {
    await settleGap(form(fields));
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
  throw new Error("the action returned without redirecting");
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.session.mockResolvedValue({ id: "user-1", email: "a@b.test" });
});

describe("settleGap", () => {
  /**
   * Next's own guidance, and this repo's: "render-time gating is only rendering
   * a form on an authenticated page, which is not a security boundary, because
   * requests can be sent without going through the UI."
   */
  it("writes nothing when there is no session", async () => {
    hooks.session.mockResolvedValue(null);

    const redirected = await submit({ key: "soc-9", gapId: GAP, intent: "accept", reason: "r" });

    expect(redirected.url).toBe("/sign-in");
    expect(hooks.accept).not.toHaveBeenCalled();
  });

  it("accepts with the reason, then sends the person back to the item", async () => {
    hooks.accept.mockResolvedValue("accepted");

    const redirected = await submit({
      key: "soc-9",
      gapId: GAP,
      intent: "accept",
      reason: "Accepted for V1.",
    });

    expect(hooks.accept).toHaveBeenCalledWith(GAP, "Accepted for V1.");
    expect(redirected.url).toBe(`/i/soc-9?move=accepted&gap=${GAP}#gap-${GAP}`);
    // Inside an action `redirect` defaults to `push`, and this URL differs from
    // the previous one only by a transient message — Back should not re-show a
    // sentence about something already done.
    expect(redirected.kind).toBe("replace");
  });

  it("reopens without a reason, and never passes one", async () => {
    hooks.reopen.mockResolvedValue("reopened");

    const redirected = await submit({ key: "soc-9", gapId: GAP, intent: "reopen" });

    expect(hooks.reopen).toHaveBeenCalledWith(GAP);
    expect(redirected.url).toContain("move=reopened");
  });

  /**
   * §13's buckets count open gaps and the sidebar prefetches that list, so a
   * move that landed has to evict both. A move that did not touches neither:
   * revalidating to re-render unchanged data is the same waste as `writeRun`
   * writing a ledger row for a gap it did not restate.
   */
  it("revalidates the item and the list only when something moved", async () => {
    hooks.accept.mockResolvedValue("accepted");
    await submit({ key: "soc-9", gapId: GAP, intent: "accept", reason: "r" });
    expect(hooks.revalidatePath.mock.calls.map(([p]) => p)).toEqual(["/i/soc-9", "/app"]);

    vi.clearAllMocks();
    hooks.session.mockResolvedValue({ id: "user-1", email: "a@b.test" });
    hooks.accept.mockResolvedValue("not-open");
    await submit({ key: "soc-9", gapId: GAP, intent: "accept", reason: "r" });
    expect(hooks.revalidatePath).not.toHaveBeenCalled();
  });

  // Every outcome reaches the URL as a token, and only as a token — no string
  // the database produced is ever carried to a surface (CLAUDE.md).
  it("reports a refusal in the URL without writing anything else", async () => {
    hooks.accept.mockResolvedValue("not-decider");

    const redirected = await submit({ key: "soc-9", gapId: GAP, intent: "accept", reason: "r" });

    expect(redirected.url).toBe(`/i/soc-9?move=not-decider&gap=${GAP}#gap-${GAP}`);
  });

  /**
   * The key becomes a path segment in the redirect, so it is shape-checked
   * against `item_key_shape` before it is interpolated. It is bounded to
   * `/i/<segment>` either way — never an absolute URL — so this turns a tampered
   * key into the list rather than into a 404 or an off-site redirect.
   */
  it("refuses a key that is not an item key, and calls nothing", async () => {
    for (const key of ["../../evil", "https://elsewhere.test", "SOC-9", ""]) {
      const redirected = await submit({ key, gapId: GAP, intent: "accept", reason: "r" });
      expect(redirected.url).toBe("/app");
    }
    expect(hooks.accept).not.toHaveBeenCalled();
  });

  // A form with no gap or no intent is not a move at all, and reports as the
  // missing gap it is rather than reaching the database to find out.
  it("refuses a submission missing the gap or the intent", async () => {
    expect((await submit({ key: "soc-9", intent: "accept", reason: "r" })).url).toBe(
      "/i/soc-9?move=not-found",
    );
    expect((await submit({ key: "soc-9", gapId: GAP, intent: "delete" })).url).toBe(
      "/i/soc-9?move=not-found",
    );
    expect(hooks.accept).not.toHaveBeenCalled();
    expect(hooks.reopen).not.toHaveBeenCalled();
  });

  /**
   * §5's reason is the record of why a debt was taken on. The empty case is
   * caught three times over — natively by `required`, here on the way past, and
   * by `accept_gap` plus `gap_resolution_shape` in the database — and this is
   * the wall that answers without a round trip.
   */
  it("passes a missing reason through as the empty string the function refuses", async () => {
    hooks.accept.mockResolvedValue("reason-required");

    const redirected = await submit({ key: "soc-9", gapId: GAP, intent: "accept" });

    expect(hooks.accept).toHaveBeenCalledWith(GAP, "");
    expect(redirected.url).toContain("move=reason-required");
  });
});
