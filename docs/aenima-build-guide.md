# aenima — build guide

How to get from two spec documents to a running product using Claude Code.

The method is aenima's own thesis applied to aenima: a validated spec becomes a lean constitution
plus self-contained ticket packs, each run in a fresh session, each ending in a report-back.
You are hand-running the loop the platform will eventually automate.

---

## 1. Stack (proposal — confirm before ticket 0.1)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | One deploy target, best agent support, server actions remove most API boilerplate |
| Styling | Tailwind v4 | The design spec is already written as CSS custom properties; Tailwind v4 consumes them natively |
| Data + auth | Supabase (Postgres, Auth, Storage) | You already know it from Sociera. Ships passwordless email OTP + Google + Apple. RLS enforces product isolation |
| ORM | Drizzle | Typed schema in TS, migrations that read like SQL, light enough for an agent to reason about |
| Jobs | Inngest (or Vercel cron + a `jobs` table) | Scoring runs, polling, nightly sweeps all need durable background work |
| Tests | Vitest (unit) + Playwright (e2e) | Both scriptable, both easy for the agent to run and fix |
| Hosting | Vercel | Zero-config for the above |

Swap any of these before you start; swapping after ticket 1.1 is expensive.

---

## 2. One-time setup

```bash
mkdir aenima && cd aenima
git init
pnpm dlx create-next-app@latest . --typescript --tailwind --app --src-dir --use-pnpm
mkdir -p docs
```

Then:

1. Copy `aenima-product-spec.md` → `docs/product-spec.md`
2. Copy `aenima-design-spec.md` → `docs/design-spec.md`
3. Copy `CLAUDE.md` → repo root
4. `cp CLAUDE.md AGENTS.md` — the Linux Foundation standard, read by Codex and most other tools
5. Add `ae-mark.svg` and `ae-favicon.svg` → `public/`
6. `git add -A && git commit -m "scaffold + specs"`
7. Open Claude Code in the repo root: `claude`

Do **not** run `/init` — you already have a better constitution than it will generate.

---

## 3. How to run a ticket

**One ticket, one fresh session.** Start `claude`, paste the ticket, let it finish, commit, then
`/clear` (or quit and restart) before the next one. A session that has already built three things
reasons worse about the fourth. This is the single highest-leverage habit in the whole guide.

**Use plan mode for anything structural.** Press `Shift+Tab` to enter plan mode, or start the
prompt with "plan first, don't write code yet." Read the plan, correct it, then let it build.
Cheaper to fix a plan than a codebase.

**Commit after every ticket that passes.** `git commit -m "T1.2 list surface"`. This gives you a
clean rollback point when a later ticket goes sideways, which it will.

**Read the report-back.** Every ticket ends with "ACs implemented, tests written, open questions."
The open questions are the valuable part — they are the spec gaps the agent hit. Answer them
before moving on, and if the answer changes a rule, edit `CLAUDE.md` so it holds globally.

**When it drifts:** stop, `/clear`, restate the ticket with the specific correction inlined.
Do not argue with a long session — start a clean one.

**When context compacts mid-ticket:** tell it to preserve the modified-file list and the test
commands. Better: keep tickets small enough that this never happens.

---

## 4. Build order

Phases are sequential; tickets inside a phase mostly are too.

**Phase 0 — foundation** (prompts written, below)
- 0.1 Scaffold, config, folder structure, CI-less quality gates
- 0.2 Design tokens + primitive components
- 0.3 Composite components
- 0.4 Auth + workspace/product/membership

**Phase 1 — the spine** (prompts written, below)
- 1.1 Core data model: opportunities, items, artifacts, versions, gaps, decisions, activity
- 1.2 List surface: three buckets, pipeline strip, item row
- 1.3 Item page shell: content + chat dock + meter

**Phase 2 — scoring engine** (the heart; get prompts when you arrive)
- 2.1 Skill-pack format; Feature PRD rubric encoded as data
- 2.2 AI provider abstraction: BYO key, three tiers, pinned scorer, usage metering
- 2.3 Scoring run: artifact → checks → evidence, cached per artifact version
- 2.4 Meter UI wired to real scores, per-check expansion with quoted evidence
- 2.5 Negotiation protocol: the three typed moves
- 2.6 Applicability engine + conditional layers

**Phase 3 — authoring**
- 3.1 Author/critic loop with the two-round limit and check-ID binding
- 3.2 Chat panel: proposals, echo-confirm, decide-later
- 3.3 Silent test: collect → score everything → meter jumps
- 3.4 Live document assembly beside the conversation

**Phase 4 — integrations**
- 4.1 Notion: aenima-managed section, Artifacts DB, version sync, content-hash diffing
- 4.2 Notion intake: comments, hand-created tasks, hand-written docs, property changes
- 4.3 Router: classify → product → type → file, with confidence policy and triage inbox
- 4.4 Figma read + design hygiene checks + alignment map
- 4.5 Remaining intake: Slack, Teams, Fireflies, Gmail forward-in, Drive

**Phase 5 — handover**
- 5.1 Backlog refinement
- 5.2 Ceremony packet: version pin, ledger, QA sheet
- 5.3 Walkthrough: question generation, branches, fault attribution, librarian mode
- 5.4 Signatures, waivers, diff re-confirms
- 5.5 Prompt packs / SDD bundle emission
- 5.6 Development backlog push + completion readback

**Phase 6 — edges**
- 6.1 Roles and permissions enforcement
- 6.2 Onboarding: connect AI, connect sources, declare state, watch it reconstruct
- 6.3 Analytics views
- 6.4 Daily digest email
- 6.5 Degraded states, 404/500/offline, no-AI-key

Come back for each phase's prompts when you reach it. Prompts written against a real codebase
reference real files and are dramatically better than prompts written against an imagined one.

---

## 5. Rules that keep this from going wrong

1. **Never let it invent a color or a size.** Everything is in the design spec. If it improvises,
   that is a bug, not a style choice.
2. **Never let it add a settable status field.** Status is derived. This is the product's first law
   and the easiest thing for an agent to "helpfully" break.
3. **Never let it write to an external system without a confirm step.** Agent proposes, human confirms.
4. **Ship a walking skeleton before depth.** Phases 0–1 give you something you can click through
   with fake data. Resist starting the scoring engine early; it is the most interesting part and the
   part that will eat a week if the surface underneath is not standing.
5. **Fake data early, real data late.** Every Phase 0–1 ticket builds against fixtures. That keeps
   the UI honest and testable before any AI call exists.
6. **When a ticket's report-back raises a spec question, answer it in the spec**, not just in chat.
   The docs are the source of truth; the codebase is downstream of them.
