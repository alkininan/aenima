import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ItemRowMenu } from "@/app/app/ItemRowMenu";
import { resetReturns, routeKey, takeReturn } from "@/lib/return-focus";

// Hoisted with the mock: the factory runs when `ItemRowMenu` imports the router, before
// this module's own statements.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const LABEL = "Actions for soc-7";

beforeEach(() => {
  resetReturns();
  push.mockClear();
  // A filtered list, so the key the record is kept under is the whole URL.
  window.history.replaceState(null, "", "/app?stage=define");
  Object.defineProperty(window, "scrollY", { configurable: true, value: 160 });
});

async function openMenu() {
  const user = userEvent.setup();
  render(<ItemRowMenu itemKey="soc-7" href="/i/soc-7" label={LABEL} />);
  await user.click(screen.getByRole("button", { name: LABEL }));
  return user;
}

/**
 * design-spec.md §11: "Returning to a list … focuses the row that was opened." The row's
 * link records its own place through `RouteFocus`; the menu's "Open" is not that link, so it
 * records the same place itself before it navigates.
 */
describe("ItemRowMenu", () => {
  it("records the way back when Open opens the item, keyed on the list's whole URL", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Open" }));

    expect(push).toHaveBeenCalledWith("/i/soc-7");
    expect(takeReturn(routeKey("/app", "?stage=define"))).toEqual({ row: "soc-7", scrollY: 160 });
  });

  it("records nothing for Copy key, which stays on the list", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Copy key" }));

    expect(push).not.toHaveBeenCalled();
    expect(takeReturn(routeKey("/app", "?stage=define"))).toBeNull();
  });
});
