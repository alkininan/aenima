import { describe, expect, it } from "vitest";

import { LOCALES, getDictionary } from "@/i18n";

/**
 * The ticket's Decision: the sheet's rows are the stop's verb phrases, translated into TR and
 * NL. Nine rows, five groups and a title, each present in every locale and each translation
 * its own words rather than the English copied across.
 */
const ROWS = [
  "showSheet",
  "closeLast",
  "undo",
  "betweenRows",
  "withinRow",
  "openItem",
  "jump",
  "betweenOptions",
  "choose",
] as const;

const GROUPS = ["anywhere", "lists", "panels", "chat", "drag"] as const;

describe("the shortcut sheet's strings", () => {
  it("carries the title, the five groups and the nine rows in every locale", () => {
    for (const locale of LOCALES) {
      const { shortcuts, common } = getDictionary(locale);
      expect(shortcuts.title.length).toBeGreaterThan(0);
      for (const group of GROUPS) expect(shortcuts.groups[group].length).toBeGreaterThan(0);
      for (const row of ROWS) expect(shortcuts.rows[row].length).toBeGreaterThan(0);
      expect(common.close.length).toBeGreaterThan(0);
      expect(common.skipToContent.length).toBeGreaterThan(0);
    }
  });

  it("holds §12's defaults in English", () => {
    const { shortcuts, common } = getDictionary("en");
    expect(shortcuts.title).toBe("Keyboard shortcuts");
    expect(shortcuts.groups).toEqual({
      anywhere: "Anywhere",
      lists: "Lists",
      panels: "Panels",
      chat: "Chat",
      drag: "Drag",
    });
    expect(common.skipToContent).toBe("Skip to content");
    expect(common.close).toBe("Close");
  });

  it("holds the Decision's verb phrases in English", () => {
    expect(getDictionary("en").shortcuts.rows).toEqual({
      showSheet: "Show keyboard shortcuts",
      closeLast: "Close the last thing opened",
      undo: "Undo",
      betweenRows: "Move between rows",
      withinRow: "Move within a row",
      openItem: "Open the item",
      jump: "Jump to the first or last",
      betweenOptions: "Move between options",
      choose: "Choose",
    });
  });

  it("translates every row and the title for TR and NL rather than resolving to English", () => {
    const en = getDictionary("en").shortcuts;
    for (const locale of ["tr", "nl"] as const) {
      const other = getDictionary(locale).shortcuts;
      expect(other.title).not.toBe(en.title);
      for (const row of ROWS) expect(other.rows[row]).not.toBe(en.rows[row]);
    }
    // And the two are not each other's.
    expect(getDictionary("tr").shortcuts.rows).not.toEqual(getDictionary("nl").shortcuts.rows);
  });
});
