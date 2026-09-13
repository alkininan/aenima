#!/usr/bin/env node
/**
 * A task the pipeline drafts — from a reply, from a finding, or from an idle run's red.
 *
 * Three places write a Backlog task without a human: a reply on any task that asks for new
 * work (T0.11, the New work shape), a reviewer finding outside the ticket's scope (§5 step
 * 5), and an idle run that found something wrong on the ground it stood on — a red gate, a
 * failed script — and has nothing to claim (T0.10 open question 11). All three land at
 * Backlog, never Ready: Backlog → Ready is the one human move (§3), and a task the pipeline
 * proposes is confirmed by that move. This composes the body: the seven sections of §2, thin
 * on purpose, headed by the callout that says who drafted it and from where.
 */

import { emit, isMain, readStdin } from "./cli.mjs";

export const CALLOUT = "Drafted by pipeline";

/** The first line of every drafted body. */
export function callout({ date, from = null, prefix = "⟡ " } = {}) {
  const source = from ? ` · from a comment on ${from.name} (${from.url})` : "";
  return `> ${prefix}${CALLOUT} · ${date}${source} · confirm or edit in Notion`;
}

/**
 * The body of a drafted task. `request` is the reply or the finding in the human's words;
 * `from` is `{ name, url }` of the task it came from, or null for an idle run's own filing;
 * `reason` is the idle case's one sentence on what went red.
 */
export function draftTask({ request, from = null, reason = null, date, prefix = "⟡ " }) {
  const ask = String(request ?? "").trim();
  const why = reason ? `${String(reason).trim().replace(/\.$/, "")}. ` : "";
  return [
    callout({ date, from, prefix }),
    "",
    "# Objective",
    `${why}${ask}`,
    "",
    "# Build",
    from
      ? `What the comment asks for, as written above. It was said on ${from.name}; read that task's body and report for the context.`
      : "What the line above asks for, as written. The run that filed this has no more than that.",
    "",
    "# Rules",
    "As the repository's: CLAUDE.md, AGENTS.md, docs/guidelines.md.",
    "",
    "# Criteria",
    `- AC1 ${ask}`,
    "",
    "# Tests",
    "- TC1 → AC1",
    "",
    "# Done",
    "`pnpm lint && pnpm typecheck && pnpm test`",
    "",
    "# Report",
    "",
  ].join("\n");
}

/** CLI: `{ "request": "…", "from": { "name": "…", "url": "…" } | null, "reason": "…", "date": "…", "prefix": "⟡ " }` on stdin. */
async function main() {
  const input = JSON.parse(await readStdin());
  emit({ body: draftTask(input) });
}

if (isMain(import.meta.url)) await main();
