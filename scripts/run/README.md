# scripts/run

One run is `/ticket` — `.claude/skills/ticket/SKILL.md` — executing guidelines §5 once: one
run, one task. Everything countable in a step is a script here with a test beside it; the
skill holds the judgment and nothing else. Every script exports a pure function and also runs
as a command that prints JSON for the skill to read back. `cli.mjs` is the shared helper
(stdin, `emit`, `isMain`) and is not a step. The step names and numbers below are §5's.

## 0 Preflight

Before claiming anything the run reads the board. `comments.mjs` splits a Decision task's
thread into the pipeline's prefixed comments and the human's, says which human comment is
still unanswered, and whether the two-round clarifying cap allows another post; deciding
whether an answer resolves the question is the skill's. `merge-detect.mjs` takes the Review
tasks with their commits and asks `git merge-base --is-ancestor` against `origin/main`, which
is the only honest test of "merged"; every task it returns as merged becomes Done and, when
main has moved past the newest release, a Releases row is written. The third check, stop if a
task is already In progress, is a board query with nothing to count.

## 1 Claim

`pick-next.mjs` chooses the task: top Ready by Priority (Must, Should, Could — never Won't),
then oldest created. The run sets it In progress and fills what is missing. `next-id.mjs`
assigns a `T<phase>.<n>` when the Name has none, taking the phase from the Epic and the
number from the highest already used within that epic; an Epic with no phase is a question,
not a number to invent. `version-drift.mjs` parses the task's Spec line and compares each
cited version with the document's header in the repo, so the report can say what changed
since the ticket was cut. Epic, Priority and Type are proposed by the skill, and a one-line
body is expanded into the seven sections of guidelines §2.

## 2 Inline

`spec-sections.mjs` returns every cited section verbatim from the repo, and the run writes
`docs/tickets/<id>.md`: the seven sections, then a Cited section holding that text. This
file is the whole of what the reviewer reads, so a section the script reports missing is
said to be missing in the file rather than silently left out.

## 3 Branch

`branch.mjs` fetches, then creates and checks out `t<id>` off `origin/main` — the ID
lowercased, dot to hyphen. It reports whether the run is in the primary checkout, in which
case step 9 returns it to `main` however the run ends. `AENIMA_RUN_BASE` overrides the base
for one reason: a run whose own skill and scripts are not yet on main. T0.9 moves runs to
worktrees and the primary distinction goes away.

## 4 Build

No script. Plan first, then the smallest complete implementation that meets the Criteria;
new logic gets a test, and each test is observed failing before it passes. Where the ticket
is silent the run stops and lists the question rather than assuming.

## 5 Review

No script. The run invokes the `reviewer` subagent (`.claude/agents/reviewer.md`) with the
ticket file path and nothing else, so it reads the ticket and the diff cold rather than the
author's summary. Findings are Must or Should; every Must is fixed and the reviewer
re-invoked, three passes at most. A Must still standing after the third becomes an open
question, Shoulds are recorded in the report, and a finding outside the ticket's scope
becomes a Backlog task of Type Fix under the same Epic.

## 6 Migration

`migration-check.mjs` lists the `.sql` files the diff adds under `drizzle/`. If there are
any the run writes the report so far, sets Decision and asks, in the §4 shape, whether to
apply the migration to the shared database; a human applies it. The guard hook already
refuses the migrate command — this is the run noticing in time, not the enforcement.

## 7 Gate

No script here. The Stop hook (`scripts/hooks/gate.mjs`) runs `pnpm lint && pnpm typecheck
&& pnpm test` in the cwd it is handed, and a red suite cannot close a session; the run does
not run them again for its benefit.

## 8 Report

No script. The run writes `docs/reports/<id>.md` — ACs implemented each with its test, tests
written each observed red first, reviewer passes and findings, what changed since the ticket
was cut, open questions — mirrors it into the task body's Report section, adds one line to
`docs/build-log.md` under Tickets done, and commits on the branch.

## 9 Close

No script. The run pushes the branch, opens the PR against `main`, sets the task's Commit to
the short hash and its Status to Review, and returns a primary checkout to `main`. It never
merges: merging is the human's move, and the guard hook refuses it. The Runs row is written
by the session-end script, which is T0.9's.
