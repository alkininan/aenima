/**
 * Type-to-jump — design-spec.md §8 requires it on the select.
 *
 * The buffer reset is an interaction constant, not a design value: the spec's
 * durations in §6 are all motion. 500ms is the WAI-ARIA authoring-practices
 * figure for a listbox typeahead.
 */
export const TYPEAHEAD_RESET_MS = 500;

/**
 * The index the buffer jumps to, or null if nothing matches.
 *
 * Repeating one character cycles through the entries starting with it — the
 * behaviour a user expects from pressing "s" three times — while a longer
 * buffer is matched as a prefix.
 */
export function matchTypeahead(
  buffer: string,
  labels: readonly string[],
  from: number,
): number | null {
  if (!buffer) return null;

  const query = buffer.toLowerCase();
  const repeated = query.split("").every((char) => char === query[0]);
  const needle = repeated ? (query[0] ?? "") : query;
  // A repeated character walks off the current entry; a prefix search may land
  // back on it, so that the buffer can be extended without the cursor moving.
  const start = repeated ? from + 1 : Math.max(from, 0);

  for (let i = 0; i < labels.length; i += 1) {
    const index = (((start + i) % labels.length) + labels.length) % labels.length;
    const label = labels[index];
    if (label !== undefined && label.toLowerCase().startsWith(needle)) return index;
  }
  return null;
}
