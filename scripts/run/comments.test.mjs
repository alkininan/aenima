import { describe, expect, it } from "vitest";

import {
  awaitingMigration,
  CLARIFYING_CAP,
  compose,
  KINDS,
  kindOf,
  mayPost,
  mentions,
  permitted,
  readThread,
  shapeOf,
} from "./comments.mjs";

const P = "⟡ ";
const c = (text, created_time) => ({ text, created_time });

/** Fields for every kind, so each composes as a run would post it. */
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
  readied: {},
  waiting: { blockers: ["T3.1"] },
  cycle: { members: ["T3.1", "T3.2"] },
  urgent: { count: 3 },
  refused: {
    what: "Your merge of T0.13",
    why: "GitHub says the pull request no longer merges cleanly into main",
    files: ["docs/guidelines.md", "scripts/run/README.md"],
    settle:
      'Merging main into the branch and settling those two would do it; say "default" and the next run does that and brings it back to Review',
  },
};

/** A thread as the API hands it back: one comment a minute, in the order given. */
const timeline = (...texts) =>
  texts.map((text, i) => c(text, `2026-09-15T10:${String(i).padStart(2, "0")}:00.000Z`));

const said = (kind, fields = all[kind]) => compose(kind, fields, P);

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
    const question = said("decision");
    expect(readThread(timeline(question), P).clarifyingRounds).toBe(0);
    expect(readThread(timeline(question, "hm", said("clarifying")), P).clarifyingRounds).toBe(1);
  });

  // T0.20 Build 2: each composed comment carries its kind.
  it("reads each pipeline comment's kind from its own words", () => {
    const thread = readThread(timeline(said("decision"), "which?", said("clarifying")), P);
    expect(thread.pipeline.map((x) => x.kind)).toEqual(["decision", "clarifying"]);
  });

  it("reads an empty thread without inventing anything", () => {
    expect(readThread([], P)).toMatchObject({ unanswered: [], clarifyingRounds: 0 });
  });

  it("does not mistake a comment that merely mentions the glyph for a pipeline one", () => {
    const thread = readThread([c(`the ${P}glyph is fine`, "2026-09-01T10:00:00Z")], P);
    expect(thread.pipeline).toEqual([]);
    expect(thread.human).toHaveLength(1);
  });
});

// T0.20. A comment carries its kind in its own words: the fixed part of the sentence the
// composer wrote. `kindOf` reads it back from the text the API returns, so the cap can count
// clarifying rounds and nothing else, and a claim can be held to one comment of a kind.
describe("kindOf", () => {
  // T0.20 Build 2
  it("reads back the kind of every composed comment, every variant", () => {
    const variants = [
      ...Object.entries(all),
      ["stale", { date: "9 September", branch: null }],
      ["waiting", { blockers: ["T3.1", "T3.2"] }],
      ["cycle", { members: ["T3.1", "T3.2", "T3.3"] }],
      ["cycle", { members: ["T3.1"] }],
      ["refused", { ...all.refused, files: ["docs/guidelines.md"] }],
      ["refused", { ...all.refused, files: [] }],
    ];
    for (const [kind, fields] of variants) {
      expect(kindOf(compose(kind, fields, P), P), `${kind} ${JSON.stringify(fields)}`).toBe(kind);
    }
  });

  // T0.20 Build 2, and TC6 → AC6's premise: the comments already on the board read by kind.
  it("reads the comments already on the board, written before kinds were read", () => {
    // The stops on T0.13's and T0.12's threads, shortened from what the API returned on
    // 2026-09-15 (T0.13's whole thread is threads.test.mjs's AC6 fixture).
    expect(
      kindOf(
        `${P}I've stopped on the Vercel step. Production's DATABASE_URL on Vercel still names the admin role, and only you can change it. If you say "default" I'll take that as done and go on to the check and the §5 line.`,
        P,
      ),
    ).toBe("decision");
    expect(
      kindOf(
        `${P}I've stopped on your merge, because the pull request no longer merges cleanly into main. If you say "default" I'll merge main into the branch.`,
        P,
      ),
    ).toBe("decision");
  });

  // T0.20 Build 2: no kind is invented for words no composer wrote.
  it("is null for a human comment and for a prefixed comment no composer wrote", () => {
    expect(kindOf("Thanks, I read that, but it still fits two readings: a, or b.", P)).toBeNull();
    expect(kindOf(`${P}clarify 1`, P)).toBeNull();
    expect(kindOf("", P)).toBeNull();
  });

  // T0.20 Build 2 (review pass 2, Should 4): a claim's one default comment may list its choices
  // on lines of their own.
  it("reads a default whose choice runs over several lines", () => {
    const listed = compose(
      "default",
      { gap: "The ticket is silent on three things.", choice: "these:\n- one\n- two\n- three" },
      P,
    );
    expect(kindOf(listed, P)).toBe("default");
  });

  // T0.20 Build 2 (review pass 1, Should 8): a refusal quoting another kind's words is still a
  // refusal — the signatures a caller's words could reach are anchored at both ends.
  it("reads a refusal as a refusal when its reason quotes a loop or a default", () => {
    const quoting = compose(
      "refused",
      {
        what: "Claiming T3.1",
        why: "T3.1 and T3.2 are each waiting on the other in Blockers, so no run can pick either. A wrong guess here costs nothing to change, so I went with the first",
        settle: "Take one out of the other's Blockers",
      },
      P,
    );
    expect(kindOf(quoting, P)).toBe("refused");
  });
});

// T0.20. The one place that says whether the run may post a comment of a kind on a thread;
// the preflight reads it for a clarifying round and the guard reads it for every comment.
describe("mayPost", () => {
  // T0.20 TC1 → AC1
  it("silences a third clarifying round on one question, and nothing else", () => {
    const thread = readThread(
      timeline(said("decision"), "which?", said("clarifying"), "this?", said("clarifying"), "or?"),
      P,
    );
    expect(thread.clarifyingRounds).toBe(CLARIFYING_CAP);
    expect(mayPost(thread, "clarifying").ok).toBe(false);
    expect(mayPost(thread, "clarifying").why).toContain("two clarifying rounds");
    expect(thread.unanswered).toHaveLength(1);
    for (const kind of KINDS.filter((k) => k !== "clarifying")) {
      expect(mayPost(thread, kind).ok, kind).toBe(true);
    }
    const below = readThread(timeline(said("decision"), "which?", said("clarifying"), "?"), P);
    expect(mayPost(below, "clarifying").ok).toBe(true);
  });

  // T0.20 TC1 → AC1 (review pass 1, Must 1): a notice step 1 posts between the rounds and the
  // next reply asks and answers nothing, so the question is still the one the rounds were on.
  it("keeps the cap through a notice about the board's order", () => {
    for (const notice of ["waiting", "cycle", "urgent"]) {
      const thread = readThread(
        timeline(
          said("decision"),
          "which?",
          said("clarifying"),
          "this?",
          said("clarifying"),
          said(notice),
          "or?",
        ),
        P,
      );
      expect(thread.clarifyingRounds, notice).toBe(CLARIFYING_CAP);
      expect(mayPost(thread, "clarifying").ok, notice).toBe(false);
    }
  });

  // T0.20 TC2 → AC2
  it("still lets a task with five routine notices hear a clarifying round", () => {
    const thread = readThread(
      timeline(
        said("waiting"),
        said("urgent"),
        said("default"),
        said("gated"),
        said("stale"),
        "I don't follow the gated part",
      ),
      P,
    );
    expect(thread.clarifyingRounds).toBe(0);
    expect(mayPost(thread, "clarifying")).toEqual({ ok: true, why: null });
  });

  // T0.20 TC3 → AC3, the cap's half: a refusal reports on a capped thread.
  it("posts a refusal on a thread the cap has silenced", () => {
    const capped = readThread(
      timeline(said("decision"), "a", said("clarifying"), "b", said("clarifying"), "merge"),
      P,
    );
    expect(mayPost(capped, "clarifying").ok).toBe(false);
    expect(mayPost(capped, "refused")).toEqual({ ok: true, why: null });
  });

  // T0.20 TC4 → AC4
  it("holds one claim to one comment of a kind, and only from the claim's start", () => {
    const thread = readThread(
      [
        c(said("default"), "2026-09-15T09:00:00.000Z"),
        c("ok", "2026-09-15T09:30:00.000Z"),
        c(said("default"), "2026-09-15T10:03:00.000Z"),
      ],
      P,
    );
    const since = "2026-09-15T10:00:12.345Z";
    const again = mayPost(thread, "default", { since });
    expect(again.ok).toBe(false);
    expect(again.why).toContain("default");
    expect(mayPost(thread, "gated", { since }).ok).toBe(true);
    // Before this claim began the earlier default was another claim's.
    expect(mayPost(thread, "default", { since: "2026-09-15T10:04:00.000Z" }).ok).toBe(true);
    // With no claim on this thread there is no claim to hold it to.
    expect(mayPost(thread, "default").ok).toBe(true);
  });

  // T0.20 TC4 → AC4. The API gives a comment's time to the minute: one posted a few seconds after the claim
  // began reads as older than the claim, and is still the claim's.
  it("reads a comment in the claim's first minute as the claim's", () => {
    const thread = readThread([c(said("default"), "2026-09-15T10:00:00.000Z")], P);
    expect(mayPost(thread, "default", { since: "2026-09-15T10:00:41.000Z" }).ok).toBe(false);
  });

  // T0.20 TC5 → AC5
  it("starts the count again once a reply has been answered as anything but unclear", () => {
    const answered = readThread(
      timeline(
        said("decision"),
        "a",
        said("clarifying"),
        "b",
        said("clarifying"),
        "use the first one",
        said("resolved"),
      ),
      P,
    );
    expect(answered.clarifyingRounds).toBe(0);
    expect(mayPost(answered, "clarifying").ok).toBe(true);
    const next = readThread(
      timeline(
        said("decision"),
        "a",
        said("clarifying"),
        "b",
        said("clarifying"),
        "c",
        said("decision"),
        "d",
        said("clarifying"),
        "e",
      ),
      P,
    );
    expect(next.clarifyingRounds).toBe(1);
    expect(mayPost(next, "clarifying").ok).toBe(true);
  });
});

// §4 (v1.4): every comment in plain sentences, no labels, the prefix kept.
describe("compose", () => {
  const sentences = (text) =>
    text
      .replace(P, "")
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);

  /** The Urgent notice is the ticket's own sentence, one of it (T0.17 item 7). */
  const ONE_SENTENCE = new Set(["urgent"]);

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
      expect(count, `${kind}: ${text}`).toBeGreaterThanOrEqual(ONE_SENTENCE.has(kind) ? 1 : 2);
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

  // T0.17 TC3 → AC3. A human's "ready" on a Backlog task, done, with the one comment that
  // consumes the word.
  it("says the task is Ready on the human's word", () => {
    expect(compose("readied", {}, P)).toBe(
      `${P}Read that as your go, so the task is Ready. A run picks it up in its turn.`,
    );
  });

  // T0.17 TC2 → AC2 and TC5 → AC5. A skipped task says why, in words: the blocker that isn't
  // Ready, or the loop no run can pick through.
  it("says which blockers a skipped task waits on, one or several", () => {
    expect(compose("waiting", all.waiting, P)).toBe(
      `${P}This task is waiting on T3.1, which isn't Ready, so runs pass it by for now. Set it Ready or take it out of Blockers, and this task is picked up in its turn.`,
    );
    expect(compose("waiting", { blockers: ["T3.1", "T3.2", "Draft the probes"] }, P)).toBe(
      `${P}This task is waiting on T3.1, T3.2 and Draft the probes, which aren't Ready, so runs pass it by for now. Set them Ready or take them out of Blockers, and this task is picked up in its turn.`,
    );
  });

  it("names the members of a cycle, two, several, or a task that lists itself", () => {
    expect(compose("cycle", all.cycle, P)).toBe(
      `${P}T3.1 and T3.2 are each waiting on the other in Blockers, so no run can pick either. Take one out of the other's Blockers and both are picked up in their turn.`,
    );
    expect(compose("cycle", { members: ["T3.1", "T3.2", "T3.3"] }, P)).toBe(
      `${P}T3.1, T3.2 and T3.3 wait on each other in a loop through Blockers, so no run can pick any of them. Take one link out of the loop and they are picked up in their turn.`,
    );
    expect(compose("cycle", { members: ["T3.1"] }, P)).toBe(
      `${P}This task lists itself in its own Blockers, so no run can pick it. Take it out and it is picked up in its turn.`,
    );
  });

  // T0.20 TC3 → AC3, the voice's half: a step the guard let through and something else refused
  // says what was refused, which files stand in the way, and what would settle it.
  it("says what was refused, the files in conflict, and what would settle it", () => {
    expect(compose("refused", all.refused, P)).toBe(
      `${P}Your merge of T0.13 was refused: GitHub says the pull request no longer merges cleanly into main. The files in conflict are docs/guidelines.md and scripts/run/README.md. Merging main into the branch and settling those two would do it; say "default" and the next run does that and brings it back to Review.`,
    );
    expect(compose("refused", { ...all.refused, files: ["docs/guidelines.md"] }, P)).toContain(
      "The file in conflict is docs/guidelines.md.",
    );
    expect(
      compose(
        "refused",
        {
          what: "Applying drizzle/0015_x.sql",
          why: "Postgres answered: relation workspace already exists",
          settle: "The migration needs a guard on that table; the ticket stays at Decision",
        },
        P,
      ),
    ).toBe(
      `${P}Applying drizzle/0015_x.sql was refused: Postgres answered: relation workspace already exists. The migration needs a guard on that table; the ticket stays at Decision.`,
    );
  });

  // T0.17 TC4 → AC4: the ticket's sentence, verbatim.
  it("says how many tasks are Urgent and that they run in roadmap order", () => {
    expect(compose("urgent", { count: 4 }, P)).toBe(
      `${P}4 tasks are Urgent; running them in roadmap order.`,
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

  // T0.17 TC3 → AC3: ready is a word only at Backlog.
  it("is ready only at Backlog, and only on the word", () => {
    const ready = thread([c("Ready, go", "2026-09-13T11:00:00Z")]);
    expect(shapeOf("Backlog", ready)).toBe("ready");
    expect(shapeOf("Decision", ready)).toBe("assess");
    expect(shapeOf("Review", ready)).toBe("assess");
    expect(shapeOf("Backlog", thread([c("not ready yet", "2026-09-13T11:00:00Z")]))).toBe("assess");
    expect(
      shapeOf(
        "Backlog",
        thread([
          c(`${P}This task is waiting on T3.1.`, "2026-09-13T10:00:00Z"),
          c("ready", "2026-09-13T09:00:00Z"),
        ]),
      ),
    ).toBe("assess");
  });

  // T0.20 TC3 → AC3 (review pass 2, Must 2): an apply that failed says so, and the question it
  // answered is still the migration's — the human's next apply is still the word.
  it("is apply again after a refusal reported the failed apply", () => {
    const again = thread(
      timeline(
        said("migration"),
        "apply",
        said("refused", {
          what: "Applying drizzle/0013_activity_trigger.sql",
          why: "Postgres answered: relation activity already exists",
          settle: "Say apply once the table is settled",
        }),
        "apply",
      ),
    );
    expect(awaitingMigration(again)).toBe(true);
    expect(shapeOf("Decision", again)).toBe("apply");
    const refusedAlone = thread(timeline(said("refused"), "apply"));
    expect(shapeOf("Decision", refusedAlone)).toBe("assess");
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
