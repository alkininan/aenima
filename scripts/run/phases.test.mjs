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
  // T0.46 — the gatekeeper decides the merge: the closer's steps 6 and 9 are rewritten.
  [
    "`waiting: true` → write the Report so far, commit and push the branch",
    "T0.46 Build 4 and 5: step 6 stops on nothing; the gatekeeper decides, a destructive migration its HOLD",
  ],
  [
    "`merged: true` means main came in and the tree changed",
    "T0.46 Build 7: what is judged below is the gatekeeper's verdict on the pushed commit",
  ],
  [
    "One ticket, one pull request: a reused branch already has one, and the push updated it.",
    "T0.46 Build 4 and 6: the close leg ends at the gate's green; no gated stop, no merge word",
  ],
  [
    "`ok: false` → this diff is one only the human's word merges",
    "T0.46 Build 4 and 6: a weakening no longer gates, and merge goes",
  ],
  [
    "Exit 0 is the green, written beside the marker as this tree's fingerprint",
    "T0.46 Build 4: the close leg hands back closed <commit> with the marker kept for the gatekeeper",
  ],
  [
    "The guard opens its second door on its own reading",
    "T0.46 Build 4: the door is the pair, and the head must be the gatekeeper's commit",
  ],
  [
    "Either way, release the marker: `node scripts/run/release.mjs`.",
    "T0.46 Build 4: the merge leg releases and hands back merged <commit>",
  ],
  [
    "**Never merge on your own word.** The two doors are the guard's",
    "T0.46 Build 4 and 6: one door, the pair, and no word",
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

  // TC1 → AC1, review pass 1 Must 1: a fix round does not run step 3 again, whose branch.mjs
  // would fail on the local branch and read as a stop.
  it("starts a fix round at the fix, not at the branch", () => {
    for (const name of ["builder", "builder-medium"]) {
      expect(fold(read(agent(name)))).toContain(
        "the branch is already checked out, so step 3 is not run again — start at the fix.",
      );
    }
  });

  // TC1 → AC1, Build 2: each phase hands back one typed last line.
  it("names each phase's typed last line in its own file", () => {
    expect(read(agent("planner"))).toMatch(/`planned`.*`stopped <reason>`/s);
    expect(read(agent("builder"))).toMatch(/`built <commit>`.*`stopped <reason>`/s);
    expect(read(agent("reviewer"))).toMatch(/`PASS`, or `FINDINGS <n>`/);
    expect(read(agent("closer"))).toMatch(/`closed <commit>`.*`stopped <reason>`/s);
  });
});

// T0.46 — the gatekeeper decides the merge. TC1 → AC1 and TC5 → AC5: the gatekeeper is a
// subagent that reads and writes one file; TC4 → AC4: a HOLD is a round the orchestrator counts;
// TC6 → AC6: the skill and the closer no longer read a merge word.
describe("T0.46 — the gatekeeper", () => {
  it("gives the gatekeeper an agent file at medium that reads, runs and writes one file through Bash", () => {
    const { front, body } = parts(agent("gatekeeper"));
    expect(front.name).toBe("gatekeeper");
    expect(list(front.tools)).toEqual(["Read", "Grep", "Glob", "Bash"]);
    expect(list(front.disallowedTools)).toEqual(
      expect.arrayContaining(["Edit", "Write", "NotebookEdit"]),
    );
    expect(front.effort).toBe("medium");
    expect(front.model).toBe("fable");
    for (const words of [
      "docs/gates/<id>.md",
      "git diff origin/main...HEAD",
      "docs/reviews/<id>.md",
      "node scripts/run/gated.mjs",
      "node scripts/run/migration-safety.mjs",
      "only what the ticket's Build asks",
      "every loosening",
      "stand on this commit",
      "spec sections the ticket cites",
      "every migration additive",
      "`MERGE APPLY`",
      "`HOLD`",
    ]) {
      expect(body, words).toContain(words);
    }
    expect(body).toMatch(/`MERGE`, `MERGE APPLY`, or `HOLD <n>`/);
    expect(read(".gitignore")).toContain("docs/gates/");
  });

  it("has the route name the gatekeeper's one file, which exists", () => {
    const table = JSON.parse(read(".claude/board.json"));
    for (const type of ["Fix", "Feature", null]) {
      const { agents } = route({ type, paths: [] }, table);
      expect(agents.gatekeeper).toBe("gatekeeper");
      expect(existsSync(join(root, agent(agents.gatekeeper)))).toBe(true);
    }
  });

  it("has the skill run the gatekeeper after the close leg and read gate-cap.mjs, and read merge as a note", () => {
    const skill = read(SKILL);
    expect(skill).toContain("| 9 Gate | `gate` | `gatekeeper` | `docs/tickets/<id>.md` |");
    expect(skill).toContain(
      "| 9 Merge | `close` | `closer` | `docs/tickets/<id>.md <branch> merge` |",
    );
    expect(skill).toContain(
      "node scripts/run/gate-cap.mjs docs/gates/<id>.md docs/reviews/<id>.md",
    );
    expect(skill).toContain("node scripts/run/phase.mjs <plan|build|review|gate|close>");
    expect(fold(skill)).toContain("under `## Held` in `docs/reports/<id>.md`");
    expect(skill).not.toContain("`shape: merge`");
    expect(fold(skill)).toContain(
      "A reply that begins with *merge*, at Review or anywhere, is a note that consumes nothing else",
    );
  });

  // Review pass 1 Must 3: a gatekeeper call refused for credits or availability, or stopped at
  // its turn limit, is read by review-model.mjs as the reviewer's is, from the gatekeeper's
  // own file — never a model the run picks — and a chain with no model left is a stop.
  it("has the skill read a refused or limit-stopped gatekeeper call with review-model.mjs from the gatekeeper's file", () => {
    const skill = read(SKILL);
    const gate = skill.slice(
      skill.indexOf("**The gatekeeper decides the merge**"),
      skill.indexOf("**A `stopped` line from any phase**"),
    );
    expect(gate).toContain("node scripts/run/review-model.mjs <<'EOF'");
    expect(gate).toContain('"agent":".claude/agents/gatekeeper.md"');
    expect(gate).toContain('"resumed":0');
    expect(fold(gate)).toContain("`stop: true` → the gate did not run");
    expect(gate).toContain("## Stopped");
    const four = read("docs/guidelines.md").slice(
      read("docs/guidelines.md").indexOf("**The gatekeeper replaces the word.**"),
    );
    expect(fold(four)).toContain(
      "pinned to the newest model with T0.22's fallback, `review-model.mjs` reading the chain from its own file",
    );
  });

  // Review pass 1 Must 1: a MERGE over a migration that waits is a verdict the run cannot act
  // on, and the skill and the closer say where it goes.
  it("sends a MERGE over a waiting migration to Decision in the skill and the closer", () => {
    expect(fold(read(SKILL))).toContain(
      "`next: decision` → the third HOLD, or a `MERGE` over a migration the script found waiting",
    );
    expect(fold(read(agent("closer")))).toContain(
      "or a `MERGE` the gatekeeper wrote over a migration that waits",
    );
  });

  // Review pass 1 Must 2: a merge leg refused — a conflict, the guard's binding, GitHub, the
  // apply — leaves the task at Review, and nothing re-lands it on its own; the closer and §4
  // say what moves it rather than promising a next run's close that no step makes.
  it("says a refused merge leg waits at Review for a change reply or a hand merge, and promises no re-land", () => {
    const closer = fold(read(agent("closer")));
    expect(closer).not.toContain("the next run's close, once the conflict is gone, lands it");
    expect(closer).not.toContain("the next run's close makes the attempt again");
    expect(closer).toContain("**A refusal on either leg leaves the task at `Review`");
    expect(closer).toContain("no step claims a Review task that has no new reply");
    const four = fold(read("docs/guidelines.md"));
    expect(four).toContain(
      "a merge or an apply refused at Review on the gatekeeper's verdict has no word to be made again on",
    );
    expect(four).not.toContain(
      "the word that granted the attempt is still granted and the next run makes it again once the thing in the way is settled",
    );
  });

  it("splits the closer into a close leg and a merge leg, and reads `## Held`", () => {
    const closer = fold(read(agent("closer")));
    expect(closer).toContain("**The merge leg** — handed `docs/tickets/<id>.md <branch> merge`.");
    expect(closer).toContain("`## Held`");
    expect(closer).toContain("node scripts/run/apply.mjs");
    expect(closer).toMatch(/`closed <commit>`.*`merged <commit>`.*`stopped <reason>`/s);
    expect(closer).not.toContain("the human's *merge* there is the merge");
  });

  it("tells the builder and the reviewer what a HOLD round is, in both twins", () => {
    for (const name of ["builder", "builder-medium"]) {
      expect(fold(read(agent(name)))).toContain(
        "A HOLD round is the same, handed the gatekeeper's `docs/gates/<id>.md`",
      );
    }
    for (const name of ["reviewer", "reviewer-medium"]) {
      expect(fold(read(agent(name)))).toContain("**After a HOLD** (T0.46)");
    }
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

  // T0.44 pinned v1.31 and v2.11 here; T0.46 bumps both, so the pin moves with it.
  it("bumps both documents' versions and notes the change in their headers", () => {
    expect(guidelines).toContain("phases as subagents (T0.44)");
    expect(guide).toContain("(T0.44)");
    expect(guidelines.slice(0, 600)).toMatch(
      /^<!-- guidelines\.md · v1\.32 · in the repo · the gatekeeper decides the merge \(T0\.46\)/,
    );
    expect(guide.slice(0, 600)).toMatch(
      /^<!-- build-guide\.md · v2\.12 · in the repo · .*\(T0\.46\)/s,
    );
    expect(guide).toContain("# aenima — build guide v2.12");
  });
});

// T0.46 TC6 → AC6: the documents say the gatekeeper decides the merge, and that merge goes.
describe("T0.46 — the documents", () => {
  const section = (text, heading, next) => {
    const start = text.indexOf(heading);
    const end = next ? text.indexOf(next, start + heading.length) : -1;
    return text.slice(start, end === -1 ? undefined : end);
  };
  const guidelines = read("docs/guidelines.md");
  const guide = read("docs/build-guide.md");

  it("makes §3's Review → Done one row on the pair, beside the merged-by-hand row", () => {
    const three = section(guidelines, "## 3. Status machine", "## 4.");
    const rows = three.split("\n").filter((line) => line.startsWith("| Review | Done |"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("the reviewer's PASS and the gatekeeper's MERGE");
    expect(rows[0]).toContain("a reply beginning `merge` is a note");
    expect(three).not.toContain("says `merge`");
  });

  it("names two words in §4, the gatekeeper in place of the third, and a weakening as its question", () => {
    const four = section(guidelines, "## 4. Decision protocol", "## 5.");
    expect(four).toContain("**The two words are verified in code.**");
    expect(four).toContain("**The gatekeeper replaces the word.**");
    expect(four).toContain("**`apply` is your word in one case, said as one sentence");
    expect(four).toContain("docs/gates/<id>.md");
    expect(four).not.toContain("**The three words");
    expect(four).not.toContain("**`merge` is still your word");
  });

  it("runs the gatekeeper in §5 step 9 after the PASS and the gate's green, on the pushed commit, and stops nothing at step 6", () => {
    const five = section(guidelines, "## 5. Run protocol", "## 6. Cutting tickets");
    expect(five).toContain("then the gatekeeper (T0.46)");
    expect(five).toContain("6  Migration    nothing stops here since T0.46");
    expect(five).toContain("**gatekeeper**");
    expect(five).toContain("`docs/gates/<id>.md`");
    expect(five).toContain("no word on the thread opens it (T0.46)");
    expect(five).not.toContain("waits for `merge` from you");
    expect(five).not.toContain("merge at Review → claim");
  });

  it("gains the gatekeeper in build-guide §2's hooks, reviewer and phases paragraphs", () => {
    const two = section(guide, "## 2. How to run a ticket", "## 3.");
    expect(two).toContain("**The gatekeeper is a subagent too, and it decides the merge**");
    expect(two).toContain('claude -p --agent gatekeeper "docs/tickets/<id>.md"');
    expect(two).toContain("node scripts/run/gate-cap.mjs docs/gates/<id>.md docs/reviews/<id>.md");
    expect(two).toContain("five subagents");
    expect(two).toContain("the gatekeeper's `MERGE` or `MERGE APPLY` in `docs/gates/<id>.md`");
    expect(two).not.toContain("merges on the word `merge` at Review");
  });
});
