<!-- guidelines.md · v1.1 · in the repo · laws cited by name, §9 now carried into the spec -->

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

Six sub-pages: `product-spec` · `design-spec` · `CLAUDE` · `AGENTS` · `build-guide` · `build-log`.
Each begins *Mirror of docs/<file> @ <commit> — edit in the repo.* Refreshed from main at the
start of every run. Nobody types here.

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
| Review | Done | M | Next run finds the branch merged into main. Release row written. |

Nothing is ever set backwards by a human. "Status is derived, never declared" (§1) applied to the
board.

---

## 4. Decision protocol

When a run cannot proceed it sets Decision and posts **one** comment in this shape:

```
Question   what cannot be answered with one interpretation
Where      product-spec §X · design-spec §Y · or: this ticket
Default    the answer the run would take if you said "default"
```

*Where* is fault attribution (§8): if the gap is in a spec, the answer is a spec patch, not a
comment. Migrations use the same shape — *Question: apply migration 0013 to Frankfurt? Where: this
ticket. Default: apply.*

At the start of every run, before claiming anything, the pipeline reads Decision tasks for a new
comment from you since its own last comment. Each new comment gets **exactly one assessment**:

- Resolves the question with one interpretation → status Ready. If *Where* was a spec, the run's
  first act after claim is patching that section in the repo and bumping the version. The answer
  lives in the document; the comment is where you said it.
- Does not → one clarifying comment; status stays Decision.
- After two clarifying rounds on the same question the pipeline stops asking and waits. It never
  stops assessing: your next comment is read like any other. Two-round cap, §6, applied to itself.

Answers given inside an interactive Code tab session follow the same rule, applied by that session.

---

## 5. Run protocol

One scheduled run, fresh session, from `~/dev/aenima`, Fable, auto mode, hooks as the boundary.

```
0  Preflight    assess Decision comments (§4) · mark merged Review tasks Done and write Release
                rows · refresh Documents and Guidelines mirrors from main
1  Claim        top Ready by Priority (Must first), then oldest · set In progress · assign ID and
                Epic if missing · compare Spec versions against repo headers, note drift
2  Inline       read every cited section · write docs/tickets/<id>.md — the pack the reviewer reads
3  Plan         plan mode before any file changes · branch t<id>
4  Build        smallest complete implementation · new logic has tests observed failing first
5  Review       reviewer subagent, fresh context, reads the ticket file and the diff, not the
                author's summary · fix findings · re-review · out-of-scope findings → Backlog tasks
                (Type Fix, Epic inherited)
6  Migration    if the diff adds a migration file: stop before db:migrate → Decision (§4)
7  Gate         Stop hook runs pnpm lint && pnpm typecheck && pnpm test; red cannot close
8  Report       write docs/reports/<id>.md → mirror into the body Report section:
                ACs implemented (each with its test) · tests written (each observed red then
                green) · open questions · update build-log
9  Close        commit, push branch → Review · Runs row written by the session-end script
```

One run, one task. The run exits; the next scheduled run takes the next task. Chaining inside a
session is not done: a session that built three things reasons worse about the fourth.

Hard boundaries, enforced by hooks not prose: no `db:push`, no `db:migrate` without a Decision
answer, no writes to `.env*`, no `vercel --prod`, no force-push, no merge to main.

---

## 6. Cutting tickets

- Epics are capabilities; tasks are independently buildable slices of one capability.
- One task, one session. If it needs two, it is two tasks.
- Criteria are observable. "Works" is not a criterion; "a test purchase appears in the orders
  table" is.
- Every Criteria line has a Tests line naming it. No orphans either way.
- Reference spec by section. The run inlines at claim; the body stays short.
- Rules carry only what cost something to learn. Route is the model's; destination is yours.

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
- Tasks: `T-A Setup` (hooks, reviewer subagent, .worktreeinclude, fallback setting, CLAUDE.md
  carve-out) and `T-B Pipeline` (run prompt, scheduled task, Runs script) — Backlog, bodies to
  follow.
- Documents: six pages, headed as mirrors, content synced by T-B's first run.

---

## 9. Carried into the product spec (v1.6)

These six rulings are now in the spec at the sections named:

1. **Decision as a ticket state**, with fault attribution in the comment and one-assessment
   resolution. §8 has the ceremony version; the backlog has none (§11).
2. **Version tuple on the ticket, checked at claim.** §11 lists it as a field; nothing says what
   happens when the tuple drifts before the ticket runs (§11).
3. **Agent-created tickets land unconfirmed.** Backlog as the proposal state, Ready as the confirm
   — "Agent proposes, human confirms" (§1) expressed as a status, not a badge (§11 and §8).
4. **Two-round cap applied to comment threads**, not only to authoring sessions (§11).
5. **Criteria ↔ Tests mapping as a ticket-level "no orphan" rule**, the same rule one level down
   (§7.5).
6. **Runs as a first-class table.** §15 analytics has no per-run record to build from — §17 (v2).
