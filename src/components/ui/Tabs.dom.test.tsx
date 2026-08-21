import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Tabs } from "@/components/ui/Tabs";

const ITEMS = [
  { value: "overview", label: "Overview" },
  { value: "evidence", label: "Evidence" },
  { value: "locked", label: "Locked", disabled: true },
  { value: "decisions", label: "Decisions" },
] as const;

function Harness() {
  const [value, setValue] = useState("overview");
  return <Tabs items={ITEMS} value={value} onValueChange={setValue} label="Preview" />;
}

/** design-spec.md §11: arrow keys walk; every element reachable by Tab. */
describe("Tabs keyboard", () => {
  it("is one Tab stop, with the active tab holding it", async () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);

    await userEvent.tab();
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("walks across with the arrow keys, selection following focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("false");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("steps over a disabled tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    // Index 2 is disabled, so the second press lands on 3.
    expect(document.activeElement).toBe(tabs[3]);
  });

  it("wraps at both ends and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabs[3]);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tabs[0]);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tabs[3]);
  });

  it("marks only the active tab with an underline", () => {
    render(<Harness />);
    const underlines = document.querySelectorAll(".bg-prime");
    expect(underlines).toHaveLength(1);
  });
});
