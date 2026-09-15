import { describe, expect, it } from "vitest";

import {
  awaitingMigration,
  CLARIFYING_CAP,
  compose,
  KINDS,
  mentions,
  permitted,
  readThread,
  shapeOf,
} from "./comments.mjs";

const P = "⟡ ";
const c = (text, created_time) => ({ text, created_time });

// TC4 → AC4. Prefixed comments are the pipeline's; a human comment newer than the last
// prefixed one is the answer this run must assess.
describe("readThread", () => {
  it("splits the thread by the prefix, not by author", () => {
    const thread = readThread(
      [
        c(`${P}Question   which wording?`, "2026-09-01T10:00:00Z"),
        c("the agreed one", "2026-09-01T11:00:00Z"),
      ],
      P,
    );
    expect(thread.pipeline).toHaveLength(1);
    expect(thread.human).toHaveLength(1);
  });

  it("finds the human comment newer than the last prefixed one", () => {
    const thread = readThread(
      [
        c("early aside", "2026-09-01T09:00:00Z"),
        c(`${P}Question   which wording?`, "2026-09-01T10:00:00Z"),
        c("use: gate released", "2026-09-01T11:00:00Z"),
      ],
      P,
    );
    expect(thread.unanswered.map((x) => x.text)).toEqual(["use: gate released"]);
  });

  it("does not count a human comment older than the last prefixed one", () => {
    const thread = readThread(
      [
        c("said this before the question", "2026-09-01T09:00:00Z"),
        c(`${P}Question   which wording?`, "2026-09-01T10:00:00Z"),
      ],
      P,
    );
    expect(thread.unanswered).toEqual([]);
  });

  // "Last prefixed" means last by time, not last in whatever order the API returned. With
  // two prefixed comments given newest-first, an unordered read would take the *Question* as
  // the last one and call an already-answered comment unanswered.
  it("orders an out-of-order thread before deciding which prefixed comment is last", () => {
    const thread = readThread(
      [
        c(`${P}clarify once`, "2026-09-01T14:00:00Z"),
        c("my answer", "2026-09-01T12:00:00Z"),
        c(`${P}Question   q`, "2026-09-01T10:00:00Z"),
      ],
      P,
    );
    expect(thread.pipeline.map((x) => x.text)).toEqual([`${P}Question   q`, `${P}clarify once`]);
    expect(thread.unanswered).toEqual([]);
  });

  it("finds the answer that came after the last clarification", () => {
    const thread = readThread(
      [
        c(`${P}clarify once`, "2026-09-01T14:00:00Z"),
        c("my answer", "2026-09-01T15:00:00Z"),
        c(`${P}Question   q`, "2026-09-01T10:00:00Z"),
      ],
      P,
    );
    expect(thread.unanswered.map((x) => x.text)).toEqual(["my answer"]);
  });

  it("treats every human comment as unanswered when the pipeline has said nothing", () => {
    const thread = readThread([c("a", "2026-09-01T09:00:00Z"), c("b", "2026-09-01T10:00:00Z")], P);
    expect(thread.unanswered).toHaveLength(2);
  });

  it("counts clarifying rounds without counting the Question itself", () => {
    const question = c(`${P}Question   q`, "2026-09-01T10:00:00Z");
    expect(readThread([question], P).clarifyingRounds).toBe(0);
    expect(
      readThread([question, c(`${P}still unclear`, "2026-09-01T12:00:00Z")], P).clarifyingRounds,
    ).toBe(1);
  });

  it("stops posting after two clarifying rounds, and keeps reading", () => {
    const thread = readThread(
      [
        c(`${P}Question   q`, "2026-09-01T10:00:00Z"),
        c(`${P}clarify 1`, "2026-09-01T12:00:00Z"),
        c(`${P}clarify 2`, "2026-09-01T14:00:00Z"),
        c("a new answer", "2026-09-01T15:00:00Z"),
      ],
      P,
    );
    expect(thread.clarifyingRounds).toBe(CLARIFYING_CAP);
    expect(thread.mayPost).toBe(false);
    expect(thread.unanswered).toHaveLength(1);
  });

  it("may still post at one round below the cap", () => {
    const thread = readThread(
      [c(`${P}Question   q`, "2026-09-01T10:00:00Z"), c(`${P}clarify 1`, "2026-09-01T12:00:00Z")],
      P,
    );
    expect(thread.mayPost).toBe(true);
  });

  it("reads an empty thread without inventing anything", () => {
    expect(readThread([], P)).toMatchObject({ unanswered: [], clarifyingRounds: 0, mayPost: true });
  });

  it("does not mistake a comment that merely mentions the glyph for a pipeline one", () => {
    const thread = readThread([c(`the ${P}glyph is fine`, "2026-09-01T10:00:00Z")], P);
    expect(thread.pipeline).toEqual([]);
    expect(thread.human).toHaveLength(1);
  });
});

// §4 (v1.4): every comment in plain sentences, no labels, the prefix kept.
describe("compose", () => {
  const sentences = (text) =>
    text
      .replace(P, "")
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
  const all = {
    decision: {
      stopped: "the release wording",
      gap: 'The body asks for "the agreed wording" and that isn\'t written down anywhere, not in the ticket and not in the specs.',
      fallback: "use build-guide §6's own sentence",
    },
    clarifying: {
      readings: ["the sentence as it stands", "the sentence with the rule's location added"],
      fallback: "keep it as it stands",
    },
    migration: { file: "drizzle/0013_activity_trigger.sql" },
    stale: { date: "9 September", branch: "t0-97-stale-1607" },
    default: {
      gap: "The body asks for a friendlier release message but doesn't say what friendlier means, and nothing else does either.",
      choice: '"Three reds in a row. Take a breath, reread the ticket, then come back."',
    },
    change: {},
    newWork: { name: "Print JSON from the gate", url: "https://www.notion.so/abc" },
    merged: { commit: "a1b2c3d" },
    applied: { file: "drizzle/0015_x.sql" },
    noted: {},
    setup: {
      step: "a Notion internal integration",
      where: "Its token goes in .env.local as NOTION_TOKEN.",
    },
    resolved: {},
    gated: { paths: "scripts/hooks/guard.mjs and .claude/settings.json" },
    reverted: {
      failed: "/sign-in answered 500 and /app answered 200",
      merge: "9c1d2e3",
      commit: "a1b2c3d",
      name: "Fix the sign-in page after T0.16",
      url: "https://www.notion.so/xyz",
    },
  };

  it("has a fixture for every kind, so a kind added without a voice is caught here", () => {
    expect(Object.keys(all).sort()).toEqual([...KINDS].sort());
  });

  it("writes every kind prefixed, in two to four sentences, with no labels", () => {
    for (const [kind, fields] of Object.entries(all)) {
      const text = compose(kind, fields, P);
      expect(text.startsWith(P), kind).toBe(true);
      expect(text, kind).not.toMatch(/\n/);
      expect(text, kind).not.toMatch(/\b(Question|Where|Default)\s{2,}/);
      const count = sentences(text).length;
      expect(count, `${kind}: ${text}`).toBeGreaterThanOrEqual(2);
      expect(count, `${kind}: ${text}`).toBeLessThanOrEqual(4);
      expect(readThread([c(text, "2026-09-01T10:00:00Z")], P).pipeline).toHaveLength(1);
    }
  });

  it("says what it stopped on, where the gap lives in words, and what default takes", () => {
    expect(compose("decision", all.decision, P)).toBe(
      `${P}I've stopped on the release wording. The body asks for "the agreed wording" and that isn't written down anywhere, not in the ticket and not in the specs. If you say "default" I'll use build-guide §6's own sentence.`,
    );
  });

  it("names the two readings it cannot pick between", () => {
    expect(compose("clarifying", all.clarifying, P)).toBe(
      `${P}Thanks, I read that, but it still fits two readings: the sentence as it stands, or the sentence with the rule's location added. If you say "default" I'll keep it as it stands.`,
    );
  });

  it("leaves a migration in the diff and says whose move applying it is", () => {
    expect(compose("migration", all.migration, P)).toBe(
      `${P}This change adds a migration, drizzle/0013_activity_trigger.sql, and applying it to the shared database is your call. I've left it in the diff and stopped here. Once you've applied it, say so on this thread and the next run picks the ticket back up.`,
    );
  });

  it("names the kept branch on a stale run, or says there was none to keep", () => {
    expect(compose("stale", all.stale, P)).toBe(
      `${P}This run stopped partway on 9 September. I've kept the branch as t0-97-stale-1607 in case anything on it is worth salvaging, and started again from main.`,
    );
    expect(compose("stale", { date: "9 September", branch: null }, P)).toBe(
      `${P}This run stopped partway on 9 September before it made a branch, so there's nothing to salvage. I've started again from main.`,
    );
  });

  it("says what it chose when the choice was cheap, and keeps going", () => {
    expect(compose("default", all.default, P)).toBe(
      `${P}The body asks for a friendlier release message but doesn't say what friendlier means, and nothing else does either. A wrong guess here costs nothing to change, so I went with "Three reds in a row. Take a breath, reread the ticket, then come back." and kept going. Say the word if you'd rather something else.`,
    );
  });

  // TC1 → AC1 (change), TC2 → AC2 (newWork), TC3 → AC3 (merged), TC4 → AC4 (applied): the
  // shapes a reply on any task can take, each with a voice of its own.
  it("says a change was folded in and where the task went", () => {
    expect(compose("change", {}, P)).toBe(
      `${P}I've read that as a change to this ticket and folded it into the body as an addendum. The task is back at Ready; the next run builds it on the same branch and pull request and brings it back to Review.`,
    );
  });

  it("names the new task it drafted and where it sits", () => {
    expect(compose("newWork", all.newWork, P)).toBe(
      `${P}I've read that as new work rather than a change to this ticket, so I've drafted it as its own task at Backlog: Print JSON from the gate (https://www.notion.so/abc). Set it Ready when you want it built.`,
    );
  });

  it("says what merged, how, and what applied", () => {
    expect(compose("merged", all.merged, P)).toBe(
      `${P}Merged into main at a1b2c3d with a merge commit, and the task is Done. The release row follows.`,
    );
    expect(compose("applied", all.applied, P)).toBe(
      `${P}Applied drizzle/0015_x.sql to the shared database. The ticket picks up from where it stopped.`,
    );
  });

  // T0.16 TC3 → AC3 and TC5 → AC5. A gated diff stays at Review and says which path waits for
  // the word; a merge whose deploy failed says what failed, what was reverted, and where the
  // fix was filed.
  it("names the gated path that waits for the word, and the merge that was reverted", () => {
    expect(compose("gated", all.gated, P)).toBe(
      `${P}This ticket is built, reviewed and green, but the diff touches scripts/hooks/guard.mjs and .claude/settings.json, which is a path only your word merges — the pipeline's own boundary, a migration or the product spec. It stays at Review; say "merge" here and the next run lands it with a merge commit.`,
    );
    expect(compose("reverted", all.reverted, P)).toBe(
      `${P}The deploy check after this merge failed: /sign-in answered 500 and /app answered 200. I've reverted the merge commit 9c1d2e3 on main as a1b2c3d and put this task back at Backlog. The fix is filed as its own task: Fix the sign-in page after T0.16 (https://www.notion.so/xyz).`,
    );
  });

  // Review pass 3, Must 3: a Decision answer that sets Ready needs its own ⟡ comment too, or
  // every later run reads the same answer as unanswered.
  it("says an answer was read as the answer, so the reply is not assessed twice", () => {
    expect(compose("resolved", {}, P)).toBe(
      `${P}Read that as the answer, thanks. The task is back at Ready and the next run picks it up from there.`,
    );
  });

  it("acknowledges a reply that asks for nothing, and says exactly what a human step is", () => {
    expect(compose("noted", {}, P)).toBe(
      `${P}Read that, thanks. Nothing for me to do here, so I've left the ticket as it is.`,
    );
    expect(compose("setup", all.setup, P)).toBe(
      `${P}I've stopped on a step only you can do: a Notion internal integration. Its token goes in .env.local as NOTION_TOKEN. Say "done" on this thread once it's in place and the next run carries on.`,
    );
  });

  it("refuses a kind it does not know rather than posting something unshaped", () => {
    expect(() => compose("apology", {}, P)).toThrow("unknown comment kind");
  });
});

// TC3 → AC3 and TC4 → AC4, the pure half: what "the word on the thread" means. The guard
// and the preflight read the same test, so a reply the preflight calls a merge is one the
// guard will allow, and no other.
describe("mentions", () => {
  it("is true when the reply begins with the word, case and punctuation aside", () => {
    for (const text of ["merge", "Merge.", "  merge it", "MERGE, please", '"merge"']) {
      expect(mentions(text, "merge"), text).toBe(true);
    }
  });

  it("is false for a mention in passing, a negation, or a longer word", () => {
    for (const text of ["don't merge yet", "after you merge", "merged already?", "mergers", ""]) {
      expect(mentions(text, "merge"), text).toBe(false);
    }
  });
});

describe("permitted", () => {
  it("finds the human's word newer than the pipeline's last comment", () => {
    const result = permitted(
      "apply",
      [
        c(`${P}This change adds a migration, drizzle/0015_x.sql …`, "2026-09-13T10:00:00Z"),
        c("Apply it", "2026-09-13T11:00:00Z"),
      ],
      P,
    );
    expect(result.ok).toBe(true);
    expect(result.comment.text).toBe("Apply it");
    expect(result.why).toBeNull();
  });

  it("never counts the pipeline's own comment, whatever it says", () => {
    const result = permitted("merge", [c(`${P}merge`, "2026-09-13T11:00:00Z")], P);
    expect(result.ok).toBe(false);
    expect(result.why).toContain('no reply beginning with "merge"');
  });

  it("reads only the newest reply, so a word taken back grants nothing", () => {
    const result = permitted(
      "merge",
      [c("merge", "2026-09-13T10:00:00Z"), c("wait, don't merge yet", "2026-09-13T11:00:00Z")],
      P,
    );
    expect(result.ok).toBe(false);
    expect(result.why).toContain("as the newest reply");
    expect(
      permitted(
        "merge",
        [c("not yet", "2026-09-13T10:00:00Z"), c("merge", "2026-09-13T11:00:00Z")],
        P,
      ).ok,
    ).toBe(true);
  });

  it("treats a word older than the pipeline's last comment as consumed", () => {
    const result = permitted(
      "merge",
      [c("merge", "2026-09-13T10:00:00Z"), c(`${P}Merged into main at x.`, "2026-09-13T11:00:00Z")],
      P,
    );
    expect(result.ok).toBe(false);
  });
});

describe("shapeOf and awaitingMigration", () => {
  const thread = (comments) => readThread(comments, P);
  const migration = c(
    `${P}This change adds a migration, drizzle/0015_x.sql …`,
    "2026-09-13T10:00:00Z",
  );

  it("is merge only at Review, and only on the word", () => {
    const merge = thread([c("merge", "2026-09-13T11:00:00Z")]);
    expect(shapeOf("Review", merge)).toBe("merge");
    expect(shapeOf("Decision", merge)).toBe("assess");
    expect(shapeOf("Review", thread([c("print JSON instead", "2026-09-13T11:00:00Z")]))).toBe(
      "assess",
    );
  });

  it("is apply only at Decision on a migration question, and only on the word", () => {
    const apply = thread([migration, c("apply", "2026-09-13T11:00:00Z")]);
    expect(awaitingMigration(apply)).toBe(true);
    expect(shapeOf("Decision", apply)).toBe("apply");
    expect(shapeOf("Review", apply)).toBe("assess");
    const wording = thread([
      c(`${P}I've stopped on the wording.`, "2026-09-13T10:00:00Z"),
      c("apply", "2026-09-13T11:00:00Z"),
    ]);
    expect(awaitingMigration(wording)).toBe(false);
    expect(shapeOf("Decision", wording)).toBe("assess");
  });

  it("is assess with nothing unanswered, and assess when the newest reply takes the word back", () => {
    expect(shapeOf("Review", thread([]))).toBe("assess");
    expect(
      shapeOf(
        "Review",
        thread([c("merge", "2026-09-13T10:00:00Z"), c("hold on", "2026-09-13T11:00:00Z")]),
      ),
    ).toBe("assess");
  });
});
