import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ensureWorkspace } from "@/db/queries/workspace";
import { getSessionUser } from "@/db/queries/session";
import { getDictionary } from "@/i18n";

export const metadata: Metadata = {
  title: "aenima",
};

/**
 * Where a signed-in human lands.
 *
 * First run happens here: no workspace yet means one is created and the caller
 * becomes its Owner. product-spec.md §16 defers real onboarding to Phase 6, so
 * this creates a workspace and nothing else — no setup screens, no wizard.
 *
 * There is no list surface, no scoring and no artifacts UI in this ticket: the
 * page exists to prove the whole chain works, so it names the workspace it
 * belongs to and stops.
 */
export default async function AppPage() {
  const t = getDictionary();

  // The proxy has already turned anonymous traffic away; this re-checks rather
  // than trusting that it ran, because the page is about to read user data.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const workspace = await ensureWorkspace(t.workspace.defaultName);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-[24px] px-[24px] py-[48px]">
      <header className="flex flex-wrap items-center justify-between gap-[16px]">
        <div className="flex flex-col gap-[8px]">
          {/* §4: a page topbar is a display-xl title plus a mono readout. */}
          <h1 className="type-display-xl text-n-primary">{workspace.name}</h1>
          <span className="type-mono-readout text-n-secondary">
            {workspace.timezone} · {workspace.locale}
          </span>
        </div>

        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary">
            {t.common.signOut}
          </Button>
        </form>
      </header>

      <p className="type-ui-body text-n-secondary">{t.workspace.signedInAs(user.email)}</p>
    </main>
  );
}
