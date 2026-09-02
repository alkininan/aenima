#!/usr/bin/env node
/**
 * PreToolUse guard — the hard boundaries of docs/guidelines.md §5, as mechanism.
 *
 * A rule that lives only in CLAUDE.md is a sentence a session can read past. These five
 * are the ones where reading past is expensive: `drizzle-kit push` drops the RLS policies
 * that are the product isolation boundary, a migration applied without a human is a schema
 * change nobody approved, and a write to `.env*` puts a secret somewhere it does not belong.
 *
 * Reads the hook JSON on stdin. Exit 2 with a one-line reason on stderr refuses the call;
 * exit 0 lets it through. Refusal text names what was refused and where the rule lives —
 * product-spec §1 law 6, welcoming and never alarming, applied to a developer surface.
 *
 * `decide()` is pure and exported so scripts/hooks/guard.test.mjs can cover every rule and,
 * more importantly, every neighbouring call that must stay allowed.
 */

import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Shell metacharacters that end one command and begin another. */
const OPERATORS = new Set(["|", "||", "&&", ";", "&"]);

/** Words that run their remaining argv as the command. */
const WRAPPERS = new Set(["env", "command", "exec"]);

/**
 * Splits a command line into tokens, keeping quoted runs together and emitting redirect
 * and control operators as tokens of their own. Not a shell parser — it is deliberately
 * only good enough to find the *targets of writes*, which is all rule (e) asks of it.
 */
export function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;

  const flush = () => {
    if (current !== "") tokens.push(current);
    current = "";
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "\\" && i + 1 < command.length) {
      // `\` + newline is a line continuation: the shell removes both and joins the lines.
      // Anything else after `\` is the literal character.
      if (command[i + 1] === "\n") {
        i += 1;
        continue;
      }
      current += command[i + 1];
      i += 1;
      continue;
    }
    if (char === "\n") {
      // A newline ends a simple command the way `;` does. Without this a multi-line Bash call
      // — the everyday shape — is one command named after its first line, and every rule that
      // reads per command skips the rest.
      flush();
      tokens.push(";");
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === ">") {
      // A leading file descriptor (`2>`) belongs to the operator, not to a filename.
      if (/^\d+$/.test(current)) current = "";
      flush();
      // `>>` appends; `>|` overrides noclobber and is still a write to the file after it.
      if (command[i + 1] === ">") {
        i += 1;
        tokens.push(">>");
      } else {
        if (command[i + 1] === "|") i += 1;
        tokens.push(">");
      }
      continue;
    }
    if (char === "<") {
      flush();
      tokens.push("<");
      continue;
    }
    if (char === "|" || char === "&" || char === ";") {
      flush();
      const doubled = command[i + 1] === char;
      tokens.push(doubled ? ((i += 1), char + char) : char);
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}

/** True for a token that is a flag rather than a path. */
const isFlag = (token) => token.startsWith("-") && token !== "-";

/**
 * Every path a command line writes to: redirect targets, `tee` arguments, the destination
 * of `cp`/`mv`, and the files `sed -i` edits in place. Reads (`cat .env.local`, `<`) are
 * not writes and are not collected — rule (e) is about putting a secret somewhere, not
 * about looking at one.
 */
export function writeTargets(command) {
  const tokens = tokenize(command);
  const targets = [];
  let words = []; // Plain words of the command being scanned, operators excluded.

  const drainSimpleCommand = () => {
    if (words.length === 0) return;
    const [name, ...rest] = words;
    const args = rest.filter((token) => !isFlag(token));

    if (name === "tee") {
      targets.push(...args);
    } else if (name === "cp" || name === "mv" || name === "install") {
      if (args.length >= 2) targets.push(args[args.length - 1]);
    } else if (name === "sed" && rest.some((token) => /^(-[a-zA-Z]*i|--in-place)/.test(token))) {
      // `sed -i` rewrites its operands; the first is the script, the rest are files.
      targets.push(...args.slice(1));
    }
    words = [];
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === ">" || token === ">>") {
      // `cmd >& file` tokenizes as `>` `&` `file`: that `&` belongs to the redirect, not to
      // the control operator. `2>&1` takes the same path and lands on "1", which is harmless.
      const viaAmp = tokens[i + 1] === "&" && tokens[i + 2] && !OPERATORS.has(tokens[i + 2]);
      const target = viaAmp ? tokens[i + 2] : tokens[i + 1];
      if (target && !OPERATORS.has(target)) {
        targets.push(target);
        i += viaAmp ? 2 : 1;
      }
      continue;
    }
    if (token === "<") {
      i += 1; // Skip the source of a read redirect.
      continue;
    }
    if (OPERATORS.has(token)) {
      drainSimpleCommand();
      continue;
    }
    words.push(token);
  }
  drainSimpleCommand();

  return targets;
}

/**
 * True when a path lands on a `.env`-family file, whatever directory it sits in.
 *
 * `.env.example` is included, because the ticket says `.env*` and says it without a
 * carve-out. It holds no secret and .gitignore already treats it as the exception, so
 * whether it should be one here is a question for T0.8 rather than a decision to take
 * on the way past.
 */
export function isEnvPath(path) {
  return basename(path).startsWith(".env");
}

/**
 * True when a `git push` in the command line carries a force flag, bundled short flags
 * included. Only the tokens of the push itself are read: `git push origin x && rm -rf dist`
 * is a plain push followed by something else, not a force-push.
 */
function isForcePush(tokens) {
  return simpleCommands(tokens).some((words) => {
    const git = gitVerb(words);
    return (
      git?.verb === "push" &&
      git.rest.some(
        (token) =>
          /^--force(-with-lease|-if-includes)?(=|$)/.test(token) ||
          (/^-[a-zA-Z]+$/.test(token) && token.includes("f")),
      )
    );
  });
}

/** The simple commands of a line: its tokens split on the control operators. */
function simpleCommands(tokens) {
  const commands = [[]];
  for (const token of tokens) {
    if (OPERATORS.has(token)) commands.push([]);
    else commands[commands.length - 1].push(token);
  }
  return commands;
}

/**
 * The git subcommand of a simple command and what follows it, or null when it is not git.
 * The verb is the first token after `git` that is not a git option; `-C <path>` and
 * `-c <key=value>` take a value, so `git -C /tmp/wt push --force` is still a push and
 * `git -c merge.ff=false merge x` is still a merge. With `-C <path>` the checkout whose
 * branch matters is `<path>`; rule (d) reads the hook's cwd regardless — open question 8.
 */
function gitVerb(words) {
  // `GIT_TRACE=1 git push`, `env X=1 git push`, `command git push`, `exec git push` are all
  // git. Step over leading assignments and the wrappers that pass their argv through.
  let i = 0;
  while (
    i < words.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]))
  ) {
    i += 1;
  }
  if (words[i] !== "git") return null;
  i += 1;
  while (i < words.length && words[i].startsWith("-")) {
    i += words[i] === "-C" || words[i] === "-c" ? 2 : 1;
  }
  return { verb: words[i] ?? null, rest: words.slice(i + 1) };
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

/**
 * The whole decision. Returns the refusal reason, or null to let the call through.
 *
 * `deps.currentBranch` is injected so the rule that depends on where HEAD points can be
 * tested without a repository standing in a particular state.
 */
export function decide(input, deps = {}) {
  const currentBranch = deps.currentBranch ?? (() => branchAt(input?.cwd ?? process.cwd()));
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

  // (a) push rewrites the RLS policies out of existence.
  if (command.includes("db:push") || /drizzle-kit\s+push\b/.test(command)) {
    return "drizzle-kit push is refused — the RLS policies in drizzle/0001_policies.sql are not in the schema DSL, so push plans to DROP them and take the product isolation boundary with them. Generate a migration with pnpm db:generate instead. CLAUDE.md › Prohibitions.";
  }

  // (b) a migration is a schema change a human approves, until T0.8 gives it a path.
  if (command.includes("db:migrate")) {
    return "Applying a migration is a human step until T0.8 adds the Decision-answered path. Leave the migration in the diff and say it is waiting. docs/guidelines.md §5 step 6.";
  }

  // (c) production deploys are a human step.
  if (/\bvercel\b/.test(command) && (/--prod\b/.test(command) || /\bdeploy\b/.test(command))) {
    return "Deploying to production is a human step. docs/guidelines.md §5, hard boundaries.";
  }

  const tokens = tokenize(command);

  // (d) force-push, and merging while main is checked out.
  if (isForcePush(tokens)) {
    return "Force-pushing is refused — it rewrites history the remote and every other checkout share. A plain git push is allowed. docs/guidelines.md §5, hard boundaries.";
  }
  // `merge` the verb, not `merge-base` or `merge-tree` — those are reads, and `merge-base` is
  // the one the reviewer's own `main...HEAD` diff rests on.
  const merges = simpleCommands(tokens).some((words) => gitVerb(words)?.verb === "merge");
  if (merges && currentBranch() === "main") {
    return "Merging while main is checked out is refused — merges to main are made by hand. docs/guidelines.md §5, hard boundaries.";
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
