/**
 * design-spec.md §6 — the timers that live in script rather than in CSS.
 *
 * §6's own sentence: "Every duration the stylesheet uses is one of the tokens above. The
 * timers that live in script rather than CSS … live in one constants module, `motion.ts`,
 * that C-05 reads beside `globals.css`; no component carries a number of its own."
 *
 * So this module holds **exactly** the timers §6 names, and nothing else: C-05 reads the
 * document and this file in both directions, so a timer here that §6 does not name fails
 * the check as surely as one of §6's that is missing. A duration a stylesheet uses is a
 * token in `globals.css`, not a constant here.
 *
 * Each constant names the section it serves, which is how C-05 pairs the two lists: §6
 * writes its timers with the section each belongs to, and the check reads these comments
 * for the same pairing rather than matching bare numbers.
 */

/** §8.2 — the pause before a field validates while you are still typing. */
export const VALIDATION_PAUSE_MS = 1500;

/** §8.16 — how long a copy button shows its tick before returning to its label. */
export const COPY_TICK_MS = 1500;

/** §8.20 — a toast dismisses itself. */
export const TOAST_DISMISS_MS = 5000;

/** §8.20 — an undo toast stays the longer of the two: its action has to be reached. */
export const TOAST_UNDO_DISMISS_MS = 8000;

/** §8.4 — the resend cooldown. */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * §8.21 — the flick that dismisses a sheet, in px/ms. A velocity, not a clock, and the
 * one number here that is not a duration; §6 lists it with the timers because it is the
 * same kind of thing: a figure the document fixes and script reads.
 */
export const SHEET_DISMISS_VELOCITY_PX_PER_MS = 0.5;
