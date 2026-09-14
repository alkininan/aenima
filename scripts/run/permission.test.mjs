import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claim } from "./claim.mjs";
import { verify } from "./permission.mjs";

const P = "⟡ ";
const c = (text, created_time) => ({ text, created_time });
const board = () => ({ prefix: P, tasks_ds: "ds" });
const marker = () => ({ task: "T0.11", page: "page-1", branch: "t0-11" });
const page = async () => ({ Name: "T0.11 Comments", Status: "Review" });
const decision = async () => ({ Name: "T0.11 Comments", Status: "Decision" });
const MIGRATION = `${P}This change adds a migration, drizzle/0015_x.sql, and applying it is your call.`;
const stub = (comments, extra = {}) => ({
  marker,
  token: () => "t",
  board,
  comments: async () => comments,
  page,
  ...extra,
});

// TC3 → AC3 and TC4 → AC4, the stubbed API. The guard asks this before it lets a merge or a
// migrate through; each of the things it needs is a separate refusal with a reason.
describe("verify", () => {
  it("grants the word when the human's newest reply begins with it, after the run's last comment", async () => {
    const result = await verify("apply", {
      deps: stub([c(MIGRATION, "2026-09-13T10:00:00Z"), c("apply", "2026-09-13T11:00:00Z")], {
        page: decision,
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.comment.text).toBe("apply");
    expect(result.marker.task).toBe("T0.11");
  });

  // Review pass 3, Must 2: the word is granted at the state it is for, the same test the
  // preflight's `shapeOf` reads — never on the word alone.
  it("refuses the word at a state it is not for — merge on a task In progress, apply on a wording question", async () => {
    const inProgress = async () => ({ Name: "T0.12 Helpers", Status: "In progress" });
    const merge = await verify("merge", {
      deps: stub(
        [c("Merge the two helpers into one, they duplicate each other", "2026-09-13T11:00:00Z")],
        { page: inProgress },
      ),
    });
    expect(merge.ok).toBe(false);
    expect(merge.why).toContain("at In progress");
    expect(merge.why).toContain("a task at Review");

    const apply = await verify("apply", {
      deps: stub(
        [
          c(`${P}I've stopped on the wording.`, "2026-09-13T10:00:00Z"),
          c("apply", "2026-09-13T11:00:00Z"),
        ],
        { page: decision },
      ),
    });
    expect(apply.ok).toBe(false);
    expect(apply.why).toContain("waiting on a migration question");
  });

  it("refuses the same word from the pipeline's own comment — the model cannot grant itself", async () => {
    const result = await verify("merge", {
      deps: stub([c(`${P}merge`, "2026-09-13T11:00:00Z")]),
    });
    expect(result.ok).toBe(false);
    expect(result.why).toContain('did not find "merge"');
  });

  it("refuses a human reply older than the run's last comment — a word once consumed", async () => {
    const result = await verify("merge", {
      deps: stub([
        c("merge", "2026-09-13T09:00:00Z"),
        c(`${P}Merged into main.`, "2026-09-13T10:00:00Z"),
      ]),
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a word the human took back — only the newest reply counts", async () => {
    const result = await verify("merge", {
      deps: stub([
        c("merge", "2026-09-13T10:00:00Z"),
        c("wait, don't merge yet", "2026-09-13T11:00:00Z"),
      ]),
    });
    expect(result.ok).toBe(false);
  });

  // The branch a merge must match comes from the board's own name for the task, so a marker
  // written with another task's branch merges nothing of that other task's.
  it("derives the task's branch from its name on the board, not from the marker", async () => {
    const result = await verify("merge", {
      deps: stub([c("merge", "2026-09-13T11:00:00Z")], {
        marker: () => ({ task: "T0.11", page: "page-1", branch: "t0-12" }),
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.task).toEqual({ name: "T0.11 Comments", status: "Review", branch: "t0-11" });
  });

  it("says the branch is unknown when the task's name carries no ID", async () => {
    const result = await verify("merge", {
      deps: stub([c("merge", "2026-09-13T11:00:00Z")], {
        page: async () => ({ Name: "Restrict Vercel's database role", Status: "Review" }),
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.task.branch).toBeNull();
  });

  it("refuses without a marker: no claimed task, no thread to read", async () => {
    const result = await verify("merge", { deps: { marker: () => null } });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("no run marker");
  });

  it("refuses without the token, naming the variable and the file", async () => {
    const result = await verify("merge", { deps: { marker, token: () => null } });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("NOTION_TOKEN is not in .env.local");
  });

  it("refuses when the API cannot be read, with the API's own status", async () => {
    const result = await verify("merge", {
      deps: stub([], {
        comments: async () => {
          throw new Error("Notion API GET /comments answered 403");
        },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("answered 403");
  });

  it("grants only the two words the board can say", async () => {
    const result = await verify("deploy", { deps: stub([]) });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("not a word the board grants");
  });

  describe("reads the real marker and the real token file", () => {
    let repo;
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    beforeAll(() => {
      repo = mkdtempSync(join(tmpdir(), "aenima-permission-"));
      git("init", "-q", "-b", "main");
      writeFileSync(join(repo, ".env.local"), "NOTION_TOKEN=ntn_test\n");
    });
    afterAll(() => rmSync(repo, { recursive: true, force: true }));

    it("finds the claimed task's page through the marker and the token through .env.local", async () => {
      expect((await verify("merge", { dir: repo })).why).toContain("no run marker");
      claim({ task: "T0.11", page: "pg", branch: "t0-11" }, { cwd: repo, env: {} });
      const pages = [];
      const comments = async (id) => {
        pages.push(id);
        return [c("Merge it", "2026-09-13T11:00:00Z")];
      };
      const result = await verify("merge", { dir: repo, deps: { board, comments, page } });
      expect(pages).toEqual(["pg"]);
      expect(result.ok).toBe(true);
      expect(result.task.branch).toBe("t0-11");
    });
  });
});
