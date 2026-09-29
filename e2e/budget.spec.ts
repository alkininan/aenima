import { expect, test, type Page } from "@playwright/test";

/**
 * design-spec.md §6's responsiveness budget and §17's C-45 (T0.48): "On the kitchen-sink
 * route in Chromium, unthrottled, over a fixed script of 20 interactions driven by
 * Playwright's own input — which the browser treats as trusted, so Event Timing records
 * each one — a route change paints its chrome and skeleton within 100ms of the click and
 * its content within 1s, each paint marked with `performance.mark`, and the 75th percentile
 * of the script's interaction durations is at or under 200ms; a failing run is retried
 * once."
 *
 * The marks are `src/lib/layout.ts`'s `PAINT_MARKS`, written by `PaintMark`: the page
 * topbar marks the chrome, the content column's skeleton and its data-bound content mark
 * themselves. The click is marked by a capturing listener on the real event, so the
 * budget is read from the click's own timestamp rather than from the test's.
 *
 * The route changes are the sink's own: the frame's nav to `/dev/list`, a row to
 * `/dev/item`, and back. The three routes are visited once first, so the dev server has
 * compiled them — the budget is the product's, not the compiler's.
 */

const SINK = "/dev/primitives";
const LIST = "/dev/list";
const ITEM = "/dev/item";

const MARKS = { chrome: "aenima:chrome", skeleton: "aenima:skeleton", content: "aenima:content" };
const CLICK = "aenima:click";

/** Event Timing reports nothing under this; an interaction it omits was faster. */
const EVENT_TIMING_FLOOR_MS = 16;

// C-45: a failing run is retried once.
test.describe.configure({ retries: 1 });

type Paint = { chrome: number; content: number };

async function installObservers(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __interactions: Map<number, number> };
    w.__interactions = new Map();
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const id = (entry as PerformanceEntry & { interactionId?: number }).interactionId ?? 0;
        if (id === 0) continue;
        // One interaction is several events; its duration is the longest of them.
        w.__interactions.set(id, Math.max(w.__interactions.get(id) ?? 0, entry.duration));
      }
      // `durationThreshold` is Event Timing's own option; the TS lib does not know it.
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    document.addEventListener("click", () => performance.mark("aenima:click"), true);
  });
}

/** The latest click, and the first chrome-or-skeleton and content paints after it. */
async function paintsAfterClick(page: Page): Promise<Paint> {
  await page.waitForFunction(
    ({ click, content }) => {
      const clicks = performance.getEntriesByName(click);
      const last = clicks[clicks.length - 1];
      if (!last) return false;
      return performance.getEntriesByName(content).some((mark) => mark.startTime > last.startTime);
    },
    { click: CLICK, content: MARKS.content },
    { timeout: 5000 },
  );
  return page.evaluate(
    ({ click, marks }) => {
      const clicks = performance.getEntriesByName(click);
      const at = clicks[clicks.length - 1]!.startTime;
      const first = (name: string) =>
        performance
          .getEntriesByName(name)
          .map((mark) => mark.startTime)
          .filter((time) => time > at)
          .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
      return {
        chrome: Math.min(first(marks.chrome), first(marks.skeleton)) - at,
        content: first(marks.content) - at,
      };
    },
    { click: CLICK, marks: MARKS },
  );
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

test("TC6 · C-45 the responsiveness budget over the fixed script", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const route of [SINK, LIST, ITEM, SINK]) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
  }
  await installObservers(page);

  const paints: Paint[] = [];
  const routeChange = async (act: () => Promise<void>, url: RegExp) => {
    await act();
    await expect(page).toHaveURL(url);
    paints.push(await paintsAfterClick(page));
  };

  const readiness = () => page.getByTestId("readiness").locator("summary").first();
  // By title: the row wears no key (§8.27), and the name is the link. Scoped to the fixture
  // list's own links — the sink's list surface renders the same titles, and a row of its
  // can still be in the DOM in the frame the route change is measured in.
  const row = (title: string) =>
    page
      .getByTestId("item-row")
      .filter({ hasText: title })
      .locator("a[data-row-link][href='/dev/item']");
  const dashboard = () => page.getByRole("link", { name: "Dashboard" });
  const switcher = () => page.getByTestId("frame-switcher");
  const menu = () => page.getByRole("menu", { name: "Your work" });

  // The script: 20 interactions, 8 of them route changes — the frame's nav and lockup to
  // the fixture list, its rows to the fixture item. The strip's segments are not among
  // them: they write `?stage=` onto `/app`, which no session here can reach.
  await routeChange(() => dashboard().click(), /\/dev\/list$/); // 1
  await switcher().click(); // 2
  await expect(menu()).toBeVisible();
  await page.keyboard.press("Escape"); // 3
  await expect(menu()).toBeHidden();
  await routeChange(() => row("Weekly digest email").click(), /\/dev\/item$/); // 4
  await readiness().click(); // 5
  await expect(page.getByTestId("check-list")).toBeVisible();
  await readiness().click(); // 6
  await expect(page.getByTestId("check-list")).toBeHidden();
  await routeChange(() => page.getByTestId("frame-lockup").click(), /\/dev\/list$/); // 7
  await page
    .getByRole("button", { name: /Actions for/ })
    .first()
    .click(); // 8
  await expect(page.getByRole("menu", { name: /Actions for/ })).toBeVisible();
  await page.keyboard.press("Escape"); // 9
  await expect(page.getByRole("menu", { name: /Actions for/ })).toBeHidden();
  await routeChange(() => row("Rewrite the empty states").click(), /\/dev\/item$/); // 10
  await page.keyboard.press("Tab"); // 11
  await page.keyboard.press("Tab"); // 12
  await routeChange(() => dashboard().click(), /\/dev\/list$/); // 13
  await switcher().click(); // 14
  await expect(menu()).toBeVisible();
  await page.keyboard.press("ArrowDown"); // 15
  await page.keyboard.press("Escape"); // 16
  await expect(menu()).toBeHidden();
  await routeChange(() => row("Shared reading lists").click(), /\/dev\/item$/); // 17
  await readiness().click(); // 18
  await expect(page.getByTestId("check-list")).toBeVisible();
  await routeChange(() => page.getByTestId("frame-lockup").click(), /\/dev\/list$/); // 19
  await routeChange(() => row("Can we diff Figma").click(), /\/dev\/item$/); // 20

  // Let the last interaction's timing entry land.
  await page.waitForTimeout(300);
  const recorded = await page.evaluate(() => [
    ...(window as unknown as { __interactions: Map<number, number> }).__interactions.values(),
  ]);
  const INTERACTIONS = 20;
  // An interaction the timeline omitted was under the floor; it is counted at the floor.
  const durations = [
    ...recorded,
    ...Array.from(
      { length: Math.max(0, INTERACTIONS - recorded.length) },
      () => EVENT_TIMING_FLOOR_MS,
    ),
  ].slice(0, Math.max(INTERACTIONS, recorded.length));
  const p75 = percentile(durations, 75);

  const summary = {
    routeChanges: paints.map((paint) => ({
      chrome: Math.round(paint.chrome),
      content: Math.round(paint.content),
    })),
    interactionsRecorded: recorded.length,
    p75: Math.round(p75),
  };
  test.info().annotations.push({ type: "budget", description: JSON.stringify(summary) });
  console.log(`C-45 budget: ${JSON.stringify(summary)}`);

  expect(paints).toHaveLength(8);
  for (const paint of paints) {
    expect(paint.chrome).toBeLessThanOrEqual(100);
    expect(paint.content).toBeLessThanOrEqual(1000);
  }
  expect(p75).toBeLessThanOrEqual(200);
});
