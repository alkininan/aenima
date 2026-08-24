import type { Dictionary } from "@/i18n";
import type { Actor } from "@/lib/actor";
import { relativeTime } from "@/lib/relative-time";

export type ActivityView = {
  id: string;
  /** §2's namespaced verb, e.g. `item.created`. Rendered as data, not prose. */
  action: string;
  actor: Actor;
  /** Epoch ms. */
  occurredAt: number;
};

/**
 * The item's ledger — product-spec.md §2: "Every mutating action — human or
 * agent — records its actor, timestamp, and trigger."
 *
 * **Agent actors render in `--agent`** per §0 law 4: "Anything the agent drafted
 * or proposes carries Agent/Violet until a human confirms it." In the ledger the
 * violet is not a pending state, it is attribution — the row says a machine did
 * this, which is exactly what law 4 exists to keep visible.
 *
 * **A human who is not the reader is "someone".** `activity.actor_user_id` lost
 * its foreign key to `auth.users` in migration 0003 so that a person can be
 * deleted without rewriting history, and the cost is that nothing resolves an id
 * to a name until Phase 5 snapshots one. A uuid is not a name — see
 * `src/lib/actor.ts`.
 *
 * The action renders as its raw verb in mono-readout rather than as a sentence.
 * A namespaced verb is data, and turning `item.created` into "Someone created
 * this item" needs a phrase per action in three languages — which is a copy
 * surface that should arrive with the actions themselves rather than be guessed
 * at now.
 */
export function ActivityFeed({
  entries,
  t,
  now,
}: {
  entries: readonly ActivityView[];
  t: Dictionary;
  now: number;
}) {
  if (entries.length === 0) {
    return <p className="type-ui-body text-n-secondary">{t.item.noActivity}</p>;
  }

  return (
    <ul className="flex flex-col gap-[4px]">
      {entries.map((entry) => {
        const relative = relativeTime(entry.occurredAt, now);
        const when =
          relative.unit === "justNow"
            ? t.relativeTime.justNow
            : t.relativeTime[relative.unit](relative.value);

        const actor =
          entry.actor.kind === "agent"
            ? entry.actor.name
            : entry.actor.kind === "self"
              ? t.item.actorSelf
              : t.item.actorOther;

        return (
          <li key={entry.id} className="flex flex-wrap items-baseline gap-[8px]">
            {/* §0 law 4: the machine is visibly the machine. */}
            <span
              className={
                entry.actor.kind === "agent"
                  ? "type-ui-body text-agent"
                  : "type-ui-body text-n-primary"
              }
            >
              {actor}
            </span>
            <span className="type-mono-readout text-n-secondary">{entry.action}</span>
            <span className="type-mono-readout text-n-secondary">{when}</span>
          </li>
        );
      })}
    </ul>
  );
}
