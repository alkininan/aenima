import type { SwitcherProduct } from "@/components/frame/ProductSwitcher";

/**
 * The frame's fixture reads, for the `/dev` routes — design-spec §4, C-40 and C-45.
 *
 * `/dev` sits outside the session, so the frame there takes fixture products and a fixture
 * address in place of the workspace and session reads, and its Dashboard row and lockup
 * lead to the fixture list rather than `/app`. That is what lets the browser checks drive
 * the frame — the mode, the gates, the chrome before data, the budget — on routes they can
 * reach.
 *
 * **`?delay=` holds the content.** C-40 is checked "with the request held", and a browser
 * cannot hold a server-side database read; the fixture pages await this instead, so their
 * `loading.tsx` — the chrome and the content's skeleton — is on screen for as long as the
 * test asks, and the chrome can be shown interactive before the content arrives. Capped, so
 * a stray value cannot hold a dev server's worker for a minute.
 *
 * DELETE BEFORE LAUNCH, with everything else under /dev.
 */

export const DEV_PRODUCTS: readonly SwitcherProduct[] = [
  { slug: "sociera", name: "Sociera" },
  { slug: "aurora", name: "Aurora" },
];

export const DEV_ADDRESS = "someone@example.com";

/** Where the fixture frame's lockup and Dashboard row go. */
export const DEV_DASHBOARD = "/dev/list";

export const DEV_DELAY_PARAM = "delay";

const DELAY_CAP_MS = 10_000;

export async function holdContent(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<void> {
  const raw = searchParams[DEV_DELAY_PARAM];
  const ms = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(ms, DELAY_CAP_MS)));
}
