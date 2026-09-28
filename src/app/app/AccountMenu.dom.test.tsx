import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/app/app/AccountMenu";
import { KEYBOARD_RECORDED_ATTRIBUTE } from "@/lib/focus-modality";
import { getShortcutSheet, resetShortcutSheet } from "@/lib/shortcut-sheet";

const EMAIL = "someone@example.com";

/**
 * jsdom has no `matchMedia`; §7's pointer query is answered here per test. The listener
 * shape is the one the hook subscribes with.
 */
function pointerDevice(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (media: string) => ({
      media,
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  resetShortcutSheet();
  document.documentElement.removeAttribute(KEYBOARD_RECORDED_ATTRIBUTE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rows = () => screen.getAllByRole("menuitem").map((row) => row.textContent);

/**
 * design-spec.md §4: the account slot "is a menu trigger (§8.18) whose rows are 'Keyboard
 * shortcuts' (`key-command`, §8.38 — always on pointer devices, and on touch once the modality
 * script has recorded keyboard input, §8.15) and 'Sign out' (`log-out`)".
 */
describe("AccountMenu", () => {
  it("offers Keyboard shortcuts and Sign out on a pointer device, the hint trailing", async () => {
    pointerDevice(true);
    const user = userEvent.setup();
    render(<AccountMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    expect(rows()).toEqual(["Keyboard shortcuts?", "Sign out"]);
    expect(screen.getByText("?", { selector: "kbd" })).toBeTruthy();
  });

  it("offers Sign out alone on touch until keyboard input has been recorded", async () => {
    pointerDevice(false);
    const user = userEvent.setup();
    render(<AccountMenu email={EMAIL} />);

    const trigger = screen.getByRole("button", { name: EMAIL });
    await user.click(trigger);
    expect(rows()).toEqual(["Sign out"]);
    await user.keyboard("{Escape}");

    // The modality script's latch: keyboard input has happened, whatever came after it.
    document.documentElement.setAttribute(KEYBOARD_RECORDED_ATTRIBUTE, "");
    await user.click(trigger);
    await waitFor(() => expect(rows()).toEqual(["Keyboard shortcuts?", "Sign out"]));
  });

  it("opens the shortcut sheet from its row, with the page's panels counted", async () => {
    pointerDevice(true);
    const user = userEvent.setup();
    render(<AccountMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(screen.getByRole("menuitem", { name: /Keyboard shortcuts/ }));

    expect(getShortcutSheet().open).toBe(true);
    expect(getShortcutSheet().page.panels).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("signs out by submitting the sign-out form — a POST, never a link", async () => {
    pointerDevice(true);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});
    const user = userEvent.setup();
    render(<AccountMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(submit).toHaveBeenCalledTimes(1);
    const form = submit.mock.instances[0] as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/auth/sign-out");
    expect(form.getAttribute("method")).toBe("post");
  });
});
