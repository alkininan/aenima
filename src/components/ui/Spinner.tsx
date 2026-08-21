import { spinnerClasses, type SpinnerClassOptions } from "./variants";

type SpinnerProps = SpinnerClassOptions;

/**
 * Element-level loading ring (design-spec.md §8). 2px stroke, 800ms linear
 * rotation, `--prime` unless it sits on a prime fill. Never a full-page spinner.
 *
 * Decorative: the element that is busy carries `aria-busy`.
 */
export function Spinner({ size, tone, className }: SpinnerProps) {
  return <span aria-hidden="true" className={spinnerClasses({ size, tone, className })} />;
}
