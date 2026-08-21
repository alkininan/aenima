import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";

const OPTIONS: readonly SelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

function Harness({ withSelect = false }: { withSelect?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Looks right</Button>
          </>
        }
      >
        {withSelect ? (
          <Select label="Type" options={OPTIONS} value={value} onValueChange={setValue} />
        ) : (
          <input aria-label="Field" />
        )}
      </Modal>
    </>
  );
}

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Evidence">
        <input aria-label="Note" />
      </Sheet>
    </>
  );
}

/** design-spec.md §11: focus trapped inside modals, Esc closes the topmost
 *  layer, and on close focus returns to the opener. */
describe("Modal focus and keyboard", () => {
  it("names itself by its title and reports as modal", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Confirm" })).toBeTruthy();
  });

  it("moves focus inside when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(document.activeElement).toBe(screen.getByLabelText("Field"));
  });

  it("traps Tab at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const field = screen.getByLabelText("Field");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Looks right" });

    await user.tab();
    expect(document.activeElement).toBe(cancel);
    await user.tab();
    expect(document.activeElement).toBe(confirm);

    // Off the end, back to the start rather than out to the page behind.
    await user.tab();
    expect(document.activeElement).toBe(field);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes when the scrim is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const scrim = document.querySelector(".bg-bg-scrim");
    expect(scrim).not.toBeNull();
    if (scrim) await user.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The case §4's ladder gets wrong on its own: a popover inside a modal is
  // nested, so it takes the first Escape and the modal takes the second.
  it("gives Escape to a popover inside it before closing itself", async () => {
    const user = userEvent.setup();
    render(<Harness withSelect />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const combobox = screen.getByRole("combobox");
    combobox.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Sheet", () => {
  it("owes the same keyboard contract as the modal", async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    const opener = screen.getByRole("button", { name: "Open sheet" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-[480px]");
    expect(dialog.className).toContain("rounded-l-lg");
    expect(document.activeElement).toBe(screen.getByLabelText("Note"));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
