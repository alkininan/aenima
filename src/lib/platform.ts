/**
 * design-spec.md §8.15 — which glyph a modifier key wears.
 *
 * "Modifier glyphs follow the platform, `⌘` on macOS and `Ctrl` elsewhere, read from the user
 * agent at load." A pure read over the strings the browser hands out, so the rule can be
 * tested with a handful of user agents rather than by running on four machines; `Kbd` reads
 * it once on the client and never on the server, which has no user agent to ask.
 *
 * Every glyph a chord can print is one the vendored JetBrains Mono carries — `⌘`, `⇧`, `↑`
 * and `↓` are in its subset (C-39 checks the first two) — so a key cap never falls back to a
 * face with other metrics, which is the failure §8.15 warns of. `←` and `→` are not in the
 * subset today; the row that would print them, "Move within a row", waits on the grid (§11)
 * and on the subset carrying them, and is recorded in T0.45's open questions.
 */

/** The keys a chord is written in. Letters print uppercase, as a keyboard does. */
export type KeyToken =
  | "mod"
  | "shift"
  | "up"
  | "down"
  | "left"
  | "right"
  | "enter"
  | "esc"
  | "tab"
  | "space"
  | "home"
  | "end"
  | "?"
  | "/"
  | "a"
  | "k"
  | "z";

/** One key cap: a key, or a modifier and a key pressed together. */
export type Chord = readonly KeyToken[];

/** True on macOS, iPadOS and iOS, where the command key is the modifier. */
export function isApplePlatform(userAgent: string, platform = ""): boolean {
  return (
    /\b(Mac|iPhone|iPad|iPod)/.test(platform) ||
    /Mac OS X|Macintosh|iPhone|iPad|iPod/.test(userAgent)
  );
}

const PLATFORM_KEYS: Record<"mod" | "shift", { apple: string; other: string }> = {
  mod: { apple: "⌘", other: "Ctrl" },
  shift: { apple: "⇧", other: "Shift" },
};

const NAMED_KEYS: Record<Exclude<KeyToken, "mod" | "shift">, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  enter: "Enter",
  esc: "Esc",
  tab: "Tab",
  space: "Space",
  home: "Home",
  end: "End",
  "?": "?",
  "/": "/",
  a: "A",
  k: "K",
  z: "Z",
};

/**
 * A chord as its key cap reads: `⌘Z` on Apple platforms, where the modifier glyph stands
 * beside the key, and `Ctrl+Z` elsewhere, where a word needs the plus to read as a chord.
 */
export function formatChord(chord: Chord, apple: boolean): string {
  const caps = chord.map((token) =>
    token === "mod" || token === "shift"
      ? apple
        ? PLATFORM_KEYS[token].apple
        : PLATFORM_KEYS[token].other
      : NAMED_KEYS[token],
  );
  return caps.join(apple ? "" : "+");
}
