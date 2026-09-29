/**
 * §8.9: on a row and on the gap card the chip reads "Must · {check id}", "the id in
 * mono-readout" inside the ui-caption chip. The dictionary formats one string per §12 —
 * the shape C-33 holds verbatim — and a locale may put the id anywhere in it, so the
 * rendered chip splits the formatted string around the id it was given rather than
 * assuming English order.
 */

/**
 * The text either side of `value` in `label`, or null when the label does not carry it —
 * the caller then renders the label whole rather than guessing where mono would go.
 */
export function splitAround(
  label: string,
  value: string,
): { before: string; after: string } | null {
  if (value.length === 0) return null;
  const at = label.lastIndexOf(value);
  if (at < 0) return null;
  return { before: label.slice(0, at), after: label.slice(at + value.length) };
}
