# scripts/run

One run is `/ticket` — `.claude/skills/ticket/SKILL.md` — executing guidelines §5 once: one
run, one task. Everything countable in a step is a script here with a test beside it; the
skill holds the judgment and nothing else. Every script exports a function — its effects,
where it has any, injected so a test stays off the repo — and also runs as a command that
prints JSON for the skill to read back. `cli.mjs` is the shared helper (stdin, `emit`,
`isMain`) and is not a step. The step names and numbers below are §5's.

## 0 Preflight

Before anything else the run tends the ground it stands on: `prune.mjs` stamps the worktree
it is in as a run's and removes every stamped worktree earlier runs left that is clean,
unlocked, not its own, and either merged into `origin/main` or older than three days — a
person's worktree carries no stamp and is never touched — and a fresh worktree gets its
`node_modules` installed and its `.next/types` generated (`pnpm next typegen`), which the gate's
typecheck reads. Then the run reads the board, and since T0.11 it reads all of it in one
command: `threads.mjs` queries every task and every task's comments over the Notion API
through `notion.mjs` — the integration token in `.env.local`, never the connector, so forty
tasks cost forty requests rather than forty model turns — and returns the tasks with a human
reply newer than the pipeline's last prefixed comment, each with its status, the replies,
whether the two-round cap still allows a post, and the shape the words settle. `comments.mjs`
holds that reading: the prefixed comments are the pipeline's and everything else is the
human's; `mentions` says whether a reply *begins* with a word, `permitted` whether the human's
`merge` or `apply` is on the thread newer than the pipeline's last comment, and `shapeOf`
names the two countable shapes — `merge` on a task at Review, `apply` on a Decision waiting on
a migration — leaving `assess` for the skill: a change to the ticket, new work, an answer
that resolves a question, a note, or a clarifying round. The same script composes every
comment the run posts — decision, clarifying, migration, stale, default, change, newWork,
merged, applied, noted, setup — in plain sentences with the prefix, from the sentences the
skill supplies. `merge-detect.mjs` takes the Review tasks with their commits and asks `git
merge-base --is-ancestor` against `origin/main`, which is the only honest test of "merged" —
whether the human merged by hand or a run merged on the human's word; every task it returns
as merged becomes Done and, when main has moved past the newest release, a Releases row is
written. `stale.mjs` reads the In progress tasks against the repository's run marker: a fresh
marker names a live run and the run exits; a task with no marker, or a marker older than three
hours, is a run that died, and `stale.mjs --recover <id>` keeps its branch as
`t<id>-stale-<HHMM>` — committing anything uncommitted onto it first — so the task can be
claimed again from `origin/main` with one comment and no human.

## 1 Claim

`pick-next.mjs` chooses the task: top Ready by Priority (Must, Should, Could — never Won't),
then oldest created. The run sets it In progress and `claim.mjs` writes `aenima-run-active`
— task, page, branch, start time, session — into the repository's shared `.git` directory,
which `repo.mjs` locates and which is the same file from every worktree: the footprint the
guard reads to find the claimed task's thread before it lets a merge or a migrate through,
and the next preflight reads to tell a live run from a dead one, wherever either is running;
the skill never reasons about it. A run with nothing to claim may still write one thing:
`draft.mjs` composes the body of a task the pipeline proposes — from a reply asking for new
work, from a reviewer finding outside the ticket, or from an idle run's own red — headed by
the `Drafted by pipeline` callout with a link back to the task it came from, and it lands at
Backlog, never Ready. Then the run fills what is missing. `next-id.mjs` assigns a
`T<phase>.<n>` when the Name has none, taking the phase from the Epic and the number from the
highest already used within that epic; an Epic with no phase is a question, not a number to
invent. `version-drift.mjs` parses the task's Spec line and compares each cited version with
the document's header in the repo, so the report can say what changed since the ticket was
cut. Epic, Priority and Type are proposed by the skill, and a one-line body is expanded into
the seven sections of guidelines §2.

## 2 Inline

`spec-sections.mjs` returns every cited section verbatim from the repo, and the run writes
`docs/tickets/<id>.md`: the seven sections, then a Cited section holding that text. This
file is the whole of what the reviewer reads, so a section the script reports missing is
said to be missing in the file rather than silently left out.

## 3 Branch

`branch.mjs` fetches, then checks out `t<id>` — the ID lowercased, dot to hyphen. A branch
already on origin is reused, set to origin's copy, so a task sent back to Ready by a reply at
Review, or picked up again after its migration was applied, carries its branch and its pull
request with it; with no copy on origin the branch is new off `origin/main`. It reports
whether the run is in the primary checkout, in which case step 9 returns it to `main` however
the run ends; a scheduled run is in a worktree Desktop made for it and leaves it there for
`prune.mjs`. `AENIMA_RUN_BASE` overrides the base for one reason: a run whose own skill and
scripts are not yet on main.

## 4 Build

No script. Plan first, then the smallest complete implementation that meets the Criteria;
new logic gets a test, and each test is observed failing before it passes, with the mutation
and the count recorded for step 8. Where the ticket is silent the run stops only when a
wrong guess is expensive to undo (guidelines §4) — on a Decision exit `release.mjs` removes
the marker — and otherwise takes the stated default, says so in one comment, and keeps
building.

## 5 Review

The run invokes the `reviewer` subagent (`.claude/agents/reviewer.md`) with the ticket file
path and nothing else, so it reads the ticket and the diff cold rather than the author's
summary. `review-scope.mjs` gives the reviewer its list — the test files the ticket's Tests
section names plus every test file the diff touches — and the reviewer runs only those; the
Stop gate owns the full suite. Findings are Must or Should; every Must is fixed and the
reviewer re-invoked, three passes at most. A Must still standing after the third becomes an
open question, Shoulds are recorded in the report, and a finding outside the ticket's scope
becomes a Backlog task of Type Fix under the same Epic.

## 6 Migration

`migration-check.mjs` lists the `.sql` files the diff adds under `drizzle/`. If there are
any the run commits and pushes the branch, writes the report so far, releases the marker,
sets Decision and posts one migration comment naming the file. The human answers with one
word, `apply`, on the thread, and the next run applies it: the guard lets `db:migrate`
through only when `permission.mjs` has itself found that word on the claimed task's thread
over the API — the marker names the task, the token opens the board, the reply must be the
human's and newer than the pipeline's question — and the same check gates `gh pr merge` on
the word `merge`. The guard verifies; the model never asserts.

## 7 Gate

No script here. The Stop hook (`scripts/hooks/gate.mjs`) runs `pnpm lint && pnpm typecheck
&& pnpm test` in the cwd it is handed, and a red suite cannot close a session; the run does
not run them again for its benefit.

## 8 Report

The run writes `docs/reports/<id>.md` — ACs implemented each with its test, tests written
each observed red first as a table of test, mutation and count, reviewer passes and findings,
what changed since the ticket was cut, open questions — and `report-check.mjs` refuses it
while any test lacks its mutation or its count, or a test file in the diff is missing from
the record. Once it passes, the run mirrors it into the task body's Report section, writes
the ticket's build-log entry as its own file under `docs/log/`, and runs `log-index.mjs`,
which rewrites the build log's Tickets done list from that directory so two open pull
requests never edit the same lines.

## 9 Close

No script of its own. The run commits on the branch, pushes it, opens the PR against `main`
unless the branch already has one, sets the task's Commit to the short hash and its Status to
Review, removes the marker with `release.mjs`, and returns a primary checkout to `main`. It
never merges on its own: merging is the human's move, made with the word `merge` on the task
at Review, and the guard refuses `gh pr merge` until `permission.mjs` has read that word from
the board. `release.mjs` also runs from the SessionEnd hook, so a run that dies leaves no
marker behind for the next preflight to trust. The Runs row is a later ticket's.
