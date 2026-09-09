#!/usr/bin/env node
/**
 * PreToolUse guard — the hard boundaries of docs/guidelines.md §5, as mechanism.
 *
 * A rule that lives only in CLAUDE.md is a sentence a session can read past. These are the
 * ones where reading past is expensive: `drizzle-kit push` drops the RLS policies that are
 * the product isolation boundary, a migration applied without a human is a schema change
 * nobody approved, a write to `.env*` puts a secret somewhere it does not belong, and a
 * merge made by a run is the one move guidelines §3 keeps for the human.
 *
 * Reads the hook JSON on stdin. Exit 2 with a one-line reason on stderr refuses the call;
 * exit 0 lets it through. Refusal text names what was refused and where the rule lives —
 * product-spec §1 law 6, welcoming and never alarming, applied to a developer surface.
 *
 * Every rule reads *commands*, never text. `parse()` turns the Bash string into simple
 * commands — argv plus redirects — the way the shell would: split on `;` `&&` `||` `|` `&`
 * and newlines, quotes honoured, `\`-continuations joined, heredoc bodies kept as data,
 * `$(…)`, backticks and `sh -c "…"` read as the nested commands they run. A rule then
 * matches on the executable and its arguments. Prose inside a heredoc or a quoted string
 * never matches: T0.98 and T0.8's close were both refused for *mentioning* a command in a
 * file they were writing, which is what T0.9 replaces.
 *
 * `decide()` is pure and exported so scripts/hooks/guard.test.mjs can cover every rule and,
 * more importantly, every neighbouring call that must stay allowed.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDir } from "./gate.mjs";

/** Words that run their remaining argv as the command. */
const WRAPPERS = new Set(["env", "command", "exec", "sudo", "time", "nohup", "nice"]);

/** A wrapper's options that take a value, so the value is not mistaken for the command. */
const WRAPPER_VALUE_FLAGS = {
  sudo: new Set(["-u", "-g", "-h", "-p"]),
  nice: new Set(["-n"]),
  env: new Set(["-u", "-C", "-S"]),
};

/** Package runners: what follows them is a script name or a binary, not a runner option. */
const RUNNERS = new Set(["pnpm", "pnpx", "npm", "npx", "yarn", "bun", "bunx"]);

/** Runner verbs that sit between the runner and the thing it runs. */
const RUNNER_VERBS = new Set(["run", "run-script", "exec", "dlx", "x"]);

/** Shells whose `-c` string is itself a command line. */
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

/** Git options that take a separate value, so the verb is the word after the value. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

/** Redirect operators that write the file they name. */
const WRITE_REDIRECTS = new Set([">", ">>", ">|", ">&"]);

/**
 * The index of the `)` that closes the `(` at `open`, quotes and nesting respected. Returns
 * `text.length` when it never closes, which reads the rest of the line as the substitution.
 */
function closingParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === "\\" && quote === '"') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\\") {
      i += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

/**
 * Lexes a command line into words, separators, redirects, heredoc bodies and nested command
 * lines. Not a shell — it is only good enough to know *which* commands the line runs and
 * what they write to, which is all the rules ask of it.
 */
function lex(text) {
  const tokens = [];
  let word = "";
  let hasWord = false;
  let quote = null;
  let awaitingDelimiter = null; // Set after `<<`: the next word names the heredoc's end.
  const pending = []; // Heredocs whose bodies begin at the next newline.

  const flush = () => {
    if (hasWord) {
      if (awaitingDelimiter) {
        pending.push({ delimiter: word, strip: awaitingDelimiter.strip });
        awaitingDelimiter = null;
      } else {
        tokens.push({ kind: "word", value: word });
      }
    }
    word = "";
    hasWord = false;
  };

  const nested = (inner) => {
    tokens.push({ kind: "nested", value: inner });
    hasWord = true; // `"$(x)"` is still a word, if one the rules never read.
  };

  /** Consumes the bodies of every pending heredoc from `start`; returns where they end. */
  const readHeredocs = (start) => {
    let at = start;
    for (const { delimiter, strip } of pending) {
      const lines = [];
      let closed = false;
      while (at < text.length) {
        const end = text.indexOf("\n", at);
        const line = end === -1 ? text.slice(at) : text.slice(at, end);
        at = end === -1 ? text.length : end + 1;
        if ((strip ? line.replace(/^\t+/, "") : line) === delimiter) {
          closed = true;
          break;
        }
        lines.push(line);
      }
      tokens.push({ kind: "heredoc", value: lines.join("\n"), closed });
    }
    pending.length = 0;
    return at;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "\\" && i + 1 < text.length && '"\\$`\n'.includes(text[i + 1])) {
        if (text[i + 1] !== "\n") word += text[i + 1];
        i += 1;
      } else if (char === "$" && text[i + 1] === "(") {
        const close = closingParen(text, i + 1);
        nested(text.slice(i + 2, close));
        i = close;
      } else if (char === "`") {
        const close = text.indexOf("`", i + 1);
        nested(text.slice(i + 1, close === -1 ? text.length : close));
        i = close === -1 ? text.length : close;
      } else {
        word += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      hasWord = true;
      continue;
    }
    if (char === "\\") {
      // `\` + newline is a line continuation: the shell removes both and joins the lines.
      // Anything else after `\` is the literal character.
      if (text[i + 1] === "\n") {
        i += 1;
      } else if (i + 1 < text.length) {
        word += text[i + 1];
        hasWord = true;
        i += 1;
      }
      continue;
    }
    if (char === "$" && text[i + 1] === "(") {
      const close = closingParen(text, i + 1);
      nested(text.slice(i + 2, close));
      i = close;
      continue;
    }
    if (char === "`") {
      const close = text.indexOf("`", i + 1);
      nested(text.slice(i + 1, close === -1 ? text.length : close));
      i = close === -1 ? text.length : close;
      continue;
    }
    if (char === "\n") {
      // A newline ends a simple command the way `;` does — and opens the body of any heredoc
      // the line announced, which is data until its delimiter and never a command.
      flush();
      if (pending.length > 0) i = readHeredocs(i + 1) - 1;
      tokens.push({ kind: "sep" });
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === "<" && text[i + 1] === "<") {
      flush();
      if (text[i + 2] === "<") {
        // `<<<` is a here-string: a read of the word after it.
        tokens.push({ kind: "redir", op: "<<<" });
        i += 2;
        continue;
      }
      const strip = text[i + 2] === "-";
      awaitingDelimiter = { strip };
      i += strip ? 2 : 1;
      continue;
    }
    if (char === ">" || (char === "&" && text[i + 1] === ">")) {
      // A leading file descriptor (`2>`) belongs to the operator, not to a filename; `&>`
      // sends both streams to the file and is a write like any other.
      if (/^\d+$/.test(word)) {
        word = "";
        hasWord = false;
      }
      flush();
      if (char === "&") i += 1;
      let op = ">";
      if (text[i + 1] === ">") {
        op = ">>";
        i += 1;
      } else if (text[i + 1] === "|") {
        op = ">|";
        i += 1;
      } else if (text[i + 1] === "&") {
        op = ">&";
        i += 1;
      }
      tokens.push({ kind: "redir", op });
      continue;
    }
    if (char === "<") {
      if (/^\d+$/.test(word)) {
        word = "";
        hasWord = false;
      }
      flush();
      tokens.push({ kind: "redir", op: text[i + 1] === "&" ? "<&" : "<" });
      if (text[i + 1] === "&") i += 1;
      continue;
    }
    if ("|&;()".includes(char)) {
      flush();
      if ((char === "|" || char === "&") && text[i + 1] === char) i += 1;
      tokens.push({ kind: "sep" });
      continue;
    }
    word += char;
    hasWord = true;
  }
  flush();
  if (pending.length > 0) readHeredocs(text.length); // Announced, never opened: no body.
  return tokens;
}

/**
 * The simple commands a Bash string runs, each as `{ argv, redirects, heredocs }`.
 *
 * Nested command lines — `$(…)`, backticks, `sh -c "…"` — are parsed and returned beside
 * the command that contains them: a rule cares that they run, not where. Heredoc bodies
 * travel as data on the command that reads them and are never parsed.
 */
export function parse(command) {
  const commands = [];
  const fresh = () => ({ argv: [], redirects: [], heredocs: [] });
  let current = fresh();
  let redirect = null;

  const close = () => {
    if (current.argv.length || current.redirects.length || current.heredocs.length) {
      commands.push(current);
    }
    current = fresh();
    redirect = null;
  };

  for (const token of lex(String(command ?? ""))) {
    if (token.kind === "sep") {
      close();
    } else if (token.kind === "redir") {
      redirect = { op: token.op, target: null };
      current.redirects.push(redirect);
    } else if (token.kind === "heredoc") {
      current.heredocs.push(token.value);
    } else if (token.kind === "nested") {
      commands.push(...parse(token.value));
    } else if (redirect) {
      redirect.target = token.value;
      redirect = null;
    } else if (token.value !== "{" && token.value !== "}" && token.value !== "!") {
      current.argv.push(token.value);
    }
  }
  close();

  // `sh -c "…"` runs its string as a command line of its own.
  for (const cmd of commands.slice()) {
    const { exe, args } = program(cmd.argv);
    const c = args.indexOf("-c");
    if (SHELLS.has(exe) && c !== -1 && typeof args[c + 1] === "string") {
      commands.push(...parse(args[c + 1]));
    }
  }

  return commands;
}

/**
 * The executable a simple command runs and its arguments, with leading assignments and
 * pass-through wrappers stepped over: `GIT_TRACE=1 git push`, `env X=1 git push`,
 * `command git push`, `sudo -u deploy git push` are all `git push`. The executable is its
 * basename, so `/usr/bin/git` and `node_modules/.bin/drizzle-kit` read as what they are.
 */
export function program(argv) {
  let i = 0;
  while (i < argv.length) {
    const word = argv[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      i += 1;
    } else if (WRAPPERS.has(word)) {
      const valueFlags = WRAPPER_VALUE_FLAGS[word] ?? new Set();
      i += 1;
      while (i < argv.length && argv[i].startsWith("-")) {
        i += valueFlags.has(argv[i]) ? 2 : 1;
      }
    } else {
      break;
    }
  }
  const exe = i < argv.length ? basename(argv[i]) : null;
  return { exe, args: argv.slice(i + 1) };
}

/** The arguments that are not options. */
const operands = (args) => args.filter((token) => !token.startsWith("-") || token === "-");

/**
 * What a command ultimately runs: for a package runner, the script or binary after its
 * verbs and options (`pnpm db:push`, `npm run db:push`, `pnpm exec drizzle-kit push`,
 * `npx drizzle-kit push`); for anything else, the executable itself.
 */
export function target(argv) {
  const { exe, args } = program(argv);
  if (exe === null) return { name: null, rest: [] };
  if (!RUNNERS.has(exe)) return { name: exe, rest: args };
  let i = 0;
  while (i < args.length && (args[i].startsWith("-") || RUNNER_VERBS.has(args[i]))) i += 1;
  return i < args.length
    ? { name: basename(args[i]), rest: args.slice(i + 1) }
    : { name: exe, rest: [] };
}

/** True when the command runs the `drizzle-kit` verb named, directly or through a runner. */
function drizzleKit(argv, verb) {
  const { name, rest } = target(argv);
  return name === "drizzle-kit" && operands(rest)[0] === verb;
}

/**
 * Every path a command line writes to: redirect targets, `tee` arguments, the destination
 * of `cp`/`mv`/`install`, and the files `sed -i` edits in place. Reads (`cat .env.local`,
 * `<`) are not writes and are not collected — rule (e) is about putting a secret
 * somewhere, not about looking at one.
 */
export function writeTargets(command) {
  const targets = [];
  for (const cmd of parse(command)) {
    for (const { op, target: file } of cmd.redirects) {
      if (WRITE_REDIRECTS.has(op) && file) targets.push(file);
    }
    const { exe, args } = program(cmd.argv);
    const files = operands(args);
    if (exe === "tee") {
      targets.push(...files);
    } else if (exe === "cp" || exe === "mv" || exe === "install") {
      if (files.length >= 2) targets.push(files[files.length - 1]);
    } else if (exe === "sed" && args.some((token) => /^(-[a-zA-Z]*i|--in-place)/.test(token))) {
      // `sed -i` rewrites its operands; the first is the script, the rest are files.
      targets.push(...files.slice(1));
    }
  }
  return targets;
}

/**
 * True when a path lands on a `.env`-family file, whatever directory it sits in.
 *
 * `.env.example` is the exception, as `.gitignore` has always had it: it is tracked, public
 * by design and holds placeholders, so a ticket that adds a variable has to be able to
 * document it.
 */
export function isEnvPath(path) {
  const name = basename(path);
  return name.startsWith(".env") && name !== ".env.example";
}

/**
 * True when a refspec names `main` as the branch being written.
 *
 * `main`, `+main` (force by refspec), `HEAD:main`, `main:main`, `refs/heads/main` — the
 * destination is whatever follows the last colon, and a leading `+` is a force marker
 * rather than part of the name.
 */
export function namesMain(token) {
  const destination = String(token).replace(/^\+/, "").split(":").at(-1);
  return destination === "main" || destination === "refs/heads/main";
}

/**
 * The git subcommand of a simple command and what follows it, or null when it is not git.
 * The verb is the first word after `git` that is not a git option; `-C <path>`, `-c
 * <key=value>` and their long relatives take a value, so `git -C /tmp/wt push --force` is
 * still a push and `git -c merge.ff=false merge x` is still a merge. With `-C <path>` the
 * checkout whose branch matters is `<path>`; rule (d) reads the hook's cwd regardless —
 * build-log open question 38.
 */
function gitVerb(argv) {
  const { exe, args } = program(argv);
  if (exe !== "git") return null;
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  }
  return { verb: args[i] ?? null, rest: args.slice(i + 1) };
}

/** True when a `git push` carries a force flag, bundled short flags included. */
function isForcePush(git) {
  return (
    git?.verb === "push" &&
    git.rest.some(
      (token) =>
        /^--force(-with-lease|-if-includes)?(=|$)/.test(token) ||
        (/^-[a-zA-Z]+$/.test(token) && token.includes("f")),
    )
  );
}

/**
 * True when a `git push` would write main: either a refspec says so, or the push carries
 * no refspec at all while main is the branch checked out.
 */
function pushesMain(git, currentBranch) {
  if (git?.verb !== "push") return false;
  const refs = operands(git.rest);
  if (refs.some(namesMain)) return true;
  // `git push` with a remote at most and no refspec pushes the current branch.
  return refs.length <= 1 && currentBranch() === "main";
}

/** The branch of the checkout the call is being made from, or null when git cannot say. */
function branchAt(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** True while a `/ticket` run owns the checkout the hook was called from. */
function runActiveAt(input) {
  return existsSync(join(resolveDir(input), ".claude", ".run-active"));
}

/**
 * The whole decision. Returns the refusal reason, or null to let the call through.
 *
 * `deps.currentBranch` and `deps.runActive` are injected so the rules that depend on where
 * HEAD points and whether a run marker exists can be tested without a repository standing
 * in a particular state.
 */
export function decide(input, deps = {}) {
  const currentBranch = deps.currentBranch ?? (() => branchAt(input?.cwd ?? process.cwd()));
  const runActive = deps.runActive ?? (() => runActiveAt(input));
  const tool = input?.tool_name;

  if (tool === "Edit" || tool === "Write") {
    const path = input?.tool_input?.file_path;
    if (typeof path === "string" && isEnvPath(path)) {
      return `Writing ${path} is refused — .env files carry secrets and are edited by hand. docs/guidelines.md §5, hard boundaries.`;
    }
    return null;
  }

  if (tool !== "Bash") return null;

  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command.trim() === "") return null;

  for (const cmd of parse(command)) {
    const { name, rest } = target(cmd.argv);
    const { exe, args } = program(cmd.argv);

    // (a) push rewrites the RLS policies out of existence.
    if (name === "db:push" || drizzleKit(cmd.argv, "push")) {
      return "drizzle-kit push is refused — the RLS policies in drizzle/0001_policies.sql are not in the schema DSL, so push plans to DROP them and take the product isolation boundary with them. Generate a migration with pnpm db:generate instead. CLAUDE.md › Prohibitions.";
    }

    // (b) a migration is a schema change a human approves, until T0.10 gives it a path.
    if (name === "db:migrate" || drizzleKit(cmd.argv, "migrate")) {
      return "Applying a migration is a human step until T0.10 adds the Decision-answered path. Leave the migration in the diff and say it is waiting. docs/guidelines.md §5 step 6.";
    }

    // (c) production deploys are a human step.
    if (exe === "vercel" && args.some((a) => a.startsWith("--prod") || a === "deploy")) {
      return "Deploying to production is a human step. docs/guidelines.md §5, hard boundaries.";
    }

    // (d) force-push, pushing main, and merging while main is checked out.
    const git = gitVerb(cmd.argv);
    if (isForcePush(git)) {
      return "Force-pushing is refused — it rewrites history the remote and every other checkout share. A plain git push is allowed. docs/guidelines.md §5, hard boundaries.";
    }
    if (pushesMain(git, currentBranch)) {
      return "Pushing main is refused — a ticket goes to a branch and reaches main through a merge you make. Push the ticket branch instead. docs/guidelines.md §5, hard boundaries.";
    }
    // `merge` the verb, not `merge-base` or `merge-tree` — those are reads, and `merge-base`
    // is the one the reviewer's own `main...HEAD` diff rests on.
    if (git?.verb === "merge" && currentBranch() === "main") {
      return "Merging while main is checked out is refused — merges to main are made by hand. docs/guidelines.md §5, hard boundaries.";
    }

    // (f) a pull request merged through the API writes main from any branch. While a run
    // owns the checkout, that is the run merging, which is the one move §3 keeps human.
    const ghWords = operands(rest);
    if (name === "gh" && ghWords[0] === "pr" && ghWords[1] === "merge" && runActive()) {
      return "Merging a pull request is refused while a run is active — .claude/.run-active says a run owns this checkout, and merging to main is the human's move. docs/guidelines.md §5, hard boundaries.";
    }
  }

  // (e) anything that writes to a .env file.
  const envTarget = writeTargets(command).find(isEnvPath);
  if (envTarget) {
    return `Writing ${envTarget} is refused — .env files carry secrets and are edited by hand. docs/guidelines.md §5, hard boundaries.`;
  }

  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // Nothing to judge. A guard that cannot read its input refuses nothing rather than
    // refusing everything: exit codes other than 2 let the call proceed regardless.
    process.exit(0);
  }

  const reason = decide(input);
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
