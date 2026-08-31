"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acceptGap, reopenGap } from "@/db/queries/gap";
import { getSessionUser } from "@/db/queries/session";
import { GAP_MOVE_UNREADABLE, isGapIntent } from "@/lib/gap-move";
import { GAP_PARAMS, ROUTES, gapOutcomeHref, isGapId, isItemKey, itemHref } from "@/lib/routes";

/**
 * §5's third negotiation move, and its undo — the item page's only mutation.
 *
 * **One action serves both moves**, because they differ only in which RPC they
 * call: the same form shape, the same authorization, the same outcome contract.
 * Two actions would be two copies of everything below the `intent` switch.
 *
 * ---------------------------------------------------------------------------
 * **No client island, and these are the three things that make that work.**
 *
 * 1. **The form is a plain `<form action={settleGap}>` in a Server Component.**
 *    React renders a server-action form as `multipart/form-data` with a hidden
 *    `$ACTION_ID_…` field, so a native submit reaches this function with no
 *    JavaScript at all.
 *
 *    **Never set `encType` on that form, or `formEncType` on its button, and
 *    never hand-write `<form method="post" action="…">`.** Next 16 bails out of
 *    a `application/x-www-form-urlencoded` action POST and returns `null`
 *    (`server/app-render/action-handler.js` — "We don't currently support URL
 *    encoded actions"), which for an MPA submit means the page simply
 *    re-renders and the move silently does not happen. Multipart is the only
 *    body that works without JS, and React picks it for us as long as nothing
 *    overrides it.
 *
 * 2. **Every path ends in `redirect()`.** Returning a value would need
 *    `useActionState` to read it, which is the client island. It would also do
 *    nothing visible: Next 16 skips the post-action re-render entirely unless
 *    something revalidated.
 *
 * 3. **The redirect is what dodges the memoization trap.** Next memoizes
 *    identical GETs for a whole render pass, so a read after a PostgREST write
 *    inside one pass replays the pre-write response — the incident
 *    `ensureWorkspace` documents. A redirect puts the page's reads in a
 *    different HTTP request with an empty memo cache. The write itself is an
 *    RPC, i.e. a POST, so it is never memoized either way.
 *
 * ---------------------------------------------------------------------------
 * **Everything that decides is re-derived here or below, never taken from the
 * form.** Next's own guidance and this repo's: "render-time gating is not a
 * security boundary, because requests can be sent without going through the
 * UI." The form supplies a gap id, an intent and a reason; the session comes
 * from the cookie, the role and the Decider from the database at write time, and
 * the guard on the prior disposition from the UPDATE's own WHERE. A forged gap
 * id buys `not-found` or `not-permitted`.
 *
 * **Every exit reports, including the ones that did nothing.** §12 has copy for
 * every outcome and none for silence, so a submission this function refuses
 * before it reaches the database still leaves with a token the page can turn
 * into a sentence — `not-found` when the gap was named and is not there,
 * `unreadable` when the form carried no move to name. Neither is a case a
 * person can reach through the UI; both used to redirect to a page that said
 * nothing at all, which is the one thing a person cannot act on.
 */
export async function settleGap(formData: FormData): Promise<void> {
  // The proxy has already turned anonymous traffic away; this re-checks rather
  // than trusting that it ran, exactly as the page it sits beside does.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  // Shape-checked before it becomes a path segment. Always `/i/<segment>` and
  // never an absolute URL, so a tampered key is a wrong page rather than an
  // open redirect — and this makes it the list instead of a 404.
  const rawKey = formData.get("key");
  const key = typeof rawKey === "string" && isItemKey(rawKey) ? rawKey : null;
  if (key === null) redirect(ROUTES.app);

  const rawGap = formData.get("gapId");
  const rawIntent = formData.get("intent");

  // A form that arrived without a readable move is not a move at all, and there
  // is no intent to attribute a sentence to — so it reports as itself rather
  // than borrowing one move's words for something that was neither move.
  if (!isGapIntent(rawIntent)) {
    redirect(`${itemHref(key)}?${GAP_PARAMS.move}=${GAP_MOVE_UNREADABLE}`);
  }

  // Shape-checked for the same reason the key is: it is interpolated into the
  // redirect's fragment, which `URLSearchParams` does not encode. An id that is
  // not a uuid names no gap, which is `not-found` — reported at the top of the
  // page, since there is no card for it to report on.
  const rawGapId = typeof rawGap === "string" ? rawGap : "";
  if (!isGapId(rawGapId)) {
    redirect(gapOutcomeHref(key, rawIntent, "not-found", null));
  }
  const gapId = rawGapId;

  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" ? rawReason : "";

  // The RPC is the whole write: one transaction, RLS as this person, the
  // Decider read at write time, the guard in the UPDATE. It returns a token —
  // never a message — and it does not throw for any of §5's outcomes.
  const outcome = rawIntent === "accept" ? await acceptGap(gapId, reason) : await reopenGap(gapId);

  // Only when something actually moved. Revalidating to re-render unchanged data
  // would evict two caches for nothing, and it sets the flag that starts Next's
  // refresh bookkeeping — the same reason `writeRun` writes no ledger row where
  // nothing changed.
  if (outcome === "accepted" || outcome === "reopened") {
    // The concrete path, never the `/i/[key]` template: a dynamic route pattern
    // without a `type` argument is a documented no-op.
    revalidatePath(itemHref(key));
    // §13's buckets count open gaps, and the sidebar prefetches that list.
    revalidatePath(ROUTES.app);
  }

  // Tail position, outside every `try`: `redirect` throws by design and nothing
  // may swallow it. `replace` because inside an action the default is `push`,
  // and this URL differs from the one before it only by a transient message —
  // Back should not re-show a sentence about something already done.
  redirect(gapOutcomeHref(key, rawIntent, outcome, gapId), "replace");
}
