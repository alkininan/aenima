import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Select, type SelectOption } from "@/components/ui/Select";

const OPTIONS: readonly SelectOption[] = [
  { value: "feature", label: "Feature" },
  { value: "enhancement", label: "Enhancement" },
  { value: "technical", label: "Technical" },
  { value: "fix", label: "Fix" },
];

const WITH_DISABLED: readonly SelectOption[] = [
  { value: "one", label: "One" },
  { value: "two", label: "Two", disabled: true },
  { value: "three", label: "Three" },
];

function Harness({ options = OPTIONS }: { options?: readonly SelectOption[] }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Select
      label="Type"
      placeholder="Pick a type"
      options={options}
      value={value}
      onValueChange={setValue}
    />
  );
}

const combobox = () => screen.getByRole("combobox") as HTMLInputElement;
const activeOptionLabel = () => {
  const id = combobox().getAttribute("aria-activedescendant");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

/**
 * design-spec.md §8 (select panel behaviour) and §11 (arrow keys walk selects,
 * Esc closes the topmost layer, focus stays reachable).
 */
describe("Select keyboard", () => {
  it("starts closed and announces itself as a collapsed combobox", () => {
    render(<Harness />);
    expect(combobox().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on ArrowDown and puts the cursor on the first option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}");
    expect(combobox().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(activeOptionLabel()).toBe("Feature");
  });

  it("walks with the arrow keys and wraps", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOptionLabel()).toBe("Enhancement");

    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeOptionLabel()).toBe("Fix");

    await user.keyboard("{Home}");
    expect(activeOptionLabel()).toBe("Feature");
    await user.keyboard("{End}");
    expect(activeOptionLabel()).toBe("Fix");
  });

  it("keeps focus on the trigger rather than moving it into the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(combobox());
  });

  it("commits on Enter, closes, and leaves focus on the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(combobox().value).toBe("Enhancement");
    expect(combobox().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(combobox());
  });

  // §11: Esc closes the topmost layer; on close, focus returns to the opener.
  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox().value).toBe("");
    expect(document.activeElement).toBe(combobox());
  });

  it("closes when Tab leaves the field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}");
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // §8: type-to-jump.
  it("jumps to an option by typing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("t");
    expect(combobox().getAttribute("aria-expanded")).toBe("true");
    expect(activeOptionLabel()).toBe("Technical");

    await user.keyboard("{Enter}");
    expect(combobox().value).toBe("Technical");
  });

  it("narrows as more letters arrive", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}");
    await user.keyboard("fe");
    expect(activeOptionLabel()).toBe("Feature");
  });

  it("steps over a disabled option and refuses to commit it", async () => {
    const user = userEvent.setup();
    render(<Harness options={WITH_DISABLED} />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOptionLabel()).toBe("Three");

    await user.keyboard("{Enter}");
    expect(combobox().value).toBe("Three");
  });

  it("marks the selected option and only that one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{Enter}");
    await user.keyboard("{ArrowDown}");

    const selected = screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain("Feature");
  });

  it("does nothing at all when disabled", async () => {
    const user = userEvent.setup();
    render(
      <Select label="Type" options={OPTIONS} value={null} onValueChange={() => {}} disabled />,
    );

    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
