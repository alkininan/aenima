---
description: Run one dev-board ticket end to end, per docs/guidelines.md §5 — recover a stale run, assess every task's comments (change, new work, merge, apply, an answer), claim the top Ready task, build it on a branch, review it, report, set Review, exit. One run, one ticket.
disable-model-invocation: true
---

You are one run of the protocol in `docs/guidelines.md` §5. One run, one ticket. Work the steps
in order and exit — a session that built three things reasons worse about the fourth.

Board identity:

```!
cat .claude/board.json
```

Read `docs/guidelines.md` §3, §4, §5 and §7 before step 0. Every count, comparison and parse
below is a script under `scripts/run/`; run it rather than doing it by eye. What is left is
judgment, and that is your part.

**Every comment you post is composed by `scripts/run/comments.mjs`** and begins with the prefix
from `board.json`. A comment without it is a human's, and posting one unprefixed makes your own
next run misread the thread. You supply the sentences that need judgment — what you hit, where
the gap lives, in words — and the script supplies the shape:

    echo '{"compose":{"kind":"stale","date":"9 September","branch":"t0-97-stale-1607"},"prefix":"⟡ "}' | node scripts/run/comments.mjs

Kinds: `decision` (stopped, gap, fallback) · `clarifying` (readings, fallback) · `migration`
(file) · `stale` (date, branch or null) · `default` (gap, choice) · `change` · `newWork` (name,
url) · `merged` (commit) · `applied` (file) · `noted` · `setup` (step, where) · `resolved`.
Never set a task to Ready without a human comment that asks for it — an answer that resolves a
question, or a change request at Review. Every reply you assess ends with one ⟡ comment: that
comment is how the next run knows the reply was read.

## 0 Preflight

**Worktree first.** Stamp this checkout as a run's and remove the worktrees earlier runs left —
merged, or older than three days, clean and unlocked; a person's worktree carries no stamp and
is never touched:

    node scripts/run/prune.mjs

A fresh worktree has no `node_modules`; the gate and the suite need them. It has no
`.next/types` either, and the gate's typecheck reads Next's route types from there:

    test -d node_modules || pnpm install --frozen-lockfile
    test -d .next/types || pnpm next typegen

**a. A live run?** Query Tasks for `Status = 'In progress'`. With none, go on. Otherwise:

    echo '{"inProgress":[…]}' | node scripts/run/stale.mjs

`live` names a task → report `a run is in progress: <name>` and exit. Claim nothing, read
nothing. Keep the `stale` list for step d. (`claim.mjs` refuses to overwrite a live run's
marker besides, so a claim made in error here stops rather than clobbers.)

**b. Every task's comments.** One command reads the whole board over the API:

    node scripts/run/threads.mjs

`token: false` means `NOTION_TOKEN` is not in `.env.local`: say so in your report line and go
on to c — nothing else reads comments. Otherwise each `threads` entry is a task with a human
reply newer than the pipeline's last ⟡ comment, with its `Status`, the `unanswered` replies,
`mayPost`, and `shape`. Give each task **exactly one** assessment, and end it with one ⟡
comment on that task — except where `mayPost` is false: two clarifying rounds is the cap;
keep reading, post nothing.

- `shape: merge` (Review, the newest reply begins with *merge*). Claim it so the guard knows
  the task — `node scripts/run/claim.mjs --task <id> --page <page id> --branch t<id>` — then

      gh pr merge t<id> --merge

  The guard reads the thread itself before it lets that through; if it refuses, the reason
  says which of the four things was missing — quote it in your report and post nothing. On
  success post one `merged` comment with the merge commit's short hash. Either way, then:
  `node scripts/run/release.mjs`. Step c fetches, sets Done and writes the Release row; the
  remote branch is left for GitHub's own deletion and the worktree for `prune.mjs`.
- `shape: apply` (Decision waiting on a migration, the newest reply begins with *apply*). Only
  where `.env.migrate` exists — the primary checkout; a worktree has no admin URL and leaves
  the reply for a run that does, and says so in its report line. Claim it the same way, then
  check the ticket's branch out — `node scripts/run/branch.mjs <id>` reuses origin's copy,
  which is where the migration file is; the primary sits on `main` until then — and only then
  `pnpm db:migrate`; the guard reads the thread first. If it refuses, release the marker and
  post nothing. On success post one `applied` comment naming the file, set the task
  `In progress`, and continue from step 1's marker with this task: skip the pick, step 3 is
  already done, and the ticket carries on from where it stopped.
- `shape: assess`, task at **Review** — read the reply:
  - It asks for a change to what was built → append to the body an `# Addendum` section:
    the date, then the reply verbatim as a quote. Set `Ready`. Post one `change` comment. The
    next claim reuses the branch and the pull request.
  - It asks for work beyond this ticket → **New work**, below.
  - It asks for nothing → one `noted` comment.
  - Otherwise → one `clarifying` comment naming the two readings; status stays.
- `shape: assess`, task at **Decision** — the answer to the question:
  - It resolves the question with a single interpretation → set `Ready` and post one
    `resolved` comment. If the question named a spec section, note that patching that section
    is your first act after claim.
  - It asks for work beyond this ticket → **New work**.
  - It does not resolve it → one `clarifying` comment; status stays `Decision`.
- `shape: assess`, any other status — a reply on a Backlog, Ready, In progress or Done task:
  - It asks for work → **New work**.
  - It asks for nothing → one `noted` comment.
  - Otherwise → one `clarifying` comment.

**New work.** Draft the body — `echo '{"request":"<the reply>","from":{"name":"<task
name>","url":"<task url>"},"date":"<YYYY-MM-DD>","prefix":"⟡ "}' | node scripts/run/draft.mjs`
— and create one Tasks row at `Backlog`: Name an imperative of six words at most and no ID
(claim assigns it), the original's Epic, Priority `Should`, the Type from product-spec §4 the
reply describes. Never Ready. Then post one `newWork` comment on the original with the new
task's name and URL.

**c. Merged tickets.** Query Tasks for `Status = 'Review'`, then:

    echo '{"tasks":[{"Name":"…","Commit":"…","url":"…"}]}' | node scripts/run/merge-detect.mjs

Set every `merged` task to `Done`. If any became Done *and* `origin/main` is ahead of the newest
Releases row, create one Releases row: Name `YYYY-MM-DD <short hash>`, Commit, Date, Deploy
`https://aeni.ma`, Tasks the newly Done ones, Specs the four header versions at that commit.

**d. Stale runs.** Step a's `stale` list, from the script that reads the repository's marker
itself — one file for every worktree:

- Each `stale` task is a run that died partway. Recover it, no human needed — the branch is
  preserved, so a wrong guess costs nothing:

      node scripts/run/stale.mjs --recover <id>

  Post one `stale` comment on the task with the date and `renamed` (null when there was no
  branch). The stale task is the one you re-claim: skip step 1's pick, leave it `In progress`,
  and continue from step 1's marker with it. With several stale tasks, order them with
  `pick-next.mjs` over those rows alone: the first is yours, the rest go back to `Ready`.

**e. The mirrors.** Notion holds mirrors of the repo documents, each headed with the commit it
mirrors (§1, §2), and this is where they catch up with `main`:

    node scripts/run/mirror.mjs

`token: false` → say so in your report line and go on. Otherwise every `pages` entry with
`refresh: true` is behind `origin/main` — or a refresh that stopped partway, which comes first
in the list — and you rewrite it, in the order given, through the connector with
`allow_async: false` on **every** write: `replace_content` with the page's `sentinel` alone;
then `insert_content` at the end with each chunk file's text, in order (`cat` the file, pass the
text verbatim); then `update_content` replacing the sentinel with the page's `heading`. The
heading goes last so a page is either whole and headed with its commit, or visibly *refresh in
progress* — never in between. A page marked `missing` is one the Documents page does not list;
say so in the report and write nothing for it.

## 1 Claim

Query Tasks and pick:

    node scripts/run/pick-next.mjs --file <rows.json>

Nothing back → report `nothing to do` and exit. An idle run writes one thing at most: if
step 0 itself went red — a script that failed, a gate that refused, a worktree that could not
be removed — draft one task with `draft.mjs` (`from` null, `reason` the one sentence on what
went red) and create it at `Backlog`, Type `Fix`, Epic E0.2 Pipeline, Priority `Should`. A
preflight that met nothing wrong writes nothing. Otherwise set the picked task `In progress`
and write the marker — the run's footprint, in the repository's shared `.git` directory so every
worktree sees the same file, which the guard and the next preflight read and you never reason
about:

    node scripts/run/claim.mjs --task <id> --page <page id> --branch t<id-lowercase-hyphen>

Then fill what is missing:

- **No `T<n>.<n>` in the Name** → `node scripts/run/next-id.mjs` over the Epic's task names, and
  rename. An `error` back means the Epic carries no phase; that is a question, not a number to
  invent — set `Decision` and ask.
- **No Epic** → read the body and the Epics list, propose the one that fits, set it.
- **No Priority** → `Should`. **No Type** → the one from product-spec §4 the body describes.
- **Spec** → `node scripts/run/version-drift.mjs "<Spec>"`. Anything `drifted` goes in the report
  under *changed since this ticket was cut*. Build against the repo, which is the record.

If the body lacks the seven sections of §2, expand it into Objective · Build · Rules · Criteria ·
Tests · Done · Report from the Name, the body, the Spec and the cited sections, and put a callout
at the top: `Drafted by pipeline · <date> · confirm or edit in Notion`.

## 2 Inline

Write `docs/tickets/<id>.md`: the seven sections, then a `## Cited` section holding every cited
spec section verbatim from

    echo '{"cited":[{"doc":"product-spec","sections":["8"]}]}' | node scripts/run/spec-sections.mjs

This file is the whole of what the reviewer reads. A `missing: true` section means the ticket
cites something that is not there — say so in the ticket file rather than inlining nothing.
A body with an `# Addendum` section is a task sent back from Review by a reply: the ticket
file already exists, so add an `## Addendum` section to it with the reply, and the addendum
is what this round builds — the Criteria it names, or the reply read as one.

## 3 Branch

    node scripts/run/branch.mjs <id>

Record `primary` and `reused` from its output. If `primary` is true, this is the shared
checkout and step 9 returns it to `main` however the run ends. A scheduled run is in a
worktree Desktop made for it; it stays on its branch and the next run's step 0 removes the
worktree once the branch is merged. `reused` true means the branch was already on origin —
an addendum round, or a ticket continuing after its migration was applied — and the pull
request is already open: build on it, and step 9 pushes to it rather than opening another.

## 4 Build

Plan first. Then the smallest complete implementation that satisfies the Criteria — no more.

**Where the ticket is silent, stop only when a wrong guess is expensive to undo** (§4). A choice
is expensive if it touches the database schema or stored data, a public surface — a route, copy
a product user sees, an API shape — or would need a spec to record it. Then commit what you
have and push the branch (`git push -u origin <branch>`) so the next run finds it, release the
marker (`node scripts/run/release.mjs`), post one `decision` comment, set `Decision`, and
exit. Everything else: take the stated default, post one `default` comment saying what you
chose and why you could pick alone, and keep building. A step only a human can do — a
credential to create, a page to share — is not a guess: finish everything that does not need
it, and say exactly where it goes in one `setup` comment at close.

New logic gets a test, and **each test is observed failing before it passes**. Keep the record
as you go, per test: the mutation or missing file that made it red, and the count that went
green — `2 failed / 41 passed → 43 passed`. Step 8 refuses a report without it.

## 5 Review

Invoke the `reviewer` subagent with the ticket file path and nothing else. Do not summarise the
work for it: the delegation message is a claim, and a briefing that says what is true has thrown
the review away. The reviewer runs only the tests the ticket names and the test files the diff
touches (`scripts/run/review-scope.mjs`); the Stop gate owns the full suite.

Each finding is tagged **Must** or **Should**. Fix every Must, then re-invoke. **Three passes
maximum.** After the third, any remaining Must becomes an open question with owner `T-next`, and
Shoulds are recorded in the report. A finding outside this ticket's scope becomes a Backlog task:
Type `Fix`, the same Epic, body headed `Drafted by pipeline`.

## 6 Migration

    node scripts/run/migration-check.mjs

`waiting: true` → write the Report so far, commit and push the branch, release the marker
(`node scripts/run/release.mjs`), set `Decision`, post one `migration` comment naming the
file, and exit. The credential this run holds cannot apply a migration, and the guard refuses
the command until it has itself read the word *apply* from you on this task's thread. The
human answers with that one word; the next run in the primary checkout applies it (step 0a)
and carries the ticket on from here.

## 7 Gate

Nothing to do. The Stop hook runs lint, typecheck and test, and a red suite cannot close a
session. Do not run them again for its benefit.

## 8 Report

Write `docs/reports/<id>.md`: ACs implemented each with its test · **tests written, each
observed red first** — one table, columns `test · reddened by · red → green`, the record from
step 4 · reviewer passes and findings · changed since this ticket was cut · open questions. Then:

    node scripts/run/report-check.mjs docs/reports/<id>.md

A refused report is not written to the board: fill the record it names and run the check again.
Once it passes, mirror the report into the task body's `Report` section, then write the ticket's
build-log entry as its own file, `docs/log/<id>.md` — first line `# <id> — <title>`, second line
`_<UTC timestamp>_` (the commit is the board row's; leave it off), then the entry, a paragraph or
two in the build log's register — and regenerate the list in `docs/build-log.md` from the
directory:

    node scripts/run/log-index.mjs

Never edit that list by hand; its test refuses a stale copy.

## 9 Close

Commit on the branch, then:

    git push -u origin <branch>
    gh pr view <branch> --json url --jq .url || gh pr create --fill --base main

One ticket, one pull request: a reused branch already has one, and the push updated it. No
`gh` → put the compare URL in the report instead. Set the task's Commit to the short hash and
Status to `Review`. Release the marker: `node scripts/run/release.mjs`. If step 3 said
`primary`, `git checkout main`. Exit.

**Never merge on your own word.** Merging to main is the human's move, made with one reply —
*merge* — on the task at Review, and the guard refuses `gh pr merge` until it has read that
reply from the board itself. The Runs row is not yours to write: the SessionEnd hook runs
`scripts/run/runs.mjs` over this session's transcript once you have exited, and posts it with
the token — task, outcome, model, tokens, findings, all read from what happened, none of it
from what you say.
