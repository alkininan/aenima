import { AE_MARK_PATHS, AE_MARK_VIEW_BOX } from "./ae-mark-paths";

type AeMarkProps = {
  /**
   * Rendered edge length in px. design-spec.md §1: sidebar 24, favicon 16,
   * packet and doc headers 32; never below 14.
   */
  size?: number;
  className?: string;
};

/**
 * The Æ ligature brand mark (design-spec.md §1).
 *
 * Always flat and one colour. The glyph paints in `currentColor`, so the colour
 * comes from whatever token the caller sets — `--n-primary` by default on dark,
 * `--n-white` for emphasis, `--bg-base` on light surfaces. Decorative by
 * default; give the mark a text label where it needs to be announced.
 */
export function AeMark({ size = 24, className }: AeMarkProps) {
  return (
    <svg
      viewBox={AE_MARK_VIEW_BOX}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {AE_MARK_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
