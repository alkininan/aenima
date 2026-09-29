import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";

import { DecisionList, type DecisionView } from "./DecisionList";

const t = getDictionary();
const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const decision = (overrides: Partial<DecisionView> & Pick<DecisionView, "id">): DecisionView => ({
  statement: "Digest ships weekly",
  reason: "The open rate did not justify daily.",
  decidedBy: { kind: "self" },
  decidedAt: NOW - 3 * DAY,
  superseded: false,
  supersedes: false,
  ...overrides,
});

/**
 * §2 Dimming (T0.49): "Opacity never touches text." A superseded decision is dimmed the
 * way a settled gap card is — its text to `--n-secondary`, .60 on its non-text parts only,
 * here the chip's outline — and never by opacity on the card that holds the words.
 */
describe("DecisionList", () => {
  it("dims a superseded decision by colour, its chip's outline at .60, never the card", () => {
    const { container } = render(
      <DecisionList
        decisions={[
          decision({ id: "d2", statement: "Digest ships weekly, not daily", supersedes: true }),
          decision({
            id: "d1",
            statement: "Digest ships daily",
            decidedAt: NOW - 20 * DAY,
            superseded: true,
          }),
        ]}
        t={t}
        now={NOW}
      />,
    );

    expect(container.innerHTML).not.toContain('opacity-60"');
    expect(container.querySelectorAll('[class*="opacity-60"]:not([aria-hidden])')).toHaveLength(0);

    const old = screen.getByText("Digest ships daily");
    expect(old.className).toContain("text-n-secondary");
    const current = screen.getByText("Digest ships weekly, not daily");
    expect(current.className).toContain("text-n-primary");

    // The chip: `--n-secondary` text on the element, the outline on a layer at .60.
    const chip = screen.getByText(t.item.supersededBy);
    expect(chip.className).toContain("text-n-secondary");
    expect(chip.className).not.toContain("text-n-disabled");
    const outline = chip.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(outline.className).toContain("opacity-60");
    expect(outline.className).toContain("border-n-disabled");
  });

  it("keeps a decision in force at full tone", () => {
    render(<DecisionList decisions={[decision({ id: "d2" })]} t={t} now={NOW} />);
    expect(screen.getByText("Digest ships weekly").className).toContain("text-n-primary");
    expect(screen.queryByText(t.item.supersededBy)).toBeNull();
  });
});
