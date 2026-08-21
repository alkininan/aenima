import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/Button";
import { Menu, type MenuEntry } from "@/components/ui/Menu";

function harness(onDelete = vi.fn()) {
  const entries: readonly MenuEntry[] = [
    { kind: "section", label: "Item" },
    { kind: "item", label: "Open", onSelect: vi.fn() },
    { kind: "item", label: "Unavailable", onSelect: vi.fn(), disabled: true },
    { kind: "item", label: "Duplicate", onSelect: vi.fn() },
    { kind: "separator" },
    { kind: "item", label: "Delete", onSelect: onDelete, destructive: true },
  ];
  render(<Menu label="Item actions" entries={entries} trigger={<Button>Actions</Button>} />);
  return { trigger: screen.getByRole("button", { name: "Actions" }) };
}

const items = () => screen.getAllByRole("menuitem");

/** design-spec.md §11: arrow keys walk menus, Esc closes, focus returns. */
describe("Menu keyboard", () => {
  it("opens on the trigger and moves focus to the first row", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items()[0]);
  });

  it("walks the rows, stepping over the disabled one and past sections", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();
    await user.click(trigger);

    await user.keyboard("{ArrowDown}");
    // Row 1 is disabled, so Down from row 0 lands on row 2.
    expect(document.activeElement).toBe(items()[2]);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items()[3]);

    // And wraps.
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items()[0]);
  });

  it("jumps to the ends", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();
    await user.click(trigger);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items()[3]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items()[0]);
  });

  // §11: Esc closes the topmost layer; on close, focus returns to the opener.
  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();
    await user.click(trigger);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when Tab leaves it", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();
    await user.click(trigger);

    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs the row's action and closes", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { trigger } = harness(onDelete);
    await user.click(trigger);

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders the §8 furniture: section titles and separators", async () => {
    const user = userEvent.setup();
    const { trigger } = harness();
    await user.click(trigger);

    expect(screen.getByText("Item").className).toContain("type-mono-micro");
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });
});
