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
 * `compose` writes the five comments a run can post, in plain sentences: what it hit, why it
 * could not pick alone, what it chose or would choose. No labels — where the gap lives is
 * said in words. The texts live here so they are one place and tested; the skill supplies
 * the sentences that need judgment and never the shape.
 *
 * Pure. Deciding whether an answer resolves the question is the skill's, and is the one
 * thing here that is not countable.
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

/** The five things a run says on a thread. */
export const KINDS = ["decision", "clarifying", "migration", "stale", "default"];

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
