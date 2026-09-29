import type { Dictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/relative-time";
import type { RunView } from "@/lib/scoring/run-view";

/**
 * When this was scored, and whether §5's queue is holding a retry — the item page's
 * freshness, which design-spec §4 puts in the page topbar's mono-readout slot.
 *
 * §10: "Provider outage / retry: freshness shows `--warning` dot + mono-readout
 * 'scored 6 h ago — retrying'; no banners." The dot and the sentence are the
 * whole of what a person is told — §12 keeps the voice calm and §0 law 1 keeps
 * Danger off anything that is not destructive. A queued retry is the system
 * working, not an error, and it never reddens.
 *
 * Every system dot in the product is 8 (§8). The face and the gap are the slot's
 * (`PAGE_READOUT_CLASSES`); this renders the dot and the words.
 */
export function Freshness({ run, t, now }: { run: RunView; t: Dictionary; now: number }) {
  const elapsed = relativeTime(Date.parse(run.provenance.scoredAt), now);
  const relative =
    elapsed.unit === "justNow"
      ? t.relativeTime.justNow
      : t.relativeTime[elapsed.unit](elapsed.value);

  const retrying = run.provenance.nextScoringAttemptAt !== null;

  return (
    <>
      <span
        aria-hidden="true"
        data-testid="page-freshness-dot"
        className={cx("size-[8px] shrink-0 rounded-pill", retrying ? "bg-warning" : "bg-prime")}
      />
      <span>{retrying ? t.item.scoredRetrying(relative) : t.item.scoredAt(relative)}</span>
    </>
  );
}
