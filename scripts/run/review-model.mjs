#!/usr/bin/env node
/**
 * Step 5 — which model the reviewer runs on after a call is refused.
 *
 * The reviewer is pinned to a model in `.claude/agents/reviewer.md`, and from T0.19 to T2.9
 * every run met that model out of usage credits and re-ran the review on Opus, saying so in
 * its report. Right each time, and improvised each time: nothing said the run could. This
 * says it, as a script, so the choice is read from the configuration rather than made by the
 * model (T0.22).
 *
 * The chain is the definition's pinned model, then `.claude/settings.json`'s `fallbackModel`,
 * each once. A call refused for credits or availability moves one step along it; the review
 * runs again in a fresh session with the same one-line message, and only the model changes.
 * Any other failure — and a chain with no step left — is a stop: the review did not run, and
 * a ticket never closes unreviewed.
 *
 * A pass that stops at its `maxTurns` is neither (T0.23). Claude Code hands it back as a result
 * with a note to continue it, not as an error, and what it holds is partial — never a verdict.
 * It is resumed once, in the same session on the model it ran on; a second stop at the limit
 * is a stop like any review that could not run.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain, readStdin } from "./cli.mjs";

/** The reviewer's definition and the settings that name the fallback, from the repo root. */
export const AGENT_FILE = ".claude/agents/reviewer.md";
export const SETTINGS_FILE = ".claude/settings.json";

/** The model an agent definition's frontmatter pins, or null when it pins none or inherits. */
export function pinnedModel(agentText) {
  const frontmatter = String(agentText ?? "").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const model = frontmatter.match(/^model:\s*(\S+)\s*$/m)?.[1] ?? null;
  return model === null || model === "inherit" ? null : model;
}

/** `fallbackModel` from the settings file, as a list — the setting may be one string. */
export function fallbackModels(settingsText) {
  const fallback = JSON.parse(String(settingsText ?? "{}")).fallbackModel ?? [];
  return (Array.isArray(fallback) ? fallback : [fallback]).map(String).filter(Boolean);
}

/**
 * The configured chain: the pinned model, then each fallback, every model once. A definition
 * that pins no model leaves the chain at the fallbacks, and its first call runs on the session's
 * model, which is not in it — an unpinned reviewer has no fallback, and a refusal is a stop.
 */
export function reviewChain({ agent, settings }) {
  const chain = [pinnedModel(agent), ...fallbackModels(settings)].filter(Boolean);
  return chain.filter(
    (model, i) => chain.findIndex((m) => m.toLowerCase() === model.toLowerCase()) === i,
  );
}

/** The chain as this checkout configures it. */
export function readChain(root = process.cwd(), read = (path) => readFileSync(path, "utf8")) {
  return reviewChain({
    agent: read(join(root, AGENT_FILE)),
    settings: read(join(root, SETTINGS_FILE)),
  });
}

/**
 * Claude Code's note on a subagent that reached its `maxTurns`: "NOTE: this agent stopped at its
 * 30-turn limit before finishing. …", followed by no report or by partial output.
 */
export const TURN_LIMIT = /\bthis agent stopped at its \d+-turn limit\b/i;

/**
 * Why a reviewer call came back without a review: `turn-limit`, `credits`, `availability`, or
 * `other`.
 *
 * `turn-limit` is the note above, read first, since the partial output under it may say
 * anything — a `PASS` included. Only a refusal from the model's API counts for credits or
 * availability, which Claude Code reports as "…an API error: … (error type rate_limit, HTTP
 * 429, …)" or "API Error: 429 …"; a connection lost mid-response is the service not answering,
 * so it is availability. A status is read where a status stands, never as any three digits in
 * the message: "max_tokens: 512" is a bad request, not a server that did not answer.
 */
export function causeOf(error) {
  const text = String(error ?? "");
  if (TURN_LIMIT.test(text)) return "turn-limit";
  if (!/\bAPI error\b/i.test(text)) return "other";
  const status = text.match(/\bHTTP (\d{3})\b/i)?.[1] ?? text.match(/\bAPI Error: (\d{3})\b/i)?.[1];
  if (
    status === "429" ||
    /\berror type rate_limit\b|\brate_limit_error\b|\busage credits\b|\bcredit balance\b/i.test(
      text,
    )
  ) {
    return "credits";
  }
  if (
    status?.startsWith("5") ||
    /\berror type overloaded\b|\boverloaded_error\b/i.test(text) ||
    /\bconnection (lost|reset|closed)\b/i.test(text) ||
    /\bnot_found_error\b[\s\S]*\bmodel\b/i.test(text)
  ) {
    return "availability";
  }
  return "other";
}

/**
 * The step after a call that came back without a review. `tried` is every model this pass has
 * been called on, in order, which must be the start of the chain — a model from anywhere else is
 * the run's own pick. Each pass starts again at the pinned model, so a second pass on a model
 * still out of credits falls back the way the first did. `resumed` is how many times this pass
 * has already been resumed at its turn limit. Returns `{ chain, cause, stop, resume, model, why,
 * detail }`: `resume` true when the pass is continued in its own session on `model`, the model
 * it ran on; otherwise `model` the one to call next in a fresh session when `stop` is false;
 * `why` the sentence a stop reports, `detail` the failure's first line.
 */
export function nextReviewer({ chain = [], tried = [], error, resumed = 0 }) {
  const cause = causeOf(error);
  const detail = String(error ?? "")
    .split("\n")[0]
    .trim();
  const stop = (why) => ({ chain, cause, stop: true, resume: false, model: null, why, detail });
  const named = chain.join(", ") || "none";

  const inOrder =
    tried.length > 0 &&
    tried.every((model, i) => String(model).toLowerCase() === String(chain[i]).toLowerCase());
  if (!inOrder) {
    return stop(
      `the models tried (${tried.join(", ") || "none"}) are not the start of the configured chain — ${named}`,
    );
  }
  if (cause === "turn-limit") {
    if (resumed >= 1) {
      return stop("the reviewer stopped at its turn limit twice, so the review did not run");
    }
    return { chain, cause, stop: false, resume: true, model: tried.at(-1), why: null, detail };
  }
  if (cause === "other") {
    return stop(
      "the reviewer's call failed for a reason that is neither credits nor availability, so the review did not run",
    );
  }
  const model = chain[tried.length];
  if (model === undefined) {
    return stop(
      `every model in the configured chain — ${named} — refused the call, so the review did not run`,
    );
  }
  return { chain, cause, stop: false, resume: false, model, why: null, detail };
}

/** CLI: `echo '{"tried":["fable"],"error":"…","resumed":0}' | node review-model.mjs`. */
async function main() {
  const input = JSON.parse((await readStdin()) || "{}");
  emit(
    nextReviewer({
      chain: readChain(),
      tried: input.tried ?? [],
      error: input.error,
      resumed: Number(input.resumed ?? 0),
    }),
  );
}

if (isMain(import.meta.url)) await main();
