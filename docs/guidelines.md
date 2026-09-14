<!-- guidelines.md · v1.7 · in the repo · every run leaves a Runs row and the mirrors keep up: §2
     the Runs row's fields as the session-end script reads them from the transcript, the
     Documents mirrors refreshed header-last under a sentinel; §5 the mirror step in preflight,
     the Runs row from the SessionEnd hook, the integration token as a writer too, prune's
     three-hour floor; §8 names T0.12 as it now is.
     v1.6 · a comment on the board is enough: §3 the shapes a reply
     takes and their transitions — change, new work, merge, apply — §4 merge and apply as the
     words, every task's thread read each run; §5 the thread read over the API, the guard's own
     check of the word before a merge or an apply, the integration token in the capability
     boundary, an idle run's one filing; §8 names T0.11 as it now is.
     v1.5 · §5 puts /ticket on a schedule and says how it is turned
     on and off and what it costs idle; the marker and the gate's fingerprint move to the shared
     .git directory; worktrees, the capability boundary, per-ticket logs; §8 names T0.10 and T0.11
     as they now are. v1.4 · §4 stops only when a wrong guess is expensive and speaks in plain
     sentences; §5 carries the run marker, stale-run recovery, the reviewer's scope and the
     red-first record; §9 states its closed gaps in the past tense -->

# aenima — Dev board guidelines

This board is aenima's own Development backlog (product-spec §11), run on aenima itself before
any customer sees one. Four surfaces, four jobs:

| Surface | Job |
|---|---|
| Notion · `dev` teamspace | Queue and conversation. Where tasks wait, where questions are asked and answered. |
| Repo · `~/dev/aenima` | Record. Specs, tickets as claimed, reports, build log. The only editing surface for documents. |
| Claude chat · this project | Discussion and ticket authoring. Writes tasks into the board through the Notion connector. |
| Claude Code · Desktop Code tab | Execution. One scheduled run an hour claims one task, builds it, reviews it, reports. |

Two copies both claiming truth is the failure aenima exists to prevent. Notion never holds a
document; it holds machine-written mirrors of documents, each headed with the commit it mirrors.

---

## 1. Structure

```
dev  (teamspace)
└── Admin  (page — canonical home; build your own pages as linked views of these)
    ├── Guidelines   page   · mirror of docs/guidelines.md
    ├── Documents    page   · six sub-pages, mirrors of the repo docs
    ├── Tasks        database
    ├── Epics        database
    ├── Roadmap      database  (phases)
    ├── Releases     database
    └── Runs         database
```

Everything under Admin is created once and refreshed by the pipeline. Views on other pages are
yours; hide or show what you like there.

---

## 2. Databases

Writer column: **H** human · **M** machine (pipeline) · **F** formula, nobody sets it.

### Tasks

| Property | Type | Values | Writer | Notes |
|---|---|---|---|---|
| Name | title | `T3.1 Slice PRD into items` | H, M | ID + imperative, six words max. ID assigned by M at claim if missing. |
| Status | status | Backlog · Ready · In progress · Decision · Review · Done | H for Backlog→Ready; M for all else | See §3. |
| Priority | select | Must · Should · Could · Won't | H | MoSCoW. Default Should. Never used in bodies with this meaning — in bodies Must/Should mean check severity. |
| Type | select | Feature · Enhancement · Technical · Content · Experiment · Fix · Spike | H, M | product-spec §4, exactly. |
| Epic | relation → Epics | | H, M | Proposed by M at claim if empty. |
| Spec | text | `product-spec v1.3 §8, §11 · design-spec v2.15 §4` | H, M | Sections cited + versions cited against. Hidden. |
| Commit | text | short hash | M | Last commit on the task branch. Hidden. |
| Release | relation → Releases | | M | Set when merged. |
| Run | relation → Runs | | M | Every run that touched this task. Hidden. |

Body template — seven sections, one word each:

```
Objective   one paragraph: what exists when this is done, and for whom
Build       what to build. Reference spec sections; never re-type them.
Rules       constraints that cost something to learn (NFC not NFKC, .nullable() never .optional())
Criteria    AC1 … ACn — each an observable outcome a tester can verify (GWT where it fits)
Tests       TC1 → AC1 … — every AC covered, every TC names its AC, no orphans (§7.5)
Done        exact commands: pnpm lint && pnpm typecheck && pnpm test [&& pnpm e2e]
Report      written by M at close — see §5 step 8
```

A task you create with a one-line body is legal. At claim, M expands it into this template,
marks the top of the body *Drafted by pipeline · run R-nnnn*, and proceeds.

### Epics

| Property | Type | Values | Writer |
|---|---|---|---|
| Name | title | `E3.2 Slicing engine` | H, M |
| Phase | relation → Roadmap | | H |
| Tasks | relation ← Tasks | | (dual of Task.Epic) |
| Spec | text | | H |
| Status | formula | Planned · Active · Done | F — all tasks Done → Done; any task past Backlog → Active; else Planned |

Body: Objective. Epics are user-visible capabilities, never document sections (§7.5; the slicing
note is in build-log, On the horizon): slicing by section produces tasks that all touch the same
code.

### Roadmap (phases)

| Property | Type | Values | Writer |
|---|---|---|---|
| Name | title | `Phase 3 Authoring` | H |
| Dates | date range | | H |
| Epics | relation ← Epics | | (dual of Epic.Phase) |
| Status | formula | Planned · Active · Done | F — same rule over epics |

Body: Goal · Criteria (what must be true for the phase to be over). Timeline view is the roadmap.

### Releases

| Property | Type | Writer | Notes |
|---|---|---|---|
| Name | title | M | `2026-09-03 a1b2c3d` — date + main commit |
| Date | date | M | |
| Commit | text | M | merge commit on main |
| Deploy | url | M | Vercel production URL for that commit |
| Tasks | relation → Tasks | M | tasks whose branch is in this merge |
| Specs | text | M | spec versions at that commit |

You merge to main by hand. The next run detects the merge and writes the row. You never fill a form.

### Runs

| Property | Type | Values | Writer |
|---|---|---|---|
| Name | title | `R-0042 T3.1` | M |
| Task | relation → Tasks | | M |
| Started | date-time | | M |
| Duration | number (min) | | M |
| Model | select | Fable · Opus · Fable→Opus | M — third value means the session fell back |
| Tokens | number | input + output, cache reads excluded | M |
| Outcome | select | Done · Decision · Stopped | M — "Welcoming, never alarming" (§1): no "Failed" |
| Findings | number | reviewer findings raised | M |

Written by a script at session end from the local transcript, posted with a Notion integration
token. No model call. This is the data for park rate, findings per ticket, and the four-week
weight tuning. Since T0.12 the script is `scripts/run/runs.mjs`, run by the SessionEnd hook over
the transcript Claude Code wrote: the task from the claim command the skill ran, Started and
Duration from the first and last timestamps, Model from the assistant messages (`Fable→Opus`
when both appear), Tokens as input plus output, cache reads and cache writes both excluded, counted once per API
message — a message written as several content-block lines repeats its usage on each, and
T0.10's table counted lines —
Outcome from the last Status the run wrote on its task (Review is Done, Decision is Decision,
anything else is Stopped, an idle run included), Findings from the reviewer's replies. A run
that claimed nothing is `R-nnnn` alone with no Task. A session that was not a `/ticket` writes
no row.

### Documents

Seven sub-pages: `product-spec` · `design-spec` · `CLAUDE` · `AGENTS` · `build-guide` ·
`build-log` · `schema`. The page is headed, verbatim: **Machine-written mirrors of the repo
documents.** *Each page is refreshed from `main` at the start of every pipeline run and headed
with the commit it mirrors. The repo is the only editing surface; nothing typed here survives the
next run.* Nobody types here. Since T0.12 the refresh is §5's step 0: `scripts/run/mirror.mjs`
reads each page's first block over the API for the commit it claims and plans the pages behind
`main`; the run rewrites each through the connector **header-last** — a *refresh in progress*
callout first, the document in chunks, the *Mirrored from* heading last — so a page is either
whole and headed with its commit or visibly in progress, never in between. A sentinel still
standing at the next preflight is a write that died, and that page is refreshed first. The
Guidelines page is refreshed the same way.

---

## 3. Status machine

| From | To | Who | Trigger |
|---|---|---|---|
| — | Backlog | H or M | Created. Everything starts here, including tasks the pipeline creates from findings, from a reply on any task that asks for new work, and from an idle run's own red. |
| Backlog | Ready | **H only** | Your go. The one human move on the board. |
| Ready | In progress | M | Run claims it. A branch already on origin is reused, with its pull request. |
| In progress | Review | M | Branch pushed, Report written. |
| In progress | Decision | M | Run stopped on a question, or a migration awaits your apply. |
| Decision | Ready | M | Your comment assessed as resolving — see §4. No manual override. |
| Decision | In progress | M | Your reply on a migration question says `apply`: the run applies it, the guard having read the word from the board, and carries the ticket on — see §4. |
| Review | Ready | M | Your reply at Review asks for a change: folded into the body as an addendum; the next run builds it on the same branch and pull request and brings it back to Review. |
| Review | Done | M | Your reply at Review says `merge`: the run merges the pull request with a merge commit, the guard having read the word from the board. Release row written. |
| In progress | Ready | M | A stale run recovered while another stale task was claimed first — see §5 step 0. |
| Review | Done | M | Next run finds the branch merged into main by hand. Release row written. |

Nothing is ever set backwards by a human. "Status is derived, never declared" (§1) applied to the
board. A comment is enough: you never open Claude Code or GitHub to change, merge, apply or file.

---

## 4. Decision protocol

**A run stops only when a wrong guess is expensive to undo.** A choice is expensive if it touches
the database schema or stored data, a public surface — a route, copy a product user sees, an API
shape — or would need a spec to record it. Everything else is cheap: the run takes the stated
default, says so in one comment, and keeps building. A developer surface — a hook's output, a
script's message, a document the run itself owns — is not public. Smoke B's release-message
wording would not have stopped under this rule; the guard's first refusal text would not either.

When a run does stop it sets Decision and posts **one** comment, in plain sentences and with no
labels: two or three of them — what it hit, why it could not pick alone, what it would choose.
Where the gap lives is said in words ("this isn't written down anywhere", "§7.2 says both
things"), never as a field:

```
⟡ I've stopped on the release wording. The body asks for "the agreed wording" and that isn't
written down anywhere, not in the ticket and not in the specs. If you say "default" I'll use
build-guide §6's own sentence.
```

The same voice carries every comment the pipeline writes — a stop, a clarifying round, a migration
waiting, a stale run recovered, a default taken — and `scripts/run/comments.mjs` composes all
five, so the voice is one place and tested. A migration reads: *This change adds a migration,
`drizzle/0013_….sql`, and applying it to the shared database is your call. I've left it in the
diff and stopped here.* A default taken reads: *…A wrong guess here costs nothing to change, so I
went with "…" and kept going. Say the word if you'd rather something else.*

**Every comment the pipeline writes begins with `⟡ `**, and nothing else does. That glyph is how
a run tells its own voice from yours on a thread it did not start — there is no author field it
can trust for that. The prefix lives in `.claude/board.json`; a comment posted without it makes
the next run misread the thread as waiting on you.

**The pipeline never sets a task to Ready without a comment from you that resolves the
question.** The one exception is §3's return of a task to Ready whose Ready you already gave: a
preflight that recovers two stale runs claims one and returns the other, and your go at Backlog →
Ready is not withdrawn by a run dying. Backlog → Ready is the one human move (§3), and Decision → Ready is the same move
spelled differently: your answer is the confirmation. A run that set Ready on its own reading
would be confirming its own proposal.

Where the gap lives is fault attribution (§8): if it is in a spec, the answer is a spec patch, not
a comment.

At the start of every run, before claiming anything, the pipeline reads **every task's thread**
for a comment from you newer than its own last comment there. Each such comment gets **exactly
one assessment**, and the assessment ends with one ⟡ comment — that is how the next run knows
the reply was read. What the assessment can be depends on where the task sits:

- **At Review**, a reply that asks for a change to what was built is folded into the body as an
  addendum and the task goes back to Ready; the next run reuses the branch and the pull request,
  builds the change, has it reviewed, and brings the task back to Review. One ticket, one pull
  request, however many rounds. A reply that begins with the word **`merge`** merges the pull
  request with a merge commit, and the task is Done. A reply that asks for work beyond the
  ticket is new work.
- **At Decision**, a reply that resolves the question with one interpretation → status Ready. If
  the gap was placed in a spec, the run's first act after claim is patching that section in the
  repo and bumping the version. The answer lives in the document; the comment is where you said
  it. On a migration question, a reply that begins with the word **`apply`** applies it and the
  ticket carries on from where it stopped. A reply that does not resolve the question → one
  clarifying comment, in the same voice, naming the two readings it cannot pick between; status
  stays Decision.
- **Anywhere**, a reply that asks for something beyond the task it is on becomes **new work**: one
  task drafted from your words at Backlog, headed `⟡ Drafted by pipeline`, with a ⟡ note on the
  original linking it. Never Ready — Backlog → Ready stays yours. A reply that asks for nothing
  gets a ⟡ note and nothing else. Anything the run cannot place gets one clarifying comment.
- After two clarifying rounds on the same question the pipeline stops asking and waits. It never
  stops assessing: your next comment is read like any other. Two-round cap, §6, applied to itself.

**The two words are verified in code.** `merge` and `apply` are the two replies with consequences
outside the board, and neither is taken on the model's reading of the thread: before the guard
lets `gh pr merge` or `pnpm db:migrate` through it reads the claimed task's thread itself, over
the Notion API with the integration token, and requires that your *newest* reply since the
pipeline's last comment on that thread *begins* with the word — `merge`, `Merge it`, `apply,
then carry on`; not `don't merge yet`, not `after you merge`. Only the newest: a `merge` followed
by `wait, not yet` grants nothing, because the last word is the word. A merge must also be the
task's own pull request — the branch is derived from the task's name on the board, not from
anything the run wrote — merged with a merge commit, said outright as `--merge`: a squash
rewrites the hash the board carries and the task would never be seen to land. The model cannot
fabricate a permission; the check reads the board, not the transcript. Once the run has answered
with its ⟡ note the word is consumed: the same reply grants nothing twice.

Answers given inside an interactive Code tab session follow the same rule, applied by that session.

---

## 5. Run protocol

One run is `/ticket`: fresh session, Fable, hooks as the boundary. A Desktop scheduled task types
it once an hour; a person can still type it from any checkout. Everything countable in the steps
below is a script under `scripts/run/` with a test; the skill holds the judgment and nothing else.

```
0  Preflight    stamp this worktree as a run's and remove the ones earlier runs left (prune.mjs) ·
                install when node_modules is absent, typegen when .next/types is · a task In
                progress whose marker is fresh is a live run: exit, before anything is read or
                claimed · read every task's thread over the API in one command (threads.mjs)
                and give each reply newer than the pipeline's last comment one assessment
                (§4): a change at Review → addendum, Ready · merge at Review → claim, gh pr
                merge --merge, one comment, release · apply on a migration question → claim,
                db:migrate, carry on · new work → one Backlog task, one note · an answer →
                Ready · else one clarifying comment · fetch, mark merged Review tasks Done
                (merge-base --is-ancestor) and write Release rows · an In progress task with
                no marker, or one older than three hours, is stale: keep its branch as
                t<id>-stale-<HHMM>, post one comment, re-claim it from origin/main and
                continue — no human needed · refresh the Documents and Guidelines mirrors
                behind main (mirror.mjs): a stopped refresh first, each page header-last
                under a refresh-in-progress sentinel, allow_async false on every write
1  Claim        top Ready by Priority (Must first), then oldest · set In progress · write the
                marker aenima-run-active in the repository's shared .git directory (task, page,
                branch, started, session) · assign ID and Epic if missing · compare Spec
                versions against repo headers, note drift · with nothing to claim, an idle run
                that met a red in step 0 files one Fix task at Backlog (draft.mjs) and exits;
                one that met nothing writes nothing
2  Inline       read every cited section · write docs/tickets/<id>.md — the pack the reviewer
                reads · an addendum round adds the reply as its own section
3  Branch       branch t<id> off origin/main, or check out origin's copy when the branch is
                already there — an addendum round, a ticket continuing after its migration —
                with its pull request · plan mode before any file changes · a primary
                checkout is returned to main on exit, success or not; a worktree is left where
                it is for the next run's step 0
4  Build        smallest complete implementation · stop only when a wrong guess is expensive
                (§4), otherwise take the default and say so · new logic has tests observed
                failing first, the mutation and the count recorded per test
5  Review       reviewer subagent, fresh context, reads the ticket file and the diff, not the
                author's summary · runs only the tests the ticket names plus the test files the
                diff touches; the Stop gate owns the full suite · findings are tagged Must or
                Should · fix every Must and re-invoke, three passes maximum · a Must still
                standing after the third becomes an open question, Shoulds are recorded ·
                out-of-scope findings → Backlog tasks (Type Fix, Epic inherited)
6  Migration    if the diff adds a migration file: commit, push, stop → Decision (§4). You
                answer `apply` on the thread; a run in the primary checkout — a person's
                `/ticket` there, until `.env.migrate` rides into worktrees — applies it, the
                guard having read your word from the board, and carries the ticket on
7  Gate         Stop hook runs pnpm lint && pnpm typecheck && pnpm test in the cwd it is
                handed, not the project dir; red cannot close
8  Report       write docs/reports/<id>.md — refused without the red-first record: per test,
                the mutation that made it red and the count that went green — then mirror it
                into the body Report section: ACs implemented (each with its test) · tests
                written · open questions · write docs/log/<id>.md and regenerate the build
                log's list from the directory (log-index.mjs)
9  Close        commit, push branch, open the PR unless the branch has one → Review · remove
                the marker · never merge on the run's own word — `merge` from you at Review is
                the merge, made by the next run's step 0 · the Runs row is written after the
                session by the SessionEnd hook, from the transcript (runs.mjs)
```

One run, one task. The run exits; the next scheduled run takes the next task. Chaining inside a
session is not done: a session that built three things reasons worse about the fourth.

**The schedule.** Routines › `aenima-ticket` in the Desktop Code tab: prompt `/ticket`, folder
`~/dev/aenima`, hourly, Bypass permissions, Fable, worktree on. Bypass rather than Auto because the
hooks and the credential boundary below are the design, and a classifier refusing a probe at three
in the morning is worse than no classifier. *On:* set the task's Status to Active, turn on **Keep
computer awake** (Settings › Desktop app › General), leave the app open and the lid up — a closed
lid sleeps the machine, a run that falls in sleep is skipped, and one catch-up run fires on wake.
*Off:* Status Paused; the task keeps its history and its saved approvals. Delete only from its
detail page. *Cadence:* every hour on the hour plus a fixed stagger of a few minutes; Desktop skips
a run while the previous one is still going, so two runs of the task never overlap, and the marker
covers a `/ticket` typed by hand meanwhile. *Idle:* a fresh worktree costs one `pnpm install`, six
seconds from the store, and one `pnpm next typegen` for the route types under `.next/types` that the
gate's typecheck reads; the preflight reads the board and exits; the gate's fingerprint is shared
across worktrees, so a run at a tree the suite already passed costs seconds, and a run at a new tree
costs one suite. Measured at T0.10's close on an empty queue: the first idle run, in a fresh
worktree at a tree the gate had not seen, was 2 min 8 s of session over 35 model turns and 21k
tokens in and out plus 341k written to cache, and one gate run; the second, at the same tree, 1 min
39 s over 25 turns and 16k tokens plus 306k to cache, and no gate at all. The transcripts are read
in T0.10's report. `AENIMA_RUN_BASE` in `.claude/settings.local.json` must be unset for the
schedule: it is a fixture's override, and a scheduled run reads that file too.

**The marker** is the run's footprint and nothing more: `aenima-run-active` in the repository's
shared `.git` directory, the same file from the primary checkout and from every worktree, which is
what lets a run in one worktree see a run in another. It is written at claim and removed on every
exit — Review, Decision, and error through the SessionEnd hook; a hard kill leaves it behind,
which is what the three-hour age is for. Only scripts read it; the skill never reasons about it.
A stale run recovers by default because the branch is preserved: a wrong guess costs nothing.
The Stop gate's green fingerprint, `aenima-gate-count`, lives beside it for the same reason: a
fresh worktree of a commit the suite already passed inherits the green.

**Worktrees.** A scheduled run works in a worktree Desktop makes for it, branched from
`origin/main`, with `.env.local` carried in by `.worktreeinclude` and nothing else. Desktop does
not remove the worktree when the run ends; it goes with the session's archive, and an idle run
opens no pull request for auto-archive to notice. So step 0 stamps the worktree it is in as a
run's, and removes every stamped worktree that is clean, unlocked, not its own, stamped more than
three hours ago, and either merged into `origin/main` or older than three days. A worktree
without the stamp is a person's and is never touched; a dirty one holds work nobody committed
and is left for a person to look at; one stamped inside the last three hours is a run that may
still be between its step 0 and its step 2, clean at `origin/main`, and stays whatever its merge
state.

**The board's token.** A third credential, and every run is handed it: `NOTION_TOKEN` in
`.env.local`, an internal integration's token, the integration shared with the `dev` teamspace,
created once by hand (Notion › Settings › Integrations › Develop or manage integrations › New
internal integration; `.env.example` says where). Two readers use it and neither is the model:
`threads.mjs` reads every task's comments at the start of a run, one request per task at the
API's ~3 a second, so an idle run reads the whole board in one command rather than one connector
call per task; and the guard reads the claimed task's thread before it lets a merge or a
migration apply through (§4). Since T0.12 two more use it, still without a model: `mirror.mjs`
reads each mirror page's first block before a refresh, and `runs.mjs` posts the Runs row at
session end — so the integration needs insert-content capability besides read and comment. The
token is read from the file and never printed; an API error names the endpoint and the status
and nothing else. Without it a run says so in its report line and reads no comments — a merge
or an apply is then refused on that ground, which is the honest answer: nothing read the board
— and refreshes no mirror and writes no Runs row. The API lists open threads only, so resolve nothing on a task
until the run has answered it: a resolved `merge` is a merge nobody will see. The comments the
pipeline posts still go through the connector, which posts as you; the prefix is what tells the
two voices apart on a thread, as §4 says.

**The capability boundary.** Two database credentials in two files, and a run is handed only one.
`.env.local`'s `DATABASE_URL` is `aenima_pipeline`, a member of `service_role` that starts every
connection as it: it reads and writes every row, bypasses RLS as the app's direct connection
always has, cannot create, alter or own anything, and cannot reach the `drizzle` schema. Every
script, test, dev server and run — human or scheduled — uses it. `.env.migrate` holds the admin
URL; only `pnpm db:migrate` and `pnpm db:baseline` read it, it is gitignored, and
`.worktreeinclude` does not carry it. So the credential a run is handed cannot change schema, and
the admin credential is on no path a run follows. That is a real boundary and not a wall: a
session in a worktree can read any file on the disk, the primary checkout's `.env.migrate`
included, if it goes looking. The guard's rule (b) stays as the second layer for exactly that
reason. Deploys: there is no Vercel CLI on the machine and no login to it; production deploys
come from `main` through the Vercel Git integration, and the guard's rule (c) stays as the
second layer there too. The role is created once per project, in the Supabase SQL editor:

```sql
create role aenima_pipeline login password '…';   -- the password lives only in .env.local
grant service_role to aenima_pipeline;
alter role aenima_pipeline set role = service_role;
grant authenticated to aenima_pipeline;             -- the RLS tests impersonate PostgREST's roles
grant anon to aenima_pipeline;
```

Database tests seed and delete users through `app.seed_user` and `app.delete_user`
(`drizzle/0014_test_users.sql`): `service_role` holds no privilege on `auth.users`, and
`postgres` can grant only SELECT there, so two definer functions carry exactly those two
statements.

**Per-ticket logs.** A ticket's build-log entry is `docs/log/<id>.md` — first line `# <title>`,
second line the UTC timestamp in italics, with the commit in code font after a middle dot when there
is one, then the entry. The build log's Tickets done section is a list written from that directory
by `scripts/run/log-index.mjs`, and its test refuses a stale copy. Two open pull requests each add a
file and never edit the same lines; a merge that meets two new list lines is settled by running the
script again.

Hard boundaries, enforced by hooks not prose: no schema push, no writes to `.env` or `.env.*`
(`.env.example` is tracked and excepted), no production deploy, no force-push, no push to main in
any refspec shape, no merge with main checked out, and no migration apply and no `gh pr merge`
until the guard has itself read your word — `apply`, `merge` — on the claimed task's thread over
the API (§4); a merge must be that task's own pull request and a merge commit. The guard reads
commands, never text: prose inside a heredoc or a quoted string matches no rule.

---

## 6. Cutting tickets

- Epics are capabilities; tasks are independently buildable slices of one capability.
- One task, one session. If it needs two, it is two tasks.
- Criteria are observable. "Works" is not a criterion; "a test purchase appears in the orders
  table" is.
- Every Criteria line has a Tests line naming it. No orphans either way.
- Reference spec by section. The run inlines at claim; the body stays short.
- Rules carry only what cost something to learn. Route is the model's; destination is yours.
- Mirror experiments go to a scratch page. Admin is written by the pipeline; a page you are
  trying something on is not a page it should find.

---

## 7. Names

One word per property, one term per concept. IDs: `T3.1` task · `E3.2` epic · `Phase 3` ·
`R-0042` run · `2026-09-03 a1b2c3d` release. Branch = lowercase ID with a hyphen: `t3-1`.
Criteria means the same thing on a task and on a phase: what must be true to be done.

---

## 8. Seed

- Roadmap: Phase 0 Foundation … Phase 6 Edges, dates from the build log where known.
- Epics: one per completed phase (0–2) holding its tickets as Done rows with commits; Phase 3's
  four tickets as Backlog under `E3.1 Authoring loop`.
- Tasks: `T0.7 Setup` (hooks, reviewer subagent, .worktreeinclude, fallback setting, CLAUDE.md
  carve-out) — done. `T0.8 Run` (`/ticket`: the protocol as a command, the board reads and
  writes, the run scripts) — done. `T0.9 Run fixes` (the guard on commands, the run marker,
  stale-run recovery, §4 as it now reads, the reviewer's scope, the red-first record) — this
  version. `T0.10 Schedule` (the scheduled task, the shared marker, worktrees and their
  pruning, the capability boundary, per-ticket logs) — v1.5. `T0.11 Comments` (every task's
  thread read each run, the four shapes a reply takes, merge and apply as words the guard
  verifies over the API, the integration token, an idle run's one filing) — v1.6.
  `T0.12 Telemetry and mirror` (the Runs row from the transcript by the SessionEnd hook, the
  Documents and Guidelines mirrors refreshed in preflight header-last under a sentinel, the debts
  of the last three reports) — this version.
- Documents: seven pages, headed as mirrors, content refreshed from `main` at every preflight
  since T0.12.

---

## 9. Carried into the product spec (v1.6)

These six rulings are now in the spec at the sections named. Sections are cited one way
throughout this document — `(§N)`, parenthesised, no trailing prose inside the brackets:

1. **Decision as a ticket state**, with fault attribution in the comment and one-assessment
   resolution. §8 had the ceremony version; the backlog had none — §11.
2. **Version tuple on the ticket, checked at claim.** §11 listed the tuple as a field; nothing
   said what happened on drift — §11.
3. **Agent-created tickets land unconfirmed.** Backlog as the proposal state, Ready as the confirm
   — "Agent proposes, human confirms" (§1) expressed as a status, not a badge (§11 and §8).
4. **Two-round cap applied to comment threads**, not only to authoring sessions (§11).
5. **Criteria ↔ Tests mapping as a ticket-level "no orphan" rule**, the same rule one level down
   (§7.5).
6. **Runs as a first-class table.** §15 analytics has no per-run record to build from — §17 (v2).
