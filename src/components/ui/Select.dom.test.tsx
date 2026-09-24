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
  return <Select label="Type" options={options} value={value} onValueChange={setValue} />;
}

/**
 * The field, by its role, with its id as the fallback. §6 hides it for the
 * panel's lifetime by opacity, which leaves it in the accessibility tree.
 */
const combobox = () =>
  (screen.queryByRole("combobox") ??
    document.querySelector('input[role="combobox"]')) as HTMLInputElement;

/**
 * Where the keyboard cursor is. Since v2.21 that is **real focus**, not
 * `aria-activedescendant`: §6 places focus "on the panel's first item, which in
 * a select is the selected option" inside the morph's update callback, because
 * the field is hidden from that moment and a keystroke aimed at it would go
 * nowhere (C-17). So the cursor is read off `document.activeElement`.
 */
const activeOptionLabel = () => {
  const active = document.activeElement;
  return active?.getAttribute("role") === "option" ? active.textContent : null;
};

/**
 * design-spec.md §8.5 (select panel behaviour) and §11 (arrow keys walk selects,
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

  /**
   * C-17, and the one contract v2.21 reversed here. Until v2.18 focus stayed on
   * the field and the active option was named by `aria-activedescendant`; §6's
   * morph makes that untenable, because the field is hidden for the panel's
   * lifetime and a keystroke aimed at it would land on a field nobody can see.
   */
  it("moves focus into the panel, onto the option the cursor is on", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.getAttribute("role")).toBe("option");
    expect(document.activeElement?.textContent).toBe("Enhancement");
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

  // §8.5: "Tab selects the active option and closes, carrying focus onward."
  it("commits the active option on Tab and closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}");
    await user.tab();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox().value).toBe("Feature");
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

/**
 * T0.37's Decision on §6's three sentences, answered *default*: the trigger hides for the
 * panel's lifetime by `opacity: 0` and `pointer-events: none`, never `visibility: hidden`.
 * In Chromium an anchor hidden by `visibility` makes its anchor-positioned panel stop
 * taking pointer events under the default `position-visibility`, which §6 forbids setting;
 * an opacity-hidden anchor leaves the panel pressable (`e2e/panel-geometry.spec.ts`, C-10).
 * This pins the spelling, which the DOM emulator can read and cannot hit-test.
 */
describe("Select trigger while the panel is open", () => {
  /** The field and every ancestor up to the root, which is where the trigger's style lands. */
  const chain = () => {
    const nodes: HTMLElement[] = [];
    for (let node: HTMLElement | null = combobox(); node; node = node.parentElement) {
      nodes.push(node);
    }
    return nodes;
  };

  it("hides by opacity and pointer-events, never by visibility, and comes back on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    combobox().focus();

    await user.keyboard("{ArrowDown}");
    const hidden = chain().filter((node) => node.style.opacity === "0");
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.style.pointerEvents).toBe("none");
    expect(chain().some((node) => node.style.visibility === "hidden")).toBe(false);

    await user.keyboard("{Escape}");
    expect(chain().some((node) => node.style.opacity !== "")).toBe(false);
    expect(chain().some((node) => node.style.pointerEvents !== "")).toBe(false);
  });
});

/** C-30's select clause: "selects and comboboxes `combobox` and `listbox`". */
describe("C-30 · select roles", () => {
  it("is a `combobox` that controls a `listbox` of `option`s", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = combobox();
    expect(field.getAttribute("role")).toBe("combobox");
    expect(field.getAttribute("aria-haspopup")).toBe("listbox");

    field.focus();
    await user.keyboard("{ArrowDown}");
    const listbox = screen.getByRole("listbox", { name: "Type" });
    expect(field.getAttribute("aria-controls")).toBe(listbox.id);
    expect(screen.getAllByRole("option").every((option) => listbox.contains(option))).toBe(true);
  });
});
