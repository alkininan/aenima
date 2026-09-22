#!/usr/bin/env node
/**
 * Step 9 — does this diff weaken a restraint?
 *
 * T0.16 gated whole paths: the harness, the product spec, a migration. T0.21 replaces that
 * with a measurement. The human owns the documents and the running product; everything
 * between a Ready task and a deploy is the pipeline's, and re-approving a diff the ticket
 * already agreed and the reviewer already passed adds nothing. One thing genuinely still
 * needs a human, and it is not a path: a change that makes the pipeline's own restraints
 * weaker than they were.
 *
 * So the question is asked of the restraints themselves, before and after, and answered by
 * running them rather than by reading the diff:
 *
 *   guard    both copies of `decide()` are run against one fixed corpus of tool calls. A
 *            corpus entry refused by `origin/main`'s guard and allowed by this checkout's
 *            is a rule deleted or a matcher narrowed — the measurement, not an opinion.
 *   paths    both copies of `isGatedPath` are run against one fixed corpus of paths. A path
 *            gated before and not after is a path taken off the list.
 *   detector this file. A diff that edits the thing doing the measuring is gated whatever
 *            the measurement says.
 *   hooks    every hook in `origin/main`'s `.claude/settings.json` must still be there with
 *            the same command: a guard nothing invokes refuses nothing.
 *   gate     `STEPS` may not shrink, `MAX_RED` may not rise, and a deleted test file must
 *            be replaced by one naming the same criteria.
 *
 * The comparison needs two module graphs of the same file names, so each side is measured in
 * a child process — `node loosening.mjs --probe <scripts root>` — rather than by importing
 * both into one. That also keeps `gatedDiffOf` synchronous, and it means a head side that
 * does not parse fails its probe rather than crashing the guard: a restraint nobody can read
 * is not one the run may vouch for, so it reads as gated.
 *
 * The corpus is always this file's own. When the guard runs — from `origin/main`, never from
 * the checkout — that is main's corpus judging both guards, which is what stops a diff from
 * marking its own homework. Its cost is that a diff adding a guard rule is gated until the
 * corpus grows to cover it, and that is the rule the ticket asks for: a rule with no corpus
 * entry fails the check.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { emit, isMain } from "./cli.mjs";

/** This file, relative to the repository root — the detector, gated whenever the diff has it. */
export const DETECTOR = "scripts/run/loosening.mjs";

/**
 * How long one side gets to answer. Past it the side is unmeasured, and unmeasured is gated.
 * Comfortably inside the 60 s the Bash hook gives the guard, or the hook would time out first
 * and this branch would never be the one that answered (review pass 3, Should).
 */
export const PROBE_TIMEOUT_MS = 20_000;

/** Where the guard's rule letters are written: `// (a) …` down the left of `decide()`. */
const RULE_MARKER = /^[ \t]*\/\/[ \t]*\(([a-z])\)/gm;

/** The criteria a test file names, which a replacement for it has to name too. */
const CRITERION = /\b(?:AC|TC)\d+\b/g;

/** A file whose deletion has to be accounted for. */
const IS_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * The deps every corpus entry is judged under, so the two sides differ by their rules alone
 * and never by what the board, the reviewer or the repository happened to say. Nothing is
 * granted: each entry is the rule in its refusing configuration, and the measurement is
 * whether it still refuses.
 */
export const PROBE_DEPS = {
  currentBranch: () => "t0-1",
  permission: () => ({ ok: false, why: "the corpus grants nothing" }),
  verdict: () => ({ ok: false, why: "the corpus grants nothing" }),
  prBranch: () => "t0-1",
  prHead: () => "a".repeat(40),
  localHead: () => "b".repeat(40),
  revertOfTip: () => false,
  prefix: () => "⟡ ",
  posting: () => ({ ok: false, kind: "clarifying", why: "the corpus grants nothing" }),
  // No corpus entry reads the disk: an entry that runs a script hands the guard its text,
  // and no script is main's own.
  readScript: () => null,
  mainScript: () => null,
};

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const connector = (tool, toolInput) => ({
  tool_name: `mcp__abc__notion-${tool}`,
  tool_input: toolInput,
});

/**
 * One entry per thing the guard refuses, tagged with the rule letter it covers. Every letter
 * `decide()` marks must appear here or the check fails — a rule nothing measures is a rule
 * that can be deleted unseen.
 */
export const GUARD_CORPUS = [
  { name: "pnpm db:push", rule: "a", input: bash("pnpm db:push") },
  { name: "drizzle-kit push", rule: "a", input: bash("npx drizzle-kit push") },
  { name: "pnpm db:migrate with no word", rule: "b", input: bash("pnpm db:migrate") },
  { name: "vercel --prod", rule: "c", input: bash("npx vercel --prod") },
  { name: "force push", rule: "d", input: bash("git push --force origin t0-1") },
  { name: "push main", rule: "d", input: bash("git push origin main") },
  {
    name: "merge on main",
    rule: "d",
    input: bash("git merge t0-1"),
    deps: { currentBranch: () => "main" },
  },
  { name: "redirect into .env.local", rule: "e", input: bash("echo x > .env.local") },
  {
    name: "write .env.local",
    rule: "e",
    input: { tool_name: "Write", tool_input: { file_path: ".env.local" } },
  },
  { name: "gh pr merge with no word", rule: "f", input: bash("gh pr merge t0-1 --merge") },
  {
    name: "write a reviewer verdict",
    rule: "g",
    input: { tool_name: "Write", tool_input: { file_path: "docs/reviews/T0.1.md" } },
  },
  {
    name: "set a Backlog task Ready with no word",
    rule: "h",
    input: connector("update-page", { page_id: "p", properties: { Status: "Ready" } }),
    deps: {
      permission: () => ({
        ok: false,
        why: "the corpus grants nothing",
        task: { status: "Backlog", name: "T0.1 Something" },
      }),
    },
  },
  {
    name: "create a task at Ready",
    rule: "h",
    input: connector("create-pages", { pages: [{ properties: { Status: "Ready" } }] }),
  },
  {
    name: "post an unprefixed comment",
    rule: "h",
    input: connector("create-comment", { page_id: "p", markdown: "looks good to me" }),
  },
  {
    name: "post a comment the thread holds back",
    rule: "h",
    input: connector("create-comment", { page_id: "p", markdown: "⟡ Thanks, I read that" }),
  },
  { name: "duplicate a page", rule: "h", input: connector("duplicate-page", { page_id: "p" }) },
  {
    name: "move pages into a database",
    rule: "h",
    input: connector("move-pages", {
      page_or_database_ids: ["p"],
      new_parent: { type: "data_source_id", data_source_id: "ds" },
    }),
  },
  {
    name: "change a data source",
    rule: "h",
    input: connector("update-data-source", {
      data_source_id: "ds",
      statements: `ALTER COLUMN "Status" SET SELECT('Ready':green)`,
    }),
  },
  {
    name: "curl a comment to the Notion API",
    rule: "i",
    input: bash("curl -X POST https://api.notion.com/v1/comments -d @c.json"),
  },
  {
    name: "curl a status write to the Notion API",
    rule: "i",
    input: bash("curl -X PATCH https://api.notion.com/v1/pages/p -d @s.json"),
  },
  {
    name: "node -e a comment to the Notion API",
    rule: "i",
    input: bash(`node -e "fetch('https://api.notion.com/v1/comments', { method: 'POST' })"`),
  },
  {
    name: "run a script that writes the Notion API",
    rule: "i",
    input: bash("node post.mjs"),
    deps: {
      readScript: () =>
        'import { readToken } from "./scripts/run/notion.mjs";\nawait fetch("https://api.notion.com/v1/pages/p", { method: "PATCH" });\n',
    },
  },
  {
    name: "run a shell script that writes the Notion API",
    rule: "i",
    input: bash("bash ready.sh"),
    deps: { readScript: () => "curl -X PATCH https://api.notion.com/v1/pages/p -d @s.json\n" },
  },
];

/**
 * The two doors a merge and a close actually rest on, which the guard's rule table only
 * *reacts* to: `reviewed()` in `scripts/run/permission.mjs` decides whether the reviewer's
 * PASS opens a merge, and `decide()` in `scripts/hooks/gate.mjs` decides whether a red suite
 * may close a session. `PROBE_DEPS` hands the guard fixed refusals for both, so without this
 * second corpus a diff could make either answer yes to everything and self-merge, after which
 * the hooks run the gutted copy from `origin/main` (review pass 2, Must 2).
 *
 * Each entry says what must go on being refused, and runs it: `refused` is handed the two
 * functions from the side under measurement and answers whether that side still refuses.
 */
export const DOOR_CORPUS = [
  {
    name: "a merge with no run marker",
    door: "reviewed",
    refused: ({ reviewed }) => !reviewed({ dir: "/nowhere", deps: { marker: () => null } }).ok,
  },
  {
    name: "a merge with no verdict on file",
    door: "reviewed",
    refused: ({ reviewed }) =>
      !reviewed({ dir: "/nowhere", deps: { ...DOOR_OPEN, verdict: () => null } }).ok,
  },
  {
    name: "a merge whose verdict says FINDINGS",
    door: "reviewed",
    refused: ({ reviewed }) =>
      !reviewed({
        dir: "/nowhere",
        deps: { ...DOOR_OPEN, verdict: () => "## Must\n1. something\n\nFINDINGS\n" },
      }).ok,
  },
  {
    name: "a merge whose diff waits for the word",
    door: "reviewed",
    refused: ({ reviewed }) =>
      !reviewed({
        dir: "/nowhere",
        deps: {
          ...DOOR_OPEN,
          diff: () => ({ ok: false, gated: ["it adds the migration drizzle/0022_x.sql"] }),
        },
      }).ok,
  },
  {
    // Review pass 3, Must 1: every other entry hands `reviewed` a `diff`, so the line that
    // computes one — `deps.diff ? deps.diff() : gatedDiffOf({ cwd: dir })` — is outside the
    // measurement, and so is `gatedDiff`'s own `...weakened` spread. Withholding `diff` puts
    // both back inside it. The directory is deliberately no repository: `gatedDiffOf` then
    // answers from `checkoutScripts` failing, in milliseconds and with no child process, so
    // the measurement does not recurse into itself.
    name: "a merge whose diff it has to work out for itself",
    door: "reviewed",
    refused: ({ reviewed }) => {
      const { diff, ...rest } = DOOR_OPEN;
      return !reviewed({ dir: NO_REPOSITORY, deps: rest }).ok;
    },
  },
  {
    name: "a merge the Stop gate has not passed",
    door: "reviewed",
    refused: ({ reviewed }) =>
      !reviewed({
        dir: "/nowhere",
        deps: { ...DOOR_OPEN, gate: () => ({ green: "a".repeat(40), tree: "b".repeat(40) }) },
      }).ok,
  },
  {
    name: "a stop over a red first step",
    door: "gate",
    refused: ({ gateDecide }) => gateDecide(redAt(0)).exit === 2,
  },
  {
    name: "a stop over a red last step",
    door: "gate",
    refused: ({ gateDecide }) => gateDecide(redAt(-1)).exit === 2,
  },
  {
    name: "a stop over a second red in one session",
    door: "gate",
    refused: ({ gateDecide }) =>
      gateDecide({ red: 0, state: { session_id: "s", count: 1, greenHash: null } }).exit === 2,
  },
];

/** A path that is no git repository, so `gatedDiffOf` answers without measuring anything. */
const NO_REPOSITORY = "/aenima-no-such-directory";

/** The four things `reviewed` needs before it opens, so an entry can withhold exactly one. */
const DOOR_OPEN = {
  marker: () => ({ task: "T0.1", page: "p", branch: "t0-1" }),
  verdict: () => "## Findings\n\nnone\n\nPASS\n",
  diff: () => ({ ok: true, gated: [] }),
  gate: () => ({ green: "a".repeat(40), tree: "a".repeat(40) }),
};

/**
 * A Stop the gate must refuse: one step of the side's own `STEPS` is red, the rest green.
 * `red` indexes that list, so an entry follows a gate whose steps were renamed and only a
 * gate that stopped refusing a red step reads as loosened. The probe fills in the rest.
 */
const redAt = (red) => ({ red });

/** Paths `isGatedPath` must go on answering true for. */
export const PATH_CORPUS = [
  "drizzle/0015_x.sql",
  "drizzle/meta/_journal.json",
  "drizzle/0001_policies.sql",
];

/** The rule letters a guard source marks, in the order met. */
export function ruleLetters(source) {
  return [...new Set(String(source ?? "").matchAll(RULE_MARKER))].map((m) => m[1]).sort();
}

/** Rule letters with no corpus entry — the check the ticket's Rules ask for. */
export function uncovered(letters, corpus = GUARD_CORPUS) {
  const covered = new Set(corpus.map((entry) => entry.rule));
  return [...new Set(letters ?? [])].filter((letter) => !covered.has(letter)).sort();
}

/** `{ name: refused }` for one `decide`, every entry under the fixed deps plus its own. */
export function refusals(decide, corpus = GUARD_CORPUS) {
  const answers = {};
  for (const entry of corpus) {
    let refused;
    try {
      refused = decide(entry.input, { ...PROBE_DEPS, ...(entry.deps ?? {}) }) !== null;
    } catch {
      // A rule that throws on a corpus entry refuses nothing, which is the weaker answer.
      refused = false;
    }
    answers[entry.name] = refused;
  }
  return answers;
}

/** What each door is called in a sentence. */
const DOORS = { reviewed: "the guard's second door", gate: "the Stop gate" };

/** `{ name: refused }` for one side's two doors. */
export function doorRefusals(doors, corpus = DOOR_CORPUS) {
  const answers = {};
  for (const entry of corpus) {
    let refused;
    try {
      refused = Boolean(entry.refused(doors));
    } catch {
      // A door that throws on a corpus entry refuses nothing, which is the weaker answer.
      refused = false;
    }
    answers[entry.name] = refused;
  }
  return answers;
}

/** `{ path: gated }` for one `isGatedPath`. */
export function gating(isGatedPath, corpus = PATH_CORPUS) {
  return Object.fromEntries(corpus.map((path) => [path, Boolean(isGatedPath(path))]));
}

/** A reason a diff waits for the word: the rule it trips, and what would settle it. */
const reason = (rule, ungate) => ({ rule, ungate });

/** Entries refused before and allowed after — a rule deleted, or its matcher narrowed. */
export function guardLoosened(before = {}, after = {}) {
  return Object.keys(before)
    .filter((name) => before[name] && !after[name])
    .map((name) =>
      reason(
        `the guard no longer refuses ${name}`,
        `restore the rule so ${name} is refused again, or say merge here if the loosening is meant`,
      ),
    );
}

/** A door entry refused before and allowed after — the door itself opened, not the rule table. */
export function doorsLoosened(before = {}, after = {}, corpus = DOOR_CORPUS) {
  const named = new Map(corpus.map((entry) => [entry.name, entry.door]));
  return Object.keys(before)
    .filter((name) => before[name] && !after[name])
    .map((name) =>
      reason(
        `${DOORS[named.get(name)] ?? "a door"} no longer refuses ${name}`,
        "restore what it read before, or say merge here if the change is meant",
      ),
    );
}

/** Rule letters the corpus does not reach — a rule nothing measures. */
export function coverageGaps(letters = []) {
  return uncovered(letters).map((letter) =>
    reason(
      `guard rule (${letter}) has no entry in the corpus`,
      `add one to ${DETECTOR}, so a later diff cannot delete that rule unseen`,
    ),
  );
}

/** Paths gated before and not after — a path taken off the list. */
export function pathsLoosened(before = {}, after = {}) {
  return Object.keys(before)
    .filter((path) => before[path] && !after[path])
    .map((path) =>
      reason(
        `${path} is no longer a gated path`,
        "put it back in scripts/run/gated.mjs, or say merge here if the loosening is meant",
      ),
    );
}

/**
 * Every `(event, matcher)` group of a settings text, mapped to **all** its commands. Null when
 * the text does not parse. A group holds a list — `SessionEnd *` runs `release.mjs` and then
 * `runs.mjs` — so keeping one command a group would let the other be deleted unseen (review
 * pass 1, Must 2).
 */
export function hooksOf(text) {
  let settings;
  try {
    settings = JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
  const found = new Map();
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const key = `${event} ${group?.matcher ?? "*"}`;
      const commands = (Array.isArray(group?.hooks) ? group.hooks : []).map((hook) =>
        String(hook?.command ?? ""),
      );
      found.set(key, [...(found.get(key) ?? []), ...commands]);
    }
  }
  return found;
}

/** A hook named in a sentence: the script it runs, or the head of its command line. */
export function hookName(command) {
  const last = String(command ?? "")
    .match(/[\w./-]*\.mjs\b/g)
    ?.at(-1);
  if (last === undefined) {
    return String(command ?? "")
      .trim()
      .slice(0, 40);
  }
  // The hooks' commands run out of a temporary directory — `node "$d/scripts/hooks/guard.mjs"`
  // — and the shell variable is not part of the name anybody would recognise it by.
  const at = last.indexOf("scripts/");
  return at === -1 ? last : last.slice(at);
}

/** A hook of main's that is gone, or whose command is no longer main's. */
export function hooksLoosened(beforeText, afterText) {
  const before = hooksOf(beforeText);
  const after = hooksOf(afterText);
  if (before === null) {
    return [
      reason(
        "origin/main's .claude/settings.json could not be read",
        "the hooks it declares are what invoke the guard and the gate, so nothing here can be vouched for",
      ),
    ];
  }
  if (after === null) {
    return [
      reason(
        "this checkout's .claude/settings.json does not parse",
        "fix the file so the hooks it declares can be read",
      ),
    ];
  }
  // Removed and rewritten are one event from the outside: main's command is no longer invoked.
  const gone = [];
  for (const [key, commands] of before) {
    const kept = new Set(after.get(key) ?? []);
    for (const command of commands) {
      if (!kept.has(command)) {
        gone.push(
          reason(
            `the ${key} hook that runs ${hookName(command)} no longer carries main's command`,
            "restore it — a guard nothing invokes refuses nothing",
          ),
        );
      }
    }
  }
  return gone;
}

/** A package.json text's `scripts`, or null when the text does not parse. */
export function scriptsOf(text) {
  try {
    return JSON.parse(String(text ?? "")).scripts ?? {};
  } catch {
    return null;
  }
}

/**
 * The gate's steps shortened, its release count raised, or one of its commands rewritten.
 *
 * `STEPS` names the steps; the commands themselves are `package.json`'s, because the gate
 * spawns `pnpm <step>` (`scripts/hooks/gate.mjs`). A `"test": "true"` would leave STEPS three
 * long and the gate toothless, which is review pass 1's Must 1. `scripts` is each side's
 * package.json text, and a side that does not parse is not one the run can vouch for.
 */
export function gateLoosened(before = {}, after = {}) {
  const found = [];
  const beforeSteps = before.steps ?? [];
  const afterSteps = new Set(after.steps ?? []);
  for (const step of beforeSteps) {
    if (!afterSteps.has(step)) {
      found.push(
        reason(
          `the Stop gate no longer runs ${step}`,
          `put ${step} back in STEPS, in scripts/hooks/gate.mjs`,
        ),
      );
    }
  }
  const beforeScripts = scriptsOf(before.scripts);
  const afterScripts = scriptsOf(after.scripts);
  if (beforeScripts === null || afterScripts === null) {
    found.push(
      reason(
        "a package.json the gate's commands live in could not be read",
        "fix it so both sides of the gate's commands can be compared",
      ),
    );
  } else {
    for (const step of beforeSteps) {
      if (beforeScripts[step] !== afterScripts[step]) {
        found.push(
          reason(
            `the gate's ${step} command is no longer main's`,
            `restore package.json's ${step} script, or say merge here if the change is meant`,
          ),
        );
      }
    }
  }
  if (Number(after.maxRed) > Number(before.maxRed)) {
    found.push(
      reason(
        `the gate now steps aside after ${after.maxRed} reds rather than ${before.maxRed}`,
        `lower MAX_RED back to ${before.maxRed}, in scripts/hooks/gate.mjs`,
      ),
    );
  }
  return found;
}

/**
 * A test file deleted whose criteria nothing added names. `deleted` and `added` are
 * `{ path, text }`; the criteria are the `AC<n>` and `TC<n>` tokens the file writes, which is
 * how this repository's tests say what they cover.
 */
export function testsLoosened(deleted = [], added = []) {
  const kept = new Set(added.flatMap((file) => String(file.text ?? "").match(CRITERION) ?? []));
  return deleted
    .filter((file) => IS_TEST.test(file.path))
    .flatMap((file) => {
      const names = [...new Set(String(file.text ?? "").match(CRITERION) ?? [])];
      if (names.length === 0) {
        return [
          reason(
            `${file.path} is deleted and names no criterion`,
            "nothing added can be read as its replacement, so say merge here if the deletion is meant",
          ),
        ];
      }
      const orphans = names.filter((name) => !kept.has(name));
      return orphans.length === 0
        ? []
        : [
            reason(
              `${file.path} is deleted and nothing added names ${orphans.join(", ")}`,
              "add a test naming those criteria, or say merge here if the deletion is meant",
            ),
          ];
    });
}

/** The detector itself in the diff. */
export function detectorLoosened(files = []) {
  return files.includes(DETECTOR)
    ? [
        reason(
          `the diff edits the loosening detector, ${DETECTOR}`,
          "a change to what does the measuring is yours to merge, whatever it measures",
        ),
      ]
    : [];
}

/**
 * Every reason this diff waits for the word, from the two sides already measured. Pure, so
 * the whole rule set is testable without a repository.
 */
export function loosenings({
  files = [],
  guard = {},
  doors = {},
  paths = {},
  letters = [],
  settings = {},
  gate = {},
  tests = {},
} = {}) {
  return [
    ...detectorLoosened(files),
    ...guardLoosened(guard.before, guard.after),
    ...doorsLoosened(doors.before, doors.after),
    ...coverageGaps(letters),
    ...pathsLoosened(paths.before, paths.after),
    ...hooksLoosened(settings.before, settings.after),
    ...gateLoosened(gate.before, gate.after),
    ...testsLoosened(tests.deleted, tests.added),
  ];
}

const git = (args, cwd) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * A revision's `scripts/` in a temporary directory, the way the hooks read `origin/main`'s.
 *
 * Both sides are read this way, `HEAD` included: the guard's door binds the pull request's
 * head to this checkout's HEAD so that the diff it read is the diff that merges, and a
 * restraint measured from an uncommitted working tree would not be on that commit (review
 * pass 1, Should 4).
 */
function checkoutScripts(cwd, base) {
  const dir = mkdtempSync(join(tmpdir(), "aenima-loosening-"));
  const tar = join(dir, "scripts.tar");
  if (git(["archive", "-o", tar, base, "scripts"], cwd) === null) {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  try {
    execFileSync("tar", ["-xf", tar, "-C", dir], { stdio: "ignore" });
  } catch {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  return dir;
}

/**
 * One side, measured in its own process: `{ guard, paths, letters, gate }` for the `scripts/`
 * tree at `root`. Null when the side cannot be run at all — a file that does not parse, an
 * import that is not there — which reads as gated rather than as agreement.
 */
export function probe(root, { cwd = process.cwd() } = {}) {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--probe", root], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      // `loosenedBy` sits on the guard's path to `gh pr merge`. A probe that hangs would hang
      // the guard; a probe that is killed reads as a side that could not be measured, which is
      // the conservative answer (review pass 1, Should 6).
      timeout: PROBE_TIMEOUT_MS,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** `{ path, text }` for each file of `status` in the diff, read at the revision that has it. */
function filesOf(cwd, range, status, rev) {
  const out =
    git(["diff", "--name-status", "--no-renames", `--diff-filter=${status}`, range], cwd) ?? "";
  return out
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2 && parts[1].trim() !== "")
    .map((parts) => parts[1].trim())
    .map((path) => ({ path, text: git(["show", `${rev}:${path}`], cwd) }));
}

/**
 * Does the diff of `range` weaken a restraint? `{ ok, reasons }` — `ok` true when nothing
 * does. A side that cannot be measured is a reason of its own: the run vouches for what it
 * has read, and for nothing else.
 */
export function loosenedBy({
  cwd = process.cwd(),
  range = "origin/main...HEAD",
  files = null,
} = {}) {
  const base = range.split("...")[0] || "origin/main";
  const names =
    files ??
    (git(["diff", "--name-only", "--no-renames", range], cwd) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const head = range.split("...")[1] || "HEAD";
  const dirs = { before: checkoutScripts(cwd, base), after: checkoutScripts(cwd, head) };
  const unread = dirs.before === null ? base : dirs.after === null ? head : null;
  if (unread !== null) {
    for (const dir of Object.values(dirs)) {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
    }
    return {
      ok: false,
      reasons: [
        reason(
          `scripts/ could not be read from ${unread}`,
          "the restraints on one side of this diff are unknown, so nothing here can be vouched for",
        ),
      ],
    };
  }
  let before;
  let after;
  try {
    before = probe(join(dirs.before, "scripts"), { cwd });
    after = probe(join(dirs.after, "scripts"), { cwd });
  } finally {
    for (const dir of Object.values(dirs)) rmSync(dir, { recursive: true, force: true });
  }
  if (before === null) {
    return {
      ok: false,
      reasons: [
        reason(
          `the restraints at ${base} could not be run`,
          "without the before side there is nothing to compare this diff against",
        ),
      ],
    };
  }
  if (after === null) {
    return {
      ok: false,
      reasons: [
        reason(
          `the restraints at ${head} could not be run`,
          "fix scripts/hooks/guard.mjs, scripts/hooks/gate.mjs or scripts/run/gated.mjs so both sides can be measured",
        ),
      ],
    };
  }

  const reasons = loosenings({
    files: names,
    guard: { before: before.guard, after: after.guard },
    doors: { before: before.doors, after: after.doors },
    paths: { before: before.paths, after: after.paths },
    letters: [...new Set([...(before.letters ?? []), ...(after.letters ?? [])])],
    settings: {
      before: git(["show", `${base}:.claude/settings.json`], cwd),
      after: git(["show", `${head}:.claude/settings.json`], cwd),
    },
    gate: {
      before: { ...before.gate, scripts: git(["show", `${base}:package.json`], cwd) },
      after: { ...after.gate, scripts: git(["show", `${head}:package.json`], cwd) },
    },
    tests: { deleted: filesOf(cwd, range, "D", base), added: filesOf(cwd, range, "A", head) },
  });
  return { ok: reasons.length === 0, reasons };
}

/** `--probe <scripts root>`: measure that side and print it. Errors exit non-zero. */
async function runProbe(root) {
  const url = (file) => pathToFileURL(join(root, file)).href;
  const { decide } = await import(url("hooks/guard.mjs"));
  const { isGatedPath } = await import(url("run/gated.mjs"));
  const { reviewed } = await import(url("run/permission.mjs"));
  const { STEPS, MAX_RED, decide: gate } = await import(url("hooks/gate.mjs"));
  // One red step of *this* side's STEPS, the rest green: an entry follows a gate whose steps
  // were renamed, and only one that stopped refusing a red step reads as loosened.
  const gateDecide = ({ red = 0, state = null } = {}) => {
    const step = STEPS.at(red);
    return gate({
      input: { session_id: "s" },
      state,
      fingerprint: "a tree the gate has not seen",
      runStep: (each) => (each === step ? { ok: false, output: "boom" } : { ok: true, output: "" }),
    });
  };
  emit({
    guard: refusals(decide),
    doors: doorRefusals({ reviewed, gateDecide }),
    paths: gating(isGatedPath),
    letters: ruleLetters(readFileSync(join(root, "hooks/guard.mjs"), "utf8")),
    gate: { steps: STEPS, maxRed: MAX_RED },
  });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--probe");
  if (at === -1) emit(loosenedBy({ range: args[0] ?? "origin/main...HEAD" }));
  // Deliberately not awaited. `gated.mjs` imports this module, so a probe of a scripts root
  // that is this file's own directory re-enters it: a top-level await here would still be
  // pending when the dynamic import asked for it, and the two would wait on each other
  // forever. Letting the top level finish first means the import finds this module whole.
  // `loosenedBy` probes two temporary checkouts and never that root, but the CLI takes any.
  else
    runProbe(args[at + 1]).catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    });
}
