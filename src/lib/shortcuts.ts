/**
 * design-spec.md §11 and §8.38 — the global shortcuts, and the sheet that maps them.
 *
 * Pure decisions over plain values, so §11's two exceptions can be tested as rules rather
 * than by driving a browser: "the unmodified keys (`/`, `?`) and `Cmd/Ctrl+Z` are inert while
 * focus is in a text field, where they are typing; and while a modal or sheet is open only
 * Esc and the layer's own keys act, since a shortcut that moved focus out of the trap would
 * land in the inert page." `Cmd/Ctrl+Z` is the toast's own (`Toast.tsx`, §8.20) and is not
 * decided here; `Cmd/Ctrl+K` opens a dock that is not built (T0.45's Decision).
 */

import type { Chord } from "./platform";

export type ShortcutAction = "sheet" | "search";

export type KeyContext = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** `isTextField(document.activeElement)` — see `text-field.ts`. */
  inTextField: boolean;
  /** Whether any modal or sheet is open, whatever is on top of it. */
  modalOpen: boolean;
};

/** What a key press asks for, or null when it asks for nothing global. */
export function globalShortcut(context: KeyContext): ShortcutAction | null {
  if (context.metaKey || context.ctrlKey || context.altKey) return null;
  if (context.inTextField || context.modalOpen) return null;
  if (context.key === "?") return "sheet";
  if (context.key === "/") return "search";
  return null;
}

/**
 * §8.38: "It shows only shortcuts that exist on the current page and input." What the page
 * has, read once when the sheet opens.
 */
export type PageShape = {
  /** A list of rows the arrow keys walk (`RowWalker`). */
  list: boolean;
  /** The list as §11's grid, whose rows Right and Left walk — *Row and cards to v2.21*. */
  grid: boolean;
  /** A menu, select or combobox: a panel with roving focus. */
  panels: boolean;
};

export const EMPTY_PAGE: PageShape = { list: false, grid: false, panels: false };

/** The page's shape, read from the document. */
export function readPage(root: ParentNode): PageShape {
  return {
    list: root.querySelector("[data-row-link]") !== null,
    grid: root.querySelector('[role="grid"]') !== null,
    panels: root.querySelector('[aria-haspopup], [role="combobox"]') !== null,
  };
}

/** §12: the sheet's five groups, in §8.38's order. */
export type ShortcutGroupId = "anywhere" | "lists" | "panels" | "chat" | "drag";

/** The rows the ticket's Decision names, each a key into the dictionary's `shortcuts.rows`. */
export type ShortcutRowId =
  | "showSheet"
  | "closeLast"
  | "undo"
  | "betweenRows"
  | "withinRow"
  | "openItem"
  | "jump"
  | "betweenOptions"
  | "choose";

export type ShortcutRow = { id: ShortcutRowId; chords: readonly Chord[] };

export type ShortcutGroup = { id: ShortcutGroupId; rows: readonly ShortcutRow[] };

/**
 * The groups and rows the sheet shows for a page. A group with nothing on the page is
 * omitted rather than shown empty. Chat waits on the dock (*Build the dock surface*) and Drag
 * on a list that reorders — "Drag appears only where a list reorders" — so neither has a row
 * yet; the group names stand in the dictionary for the tickets that add them.
 */
export function shortcutGroups(page: PageShape): ShortcutGroup[] {
  const groups: ShortcutGroup[] = [
    {
      id: "anywhere",
      rows: [
        { id: "showSheet", chords: [["?"]] },
        { id: "closeLast", chords: [["esc"]] },
        { id: "undo", chords: [["mod", "z"]] },
      ],
    },
  ];

  if (page.list) {
    groups.push({
      id: "lists",
      rows: [
        { id: "betweenRows", chords: [["up"], ["down"]] },
        ...(page.grid
          ? [{ id: "withinRow" as const, chords: [["left"], ["right"]] as const }]
          : []),
        { id: "openItem", chords: [["enter"]] },
        { id: "jump", chords: [["home"], ["end"]] },
      ],
    });
  }

  if (page.panels) {
    groups.push({
      id: "panels",
      rows: [
        { id: "betweenOptions", chords: [["up"], ["down"]] },
        { id: "choose", chords: [["enter"]] },
        { id: "jump", chords: [["home"], ["end"]] },
      ],
    });
  }

  return groups;
}

/**
 * §8.15 and §4: a kbd hint, and the account menu's "Keyboard shortcuts" row, exist on every
 * pointer device, and on touch only once the modality script has recorded keyboard input —
 * "an iPad with a keyboard has every shortcut, a bare one has none."
 */
export function hintsOffered({
  pointer,
  keyboardRecorded,
}: {
  /** §7's pointer query, `(hover: hover) and (pointer: fine)`. */
  pointer: boolean;
  /**
   * Whether the modality script has ever recorded keyboard input —
   * `data-keyboard-recorded` on `<html>`, a latch rather than the current modality.
   */
  keyboardRecorded: boolean;
}): boolean {
  return pointer || keyboardRecorded;
}
