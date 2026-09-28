import "server-only";

import type { SwitcherProduct } from "@/components/frame/ProductSwitcher";
import { listProducts } from "@/db/queries/product";
import { getSessionUser } from "@/db/queries/session";
import { ensureWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";

/**
 * The two reads the frame's chrome carries — design-spec §4, C-40.
 *
 * Each is started by a segment layout and handed to `Frame` **as a promise, not awaited**:
 * the frame renders from the route alone and the switcher's rows and the account's address
 * fill in when these resolve — in the client islands themselves, which take the promise
 * (`usePromise`). A layout that awaited them, as `/app`'s once did, held every route's
 * chrome for the slowest read.
 *
 * Neither redirects. The anonymous redirect is the pages' — each re-checks the session
 * before it reads user data, as `/i` and `/o` always have and `/app` does since the layout
 * stopped awaiting — because a promise a client island consumes must resolve to a value,
 * and the proxy has already turned anonymous traffic away in any case.
 *
 * `readProducts` is also where first run happens — `ensureWorkspace` bootstraps a workspace
 * for a signed-in human who has none — so the switcher can offer a product that has no
 * items yet, which the list by definition cannot show. `/app`'s page calls it too, and the
 * function is idempotent: concurrent first-run render passes all get the same workspace.
 */
export function readProducts(): Promise<readonly SwitcherProduct[]> {
  const t = getDictionary();
  return ensureWorkspace(t.workspace.defaultName)
    .then((workspace) => listProducts(workspace.id))
    .then((products) => products.map(({ slug, name }) => ({ slug, name })));
}

export async function readAddress(): Promise<string> {
  const user = await getSessionUser();
  return user?.email ?? "";
}
