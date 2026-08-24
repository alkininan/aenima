import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { Dictionary } from "@/i18n";
import type { Actor } from "@/lib/actor";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/relative-time";

export type DecisionView = {
  id: string;
  statement: string;
  reason: string;
  decidedBy: Actor | null;
  /** Epoch ms. */
  decidedAt: number;
  /** True when a later decision on this item names this one as replaced. */
  superseded: boolean;
  /** True when this decision itself replaces an earlier one. */
  supersedes: boolean;
};

function actorWords(actor: Actor | null, t: Dictionary): string {
  if (!actor) return t.item.actorOther;
  if (actor.kind === "agent") return actor.name;
  return actor.kind === "self" ? t.item.actorSelf : t.item.actorOther;
}

/**
 * The item's decision log — product-spec.md §2, and §8's "who agreed to ship
 * without offline handling?" answered forever.
 *
 * **Superseded decisions stay.** `decision` is append-only and §11 makes a
 * correction a *new* decision naming the old one, so a replaced decision is
 * still a thing someone decided on a day — it is marked, not removed. Removing
 * it would make the log a statement of current opinion rather than a record.
 *
 * The supersede link points backwards: a decision carries the id of the one it
 * replaced. So "was this replaced?" is answered by the page scanning the item's
 * own decisions for one pointing at it — no extra read.
 */
export function DecisionList({
  decisions,
  t,
  now,
}: {
  decisions: readonly DecisionView[];
  t: Dictionary;
  now: number;
}) {
  if (decisions.length === 0) {
    return <p className="type-ui-body text-n-secondary">{t.item.noDecisions}</p>;
  }

  // Newest first: a log is read from the top, and the most recent decision is
  // the one currently in force.
  const ordered = [...decisions].sort((a, b) => b.decidedAt - a.decidedAt);

  return (
    <ul className="flex flex-col gap-[8px]">
      {ordered.map((decision) => {
        const relative = relativeTime(decision.decidedAt, now);
        const when =
          relative.unit === "justNow"
            ? t.relativeTime.justNow
            : t.relativeTime[relative.unit](relative.value);

        return (
          <li key={decision.id}>
            <Card
              padding={20}
              className={cx("flex flex-col gap-[8px]", decision.superseded && "opacity-60")}
            >
              <div className="flex flex-wrap items-center gap-[8px]">
                {decision.superseded ? (
                  <Chip variant="gap" tone="excluded">
                    {t.item.supersededBy}
                  </Chip>
                ) : null}
                {decision.supersedes ? (
                  <span className="type-mono-micro text-n-secondary">{t.item.supersedes}</span>
                ) : null}
              </div>

              {/* What was decided, then why — §2 wants both, and a decision
                  without its reason is an assertion. */}
              <p className="type-ui-headline text-n-primary">{decision.statement}</p>
              <p className="type-ui-body text-n-secondary">{decision.reason}</p>

              <p className="type-ui-footnote text-n-secondary">
                {t.item.decidedBy(actorWords(decision.decidedBy, t))} · {when}
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
