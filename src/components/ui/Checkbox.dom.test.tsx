import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Checkbox } from "@/components/ui/Checkbox";
import { Radio } from "@/components/ui/Radio";
import { Toggle } from "@/components/ui/Toggle";

/** design-spec.md §8: the whole row is the hit area, on all three controls. */
describe("Checkbox, Radio and Toggle rows", () => {
  it("toggles when the label text is clicked, not just the box", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Park it" />);

    const input = screen.getByRole("checkbox") as HTMLInputElement;
    expect(input.checked).toBe(false);

    await user.click(screen.getByText("Park it"));
    expect(input.checked).toBe(true);
  });

  it("keeps the real control in the accessibility tree", () => {
    render(<Checkbox label="Park it" />);
    // Named by its label even though the visible box is a decorative sibling.
    expect(screen.getByRole("checkbox", { name: "Park it" })).toBeTruthy();
  });

  it("stays keyboard-operable through the hidden input", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Park it" />);
    const input = screen.getByRole("checkbox") as HTMLInputElement;

    await user.tab();
    expect(document.activeElement).toBe(input);

    await user.keyboard(" ");
    expect(input.checked).toBe(true);
  });

  it("does not toggle from the row when disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Park it" disabled />);
    const input = screen.getByRole("checkbox") as HTMLInputElement;

    await user.click(screen.getByText("Park it"));
    expect(input.checked).toBe(false);
  });

  // Native radios sharing a name already walk with the arrow keys §11 asks for.
  it("walks a radio group with the arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Radio name="group" value="a" label="First" defaultChecked />
        <Radio name="group" value="b" label="Second" />
      </>,
    );

    const first = screen.getByRole("radio", { name: "First" }) as HTMLInputElement;
    const second = screen.getByRole("radio", { name: "Second" }) as HTMLInputElement;
    first.focus();

    await user.keyboard("{ArrowDown}");
    expect(second.checked).toBe(true);
    expect(first.checked).toBe(false);
  });

  it("reports the toggle as a switch", async () => {
    const user = userEvent.setup();
    render(<Toggle label="Notify me" />);

    const toggle = screen.getByRole("switch", { name: "Notify me" }) as HTMLInputElement;
    await user.click(screen.getByText("Notify me"));
    expect(toggle.checked).toBe(true);
  });
});
