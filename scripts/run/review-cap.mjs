#!/usr/bin/env node
/**
 * After each review pass — what the run does next, counted (T0.44).
 *
 * The review loop is capped at three passes, and the cap is a count in code rather than a
 * suggestion the reviewer follows. Pass 1 reads the whole diff; pass 2 reads the fixes; pass 3
 * reads only pass 2's Musts and answers on those. There is no pass 4. The reviewer writes the
 * pass it was handed into its verdict file, `docs/reviews/<id>.md`, as a line of its own —
 * `pass 2` — and this file reads that line, the verdict on the last line, and the findings'
 * tags:
 *
 *   PASS                     → close. Shoulds still standing are counted, and the closer files
 *                              them as one Backlog task rather than a fix round: a Should is
 *                              not fixed in the run.
 *   FINDINGS, pass 1 or 2    → build: the builder fixes the Musts, then the next pass.
 *   FINDINGS, pass 3         → decision: a Must the third pass still finds stops the run at
 *                              Decision under §4, with one comment.
 *
 * A verdict file with no pass line, or none at all, answers `decision`: a count nobody can read
 * is not a cap anybody enforced.
 */

import { readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";

/** The last pass there is. */
export const MAX_PASSES = 3;

/** A finding's tag at the head of its line: `1. Must — …`, `**2. Should** …`, `- Must: …`. */
const TAGGED = /^\s*(?:[-*]\s*|\d+\.\s*)?\**\s*(?:\d+\.\s*)?\**\s*(Must|Should)\b/gim;

/** `pass 2` on a line of its own, bold or not. */
const PASS_LINE = /^\s*\**\s*pass\s+(\d+)\s*\**\s*$/im;

/**
 * Read a verdict file's text: `{ pass, verdict, musts, shoulds }`. `pass` is null when the file
 * carries no pass line, `verdict` null when its last line is neither `PASS` nor `FINDINGS`.
 */
export function readVerdict(text) {
  const body = String(text ?? "");
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines.at(-1) ?? "";
  const verdict = last === "PASS" || last === "FINDINGS" ? last : null;
  const pass = Number.parseInt(body.match(PASS_LINE)?.[1] ?? "", 10);
  let musts = 0;
  let shoulds = 0;
  for (const match of body.matchAll(TAGGED)) {
    if (match[1].toLowerCase() === "must") musts += 1;
    else shoulds += 1;
  }
  return { pass: Number.isInteger(pass) ? pass : null, verdict, musts, shoulds };
}

/**
 * What comes after this verdict: `{ next, pass, musts, shoulds, why }`, `next` one of `close`,
 * `build` or `decision`. `text` is the verdict file's content, or null when there is none.
 */
export function nextStep(text) {
  if (text === null) {
    return {
      next: "decision",
      pass: null,
      musts: 0,
      shoulds: 0,
      why: "no verdict file was written",
    };
  }
  const read = readVerdict(text);
  if (read.pass === null) {
    return { next: "decision", ...read, why: "the verdict file carries no pass number" };
  }
  if (read.verdict === null) {
    return { next: "decision", ...read, why: "the verdict file ends in neither PASS nor FINDINGS" };
  }
  if (read.verdict === "PASS") {
    return {
      next: "close",
      ...read,
      why:
        read.shoulds === 0
          ? "no Must stands"
          : `no Must stands; ${read.shoulds} Should${read.shoulds === 1 ? "" : "s"} go to one Backlog task`,
    };
  }
  if (read.pass >= MAX_PASSES) {
    return {
      next: "decision",
      ...read,
      why: `pass ${read.pass} still finds a Must, and there is no pass ${read.pass + 1}`,
    };
  }
  return {
    next: "build",
    ...read,
    why: `pass ${read.pass} found Musts; pass ${read.pass + 1} reads the fixes`,
  };
}

/** CLI: `node review-cap.mjs docs/reviews/<id>.md`. */
function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: review-cap.mjs docs/reviews/<id>.md\n");
    process.exit(1);
  }
  let text = null;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    text = null;
  }
  emit(nextStep(text));
}

if (isMain(import.meta.url)) main();
