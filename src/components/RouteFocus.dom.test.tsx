import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteFocus } from "@/components/RouteFocus";
import { rememberReturn, resetReturns } from "@/lib/return-focus";

/** The router's pathname, as `usePathname` would report it; set per step of a test. */
let pathname = "/app";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

/** Puts the address bar where the router says it is, so both halves read the same list. */
function at(path: string) {
  pathname = path;
  window.history.replaceState(null, "", path);
}

function Page({ rows }: { rows: readonly string[] }) {
  return (
    <>
      <RouteFocus />
      <main tabIndex={-1}>
        <a href="#before">first control</a>
        {rows.map((row) => (
          <a key={row} href={`#${row}`} data-row-link={row}>
            {row}
          </a>
        ))}
      </main>
    </>
  );
}

beforeEach(() => {
  resetReturns();
  at("/app");
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const main = () => document.querySelector("main")!;
const row = (key: string) => document.querySelector<HTMLElement>(`[data-row-link="${key}"]`)!;

/**
 * design-spec.md §11: "After a route change the code focuses the main region (`tabindex="-1"`)
 * … The way back restores the place."
 */
describe("RouteFocus", () => {
  it("leaves a fresh load alone: the first Tab stop is the page's, not the main region", () => {
    render(<Page rows={["soc-12"]} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the main region after a route change", () => {
    const view = render(<Page rows={["soc-12"]} />);

    at("/i/soc-12");
    view.rerender(<Page rows={[]} />);
    expect(document.activeElement).toBe(main());
  });

  it("leaves focus where a page already placed it inside the main region", () => {
    const view = render(<Page rows={[]} />);

    at("/i/soc-12");
    // A page that focused its own control on arrival keeps it.
    view.rerender(<Page rows={["placed"]} />);
    // The rerender's effect ran already; a second change with a control focused first:
    at("/app");
    row("placed").focus();
    view.rerender(<Page rows={["placed"]} />);
    expect(document.activeElement).toBe(row("placed"));
  });

  it("records the row a list was left from, and on the way back focuses it and restores the scroll", () => {
    const view = render(<Page rows={["soc-12", "soc-7"]} />);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 160 });
    fireEvent.click(row("soc-7"));

    at("/i/soc-7");
    view.rerender(<Page rows={[]} />);
    expect(document.activeElement).toBe(main());

    at("/app");
    view.rerender(<Page rows={["soc-12", "soc-7"]} />);
    expect(document.activeElement).toBe(row("soc-7"));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 160);
  });

  it("records nothing for a modifier click, which the browser opens elsewhere", () => {
    const view = render(<Page rows={["soc-12"]} />);
    fireEvent.click(row("soc-12"), { metaKey: true });

    at("/i/soc-12");
    view.rerender(<Page rows={[]} />);
    at("/app");
    view.rerender(<Page rows={["soc-12"]} />);
    expect(document.activeElement).toBe(main());
  });

  it("keys the place on the URL's search too, so a filtered list restores with its filter", () => {
    at("/app?stage=define");
    const view = render(<Page rows={["soc-4"]} />);
    fireEvent.click(row("soc-4"));

    at("/i/soc-4");
    view.rerender(<Page rows={[]} />);

    // Back to the unfiltered list: not the place that was left, so the main region.
    at("/app");
    view.rerender(<Page rows={["soc-4"]} />);
    expect(document.activeElement).toBe(main());
  });

  it("waits for a row that arrives after the route's skeleton, focusing the main region meanwhile", async () => {
    rememberReturn("/app", { row: "soc-12", scrollY: 48 });
    at("/i/soc-12");
    const view = render(<Page rows={[]} />);

    at("/app");
    view.rerender(<Page rows={[]} />);
    expect(document.activeElement).toBe(main());

    // The list's data lands.
    act(() => {
      view.rerender(<Page rows={["soc-12"]} />);
    });
    await waitFor(() => expect(document.activeElement).toBe(row("soc-12")));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 48);
  });
});
