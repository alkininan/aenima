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

/**
 * Google's "G". Present for the deferred Google provider (product-spec.md §12)
 * so the seam is complete when it is switched on; nothing renders it today,
 * because a sign-in button for a provider that is off is worse than no button.
 *
 * The one glyph in this file that is not `currentColor`: Google's brand
 * guidelines require the four fixed colours, so it does not take the theme.
 */
export function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.88c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.540-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.7a11.5 11.5 0 0 0 0 10.32l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.08c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.63 15.11.5 12 .5A11.5 11.5 0 0 0 1.7 6.84l3.85 2.98C6.46 7.1 9 5.08 12 5.08Z"
      />
    </svg>
  );
}

/** Envelope, for the email provider's control. */
export function MailIcon({ className }: IconProps) {
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
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 8 7.1 4.7a1.6 1.6 0 0 0 1.8 0L20 8" strokeLinecap="round" />
    </svg>
  );
}
