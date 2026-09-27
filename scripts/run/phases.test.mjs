import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { route } from "./route.mjs";

/**
 * T0.44 — the run is an orchestrator and a subagent per phase. What can be checked without a
 * live run: each phase's agent file exists with its tools and its effort, the protocol text it
 * carries was moved out of the skill rather than rewritten, and the skill kept steps 0 and 1
 * and the orchestration between phases.
 */

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const SKILL = ".claude/skills/ticket/SKILL.md";
const agent = (name) => `.claude/agents/${name}.md`;

/** The skill as it stood before T0.44, the text the phases were moved out of. */
const BEFORE = "a76a501";

/** A file's frontmatter as flat `key → value` strings, and its body. */
function parts(path) {
  const text = read(path);
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front = Object.fromEntries(
    (match?.[1] ?? "")
      .split("\n")
      .map((line) => line.match(/^([\w-]+):\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );
  return { front, body: match?.[2] ?? "" };
}

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);

/** Paragraphs, whitespace folded, so a moved paragraph matches whatever its new line width. */
const paragraphs = (text) =>
  String(text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
const fold = (text) => String(text).replace(/\s+/g, " ");

/**
 * The paragraphs of the old steps 2–9 the ticket rewrote on purpose, each with the Build item
 * that rewrote it. Everything else moved verbatim.
 */
const REWRITTEN = new Map([
  ["## 5 Review", "Build 1: step 5 is the orchestrator's review loop, under ## 2–9 The phases"],
  [
    "Invoke the `reviewer` subagent with the ticket file path and nothing else.",
    "Build 2 and 4: the reviewer is handed the pass as well, which scopes what it reads",
  ],
  [
    "`stop: false` → the call was refused for credits or availability:",
    "Build 2: a stopped review goes to the closer, which posts it; the message carries the pass",
  ],
  [
    "Each finding is tagged **Must** or **Should**. Fix every Must, then re-invoke.",
    "Build 4: pass 3 reads only pass 2's Musts, a Must there stops at Decision, Shoulds go to one task",
  ],
]);

describe("T0.44 — phases as subagents", () => {
  // TC1 → AC1: each phase is an agent file with its own tools.
  it("gives each phase an agent file with the tools the ticket names", () => {
    const planner = parts(agent("planner")).front;
    expect(list(planner.disallowedTools)).toEqual(expect.arrayContaining(["Edit", "Write"]));
    const closer = parts(agent("closer")).front;
    expect(list(closer.disallowedTools)).toEqual(expect.arrayContaining(["Edit", "Write"]));
    for (const name of ["builder", "builder-medium"]) {
      expect(list(parts(agent(name)).front.tools)).toEqual([
        "Read",
        "Grep",
        "Glob",
        "Edit",
        "Write",
        "Bash",
      ]);
    }
    for (const name of ["reviewer", "reviewer-medium"]) {
      expect(list(parts(agent(name)).front.disallowedTools)).toEqual(
        expect.arrayContaining(["Edit", "Write"]),
      );
    }
    for (const name of [
      "planner",
      "builder",
      "builder-medium",
      "reviewer",
      "reviewer-medium",
      "closer",
    ]) {
      expect(parts(agent(name)).front.name).toBe(name);
    }
  });

  // TC5 → AC5: an effort is a frontmatter, since the Agent tool takes none per invocation.
  it("runs the planner and the closer at xhigh, and the builder and the reviewer at either", () => {
    const effort = (name) => parts(agent(name)).front.effort;
    expect(effort("planner")).toBe("xhigh");
    expect(effort("closer")).toBe("xhigh");
    expect(effort("builder")).toBe("xhigh");
    expect(effort("reviewer")).toBe("xhigh");
    expect(effort("builder-medium")).toBe("medium");
    expect(effort("reviewer-medium")).toBe("medium");
  });

  // TC5 → AC5: two frontmatters over one body, so the two efforts cannot drift apart.
  it("keeps each medium agent's body identical to its xhigh twin's, and its model", () => {
    for (const name of ["builder", "reviewer"]) {
      const high = parts(agent(name));
      const medium = parts(agent(`${name}-medium`));
      expect(medium.body).toBe(high.body);
      expect(medium.front.model).toBe(high.front.model);
      expect(medium.front.maxTurns).toBe(high.front.maxTurns);
    }
  });

  // TC5 → AC5: every agent a route can name is a file the orchestrator can invoke.
  it("has a file for every agent the route table can name", () => {
    const table = JSON.parse(read(".claude/board.json"));
    for (const type of ["Fix", "Feature", null]) {
      for (const paths of [[], ["scripts/run/x.mjs"]]) {
        const { agents } = route({ type, paths }, table);
        for (const name of Object.values(agents))
          expect(existsSync(join(root, agent(name)))).toBe(true);
      }
    }
  });

  // TC1 → AC1: the skill keeps steps 0 and 1 and the orchestration; the steps moved out.
  it("leaves the skill steps 0 and 1 and the orchestration, and each step in one phase file", () => {
    const skill = read(SKILL);
    expect(skill).toContain("## 0 Preflight");
    expect(skill).toContain("## 1 Claim");
    expect(skill).toContain("## 2–9 The phases");
    const homes = {
      "## 2 Inline": "planner",
      "## 3 Branch": "builder",
      "## 4 Build": "builder",
      "## 6 Migration": "closer",
      "## 7 Gate": "closer",
      "## 8 Report": "closer",
      "## 9 Close": "closer",
    };
    for (const [heading, home] of Object.entries(homes)) {
      expect(skill, heading).not.toContain(`${heading}\n`);
      for (const name of ["planner", "builder", "closer"]) {
        expect(read(agent(name)).includes(`${heading}\n`), `${heading} in ${name}`).toBe(
          name === home,
        );
      }
    }
    for (const phase of ["plan", "build", "review", "close"]) {
      expect(skill).toContain(`\`${phase}\``);
    }
    expect(skill).toContain("node scripts/run/phase.mjs");
    expect(skill).toContain("node scripts/run/route.mjs");
    expect(skill).toContain("node scripts/run/review-cap.mjs");
    expect(skill).toContain("run_in_background: false");
  });

  // TC1 → AC1, and the Rules: a phase's protocol text moves, it is not rewritten.
  it("moved every paragraph of the old steps 2 to 9 verbatim, bar the ones the ticket rewrote", () => {
    const old = execFileSync("git", ["show", `${BEFORE}:${SKILL}`], {
      cwd: root,
      encoding: "utf8",
    });
    const from = old.indexOf("## 2 Inline");
    expect(from).toBeGreaterThan(0);
    const now = fold(
      [SKILL, agent("planner"), agent("builder"), agent("closer"), agent("reviewer")]
        .map(read)
        .join("\n\n"),
    );
    const missing = paragraphs(old.slice(from)).filter(
      (p) => !now.includes(p) && ![...REWRITTEN.keys()].some((start) => p.startsWith(start)),
    );
    expect(missing).toEqual([]);
    // And the rewritten ones really are rewritten: none of them survives as it was.
    for (const start of REWRITTEN.keys()) {
      const was = paragraphs(old.slice(from)).find((p) => p.startsWith(start));
      expect(was, start).toBeDefined();
      expect(now.includes(was), start).toBe(false);
    }
  });

  // TC1 → AC1: the closer posts under the same comment rules the orchestrator does.
  it("hands the closer the skill's comment rules word for word", () => {
    const rules = (text) => {
      const start = text.indexOf("**Every comment you post is composed by");
      const end = text.indexOf("comment is how the next run knows the reply was read.");
      return text.slice(start, end);
    };
    expect(rules(read(SKILL)).length).toBeGreaterThan(500);
    expect(rules(read(agent("closer")))).toBe(rules(read(SKILL)));
  });

  // TC1 → AC1, Build 5: the Stop gate fires on the orchestrator's Stop alone. A subagent's end
  // is SubagentStop, which runs no suite, so four phases do not cost four suites.
  it("runs the gate on the orchestrator's Stop and on no subagent's", () => {
    const hooks = JSON.parse(read(".claude/settings.json")).hooks;
    expect(JSON.stringify(hooks.Stop)).toContain("scripts/hooks/gate.mjs");
    expect(hooks.SubagentStop).toBeUndefined();
    expect(JSON.stringify(hooks.PreToolUse)).not.toContain("gate.mjs");
  });

  // TC1 → AC1, Build 2: each phase hands back one typed last line.
  it("names each phase's typed last line in its own file", () => {
    expect(read(agent("planner"))).toMatch(/`planned`.*`stopped <reason>`/s);
    expect(read(agent("builder"))).toMatch(/`built <commit>`.*`stopped <reason>`/s);
    expect(read(agent("reviewer"))).toMatch(/`PASS`, or `FINDINGS <n>`/);
    expect(read(agent("closer"))).toMatch(/`closed <commit>`.*`stopped <reason>`/s);
  });
});

// T0.44 TC6 → AC6: the documents say what the run now is, and say they changed.
describe("T0.44 — the documents", () => {
  const section = (text, heading, next) => {
    const start = text.indexOf(heading);
    const end = next ? text.indexOf(next, start + heading.length) : -1;
    return text.slice(start, end === -1 ? undefined : end);
  };
  const guidelines = read("docs/guidelines.md");
  const guide = read("docs/build-guide.md");

  it("names the Runs row's phase columns and its route in guidelines §2", () => {
    const runs = section(guidelines, "### Runs", "### Documents");
    expect(runs).toContain("| Plan · Build · Review · Gate · Close | number |");
    expect(runs).toContain("| Route | select | medium · xhigh · fallback |");
    expect(runs).toContain("the five sum to Tokens");
  });

  it("says the phases, the marker's phase, the cap and the route in guidelines §5", () => {
    const five = section(guidelines, "## 5. Run protocol", "## 6. Cutting tickets");
    for (const words of [
      "**Phases.**",
      "planner",
      "builder",
      "closer",
      "rule (j)",
      "scripts/run/phase.mjs",
      "three passes maximum, counted in code",
      "a Must pass 3 still finds stops at Decision",
      "`Shoulds from <id>`",
      "**The route**",
      "`builder-medium`",
      "`fallback` at xhigh",
    ]) {
      expect(five, words).toContain(words);
    }
  });

  it("says in build-guide §2 how a phase is run by hand", () => {
    const two = section(guide, "## 2. How to run a ticket", "## 3.");
    expect(two).toContain("**A run is phases, and so is a ticket run by hand.**");
    expect(two).toContain("node scripts/run/phase.mjs build");
    expect(two).toContain("node scripts/run/review-cap.mjs");
  });

  it("bumps both documents' versions and notes the change in their headers", () => {
    expect(guidelines.slice(0, 600)).toMatch(
      /^<!-- guidelines\.md · v1\.31 · in the repo · phases as subagents \(T0\.44\)/,
    );
    expect(guide.slice(0, 600)).toMatch(
      /^<!-- build-guide\.md · v2\.11 · in the repo · .*\(T0\.44\)/s,
    );
  });
});
