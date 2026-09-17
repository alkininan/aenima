import { describe, expect, it } from "vitest";

import { checkRevisionScope, sectionsTouched, type Section } from "./scope";

const BEFORE: Section[] = [
  { id: "problem", text: "Members cannot tell who nearby is open to talking." },
  { id: "stories", text: "GM-2 — Ghost mode ends when I leave." },
  { id: "out-of-scope", text: "Group chats." },
];

const revise = (id: string, text: string): Section[] =>
  BEFORE.map((section) => (section.id === id ? { id, text } : section));

describe("checkRevisionScope — TC2 → AC2", () => {
  it("lets a revision through that changes only the scoped section", () => {
    const after = revise("stories", "GM-2 — Ghost mode ends when I leave the venue.");
    expect(checkRevisionScope(BEFORE, after, "stories")).toEqual({ ok: true });
  });

  it("refuses a revision that also changes a section outside the scope, naming it", () => {
    const after = revise("stories", "GM-2 — Ghost mode ends when I leave the venue.").map((s) =>
      s.id === "problem" ? { ...s, text: "Members at a venue cannot tell who is open." } : s,
    );
    expect(checkRevisionScope(BEFORE, after, "stories")).toEqual({
      ok: false,
      outside: ["problem"],
    });
  });

  it("refuses a whitespace-only change outside the scope — a change is a change", () => {
    const after = revise("out-of-scope", "Group chats. ");
    expect(checkRevisionScope(BEFORE, after, "stories")).toEqual({
      ok: false,
      outside: ["out-of-scope"],
    });
  });

  it("refuses a revision that adds or removes another section", () => {
    const added = [...BEFORE, { id: "metrics", text: "Opt-in rate." }];
    const removed = BEFORE.filter((s) => s.id !== "out-of-scope");
    expect(checkRevisionScope(BEFORE, added, "stories")).toEqual({
      ok: false,
      outside: ["metrics"],
    });
    expect(checkRevisionScope(BEFORE, removed, "stories")).toEqual({
      ok: false,
      outside: ["out-of-scope"],
    });
  });

  it("refuses a revision that reorders the sections outside the scope", () => {
    const [problem, stories, outOfScope] = BEFORE;
    const after = [outOfScope!, stories!, problem!];
    expect(checkRevisionScope(BEFORE, after, "stories")).toEqual({
      ok: false,
      outside: ["problem", "out-of-scope"],
    });
  });

  it("lets the scoped section move, since where it sits is the author's to change", () => {
    const [problem, stories, outOfScope] = BEFORE;
    const after = [problem!, outOfScope!, stories!];
    expect(checkRevisionScope(BEFORE, after, "stories")).toEqual({ ok: true });
  });

  it("refuses a list with two sections under one id rather than guessing which changed", () => {
    const doubled = [...BEFORE, { id: "stories", text: "GM-3 — a second copy." }];
    expect(() => checkRevisionScope(BEFORE, doubled, "stories")).toThrow(/duplicate section id/);
  });
});

describe("sectionsTouched", () => {
  it("reads nothing as touched when nothing changed", () => {
    expect(
      sectionsTouched(
        BEFORE,
        BEFORE.map((s) => ({ ...s })),
      ),
    ).toEqual([]);
  });

  it("does not read one removed section as every later section moving", () => {
    const after = BEFORE.filter((s) => s.id !== "problem");
    expect(sectionsTouched(BEFORE, after)).toEqual(["problem"]);
  });
});
