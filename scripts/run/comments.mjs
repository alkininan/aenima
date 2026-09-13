#!/usr/bin/env node
/**
 * Step 0a — reading a Decision thread, and the voice of every comment the run posts
 * (docs/guidelines.md §4).
 *
 * The pipeline's own comments all begin with the prefix glyph; everything else on the thread
 * is the human's. A human comment newer than the last prefixed one is the answer this run
 * must assess, and it gets *exactly one* assessment. After two clarifying rounds on the same
 * question the pipeline stops posting and only reads — the two-round cap of §6, applied to
 * the board.
 *
 * `compose` writes every comment a run can post, in plain sentences: what it hit, why it
 * could not pick alone, what it chose or would choose. No labels — where the gap lives is
 * said in words. The texts live here so they are one place and tested; the skill supplies
 * the sentences that need judgment and never the shape.
 *
 * Since T0.11 every task's thread is read, not only a Decision's, and a reply's shape is
 * partly countable: `mentions` and `permitted` say whether the human's word — `merge`,
 * `apply` — is on the thread, and the guard asks the same question of the API before it
 * lets the command through. `shapeOf` names the countable shapes; the rest is `assess`.
 *
 * Pure. Deciding whether an answer resolves a question, or whether a reply is a change to
 * the ticket or new work, is the skill's, and is the one thing here that is not countable.
 */

import { emit, isMain, readStdin } from "./cli.mjs";

/** The first prefixed comment is the Question; every later one is a clarifying round. */
export const CLARIFYING_CAP = 2;

const at = (comment) => String(comment?.created_time ?? "");

/**
 * Split a thread and say what the run may do with it.
 *
 * Returns `{ pipeline, human, unanswered, clarifyingRounds, mayPost }`:
 *   unanswered        human comments newer than the last prefixed one, oldest first
 *   clarifyingRounds  prefixed comments after the first — the Question does not count
 *   mayPost           false once the cap is reached; the run reads and stays silent
 */
export function readThread(comments = [], prefix = "⟡ ") {
  const ordered = comments.slice().sort((a, b) => at(a).localeCompare(at(b)));
  const isPipeline = (comment) => String(comment?.text ?? "").startsWith(prefix);

  const pipeline = ordered.filter(isPipeline);
  const human = ordered.filter((comment) => !isPipeline(comment));
  const lastPipelineAt = pipeline.length === 0 ? "" : at(pipeline.at(-1));

  return {
    pipeline,
    human,
    unanswered: human.filter((comment) => at(comment) > lastPipelineAt),
    clarifyingRounds: Math.max(0, pipeline.length - 1),
    mayPost: Math.max(0, pipeline.length - 1) < CLARIFYING_CAP,
  };
}

/**
 * True when a reply *begins* with the word — `merge`, `Merge it`, `apply, then carry on` —
 * case aside and punctuation aside. "Don't merge yet" and "after you merge" do not begin
 * with it, which is the whole of the rule: the word is the reply's point, not a mention in
 * passing (docs/guidelines.md §4). The guard and the preflight read the same test.
 */
export function mentions(text, word) {
  return new RegExp(`^\\W*${word}\\b`, "i").test(String(text ?? "").trim());
}

/**
 * The human's word, when the thread carries it: a reply beginning with `word`, newer than
 * the pipeline's last comment. The pipeline's own comments never count, whatever they say;
 * a `⟡ merged` note is the pipeline consuming the word, not repeating it.
 */
export function permitted(word, comments = [], prefix = "⟡ ") {
  const thread = readThread(comments, prefix);
  const found = thread.unanswered.find((comment) => mentions(comment.text, word)) ?? null;
  return {
    ok: found !== null,
    comment: found,
    why:
      found === null
        ? `no reply beginning with "${word}" newer than the run's last comment on the thread`
        : null,
  };
}

/** The sentence every migration comment carries, which is how a thread says it waits on one. */
export const MIGRATION_PHRASE = "This change adds a migration";

/** True when the pipeline's last comment on the thread is the migration question. */
export function awaitingMigration(thread) {
  return String(thread?.pipeline?.at(-1)?.text ?? "").includes(MIGRATION_PHRASE);
}

/**
 * The part of a reply's shape that is countable. `merge` is a Review task whose unanswered
 * reply begins with the word; `apply` is a Decision task waiting on a migration whose reply
 * begins with the word. Everything else is `assess`: change, new work, an answer that
 * resolves a question, a note, or a reply that needs a clarifying round — the skill's call.
 */
export function shapeOf(status, thread) {
  const said = (word) => (thread?.unanswered ?? []).some((c) => mentions(c.text, word));
  if (status === "Review" && said("merge")) return "merge";
  if (status === "Decision" && awaitingMigration(thread) && said("apply")) return "apply";
  return "assess";
}

/** The things a run says on a thread. */
export const KINDS = [
  "decision",
  "clarifying",
  "migration",
  "stale",
  "default",
  "change",
  "newWork",
  "merged",
  "applied",
  "noted",
  "setup",
];

/** A sentence ends in one full stop, whatever the caller handed in. */
const sentence = (text) => {
  const trimmed = String(text ?? "").trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** A clause with no trailing full stop, to sit inside a sentence. */
const clause = (text) =>
  String(text ?? "")
    .trim()
    .replace(/\.$/, "");

/**
 * One comment, prefixed, two to four plain sentences.
 *
 *   decision    { stopped, gap, fallback }  — what it stopped on, where the gap lives in
 *               words, what "default" would take
 *   clarifying  { readings: [a, b], fallback }
 *   migration   { file }
 *   stale       { date, branch }            — branch null when the run died before making one
 *   default     { gap, choice }             — a choice cheap to undo, taken and said
 *   change      {}                          — a Review reply folded in as an addendum
 *   newWork     { name, url }               — a reply drafted as its own Backlog task
 *   merged      { commit }                  — the human's "merge", done
 *   applied     { file }                    — the human's "apply", done
 *   noted       {}                          — a reply that asks for nothing
 *   setup       { step, where }             — a step only a human can do, said exactly
 */
export function compose(kind, fields = {}, prefix = "⟡ ") {
  switch (kind) {
    case "decision":
      return `${prefix}I've stopped on ${clause(fields.stopped)}. ${sentence(fields.gap)} If you say "default" I'll ${clause(fields.fallback)}.`;
    case "clarifying": {
      const [a, b] = fields.readings ?? [];
      return `${prefix}Thanks, I read that, but it still fits two readings: ${clause(a)}, or ${clause(b)}. If you say "default" I'll ${clause(fields.fallback)}.`;
    }
    case "migration":
      return `${prefix}This change adds a migration, ${clause(fields.file)}, and applying it to the shared database is your call. I've left it in the diff and stopped here. Once you've applied it, say so on this thread and the next run picks the ticket back up.`;
    case "stale":
      return fields.branch
        ? `${prefix}This run stopped partway on ${clause(fields.date)}. I've kept the branch as ${clause(fields.branch)} in case anything on it is worth salvaging, and started again from main.`
        : `${prefix}This run stopped partway on ${clause(fields.date)} before it made a branch, so there's nothing to salvage. I've started again from main.`;
    case "default":
      return `${prefix}${sentence(fields.gap)} A wrong guess here costs nothing to change, so I went with ${clause(fields.choice)} and kept going. Say the word if you'd rather something else.`;
    case "change":
      return `${prefix}I've read that as a change to this ticket and folded it into the body as an addendum. The task is back at Ready; the next run builds it on the same branch and pull request and brings it back to Review.`;
    case "newWork":
      return `${prefix}I've read that as new work rather than a change to this ticket, so I've drafted it as its own task at Backlog: ${clause(fields.name)} (${clause(fields.url)}). Set it Ready when you want it built.`;
    case "merged":
      return `${prefix}Merged into main at ${clause(fields.commit)} with a merge commit, and the task is Done. The release row follows.`;
    case "applied":
      return `${prefix}Applied ${clause(fields.file)} to the shared database. The ticket picks up from where it stopped.`;
    case "noted":
      return `${prefix}Read that, thanks. Nothing for me to do here, so I've left the ticket as it is.`;
    case "setup":
      return `${prefix}I've stopped on a step only you can do: ${clause(fields.step)}. ${sentence(fields.where)} Say "done" on this thread once it's in place and the next run carries on.`;
    default:
      throw new Error(`unknown comment kind: ${kind}`);
  }
}

/**
 * CLI. Read: `{ "comments": [{text, created_time}], "prefix": "⟡ " }` on stdin. Compose:
 * `{ "compose": { "kind": "stale", "date": "…", "branch": "…" }, "prefix": "⟡ " }`.
 */
async function main() {
  const input = JSON.parse(await readStdin());
  const prefix = input.prefix ?? "⟡ ";
  if (input.compose) {
    const { kind, ...fields } = input.compose;
    emit({ text: compose(kind, fields, prefix) });
    return;
  }
  emit(readThread(input.comments ?? [], prefix));
}

if (isMain(import.meta.url)) await main();
