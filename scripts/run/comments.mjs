#!/usr/bin/env node
/**
 * Step 0a — reading a Decision thread (docs/guidelines.md §4).
 *
 * The pipeline's own comments all begin with the prefix glyph; everything else on the thread
 * is the human's. A human comment newer than the last prefixed one is the answer this run
 * must assess, and it gets *exactly one* assessment. After two clarifying rounds on the same
 * question the pipeline stops posting and only reads — the two-round cap of §6, applied to
 * the board.
 *
 * Pure. The skill hands it what `get-comments` returned; deciding whether an answer resolves
 * the question is the skill's, and is the one thing here that is not countable.
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

/** The three-line body §4 requires. Always prefixed: a bare comment is not the pipeline's. */
export function decisionComment({ question, where, default: fallback, prefix = "⟡ " }) {
  return [`${prefix}Question   ${question}`, `Where      ${where}`, `Default    ${fallback}`].join(
    "\n",
  );
}

/** CLI: `{ "comments": [{text, created_time}], "prefix": "⟡ " }` on stdin. */
async function main() {
  const input = JSON.parse(await readStdin());
  emit(readThread(input.comments ?? [], input.prefix ?? "⟡ "));
}

if (isMain(import.meta.url)) await main();
