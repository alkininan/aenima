---
description: Run one dev-board ticket end to end, per docs/guidelines.md §5 — recover a stale run, assess every task's comments (change, new work, merge, apply, ready, an answer), claim the first Ready task in the board's order, build it on a branch, review it, report, set Review, exit. One run, one ticket.
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
url) · `merged` (commit) · `applied` (file) · `noted` · `setup` (step, where) · `resolved` ·
`gated` (reasons) · `reverted` (failed, merge, commit, name, url) · `readied` · `waiting` (blockers) ·
`cycle` (members) · `urgent` (count) · `refused` (what, why, files, settle).
A comment carries its kind in its own words, and the guard reads it against the thread before
the comment posts: a third clarifying round on one question waits, and so does a second comment
of one kind in one claim — say every default a claim takes in its one `default` comment. Every
other comment posts, cap or no cap. A step the guard let through that fails anyway always
reports, as one `refused` comment: what was refused, why, the files in the way, what would
settle it.
Never set a task to Ready without a human comment that asks for it — an answer that resolves a
question, a change request at Review, or `ready` on a Backlog task. The guard reads that last one
from the board before the connector's write goes through, and it refuses any comment you post
without the prefix: an unprefixed comment is the human's voice, and that voice is what grants the
words. Every reply you assess ends with one ⟡ comment: that
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

**The connector's query.** Steps a, c and e ask the board through the connector's query, which
draws on the workspace's shared usage limit. When the connector answers that the workspace has
*reached the usage limit for Query Data Source*, ask the same question over the token instead,
and say so in your report line:

    node scripts/run/rows.mjs --status "In progress"
    node scripts/run/rows.mjs --status "Review"
    node scripts/run/rows.mjs --releases
    node scripts/run/rows.mjs --id <id>

The first for step a, the next two for step c (`--releases` newest first), the last for step e.
Each row carries the `Name`, `Status`, `Commit` and `url` the steps below read.

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
`clarifyingRounds`, `mayClarify`, and `shape`. Give each task **exactly one** assessment, and
end it with one ⟡ comment on that task. The cap withholds one comment only: where `mayClarify`
is false and your assessment is a clarifying round, two clarifying rounds on that question is
the cap — keep reading, post nothing. Every other assessment posts its comment, cap or no cap.

- `shape: merge` (Review, the newest reply begins with *merge*). Claim it so the guard knows
  the task — `node scripts/run/claim.mjs --task <id> --page <page id> --branch t<id>` — then

      gh pr merge t<id> --merge

  The guard reads the thread itself before it lets that through; if it refuses, the reason
  says which of the four things was missing — quote it in your report and post nothing. If
  the guard lets it through and GitHub refuses — the pull request no longer merges cleanly —
  run `node scripts/run/conflicts.mjs t<id>` and post one `refused` comment: `files` its
  `files`, and `settle` what would settle them; the task stays at Review. On success post one
  `merged` comment with the merge commit's short hash. Any of the three, then:
  `node scripts/run/release.mjs`. Step c fetches, sets Done and writes the Release row; the
  remote branch is left for GitHub's own deletion and the worktree for `prune.mjs`.
- `shape: apply` (Decision waiting on a migration, the newest reply begins with *apply*). Only
  where `.env.migrate` exists — the primary checkout; a worktree has no admin URL and leaves
  the reply for a run that does, and says so in its report line. Claim it the same way, then
  check the ticket's branch out — `node scripts/run/branch.mjs <id>` reuses origin's copy,
  which is where the migration file is; the primary sits on `main` until then — and only then
  `pnpm db:migrate`; the guard reads the thread first. If it refuses, release the marker and
  post nothing. If the guard lets it through and the migration itself fails, post one
  `refused` comment with the error's first line and what would settle it, release the marker,
  and leave the task at Decision. On success post one `applied` comment naming the file, set the task
  `In progress`, and continue from step 1's marker with this task: skip the pick, step 3 is
  already done, and the ticket carries on from where it stopped.
- `shape: ready` (Backlog, the newest reply begins with *ready*). Set the task `Ready` through
  the connector first — the guard reads the thread itself before it lets that write through, and
  your own comment would consume the word — then post one `readied` comment. If the guard
  refuses, quote its reason in your report and post nothing.
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
(claim assigns it), the original's Epic, Priority `Medium`, the Type from product-spec §4 the
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
  and continue from step 1's marker with it. With several stale tasks, ask the board's order
  of those alone — `node scripts/run/pick-next.mjs --among <id>,<id>` reads them as if they were
  Ready — and `pick` is yours; the rest go back to `Ready`. A `pick` of null means every one of them is
  now blocked: all go back to `Ready`, and step 1 picks as usual.

**e. The deploy.** Main deploys with nobody watching, so once per commit of main the run asks the
live site from outside:

    node scripts/run/health.mjs

`changed: false` → main is the commit last checked; go on. `waiting: true` → the commit is
younger than the deploy window and the previous deployment would answer for it; say so in the
report line and go on. `ok: true` → say so in the report line and go on. `ok: false` → the merge
at the tip is reverted, no human needed:

    node scripts/run/revert.mjs
    git push origin HEAD:main
    git checkout <the previous branch it printed>

`revert.mjs` prepares one commit on a detached HEAD — the revert of the merge at
`origin/main`'s tip — and prints `push`, `merge`, `head`, `id` and `previous`. The push is your
own command so the guard reads it: it lets exactly that shape through, HEAD one commit past
`origin/main` with the tree main had before the merge, and nothing else that names main. An
`ok: false` from `revert.mjs` (the tip is not a merge commit, the tree is dirty) means nothing
to revert: quote its `why` in the report and go on. On success: query Tasks for the task whose
Name begins with `id`, set it `Backlog`; draft one Fix task with `draft.mjs` (`from` that task,
`reason` the `failedText` health printed), create it at `Backlog`, Type `Fix`, the same Epic,
Priority `Medium`; then post one `reverted` comment on the reverted task — `failed` the
`failedText`, `merge` and `commit` the two short hashes, `name` and `url` the Fix task's.

**f. The mirrors.** Notion holds mirrors of the repo documents, each headed with the commit it
mirrors (§1, §2), and this is where they catch up with `main` — after the deploy check, so a
revert it pushed is what they mirror:

    node scripts/run/mirror.mjs

`token: false` → say so in your report line and go on. Otherwise every `pages` entry with
`refresh: true` is behind `origin/main` — or a refresh that stopped partway, which comes first
in the list — and you rewrite it, in the order given, through the connector with
`allow_async: false` on **every** write: `replace_content` with the page's `sentinel` alone;
then `insert_content` at the end with each chunk file's text, in order (`cat` the file, pass the
text verbatim), and after each one read the page back with the chunk files written so far:

    node scripts/run/mirror.mjs --verify <page> <chunk file 0> … <this chunk's file>

`next: continue` → the next chunk. `next: rewrite` → the page reads short of what was sent — a
write cut off partway, which the heading would otherwise cover: start that page again,
`replace_content` with the `sentinel` alone and the chunks from the first, adding `--rewritten 1`
to every read-back from there on, and say so in your report line. `next: leave` → it read short
again: leave the sentinel standing, write no heading, say so in your report line and go on to the
next page; the next preflight refreshes it first. Once the last chunk reads back whole,
`update_content` replacing the sentinel with the page's `heading`. The heading goes last so a
page is either whole and headed with its commit, or visibly *refresh in progress* — never in
between, and never quietly cut short. A page marked `missing` is one the Documents page does not list;
say so in the report and write nothing for it.

## 1 Claim

The picker reads the board itself over the API — every task's Priority, Epic and Blockers, the
epics' names, and the threads it would comment on:

    node scripts/run/pick-next.mjs

`token: false` → say so in the report line and exit: without the token nothing reads Blockers.
Otherwise `pick` is the task to claim and `as` the priority it is claimed at — a Ready blocker
carries the highest priority of the tasks waiting on it. `blocked` and `cycles` are for the
report line. Post each of `notices` as one page-level comment on its task, its `text` exactly
as printed: a Ready task waiting on a blocker at Backlog (never move the blocker), a loop of
tasks blocking each other, three or more Ready tasks at Urgent. The script has already dropped
any notice the thread holds, so what it prints is what is new.

`pick` null → report `nothing to do` and exit. An idle run writes the notices and one thing more
at most: if step 0 itself went red — a script that failed, a gate that refused, a worktree that
could not be removed — draft one task with `draft.mjs` (`from` null, `reason` the one sentence
on what went red) and create it at `Backlog`, Type `Fix`, Epic E0.2 Pipeline, Priority
`Medium`. A preflight that met nothing wrong writes nothing else.

Otherwise set the picked task `In progress` and write the marker — the run's footprint, in the repository's shared `.git` directory so every
worktree sees the same file, which the guard and the next preflight read and you never reason
about:

    node scripts/run/claim.mjs --task <id> --page <page id> --branch t<id-lowercase-hyphen>

Then fill what is missing:

- **No `T<n>.<n>` in the Name** → `node scripts/run/next-id.mjs` over the Epic's task names, and
  rename. An `error` back means the Epic carries no phase; that is a question, not a number to
  invent — set `Decision` and ask.
- **No Epic** → read the body and the Epics list, propose the one that fits, set it.
- **No Priority** → `Medium`. **No Type** → the one from product-spec §4 the body describes.
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
`ok: false` means the claim cannot go on: post one `refused` comment with its `detail` and what
would settle it, release the marker, set `Decision`, and exit.

## 4 Build

Plan first. Then the smallest complete implementation that satisfies the Criteria — no more.

**Where the ticket is silent, stop only when a wrong guess is expensive to undo** (§4). A choice
is expensive if it touches the database schema or stored data, a public surface — a route, copy
a product user sees, an API shape — or would need a spec to record it. Then commit what you
have and push the branch (`git push -u origin <branch>`) so the next run finds it, post one
`decision` comment, release the marker (`node scripts/run/release.mjs`), set `Decision`, and
exit. Everything else: take the stated default and keep building, and say it in the claim's
one `default` comment — every default the claim takes, what you chose and why you could pick
alone. Hold that comment until the claim's defaults are all in: post it before the `decision`
or `migration` comment when the claim stops, or at close before `release.mjs`. Every comment of
a claim goes up while the marker still names it: the guard lets one comment of a kind through
per claim, reading the claim from the marker, so a second `default` is refused and never reaches
the thread. A step only a human can do — a
credential to create, a page to share — is not a guess: finish everything that does not need
it, and say exactly where it goes in one `setup` comment at close.

New logic gets a test, and **each test is observed failing before it passes**. Keep the record
as you go, per test: the mutation or missing file that made it red, and the count that went
green — `2 failed / 41 passed → 43 passed`. Step 8 refuses a report without it.

## 5 Review

Invoke the `reviewer` subagent with the ticket file path and nothing else. Do not summarise the
work for it: the delegation message is a claim, and a briefing that says what is true has thrown
the review away. The reviewer runs only the tests the ticket names and the test files the diff
touches (`scripts/run/review-scope.mjs`); the Stop gate owns the full suite. It writes its
verdict to `docs/reviews/<id>.md`, last line `PASS` when no Must stands — Shoulds sit above it
and are recorded in the report — and `FINDINGS` when one does: that file, not anything in this
transcript, is what the guard reads at close. Never write or edit it yourself — a verdict
the run wrote is the model's claim, and the guard's door would be open on nothing.

**The reviewer's model** comes from one chain: the model `.claude/agents/reviewer.md` pins, then
`.claude/settings.json`'s `fallbackModel` — never a model you pick. Invoke a pass without
`model`, so each pass starts again at the pinned model. When the call comes back an error rather
than a review, ask the script, with every model this pass has been called on, in order, and the
error verbatim — JSON-escaped, in a quoted heredoc, since the refusal itself carries an
apostrophe:

    node scripts/run/review-model.mjs <<'EOF'
    {"tried":["<the pinned model>"],"error":"<the error>"}
    EOF

`stop: false` → the call was refused for credits or availability: invoke the reviewer again with
`model` set to the `model` it printed and the same message — the ticket file path and nothing
else, a fresh session with no briefing; only the model changes. `stop: true` → the review did
not run, and a ticket never closes unreviewed: commit and push the branch, post the claim's
`default` comment if it holds one and one `refused` comment — `what` the review of this ticket,
`why` its `why` and then its `detail` in quotes, `settle` what would settle it — release the
marker, set `Decision`, and exit. Whichever model a pass ran on, the report names it (step 8).

**A pass that stops at its turn limit** comes back as a result, not an error: Claude Code's note
that the agent *stopped at its 30-turn limit before finishing*, over no report or a partial one.
What it holds is never a verdict, whatever it says. Ask the same script, `error` the note verbatim
and `resumed` the times this pass has already been resumed:

    node scripts/run/review-model.mjs <<'EOF'
    {"tried":["<the models this pass was called on>"],"error":"<the note>","resumed":0}
    EOF

`resume: true` → continue that same session once, `SendMessage` to the agent with one line and no
briefing — *Continue from where you stopped, and write the verdict file.* — and the report marks
the pass resumed. If it stops at the limit again, ask again with `"resumed":1`: `stop: true` → the
review did not run, and the stop is the one above.

Each finding is tagged **Must** or **Should**. Fix every Must, then re-invoke. **Three passes
maximum.** After the third, any remaining Must becomes an open question with owner `T-next`, and
Shoulds are recorded in the report. A finding outside this ticket's scope becomes a Backlog task:
Type `Fix`, the same Epic, body headed `Drafted by pipeline`.

## 6 Migration

    node scripts/run/migration-check.mjs

`waiting: true` → write the Report so far, commit and push the branch, post the claim's
`default` comment if it holds one and one `migration` comment naming the file, release the
marker (`node scripts/run/release.mjs`), set `Decision`, and exit. The credential this run holds cannot apply a migration, and the guard refuses
the command until it has itself read the word *apply* from you on this task's thread. The
human answers with that one word; the next run in the primary checkout applies it (step 0a)
and carries the ticket on from here.

## 7 Gate

Nothing to do here. The Stop hook runs lint, typecheck and test at every stop, and a red suite
cannot close a session. Do not run them for its benefit; step 9 runs the same gate once more,
before a self-merge, so the green for the pushed tree is on record where the guard reads it.

## 8 Report

Write `docs/reports/<id>.md`: ACs implemented each with its test · **tests written, each
observed red first** — one table, columns `test · reddened by · red → green`, the record from
step 4 · **reviewer passes and findings** — one table,
columns `pass · commit · model · resumed · verdict`, a row for every pass with
the model it ran on, `yes` under resumed when it stopped at its turn limit and was continued and
`no` otherwise, and `PASS` or `FINDINGS` under verdict — a pass that reached neither is not a row
— then the findings · changed since this ticket was cut · open questions. Then:

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
Status to `Review`. Then ask whether this diff is the run's own to merge:

    node scripts/run/gated.mjs

`ok: false` → this diff is one only the human's word merges: it adds a migration, or it weakens
one of the pipeline's own restraints — a guard rule, the gated list, a hook, the Stop gate, a
test — which `loosening.mjs` measured by running both sides rather than by reading the diff.
Post one `gated` comment, `reasons` its `reasons` exactly as printed: each carries the rule the
diff trips and what would ungate it, and neither is yours to word. The task stays at `Review`;
the human's *merge* there is the merge, made by the next run's step 0. `ok: true`, and the reviewer's last verdict file ends in `PASS` — which is the reviewer's word
that no Must stands — → the run merges its own work. First the gate, main's copy as the hooks
run it, on the pushed tree, so its green is on record:

    d=$(mktemp -d) && d=$(cd "$d" && pwd -P) && git archive -o "$d/scripts.tar" origin/main scripts && tar -xf "$d/scripts.tar" -C "$d" && printf '{"session_id":"%s","cwd":"%s"}' "$CLAUDE_CODE_SESSION_ID" "$PWD" | node "$d/scripts/hooks/gate.mjs"; s=$?; rm -rf "$d"; (exit $s)

Exit 0 is the green, written beside the marker as this tree's fingerprint; exit 2 is the same
red the Stop hook would give — fix it, commit, push, and run the gate again. Then:

    git checkout --detach
    git branch -D <branch>
    gh pr merge <branch> --merge --delete-branch

The guard opens its second door on its own reading — the verdict file, the gate's green for
this tree, the diff, and the pull request's head being this checkout's HEAD — and refuses with
the reason otherwise; a refusal
here means the task stays at `Review` with that reason in the report and no comment, and
`git checkout -B <branch> origin/<branch>` puts the local branch back. If the guard lets it
through and GitHub refuses — main moved and the pull request no longer merges cleanly — run
`node scripts/run/conflicts.mjs <branch>` and post one `refused` comment before `release.mjs`:
`files` its `files`, `settle` what would settle them. The task stays at `Review`, and the same
`git checkout -B` puts the local branch back. Detach and drop the
local branch first: gh's `--delete-branch` asks which branch is checked out only while a local
copy of the pull request's branch exists, and on a detached HEAD that question fails after the
merge has already landed; with no local copy gh goes straight on to delete the remote one. The
branch is on origin, so nothing is lost either way. On success: `git fetch origin`, then the merge
commit is `git rev-parse --short origin/main`; set the task `Done`, and create one Releases
row — Name `YYYY-MM-DD <short hash>`, Commit, Date, Deploy `https://aeni.ma`, Tasks this
task, Specs the four header versions at that commit — and relate the task to it. The next
run's step 0e checks the deploy.

Either way, release the marker: `node scripts/run/release.mjs`. If step 3 said `primary`,
`git checkout main`. Exit.

**Never merge on your own word.** The two doors are the guard's, read in code: the human's
*merge* on the task at Review, or the reviewer's `PASS` on file over a diff that adds no
migration and weakens no restraint. Nothing you say in this transcript opens either. The Runs row is not yours to write
either: the SessionEnd hook runs `scripts/run/runs.mjs` over this session's transcript once you
have exited, and posts it with the token — task, outcome, model, tokens, findings, all read from
what happened, none of it from what you say.
