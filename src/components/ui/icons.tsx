/**
 * The handful of glyphs the composites themselves specify: design-spec.md §8
 * gives the select trigger a chevron (20) and the selected option a check (16).
 * The product icon set is not part of this ticket — anything else a screen
 * needs is passed in by the caller.
 *
 * Each glyph paints in `currentColor` and fills its box, so the size comes from
 * the slot it sits in.
 */
type IconProps = { className?: string };

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="m5 12.5 5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The checkbox tick. Drawn to the 20×20 box §8 gives the control rather than to
 * an icon size, so no icon token is invented for it.
 */
export function CheckboxTickIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="m5 10.5 3.5 3.5L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
