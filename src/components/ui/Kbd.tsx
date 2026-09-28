"use client";

import { useSyncExternalStore } from "react";

import { cx } from "@/lib/cx";
import { formatChord, isApplePlatform, type Chord } from "@/lib/platform";

/** Never resubscribes: the platform cannot change under a running page. */
const noopSubscribe = () => () => {};

let apple: boolean | null = null;

/** §8.15: "read from the user agent at load" — once, on the client. */
function readApple(): boolean {
  if (apple === null) apple = isApplePlatform(navigator.userAgent, navigator.platform);
  return apple;
}

/**
 * Whether the modifier glyph is `⌘`. The server has no user agent and answers `Ctrl`, which
 * the client then corrects after hydration — only the kitchen-sink route renders a hint on
 * the server; every product hint lives in a panel or the sheet, which open on the client.
 */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(noopSubscribe, readApple, () => false);
}

/**
 * §8.15: mono-readout, `--surface-2` fill, `--r-xs`, pad 2/6, 20h, `--n-secondary`, a 1px
 * `--glass-border` on the bottom edge only — the cap of a key. The `kbd` class is what the
 * stylesheet reads to hide every hint on touch until keyboard input has been recorded.
 */
export const KBD_CLASSES =
  "kbd inline-flex h-[20px] shrink-0 items-center rounded-xs border-b border-glass-border " +
  "bg-surface-2 px-[6px] py-[2px] type-mono-readout text-n-secondary";

/**
 * Kbd hint (design-spec.md §8.15) — a shortcut rendered as a key. It appears trailing in menu
 * rows, inside tooltips and in the shortcut sheet (§8.38), and never on touch until the
 * modality script has recorded keyboard input (§6, §7): that rule is the stylesheet's, on the
 * `kbd` class, so a hint hides wherever it is rendered rather than wherever someone
 * remembered to gate it.
 */
export function Kbd({ chord, className }: { chord: Chord; className?: string | undefined }) {
  const apple = useApplePlatform();
  return (
    <kbd data-testid="kbd-hint" className={cx(KBD_CLASSES, className)}>
      {formatChord(chord, apple)}
    </kbd>
  );
}
