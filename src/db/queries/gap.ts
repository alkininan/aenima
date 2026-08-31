import "server-only";

import { isOutcomeOf, type AcceptOutcome, type ReopenOutcome } from "@/lib/gap-move";
import { createClient } from "@/lib/supabase/server";

/**
 * §5's third negotiation move — "we accept this risk" — and its undo.
 *
 * **The first write in this repo that a human makes, and the first that goes
 * through PostgREST rather than around it.** Everything the scoring engine
 * writes uses the direct connection, which bypasses RLS, and earns that because
 * `scoring_run` has no INSERT policy at all: a client that could write its own
 * run row could write its own score. A member accepting a gap in their own
 * workspace has no such exemption, so the database stays the boundary.
 *
 * Each move is **one RPC and therefore one transaction**. The move is two
 * statements — the gap UPDATE and the `activity` row §2 requires — and they
 * commit together or not at all; PostgREST cannot transact two requests, so two
 * `.update()`/`.insert()` calls from here could not express it. The functions
 * are SECURITY INVOKER, so `gap_update` and `activity_insert` decide what they
 * may write, exactly as they would for an `.update()` from this file. See
 * `drizzle/0012_gap_accept.sql`, which argues the whole choice.
 *
 * **Nothing here decides anything.** The accepter's name is `auth.uid()` read
 * inside the function; the Decider is read from `product` at write time; the
 * guard on the prior disposition is in the UPDATE's own WHERE. This module
 * passes two strings and reads a token back.
 */

/** The RPCs, by the argument shape the generated types give them. */
type MoveCall =
  | { intent: "accept"; fn: "accept_gap"; args: { p_gap_id: string; p_reason: string } }
  | { intent: "reopen"; fn: "reopen_gap"; args: { p_gap_id: string } };

/**
 * One move, and what the database says came of it.
 *
 * A thrown error is **not** one of §5's outcomes — it is the RPC failing, which
 * `drizzle/0012` reserves for a genuine violation (a constraint, a policy
 * refusing the ledger row, no session). Those roll the whole transaction back,
 * so nothing partial survives, and they collapse to `unavailable` here: the
 * message is logged for a developer and never returned, because CLAUDE.md keeps
 * a failure's detail off every surface.
 *
 * The token is validated against **this move's** outcome set, not the union of
 * both: a `reopen_gap` that answered `reason-required` would mean the schema
 * moved underneath this file just as surely as an unknown string would.
 */
async function move(call: MoveCall): Promise<AcceptOutcome | ReopenOutcome> {
  const supabase = await createClient();

  // Volatile in the database, so PostgREST serves it over POST — which is also
  // what keeps it out of Next's per-render GET memoization. Narrowed before the
  // call so `fn` and `args` stay the correlated pair the generated types want.
  const { data, error } =
    call.intent === "accept"
      ? await supabase.rpc(call.fn, call.args)
      : await supabase.rpc(call.fn, call.args);

  if (error) {
    console.error(`${call.fn} failed`, error);
    return "unavailable";
  }

  // The function returns a token from a closed set. Anything else means the
  // schema moved underneath this file, which is a throw rather than a rendered
  // surprise — an unrecognised token would otherwise render as silence.
  if (!isOutcomeOf(call.intent, data)) {
    throw new Error(`${call.fn} returned an outcome this build does not know`);
  }

  return data;
}

/** §5: "converts it to an accepted gap stamped with the accepter's name." */
export function acceptGap(gapId: string, reason: string): Promise<AcceptOutcome> {
  return move({
    intent: "accept",
    fn: "accept_gap",
    args: { p_gap_id: gapId, p_reason: reason },
  }) as Promise<AcceptOutcome>;
}

/** §1 law 4: "always undoable". The stamp clears; the ledger keeps both moves. */
export function reopenGap(gapId: string): Promise<ReopenOutcome> {
  return move({
    intent: "reopen",
    fn: "reopen_gap",
    args: { p_gap_id: gapId },
  }) as Promise<ReopenOutcome>;
}
