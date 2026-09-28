import { describe, expect, it } from "vitest";

import { formatChord, isApplePlatform } from "@/lib/platform";

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/130.0";

/** design-spec.md §8.15: "`⌘` on macOS and `Ctrl` elsewhere, read from the user agent at load." */
describe("isApplePlatform", () => {
  it("reads macOS and iPadOS from the user agent", () => {
    expect(isApplePlatform(MAC)).toBe(true);
    expect(isApplePlatform(IPAD)).toBe(true);
  });

  it("reads everything else as Ctrl", () => {
    expect(isApplePlatform(WINDOWS)).toBe(false);
    expect(isApplePlatform(LINUX)).toBe(false);
    expect(isApplePlatform("")).toBe(false);
  });

  it("takes the platform string where it says more than the user agent", () => {
    expect(isApplePlatform("", "MacIntel")).toBe(true);
    expect(isApplePlatform(WINDOWS, "Win32")).toBe(false);
  });
});

describe("formatChord", () => {
  it("renders the modifier as the platform's glyph and joins Apple chords without a plus", () => {
    expect(formatChord(["mod", "z"], true)).toBe("⌘Z");
    expect(formatChord(["mod", "z"], false)).toBe("Ctrl+Z");
    expect(formatChord(["shift", "up"], true)).toBe("⇧↑");
    expect(formatChord(["shift", "up"], false)).toBe("Shift+↑");
  });

  it("names the keys as the keyboard prints them", () => {
    expect(formatChord(["esc"], true)).toBe("Esc");
    expect(formatChord(["enter"], false)).toBe("Enter");
    expect(formatChord(["home"], true)).toBe("Home");
    expect(formatChord(["end"], true)).toBe("End");
    expect(formatChord(["down"], false)).toBe("↓");
    expect(formatChord(["?"], true)).toBe("?");
    expect(formatChord(["/"], false)).toBe("/");
  });
});
