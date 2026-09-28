---
description: Run one dev-board ticket end to end, per docs/guidelines.md §5 — recover a stale run, assess every task's comments (change, new work, merge, apply, ready, an answer), claim the first Ready task in the board's order, build it on a branch, review it, report, set Review, exit. One run, one ticket.
disable-model-invocation: true
effort: xhigh
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
of one kind in one claim — say every default a claim takes in its one `default` comment — and so
does a `refused` the thread already carries word for word, since an attempt the board still
grants is made again every run until what stands in the way is settled. Every
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

A fresh worktree has no `node_modules`; the gate and the suite need them. The gate's
typecheck reads Next's route types from `.next/types`, which a worktree may lack or may hold
generated for another tree; the script regenerates them whenever they are missing or stale:

    test -d node_modules || pnpm install --frozen-lockfile
    node scripts/run/route-types.mjs

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
  bring the branch here and give it main, because a branch that was pushed before anything
  else landed no longer merges on the build log alone (T0.36):

      node scripts/run/branch.mjs <id>
      node scripts/run/route-types.mjs
      node scripts/run/premerge.mjs

  `branch.mjs` frees the branch from the worktree that still holds it and checks it out here,
  where the dependencies the gate needs already are. `premerge.mjs` merges `origin/main` in: a
  clean merge, or a conflict confined to the build log's generated sections settled from main's
  copy and `log-index.mjs`. `ok: false` is a conflict that is nobody's to settle alone — post
  one `refused` comment with its `files` and what would settle them, leave the task at Review,
  and go on; nothing was pushed. `merged: true` means the branch moved, so the gate runs on the
  result and the branch is pushed before anything merges — the gate as step 9 runs it, then
  `git push origin HEAD:t<id>`. A red gate there is main meeting this branch badly, and it is
  not this run's to fix on a ticket it did not build: push nothing, post one `refused` comment
  naming the gate step that failed and that the branch needs a round of its own, and leave the
  task at Review. `merged: false` is a branch that already carries main: push nothing, gate
  nothing. Then

      gh pr merge t<id> --merge

  The guard reads the thread itself before it lets that through; if it refuses, the reason
  says which of the four things was missing — quote it in your report and post nothing. If
  the guard lets it through and GitHub refuses anyway,
  run `node scripts/run/conflicts.mjs t<id>` and post one `refused` comment: `files` its
  `files`, and `settle` what would settle them; the task stays at Review. On success post one
  `merged` comment with the merge commit's short hash. Any of the three, then:
  `node scripts/run/release.mjs`. Step c fetches, sets Done and writes the Release row; the
  remote branch is left for GitHub's own deletion and the worktree for `prune.mjs`.
- `shape: apply` (Decision waiting on a migration, the newest reply begins with *apply*). From
  whichever checkout this run is in. Claim it the same way — `node scripts/run/claim.mjs
  --task <id> --page <page id> --branch t<id>` — and then, **before** the branch is checked
  out:

      node scripts/run/apply.mjs --ref origin/t<id>

  the guard reading the thread first. Before, because the ticket's branch was cut before this
  script existed and checking it out would take the script away with it; `--ref` reads that
  branch's `drizzle/` out of git instead. The credential is the primary checkout's and stays
  there. If the guard refuses, release the marker and post nothing. `ok: false` is the apply
  itself answering no — the database's own error, or a migration drizzle would pass over in
  silence because another branch's landed first: post one `refused` comment with its `why`,
  which carries that sentence and what would settle it, release the marker, and leave the task
  at Decision — your word stands, so the next run makes the apply again once the thing in the
  way is settled, and you are not asked for it twice. `ok: true` → post one `applied` comment,
  its `file` the `tag` and `idx` of every entry of `applied`, or **no `file` at all** when
  `applied` is empty, which is the database having already carried them; then set the task
  `In progress`, run `node scripts/run/branch.mjs <id>`, and continue from step 1's marker
  with this task: skip the pick, step 3 is done there, and the ticket carries on from where it
  stopped. Step 8's report names every entry of `applied`, its `tag` and its `idx`.
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
report line and go on. Otherwise `outcome` is one of three. `outcome: up` → say so in the report
line and go on. `outcome: unknown` → a check never answered and none answered wrongly: the site
could not be reached from this machine, which is no verdict on the merge, so unknown never
reverts — the commit is left unrecorded and the next run asks again; quote its `why` in the report
line and go on. `outcome: down` → a check answered with the wrong status, and the merge at the
tip is reverted, no human needed:

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

`next: continue` → the next chunk. `next: rewrite` → the page does not read as what was sent — a
write cut off partway, which the heading would otherwise cover, or a chunk written twice: start
that page again, `replace_content` with the `sentinel` alone and the chunks from the first, adding
`--rewritten 1` to every read-back from there on, and say so in your report line. `next: leave` →
it read wrong again: leave the sentinel standing, write no heading, say so in your report line and
go on to the next page; the next preflight refreshes it first. A read-back that itself fails —
it comes back with no `next`, an API error or a timeout — is `next: leave` too. Once the last
chunk reads back whole, `update_content` replacing the sentinel with the page's `heading`. The
heading goes last so a page is either whole and headed with its commit, or visibly *refresh in
progress* — never in between, and never quietly cut short. A page marked `missing` is one the Documents page does not list;
say so in the report and write nothing for it.

## 1 Claim

The picker reads the board itself over the API — every task's Priority, Epic and Blockers, the
epics' names, and the threads it would comment on:

    node scripts/run/pick-next.mjs

`token: false` → say so in the report line and exit: without the token nothing reads Blockers.
Otherwise `pick` is the task to claim and `as` the priority it is claimed at — a Ready blocker
carries the highest priority of the tasks waiting on it. `blocked` and `cycles` are for the
report line, and `names` — every task's Name — is what `next-id.mjs` reads below.
Post each of `notices` as one page-level comment on its task, its `text` exactly
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

- **No `T<n>.<n>` in the Name** → the lowest number free in the Epic's phase, and rename:

      echo '{"epic":"E0.2 Pipeline","tasks":["T0.7 Setup","T0.8 Run", …]}' | node scripts/run/next-id.mjs

  `tasks` is `names` from the pick above — **every** task on the board, whatever its Epic and
  whatever its Status. The Epic gives the phase and nothing else: a number is one phase's, not
  one epic's, so the epic's own names alone answer a number another epic in that phase already
  holds, and a `tasks` left out answers one the board holds. The script adds what this
  repository carries — its branches and its `docs/` tree — so a number outlives the task that
  had it. Anything in `unread` is a half of that it could not read: say so in the report line,
  since the answer is then narrower than the rule. An `error` back means the Epic carries no
  phase; that is a question, not a number to invent — set `Decision` and ask.
- **No Epic** → read the body and the Epics list, propose the one that fits, set it.
- **No Priority** → `Medium`. **No Type** → the one from product-spec §4 the body describes.
- **Spec** → `node scripts/run/version-drift.mjs "<Spec>"`. Anything `drifted` goes in the report
  under *changed since this ticket was cut*. Build against the repo, which is the record.

If the body lacks the seven sections of §2, expand it into Objective · Build · Rules · Criteria ·
Tests · Done · Report from the Name, the body, the Spec and the cited sections, and put a callout
at the top: `Drafted by pipeline · <date> · confirm or edit in Notion`.

## 2–9 The phases

From here you are the orchestrator, and nothing more (T0.44). Each phase is a subagent with a
fresh context, its own tools and its own slice of this protocol: the **planner** does step 2,
the **builder** steps 3 and 4, the **reviewer** step 5, the **closer** steps 6 to 9 and every
stop. You never do a phase's work yourself, and you never summarise one phase to the next: the
handoff is the files the run already writes — `docs/tickets/<id>.md`, the branch,
`docs/reports/<id>.md`, `docs/reviews/<id>.md` — and each phase hands back one typed last line,
which is all you read of it.

**Before each phase, write it into the marker.** The guard reads it there (rule (j)): a push, a
`gh` call, a merge and a board write belong to `close` alone, an Edit or a Write to source to
`build` alone.

    node scripts/run/phase.mjs <plan|build|review|close> [--route <route>]

**Invoke each phase in the foreground** — `run_in_background: false` — with the paths it needs and
nothing else, and read its last line:

| phase | marker | agent | hand it | last line |
|---|---|---|---|---|
| 2 Inline | `plan` | `planner` | `docs/tickets/<id>.md` | `planned` · `stopped <reason>` |
| 3–4 Build | `build` | the route's builder | `docs/tickets/<id>.md <branch>` | `built <commit>` · `stopped <reason>` |
| 5 Review | `review` | the route's reviewer | `docs/tickets/<id>.md pass <n>` | `PASS` · `FINDINGS <n>` |
| 6–9 Close | `close` | `closer` | `docs/tickets/<id>.md <branch>` | `closed <commit>` · `stopped <reason>` |

**The route.** After the planner, and again after the builder, ask which effort the builder and
the reviewer run at:

    node scripts/run/route.mjs docs/tickets/<id>.md

It reads the ticket's Type and the paths it names — and the diff's, once there is one — against
the table in `.claude/board.json`, and prints the `route` and the two `agents` to invoke:
`builder` or `builder-medium`, `reviewer` or `reviewer-medium`. Pass the `route` to `phase.mjs`
with `--route` each time, so the Runs row says which one the run took. The Agent tool takes no
effort per invocation, which is why an effort is an agent file.

**A `stopped` line from any phase** goes straight to the close phase: `phase.mjs close`, then the
closer with the ticket path and the branch. The stop's words are already in
`docs/reports/<id>.md`; the closer pushes, comments, releases and sets `Decision`. A phase that
comes back with neither of its lines — an error, or a note that it stopped at its turn limit — is
a stop too: write `## Stopped` into `docs/reports/<id>.md` yourself, through Bash, with what came
back verbatim, and hand it to the closer the same way. The closer is handed a stop once: if the
closer itself comes back with neither line, do its stop yourself — the marker still names
`close` — one `refused` comment with what came back, `node scripts/run/release.mjs`, set
`Decision`, and exit.

**The review loop is capped at three passes, counted in code.** Pass 1 reads the whole diff; pass
2 reads the fixes; pass 3 reads only pass 2's Musts. After each pass:

    node scripts/run/review-cap.mjs docs/reviews/<id>.md

`next: close` → the close phase. `next: build` → `phase.mjs build`, the builder with the ticket
path, the branch and `docs/reviews/<id>.md` — it fixes the Musts and nothing else — then the next
pass. `next: decision` → write its `why` under `## Stopped` in `docs/reports/<id>.md` and hand it
to the closer: a Must the third pass still finds stops at Decision under §4. There is no pass 4.

The reviewer writes its verdict to `docs/reviews/<id>.md`, last line `PASS` when no Must stands —
Shoulds sit above it and are recorded in the report — and `FINDINGS` when one does: that file,
not anything in this transcript, is what the guard reads at close. Never write or edit it
yourself — a verdict the run wrote is the model's claim, and the guard's door would be open on
nothing.

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
`model` set to the `model` it printed and the same message — the ticket file path and the pass,
and nothing else, a fresh session with no briefing; only the model changes. `stop: true` → the
review did not run, and a ticket never closes unreviewed: write `## Stopped` — the review of this
ticket, its `why` and then its `detail` in quotes, and what would settle it — and hand it to the
closer, which posts it as one `refused` comment. Whichever model a pass ran on, the report names
it (step 8): write it under `## Reviewer passes` in `docs/reports/<id>.md`, through Bash —
pass, commit, model, resumed, verdict — as each pass comes back.

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

**Once the closer hands back its line, exit.** It released the marker on every path, and returned
the shared checkout to `main` when this is the one.

**Never merge on your own word.** The two doors are the guard's, read in code: the human's
*merge* on the task at Review, or the reviewer's `PASS` on file over a diff that weakens no
restraint and adds no migration your `apply` is still owed on. Nothing you say in this transcript opens either. The Runs row is not yours to write
either: the SessionEnd hook runs `scripts/run/runs.mjs` over this session's transcript once you
have exited, and posts it with the token — task, outcome, model, tokens per phase, route,
findings, all read from what happened, none of it from what you say.
