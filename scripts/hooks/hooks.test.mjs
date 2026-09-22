import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * T0.16 TC4 → AC4. The guard and the gate in `.claude/settings.json` run the copy of
 * `scripts/` on `origin/main`, never the checkout's: a run that edits its own guard changes
 * nothing until a human merges it. This runs the command exactly as settings.json holds
 * it, against a fixture where the checkout's guard has been edited to allow everything.
 */

const root = join(import.meta.dirname, "..", "..");
const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
const commandOf = (event, matcher) =>
  settings.hooks[event].find((entry) => (matcher ? entry.matcher === matcher : true)).hooks[0]
    .command;

describe("the hook commands in .claude/settings.json", () => {
  let fixture;
  let work;
  const sh = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const hook = (command, payload, env = {}) =>
    spawnSync("sh", ["-c", command], {
      cwd: work,
      encoding: "utf8",
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: work, ...env },
    });
  const bash = (command) => ({ tool_name: "Bash", tool_input: { command }, cwd: work });

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), "aenima-hooks-"));
    const src = join(fixture, "src");
    sh(fixture, "init", "-q", "-b", "main", src);
    // origin/main carries this checkout's scripts/ — the copy the hook is meant to run.
    cpSync(join(root, "scripts"), join(src, "scripts"), { recursive: true });
    writeFileSync(join(src, "package.json"), "{}\n");
    sh(src, "add", "-A");
    sh(src, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "scripts");
    sh(fixture, "clone", "-q", "--bare", src, join(fixture, "origin.git"));
    work = join(fixture, "work");
    sh(fixture, "clone", "-q", join(fixture, "origin.git"), work);
    // The checkout's own guard allows everything. It must change nothing.
    writeFileSync(join(work, "scripts", "hooks", "guard.mjs"), "process.exit(0);\n");
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  it("runs the guard from origin/main, so a guard edited to allow-all still refuses db:push", () => {
    const result = hook(commandOf("PreToolUse", "Bash"), bash("pnpm db:push"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("drizzle-kit push is refused");
  });

  it("lets a harmless command through from the same copy", () => {
    const result = hook(commandOf("PreToolUse", "Bash"), bash("git status"));
    expect(result.status).toBe(0);
  });

  it("guards Edit and Write with the same command", () => {
    const result = hook(commandOf("PreToolUse", "Edit|Write"), {
      tool_name: "Write",
      tool_input: { file_path: join(work, ".env.local") },
      cwd: work,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(".env");
  });

  // T0.17 TC3 → AC3: the board's connector is guarded by the same command, so a comment the
  // run would post in the human's voice is refused by main's copy of the guard.
  it("guards the board's connector with the same command, whatever the server is called", () => {
    const entry = settings.hooks.PreToolUse.find((e) => e.matcher.includes("notion"));
    expect(entry.hooks[0].command).toBe(commandOf("PreToolUse", "Bash"));
    const matcher = new RegExp(`^(?:${entry.matcher})$`);
    for (const tool of ["notion-update-page", "notion-create-pages", "notion-create-comment"]) {
      expect(matcher.test(`mcp__a6bc5cd2-b1e4-484a-b22d-e3708b2a94f4__${tool}`), tool).toBe(true);
    }
    expect(matcher.test("mcp__a6bc5cd2-b1e4-484a-b22d-e3708b2a94f4__notion-fetch")).toBe(false);
    const result = hook(entry.hooks[0].command, {
      tool_name: "mcp__notion__notion-create-comment",
      tool_input: { page_id: "p1", markdown: "ready" },
      cwd: work,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("your voice");
  });

  // T0.18 TC1 → AC1, routes 3 and 4: the connector's duplicate, move and data-source writes
  // reach the board too, so they are guarded by the same command — in a group of their own,
  // leaving main's group for the first three as it stands.
  it("guards the connector's duplicate, move and data-source writes with the same command", () => {
    const groups = settings.hooks.PreToolUse.filter((e) => e.matcher.includes("notion"));
    const matches = (tool) =>
      groups.some((e) =>
        new RegExp(`^(?:${e.matcher})$`).test(`mcp__a6bc5cd2-b1e4-484a-b22d-e3708b2a94f4__${tool}`),
      );
    for (const tool of [
      "notion-duplicate-page",
      "notion-move-pages",
      "notion-update-data-source",
    ]) {
      expect(matches(tool), tool).toBe(true);
    }
    expect(matches("notion-fetch")).toBe(false);
    expect(matches("notion-query-data-sources")).toBe(false);
    for (const entry of groups) {
      expect(entry.hooks[0].command).toBe(commandOf("PreToolUse", "Bash"));
    }
    const result = hook(commandOf("PreToolUse", "Bash"), {
      tool_name: "mcp__notion__notion-update-data-source",
      tool_input: { data_source_id: "ds", statements: `RENAME COLUMN "Status" TO "Stage"` },
      cwd: work,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Changing a data source through the connector is refused");
  });

  // T0.18 TC1 → AC1, routes 1 and 2: the guard runs from a temporary copy of main's scripts/,
  // and a script this checkout runs is main's own only while it matches that copy byte for
  // byte. runs.mjs writes the board by design (from the SessionEnd hook); an edited one is
  // any other script.
  it("reads a script against main's copy of it from the directory the hook extracted", () => {
    const runs = join(work, "scripts", "run", "runs.mjs");
    expect(hook(commandOf("PreToolUse", "Bash"), bash("node scripts/run/runs.mjs")).status).toBe(0);
    const original = readFileSync(runs, "utf8");
    try {
      writeFileSync(runs, `${original}\n// edited in the checkout\n`);
      const result = hook(commandOf("PreToolUse", "Bash"), bash("node scripts/run/runs.mjs"));
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Writing to the Notion API from the command line");
    } finally {
      writeFileSync(runs, original);
    }
  });

  it("refuses everything rather than run nothing when origin/main cannot be read", () => {
    sh(work, "update-ref", "-d", "refs/remotes/origin/main");
    const result = hook(commandOf("PreToolUse", "Bash"), bash("git status"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not read scripts/ from origin/main");
  });

  it("runs the gate from origin/main the same way, and refuses to close rather than run nothing when it cannot", () => {
    const command = commandOf("Stop");
    expect(command).toContain("scripts/hooks/gate.mjs");
    expect(command).not.toContain("${CLAUDE_PROJECT_DIR}/scripts/hooks/gate.mjs");
    // origin/main was deleted by the test above: the gate must not let the session close.
    const result = hook(command, { session_id: "s", cwd: work });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot close");
  });
});
