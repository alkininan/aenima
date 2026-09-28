/**
 * design-spec.md §8.38 — whether the shortcut sheet is open, and for which page.
 *
 * Two things open it — `?` from anywhere, and the account menu's row — and they sit in
 * different trees, so the state is a small store rather than a context threaded through the
 * shell, in the shape `layer-stack.ts` and `overlay-host.ts` already use. The page's shape is
 * read by whoever opens it and kept with the open state, so the sheet's render stays a pure
 * read of the store.
 */

import { EMPTY_PAGE, type PageShape } from "./shortcuts";

export type ShortcutSheetState = { open: boolean; page: PageShape };

const CLOSED: ShortcutSheetState = { open: false, page: EMPTY_PAGE };

let state: ShortcutSheetState = CLOSED;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of [...listeners]) listener();
}

/** Opens the sheet over `page`. A second open while it shows changes nothing. */
export function openShortcutSheet(page: PageShape): void {
  if (state.open) return;
  state = { open: true, page };
  announce();
}

export function closeShortcutSheet(): void {
  if (!state.open) return;
  state = CLOSED;
  announce();
}

/** The current state — one object per change, so a store subscriber can compare by identity. */
export function getShortcutSheet(): ShortcutSheetState {
  return state;
}

/** What the server renders: closed, always. */
export function getServerShortcutSheet(): ShortcutSheetState {
  return CLOSED;
}

export function subscribeShortcutSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: the state is module state, so each test starts from closed. */
export function resetShortcutSheet(): void {
  state = CLOSED;
  listeners.clear();
}
