import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claim } from "./claim.mjs";
import { compose } from "./comments.mjs";
import { postable, reviewed, verdictOf, verify } from "./permission.mjs";

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

  // T0.17 TC3 → AC3. "ready" is read on the page the status write names — the preflight sets
  // Ready before anything is claimed, so there is no marker to find it through — and only at
  // Backlog, the one move it is for.
  it("grants ready on the page the write names, at Backlog, with no marker", async () => {
    const backlog = async (id) => ({ Name: `T3.1 page ${id}`, Status: "Backlog" });
    const seen = [];
    const deps = stub([c("ready", "2026-09-13T11:00:00Z")], {
      marker: () => null,
      page: async (id) => {
        seen.push(id);
        return backlog(id);
      },
    });
    const result = await verify("ready", { page: "page-9", deps });
    expect(result.ok).toBe(true);
    expect(seen).toEqual(["page-9"]);
    expect(result.task).toEqual({ name: "T3.1 page page-9", status: "Backlog", branch: "t3-1" });
  });

  it("refuses ready from the pipeline's own comment, at a state it is not for, or with no page named", async () => {
    const backlog = async () => ({ Name: "T3.1 Slice", Status: "Backlog" });
    const own = await verify("ready", {
      page: "p",
      deps: stub([c(`${P}ready`, "2026-09-13T11:00:00Z")], { page: backlog }),
    });
    expect(own.ok).toBe(false);
    expect(own.why).toContain('"ready" is the word for a task at Backlog');
    const decision = await verify("ready", {
      page: "p",
      deps: stub([c("ready", "2026-09-13T11:00:00Z")], {
        page: async () => ({ Name: "T3.1 Slice", Status: "Decision" }),
      }),
    });
    expect(decision.ok).toBe(false);
    expect(decision.task.status).toBe("Decision");
    const nowhere = await verify("ready", { deps: stub([c("ready", "2026-09-13T11:00:00Z")]) });
    expect(nowhere.ok).toBe(false);
    expect(nowhere.why).toContain("no page");
  });

  it("grants only the three words the board can say", async () => {
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

// T0.20 TC1 → AC1, where the board is not read: a clarifying round waits, and every other
// comment posts, whichever of the board file, the token, the page or the API was missing.
describe("postable", () => {
  const clarifying = compose("clarifying", { readings: ["a", "b"], fallback: "take a" }, P);
  const noted = compose("noted", {}, P);

  it("holds back a clarifying round and lets a note through when nothing could be read", async () => {
    const unreadable = {
      board: () => {
        throw new Error("no board.json");
      },
    };
    expect(await postable(clarifying, { page: "p", deps: unreadable })).toMatchObject({
      ok: false,
      kind: "clarifying",
    });
    expect(await postable(noted, { page: "p", deps: unreadable })).toMatchObject({ ok: true });
    const tokenless = { board, token: () => null };
    expect((await postable(clarifying, { page: "p", deps: tokenless })).why).toContain(
      "NOTION_TOKEN",
    );
    expect(await postable(clarifying, { page: null, deps: { board } })).toMatchObject({
      ok: false,
    });
    const down = {
      board,
      token: () => "t",
      comments: async () => {
        throw new Error("GET /comments answered 502");
      },
    };
    expect((await postable(clarifying, { page: "p", deps: down })).why).toContain("502");
    expect(await postable(noted, { page: "p", deps: down })).toMatchObject({ ok: true });
  });

  // T0.24 TC5 → AC5. A word outlives a refusal now, so the attempt is made again each run
  // until what stands in the way is settled; the guard is where the repeated sentence is
  // held back, and that needs the comment's own words, not only its kind.
  it("holds back a refusal the thread still carries, and lets a different one through", async () => {
    const refused = compose(
      "refused",
      {
        what: "Applying drizzle/0015_x.sql",
        why: "Postgres answered: relation workspace already exists",
        files: [],
        settle: "Say apply once the table is settled",
      },
      P,
    );
    const other = compose(
      "refused",
      {
        what: "Applying drizzle/0015_x.sql",
        why: "Postgres answered: could not connect to server",
        files: [],
        settle: "Say apply once the database is up",
      },
      P,
    );
    const deps = {
      marker: () => null,
      token: () => "t",
      board,
      comments: async () => [
        c(MIGRATION, "2026-09-20T10:00:00Z"),
        c(refused, "2026-09-20T11:00:00Z"),
      ],
    };

    expect(await postable(refused, { page: "p", deps })).toMatchObject({
      ok: false,
      kind: "refused",
    });
    expect(await postable(other, { page: "p", deps })).toMatchObject({ ok: true, kind: "refused" });
  });
});

// T0.16 TC2 → AC2 and TC3 → AC3. The guard's second door: `gh pr merge` is also allowed when
// the claimed task's reviewer verdict is on file and ends in PASS, and the diff against
// origin/main adds no migration and weakens no restraint. Both are read in code; neither is
// the model's claim.
describe("reviewed", () => {
  const passing = () => "# T0.16 — review\n\nFindings: none.\n\nPASS\n";
  const clean = () => ({ files: ["src/a.ts"], gated: [], ok: true });
  const green = () => ({ green: "h1", tree: "h1" });
  const deps = (extra = {}) => ({ marker, verdict: passing, diff: clean, gate: green, ...extra });

  it("opens on a PASS verdict for the marker's task over a diff with nothing gated", () => {
    const result = reviewed({ deps: deps() });
    expect(result.ok).toBe(true);
    expect(result.task).toEqual({ name: "T0.11", branch: "t0-11" });
    expect(result.gated).toEqual([]);
  });

  it("refuses without a marker — no claimed task, no verdict to look for", () => {
    const result = reviewed({ deps: deps({ marker: () => null }) });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("no run marker");
  });

  it("refuses when the verdict file is not there, naming where it looked", () => {
    const result = reviewed({ deps: deps({ verdict: () => null }) });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("docs/reviews/T0.11.md");
  });

  it("refuses a verdict that does not end in PASS — findings, or a PASS buried mid-file", () => {
    const findings = reviewed({ deps: deps({ verdict: () => "FINDINGS\n1. Must — x\n" }) });
    expect(findings.ok).toBe(false);
    expect(findings.why).toContain("rather than PASS");
    const buried = reviewed({ deps: deps({ verdict: () => "PASS\n\nbut also this\n" }) });
    expect(buried.ok).toBe(false);
    const empty = reviewed({ deps: deps({ verdict: () => "" }) });
    expect(empty.ok).toBe(false);
  });

  it("refuses a diff only the word merges even with the PASS, and names the rule", () => {
    // T0.21: `gated` carries the rules the diff trips, not the paths it touches.
    const gated = () => ({
      files: ["drizzle/0022_x.sql"],
      reasons: [{ rule: "it adds the migration drizzle/0022_x.sql", ungate: "apply it by hand" }],
      gated: ["it adds the migration drizzle/0022_x.sql"],
      ok: false,
    });
    const result = reviewed({ deps: deps({ diff: gated }) });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("it adds the migration drizzle/0022_x.sql");
    expect(result.why).toContain("your word");
  });

  it("refuses while the Stop gate's last green is not this tree, naming both", () => {
    const stale = reviewed({
      deps: deps({ gate: () => ({ green: "aaaaaaa1", tree: "bbbbbbb2" }) }),
    });
    expect(stale.ok).toBe(false);
    expect(stale.why).toContain("aaaaaaa");
    expect(stale.why).toContain("bbbbbbb");
    const never = reviewed({ deps: deps({ gate: () => ({ green: null, tree: "bbbbbbb2" }) }) });
    expect(never.ok).toBe(false);
    expect(never.why).toContain("none");
  });

  it("reads the verdict from docs/reviews/<id>.md in the checkout, and the last non-blank line is the verdict", () => {
    expect(verdictOf("a\nPASS\n\n  \n")).toBe("PASS");
    expect(verdictOf("PASS\nFINDINGS")).toBe("FINDINGS");
    expect(verdictOf("")).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "aenima-verdict-"));
    try {
      mkdirSync(join(dir, "docs", "reviews"), { recursive: true });
      writeFileSync(join(dir, "docs", "reviews", "T0.11.md"), "reviewed\nPASS\n");
      const result = reviewed({ dir, deps: { marker, diff: clean, gate: green } });
      expect(result.ok).toBe(true);
      // Outside a repository there is no gate record: shut.
      expect(reviewed({ dir, deps: { marker, diff: clean } }).why).toContain("Stop gate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
