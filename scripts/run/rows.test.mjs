import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readRows } from "./rows.mjs";

const root = join(import.meta.dirname, "..", "..");

// T0.23 TC5 → AC5 — a run whose connector quota is spent reads the board over the token.
describe("readRows", () => {
  const board = () => ({ tasks_ds: "tasks", releases_ds: "releases" });
  const row = (Name, Status, extra = {}) => ({
    id: Name,
    url: `u/${Name}`,
    Name,
    Status,
    ...extra,
  });
  const data = {
    tasks: [
      row("T0.2 Board", "Done", { Commit: "aaaaaaa" }),
      row("T0.23 Partial reviews and mirror verification", "In progress", { Commit: "" }),
      row("T1.5 Park move and row roving", "Review", { Commit: "33ece73" }),
      row("T2.9 Applicability stability", "Review", { Commit: "6ec997b" }),
    ],
    releases: [
      row("2026-09-15 1544c5f", null, { Commit: "1544c5f", created: "2026-09-15T08:00:00.000Z" }),
      row("2026-09-16 11a0be4", null, { Commit: "11a0be4", created: "2026-09-16T11:00:00.000Z" }),
      row("2026-09-14 2fbe69b", null, { Commit: "2fbe69b", created: "2026-09-14T09:00:00.000Z" }),
    ],
  };
  const deps = { token: () => "t", board, client: { tasks: async (ds) => data[ds] } };

  it("reads the Tasks rows at one status, each with its commit", async () => {
    const result = await readRows({ status: "Review", deps });
    expect(result).toMatchObject({ token: true, source: "tasks", status: "Review" });
    expect(result.rows.map((r) => [r.Name, r.Commit])).toEqual([
      ["T1.5 Park move and row roving", "33ece73"],
      ["T2.9 Applicability stability", "6ec997b"],
    ]);
  });

  it("reads the task an ID names, and not one whose ID merely begins with the same digits", async () => {
    const result = await readRows({ id: "T0.2", deps });
    expect(result.rows.map((r) => r.Name)).toEqual(["T0.2 Board"]);
  });

  it("reads the Releases rows newest first", async () => {
    const result = await readRows({ releases: true, deps });
    expect(result).toMatchObject({ token: true, source: "releases" });
    expect(result.rows.map((r) => r.Commit)).toEqual(["11a0be4", "1544c5f", "2fbe69b"]);
  });

  it("says so and reads nothing without the token", async () => {
    const result = await readRows({ status: "Review", deps: { token: () => null } });
    expect(result).toMatchObject({ token: false, rows: [] });
    expect(result.why).toContain("NOTION_TOKEN");
  });
});

// T0.23 TC5 → AC5
describe("the connector's query quota, in the skill and guidelines §5", () => {
  const skill = readFileSync(join(root, ".claude/skills/ticket/SKILL.md"), "utf8");
  const guidelines = readFileSync(join(root, "docs/guidelines.md"), "utf8");

  it("sends a run whose connector quota is spent to the token, and has it say so", () => {
    const step0 = skill.match(/^## 0 Preflight\n[\s\S]*?(?=^## 1 )/m)?.[0] ?? "";
    expect(step0).toContain("reached the usage limit for Query Data Source");
    expect(step0).toContain('node scripts/run/rows.mjs --status "In progress"');
    expect(step0).toContain("node scripts/run/rows.mjs --releases");
    expect(step0).toContain("say so in your report line");
  });

  it("records what the run learned about the quota where the token's readers are named", () => {
    const token =
      guidelines.match(
        /^\*\*The board's token\.\*\*[\s\S]*?(?=^\*\*The capability boundary)/m,
      )?.[0] ?? "";
    expect(token).toContain("rows.mjs");
    expect(token).toContain("usage limit");
  });
});
