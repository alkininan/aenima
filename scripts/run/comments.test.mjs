import { describe, expect, it } from "vitest";

import { CLARIFYING_CAP, decisionComment, readThread } from "./comments.mjs";

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

describe("decisionComment", () => {
  it("writes the three lines §4 requires, prefixed", () => {
    expect(
      decisionComment({
        question: "apply migration 0013 to the shared database?",
        where: "this ticket",
        default: "apply",
        prefix: P,
      }),
    ).toBe(
      `${P}Question   apply migration 0013 to the shared database?\n` +
        "Where      this ticket\n" +
        "Default    apply",
    );
  });

  it("is recognised as the pipeline's by the reader that classifies it", () => {
    const body = decisionComment({ question: "q", where: "this ticket", default: "d", prefix: P });
    expect(readThread([c(body, "2026-09-01T10:00:00Z")], P).pipeline).toHaveLength(1);
  });
});
