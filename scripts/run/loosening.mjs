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
];

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

/** Every `(event, matcher)` hook of a settings text, by its command. Null when it does not parse. */
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
      const matcher = group?.matcher ?? "*";
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        found.set(`${event} ${matcher}`, String(hook?.command ?? ""));
      }
    }
  }
  return found;
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
  const gone = [];
  for (const [key, command] of before) {
    if (!after.has(key)) {
      gone.push(
        reason(
          `the ${key} hook is gone from .claude/settings.json`,
          "put it back — a guard nothing invokes refuses nothing",
        ),
      );
    } else if (after.get(key) !== command) {
      gone.push(
        reason(
          `the ${key} hook's command is no longer main's`,
          "restore main's command, or say merge here if the change is meant",
        ),
      );
    }
  }
  return gone;
}

/** The gate's steps shortened, or its release count raised. */
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
  paths = {},
  letters = [],
  settings = {},
  gate = {},
  tests = {},
} = {}) {
  return [
    ...detectorLoosened(files),
    ...guardLoosened(guard.before, guard.after),
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

/** `origin/main`'s `scripts/` in a temporary directory, the way the hooks read it. */
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
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** `{ path, text }` for each file of `status` in the diff, read from the side that has it. */
function filesOf(cwd, range, status, rev) {
  const out = git(["diff", "--name-status", "--diff-filter=" + status, range], cwd) ?? "";
  return out
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2 && parts[1].trim() !== "")
    .map((parts) => parts[1].trim())
    .map((path) => ({
      path,
      text: rev === null ? readHead(cwd, path) : git(["show", `${rev}:${path}`], cwd),
    }));
}

function readHead(cwd, path) {
  try {
    return readFileSync(join(cwd, path), "utf8");
  } catch {
    return null;
  }
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
    (git(["diff", "--name-only", range], cwd) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const dir = checkoutScripts(cwd, base);
  if (dir === null) {
    return {
      ok: false,
      reasons: [
        reason(
          `scripts/ could not be read from ${base}`,
          "the restraints before this diff are unknown, so nothing here can be vouched for",
        ),
      ],
    };
  }
  let before;
  let after;
  try {
    before = probe(join(dir, "scripts"), { cwd });
    after = probe(join(cwd, "scripts"), { cwd });
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
          "this checkout's restraints could not be run",
          "fix scripts/hooks/guard.mjs, scripts/hooks/gate.mjs or scripts/run/gated.mjs so both sides can be measured",
        ),
      ],
    };
  }

  const reasons = loosenings({
    files: names,
    guard: { before: before.guard, after: after.guard },
    paths: { before: before.paths, after: after.paths },
    letters: [...new Set([...(before.letters ?? []), ...(after.letters ?? [])])],
    settings: {
      before: git(["show", `${base}:.claude/settings.json`], cwd),
      after: readHead(cwd, ".claude/settings.json"),
    },
    gate: { before: before.gate, after: after.gate },
    tests: { deleted: filesOf(cwd, range, "D", base), added: filesOf(cwd, range, "A", null) },
  });
  return { ok: reasons.length === 0, reasons };
}

/** `--probe <scripts root>`: measure that side and print it. Errors exit non-zero. */
async function runProbe(root) {
  const url = (file) => pathToFileURL(join(root, file)).href;
  const { decide } = await import(url("hooks/guard.mjs"));
  const { isGatedPath } = await import(url("run/gated.mjs"));
  const { STEPS, MAX_RED } = await import(url("hooks/gate.mjs"));
  emit({
    guard: refusals(decide),
    paths: gating(isGatedPath),
    letters: ruleLetters(readFileSync(join(root, "hooks/guard.mjs"), "utf8")),
    gate: { steps: STEPS, maxRed: MAX_RED },
  });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--probe");
  if (at === -1) emit(loosenedBy({ range: args[0] ?? "origin/main...HEAD" }));
  // Deliberately not awaited. `gated.mjs` imports this module, so probing *this* checkout's
  // scripts/ re-enters this very file: a top-level await here would still be pending when the
  // dynamic import asked for it, and the two would wait on each other forever. Letting the
  // top level finish first means the import finds this module whole.
  else
    runProbe(args[at + 1]).catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    });
}
