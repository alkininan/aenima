import { meterFillClasses, meterTrackClasses, type MeterSize } from "./variants";

type MeterProps = {
  /**
   * Readiness 0–100, or **null when there is no score**.
   *
   * Null is not "zero not yet loaded" — it is §10's no-AI-key state, where
   * meters "render hollow tracks + 'connect AI to activate scoring' — never
   * zeros, never red". A 0 would assert that this artifact was scored and
   * failed, which is a different and much worse claim than saying nothing.
   * Until Phase 2 wires real scoring, null is the only value the product passes.
   */
  score: number | null;
  /** §8: 4 on a list row, 8 on the item page. */
  size?: MeterSize;
  /**
   * What the meter is of — "Define readiness". Rendered into the ARIA label,
   * because a bare progressbar in a row of them names nothing.
   */
  label: string;
  /** §10's "connect AI to activate scoring", for the hollow state. */
  emptyLabel: string;
  className?: string;
};

/**
 * Readiness meter (design-spec.md §8).
 *
 * Track `--surface-2`, fill `--prime`, `--r-pill`. Two sizes: the 4h row
 * micro-meter and the 8h item-page meter.
 *
 * **The hollow state belongs to the item page, and only there** (§8/§10,
 * v2.15). An unscored meter is a track with "connect AI to activate scoring"
 * beside it — the line is what makes the emptiness mean something. A list row
 * has no room for the line, so it renders no meters at all rather than a stub
 * repeated once per row; see `ItemRow`. What §10 forbids everywhere is showing
 * an unscored artifact as a zero: it has not failed anything, and a 0% bar says
 * it has.
 *
 * Accessibility follows the same distinction. With a score it is a
 * `progressbar` carrying its value; without one there is no value to carry, so
 * it renders as an image with a text alternative rather than as a progressbar
 * pinned at zero — which is what a screen reader would otherwise announce.
 */
export function Meter({ score, size = 4, label, emptyLabel, className }: MeterProps) {
  if (score === null) {
    return (
      <span
        role="img"
        aria-label={`${label} — ${emptyLabel}`}
        className={meterTrackClasses(size, className)}
      />
    );
  }

  const clamped = Math.max(0, Math.min(100, score));

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={meterTrackClasses(size, className)}
    >
      <span className={meterFillClasses()} style={{ width: `${clamped}%` }} />
    </span>
  );
}
