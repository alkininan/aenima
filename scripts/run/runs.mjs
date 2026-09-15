#!/usr/bin/env node
/**
 * Step 9, after the session — the Runs row, written from the transcript.
 *
 * Every `/ticket` session leaves one row in the board's Runs database (docs/guidelines.md
 * §2): `R-nnnn T<id>`, the task, when it started, how long it ran, which model, the tokens
 * it spent, how it ended and how many findings the reviewer raised. The row is the data for
 * park rate, findings per ticket and the four-week weight tuning, and it is written by a
 * script rather than by the session — the SessionEnd hook hands this file the transcript
 * path and the script reads the JSONL Claude Code wrote, with no model in the loop and no
 * claim the session could have made about itself.
 *
 * What the transcript holds and how it is read:
 *   - one line per event, each with a `type` and most with a `timestamp`; the first and the
 *     last timestamp are the session's span;
 *   - assistant lines carry `message.model` and `message.usage`, one line per content block
 *     of one API message, every line repeating that message's usage — so usage is counted
 *     once per `message.id`, never per line (T0.10's table counted lines, which is why its
 *     tokens and turns are high by the blocks-per-message ratio);
 *   - the claimed task is the `claim.mjs --task … --page …` the skill ran as a command, read
 *     from the Bash tool call — the last one that did not merge before writing a Status of its
 *     own, since step 0 claims a task only to merge it on the human's word before step 1 claims
 *     the run's; the outcome is the last Status the skill wrote on that page through the
 *     connector before the next claim, a write after `release.mjs` included (steps 4 and 6
 *     release, then set Decision) — Review and Done are Done, Decision is Decision, anything
 *     else Stopped;
 *   - findings are counted from the reviewer subagent's replies, `Must` and `Should` tags;
 *   - a subagent's transcript is written beside the session's, under
 *     `<transcript dir>/<session id>/subagents/agent-*.jsonl`, every line a sidechain; its
 *     usage and model count towards the run's — the reviewer is half a real run's spend — and
 *     nothing else in it does, since its first user message is the ticket path, not `/ticket`.
 *
 * `parseTranscript` is pure over the lines; `post` takes the client injected so a test never
 * reaches the network. Tokens are input + output, cache reads and cache writes excluded, as
 * §2 says.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { emit, isMain, readStdin } from "./cli.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";

/** What a user message must contain for the session to count as a run. */
export const RUN_PROMPT = "/ticket";

/**
 * `/ticket` as a command: alone on its line, as the scheduled task's prompt ends, or between
 * tags, as `<command-name>/ticket</command-name>` when a person types it. Not the `/ticket`
 * inside `docs/tickets/T0.12.md`, and not a mention in prose — "what does /ticket do?" is a
 * question, not a run.
 */
export const RUN_PATTERN = /(^|>)\s*\/ticket\s*($|<)/m;

/** The model names the board's `Model` select knows. */
export const MODELS = ["Fable", "Opus", "Fable→Opus"];

/**
 * How the last Status a run wrote on its task reads as an Outcome. Done is a run that merged its
 * own work at close (T0.16), Review one whose diff waits on the human's word.
 */
export const OUTCOMES = { Review: "Done", Done: "Done", Decision: "Decision" };

/** The outcome of a run that wrote no Review, Done or Decision — an idle run, a killed one. */
export const STOPPED = "Stopped";

/**
 * `node scripts/run/claim.mjs …` run as a command — at the start of the command or after a
 * separator — its arguments captured. Not the same words inside a quoted `claude -p` prompt.
 */
export const CLAIM_PATTERN = /(?:^|[\n;&|(]\s*)node\s+\S*claim\.mjs\b([^\n;&|]*)/;

/** `gh pr merge` run as a command — what makes a claim step 0's merge rather than a run's own. */
export const MERGE_PATTERN = /(?:^|[\n;&|(]\s*)gh\s+pr\s+merge\b/;

/** Parse one JSONL line, or null for a line that is not JSON. */
const parseLine = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

/** The text of a message content — a string, or the text blocks of an array joined. */
export function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (typeof block === "string" ? block : (block?.text ?? "")))
    .join("\n");
}

/** The blocks of a message content, `[]` for a string. */
const blocksOf = (content) => (Array.isArray(content) ? content : []);

/** `claude-fable-5-1` → `Fable`; `claude-opus-…` → `Opus`; anything else → null. */
export function modelFamily(model) {
  const name = String(model ?? "").toLowerCase();
  if (name.includes("fable")) return "Fable";
  if (name.includes("opus")) return "Opus";
  return null;
}

/**
 * The board's one word for the models a session ran on: the family when there was one,
 * `Fable→Opus` when it fell back partway (docs/guidelines.md §2), null when none is known.
 */
export function modelLabel(families) {
  const set = new Set(families.filter(Boolean));
  if (set.has("Fable") && set.has("Opus")) return "Fable→Opus";
  if (set.size === 1) return [...set][0];
  return null;
}

/**
 * How many findings a reviewer reply raises. Each finding is tagged `Must` or `Should` at
 * the head of its line — `**1. Must — …`, `1. **Should** …` — so the tags at line heads are
 * counted; the reply's own summary sentence, "Two Must, six Should" or "No Must. Seven
 * Should", is read too, and the larger of the two counts is taken, since a reply that groups
 * its findings under a `### Must` heading tags none of the lines.
 */
export function countFindings(text) {
  const body = String(text ?? "");
  const tagged =
    body.match(/^\s*(?:[-*]\s*|\d+\.\s*)?\**\s*(?:\d+\.\s*)?\**\s*(?:Must|Should)\b/gim) ?? [];
  const words = {
    no: 0,
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const number = (word) => {
    const lower = word.toLowerCase();
    return lower in words ? words[lower] : Number.parseInt(lower, 10);
  };
  let summary = 0;
  for (const match of body.matchAll(
    /\b(\d+|no|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(Must|Should)s?\b/gi,
  )) {
    summary += number(match[1]);
  }
  return Math.max(tagged.length, summary);
}

/**
 * Read a transcript's lines into what the row needs.
 *
 * Returns `{ session, run, started, ended, durationMin, turns, models, model, tokens, task,
 * page, statuses, outcome, findings }`. `run` is false when no user message carries the
 * run prompt — a session that was not a `/ticket`, which gets no row.
 */
export function parseTranscript(lines, sidechains = []) {
  const parse = (raw) =>
    (Array.isArray(raw) ? raw : String(raw).split("\n"))
      .map((line) => (typeof line === "string" ? parseLine(line) : line))
      .filter((event) => event !== null && typeof event === "object");
  const events = parse(lines).filter((event) => !event.isSidechain);
  // A subagent's lines: usage and model only. Its prompt is the ticket path, its statuses none.
  const side = sidechains
    .flatMap((raw) => parse(raw))
    .filter((event) => event.type === "assistant");

  const timestamps = events
    .map((event) => event.timestamp)
    .filter((stamp) => typeof stamp === "string" && Number.isFinite(Date.parse(stamp)))
    .sort();
  const started = timestamps[0] ?? null;
  const ended = timestamps.at(-1) ?? null;
  const durationMin =
    started && ended
      ? Math.round(((Date.parse(ended) - Date.parse(started)) / 60000) * 10) / 10
      : null;

  const session = events.find((event) => event.sessionId)?.sessionId ?? null;

  const users = events.filter((event) => event.type === "user");
  const assistants = events.filter((event) => event.type === "assistant");

  const run = users.some((event) => RUN_PATTERN.test(textOf(event.message?.content)));

  // One API message, one usage — whatever the number of content blocks it was written as. The
  // subagents' messages count here and nowhere else.
  const messages = new Map();
  for (const event of [...assistants, ...side]) {
    const id = event.message?.id ?? event.uuid;
    messages.set(id, event.message);
  }
  let input = 0;
  let output = 0;
  const families = [];
  for (const message of messages.values()) {
    input += message?.usage?.input_tokens ?? 0;
    output += message?.usage?.output_tokens ?? 0;
    families.push(modelFamily(message?.model));
  }

  const toolUses = assistants.flatMap((event) =>
    blocksOf(event.message?.content).filter((block) => block?.type === "tool_use"),
  );
  const toolResults = new Map();
  for (const event of users) {
    for (const block of blocksOf(event.message?.content)) {
      if (block?.type === "tool_result") toolResults.set(block.tool_use_id, textOf(block.content));
    }
  }

  // One run, one task (docs/guidelines.md §5) — but not one claim. Step 0 claims a task only to
  // merge it on the human's word, and only then does step 1 claim the run's own. A claim's Status
  // writes are those on its page up to the next claim — a write after `release.mjs` included,
  // since steps 4 and 6 release the marker and then set Decision. A claim that ran `gh pr merge`
  // before writing a Status of its own is step 0's merge and never the run's; step 9's merge
  // comes after the run's Review. The run's task is the last other claim that wrote a Status, or,
  // when none did — a run killed before its first write — the last other claim.
  const claims = [];
  for (const use of toolUses) {
    const current = claims.at(-1);
    if (use.name === "Bash") {
      const command = String(use.input?.command ?? "");
      const claimed = command.match(CLAIM_PATTERN);
      const task = claimed?.[1].match(/--task\s+(T\d+\.\d+)/)?.[1];
      if (task) {
        const page = claimed[1].match(/--page\s+([0-9a-f-]{32,36})/)?.[1] ?? null;
        claims.push({ task, page, statuses: [], merged: false });
      }
      const claim = claims.at(-1);
      const rest = task ? command.slice(claimed.index + claimed[0].length) : command;
      if (claim && claim.statuses.length === 0 && MERGE_PATTERN.test(rest)) claim.merged = true;
      continue;
    }
    if (!/notion-update-page$/.test(use.name)) continue;
    const status = use.input?.properties?.Status;
    if (typeof status !== "string") continue;
    const target = String(use.input?.page_id ?? "").replaceAll("-", "");
    if (current?.page != null && current.page.replaceAll("-", "") === target) {
      current.statuses.push(status);
    }
  }
  const others = claims.filter((claim) => !claim.merged);
  const own = others.filter((claim) => claim.statuses.length > 0).at(-1) ?? others.at(-1) ?? null;
  const task = own?.task ?? null;
  const page = own?.page ?? null;
  const statuses = own?.statuses ?? [];
  const last = statuses.filter((status) => status in OUTCOMES).at(-1);
  const outcome = last === undefined ? STOPPED : OUTCOMES[last];

  let findings = 0;
  for (const use of toolUses) {
    if (use.name !== "Agent" || use.input?.subagent_type !== "reviewer") continue;
    findings += countFindings(toolResults.get(use.id) ?? "");
  }

  return {
    session,
    run,
    started,
    ended,
    durationMin,
    turns: messages.size,
    models: [...new Set(families.filter(Boolean))],
    model: modelLabel(families),
    tokens: { input, output, total: input + output },
    task,
    page,
    statuses,
    outcome,
    findings,
  };
}

/** `R-0042 T3.1`, or `R-0042` alone for a run that claimed nothing (docs/guidelines.md §7). */
export function runName(number, task) {
  const id = `R-${String(number).padStart(4, "0")}`;
  return task ? `${id} ${task}` : id;
}

/**
 * The number after the highest `R-nnnn` among `titles`; 1 when there is none. `post` reads the
 * whole Runs data source for this, one page of 100 per request, and two sessions ending in the
 * same second could both read the same highest and take the same number — a duplicate `R-nnnn`
 * in the four-week data is that, not two runs of one session.
 */
export function nextNumber(titles) {
  let max = 0;
  for (const title of titles) {
    const match = String(title ?? "").match(/^R-(\d+)/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** The page the API creates for one row: properties in the shapes the Runs schema holds. */
export function rowProperties(summary, number) {
  const properties = {
    Name: { title: [{ text: { content: runName(number, summary.task) } }] },
    Outcome: { select: { name: summary.outcome } },
    Tokens: { number: summary.tokens.total },
    Findings: { number: summary.findings },
  };
  if (summary.started) properties.Started = { date: { start: summary.started } };
  if (summary.durationMin !== null) properties.Duration = { number: summary.durationMin };
  if (summary.model) properties.Model = { select: { name: summary.model } };
  if (summary.page) properties.Task = { relation: [{ id: summary.page }] };
  return properties;
}

/**
 * Post one row for `summary`. Effects injected: `token`, `board`, `client`. Returns
 * `{ posted, name, why }` — a missing token or a refused request posts nothing and says why,
 * because a hook that throws at session end helps nobody.
 */
export async function post(summary, { dir = process.cwd(), deps = {} } = {}) {
  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return {
      posted: false,
      why: `${TOKEN_VAR} is not in .env.local, so the row cannot be written`,
    };
  }
  const board = deps.board ? deps.board() : readBoard(dir);
  const api = deps.client ?? client(token, { fetch: deps.fetch });
  try {
    const existing = await api.tasks(board.runs_ds);
    const number = nextNumber(existing.map((row) => row.Name));
    const properties = rowProperties(summary, number);
    const created = await api.createPage(board.runs_ds, properties);
    return { posted: true, name: runName(number, summary.task), url: created?.url ?? null };
  } catch (error) {
    return { posted: false, why: error.message };
  }
}

/** The subagent transcripts written beside `path`: `<dir>/<session>/subagents/agent-*.jsonl`. */
export function sidechainsOf(path) {
  const dir = join(dirname(path), basename(path, ".jsonl"), "subagents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(dir, name));
}

/** Read a transcript file, and the subagent transcripts beside it, into its summary. */
export function summarize(path) {
  return parseTranscript(
    readFileSync(path, "utf8").split("\n"),
    sidechainsOf(path).map((file) => readFileSync(file, "utf8").split("\n")),
  );
}

/**
 * CLI. `node runs.mjs <transcript.jsonl> [--dry-run]` from a checkout: the summary, and the
 * row posted unless `--dry-run`. `node runs.mjs --hook` from SessionEnd: the hook JSON on
 * stdin names the transcript and the cwd; a session that was not a run writes nothing.
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  let path = args.find((arg) => !arg.startsWith("--")) ?? null;
  let dir = process.cwd();

  if (args.includes("--hook")) {
    try {
      const input = JSON.parse(await readStdin());
      path = typeof input.transcript_path === "string" ? input.transcript_path : null;
      if (typeof input.cwd === "string" && input.cwd !== "") dir = input.cwd;
    } catch {
      emit({ posted: false, why: "unreadable hook input" });
      return;
    }
  }
  if (path === null) {
    process.stderr.write("usage: runs.mjs <transcript.jsonl> [--dry-run] | runs.mjs --hook\n");
    process.exit(1);
  }

  let summary;
  try {
    summary = summarize(path);
  } catch (error) {
    emit({ posted: false, why: `the transcript could not be read: ${error.message}` });
    return;
  }
  if (!summary.run) {
    emit({ posted: false, why: "not a /ticket session", summary });
    return;
  }
  if (dryRun) {
    emit({ posted: false, why: "dry run", summary });
    return;
  }
  emit({ ...(await post(summary, { dir })), summary });
}

if (isMain(import.meta.url)) await main();
