import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CheckIcon } from "@/components/ui/icons";
import type { Dictionary } from "@/i18n";
import type { CheckLine } from "@/lib/scoring/run-view";

/**
 * One run, every check — product-spec.md §1 law 3 rendered literally.
 *
 * "Every score, flag, and suggestion expands into the exact quoted gap. A
 * number that cannot be interrogated does not ship." This is where a human goes
 * to interrogate a number: the whole rubric, in pack order, with what happened
 * to each check and the exact text behind every failure.
 *
 * **Passes are here too.** A list of only the failures would be a list of
 * complaints; the canonical view of a run is what it asked and what it found,
 * and a check that passed is the evidence that it was asked at all.
 *
 * **A container means a gap.** Only an unclear check carries a chip. v2.15
 * removed the type badge's outline from the item row for this reason — "a
 * bordered chip in a row must mean something, and what it means there is a
 * gap" — and the same rule holds one level down. A pass and a not-asked check
 * carry text labels without one.
 *
 * **No danger anywhere.** §0 law 1: "Meters and gaps never render in Danger
 * red." §12: "this section was unclear," never "failed". An unclear Must is
 * `--warning`, an unclear Should is neutral, and nothing on this list is red.
 *
 * **The check's own wording comes from the pack, not from `src/i18n`.** A
 * check's prose is content the rubric owns and versions; the chrome around it
 * is what the product says. See `src/packs/types.ts`.
 *
 * Read-only. §5's three negotiation moves are T2.5, and each is a mutation with
 * a scoring run behind it.
 */
export function CheckList({ checks, t }: { checks: readonly CheckLine[]; t: Dictionary }) {
  return (
    <ul data-testid="check-list" aria-label={t.item.checks} className="flex flex-col gap-[8px]">
      {checks.map((check) => (
        <li key={check.checkId} className="flex flex-col gap-[8px]">
          <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[4px]">
            {/* §3: check IDs are mono-readout. */}
            <span className="type-mono-readout shrink-0 text-n-secondary">{check.checkId}</span>

            {/* Null when the loaded pack no longer names this check — the id is
                still true, so the line stands on it rather than disappearing.
                See `CheckLine.prose`. */}
            {check.prose === null ? null : (
              <span className="type-ui-body min-w-0 text-n-primary">{check.prose}</span>
            )}

            <span className="ml-auto shrink-0">{stateLabel(check, t)}</span>
          </div>

          {/* §8: "evidence quotes ui-body on --surface-1 cards". §5's own
              sentence shape, rendered by the one function that renders it, so
              this and the gap list cannot show one failure two ways. */}
          {check.state === "unclear" ? (
            <Card className="type-ui-body text-n-primary">{check.evidence}</Card>
          ) : null}

          {/* §4's renormalization, said out loud. The condition is written
              affirmatively in the pack and it is here because it did **not**
              hold, so the negation is in the string, never in the pack. */}
          {check.state === "not-asked" ? (
            <p className="type-ui-footnote text-n-secondary">
              {t.item.checkNotAskedReason(check.condition)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * What happened to this check, in words — never in colour alone.
 *
 * §13: "Meters always pair color with the numeric value; gap states carry text
 * labels, not color alone." So every state says what it is, and the tone is the
 * second signal rather than the only one.
 */
function stateLabel(check: CheckLine, t: Dictionary) {
  if (check.state === "passed") {
    // §2's usage map gives passed checks `--success`. No container: a pass is
    // not a gap, and the tick is the quiet half of a pair with the word.
    return (
      <span className="type-mono-micro inline-flex items-center gap-[4px] text-success">
        <CheckIcon className="size-[12px]" />
        {t.item.checkPassed}
      </span>
    );
  }

  if (check.state === "unclear") {
    // §8's gap-chip tones, unchanged: an open Must is `--warning-soft`, an open
    // Should is `--surface-2`. Only a Must is warm, because only a Must blocks.
    return (
      <Chip variant="gap" tone={check.tag}>
        {t.item.checkUnclear}
      </Chip>
    );
  }

  return <span className="type-mono-micro text-n-secondary">{t.item.checkNotAsked}</span>;
}
