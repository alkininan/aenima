import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/Input";

function Harness({ hint }: { hint?: string }) {
  const [value, setValue] = useState("");
  return (
    <Input label="Email" hint={hint} value={value} onChange={(e) => setValue(e.target.value)} />
  );
}

const composite = (container: HTMLElement) => container.querySelector(".field") as HTMLElement;
const field = () => screen.getByLabelText("Email") as HTMLInputElement;
const helperOf = (container: HTMLElement) => container.querySelector('[id$="-helper"]');

/**
 * The floating label and the two reserved slots (design-spec.md §8, §13).
 *
 * jsdom has no layout, so "does not shift" cannot be measured here — that is
 * what the browser pass covers. What *can* be pinned here is the structural
 * property the no-shift guarantee rests on: the label zone and the helper line
 * are occupied in every state, and no node appears or disappears when a field
 * goes from rest to focused to error. A reserved slot that is only rendered
 * once there is something to put in it is not reserved, and that mistake is
 * invisible until an error message pushes the submit button down the page.
 *
 * The label's identity is asserted too, not just its presence. §13 requires it
 * to stay bound to its input "at every moment of the animation" — swapping one
 * label element for a differently-styled one would satisfy every text-based
 * assertion while breaking exactly what the rule protects.
 */
describe("Input floating label", () => {
  it("labels the field with a real bound <label>, not a placeholder", async () => {
    render(<Harness />);

    // getByLabelText resolves through `for`/`id`, so this passing *is* the
    // binding — an aria-label or a placeholder would not satisfy it.
    expect(field().tagName).toBe("INPUT");
    expect(field().getAttribute("placeholder")).not.toBe("Email");
  });

  it("keeps the same label element across the float", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const atRest = screen.getByText("Email");
    await user.type(field(), "a@b.co");

    // Same node, moved — not a second label swapped in for the floated state.
    expect(screen.getByText("Email")).toBe(atRest);
    expect(field().value).toBe("a@b.co");
  });

  // §8: "empty" has to be expressible as a selector for the CSS to place the
  // label without React telling it anything, so an unhinted field still gets a
  // placeholder — a space, which paints nothing.
  it("always carries a placeholder so :placeholder-shown can see an empty field", () => {
    const { container } = render(<Harness />);
    expect(field().getAttribute("placeholder")).toBe(" ");

    render(<Harness hint="you@company.com" />, { container });
    expect(field().getAttribute("placeholder")).toBe("you@company.com");
  });

  // §8 exemption: Search keeps a resting placeholder and reserves no zone, but
  // §13 still wants a bound label — so it is hidden, not absent.
  it("keeps a bound label even where §8 exempts the field from floating", () => {
    const { container } = render(
      <Input label="Search" floatingLabel={false} hint="Search" reserveHelper={false} />,
    );

    expect(screen.getByLabelText("Search")).not.toBeNull();
    expect(composite(container).className).toContain("field-unlabelled");
  });
});

describe("Input reserved slots", () => {
  // The label zone is 20h and always present, so the label floating into it
  // cannot move the field or anything below it.
  it("reserves the label zone in every state", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    expect(composite(container).className).toContain("field");

    await user.click(field());
    expect(composite(container).className).toContain("field");

    await user.type(field(), "a@b.co");
    expect(composite(container).className).toContain("field");
  });

  // The helper line is 18h and rendered even when it has nothing to say, so an
  // error arriving fills a slot that was already there.
  it("reserves the helper line before there is any state to report", () => {
    const { container } = render(<Input label="Email" />);

    const helper = helperOf(container);
    expect(helper).not.toBeNull();
    expect(helper?.textContent).toBe("");
    expect(helper?.className).toContain("field-helper-reserved");
  });

  /**
   * The regression this whole arrangement exists to prevent. Rest → focus →
   * error must not add or remove a single element: if the helper span only
   * appears with an error, everything below the field jumps by 26px the moment
   * validation fails.
   */
  it("adds and removes no nodes going from rest to focused to error", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Input label="Email" />);

    const shape = () => {
      const root = composite(container);
      return {
        children: root.childElementCount,
        // Every descendant, so a slot vanishing anywhere in the tree counts.
        elements: root.querySelectorAll("*").length,
        helperReserved: helperOf(container)?.className.includes("field-helper-reserved"),
      };
    };

    const atRest = shape();

    await user.click(field());
    expect(shape()).toEqual(atRest);

    rerender(<Input label="Email" invalid helper="That doesn't look like an email yet." />);
    expect(shape()).toEqual(atRest);
  });

  it("gives up the reserved line only when asked", () => {
    const { container } = render(<Input label="Email" reserveHelper={false} />);
    expect(helperOf(container)).toBeNull();
  });

  // §8 error: the message is wired to the field, not just painted near it.
  it("describes the field by its helper when one is showing", () => {
    render(<Input label="Email" invalid helper="That doesn't look like an email yet." />);

    const described = field().getAttribute("aria-describedby");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(described).not.toBeNull();
    // The message is wired to the field, not merely painted under it.
    expect(document.getElementById(described!)?.textContent).toBe(
      "That doesn't look like an email yet.",
    );
  });
});
