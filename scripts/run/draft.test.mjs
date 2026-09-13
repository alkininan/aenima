import { describe, expect, it } from "vitest";

import { callout, draftTask } from "./draft.mjs";

const P = "⟡ ";
const from = { name: "T0.11 Comments", url: "https://www.notion.so/t0-11" };
const headings = (body) => body.split("\n").filter((line) => line.startsWith("# "));

// TC2 → AC2. A reply that asks for new work becomes one Backlog task whose body says who
// drafted it and links back to the task it was said on.
describe("draftTask from a reply", () => {
  const body = draftTask({ request: "later, also add X", from, date: "2026-09-13", prefix: P });

  it("opens with the pipeline's callout, dated, linking back to the source task", () => {
    const [first] = body.split("\n");
    expect(first).toBe(
      "> ⟡ Drafted by pipeline · 2026-09-13 · from a comment on T0.11 Comments (https://www.notion.so/t0-11) · confirm or edit in Notion",
    );
    expect(callout({ date: "2026-09-13", from, prefix: P })).toBe(first);
  });

  it("carries the seven sections of guidelines §2, in order, one word each", () => {
    expect(headings(body)).toEqual([
      "# Objective",
      "# Build",
      "# Rules",
      "# Criteria",
      "# Tests",
      "# Done",
      "# Report",
    ]);
  });

  it("puts the request in the Objective and as AC1, with TC1 naming it", () => {
    expect(body).toContain("# Objective\nlater, also add X");
    expect(body).toContain("- AC1 later, also add X");
    expect(body).toContain("- TC1 → AC1");
    expect(body).toContain("It was said on T0.11 Comments");
  });
});

// TC5 → AC5. An idle run that found something wrong files one task with no source task to
// link: the reason it saw is the first sentence, and the callout says only who and when.
describe("draftTask from an idle run", () => {
  const body = draftTask({
    request: "Make the typegen step survive a missing .next directory",
    reason: "The preflight's typegen went red on a fresh worktree.",
    date: "2026-09-13",
    prefix: P,
  });

  it("has no backlink, since there is no task it came from", () => {
    expect(body.split("\n")[0]).toBe(
      "> ⟡ Drafted by pipeline · 2026-09-13 · confirm or edit in Notion",
    );
    expect(body).not.toContain("from a comment on");
  });

  it("leads the Objective with the reason, then the ask", () => {
    expect(body).toContain(
      "# Objective\nThe preflight's typegen went red on a fresh worktree. Make the typegen step survive a missing .next directory",
    );
    expect(body).toContain("The run that filed this has no more than that.");
  });
});
