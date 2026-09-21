import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getOpportunityByKey } from "@/db/queries/opportunity";
import { getSessionUser } from "@/db/queries/session";
import { getCurrentWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";
import { ROUTES } from "@/lib/routes";

import { ItemsSection } from "./ItemsSection";
import { OpportunityHeader } from "./OpportunityHeader";

/**
 * One opportunity, and what is being worked on under it — the page `/i/<key>`'s
 * header now links to.
 *
 * §2 makes the opportunity the thing that explains why an item exists: "a
 * problem or outcome … holds an evidence pile that outlives individual bets".
 * The evidence pile has no table yet, so what this page can honestly show is
 * the problem and the bets — the title and summary, and the items linked to it.
 * Nothing here stands in for the pile.
 *
 * **An unknown key and a key in someone else's workspace are the same 404, by
 * one code path** — `/i/[key]`'s rule, for `/i/[key]`'s reason. The read filters
 * `workspace_id` and RLS narrows it again as the user, so a key belonging to a
 * stranger's workspace comes back as no row exactly as a key belonging to
 * nobody does. Never a redirect, which would leak that the key resolves; never a
 * 500, which would leak that something threw.
 */
export default async function OpportunityPage({ params }: PageProps<"/o/[key]">) {
  const t = getDictionary();
  const { key } = await params;

  // The proxy has already turned anonymous traffic away; this re-checks rather
  // than trusting that it ran, because what follows reads user data.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const opportunity = await getOpportunityByKey(workspace.id, key);
  if (!opportunity) notFound();

  return (
    <main className="mx-auto w-full max-w-[1200px] px-[24px] py-[32px]">
      {/* §4: content 1fr / chat 380, as the item page holds it. The chat column
          is reserved from the start and built later — adding it then fills a
          column rather than reflowing the page. */}
      <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-[32px]">
          <Link
            href={ROUTES.app}
            className="type-ui-body w-fit text-n-secondary hover:text-n-primary"
          >
            {t.opportunity.backToList}
          </Link>

          <OpportunityHeader
            opportunity={{
              key: opportunity.key,
              title: opportunity.title,
              summary: opportunity.summary,
              productName: opportunity.productName,
            }}
          />

          <ItemsSection items={opportunity.items} t={t} />
        </div>

        {/* §4's 380 chat column, reserved and empty — the item page's seam, held
            here too so both pages reflow the same way when the dock arrives. */}
        <aside aria-hidden="true" className="hidden lg:block" />
      </div>
    </main>
  );
}
