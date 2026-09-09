<!-- guidelines.md · v1.4 · in the repo · §4 stops only when a wrong guess is expensive and speaks
     in plain sentences; §5 carries the run marker, stale-run recovery, the reviewer's scope and
     the red-first record; §9 states its closed gaps in the past tense -->

# aenima — Dev board guidelines

This board is aenima's own Development backlog (product-spec §11), run on aenima itself before
any customer sees one. Four surfaces, four jobs:

| Surface | Job |
|---|---|
| Notion · `dev` teamspace | Queue and conversation. Where tasks wait, where questions are asked and answered. |
| Repo · `~/dev/aenima` | Record. Specs, tickets as claimed, reports, build log. The only editing surface for documents. |
| Claude chat · this project | Discussion and ticket authoring. Writes tasks into the board through the Notion connector. |
| Claude Code · Desktop Code tab | Execution. One scheduled run claims one task, builds it, reviews it, reports. |

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
weight tuning.

### Documents

Seven sub-pages: `product-spec` · `design-spec` · `CLAUDE` · `AGENTS` · `build-guide` ·
`build-log` · `schema`. The page is headed, verbatim: **Machine-written mirrors of the repo
documents.** *Each page is refreshed from `main` at the start of every pipeline run and headed
with the commit it mirrors. The repo is the only editing surface; nothing typed here survives the
next run.* Nobody types here. The refresh itself is T0.10's; no run before it touches a mirror.

---

## 3. Status machine

| From | To | Who | Trigger |
|---|---|---|---|
| — | Backlog | H or M | Created. Everything starts here, including tasks the pipeline creates from findings. |
| Backlog | Ready | **H only** | Your go. The one human move on the board. |
| Ready | In progress | M | Run claims it. |
| In progress | Review | M | Branch pushed, Report written. |
| In progress | Decision | M | Run stopped on a question, or a migration awaits your apply. |
| Decision | Ready | M | Your comment assessed as resolving — see §4. No manual override. |
| In progress | Ready | M | A stale run recovered while another stale task was claimed first — see §5 step 0. |
| Review | Done | M | Next run finds the branch merged into main. Release row written. |

Nothing is ever set backwards by a human. "Status is derived, never declared" (§1) applied to the
board.

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
question.** Backlog → Ready is the one human move (§3), and Decision → Ready is the same move
spelled differently: your answer is the confirmation. A run that set Ready on its own reading
would be confirming its own proposal.

Where the gap lives is fault attribution (§8): if it is in a spec, the answer is a spec patch, not
a comment.

At the start of every run, before claiming anything, the pipeline reads Decision tasks for a new
comment from you since its own last comment. Each new comment gets **exactly one assessment**:

- Resolves the question with one interpretation → status Ready. If the gap was placed in a spec,
  the run's first act after claim is patching that section in the repo and bumping the version.
  The answer lives in the document; the comment is where you said it.
- Does not → one clarifying comment, in the same voice, naming the two readings it cannot pick
  between; status stays Decision.
- After two clarifying rounds on the same question the pipeline stops asking and waits. It never
  stops assessing: your next comment is read like any other. Two-round cap, §6, applied to itself.

Answers given inside an interactive Code tab session follow the same rule, applied by that session.

---

## 5. Run protocol

One run is `/ticket`, typed by a human from `~/dev/aenima`: fresh session, Fable, auto mode,
hooks as the boundary. T0.10 puts it on a schedule. Everything countable in the steps below is a
script under `scripts/run/` with a test; the skill holds the judgment and nothing else.

```
0  Preflight    assess Decision comments (§4) · mark merged Review tasks Done (merge-base
                --is-ancestor) and write Release rows · a task In progress whose marker in this
                checkout is fresh is a live run: exit · with no marker here, or one older than
                three hours, it is stale: keep its branch as t<id>-stale-<HHMM>, post one
                comment, re-claim it from origin/main and continue — no human needed
1  Claim        top Ready by Priority (Must first), then oldest · set In progress · write the
                marker .claude/.run-active (task, page, branch, started, session) · assign ID
                and Epic if missing · compare Spec versions against repo headers, note drift
2  Inline       read every cited section · write docs/tickets/<id>.md — the pack the reviewer reads
3  Branch       branch t<id> off origin/main · plan mode before any file changes · a primary
                checkout is returned to main on exit, success or not
4  Build        smallest complete implementation · stop only when a wrong guess is expensive
                (§4), otherwise take the default and say so · new logic has tests observed
                failing first, the mutation and the count recorded per test
5  Review       reviewer subagent, fresh context, reads the ticket file and the diff, not the
                author's summary · runs only the tests the ticket names plus the test files the
                diff touches; the Stop gate owns the full suite · findings are tagged Must or
                Should · fix every Must and re-invoke, three passes maximum · a Must still
                standing after the third becomes an open question, Shoulds are recorded ·
                out-of-scope findings → Backlog tasks (Type Fix, Epic inherited)
6  Migration    if the diff adds a migration file: stop → Decision (§4). Acting on the answer
                is T0.10's; until then a human applies it
7  Gate         Stop hook runs pnpm lint && pnpm typecheck && pnpm test in the cwd it is
                handed, not the project dir; red cannot close
8  Report       write docs/reports/<id>.md — refused without the red-first record: per test,
                the mutation that made it red and the count that went green — then mirror it
                into the body Report section: ACs implemented (each with its test) · tests
                written · open questions · update build-log
9  Close        commit, push branch, open the PR → Review · remove the marker · never merge ·
                Runs row written by the session-end script (T0.10)
```

One run, one task. The run exits; the next scheduled run takes the next task. Chaining inside a
session is not done: a session that built three things reasons worse about the fourth.

The marker is the run's footprint and nothing more. It is written at claim and removed on every
exit — Review, Decision, and error through the SessionEnd hook; a hard kill leaves it behind,
which is what the three-hour age is for. Only scripts read it; the skill never reasons about it.
A stale run recovers by default because the branch is preserved: a wrong guess costs nothing.

Hard boundaries, enforced by hooks not prose: no schema push, no migration apply, no writes to
`.env` or `.env.*` (`.env.example` is tracked and excepted), no production deploy, no force-push,
no push to main in any refspec shape, no merge with main checked out, no `gh pr merge` while a
run marker exists. The guard reads commands, never text: prose inside a heredoc or a quoted
string matches no rule.

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
  version. `T0.10 Schedule and telemetry` (scheduled task, mirror refresh, Runs rows, the
  answered-migration path, worktrees) — next.
- Documents: seven pages, headed as mirrors, content synced by T0.10's first run.

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
