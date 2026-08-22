import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { OtpInput } from "@/components/ui/OtpInput";

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <OtpInput
      label="Code"
      value={value}
      onValueChange={setValue}
      {...(onComplete ? { onComplete } : {})}
    />
  );
}

const boxes = () => screen.getAllByRole("textbox") as HTMLInputElement[];
const digits = () => boxes().map((box) => box.value);

/** design-spec.md §8 OTP, product-spec.md §12 six-digit codes, §11 keyboard. */
describe("OtpInput", () => {
  it("renders exactly six boxes", () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
  });

  it("advances as digits are typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();

    await user.keyboard("123");
    expect(digits()).toEqual(["1", "2", "3", "", "", ""]);
    expect(document.activeElement).toBe(boxes()[3]);
  });

  it("takes only digits", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();

    await user.keyboard("a1b2");
    expect(digits()).toEqual(["1", "2", "", "", "", ""]);
  });

  it("calls onComplete once the sixth box is filled", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    boxes()[0]?.focus();

    await user.keyboard("12345");
    expect(onComplete).not.toHaveBeenCalled();

    await user.keyboard("6");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("123456");
  });

  // The behaviour people notice: Backspace on an empty box steps back and
  // clears the digit behind it, the way a single field would.
  it("steps back and clears on Backspace", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();
    await user.keyboard("123");

    await user.keyboard("{Backspace}");
    expect(digits()).toEqual(["1", "2", "", "", "", ""]);
    expect(document.activeElement).toBe(boxes()[2]);

    await user.keyboard("{Backspace}");
    expect(digits()).toEqual(["1", "", "", "", "", ""]);
  });

  // §11: arrow keys walk.
  it("walks with the arrow keys and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[2]?.focus();

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(boxes()[1]);
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(boxes()[3]);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(boxes()[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(boxes()[5]);
  });

  it("does not walk off either end", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(boxes()[0]);

    boxes()[5]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(boxes()[5]);
  });

  // A code pasted out of a mail client has to fill all six, not drop five.
  it("spreads a pasted code across the boxes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();

    await user.paste("482913");
    expect(digits()).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  it("takes a pasted code that carries its own spacing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();

    await user.paste("482 913");
    expect(digits()).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  // §8: a filled box takes a --prime border; the group carries the label.
  it("marks filled boxes and names the group", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    boxes()[0]?.focus();
    await user.keyboard("1");

    expect(boxes()[0]?.className).toContain("border-prime");
    expect(boxes()[1]?.className).toContain("border-glass-border");
    expect(screen.getByRole("group", { name: "Code" })).toBeTruthy();
  });

  it("offers the one-time code to the platform on the first box only", () => {
    render(<Harness />);
    expect(boxes()[0]?.getAttribute("autocomplete")).toBe("one-time-code");
    expect(boxes()[1]?.getAttribute("autocomplete")).toBe("off");
  });
});
