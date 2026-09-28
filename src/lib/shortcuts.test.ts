import { describe, expect, it } from "vitest";

import { globalShortcut, hintsOffered, shortcutGroups, type KeyContext } from "@/lib/shortcuts";

const press = (overrides: Partial<KeyContext>): KeyContext => ({
  key: "?",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  inTextField: false,
  modalOpen: false,
  ...overrides,
});

/**
 * design-spec.md §11: global shortcuts work regardless of what has focus, with two
 * exceptions — the unmodified keys are typing inside a text field, and while a modal or
 * sheet is open only Esc and the layer's own keys act.
 */
describe("globalShortcut", () => {
  it("opens the sheet on ? and focuses search on /", () => {
    expect(globalShortcut(press({ key: "?" }))).toBe("sheet");
    expect(globalShortcut(press({ key: "/" }))).toBe("search");
  });

  it("is inert while focus is in a text field, where the keys are typing", () => {
    expect(globalShortcut(press({ key: "?", inTextField: true }))).toBeNull();
    expect(globalShortcut(press({ key: "/", inTextField: true }))).toBeNull();
  });

  it("is inert while a modal or sheet is open", () => {
    expect(globalShortcut(press({ key: "?", modalOpen: true }))).toBeNull();
    expect(globalShortcut(press({ key: "/", modalOpen: true }))).toBeNull();
  });

  it("takes only the unmodified key", () => {
    expect(globalShortcut(press({ key: "?", metaKey: true }))).toBeNull();
    expect(globalShortcut(press({ key: "/", ctrlKey: true }))).toBeNull();
    expect(globalShortcut(press({ key: "/", altKey: true }))).toBeNull();
  });

  it("answers nothing for any other key", () => {
    for (const key of ["a", "Enter", "Escape", "k", " "]) {
      expect(globalShortcut(press({ key }))).toBeNull();
    }
  });
});

/**
 * design-spec.md §8.38: "It shows only shortcuts that exist on the current page and input",
 * in groups Anywhere · Lists · Panels · Chat · Drag, "Drag appears only where a list
 * reorders". Chat waits on the dock and Drag on a list that reorders; neither is built.
 */
describe("shortcutGroups", () => {
  const ids = (page: Parameters<typeof shortcutGroups>[0]) =>
    shortcutGroups(page).map((group) => [group.id, group.rows.map((row) => row.id)]);

  it("lists what exists on a page with a list and menus", () => {
    expect(ids({ list: true, grid: false, panels: true })).toEqual([
      ["anywhere", ["showSheet", "closeLast", "undo"]],
      ["lists", ["betweenRows", "openItem", "jump"]],
      ["panels", ["betweenOptions", "choose", "jump"]],
    ]);
  });

  it("drops a group whose surface is not on the page", () => {
    expect(ids({ list: false, grid: false, panels: false })).toEqual([
      ["anywhere", ["showSheet", "closeLast", "undo"]],
    ]);
    expect(ids({ list: false, grid: false, panels: true }).map(([id]) => id)).toEqual([
      "anywhere",
      "panels",
    ]);
  });

  it("adds the row's own walk once the list is the grid §11 describes", () => {
    const lists = shortcutGroups({ list: true, grid: true, panels: false }).find(
      (group) => group.id === "lists",
    );
    expect(lists?.rows.map((row) => row.id)).toEqual([
      "betweenRows",
      "withinRow",
      "openItem",
      "jump",
    ]);
  });

  it("never lists Chat or Drag while nothing renders them", () => {
    const groups = shortcutGroups({ list: true, grid: true, panels: true }).map((g) => g.id);
    expect(groups).not.toContain("chat");
    expect(groups).not.toContain("drag");
  });

  it("gives every row at least one chord, and Undo the platform modifier", () => {
    for (const group of shortcutGroups({ list: true, grid: true, panels: true })) {
      for (const row of group.rows) expect(row.chords.length).toBeGreaterThan(0);
    }
    const undo = shortcutGroups({ list: false, grid: false, panels: false })[0]?.rows.find(
      (row) => row.id === "undo",
    );
    expect(undo?.chords).toEqual([["mod", "z"]]);
  });
});

/**
 * design-spec.md §8.15 and §4: a kbd hint, and the "Keyboard shortcuts" row, exist on every
 * pointer device and on touch only once the modality script has recorded keyboard input.
 */
describe("hintsOffered", () => {
  it("is offered on a pointer device whether or not a key was ever pressed", () => {
    expect(hintsOffered({ pointer: true, keyboardRecorded: false })).toBe(true);
    expect(hintsOffered({ pointer: true, keyboardRecorded: true })).toBe(true);
  });

  it("is offered on touch only once keyboard input has been recorded", () => {
    expect(hintsOffered({ pointer: false, keyboardRecorded: false })).toBe(false);
    expect(hintsOffered({ pointer: false, keyboardRecorded: true })).toBe(true);
  });
});
