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
const SURFACE_1 = "rgb(21, 23, 28)";
const SURFACE_2 = "rgb(40, 44, 52)";
const PRIME = "rgb(33, 184, 220)";
const WARNING = "rgb(235, 169, 47)";
const PRIMARY_TEXT = "rgb(224, 229, 235)";
const SECONDARY_TEXT = "rgb(157, 163, 176)";
const GLASS_BORDER = "rgba(77, 81, 89, 0.64)";

for (const width of [1440, 768, 375] as const) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/item");
      await page.evaluate(() => document.fonts.ready);
    });

    /**
     * §4: "item page = content 1fr / chat 380 while the dock is docked", and the dock docks
     * from 1280 — desk and hand take it as an overlay drawer.
     *
     * The 380 column is reserved before the dock exists so that building it
     * fills a column rather than reflowing the page. Measured as the grid's
     * resolved template, because that is the thing that has to hold — a column
     * that is merely empty looks identical to one that is missing.
     */
    test("reserves the chat column from 1280 and collapses below it", async ({ page }) => {
      const columns = await page
        .locator("main > div")
        .first()
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns);

      const tracks = columns.split(" ").filter(Boolean);

      if (width >= 1280) {
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

/**
 * The line itself, either side: §4 docks the dock at 1280 — "a docked dock beside a 240
 * sidebar leaves 660 at 1280 and 404 at 1024" — so the column is reserved at 1280 and not
 * at 1279 (T0.48).
 */
test.describe("the chat column's line", () => {
  for (const [width, tracks] of [
    [1279, 1],
    [1280, 2],
  ] as const) {
    test(`is ${tracks === 2 ? "reserved" : "absent"} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/item");
      const columns = await page
        .locator("main > div")
        .first()
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns);
      expect(columns.split(" ").filter(Boolean)).toHaveLength(tracks);
    });
  }
});

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
   *
   * §2 Dimming (T0.49): dimmed means the card's text in `--n-secondary` and its chip's
   * fill at .60 — never opacity on the card, which would take the words under AA.
   */
  test("shows every gap disposition, settled ones dimmed by colour rather than hidden", async ({
    page,
  }) => {
    // Scoped to the gap list: the same check ids appear in the meter's
    // expansion, where they mean something else entirely.
    const gaps = page.getByTestId("gap-list");

    await expect(gaps.getByText("prd-10", { exact: true }).first()).toBeVisible();
    await expect(gaps.getByText("prd-16", { exact: true })).toBeVisible();
    await expect(gaps.getByText("prd-20", { exact: true })).toBeVisible();

    const settled = await gaps
      .getByRole("listitem")
      .filter({ hasText: /prd-16|prd-20/ })
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const card = node.firstElementChild!;
          const chip = node.querySelector("[data-testid='gap-chip']")!;
          return {
            card: getComputedStyle(card).opacity,
            wording: getComputedStyle(card.querySelector("p")!).color,
            id: getComputedStyle(card.querySelector("[class*='type-mono-readout']")!).color,
            chipText: getComputedStyle(chip).color,
            chipOpacity: getComputedStyle(chip).opacity,
            fill: getComputedStyle(chip.querySelector("[aria-hidden='true']")!).opacity,
          };
        }),
      );

    expect(settled).toHaveLength(2);
    for (const card of settled) {
      expect(card.card).toBe("1");
      expect(card.wording).toBe(SECONDARY_TEXT);
      expect(card.id).toBe(SECONDARY_TEXT);
      expect(card.chipText).toBe(SECONDARY_TEXT);
      expect(card.chipOpacity).toBe("1");
      expect(card.fill).toBe("0.6");
    }
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
   * **A link, since T1.4.** This test read the other way until then — the title
   * as text, and nothing around it an anchor — because `/o/<key>` was reserved
   * and unbuildable while opportunities had no key column, and a link that
   * navigates nowhere is worse than none. `opportunity.key` exists now
   * (`drizzle/0016`), so the assertion inverts with the thing it was guarding:
   * the title is on the page *and* it is the anchor, pointed at the key rather
   * than at a uuid, which is the whole reason `routes.ts` keeps its segments
   * short.
   */
  test("shows the opportunity as a link to its own page", async ({ page }) => {
    // Exact: the fixture's brief opens with the same sentence, which is what a
    // real one would do — an item's opportunity is usually restated in its
    // artifacts, so a loose matcher finds two things here and would find two on
    // real data as well.
    const lineage = page.getByText("People miss what changed while they were away", {
      exact: true,
    });

    await expect(lineage).toBeVisible();
    expect(await lineage.evaluate((node) => node.closest("a") !== null)).toBe(true);
    await expect(page.locator('main a[href="/o/soc-2"]')).toHaveCount(1);
  });

  // C-36: an activity entry is what happened, not a proposal waiting on a human, so the
  // agent is named and never violet — --agent stands on proposal cards (T0.38).
  test("names an agent actor in --n-primary, never --agent", async ({ page }) => {
    const colour = await page
      .getByText("scorer", { exact: true })
      .evaluate((node) => getComputedStyle(node).color);

    expect(colour).toBe(PRIMARY_TEXT);
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
  test("offers exactly §5's third move, once per gap that has one", async ({ page }) => {
    // Scoped to `main`: `next dev` injects its own overlay button into the
    // document, which is not the page's and would fail this for the wrong reason.
    const content = page.locator("main");

    // The fixture's gaps: `prd-10` open Must, `prd-8` open Should, `prd-16`
    // accepted, `prd-20` excluded, `prd-19` closed. §13's narrowing keeps the
    // open Should off the card, so the moves land like this:
    //
    //   gap card   prd-10 accept · prd-16 reopen · prd-20 nothing (move 1 is Phase 3)
    //   expansion  prd-10 accept · prd-8 accept
    //
    // `prd-5`, `prd-14` and `prd-17` are unclear with no gap in the fixture, and
    // offer nothing — the control follows the debt, not the check.
    await expect(content.getByText("Accept this risk")).toHaveCount(3);
    await expect(content.getByRole("button", { name: "Reopen" })).toHaveCount(1);

    // One reason field per accept form, and no other input on the page. DOM
    // locators rather than roles: a closed `<details>` keeps its contents out of
    // the accessibility tree, which is exactly what a disclosure is for.
    await expect(content.locator("input[name=reason]")).toHaveCount(3);
    await expect(content.locator("input:not([type=hidden])")).toHaveCount(3);
    await expect(content.getByRole("checkbox")).toHaveCount(0);
    await expect(content.locator("select, textarea")).toHaveCount(0);

    // Three accept submits and one reopen: §5's other two moves are Phase 3, and
    // a control for them here would offer something that cannot happen.
    await expect(content.locator("button")).toHaveCount(4);
    await expect(content.locator("button[type=submit]")).toHaveCount(4);

    // The meter's disclosure plus one per accept form.
    await expect(content.locator("summary")).toHaveCount(4);
  });

  /**
   * **The rule that makes the move work with JavaScript off**, and the one that
   * is silent when broken.
   *
   * React encodes a server-action form as `multipart/form-data`; Next 16 bails
   * out of a `application/x-www-form-urlencoded` action POST and lets it fall
   * through to a normal page render, so an overridden `encType` turns every
   * accept into a no-op that looks like nothing happened. Measured on the real
   * markup because it is an attribute React writes, not one we can assert in a
   * unit test's virtual DOM.
   */
  test("posts the move as multipart, which is what works without JavaScript", async ({ page }) => {
    const form = page.locator("main form").first();

    await expect(form).toHaveAttribute("enctype", "multipart/form-data");
    await expect(form).toHaveAttribute("method", /post/i);
    // The hidden field React writes to name the action. Without it a no-JS
    // submit reaches the page rather than the function.
    await expect(form.locator('input[type=hidden][name^="$ACTION_"]')).not.toHaveCount(0);
  });

  /**
   * **AC3's "working without JS", proved by pressing the button on a page that never
   * hydrates.**
   *
   * `/dev` carries no session — it is in `PUBLIC_PREFIXES` — so `settleGap`
   * redirects to sign-in. That is the assertion: landing there means the POST
   * reached the action. The failure this guards against is the opposite and is
   * *silent* — Next drops a urlencoded action POST and re-renders the page, so a
   * broken form looks exactly like a form nobody pressed.
   *
   * The bundles are blocked rather than script disabled (T0.48): the page streams its
   * content into a Suspense boundary — its `loading.tsx`, which is what lets the frame
   * paint before the data (§4, C-40) — and the reveal is an inline script the streamed
   * HTML carries, which script-off never runs. What the form has to survive is the page
   * never hydrating — React never arriving — and that is the case this stages.
   */
  test("submits the move on a page that never hydrates", async ({ browser }) => {
    const context = await browser.newContext();
    await context.route("**/_next/static/chunks/**", (route) => route.abort());
    const page = await context.newPage();

    await page.goto("/dev/item");
    expect(await page.evaluate(() => "__next_f" in window && document.readyState)).toBeTruthy();
    // Opened by clicking its `<summary>`, which is the browser's own behaviour
    // and not page script — the reason the disclosure is a `<details>` at all.
    // The gap card's, not the meter expansion's: that one is inside the
    // readiness disclosure, which is closed, so it is not on screen to click.
    const card = page.getByTestId("gap-list").getByRole("listitem").filter({ hasText: "prd-10" });
    await card.getByText("Accept this risk").click();
    await card.locator("input[name=reason]").fill("Accepted for V1.");
    await Promise.all([page.waitForURL(/\/sign-in/), card.locator("button[type=submit]").click()]);

    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await context.close();
  });

  /**
   * §13's narrowing (T2.4) keeps an open Should off the gap card, so the meter's
   * expansion is the only place one can be accepted. That is why the move is
   * rendered in both surfaces from one component rather than only on the card.
   */
  test("offers the move on an open Should, which only the expansion shows", async ({ page }) => {
    const gaps = page.getByTestId("gap-list");
    await expect(gaps.getByText("prd-8")).toHaveCount(0);

    await page.getByTestId("readiness").locator("summary").first().first().click();

    const row = page.getByTestId("check-list").getByRole("listitem").filter({ hasText: "prd-8" });
    await expect(row.getByText("Accept this risk")).toHaveCount(1);
  });

  /**
   * §1 law 7: "visible debts that a named person accepts." The accepted card
   * keeps the name and carries the reversal, and §0 law 7 dims it rather than
   * disabling it — it stays fully interactive at .60.
   */
  test("keeps an accepted gap named, dimmed and reversible — its Reopen fully live", async ({
    page,
  }) => {
    const card = page.getByTestId("gap-list").getByRole("listitem").filter({ hasText: "prd-16" });

    const reopen = card.getByRole("button", { name: "Reopen" });
    await expect(reopen).toBeVisible();
    // §8.10: Secondary sm, at 1 — §0 law 7 dims the card, never the control.
    const live = await reopen.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: style.opacity,
        color: style.color,
        border: style.borderTopColor,
        height: Math.round(node.getBoundingClientRect().height),
      };
    });
    expect(live).toEqual({ opacity: "1", color: PRIMARY_TEXT, border: GLASS_BORDER, height: 28 });
    // The stamp keeps the name, in --n-secondary.
    expect(
      await card
        .getByText("You accepted this", { exact: false })
        .evaluate((node) => getComputedStyle(node).color),
    ).toBe(SECONDARY_TEXT);
    expect(
      await card
        .locator("> *")
        .first()
        .evaluate((node) => getComputedStyle(node).opacity),
    ).toBe("1");
  });

  /**
   * §0 law 1: gaps never render in Danger, and neither do the moves on them.
   * Accepting is not destructive and reopening is not either.
   *
   * **Staged with a move that actually answered**, through the same three
   * params the real page reads. A version of this that loaded `/dev/item` bare
   * would pass over a `MoveMessage` painted `--danger`, because with no move in
   * the URL there is no message on the page to paint.
   */
  test("renders no danger red on a gap, a move, or a move's answer", async ({ page }) => {
    await page.goto("/dev/item?intent=accept&move=not-decider&gap=g1");
    await page.getByTestId("readiness").locator("summary").first().click();

    // Scoped: `prd-10` is an open Must, so it renders on the card *and* on its
    // check line, and each carries its own copy of the move and its answer.
    const card = page.getByTestId("gap-list").getByRole("listitem").filter({ hasText: "prd-10" });
    await expect(card.getByText("Accepting a Must is the Decider's call.")).toBeVisible();

    const danger = await page.locator("main").evaluate((root) => {
      const DANGER = ["rgb(255, 114, 118)", "rgb(217, 58, 63)"];
      return [...root.querySelectorAll("*")].some((node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor, style.borderTopColor].some((v) =>
          DANGER.includes(v),
        );
      });
    });

    expect(danger).toBe(false);
  });

  /**
   * §8's one sanctioned Danger on this page — a field's own validation state —
   * and the proof that it stays inside the field. The border and the helper
   * line go `--danger`; nothing outside the composite does.
   */
  test("keeps the reason field's error tone inside the field", async ({ page }) => {
    await page.goto("/dev/item?intent=accept&move=reason-required&gap=g1");

    const card = page.getByTestId("gap-list").getByRole("listitem").filter({ hasText: "prd-10" });
    await expect(card.getByText("Add a reason.")).toBeVisible();

    const escaped = await page.locator("main").evaluate((root) => {
      const DANGER = ["rgb(255, 114, 118)", "rgb(217, 58, 63)"];
      return [...root.querySelectorAll("*")]
        .filter((node) => {
          const style = getComputedStyle(node);
          return [style.color, style.borderTopColor].some((v) => DANGER.includes(v));
        })
        .some((node) => node.closest(".field") === null);
    });

    expect(escaped).toBe(false);
  });

  /**
   * **Finding 1: the reversal's confirmation, where it can be read.**
   *
   * A reopen that landed leaves the gap open, so the accept form renders again
   * — closed, because the work is done. The sentence therefore cannot live
   * inside that disclosure, which is exactly where it used to live: rendered,
   * nested in a collapsed `<details>`, and reaching nobody. Measured in a real
   * browser because "inside a closed `<details>`" is a layout fact.
   */
  test("shows the reversal's confirmation after a reopen lands", async ({ page }) => {
    await page.goto("/dev/item?intent=reopen&move=reopened&gap=g1");

    const card = page.getByTestId("gap-list").getByRole("listitem").filter({ hasText: "prd-10" });
    await expect(card.getByText("Reopened.")).toBeVisible();
    // Closed, and the sentence readable anyway. Both halves matter.
    await expect(card.locator("details")).not.toHaveAttribute("open", /.*/);
  });

  /**
   * **Finding 2: everything that speaks about an open Should follows it into
   * the expansion.**
   *
   * §13 files `prd-8` under the score, so its move has no card — which means
   * the redirect's `#gap-<id>` has to be carried by the check line, and the
   * panel has to be open when someone arrives on it. Otherwise a failed accept
   * on a Should scrolls nowhere and says nothing, twice collapsed.
   */
  test("opens the expansion onto an open Should the URL names, anchor and all", async ({
    page,
  }) => {
    await page.goto("/dev/item?intent=accept&move=reason-required&gap=g4");

    // The panel opened itself; nobody clicked it.
    await expect(page.getByTestId("check-list")).toBeVisible();

    const row = page.getByTestId("check-list").getByRole("listitem").filter({ hasText: "prd-8" });
    await expect(row.getByText("Add a reason.")).toBeVisible();
    // The anchor the redirect targets, on the only surface that shows this gap.
    await expect(page.locator("#gap-g4")).toHaveCount(1);
    // And nowhere else: the card list does not render this gap at all.
    await expect(page.getByTestId("gap-list").getByText("prd-8")).toHaveCount(0);
  });

  /**
   * **Finding 4: an answer that names no gap still says something.**
   *
   * `not-found` names a gap the page does not hold, and a submission with no
   * readable move names neither. Both used to render nothing whatsoever. They
   * report at the top, which is where a redirect with no fragment lands.
   */
  test("reports a move no gap on the page can speak for", async ({ page }) => {
    await page.goto("/dev/item?intent=accept&move=not-found&gap=g-nope");
    // Once, at the top: no gap on the page claims it, so no card repeats it.
    await expect(
      page.getByText("That gap isn't here any more, so nothing was accepted."),
    ).toHaveCount(1);

    await page.goto("/dev/item?move=unreadable");
    await expect(page.getByText("That didn't arrive as a move, so nothing changed.")).toHaveCount(
      1,
    );

    // Fail closed: a crafted pair that no move can produce says nothing at all,
    // rather than borrowing the other move's sentence.
    await page.goto("/dev/item?intent=reopen&move=reason-required&gap=g1");
    await expect(page.getByText("Add a reason.")).toHaveCount(0);
  });

  /* ------------------------------------------------------------------------ */
  /* T0.49 — §8.32 the gap card                                               */
  /* ------------------------------------------------------------------------ */

  /**
   * §8.32: "a plain card, padding per §5 by where it stands, the check's wording ui-body,
   * its gap chip (§8.9), the quoted evidence on a `--surface-1` card in ui-body, and
   * §8.10's moves at the foot." Padding 20 — it stands on the page by itself; the evidence
   * on a bordered inner card, since a card must separate from a card (§5); no "Typically"
   * line, since product-spec has none for a gap move; no Undo, which lives in the toast.
   */
  test("the gap card pads 20, carries the check's wording, quotes the evidence on a bordered card, and no estimate or undo", async ({
    page,
  }) => {
    const gaps = page.getByTestId("gap-list");
    const card = gaps.getByRole("listitem").filter({ hasText: "prd-10" }).locator("> *").first();

    const padding = await card.evaluate((node) => getComputedStyle(node).padding);
    expect(padding).toBe("20px");

    // The pack's prose for prd-10, then the id beside its chip "Must · prd-10".
    await expect(card.getByText("Every story has testable GWT acceptance criteria")).toBeVisible();
    const chip = card.locator("[data-testid='gap-chip']");
    await expect(chip).toHaveText("Must · prd-10");
    expect(
      await chip
        .getByText("prd-10", { exact: true })
        .evaluate((n) => getComputedStyle(n).fontFamily),
    ).toContain("JetBrains Mono");

    const evidence = card.getByText(
      "GM-4 is prose. The other four stories carry Given/When/Then.",
      {
        exact: false,
      },
    );
    const inner = await evidence.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        border: `${style.borderTopWidth} ${style.borderTopColor}`,
        padding: style.padding,
        color: style.color,
      };
    });
    expect(inner).toEqual({
      background: SURFACE_1,
      border: `1px ${GLASS_BORDER}`,
      padding: "16px",
      color: PRIMARY_TEXT,
    });

    await expect(gaps.getByText(/Typically/)).toHaveCount(0);
    await expect(gaps.getByRole("button", { name: /undo/i })).toHaveCount(0);
    await expect(gaps.getByText(/\bUndo\b/)).toHaveCount(0);
  });

  /**
   * §8.20: "an optional action as a Neutral sm button ('Undo')" — the one Undo the product
   * renders. Raised on the sink, where a toast can be, and measured: 28 tall on
   * `--surface-2` with `--n-primary` text.
   */
  test("the toast's Undo is the Neutral sm §8.20 gives it", async ({ page }) => {
    await page.goto("/dev/primitives");
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "undo toast" }).click();

    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeVisible();
    const style = await undo.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        height: Math.round(node.getBoundingClientRect().height),
        background: computed.backgroundColor,
        color: computed.color,
      };
    });
    expect(style).toEqual({ height: 28, background: SURFACE_2, color: PRIMARY_TEXT });
  });

  /* ------------------------------------------------------------------------ */
  /* T0.49 — §8.24 the check list and §8.25 the disclosure                    */
  /* ------------------------------------------------------------------------ */

  /**
   * §8.25: one recipe for every summary — pad 8 vertical by 4 horizontal, a 16 chevron 4
   * from the text, swapped between right and down, the browser marker removed in both
   * spellings — shared by the meter's summary and the accept form's, which §8.10 says uses
   * it unchanged.
   */
  test("both disclosure summaries pad 8 by 4 with a 16 chevron 4 from the text that swaps, and no marker", async ({
    page,
  }) => {
    const meter = page.getByTestId("readiness").locator("summary").first();
    await meter.click();
    const accept = page
      .getByTestId("gap-list")
      .getByRole("listitem")
      .filter({ hasText: "prd-10" })
      .locator("summary");

    for (const summary of [meter, accept]) {
      const box = await summary.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          radius: style.borderTopLeftRadius,
          listStyle: style.listStyleType,
          marker: getComputedStyle(node, "::marker").content,
          chevrons: [...node.querySelectorAll("svg")].map((svg) => {
            const rect = svg.getBoundingClientRect();
            return { w: Math.round(rect.width), h: Math.round(rect.height) };
          }),
        };
      });
      expect(box.paddingTop).toBe("8px");
      expect(box.paddingBottom).toBe("8px");
      expect(box.paddingLeft).toBe("4px");
      expect(box.paddingRight).toBe("4px");
      expect(box.radius).toBe("16px");
      expect(box.listStyle).toBe("none");
      expect(["none", "", "normal"]).toContain(box.marker);
      // One chevron drawn at a time, 16 square; the other is display: none and has no box.
      expect(box.chevrons.filter((c) => c.w > 0)).toEqual([{ w: 16, h: 16 }]);
    }

    // 4 from the text: the chevron's left edge sits 4 past the text beside it.
    const acceptGap = await accept.evaluate((node) => {
      const chevron = [...node.querySelectorAll("svg")].find(
        (svg) => svg.getBoundingClientRect().width > 0,
      )!;
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = [...node.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
      range.selectNodeContents(text);
      return Math.round(chevron.getBoundingClientRect().left - range.getBoundingClientRect().right);
    });
    expect(acceptGap).toBe(4);
    const meterGap = await meter.evaluate((node) => {
      // The innermost span holding the number — its wrapper's text is "67%" too, but its
      // box ends at the chevron.
      const percent = [...node.querySelectorAll("span")].find(
        (s) => s.textContent === "67%" && s.children.length === 0,
      )!;
      const chevron = [...node.querySelectorAll("svg")].find(
        (svg) => svg.getBoundingClientRect().width > 0,
      )!;
      return Math.round(
        chevron.getBoundingClientRect().left - percent.getBoundingClientRect().right,
      );
    });
    expect(meterGap).toBe(4);

    // Swapped: closed shows the right chevron, open the down one.
    const shown = (summary: import("@playwright/test").Locator) =>
      summary.evaluate((node) =>
        [...node.querySelectorAll("svg")].map((svg) => svg.getBoundingClientRect().width > 0),
      );
    expect(await shown(meter)).toEqual([false, true]);
    await meter.click();
    expect(await shown(meter)).toEqual([true, false]);
    expect(await shown(accept)).toEqual([true, false]);
    await accept.click();
    expect(await shown(accept)).toEqual([false, true]);
  });

  /**
   * §8.24, read against the list: one line per check, gap 8 between lines and across one
   * and 4 when it wraps; passed as mono-micro `--success` with the 12 tick and gap 4;
   * unclear as the §8.9 chip "Must · unclear" with the evidence on a `--surface-1` card
   * at 16; not asked as mono-micro `--n-secondary` with the condition beneath it. And the
   * excluded chip's text computes to `--n-secondary` (§8.9).
   */
  test("the check list keeps §8.24's geometry and the excluded chip's text is --n-secondary", async ({
    page,
  }) => {
    await page.getByTestId("readiness").locator("summary").first().click();
    const checks = page.getByTestId("check-list");

    expect(await checks.evaluate((node) => getComputedStyle(node).rowGap)).toBe("8px");
    const line = checks
      .getByRole("listitem")
      .filter({ hasText: "prd-10" })
      .locator("> div")
      .first();
    const lineStyle = await line.evaluate((node) => {
      const style = getComputedStyle(node);
      return { columnGap: style.columnGap, rowGap: style.rowGap };
    });
    expect(lineStyle).toEqual({ columnGap: "8px", rowGap: "4px" });

    // Passed: the 12 tick, 4 from "Answered", in --success.
    const passed = checks.getByRole("listitem").filter({ hasText: "prd-1" }).first();
    const tick = await passed.getByText("Answered").evaluate((node) => {
      const svg = node.querySelector("svg")!;
      const rect = svg.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        size: [Math.round(rect.width), Math.round(rect.height)],
        gap: style.columnGap,
        color: style.color,
      };
    });
    expect(tick).toEqual({ size: [12, 12], gap: "4px", color: "rgb(34, 197, 94)" });

    // Unclear: the chip and the evidence card at 16.
    await expect(line.getByText("Must · unclear")).toBeVisible();
    const evidence = checks
      .getByRole("listitem")
      .filter({ hasText: "prd-10" })
      .locator("> div")
      .nth(1);
    expect(await evidence.evaluate((node) => getComputedStyle(node).padding)).toBe("16px");

    // Not asked: the label and the condition beneath it.
    const fifteen = checks.getByRole("listitem").filter({ hasText: "prd-15" });
    await expect(fifteen.getByText("Not asked")).toBeVisible();
    await expect(fifteen).toContainText("Only asked when:");

    // §8.9's excluded tone: --n-disabled outline, --n-secondary text.
    const excluded = page
      .getByTestId("gap-list")
      .getByRole("listitem")
      .filter({ hasText: "prd-20" })
      .locator("[data-testid='gap-chip']");
    expect(await excluded.evaluate((node) => getComputedStyle(node).color)).toBe(SECONDARY_TEXT);
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

    await page.getByTestId("readiness").locator("summary").first().click();
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
    await page.getByTestId("readiness").locator("summary").first().click();

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
   * T2.10: what the renormalization closed, on the line that explains it.
   *
   * `prd-15` left the denominator and took an open gap with it — §4's engine
   * making a judgment about the artifact, which is the one closure a person
   * might disagree with (build log open question 14). The gap has no card and
   * never will; this line is where it is answerable for.
   *
   * **`prd-19` is the control.** It is closed too, and it closed because its
   * check came to pass — the check passing is the record, so it surfaces
   * nowhere, in this list or the gap list. If the page ever showed closures
   * rather than *this* kind of closure, this assertion is what would notice.
   */
  test("shows the gap a not-asked check closed, and not the one a pass closed", async ({
    page,
  }) => {
    await page.getByTestId("readiness").locator("summary").first().click();

    const checks = page.getByTestId("check-list");
    const fifteen = checks.getByRole("listitem").filter({ hasText: "prd-15" });

    await expect(fifteen).toContainText("No empty state is described for the digest list.");
    await expect(fifteen).toContainText("This gap closed when the check stopped applying");

    // The passed closure's evidence is on no line, and no other check is asked
    // the question.
    await expect(
      page.getByText("MN-2: 'nearby' — same venue, or within 100 m? Two readings possible."),
    ).toHaveCount(0);
    await expect(page.getByText("This gap closed when the check stopped applying")).toHaveCount(1);
  });

  /**
   * AC4: §5 stamps provenance on every run because a number nobody can trace is
   * a number nobody can argue with. §8 puts it in mono-readout.
   */
  test("carries the run's provenance, quietly", async ({ page }) => {
    await page.getByTestId("readiness").locator("summary").first().click();

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
    await page.getByTestId("readiness").locator("summary").first().click();

    // The row's direct children are the header line and the evidence Card, in
    // that order; §5's move follows as a `<details>`, so `.last()` no longer
    // names the card.
    const card = page
      .getByTestId("check-list")
      .getByRole("listitem")
      .filter({ hasText: "prd-10" })
      .locator("> div")
      .nth(1);

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
    await page.getByTestId("readiness").locator("summary").first().click();

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

    await page.getByTestId("readiness").locator("summary").first().focus();
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
    const summary = page.getByTestId("readiness").locator("summary").first();

    // §4's frame stands ahead of the content now — the lockup, the switcher, the
    // dashboard row and the account slot — so the walk is longer than it was.
    for (let tabs = 0; tabs < 16; tabs += 1) {
      await page.keyboard.press("Tab");
      if (await summary.evaluate((node) => node === document.activeElement)) break;
    }
    await expect(summary).toBeFocused();

    // `.control` transitions `box-shadow` over `--t-fast` (globals.css), so for
    // 120 ms after focus arrives the glow is a transition in flight: a read
    // inside that window sees `--control-glow` already resolved and the computed
    // shadow still the two transparent ones. Past every animation running on
    // the node the read is the settled paint — `settledDialog`'s wait in
    // frame.spec.ts. (Unloaded, the read landed early and failed; under four
    // workers it landed late and passed, which is why it looked like a flake.)
    await summary.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));

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
    // Scoped to the meter: §10's rule is that an unscored meter opens onto
    // nothing. The gap cards still carry §5's move, because a debt someone owes
    // does not depend on whether a score was ever computed.
    await expect(page.getByTestId("readiness").locator("summary")).toHaveCount(0);
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

    // §4 (T0.48): the freshness stands in the page topbar's readout slot.
    const readout = page.getByTestId("page-readout");
    await expect(readout).toContainText("scored 4 h ago — retrying");

    // The dot is 8, like every system dot in the product, and it is --warning.
    const dot = page.getByTestId("page-freshness-dot");
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

    const dot = page.getByTestId("page-freshness-dot");

    expect(await dot.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(PRIME);
  });
});
