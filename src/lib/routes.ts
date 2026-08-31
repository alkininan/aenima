/**
 * Every URL in the product, in one place.
 *
 * Settled ahead of the pages themselves because every later ticket links into
 * this scheme, and a link is the one thing that cannot be refactored later
 * without breaking what someone has already pasted into a message. The short
 * segments are deliberate: `/i/soc-12` is a URL a person can read out.
 *
 * `built` is what keeps an unfinished product honest. A route that has no page
 * yet renders as a visibly inactive nav item (§7 disabled) rather than as a link
 * that answers 404 — the difference between "not yet" and "broken". Building a
 * page means flipping one flag here, and the nav follows.
 */

export const ROUTES = {
  /** The landing page. */
  landing: "/",
  /** §13's list surface — where a signed-in person lands. */
  app: "/app",
  item: "/i",
  opportunity: "/o",
  product: "/p",
  packet: "/pk",
  /** §15's views. */
  analytics: "/an",
  settings: "/st",
  /** §10's intake triage inbox. */
  triage: "/tr",
} as const;

/** An item's URL, keyed by the §13 key people say out loud — never by uuid. */
export const itemHref = (key: string) => `${ROUTES.item}/${key}` as const;
export const opportunityHref = (key: string) => `${ROUTES.opportunity}/${key}` as const;
export const productHref = (slug: string) => `${ROUTES.product}/${slug}` as const;
export const packetHref = (key: string) => `${ROUTES.packet}/${key}` as const;

/**
 * An item key, as `item_key_shape` in drizzle/0005 defines it.
 *
 * §5's moves submit the key in a form, and it becomes a path segment in the
 * redirect that follows — so it is shape-checked before it is interpolated. The
 * result is always `/i/<segment>`, never an absolute URL, so there is no open
 * redirect here even without the check; the check is what turns a tampered key
 * into the list rather than a 404.
 */
const ITEM_KEY = /^[a-z][a-z0-9]{1,7}-[0-9]+$/;

export const isItemKey = (value: string): boolean => ITEM_KEY.test(value);

/**
 * §5's negotiation moves report themselves in the URL.
 *
 * The item page has no client island, so an outcome cannot live in
 * `useActionState`. It travels as two search params instead: which gap, and what
 * happened to it. Both are non-secret — the gap id is already the card's anchor,
 * and the outcome is one of a closed set of tokens (`src/lib/gap-move.ts`).
 * Nothing a person typed and nothing the database said is ever in the URL.
 */
export const GAP_PARAMS = { move: "move", gap: "gap" } as const;

/** Where a move sends the person back to, with what to say when they arrive. */
export function gapOutcomeHref(key: string, gapId: string, outcome: string): string {
  const params = new URLSearchParams({ [GAP_PARAMS.move]: outcome, [GAP_PARAMS.gap]: gapId });
  // The fragment scrolls the card that moved into view, with JS and without.
  return `${itemHref(key)}?${params.toString()}#gap-${gapId}`;
}

/** The anchor a moved gap's card carries, so `gapOutcomeHref` has a target. */
export const gapAnchor = (gapId: string) => `gap-${gapId}` as const;

/** §4's sidebar nav, in order. `built` gates whether it is a link at all. */
export type NavEntry = {
  href: string;
  /** Key into `t.nav` — §12 keeps every label in i18n. */
  label: "list" | "triage" | "analytics" | "settings";
  built: boolean;
};

export const NAV: readonly NavEntry[] = [
  { href: ROUTES.app, label: "list", built: true },
  // Phase 4 builds the router that fills this. Phase 6 builds these two.
  { href: ROUTES.triage, label: "triage", built: false },
  { href: ROUTES.analytics, label: "analytics", built: false },
  { href: ROUTES.settings, label: "settings", built: false },
];

/**
 * The list's two filters, as search params.
 *
 * They live in the URL rather than in client state so the list stays a Server
 * Component: a filtered view is a different URL, which is also what makes one
 * shareable and what makes the back button work.
 */
export const LIST_PARAMS = { stage: "stage", product: "product" } as const;

/**
 * A list URL with one filter changed and the other left alone.
 *
 * Passing `null` clears that filter, which is how a segment toggles itself off.
 * Both are dropped when empty rather than written as `?stage=`, so the canonical
 * unfiltered URL is exactly `/app`.
 */
export function listHref(
  current: { stage?: string | undefined; product?: string | undefined },
  change: { stage?: string | null | undefined; product?: string | null | undefined },
): string {
  const next = {
    stage: change.stage === undefined ? current.stage : (change.stage ?? undefined),
    product: change.product === undefined ? current.product : (change.product ?? undefined),
  };

  const params = new URLSearchParams();
  if (next.stage) params.set(LIST_PARAMS.stage, next.stage);
  if (next.product) params.set(LIST_PARAMS.product, next.product);

  const query = params.toString();
  return query ? `${ROUTES.app}?${query}` : ROUTES.app;
}
