---
description: Run one dev-board ticket end to end, per docs/guidelines.md §5 — assess Decision comments, claim the top Ready task, build it on a branch, review it, report, set Review, exit. One run, one ticket.
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

**Every comment you post begins with the prefix from `board.json`.** A comment without it is a
human's, and posting one unprefixed makes your own next run misread the thread. Never set a task
to Ready without a human comment that resolves its question.

## 0 Preflight

**a. Decision comments.** Query Tasks for `Status = 'Decision'`. For each, `get-comments`, then:

    echo '{"comments":[{"text":"…","created_time":"…"}],"prefix":"⟡ "}' | node scripts/run/comments.mjs

Act on `unanswered` only, and give each **exactly one** assessment:

- It resolves the question with a single interpretation → set Status `Ready`. If the question's
  *Where* named a spec section, note that patching that section is your first act after claim.
- It does not → post one prefixed clarifying comment, and leave Status at `Decision`.
- `mayPost` is false → post nothing. Two clarifying rounds is the cap; keep reading, stay silent.

**b. Merged tickets.** Query Tasks for `Status = 'Review'`, then:

    echo '{"tasks":[{"Name":"…","Commit":"…","url":"…"}]}' | node scripts/run/merge-detect.mjs

Set every `merged` task to `Done`. If any became Done *and* `origin/main` is ahead of the newest
Releases row, create one Releases row: Name `YYYY-MM-DD <short hash>`, Commit, Date, Deploy
`https://aeni.ma`, Tasks the newly Done ones, Specs the four header versions at that commit.

**c. One run at a time.** If any task is `In progress`, report `a run is in progress: <name>` and
exit. Claim nothing. (Detecting a *stale* In progress is T0.9's.)

Do not refresh the Documents or Guidelines mirrors. That is T0.9's.

## 1 Claim

Query Tasks and pick:

    node scripts/run/pick-next.mjs --file <rows.json>

Nothing back → report `nothing to do` and exit, with no writes. Otherwise set it `In progress`,
then fill what is missing:

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

## 3 Branch

    node scripts/run/branch.mjs <id>

Record `primary` from its output. If true, this is the shared checkout and step 9 returns it to
`main` however the run ends. T0.9 moves runs to worktrees and this goes away.

## 4 Build

Plan first. Then the smallest complete implementation that satisfies the Criteria — no more. New
logic gets a test, and **each test is observed failing before it passes**; the report says so per
test. Where the ticket is silent, stop and list the question rather than assuming.

## 5 Review

Invoke the `reviewer` subagent with the ticket file path and nothing else. Do not summarise the
work for it: the delegation message is a claim, and a briefing that says what is true has thrown
the review away.

Each finding is tagged **Must** or **Should**. Fix every Must, then re-invoke. **Three passes
maximum.** After the third, any remaining Must becomes an open question with owner `T-next`, and
Shoulds are recorded in the report. A finding outside this ticket's scope becomes a Backlog task:
Type `Fix`, the same Epic, body headed `Drafted by pipeline`.

## 6 Migration

    node scripts/run/migration-check.mjs

`waiting: true` → write the Report so far, set `Decision`, post one prefixed comment:

    Question   apply migration <file> to the shared database?
    Where      this ticket
    Default    apply

and exit. The guard hook already refuses `db:migrate`; acting on the answer is T0.9's.

## 7 Gate

Nothing to do. The Stop hook runs lint, typecheck and test, and a red suite cannot close a
session. Do not run them again for its benefit.

## 8 Report

Write `docs/reports/<id>.md`: ACs implemented each with its test · tests written each observed
failing first · reviewer passes and findings · changed since this ticket was cut · open questions.
Mirror it into the task body's `Report` section. Add one line to `docs/build-log.md` under Tickets
done. Commit on the branch.

## 9 Close

    git push -u origin <branch>
    gh pr create --fill --base main

No `gh` → put the compare URL in the report instead. Set the task's Commit to the short hash and
Status to `Review`. If step 3 said `primary`, `git checkout main`. Exit.

**Never merge.** Merging to main is the human's move, and the guard hook refuses it.
