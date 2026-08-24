import { redirect } from "next/navigation";

import { listProducts } from "@/db/queries/product";
import { getSessionUser } from "@/db/queries/session";
import { ensureWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";

import { Sidebar } from "./Sidebar";

/**
 * The signed-in shell — §4's grid: "Left sidebar 240px fixed · content
 * max-width 1200px centered, gutters 24".
 *
 * It lives in the `/app` segment rather than the root layout so `/` and
 * `/sign-in` stay chrome-free: a landing page carrying a product sidebar would
 * be offering navigation to someone who cannot use it.
 *
 * The session check and the first-run bootstrap sit here rather than in the page
 * because the sidebar needs the workspace too. The proxy has already turned
 * anonymous traffic away; this re-checks rather than trusting that it ran,
 * because what follows reads user data.
 *
 * **The sidebar does not receive the filters.** A layout gets no `searchParams`
 * — it does not re-render when they change — so the switcher reads them from the
 * client instead. Moving the sidebar into the page to get them would re-mount
 * the whole chrome on every filter change, which is what a layout exists to
 * avoid.
 *
 * The chat dock §4 puts at 380 right is not in this ticket. The grid here is two
 * columns; the third arrives with the dock.
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const t = getDictionary();

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const workspace = await ensureWorkspace(t.workspace.defaultName);
  // Read here rather than derived from the list: the switcher has to offer a
  // product that has no items yet, which the list by definition cannot show.
  // One request, constant in workspace size.
  const products = await listProducts(workspace.id);

  return (
    <div className="flex min-h-dvh">
      <Sidebar t={t} products={products} email={user.email} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
