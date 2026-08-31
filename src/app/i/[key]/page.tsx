import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listItemActivity } from "@/db/queries/activity";
import { getItemByKey } from "@/db/queries/item";
import { getLatestRunForItem } from "@/db/queries/scoring";
import { getSessionUser } from "@/db/queries/session";
import { getCurrentWorkspace } from "@/db/queries/workspace";
import { getDictionary } from "@/i18n";
import { describeActor } from "@/lib/actor";
import { ROUTES } from "@/lib/routes";
import { composeRunView } from "@/lib/scoring/run-view";
import { getPack } from "@/packs";

import { ActivityFeed } from "./ActivityFeed";
import { ArtifactList } from "./ArtifactList";
import { DecisionList } from "./DecisionList";
import { GapList } from "./GapList";
import { ItemHeader } from "./ItemHeader";
import { ItemSection } from "./ItemSection";
import { ReadinessPanel } from "./ReadinessPanel";

/**
 * One item, everything it owns, readable — the page `/app`'s rows link to.
 *
 * **An unknown key and a key in someone else's workspace are the same 404, by
 * one code path.** The read filters `workspace_id` and RLS narrows it again as
 * the user, so a key belonging to a stranger's workspace comes back as no row —
 * exactly as a key belonging to nobody does. There is nothing here to
 * distinguish them with, and that is the design: telling them apart would answer
 * "does this key exist somewhere?", which is not a question a stranger gets to
 * ask. Never a redirect, which would leak that the key resolves; never a 500,
 * which would leak that something threw.
 *
 * Read-only throughout. §5's three negotiation moves, park, authoring and
 * scoring are all mutations and all later — nothing on this page is a control.
 */
export default async function ItemPage({ params }: PageProps<"/i/[key]">) {
  const t = getDictionary();
  const { key } = await params;

  // The proxy has already turned anonymous traffic away; this re-checks rather
  // than trusting that it ran, because what follows reads user data.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const item = await getItemByKey(workspace.id, key);
  if (!item) notFound();

  // The second and third requests. Both need the uuid the first read returned,
  // so they follow it — but not each other, so they go together.
  const [activity, latestRun] = await Promise.all([
    listItemActivity(workspace.id, item.id),
    getLatestRunForItem(workspace.id, item.id),
  ]);

  /**
   * The run, composed against the pack that names its checks.
   *
   * Null in two situations the page renders identically, and §10 says it
   * should: nothing has ever scored this item, or a pack for the run's id no
   * longer ships. Both mean there is no canonical view to open, and both render
   * as a hollow track with the line that says what the emptiness means — never
   * a zero, which would claim a score that was never computed.
   */
  const pack = latestRun === null ? undefined : getPack(latestRun.packId);
  const run = latestRun && pack ? composeRunView(pack, latestRun) : null;

  // The read stamped its own instant, and everything below is judged against
  // it — see `ItemPageDetail.readAt`.
  const now = item.readAt;

  /** §11: a correction is a new decision naming the one it replaced. */
  const supersededIds = new Set(
    item.decisions
      .map((decision) => decision.supersedesId)
      .filter((id): id is string => id !== null),
  );

  return (
    <main className="mx-auto w-full max-w-[1200px] px-[24px] py-[32px]">
      {/* §4: item page = content 1fr / chat 380. The chat column is reserved
          from the start and built later — adding it then fills a column rather
          than reflowing the page, and §4 turns it into an overlay drawer below
          1024, which is where this collapses to one. */}
      <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-[32px]">
          <Link
            href={ROUTES.app}
            className="type-ui-body w-fit text-n-secondary hover:text-n-primary"
          >
            {t.item.backToList}
          </Link>

          {/* §4's topbar and §8's meter, held at the 16 they had when the meter
              lived inside the header. The meter is the summary of a disclosure
              now (T2.4), and what it opens onto is a page's worth of check
              results — which does not belong inside a `<header>`. */}
          <div className="flex flex-col gap-[16px]">
            <ItemHeader
              item={{
                key: item.key,
                title: item.title,
                type: item.type,
                stage: item.stage,
                productName: item.productName,
                opportunityTitle: item.opportunityTitle,
              }}
              t={t}
            />

            <ReadinessPanel run={run} t={t} now={now} />
          </div>

          <ItemSection title={t.item.artifacts}>
            <ArtifactList
              artifacts={item.artifacts.map((artifact) => ({
                kind: artifact.kind,
                versionCount: artifact.versionCount,
                newestAt: artifact.newestAt === null ? null : Date.parse(artifact.newestAt),
                currentVersionNo: artifact.currentVersionNo,
                currentBody: artifact.currentBody,
              }))}
              t={t}
              now={now}
            />
          </ItemSection>

          <ItemSection title={t.item.gaps}>
            <GapList
              gaps={item.gaps.map((gap) => ({
                id: gap.id,
                checkId: gap.checkId,
                tag: gap.tag,
                disposition: gap.disposition,
                evidence: gap.evidence,
                resolvedBy:
                  gap.resolvedByUserId === null
                    ? null
                    : describeActor({
                        actorKind: "human",
                        actorUserId: gap.resolvedByUserId,
                        actorAgent: null,
                        viewerId: user.id,
                      }),
                resolutionNote: gap.resolutionNote,
              }))}
              t={t}
              scored={run !== null}
            />
          </ItemSection>

          <ItemSection title={t.item.decisions}>
            <DecisionList
              decisions={item.decisions.map((decision) => ({
                id: decision.id,
                statement: decision.statement,
                reason: decision.reason,
                decidedBy: describeActor({
                  actorKind: "human",
                  actorUserId: decision.decidedByUserId,
                  actorAgent: null,
                  viewerId: user.id,
                }),
                decidedAt: Date.parse(decision.decidedAt),
                superseded: supersededIds.has(decision.id),
                supersedes: decision.supersedesId !== null,
              }))}
              t={t}
              now={now}
            />
          </ItemSection>

          <ItemSection title={t.item.activity}>
            <ActivityFeed
              entries={activity.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actor: describeActor({
                  actorKind: entry.actorKind,
                  actorUserId: entry.actorUserId,
                  actorAgent: entry.actorAgent,
                  viewerId: user.id,
                }),
                occurredAt: Date.parse(entry.occurredAt),
              }))}
              t={t}
              now={now}
            />
          </ItemSection>
        </div>

        {/* §4's 380 chat column, reserved and empty. The dock is T2/T3; holding
            its width now is what stops the page reflowing when it arrives. */}
        <aside aria-hidden="true" className="hidden lg:block" />
      </div>
    </main>
  );
}
