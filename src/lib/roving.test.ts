import { describe, expect, it } from "vitest";

import { nextRovingIndex } from "@/lib/roving";

/** design-spec.md §11: "arrow keys walk menus/selects/list rows". */
describe("nextRovingIndex", () => {
  it("ignores keys that are not walking keys", () => {
    expect(nextRovingIndex({ key: "a", current: 0, count: 3 })).toBeNull();
    expect(nextRovingIndex({ key: "Enter", current: 0, count: 3 })).toBeNull();
  });

  it("has nowhere to go in an empty list", () => {
    expect(nextRovingIndex({ key: "ArrowDown", current: -1, count: 0 })).toBeNull();
  });

  it("steps down and up", () => {
    expect(nextRovingIndex({ key: "ArrowDown", current: 0, count: 3 })).toBe(1);
    expect(nextRovingIndex({ key: "ArrowUp", current: 2, count: 3 })).toBe(1);
  });

  it("wraps at both ends", () => {
    expect(nextRovingIndex({ key: "ArrowDown", current: 2, count: 3 })).toBe(0);
    expect(nextRovingIndex({ key: "ArrowUp", current: 0, count: 3 })).toBe(2);
  });

  // Opening a select with nothing chosen: Down starts at the top, Up at the end.
  it("starts from the right end when nothing is active", () => {
    expect(nextRovingIndex({ key: "ArrowDown", current: -1, count: 3 })).toBe(0);
    expect(nextRovingIndex({ key: "ArrowUp", current: -1, count: 3 })).toBe(2);
  });

  it("jumps to the ends", () => {
    expect(nextRovingIndex({ key: "Home", current: 2, count: 4 })).toBe(0);
    expect(nextRovingIndex({ key: "End", current: 0, count: 4 })).toBe(3);
  });

  it("steps over disabled entries", () => {
    const isDisabled = (index: number) => index === 1;
    expect(nextRovingIndex({ key: "ArrowDown", current: 0, count: 3, isDisabled })).toBe(2);
    expect(nextRovingIndex({ key: "ArrowUp", current: 2, count: 3, isDisabled })).toBe(0);
  });

  it("skips past a disabled entry at either end", () => {
    const isDisabled = (index: number) => index === 0 || index === 3;
    expect(nextRovingIndex({ key: "Home", current: 2, count: 4, isDisabled })).toBe(1);
    expect(nextRovingIndex({ key: "End", current: 1, count: 4, isDisabled })).toBe(2);
  });

  it("gives up rather than looping forever when everything is disabled", () => {
    const isDisabled = () => true;
    expect(nextRovingIndex({ key: "ArrowDown", current: 0, count: 3, isDisabled })).toBeNull();
    expect(nextRovingIndex({ key: "Home", current: 0, count: 3, isDisabled })).toBeNull();
  });
});
