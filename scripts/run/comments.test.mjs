import { describe, expect, it } from "vitest";

import { CLARIFYING_CAP, compose, readThread } from "./comments.mjs";

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
  };

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

  it("refuses a kind it does not know rather than posting something unshaped", () => {
    expect(() => compose("apology", {}, P)).toThrow("unknown comment kind");
  });
});
