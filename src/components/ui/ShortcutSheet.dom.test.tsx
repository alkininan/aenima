import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { KeyboardLayer } from "@/components/ui/KeyboardLayer";
import { pushLayer, resetLayers } from "@/lib/layer-stack";
import { resetShortcutSheet } from "@/lib/shortcut-sheet";

beforeEach(() => {
  resetLayers();
  resetShortcutSheet();
});

/** A page with a list and a menu trigger on it, and a text field to type into. */
function harness() {
  render(
    <>
      <KeyboardLayer />
      <main>
        <a href="#soc-12" data-row-link="soc-12">
          row
        </a>
        <button type="button" aria-haspopup="menu">
          menu
        </button>
        <label>
          note <input type="text" />
        </label>
      </main>
    </>,
  );
  return { field: screen.getByLabelText("note"), row: screen.getByText("row") };
}

const sheet = () => screen.queryByRole("dialog", { name: "Keyboard shortcuts" });

/** design-spec.md §8.38 and §11: `?` opens the sheet when focus is not in a text field and no modal is open. */
describe("the shortcut sheet", () => {
  it("opens on ? with the groups the page has, and closes on Close, returning focus", async () => {
    const user = userEvent.setup();
    const { row } = harness();
    row.focus();

    fireEvent.keyDown(document, { key: "?" });
    expect(sheet()).not.toBeNull();

    const groups = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(groups).toEqual(["Anywhere", "Lists", "Panels"]);
    expect(screen.getByText("Show keyboard shortcuts")).toBeTruthy();
    expect(screen.getByText("Move between rows")).toBeTruthy();
    expect(screen.getByText("Move between options")).toBeTruthy();
    // §8.15: the hint at the trailing edge, as a key.
    expect(screen.getAllByText("?", { selector: "kbd" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("closes on Esc, taking it as the last layer opened", () => {
    harness();
    fireEvent.keyDown(document, { key: "?" });
    expect(sheet()).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet()).toBeNull();
  });

  it("is inert while focus is in a text field, where ? is typing", () => {
    const { field } = harness();
    field.focus();

    fireEvent.keyDown(field, { key: "?" });
    expect(sheet()).toBeNull();
  });

  it("is inert while a modal is open", () => {
    harness();
    pushLayer("some-modal", "modal");

    fireEvent.keyDown(document, { key: "?" });
    expect(sheet()).toBeNull();
  });

  it("does not open twice: the open sheet is itself a modal", () => {
    harness();
    fireEvent.keyDown(document, { key: "?" });
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("shows only the groups that exist on the page", () => {
    render(
      <>
        <KeyboardLayer />
        <main>
          <p>nothing to walk</p>
        </main>
      </>,
    );
    act(() => {
      fireEvent.keyDown(document, { key: "?" });
    });
    expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual([
      "Anywhere",
    ]);
  });
});

/** design-spec.md §11: "`/` focuses search in list views". */
describe("the / shortcut", () => {
  it("focuses the page's search field outside a text field, and types inside one", () => {
    render(
      <>
        <KeyboardLayer />
        <main>
          <label>
            Search <input type="search" />
          </label>
          <label>
            note <input type="text" />
          </label>
        </main>
      </>,
    );
    const search = screen.getByLabelText("Search");
    const note = screen.getByLabelText("note");

    const outside = fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(search);
    // Taken, so the slash is not typed into the field it just focused.
    expect(outside).toBe(false);

    note.focus();
    const inside = fireEvent.keyDown(note, { key: "/" });
    expect(document.activeElement).toBe(note);
    expect(inside).toBe(true);
  });

  it("does nothing on a page with no search field", () => {
    render(
      <>
        <KeyboardLayer />
        <main>
          <button type="button">only this</button>
        </main>
      </>,
    );
    const untouched = fireEvent.keyDown(document.body, { key: "/" });
    expect(untouched).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
