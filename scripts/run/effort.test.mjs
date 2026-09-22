import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_FILE, SETTINGS_FILE, readChain } from "./review-model.mjs";

/**
 * T0.27 — every run and every review at `xhigh` effort. The scheduled task's form picks a model
 * and has no effort control, so the effort is set where Claude Code reads one per invocation:
 * the `/ticket` skill's frontmatter and the reviewer's. Nothing in the repository's settings,
 * which would set every session opened here rather than only a run's.
 */

const root = join(import.meta.dirname, "..", "..");
const SKILL_FILE = ".claude/skills/ticket/SKILL.md";

/** A file's frontmatter as flat `key → value` strings; neither file nests anything. */
function frontmatter(path) {
  const text = readFileSync(join(root, path), "utf8");
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => line.match(/^([\w-]+):\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );
}

describe("run effort", () => {
  // T0.27 TC1 → AC1
  it("sets xhigh in the /ticket skill's frontmatter", () => {
    expect(frontmatter(SKILL_FILE).effort).toBe("xhigh");
  });

  // T0.27 TC1 → AC1 — the Build's "nothing in settings": the frontmatter is the only setting.
  it("sets no effort in the repository's settings", () => {
    const settings = JSON.parse(readFileSync(join(root, SETTINGS_FILE), "utf8"));
    expect(settings.effortLevel).toBeUndefined();
    expect(settings.env?.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined();
  });

  // T0.27 TC2 → AC2
  it("sets xhigh in the reviewer's frontmatter", () => {
    expect(frontmatter(AGENT_FILE).effort).toBe("xhigh");
  });

  // T0.27 TC2 → AC2
  it("leaves the reviewer's model, fallback and turn cap as they were", () => {
    const reviewer = frontmatter(AGENT_FILE);
    expect(reviewer.model).toBe("fable");
    expect(reviewer.maxTurns).toBe("30");
    expect(JSON.parse(readFileSync(join(root, SETTINGS_FILE), "utf8")).fallbackModel).toEqual([
      "opus",
    ]);
    expect(readChain(root)).toEqual(["fable", "opus"]);
  });
});
