import { expect, test } from "@playwright/test";

/**
 * The item page, measured in a real browser.
 *
 * **These drive `/dev/item`, not `/i/<key>`** — the real page is behind the
 * proxy, the same wall `/app` is behind, and Playwright cannot complete an
 * emailed code. Per the build log, a preview must render on the same side of the
 * RSC boundary as the surface it previews, so `/dev/item` is a Server Component
 * rendering the same components over a fixture.
 *
 * The fixture is also the only place most of this can be seen: no seeded item
 * has a single activity row, only one has gaps, and none has a superseded
 * decision. Real data would leave three of these tests measuring empty states.
 */

// §2 tokens, resolved.
const AGENT = "rgb(167, 139, 255)";
const SURFACE_1 = "rgb(21, 23, 28)";
const PRIME = "rgb(33, 184, 220)";
const WARNING = "rgb(235, 169, 47)";

for (const width of [1440, 768, 375] as const) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/item");
      await page.evaluate(() => document.fonts.ready);
    });

    /**
     * §4: "item page = content 1fr / chat 380px", and the dock becomes an
     * overlay drawer below 1024.
     *
     * The 380 column is reserved before the dock exists so that building it
     * fills a column rather than reflowing the page. Measured as the grid's
     * resolved template, because that is the thing that has to hold — a column
     * that is merely empty looks identical to one that is missing.
     */
    test("reserves the chat column above 1024 and collapses below it", async ({ page }) => {
      const columns = await page
        .locator("main > div")
        .first()
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns);

      const tracks = columns.split(" ").filter(Boolean);

      if (width >= 1024) {
        expect(tracks).toHaveLength(2);
        expect(Math.round(parseFloat(tracks[1]!))).toBe(380);
      } else {
        expect(tracks).toHaveLength(1);
      }
    });

    /**
     * §8's doc reader caps a document at 68ch, because longer lines lose the
     * reader between one and the next.
     *
     * `ch` is font-relative, so the assertion measures 68 of them in the
     * reader's own font rather than hardcoding a pixel value that would be
     * wrong the next time §3 moves.
     */
    test("holds the reading measure at 68ch", async ({ page }) => {
      const measured = await page
        .getByTestId("doc-reader")
        .first()
        .evaluate((node) => {
          const probe = document.createElement("div");
          probe.style.width = "68ch";
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          node.appendChild(probe);
          const expected = probe.getBoundingClientRect().width;
          probe.remove();

          return { maxWidth: getComputedStyle(node).maxWidth, expected };
        });

      expect(measured.maxWidth).not.toBe("none");
      expect(parseFloat(measured.maxWidth)).toBeCloseTo(measured.expected, 0);
    });
  });
}

test.describe("at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/item");
    await page.evaluate(() => document.fonts.ready);
  });

  /**
   * §1 law 7: a settled gap is a visible debt that a named person accepted.
   * All three dispositions are on the page at once — the accepted and excluded
   * ones dimmed rather than removed, because removing one deletes the name.
   */
  test("shows every gap disposition, settled ones dimmed rather than hidden", async ({ page }) => {
    // Scoped to the gap list: the same check ids appear in the meter's
    // expansion, where they mean something else entirely.
    const gaps = page.getByTestId("gap-list");

    await expect(gaps.getByText("prd-10")).toBeVisible();
    await expect(gaps.getByText("prd-16")).toBeVisible();
    await expect(gaps.getByText("prd-20")).toBeVisible();

    const opacities = await gaps
      .getByRole("listitem")
      .filter({ hasText: /prd-16|prd-20/ })
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node.firstElementChild!).opacity),
      );

    expect(opacities.length).toBeGreaterThan(0);
    // §0 law 7 dims settled work; it never reddens it.
    expect(opacities.every((opacity) => opacity === "0.6")).toBe(true);
  });

  /**
   * T2.4's AC5: this list is no longer the picture of a run.
   *
   * §13 puts open Musts and named debts here; an open Should lives under the
   * score where its check explains it, and a closed gap renders nowhere,
   * because the check passing is the record.
   *
   * The fixture carries one of each to be absent. `prd-8` and `prd-19` appear
   * on the page — inside the expansion — so the assertion has to be scoped to
   * this list rather than to the document, which is also the distinction the
   * ticket is making.
   *
   * Both absentees are gaps the reconciler could really have written against
   * this run: `prd-8` fails and is a Should, and `prd-19` passes, which is
   * exactly what closes a gap. The fixture used to prove the closed filter with
   * `prd-10` — a check the same run reports as unclear, which reconcile would
   * have raised an open gap for rather than left closed. That pairing cannot
   * occur, so the assertion proved something about the mock.
   * `run-view.test.ts` now holds the fixture to the reconciler's table.
   */
  test("narrows to open Musts and named debts, filing the rest under the score", async ({
    page,
  }) => {
    const gaps = page.getByTestId("gap-list");

    await expect(gaps.getByRole("listitem")).toHaveCount(3);
    // The open Should, and the closed gap.
    await expect(gaps.getByText("prd-8")).toHaveCount(0);
    await expect(gaps.getByText("prd-19")).toHaveCount(0);
  });

  /**
   * §5: "a failure quotes the exact gap." An open Must's evidence is the body
   * of its card, in the open — a debt that needs a person does not wait behind
   * a disclosure.
   *
   * The requirement id rides inside the sentence, where §7.2 puts it: a gap
   * names a check (`prd-10`), a story names a requirement (`GM-4`), and the
   * evidence cites the requirement as the place the gap lives. It is the same
   * sentence the check's own line carries inside the expansion, because
   * `renderEvidence` built both from one run's three stored parts.
   */
  test("quotes an open Must's evidence on the page rather than behind anything", async ({
    page,
  }) => {
    await expect(
      page
        .getByTestId("gap-list")
        .getByText(
          "GM-4: 'Members someone has blocked never see them at a venue, ghost mode on or off.' — " +
            "GM-4 is prose. The other four stories carry Given/When/Then.",
        ),
    ).toBeVisible();
  });

  /**
   * §2 lineage: the opportunity is the thing that explains why an item exists,
   * so an item that shows its product but not its opportunity hides it.
   *
   * **Text, not a link.** `/o/<key>` is reserved and unbuildable — opportunities
   * have no key column — and a link that navigates nowhere is worse than none.
   * The assertion is that the title is on the page *and* that nothing around it
   * is an anchor, because "add a link later" is exactly the change that would
   * otherwise slip in untested.
   */
  test("shows the opportunity as text, with no link to a page that does not exist", async ({
    page,
  }) => {
    // Exact: the fixture's brief opens with the same sentence, which is what a
    // real one would do — an item's opportunity is usually restated in its
    // artifacts, so a loose matcher finds two things here and would find two on
    // real data as well.
    const lineage = page.getByText("People miss what changed while they were away", {
      exact: true,
    });

    await expect(lineage).toBeVisible();
    expect(await lineage.evaluate((node) => node.closest("a") !== null)).toBe(false);
    await expect(page.locator('main a[href^="/o/"]')).toHaveCount(0);
  });

  // §0 law 4: anything the machine did is visibly the machine's.
  test("renders an agent actor in --agent", async ({ page }) => {
    const colour = await page
      .getByText("scorer", { exact: true })
      .evaluate((node) => getComputedStyle(node).color);

    expect(colour).toBe(AGENT);
  });

  /**
   * §5 stamps an accepted gap with the accepter, and the schema cannot name
   * anyone but the reader — migration 0003 removed the foreign key so a person
   * can be deleted without rewriting history. What must never appear is the raw
   * uuid standing in for a name.
   */
  test("names the reader and says 'someone' for anyone else, never a uuid", async ({ page }) => {
    const body = (await page.locator("main").textContent()) ?? "";

    expect(body).toContain("You");
    expect(body).toContain("Someone");
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  // §11: a correction is a new decision naming the one it replaced, so the
  // replaced one is marked rather than removed — an append-only log is a record,
  // not a statement of current opinion.
  test("marks a superseded decision instead of dropping it", async ({ page }) => {
    await expect(page.getByText("Digest ships daily")).toBeVisible();
    await expect(page.getByText("Digest ships weekly, not daily")).toBeVisible();
    await expect(page.getByText("Superseded")).toBeVisible();
  });

  // §5 cards are --surface-1 with the inset edge at 10% — quieter than glass,
  // and §0 law 10 keeps glass off content entirely.
  test("puts gap evidence on a card, and the card is not glass", async ({ page }) => {
    const card = page.getByTestId("gap-list").getByRole("listitem").first().locator("> *").first();

    const style = await card.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        radius: computed.borderTopLeftRadius,
        shadow: computed.boxShadow,
        filter: computed.backdropFilter,
      };
    });

    expect(style.background).toBe(SURFACE_1);
    expect(style.radius).toBe("16px");
    // The inset specular edge, §0 law 5's signature at a card's volume.
    expect(style.shadow).toContain("inset");
    // §0 law 10: glass is the navigation layer. A card floats nowhere.
    expect(["none", ""]).toContain(style.filter);
  });

  /**
   * Read-only, still — and T2.4 is where that sentence needed restating rather
   * than deleting.
   *
   * The rule this test has always held is that every action §5 and §13 would
   * put on this page is a mutation that does not exist yet, so offering one
   * would offer something that cannot happen. A disclosure is not one of those:
   * opening it writes no row, moves no score and changes nothing a re-score
   * could disagree with. So the assertion becomes what it always meant — no
   * field, no toggle, nothing that submits — plus exactly one disclosure, which
   * pins the count so a second interactive thing cannot arrive unnoticed.
   */
  test("offers nothing that changes anything, and exactly one disclosure", async ({ page }) => {
    // Scoped to `main`: `next dev` injects its own overlay button into the
    // document, which is not the page's and would fail this for the wrong reason.
    const content = page.locator("main");

    await expect(content.locator("button")).toHaveCount(0);
    await expect(content.getByRole("textbox")).toHaveCount(0);
    await expect(content.getByRole("checkbox")).toHaveCount(0);
    await expect(content.locator("input, select, textarea, form")).toHaveCount(0);

    await expect(content.locator("summary")).toHaveCount(1);
  });

  /* ------------------------------------------------------------------------ */
  /* T2.4 — the meter, and what it expands into                               */
  /* ------------------------------------------------------------------------ */

  /**
   * §8: "item-page meter 8h + mono-readout percentage."
   *
   * Measured as computed geometry rather than as markup, for `list.spec.ts`'s
   * reason: a meter that renders 0% and a meter that renders hollow have
   * identical markup except for a child that may or may not exist, and §10's
   * rule is about what a person sees. The fill is a percentage of the track, so
   * the ratio is the assertion — 67% of whatever the track resolved to.
   */
  test("draws the fill at the run's percentage, with the readout beside it", async ({ page }) => {
    const track = page.getByRole("progressbar");
    await expect(track).toBeVisible();
    await expect(track).toHaveAttribute("aria-valuenow", "67");

    const ratio = await track.evaluate((node) => {
      const fill = node.firstElementChild!;
      return fill.getBoundingClientRect().width / node.getBoundingClientRect().width;
    });

    expect(ratio).toBeCloseTo(0.67, 2);

    // §8 puts the number beside the track; §13 makes it the same number the
    // progressbar announces, because colour has to pair with *the* value.
    await expect(page.getByTestId("readiness").getByText("67%")).toBeVisible();

    // §8: the track is 8h on the item page, and 4 on a row.
    const height = await track.evaluate((node) => getComputedStyle(node).height);
    expect(height).toBe("8px");
  });

  /**
   * §8: "click expands per-check list". §1 law 3: this is where a human goes to
   * interrogate a number, so the whole rubric is here — passes included, in
   * pack order, and the failures carrying the exact text behind them.
   */
  test("expands into every check, in pack order, with the quotes behind the failures", async ({
    page,
  }) => {
    const checks = page.getByTestId("check-list");
    await expect(checks).toBeHidden();

    await page.getByTestId("readiness").locator("summary").click();
    await expect(checks).toBeVisible();

    // Ghost mode's rubric: nineteen asked and one not, all twenty in the order
    // §7.2 numbers them — never the order `check_id` sorts in, which would open
    // the list with check 10.
    const ids = await checks
      .getByRole("listitem")
      // The id is the row's first span, in mono-readout (§3). Reading the whole
      // row would compare prose as well, which is the pack's business and not
      // this assertion's.
      .evaluateAll((nodes) => nodes.map((node) => node.querySelector("span")!.textContent));

    expect(ids).toEqual([...Array(20)].map((_, index) => `prd-${index + 1}`));

    // §5's quoted gap, verbatim, for a planted failure.
    await expect(
      checks.getByText("GM-4 is prose. The other four stories carry Given/When/Then.", {
        exact: false,
      }),
    ).toBeVisible();
  });

  /**
   * AC3: §4's renormalization, said out loud.
   *
   * `prd-15` left the denominator and `prd-20` entered it, and 99 is what they
   * add up to. The not-asked line must say the condition did **not** hold — the
   * pack writes it affirmatively, so printing it bare would state the opposite
   * of the reason and read perfectly while doing it.
   */
  test("shows a not-asked check with the condition that did not hold", async ({ page }) => {
    await page.getByTestId("readiness").locator("summary").click();

    const checks = page.getByTestId("check-list");
    const fifteen = checks.getByRole("listitem").filter({ hasText: "prd-15" });
    const twenty = checks.getByRole("listitem").filter({ hasText: "prd-20" });

    await expect(fifteen).toContainText("Not asked");
    await expect(fifteen).toContainText(
      "The feature renders a list, so it has empty and first-use states.",
    );
    // The negation, which is the whole point: the condition is quoted inside a
    // frame that says it is false here.
    await expect(fifteen).toContainText("That is not true here.");

    // The other direction of §4 on the same run: the layer entered, so prd-20
    // was asked and scored rather than skipped.
    await expect(twenty).not.toContainText("Not asked");

    // And the denominator the two of them produce.
    await expect(page.getByTestId("readiness")).toContainText("66 of 99 points");
  });

  /**
   * AC4: §5 stamps provenance on every run because a number nobody can trace is
   * a number nobody can argue with. §8 puts it in mono-readout.
   */
  test("carries the run's provenance, quietly", async ({ page }) => {
    await page.getByTestId("readiness").locator("summary").click();

    const provenance = page.getByText("feature-prd@1.0.0 · claude-sonnet-5");
    await expect(provenance).toBeVisible();

    const family = await provenance.evaluate((node) => getComputedStyle(node).fontFamily);
    expect(family).toContain("JetBrains Mono");
  });

  /**
   * §8: "evidence quotes ui-body on `--surface-1` cards". The same card recipe
   * the gap list uses, and §0 law 10 keeps glass off both.
   */
  test("puts a failing check's evidence on a card, and the card is not glass", async ({ page }) => {
    await page.getByTestId("readiness").locator("summary").click();

    const card = page
      .getByTestId("check-list")
      .getByRole("listitem")
      .filter({ hasText: "prd-10" })
      .locator("div")
      .last();

    const style = await card.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        radius: computed.borderTopLeftRadius,
        filter: computed.backdropFilter,
      };
    });

    expect(style.background).toBe(SURFACE_1);
    expect(style.radius).toBe("16px");
    expect(["none", ""]).toContain(style.filter);
  });

  /**
   * §0 law 1: "Meters and gaps never render in Danger red." §0 law 2 reserves
   * Danger for destructive actions, validation errors and diff deletions — and
   * a rubric check is none of the three, whatever it found.
   *
   * Measured as resolved colour across every element in the expansion, because
   * a class-name assertion would miss a token reached through a variable.
   */
  test("renders no danger red anywhere in the expansion", async ({ page }) => {
    await page.getByTestId("readiness").locator("summary").click();

    const danger = await page.getByTestId("readiness").evaluate((root) => {
      const DANGER = ["rgb(255, 114, 118)", "rgb(217, 58, 63)"];
      return [...root.querySelectorAll("*")].some((node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor, style.borderTopColor].some((value) =>
          DANGER.includes(value),
        );
      });
    });

    expect(danger).toBe(false);
  });

  /**
   * §11: "every interactive element reachable by Tab in visual order", and the
   * disclosure toggles on Enter.
   *
   * This is most of why the expansion is a native `<details>` — the keyboard
   * path and the focus ring arrive with the element rather than being rebuilt
   * on top of a `div` that would then have to be tested for both.
   */
  test("opens from the keyboard", async ({ page }) => {
    const checks = page.getByTestId("check-list");
    await expect(checks).toBeHidden();

    await page.getByTestId("readiness").locator("summary").focus();
    await page.keyboard.press("Enter");

    await expect(checks).toBeVisible();
  });

  /**
   * §7, every row of it: the disclosure is an interactive element, so it takes
   * the interaction states any interactive element takes.
   *
   * §6 and §7 both pair the focus ring **with the aero glow** — "the aero glow
   * lives on focus and on live dots, nowhere else" — and the ring alone is what
   * the bare `:focus-visible` rule in globals.css gives. `.control` is what adds
   * the rest, so this measures the paint rather than the class: an outline *and*
   * a box-shadow, arrived at by Tab.
   *
   * **Tabbed to rather than focused programmatically**, which is the point:
   * `:focus-visible` is a claim about how focus arrived, and `.focus()` does not
   * make that claim. It is also §11's "every interactive element reachable by
   * Tab in visual order". The loop is for `next dev`, which injects its own
   * overlay control ahead of the page's content — the mirror page itself has
   * nothing focusable before the disclosure.
   */
  test("rings and glows the disclosure on keyboard focus", async ({ page }) => {
    const summary = page.getByTestId("readiness").locator("summary");

    for (let tabs = 0; tabs < 6; tabs += 1) {
      await page.keyboard.press("Tab");
      if (await summary.evaluate((node) => node === document.activeElement)) break;
    }
    await expect(summary).toBeFocused();

    const focused = await summary.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        boxShadow: computed.boxShadow,
      };
    });

    // §6: `outline: 2px solid var(--prime); outline-offset: 2px;`
    expect(focused.outlineWidth).toBe("2px");
    expect(focused.outlineColor).toBe(PRIME);
    // …plus `box-shadow: var(--prime-glow)`. Not "none", and prime-tinted.
    expect(focused.boxShadow).not.toBe("none");
    expect(focused.boxShadow).toContain("33, 184, 220");
  });
});

/**
 * §10's other two meter states, which the mirrored page cannot show at once.
 *
 * `?run=` picks the fixture; see `src/app/dev/item/page.tsx`. The retry state in
 * particular cannot be staged any other way — it needs a provider outage — and
 * it is the one freshness state that must never read as an error.
 */
test.describe("the meter's other states", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  /**
   * §10: "No AI key: meters render hollow tracks + 'connect AI to activate
   * scoring' — never zeros, never red. That is the item page, where the line
   * stands beside the track and says what the emptiness means."
   *
   * And nothing to open: a disclosure onto nothing offers to explain a number
   * that was never computed.
   */
  test("renders a hollow track with its line, and no disclosure, with no run", async ({ page }) => {
    await page.goto("/dev/item?run=none");
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByText("Connect AI to activate scoring")).toBeVisible();
    await expect(page.locator("main summary")).toHaveCount(0);
    // Never a zero: a hollow meter is not a progressbar pinned at 0.
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });

  /**
   * §10: "Provider outage / retry: freshness shows `--warning` dot +
   * mono-readout 'scored 6 h ago — retrying'; **no banners**." §5 queues
   * outages silently and "the timestamp does the honest work".
   */
  test("shows a queued retry as a warning dot and a timestamp, never a banner", async ({
    page,
  }) => {
    await page.goto("/dev/item?run=retrying");
    await page.evaluate(() => document.fonts.ready);

    const readiness = page.getByTestId("readiness");
    await expect(readiness).toContainText("scored 4h ago — retrying");

    // The dot is 8, like every system dot in the product, and it is --warning.
    const dot = readiness.locator("span[aria-hidden='true']").last();
    const style = await dot.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { background: computed.backgroundColor, size: computed.width };
    });

    expect(style.background).toBe(WARNING);
    expect(style.size).toBe("8px");

    // §10: no banners. Scoped to `main` — `next dev` mounts its own overlay
    // with an alert role, which is not the page's.
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.locator("main").getByRole("status")).toHaveCount(0);
  });

  // The settled case, for contrast: §8's freshness dot is --prime.
  test("shows a settled run with the prime dot", async ({ page }) => {
    await page.goto("/dev/item");
    await page.evaluate(() => document.fonts.ready);

    const dot = page.getByTestId("readiness").locator("span[aria-hidden='true']").last();

    expect(await dot.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(PRIME);
  });
});
