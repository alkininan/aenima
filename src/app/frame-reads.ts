import "server-only";

import { redirect } from "next/navigation";

import type { SwitcherProduct } from "@/components/frame/ProductSwitcher";
import { listProducts } from "@/db/queries/product";
import { getSessionUser } from "@/db/queries/session";
import { ensureWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";

/**
 * The two reads the frame's chrome carries — design-spec §4, C-40.
 *
 * **The session is awaited by the layout, before the shell.** It is a signature check on
 * the cookie, not a data request, and it is what turns an anonymous visitor away with a
 * real 307 — the answer `e2e/production.spec.ts` and the deploy check read from `/app`.
 * Thrown after the shell has streamed, a redirect can only be a meta refresh in the body,
 * which is what the layout produced while it awaited nothing. The proxy that should answer
 * first does not run locally (the report's open question 5), so this is the redirect that
 * holds.
 *
 * **The products are not awaited.** They are handed to `Frame` as a promise, and the
 * switcher's island takes it (`usePromise`) and fills its rows when it resolves: the chrome
 * streams before the workspace read, and the layout that awaited it, as `/app`'s once did,
 * held every route's chrome for the slowest read. `readProducts` is also where first run
 * happens — `ensureWorkspace` bootstraps a workspace for a signed-in human who has none —
 * so the switcher can offer a product that has no items yet. `/app`'s page calls it too,
 * and the function is idempotent: concurrent first-run render passes all get the same
 * workspace.
 */
export async function readAddress(): Promise<string> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user.email;
}

export async function readProducts(): Promise<readonly SwitcherProduct[]> {
  const t = getDictionary();
  const workspace = await ensureWorkspace(t.workspace.defaultName);
  const products = await listProducts(workspace.id);
  return products.map(({ slug, name }) => ({ slug, name }));
}
