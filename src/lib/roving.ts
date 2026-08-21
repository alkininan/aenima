/**
 * Arrow-key walking — design-spec.md §11: "arrow keys walk menus/selects/list
 * rows". Pure index arithmetic so the rule can be tested without a DOM.
 *
 * Disabled entries are stepped over rather than landed on: §0 law 7 is "dim,
 * don't disable", so a genuinely disabled row is rare, but a select handed one
 * must not trap the cursor on it.
 */

export type RovingOptions = {
  key: string;
  /** Current index, or -1 when nothing is active yet. */
  current: number;
  count: number;
  isDisabled?: ((index: number) => boolean) | undefined;
};

/** The index the key moves to, or null if the key is not a walking key. */
export function nextRovingIndex({ key, current, count, isDisabled }: RovingOptions): number | null {
  if (count <= 0) return null;
  const blocked = isDisabled ?? (() => false);

  const step = (from: number, delta: number): number | null => {
    // At most one full lap: if every entry is disabled there is nowhere to go.
    for (let i = 1; i <= count; i += 1) {
      const index = (((from + delta * i) % count) + count) % count;
      if (!blocked(index)) return index;
    }
    return null;
  };

  switch (key) {
    case "ArrowDown":
      return step(current, 1);
    case "ArrowUp":
      // From "nothing active", Up should land on the last entry, not the first.
      return step(current < 0 ? 0 : current, -1);
    case "Home":
      return blocked(0) ? step(0, 1) : 0;
    case "End":
      return blocked(count - 1) ? step(count - 1, -1) : count - 1;
    default:
      return null;
  }
}
