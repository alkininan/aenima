import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BOARD_FILE, boardIds } from "./board-ids.mjs";

const root = join(import.meta.dirname, "..");
const script = join(root, "scripts", "board-ids.mjs");
const board = JSON.parse(readFileSync(join(root, BOARD_FILE), "utf8"));
const run = (cwd) => spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });

describe("pnpm board:ids", () => {
  // TC1 → AC1. The command over the committed file: every key, one per line, file order,
  // exit 0 — and from a subdirectory too, since the file is found from the repository root.
  it("prints the keys of the committed board.json, one per line, in order", () => {
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      Object.keys(board)
        .map((key) => `${key}\n`)
        .join(""),
    );
    expect(run(join(root, "scripts")).stdout).toBe(result.stdout);

    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["board:ids"]).toBe("node scripts/board-ids.mjs");
  });

  // TC2 → AC2. Keys only: no id and not the prefix reaches the terminal.
  it("prints no value", () => {
    const out = run(root).stdout;
    for (const value of Object.values(board)) expect(out).not.toContain(String(value));
  });

  // TC3 → AC3. Pure over the text, and a non-object is refused with the file's name.
  it("refuses a document that is not an object, naming the file", () => {
    expect(boardIds('{"b": 1, "a": 2}')).toEqual(["b", "a"]);
    expect(() => boardIds("[]")).toThrow(/board\.json/);
    expect(() => boardIds("nope")).toThrow(/board\.json/);
    expect(() => boardIds("null")).toThrow(/board\.json/);
  });
});
