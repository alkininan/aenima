# aenima — build guide v2.0

How to run a ticket on aenima with Claude Code.

The method is aenima's own thesis applied to aenima: a validated spec becomes a lean constitution
plus self-contained ticket packs, each run in a fresh session, each ending in a report-back. You
are hand-running the loop the platform will eventually automate.

**v2.0 is a rewrite, not a revision.** v1.0 was written before ticket 0.1 and proposed a stack, a
setup script and a set of habits. The stack is now built, the repo exists and is deployed, and
three phases of tickets have produced rules that no one could have guessed in advance. What follows
is the build as it stands and what it actually cost to learn.

---

## 1. Stack, as built

| Layer | What shipped |
|---|---|
| Framework | Next.js **16.3.1**, App Router, React 19.2.8, TypeScript strict. Server Components by default; `"use client"` only where there is real interactivity |
| Styling | Tailwind **4.3.3**. Design tokens are CSS custom properties in `src/app/globals.css`; Tailwind consumes them natively and nothing is hardcoded |
| Data + auth | Supabase — Postgres, Auth, Storage. RLS enabled **and forced** on every table; passwordless email OTP |
| ORM | Drizzle **0.45.2** / drizzle-kit **0.31.10**, migrations only |
| Tests | Vitest **4.1.11** in three projects (node, dom, db) + Playwright **1.62.1** |
| Hosting | Vercel — **aeni.ma** |

Jobs are still undecided and deliberately so: Phase 4 owns the scheduler, and building one earlier
would have meant a cron with nothing to run.

**`drizzle-kit push` is prohibited on this project.** The RLS policies live in
`drizzle/0001_policies.sql` and later hand-written migrations, not in the schema DSL, so push
cannot see them and plans to `DROP POLICY … CASCADE` every one — deleting the product isolation
boundary. `db:generate` then `db:migrate`, always. Migrations since 0002 are hand-written for the
same reason: what they express is a security boundary, and the DSL cannot say it.

**Applied migrations are immutable.** The one exception is a comment that has become false, which
is not a schema change — correct it in place and say that you did. drizzle-kit decides what to
apply by the journal's `when` against the recorded `created_at`, never by hash, so editing prose in
an applied file does not re-run it.

---

## 2. How to run a ticket

**Start Claude Code from the repo root.** Not a preference. `CLAUDE.md`, `AGENTS.md` and
`.claude/commands/` are discovered at-or-above the working directory and never below it, so a
session started from the home directory has **no constitution at launch**, acquires it only if
something happens to attach a project file, loses it again on every compaction, and never registers
the project's commands at all. Everything through T2.3 was built that way and held up only because
the tickets carried their own rules in prose.

**One ticket, one fresh session.** Paste the ticket, let it finish, commit, then `/clear` or
restart. A session that has already built three things reasons worse about the fourth. This is
still the single highest-leverage habit in the guide.

**Plan first on anything structural.** `Shift+Tab`, or open with "plan first, don't write code
yet." Read the plan, correct it, then let it build. A plan is cheaper to fix than a codebase.

**A structural ticket gets a fresh-context review before it is done.** A session that did not write
the code reads the diff against the spec. **A self-review does not count** — T2.3's passed a diff
that a cold session then found four real defects in, and every review since has found more:
T2.4 six, T2.5 six, T2.5's own migration fix was itself sent back by a second cold read, and the
fold that taught T2.3's fabrication guard to read markdown came back with two — one of them the
guard certifying `25` as a verbatim quote of `2**5`. Budget for the review finding something,
because it always has.

**Three failed corrections on the same fix means the ticket is wrong, not the code.** The loop
cannot see the plan it came from. Stop, say so, and ask for the ticket to be restated rather than
attempting a fourth time.

**Answer the report-back's open questions in the spec, not in chat.** Every ticket ends with "ACs
implemented, tests written, open questions", and the open questions are the valuable part — they
are the spec gaps the agent hit. If the answer changes a rule, it goes in `CLAUDE.md`, the product
spec or the design spec, where the next session will read it. A question answered only in a chat
transcript is a question that gets asked again.

**A stopgap is legal only when the build log records it as an open question with a phase owner.**
An unrecorded stopgap is a bug. This is also the escape hatch for a fix that is correct but larger
than the ticket: fix what the ticket names, file the rest with an owner, and leave a test that
turns red the day it lands.

**When it drifts:** stop, `/clear`, restate the ticket with the correction inlined. Do not argue
with a long session — start a clean one.

---

## 3. Rules that keep this from going wrong

1. **Never let it invent a colour, a size, or a piece of copy.** Everything is in the design spec.
   If a value is not there, stop and ask — improvisation is a bug, not a style choice.
2. **Never let it add a settable status field.** Status is derived from which artifacts exist and
   what they score. The product's first law, and the easiest thing for an agent to "helpfully"
   break.
3. **Never let it write to an external system without a confirm step.** Agent proposes, human
   confirms.
4. **Regenerate `src/db/database.types.ts` with the migration that changed it, not at the next
   opportunity.** T2.4 found that file two migrations stale, and regenerating it surfaced a *live*
   bug that had been on screen for a ticket and a half: a closed gap rendering as "Open", telling
   someone they owed work a run had already found done.
5. **A test that asserts on the position of a row must order by something the database
   guarantees.** Inside one transaction `now()` is constant, so `occurred_at` ties and any
   assertion on "the last row" is a coin flip. Order by a column the server must honour — an id the
   write returned, not a timestamp and not insertion luck.
6. **Negative-check every test: reintroduce the defect it names, watch that test — and only that
   test — go red, revert.** A CSS rule that matches nothing and a mapping that never fires both
   pass a green suite. Pin the rule, not the pair of numbers that currently satisfies it.
7. **Ship a walking skeleton before depth, and grow in layers.** Every ticket ends with a working
   product. Never trade a working product for unfinished complexity.
8. **Pre-launch, never preserve backward compatibility in code.** No compatibility layers, no
   fallbacks, no legacy paths — remove the old path in the same change. The database is the one
   exception, and it goes through migrations.

---

## 4. The ways a green suite has lied here

Negative-checking proves a test *can* fail. It does not prove the test fails only when it should.
Six distinct shapes have shipped green in this repo, none of them caught by review of the test's
name:

- **It measured a box instead of a painted glyph.** A layout e2e pinned the label sitting 1px off
  its value and passed while describing the bug in a comment.
- **It asserted a substring that the leak it named already satisfied.** The string it searched for
  was present *because* of the defect, so the test was evidence for the bug.
- **It asserted a position over a tied sort.** `occurred_at` is constant inside a transaction, so
  the assertion passed on roughly two runs in three and closed a ticket as green.
- **Its two rules coincided on the real data.** `prd-20` carries no `appliesWhen` of its own, so
  "the layer's condition" and "the check's condition" were the same object, and a function reading
  the wrong one passed every assertion. The fix was a synthetic fixture where the two differ.
- **It passed an outcome that could not reach the branch it named.** A test called "closes it on a
  move that landed" passed `outcome={null}`, which is no move at all — so the clause it claimed to
  cover could be deleted and the test stayed green.
- **Its fixture was not built the way production builds it.** Every `.db.test.ts` injects a
  `postgres()` handle it constructed itself. Production hands that same handle to
  `drizzle(sql, { schema })` first — and `drizzle()` *mutates* the client, replacing its type
  handlers, so postgres.js stops serializing a `Date` on a raw tagged template from it. Two
  queries bound a `Date` that way and threw on every call: §5's outage queue and §15's spend
  window. Both were broken from the day they shipped and the suite was green over both, because
  the fixture skipped the one line where the defect lives.

The first five are lies about the assertion. **The sixth is a lie about the world the assertion
runs in**, and no amount of care about what a test asserts will catch it. The SQL was real, the
schema was real, the constraints and triggers were real; the client was not.

**The rule: a fixture must be built the way production builds it, or it is testing a system that
does not exist.** Where a test constructs a dependency by hand, the question is not "is this a
faithful stand-in" but "what does production do to this object that I am not doing" — and the
answer has to be *nothing*, or the difference has to be the thing under test. `sharedDbClient()`
returns `{ db, sql }` from one instance, which looks like two views of a connection and behaves
like two clients with different rules; a fixture that builds only the `sql` half has quietly
changed the subject.

**The audit that followed, recorded because a checked "nothing else" is worth having written
down.** Every raw postgres.js tagged template on a drizzle-wrapped client — six non-test files,
every interpolated value enumerated — against a probe of what the mutation actually breaks:

- **`Date` is the only type affected.** Verified through a drizzle-wrapped client: `string`,
  `number`, `boolean`, `null`, `string[]`, `number[]`, a `JSON.stringify(...)` string, `bigint`
  and `Uint8Array` all bind correctly; only `Date` throws.
- **Two sites bound one**, `scheduleRetry` and `listUsage`. Both fixed, both now covered by
  `src/db/date-binding.db.test.ts`, which builds its client the way `sharedDbClient()` does.
- **The only other non-primitives bound this way are `conditionsMet` (a `string[]`, in `writeRun`)
  and `JSON.stringify(metadata)` (a string by construction).** Both checked, both fine.
- **Everything else that touches a `Date` never reaches a raw template.** `seed.ts` and
  `score-file.ts` go through drizzle's query builder, which converts before the wire;
  `tables.ts` uses drizzle-orm's own `sql` DDL fragment, which is a different thing entirely.

Nothing else is affected. If a future query binds a `Date` — or any type this probe did not cover —
into the raw handle, that test file is where it belongs.

The lesson, once: **a passing test is evidence about the test.** Make it fail on purpose before you
believe what it says about the code — and check that the thing it is failing against is the thing
that ships.

---

## 5. Build order

Phases are sequential; tickets inside a phase mostly are too.

**Phase 0 — foundation · complete.** Scaffold and quality gates, design tokens and primitives,
composites, Supabase + Drizzle with RLS isolation and the three-layer append-only ledger,
passwordless OTP and first-run bootstrap, and two form-language passes onto design spec v2.3–v2.5.

**Phase 1 — the spine · complete.** The core data model (opportunities, items, artifacts, versions,
gaps, decisions, activity), the §13 list surface at `/app` with three buckets and the pipeline
strip, and the item page at `/i/<key>`.

**Phase 2 — scoring engine · complete.** The skill-pack format with the Feature PRD rubric as data;
one AI seam with BYO key, three tiers, a pinned scorer and usage metering; the scoring run —
artifact version in, per-check verdicts with verified quotes out, cached per version; the meter and
its per-check expansion; and §5's third negotiation move. **2.6 was absorbed** rather than skipped:
applicability and conditional layers were built inside 2.3, 2.4 and migration 0011, which is
recorded in the build log so nobody goes looking for the scope.

**Phase 3 — authoring · next**
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
- Phase 4 also owns the scheduler that §5's retry field and the nightly sweep are waiting on.

**Phase 5 — handover**
- 5.1 Backlog refinement
- 5.2 Ceremony packet: version pin, ledger, QA sheet
- 5.3 Walkthrough: question generation, branches, fault attribution, librarian mode
- 5.4 Signatures, waivers, diff re-confirms
- 5.5 Prompt packs / SDD bundle emission
- 5.6 Development backlog push + completion readback

**Phase 6 — edges**
- 6.1 Roles and permissions enforcement — including refusing a Viewer as a product's Decider at
  assignment time, which §14 now states and only the database currently enforces
- 6.2 Onboarding: connect AI, connect sources, declare state, watch it reconstruct
- 6.3 Analytics views
- 6.4 Daily digest email
- 6.5 Degraded states, 404/500/offline, no-AI-key

Come back for each phase's prompts when you reach it. Prompts written against a real codebase
reference real files and are dramatically better than prompts written against an imagined one.

---

## 6. Done means

`pnpm lint && pnpm typecheck && pnpm test` all pass, and `pnpm e2e` for anything that touches a
surface. New logic has tests, and each of them has been observed failing. A structural ticket also
needs the fresh-context review above. Report back as: **ACs implemented, tests written, open
questions.**
