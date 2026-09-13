import { describe, expect, it } from "vitest";

import { readBoardThreads, scan } from "./threads.mjs";

const P = "⟡ ";
const c = (text, created_time) => ({ text, created_time });
const row = (id, Name, Status) => ({ id, url: `https://n/${id}`, Name, Status });

// Step 0a since T0.11: every task's thread, one command. Only tasks with a reply the
// pipeline has not answered come back, each with the shape the words settle.
describe("scan", () => {
  const threads = {
    review: [c("print JSON instead", "2026-09-13T11:00:00Z")],
    merge: [c("Merge.", "2026-09-13T11:00:00Z")],
    answered: [c("do x", "2026-09-13T10:00:00Z"), c(`${P}I've read that`, "2026-09-13T11:00:00Z")],
    quiet: [],
    migration: [
      c(
        `${P}This change adds a migration, drizzle/0015_x.sql, and applying it …`,
        "2026-09-13T10:00:00Z",
      ),
      c("apply", "2026-09-13T11:00:00Z"),
    ],
    decision: [
      c(`${P}I've stopped on the wording.`, "2026-09-13T10:00:00Z"),
      c("apply", "2026-09-13T11:00:00Z"),
    ],
    capped: [
      c(`${P}I've stopped on x.`, "2026-09-13T08:00:00Z"),
      c(`${P}clarify 1`, "2026-09-13T09:00:00Z"),
      c(`${P}clarify 2`, "2026-09-13T10:00:00Z"),
      c("still unclear to me too", "2026-09-13T11:00:00Z"),
    ],
  };
  const commentsOf = async (id) => threads[id];
  const tasks = [
    row("review", "T1 change", "Review"),
    row("merge", "T2 merge", "Review"),
    row("answered", "T3 answered", "Backlog"),
    row("quiet", "T4 quiet", "Done"),
    row("migration", "T5 migration", "Decision"),
    row("decision", "T6 decision", "Decision"),
    row("capped", "T7 capped", "Decision"),
  ];

  it("returns only the tasks with an unanswered reply, and counts every task scanned", async () => {
    const result = await scan(tasks, commentsOf, P);
    expect(result.scanned).toBe(7);
    expect(result.threads.map((t) => t.id)).toEqual([
      "review",
      "merge",
      "migration",
      "decision",
      "capped",
    ]);
  });

  it("names the shape the words settle: merge at Review, apply on a migration, else assess", async () => {
    const { threads: found } = await scan(tasks, commentsOf, P);
    const shape = Object.fromEntries(found.map((t) => [t.id, t.shape]));
    expect(shape).toEqual({
      review: "assess",
      merge: "merge",
      migration: "apply",
      decision: "assess",
      capped: "assess",
    });
  });

  it("carries the replies, the pipeline's last word, whether a migration waits, and the cap", async () => {
    const { threads: found } = await scan(tasks, commentsOf, P);
    const migration = found.find((t) => t.id === "migration");
    expect(migration.unanswered.map((x) => x.text)).toEqual(["apply"]);
    expect(migration.lastPipeline).toContain("adds a migration");
    expect(migration.migration).toBe(true);
    expect(migration.mayPost).toBe(true);
    expect(found.find((t) => t.id === "capped").mayPost).toBe(false);
    expect(found.find((t) => t.id === "review").Status).toBe("Review");
  });

  it("does not read the word merge as a shape off a Review task", async () => {
    const { threads: found } = await scan(
      [row("m", "T8", "Backlog")],
      async () => threads.merge,
      P,
    );
    expect(found[0].shape).toBe("assess");
  });
});

describe("readBoardThreads", () => {
  it("says so, and reads nothing, when the token is not in .env.local", async () => {
    let reads = 0;
    const result = await readBoardThreads({
      deps: { token: () => null, client: { tasks: async () => (reads += 1) } },
    });
    expect(result).toMatchObject({ token: false, scanned: 0, threads: [] });
    expect(result.why).toContain("NOTION_TOKEN");
    expect(reads).toBe(0);
  });

  it("reads the Tasks data source the board names, then each task's thread", async () => {
    const asked = [];
    const client = {
      tasks: async (ds) => {
        asked.push(ds);
        return [row("a", "T1", "Review"), row("b", "T2", "Ready")];
      },
      comments: async (id) => (id === "a" ? [c("merge", "2026-09-13T11:00:00Z")] : []),
    };
    const result = await readBoardThreads({
      deps: { token: () => "t", board: () => ({ tasks_ds: "ds-1", prefix: P }), client },
    });
    expect(asked).toEqual(["ds-1"]);
    expect(result.token).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.threads.map((t) => [t.id, t.shape])).toEqual([["a", "merge"]]);
  });
});
