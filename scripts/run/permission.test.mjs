import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

import { claim } from "./claim.mjs";
import { verify } from "./permission.mjs";

const P = "⟡ ";
const c = (text, created_time) => ({ text, created_time });
const board = () => ({ prefix: P, tasks_ds: "ds" });
const marker = () => ({ task: "T0.11", page: "page-1", branch: "t0-11" });

// TC3 → AC3 and TC4 → AC4, the stubbed API. The guard asks this before it lets a merge or a
// migrate through; each of the four things it needs is a separate refusal with a reason.
describe("verify", () => {
  it("grants the word when a human reply begins with it, newer than the run's last comment", async () => {
    const comments = async () => [
      c(`${P}I've stopped on the migration.`, "2026-09-13T10:00:00Z"),
      c("apply", "2026-09-13T11:00:00Z"),
    ];
    const result = await verify("apply", { deps: { marker, token: () => "t", board, comments } });
    expect(result.ok).toBe(true);
    expect(result.comment.text).toBe("apply");
    expect(result.marker.task).toBe("T0.11");
  });

  it("refuses the same word from the pipeline's own comment — the model cannot grant itself", async () => {
    const comments = async () => [c(`${P}merge`, "2026-09-13T11:00:00Z")];
    const result = await verify("merge", { deps: { marker, token: () => "t", board, comments } });
    expect(result.ok).toBe(false);
    expect(result.why).toContain('no reply beginning with "merge"');
  });

  it("refuses a human reply older than the run's last comment — a word once consumed", async () => {
    const comments = async () => [
      c("merge", "2026-09-13T09:00:00Z"),
      c(`${P}Merged into main.`, "2026-09-13T10:00:00Z"),
    ];
    const result = await verify("merge", { deps: { marker, token: () => "t", board, comments } });
    expect(result.ok).toBe(false);
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
    const comments = async () => {
      throw new Error("Notion API GET /comments answered 403");
    };
    const result = await verify("merge", { deps: { marker, token: () => "t", board, comments } });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("answered 403");
  });

  it("grants only the two words the board can say", async () => {
    const result = await verify("deploy", { deps: { marker, token: () => "t", board } });
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
      const comments = async (page) => {
        pages.push(page);
        return [c("Merge it", "2026-09-13T11:00:00Z")];
      };
      const result = await verify("merge", { dir: repo, deps: { board, comments } });
      expect(pages).toEqual(["pg"]);
      expect(result.ok).toBe(true);
      expect(result.marker.branch).toBe("t0-11");
    });
  });
});
