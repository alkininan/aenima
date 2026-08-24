# aenima — Product Specification v1.4

<!-- Master document. Versioned in aenima's own ledger once the platform exists; until then, this file is the source of truth.
v1.1: Linear removed from v1 scope (tasks push to Notion only; Linear moves to fast-follow). Notion promoted to a full intake source: comments, hand-created tasks, hand-written docs, property changes. Tickets land in an aenima-managed Development backlog database per product. Notion comments are read-only ingest in v1. Agent visual attribution and chat-as-command-palette aligned with design spec v2.0.
v1.2: Appendix A's baselines are defined as elapsed wall-clock time in a stage, resolving an effort/elapsed ambiguity build ticket T1.2 hit when it tried to compare them against something (§3, Appendix A). aenima observes when things happen and never how long anyone concentrated, so an effort baseline is unmeasurable by construction. The hour-scale cells are effort estimates and are therefore not baselines at all: Discover carries no seed for any type, and no item is ever at-risk on time for sitting there.
v1.3: §7.2's base rubric is stated as 19 checks summing to 100, with safety named as a conditional layer outside it rather than a twentieth base check — the table's own arithmetic already said so, since rows 1–19 carry exactly 100 points and exactly 9 Musts. The three conditional checks (15, 16, 20) are marked as such in an Applies column, check 15's restriction having been stated only in prose, and rubric check ids are distinguished from the requirement IDs inside a PRD (§7.2, §4).
v1.4: The code node law — a transformation describable without the words judge, decide, assess or summarize is code and must be written as code, a standing constraint on all three routing tiers (§12). And a critic objection carries its scope: which section it may change, so a one-check correction cannot become a rewrite that invalidates every cached result around it (§6). The two-round cap governs attempts; scope governs blast radius. -->

## 0. What aenima is

Aenima turns raw product ideas into validated, developer-ready specifications — automatically monitored, scored, and handed over. It sits above the tools a team already uses (Notion, Figma, Slack, Google Meet) and acts as the source of truth for *what is being built, how ready it is, and who accepted which gaps*. Work stops being lost in translation between founder, PM, designer, developer, and QA: every artifact is checked against a rubric, every handover ends in an executable, AI-ready spec bundle.

The core loop:

idea (chat / meeting / Slack) → routed to a product and opportunity → guided PRD interview (AI author asks, AI critic verifies) → design and tech spec converge under one traceability map → backlog sliced into traced stories → handover ceremony (comprehension walkthrough, version-bound signatures) → SDD bundle + tickets pushed to the task manager → completion read back, meters close.

**V1 scope:** everything from idea capture to development handover, for teams of 1 to ~50, on web. **V1 ends at handover** — development and QA stages are later versions.

**Non-goals for v1:** audio capture or meeting bots of our own, an internet-scanning tool-recommendation engine, auto-fixing Figma files, code-vs-spec validation after the build, teamspaces, gamification cosmetics.

---

## 1. Principles

Every mechanic below follows these laws. Where a conflict appears, the law wins.

1. **Status is derived, never declared.** The system infers an item's stage from which artifacts exist and what they score. No human ever sets or updates a status field.
2. **Advisory everywhere, hard at one gate.** Readiness scores inform; they never block movement — except the development handover, which requires explicit sign-off.
3. **Evidence or nothing.** Every score, flag, and suggestion expands into the exact quoted gap. A number that cannot be interrogated does not ship.
4. **Agent proposes, human confirms.** The AI never silently adds, excludes, closes, or files anything with side effects. One-tap confirms, always undoable. Until confirmed, agent-authored content is visibly attributed to the agent (the design system's violet).
5. **Scores move only when reality moves.** Check results are cached per artifact version; only checks whose underlying artifact changed are re-evaluated. The scoring model is pinned per workspace.
6. **Welcoming, never alarming.** Language is "walkthrough / good catch / this section was unclear," never "test / fail / violation." Idle work dims; it never turns red.
7. **Nothing is ever unknowingly passed downstream.** Gaps, exclusions, and flags are visible debts that a named person accepts. Freedom is total; deniability is zero.
8. **English pivot.** All ingested content gets an English working copy for reasoning; originals are preserved as evidence. Outputs render in the workspace language (EN/TR/NL). Prompt packs default to English.
9. **One editing surface per document at a time.** Aenima holds immutable versions; the mirrored tool (Notion) is the editing surface. No bidirectional merge logic exists.
10. **The system meets teams where they are.** Every stage is skippable, every entry state (blank, upload, connected, live product) works, and skipped checks simply resurface later.
11. **Full export from day one.** Items, scores, versions, decisions, and sign-off records export as JSON + documents.

---

## 2. Object model

```
Workspace (one per account; billing, AI config, members)
└── Product (Sociera, Aurenza, Juno … — isolation boundary, permission boundary)
    └── Opportunity (a problem or outcome, e.g. "new users don't return after week 1";
        holds an evidence pile that outlives individual bets)
        └── Item (a unit of work moving through stages)
            ├── Artifacts: brief, PRD, tech spec, design links, backlog
            ├── Per-stage readiness scores + check results with evidence
            ├── Gaps (open / accepted / excluded), decisions log, evidence links
            └── Pushed tasks, ceremony packet, prompt packs
```

- The **dashboard** is the workspace-level view: essential state of every product at a glance.
- An item may be **unlinked** from any opportunity; that shows as a small advisory gap, never a block. Opportunities are mostly born from intake: the router files fragments as evidence or proposes new opportunities when fragments cluster.
- There are no teamspaces. Products are the only grouping and the visibility unit for roles.
- Every mutating action — human or agent — records its actor, timestamp, and trigger. The agent is a first-class actor.

---

## 3. Stages

Four stages, Double Diamond–derived, renamed so "Develop" is never confused with engineering:

| Stage | Terminates in | Meaning |
|---|---|---|
| Discover | Opportunity Brief | The idea is worth defining. Cheap to kill by design. |
| Define | PRD | What we build is complete and unambiguous. |
| Design | Design package + tech spec | How it looks and how it works, traced to the PRD. |
| Handover-Ready | Signed packet + SDD bundle + tickets | Development can start with zero open questions. |

- Stage is computed from artifacts: no PRD → Discover; PRD in progress → Define; frames linked and mapped → Design; packet signed → **Handed over**, a terminal state that archives the item out of active views (packet stays permanently linkable). When dev/QA stages ship in a later version, they open from this state.
- Backward movement is legal and unceremonious: an artifact change that drops a score is just a score drop, logged with a reason when a human supplies one.
- **Dual-track bridge.** Upstream work (discover, product, design) flows kanban-style with due dates. Development runs its own sprints. Aenima does not impose either; it bridges the seam. Each product carries an optional dev-sprint cadence field ("sprints start Mondays, 2 weeks"). With it set, aenima computes the **ready buffer**: "sprint planning Monday — 2 items handover-ready, ~4 needed." Without it, the buffer simply doesn't show.
- Baselines: each type × stage has a seeded "typical time" (solo scale ≈ 60%, multi-team ≈ 140% of team scale). Shown as quiet info ("items like this usually take about 2 weeks here"), never as deadlines. After ~8 completed items of a type, the workspace's own medians silently replace the seeds and the label becomes "based on your history." Idle-dimming and park thresholds read from this same table.
- **A baseline measures elapsed wall-clock time in a stage — the upper bound of Appendix A's range.** aenima observes when things happen and cannot observe how long anyone concentrated, so an effort baseline would be unmeasurable by construction: nothing in the system could ever compare a value against it. The upper bound rather than the midpoint, because a baseline exists to decide when something has taken *too* long, and flagging an item inside its own normal range would make "at risk" mean "in progress". **A stage with no seeded cell has no baseline, and an item there is never at-risk on time** — that is the honest answer to "is this taking too long" when nothing says how long it should take.

---

## 4. Item types

Seven types on one axis — *what evidence the item needs before development* — plus one agent-inferred intent tag for analytics.

| Type | Definition | Primary artifacts | Rubric weight center |
|---|---|---|---|
| Feature | New capability, user-facing | Brief (optional) → PRD → design → tech spec (conditional) | Stories + error behavior |
| Enhancement | Existing UX changed on purpose, nothing broken | Lean PRD (current vs new) → design | What must NOT change; side effects |
| Technical | No user surface: API, data, infra, refactor, debt | Tech spec (EARS requirements) | Migration/rollback, degradation, observability |
| Content | Copy, imagery, static pages | Copy set | Glossary/voice, locale completeness, claims |
| Experiment | Hypothesis with a kill criterion | Hypothesis + variants + decision rule | Decidability: metric, guardrails, cleanup |
| Fix | Behavior is wrong; correct it | Wrong vs correct behavior (GWT) | Regression guard; shortest rubric in the system |
| Spike | Timeboxed question handed to a developer | One-page question packet | Falsifiable question, decision link, timebox, done-criteria |

- The **classifier proposes the type** at item creation from the item's content; the user one-tap confirms. Nobody studies a dropdown.
- The **applicability engine** then proposes the artifact set: touches data or API → tech spec required; spans frontend+backend → API contract; pure copy → neither. Confirmed in one tap, overridable, logged.
- The same engine governs individual checks: "offline behavior" applies to a network-dependent mobile screen, not to an admin dashboard. Conditions are evaluated by the agent in the same pass that scores; non-applicable checks leave the denominator.
- **Flow-intent tag** (value / quality / risk / debt, from the Flow Framework) is auto-assigned by the same classification call, invisible in daily use, and powers the flow-distribution analytics view ("this quarter: 55% value, 30% quality, 15% debt").
- **Conditional layers float above all types:** a safety layer (user-to-user visibility, interaction, or location → "how could this be misused against a person, and what protects them?" as a Must, weight 5) and a data/compliance layer (personal data or auth surface → privacy checks on). Denominators renormalize when conditional checks enter or leave.

---

## 5. Scoring engine

Each active artifact is scored against its rubric: 0–100, weights zero-sum per rubric, each check tagged **Must** (blocks handover) or **Should** (advisory).

- **Checks are binary with evidence.** A check passes or fails, and a failure quotes the exact gap ("MN-2: 'nearby' — same venue, or within 100 m? Two readings possible."). No vibes-based partial credit.
- **Event-driven re-scoring.** Notion webhooks where available, short-interval polling where not (Figma), debounced so an edit burst triggers one run, plus a nightly full sweep as backstop. Timestamps show freshness ("scored 4 min ago"); a queued retry shows "scored 6 h ago — retrying" during provider outages, never an error banner.
- **Stability.** Results cache per artifact version; only checks whose artifact changed re-run. The scoring model is pinned per workspace and never juggled for cost. Switching AI provider or editing a rubric triggers a quiet re-baseline pass so numbers never wobble without explanation.
- **Rubrics are versioned** like documents. Every scoring run stamps provider + model + rubric version. Rubric edits ship through skill packs (below) with the same re-baseline.
- **Checks are expensive and few; probes are free and infinite.** A rubric stays ~10–20 checks; behind each check sits an open-ended probe library of follow-up questions. Any new check — including ones promoted from the probe library by the learning loop — must take its points from an existing check. This zero-sum budget is what keeps the standard holdable in a human head.

**Negotiation protocol.** Talking the AI into a state change is legal and structured. Persuasion resolves into exactly three typed moves; rhetoric that maps to none of them changes nothing:

1. **"Doesn't apply here"** → applicability re-check. If the condition genuinely fails, the check leaves the denominator.
2. **"Already covered"** → user points at evidence; the pinned scorer re-runs the check against it. Pass → closed with the evidence linked. Fail → the exact remaining gap is shown.
3. **"We accept this risk"** → never closes the gap; converts it to an accepted gap stamped with the accepter's name, routed through the Decider if handover-blocking.

Patterns change the law, not the verdict: when a workspace repeatedly accepts or excludes the same check, the agent proposes a rubric change (versioned, Owner-approved) — it never quietly loosens.

---

## 6. Authoring engine

Documents are created by interview, not by template-filling. Two agents run every session:

- The **author** conducts: drafts from whatever exists, asks the next unanswered question in plain speech, one at a time.
- The **critic** runs behind every answer, blind: it sees only the artifact and the rubric — never the conversation, the author's confidence, or the owner's pushback. It detects and cites; it never rewrites. Every objection must bind to a rubric check ID; unbound objections are discarded (the structural cure for nitpicking). An objection carries four things — the check id it binds to, the reason, the quoted evidence, and its **scope**: which section it may change. A returned section is corrected, not improved. Without a scope the author opens the section, notices two adjacent weaknesses, fixes those too, and a one-check correction becomes a rewrite nobody asked for — which also invalidates the check results cached against the sections it touched. The two-round cap governs attempts; scope governs blast radius, and both are needed.

Session flow, identical at every entry state:

1. **Collect.** "Got anything on this already — a doc, a thread, or just what's in your head?" Upload, pick from connected sources, or keep talking. Skipped when intake already routed material.
2. **Silent test.** The critic runs all checks against everything collected, including the braindump itself. The meter jumps to its true starting score: "14 of 20 already answered from your doc."
3. **Gap interview.** Only the leftovers are asked. The problem block always opens first (everything downstream inherits a wrong problem); after that, whichever question closes the most remaining rubric weight goes next. Each answer is echoed back in doc-language for a one-tap confirm before it's written. A single enthusiastic paragraph is credited against every check it touches.
4. **Close — whenever.** Sessions persist; the meter holds. "Decide later" is always legal and lands in an auto-rendered Open Questions section with the check it blocks.

Hard limits from the self-correction research: **two refinement rounds per section, maximum** — after two, the disagreement surfaces to the human as an open question. Author and critic are separated so the judge is never anchored by the drafting context.

The screen: item page, conversation on one side, the draft document assembling live on the other, meter on top. More material captured upstream (meetings, Slack, braindumps) → fewer questions asked → the system visibly rewards being fed.

---

## 7. Artifact packs

Every artifact type ships with a rubric, an interview bank, critic tests, and probes — together a **skill pack**: versioned content, maintained in a git repo, synced to workspaces on release, pinnable and overridable per workspace (a custom pack repo can be connected). Full packs live in the appendices; the shapes:

### 7.1 Opportunity Brief (Discover)

One page, five-minute read, agent-drafted from the braindump, human confirms. **Skippable by design:** an item can be born directly in Define; the brief's checks then simply fold into the PRD interview. Fix, Spike, and Content never see a brief.

| Block | Check | Tag |
|---|---|---|
| Problem | Specific story of why the status quo fails (observable behavior, not "users are confused"), stated without the solution embedded | Must |
| Lineage | Linked to an opportunity (or a new one created) | Must |
| Potential solution | Direction exists at fat-marker level; UI detail is flagged *down* ("belongs in Define") | Must |
| Kill test | Condition **and** checkpoint date: "dead if pilot venues average <3 concurrent users — checked against Amplitude by March 1" | Must |
| The moment | One as-if-shipped paragraph, agent-drafted | Should |
| Audience | Described behaviorally ("checked into 2+ venues, 0 connections"), not demographically | Should |
| Evidence | Typed signals + an explicit "what we don't know yet" slot; counter-evidence is first-class | Should |
| Rabbit holes + no-gos | Solution details called out to avoid traps; exclusions that keep the bet small. No-gos pre-fill the PRD's out-of-scope | Should |
| Appetite | Worth days / a week / weeks — feeds baselines, never a deadline | Should |

Killed briefs record why and feed the graveyard; their evidence stays on the opportunity. A kill test that is a genuine open question spawns a Spike in one tap.

### 7.2 PRD (Define) — the master rubric

The base rubric is 19 checks, 100 points, 9 Musts; check 20 (safety) is a conditional layer per §4, scored outside the base and entering the denominator only when its condition holds — which is why the base sums to 100 without it. Notations enforced invisibly by the author: **Given/When/Then** for user-story acceptance criteria (what QA tests), **EARS** ("WHEN [condition] THE SYSTEM SHALL [behavior]") for system behavior. Style law: 2–4 pages; any check satisfiable in one unambiguous line gets one line. Header data (status, people, dates, changelog) is generated, never written.

| # | Check | Tag | Pts | Applies |
|---|---|---|---|---|
| 1 | Problem written without the solution hidden inside it | Should | 5 | — |
| 2 | Points to an opportunity | Should | 3 | — |
| 3 | Audience defined behaviorally (could filter a user database) | Should | 4 | — |
| 4 | Evidence attached | Should | 2 | — |
| 5 | Assumptions + how we'd notice they're wrong | Should | 3 | — |
| 6 | Hypothesis: "We believe [change] → [outcome], measured by [metric]" | Must | 6 | — |
| 7 | Metric has baseline + target (or an instrumentation plan if new) | Should | 4 | — |
| 8 | Kill/rollback line ("if blocks rise 20%, we pull it") | Should | 4 | — |
| 9 | Every story has a stable requirement ID | Must | 6 | — |
| 10 | Every story has testable GWT acceptance criteria | Must | 10 | — |
| 11 | Explicit out-of-scope list | Must | 5 | — |
| 12 | Side effects: other flows, emails, notifications, systems, teams this touches | Should | 4 | — |
| 13 | Ship scope: platforms, locales, audience | Should | 4 | — |
| 14 | Per story: what the user sees on failure (EARS) | Must | 8 | — |
| 15 | Empty / first-use states (list-rendering surfaces only) | Must | 6 | list-rendering surfaces |
| 16 | Permission-denied, offline, degraded behavior (conditional) | Must | 6 | network- or permission-dependent surfaces |
| 17 | Every user action has a named tracking event per convention; the hypothesis metric is computable from them | Must | 8 | — |
| 18 | Data footprint declared, personal data flagged (triggers compliance layer) | Should | 4 | — |
| 19 | Misreading sweep: no sentence two developers could read two ways | Must | 8 | — |
| 20 | Safety (conditional, user-to-user/location features): misuse against a person + protections | Must | 5* | layer — user-to-user visibility, interaction, or location |

*Enters via applicability; denominator renormalizes. **Applies** names the condition under which a check counts; — means it always does. The two directions are not symmetric: checks 15 and 16 *leave* the denominator when their condition does not hold, and check 20 *enters* it when its does, because a conditional check belongs to this rubric and a conditional layer floats above all of them (§4). Section D carries the showstopper discipline: the critic probes showstopper classes (interruption mid-action, concurrency, stale data, unverified accounts, locale text overflow); everything below that threshold is legal to resolve as an accepted gap.

Check ids are `prd-1` … `prd-19`, numbered as in the table, plus `prd-20`, which the safety layer carries rather than the base. These are **rubric check ids**, and they are a different id space from the **requirement IDs** a PRD gives its own stories (`MN-2`, `SF-1`) — those are the author's labels for their own requirements, and check 9 is what makes them stable. The two are never mixed: a gap names a check id, a story names a requirement id, and a failure's evidence cites the requirement id as the place the gap lives (§5's "MN-2: 'nearby' — same venue, or within 100 m?" is check 19 failing *at* MN-2).

### 7.3 Tech spec (Design stage, engineering-owned)

13 checks; the interview runs with the engineer. Requirements in EARS across all five patterns (always-true, event-driven, state-driven, unwanted-behavior, optional-feature); every line falsifiable with a number — "fast" and "usually" are auto-bounced. Musts: system problem with today's measurement; EARS requirements with IDs; success as a system outcome (same metric definition for baseline and target); interfaces and consumers with breaking changes classified; migration **and** rollback paths with the point of no return named; degradation behavior per failure mode; what must NOT change, with how each invariant is verified; observability (every requirement has a signal that would expose its violation; alert thresholds are numbers). Shoulds: trigger/lineage, rollout plan (upgrades to Must when breaking changes exist), side effects. Data/security conditional fires on personal data — presence/location fires it every time.

### 7.4 Design package (Design stage)

Scored on a separate 100-point **design hygiene** meter. Law zero: **aenima grades legibility, never taste.**

1. **File structure** — one-word pages: `Cover`, flow pages named by flow, `Components`, `Archive`. Archive is never scanned; scored pages are declared.
2. **Screen naming** — `Flow / Screen – State`; every screen frame carries its requirement ID in the frame description (the thread that makes traceability, walkthrough highlighting, and prompt-pack links mechanical).
3. **State coverage** — *Must.* Every PRD-defined behavior (error, empty, loading, permission, offline) has its matching frame. Pure cross-reference against the PRD's structured data.
4. **Layer hygiene** — semantic names on anything a developer targets, auto-layout on repeating content, no detached-instance drift. Flags carry the exact suggested rename; auto-fix is not v1.
5. **Component discipline** — colors/type/spacing resolve to tokens; interactive elements are system components; property names follow prop/value code format (`state=pressed`). Six component-intelligence detectors run as Shoulds: scattered states → one set with a State property; variant explosion → booleans/instance-swap/text props; wrong merges (fails the same-slot test) → split; **coverage gaps against the PRD** ("Button has no `state=disabled`, but MN-4 defines a disabled condition on this screen"); override drift → expose as property; detach clusters → extend the component (framed as the component's failing, never the designer's).
6. **Copy layer** — real copy, glossary + casing compliance, every workspace locale present or explicitly pending, TR/NL overflow-length flags, no unverifiable claims (routes to compliance, not the designer).
7. **Handoff annotations** — interactions invisible in statics (gestures, transitions) annotated, presence-checked from the PRD's interaction verbs.

**Reference packs:** maintained, versioned encodings of Material 3 (+ Expressive), Apple HIG / Liquid Glass, and exemplar systems — token taxonomies, type scales, touch targets, state models. Used for starter generation (new product declares platform + base system → token set and file skeleton generated), platform-aware compliance Shoulds, and update advisories when a design language revises ("Material changed state-layer guidance; 12 screens affected"). Precedence law: **workspace system > declared base system > generic legibility.** The house system always wins.

**Alignment map** — four edges, run on every re-score, living on the item: PRD↔Figma both directions (a frame with no requirement is invented scope); tech-spec↔Figma (every EARS error line has a designed state; latency budgets imply loading states); PRD↔tech-spec (every requirement covered by a technical approach); events↔Figma (every tracked action has an interactive element, and vice versa). At ceremony, PRD↔Figma and spec-error↔error-frame are Musts. The map doubles as the walkthrough's question index and the prompt pack's frame-link index.

### 7.5 Backlog refinement (bridge to Handover-Ready)

The author slices the converged PRD into stories with GWT acceptance criteria, each traced to a requirement ID. The critic checks the slice: no story too big, no requirement orphaned, no acceptance criterion untestable, and **build order** — no task scheduled before its dependency. The owner walks the slice conversationally (merge, split, kill). Output: the sprint-ready backlog, pushed to the task manager at sign-off.

---

## 8. Handover ceremony

The one hard gate. The packet is a frozen coordinate — item, type, Decider, signers by role, and the version pin (PRD vN · tech spec vN · Figma snapshot · rubric pack version). Signatures bind to that tuple.

**Packet anatomy (one page deep, everything else one click down):** the one-pager (moment paragraph, hypothesis, story list with IDs, out-of-scope, meters at issue time) · the **ledger** — accepted gaps with who accepted each, exclusions, open comprehension flags; nothing signed is ever cleaner than reality · the alignment map · the QA sheet (manual test table per acceptance criterion with device notes; Gherkin scenarios for automation, both generated from the PRD's structured data) · the SDD bundle download · the decision-log extract · the sign block.

**Walkthrough.** Active recall replaces "please read the doc": 3–5 questions max per signer, one retry each, ~10 minutes, async, generated at packet creation with pre-built variants. Per-role: frontend gets states and UX behavior, backend gets data/API/failure paths (from the tech spec's EARS lines), QA gets testability. Selection targets the riskiest requirements: late ambiguity resolutions 30%, spec-patch density 25%, adjacency to accepted gaps 20%, conditional-logic density 15%, cross-boundary edges 10%. Question patterns: behavior trace, failure path, boundary trap ("a user asks to message from the nearby list — in scope?"), FE↔BE contract pair-question (both sides must describe the same contract), state completeness, instrumentation, safety scenario, migration probe. Trivial items auto-shrink to one question or none; when the author is the sole signer, the walkthrough disables itself.

**Every branch closed:**

- Correct answer → checked.
- Wrong + spec clear → the relevant section opens highlighted in aenima's render; a different variant question follows; a second miss becomes a **comprehension flag** routed to the item's product owner. The packet cannot be signed with open flags unless the Decider accepts them by name.
- Wrong + spec ambiguous → **fault attribution** fires first: if the question can't be answered from the pinned docs with one interpretation, the flag lands on the *spec* as a gap, and the signer sees "good catch — the doc was ambiguous, we've patched it."
- Open book is legal: asking the chat, reading the answer, and answering correctly is the mission accomplished, not cheating.
- Question unanswerable from the doc → **librarian mode**: the agent never improvises spec at ceremony; every answer cites a section. Missing answers become a drafted **spec patch** → Decider approves → new version → dev re-answers → signs.
- Patch after signatures → version-bound signatures trigger diff-only re-confirms ("changed since you signed: §4.2").
- Stalled signer → visible in the owner's queue after 48 h; the Decider can waive a walkthrough by name, logged. One person on holiday never freezes a sprint.

**Lifecycle:** Issued (transport message — one line + deep link — to the configured channel) → In review → Ready (all walkthroughs passed or flags accepted) → Signed (item flips to Handed over; tickets and SDD bundle push) → or Waived per signer. The sign-off record stores signer, role, timestamp, exact version tuple, full Q&A transcript, flags accepted by name, waivers, patches with diffs, re-confirms. "Who agreed to ship without offline handling?" is a lookup, forever.

**Ticket generation:** at sign-off, aenima writes the sprint-ready tickets (stories + acceptance criteria, linked to requirement IDs and the version tuple) into the product's Development backlog database. Handover ends with the backlog existing.

---

## 9. Prompt packs (SDD bundle)

The final deliverable: everything the ceremony validated, formatted for the coding agents that will build it. Emitted as Spec Kit–compatible markdown (`spec.md` / `plan.md` / `tasks.md`) with the constitution as `AGENTS.md` (the Linux Foundation cross-tool standard) plus a `CLAUDE.md` mirror. English by default. Design law: **each ticket's pack is self-contained** — everything needed inlined, everything else excluded.

**Layer 1 — constitution** (per product, stable): root file targets ~100–150 lines. Order: product in three lines → stack with pinned versions → **commands first** (exact test/build/lint invocations — the highest-ROI content) → only the conventions that differ from language defaults → prohibitions (never extend scope beyond the ticket; never invent endpoints or fields the contract doesn't define; when the spec is silent, stop and surface the question — never assume) → definition of done → escalation rule. Bulk content moves out: **nested AGENTS.md per area** (backend gets API/data conventions; the app gets design vocabulary and component APIs) loaded only when the agent works there, and **on-demand reference files** (`docs/design-api.md`, `docs/events.md`, glossary) pointed to by path. Human notes ride free in HTML comments. Content is assembled from workspace-confirmed skill-pack rules — the generator selects and formats; it never writes prose (LLM-generated context blobs measurably hurt agent performance).

**Layer 2 — item context** (shared by the item's tickets): the moment paragraph and hypothesis (builders make spec-aligned judgment calls only when they know the why), the out-of-scope list, the API contract, the alignment-map index.

**Layer 3 — ticket pack** (the unit a developer pastes): header with ticket ID, requirement IDs, and the pinned version tuple · objective (story + one-line why) · spec (GWT acceptance criteria verbatim; the EARS behaviors touching this ticket; this ticket's error/empty/permission states — nothing from other tickets) · plan (tech-spec extract; the endpoint contract in full with every error code and its user-facing consequence) · design (frame links plus inlined essentials: components with props, tokens, state notes) · events with payload schemas · the fence (this ticket's out-of-scope lines) · **done means** as executable commands (the exact test invocation for this ticket's Gherkin scenarios, lint, locale-completeness check — listed programmatic checks get run and fixed by the agent before it reports done) · the preamble: *"This spec has been validated and signed; where your judgment and the spec conflict, the spec wins. Where the spec is silent, stop and list the question. Run in a fresh session; use subagents for codebase research. If context compacts, preserve the modified-file list and the test commands. Report back as: ACs implemented, tests written, open questions."*

The report-back flows into aenima as completion signal and question intake. Packs pin to their version tuple; any source bump marks them stale and regenerates. A mid-build question in aenima chat becomes a spec patch → new version → regenerated pack. Every question a pack failed to answer becomes a candidate probe — the pack teaches the rubric that generated it. Section ordering stays stable across tickets so the constitution prefix stays prompt-cache-hot.
---

## 10. Intake and routing

Aenima owns the routing engine; capture belongs to the tools that already do it.

**V1 sources:** in-app chat (any page), direct upload (PDF/docx/markdown), Slack, Microsoft Teams (channel messages), Fireflies (meeting transcripts), a Gmail forward-in address per workspace ("forward it to sociera@aenima.app" makes everything an integration), and Google Drive — the folder Gemini's Meet notes land in ("Google Meet", plus "Legacy Meet Recordings"), watched via change notifications with polling fallback. Meeting-note docs carry their own header metadata (title, date, attendees) for classification; enabling Meet transcription gives the router richer raw material. WhatsApp and tl;dv are not v1.

**Notion is an intake source, not just a mirror.** Four input classes flow in from the connected workspace:

1. **Comments** on mirrored artifact pages — classified like any fragment: a stated decision becomes a decision-log proposal; a flagged problem becomes a candidate gap or open question on that item; a thread that resolves an open question proposes closing it. Comment author and timestamp ride along as evidence. **Read-only in v1:** aenima ingests comments but never replies in a Notion thread — every aenima conversation happens in aenima, and Notion stays free of bot noise. In-thread librarian answers are a v1.1 experiment.
2. **Hand-created tasks** in any watched tasks database — the router links each to the item it belongs to (visible undo), or proposes a draft brief when it reads like a new idea. Watched databases are read for intake only; aenima writes exclusively to its own managed backlog (below).
3. **Hand-written docs** in watched pages — a new page that reads like a PRD or brief triggers an adopt proposal ("this looks like a PRD for Meet Nearby — bring it in?"); accepted, it lands as an item artifact and gets the usual silent test.
4. **Property changes on linked tasks** — status flips feed completion readback; assignee changes update gap-task ownership.

Scope guard: aenima adopts only fragments that map to its products, opportunities, and items. Tasks and pages that belong to none stay untouched — aenima never becomes the team's general task manager.

**The router**, on every inbound fragment: translate to the English working copy (original preserved as evidence) → classify by product → split by type: idea / decision / evidence for an existing opportunity / task / noise → file. New ideas become draft briefs at ~20% readiness. Clustering fragments propose a new opportunity. Duplicate meetings (Gemini + Fireflies covering the same call) dedupe on title + time; the richer source wins. Gemini notes are treated as pre-summarized: extracted, never re-summarized.

**Confidence policy: aggressive-with-undo.** High-confidence fragments file themselves with a visible undo trail; only sub-threshold items land in the **triage inbox** ("3 items I wasn't sure about"). A system that asks constantly feels like a form; undo is cheaper than interruption.

**Privacy:** one meeting can span products; the router splits and files per product, and nothing ingested for product A ever surfaces in product B's context. Raw transcripts and message bodies purge after 30 days; routed extracts (with source references) keep indefinitely. Onboarding shows exactly which folders and channels are read, editable.

---

## 11. Integrations, sync, versioning

| Slot | V1 | Fast-follow |
|---|---|---|
| Docs in | Notion, Google Docs, direct upload | Confluence, Coda |
| Design in | Figma | — |
| Tasks out | Notion | Linear, Jira, then Azure DevOps |
| Intake in | Slack, Teams, Fireflies, Gmail forward-in, Google Drive (Meet notes) | tl;dv, WhatsApp forward-bot |

**Task sync is one-directional truth:** aenima writes gap-tasks and handover tickets (each with a backlink) into its own **Development backlog** database — one per product, created by aenima inside the aenima-managed section, with a schema it owns: title, aenima item ID, requirement IDs, type, stage owner, acceptance criteria, version tuple, status. Because aenima defines the schema, no property mapping or onboarding negotiation is needed and nothing breaks when a team reorganizes its own boards. Completion reads back from that database: a ticket checked off there clears the gap at the next re-score and the meter rises — no one touches aenima. Teams that prefer their existing board move tickets out of the backlog manually; aenima keeps scoring from its own copy. No bidirectional editing of artifact content exists. Gap-tasks auto-assign to the item's stage owner.

**Versioning:** aenima's ledger holds every artifact as immutable versions — it is the only version system, because Notion's history is not API-accessible. Notion shows production-current only: one aenima-managed section per product holding two databases — Artifacts and Development backlog. In the Artifacts database, each artifact is a row whose page body is the current version, with properties carrying the stable aenima ID (never in the title — humans rename titles), type, version number, status, last-synced hash, and a link to full history. Human edits in Notion flow in via events and cut new versions; aenima's drafts land as visible suggestions; accepting cuts a version. **Rollback is revert-as-new-version:** restoring v4 cuts v7 with v4's content — history never rewrites, so signatures and diffs always point at versions that exist. Sync mechanics: content-hash per block, local diffing (the API rate limit is ~3 req/s), webhook + polling, nightly reconciliation. Onboarding includes a coverage check ("I can see 3 of your 4 databases — share the last one?").

---

## 12. AI layer

**Bring-your-own AI, workspace-level.** Certified providers: **Claude and OpenAI.** One provider is active at a time; the Owner holds the key, pays the bill, and every member's actions run on it with per-member usage attribution. Identity login is never AI-vendor auth: email code + Google + Apple, passwordless (6-digit codes, ~10-minute expiry, rate-limited, no account enumeration). Anthropic requires API keys for third-party products; where a provider officially offers an OAuth connect flow, the abstraction supports it.

**Routing:** three intra-provider tiers — routine (intake classification, applicability, translation) on the cheap model; analysis (scoring, evidence extraction) on mid; generation (drafts, questions, patches) on top. No cross-provider juggling. The **scorer is pinned** and never moved for cost. A routine-tier output that fails schema validation retries once on mid — robustness, not optimization. Prompt caching is structured in from day one (rubric + artifact contexts repeat constantly); batch discounts and confidence cascades are later optimizations. The usage meter shows spend per tier and per member, with an optional Owner-set cap. Provider outages queue scoring silently; the timestamp does the honest work.

**Deterministic work is code, never a model call.** If a transformation can be described without the words judge, decide, assess or summarize, it is code and must be written as code. Merging, ranking, deduplicating, diffing, counting, cross-referencing and arithmetic each have exactly one correct answer; routing them through a model adds cost, latency and variance to a step that had none, and makes a wrong answer possible where none was. This is a standing constraint on every tier: the routine tier exists for classification and translation, not for work a function could do. Denominator renormalization, content-hash block diffing, duplicate-meeting detection on title and time, the alignment map's cross-references, and glossary termhood statistics are all code by this law. When a ticket reaches for the model, the first question is whether the step names a judgment at all.

**Golden set:** the certification harness, built by mutation — a clean, anonymized artifact that passes its rubric spawns mutants with one planted defect each (deleted error-state line, blurred term, off-convention event), so expected verdicts are known by construction. V1 smoke set ≈ 100–150 labeled checks covering every Must across the seven types, intake samples (including a deliberately multi-product transcript), applicability cases, ambiguity pairs, with EN/TR/NL variants of a core subset. Runs at provider certification, after any model-version change, and on every skill-pack release; versions with the packs. Every real-world miss becomes a new labeled sample.

**Language:** UI, chat, interviews, critic questions, evidence, digests, ceremony — all in EN/TR/NL. Reasoning runs on the English working copy; quotes shown as evidence render in their original language. Terms without a clean equivalent keep the English original ("event taxonomy" stays inside a Turkish PRD).

**Glossary system.** Two layers. The *universal loanword list* (shipped, static): ~80 product/engineering terms that stay English inside TR/NL text. The *workspace glossary* (harvested): candidates come from noun-phrase patterns, Figma text, event/component names; admission requires termhood — over-representation vs general language × spread (≥3 occurrences across ≥2 items or ≥2 source types) × 90-day recency decay. Three fast-tracks skip the statistics: UI-visible strings, structural vocabulary (events, components, opportunity titles — auto-active), and **divergence detection** ("Login" vs "Sign in"; "mekan" vs "yer") — the highest-priority proposal, shown with variants and counts for the human to pick a winner. Confirmation is capped: top ~15 at onboarding harvest, then ≤3/week in the digest. Lifecycle: candidate → active → dormant (6 months unused; leaves the always-loaded context, auto-proposes reactivation on reappearance) → retired (human only). Soft cap ~40 context-loaded active terms. Entry: term, one-line definition, translation per locale or do-not-translate flag, casing, status, usage counter, evidence links. Voice rules (casing, TR formality register, banned words) are decided once per product and feed copy checks, interviews, translations, and packs.

---

## 13. Surface

**Primary view: a prioritized list, not a board.** Status is derived, so a drag-to-move board would be decoration. Three buckets:

- **Your move** — anything awaiting a human: sign-offs, exclusion confirms, triage items, walkthrough answers, stalled packets (>48 h). Always on top.
- **At risk** — score regressed this week, a handover-blocking gap older than 5 days, or time-in-stage past ~1.5× the learned baseline. Sorted by blocking-gap age 40%, regression size 30%, staleness ratio 20%, handover proximity 10% (weights tunable).
- **Flowing** — everything else, by recent activity.

A thin pipeline strip on top shows counts per stage. Each row carries per-stage readiness meters. Idle items dim relative to their stage baseline and receive a one-tap, reversible **park** suggestion; the parked list ("graveyard") is a first-class, guilt-free destination — killing ideas cheaply is the system working. Retroactive imports keep historical gaps in a separate **foundation gaps** view with one-tap "adopt," never polluting the buckets.

**Chat is everywhere and is a full action surface.** It is also the command palette: `Cmd/Ctrl+K` focuses it from any page. Globally aware (whole workspace), page-aware only for pronoun resolution ("park this" needs no name on an item page; "how's Juno doing?" works anywhere and navigates you there while answering). It performs every permitted move — park, confirm exclusions, log decisions, push gaps, draft patches — and respects the role matrix: a Developer asking for a rubric change gets "that's an Owner action — want me to request it?" It answers ceremony questions in librarian mode and captures decision moments ("so we're dropping video for V1 because of capacity") with an offer to log them: decision, reason, date, who.

**Notifications route by role.** Owner: daily digest + spend alerts. Product: triage, exclusion confirms, regressions. Developer: packets and walkthrough follow-ups only. Viewer: nothing by default. The **daily digest reports deltas, never state dumps:** new blocking findings, resolved findings, regressions, aging sign-offs, ready-buffer line, glossary proposals — in the same neutral voice throughout.

---

## 14. Roles

Workspace-level roles, per-product visibility toggles. Permission bundles under the hood so custom roles slot in later.

| Role | Can | Cannot |
|---|---|---|
| Owner | Everything: billing, integrations, AI key + cap, rubric/skill-pack edits, roles, products. Fallback Decider. | — |
| Product | Create/edit items and opportunities, run interviews, confirm exclusions, log decisions, triage intake, initiate handover | Workspace settings, AI keys, rubric edits |
| Developer | Read their products, author technical artifacts (tech spec, API contract), sign packets, answer walkthroughs, chat | Edit PRDs, opportunities, rubrics |
| Viewer | Read-only | Everything else |

Each product names a **Decider** (config field) who approves spec patches, accepts flags, and can waive walkthroughs; removal or absence falls back to the Owner automatically — handover never blocks on a missing human. Invited members skip onboarding entirely: invite link → Google/Apple/code → land directly on the thing they were invited to, under a minute, zero setup screens.

---

## 15. Analytics (v1)

Every scoring run, gap event, reopen, ceremony question, and park is stored — history is load-bearing. Views: **gap-cause trends** (which checks fail most, by stage and type), **reopen reasons**, **section heatmap** (which spec sections generate walkthrough and ceremony questions — where specs chronically underspecify), **graveyard patterns** (why ideas die, at which stage), **score-over-time** per item and product, **flow distribution** (value/quality/risk/debt per quarter), **ready buffer** trend, and the **usage meter** (spend per tier, per member, escalation-to-mid rate as the quality early-warning light).

---

## 16. Onboarding

**Owner path:** sign up (passwordless) → **connect AI — step zero** (with a visible sample check as connection test; without a key, meters show "connect AI to activate scoring," never zeros) → connect sources with the coverage check → declare each product's state: *idea / in design / in development / already live* → watch the pipeline reconstruct: items inferred, stages derived, first scores, top gaps → glossary harvest (top ~15 with receipts) → done. Import-first: the magic moment is aenima reading what already exists, not forms.

**Retroactive products** are scored fully — past included — with historical gaps filed as foundation gaps (visible, adoptable, never a wall of red). **Mid-stream drop-in:** upload a PRD + Figma link into any item and the silent test returns the gap list in minutes; nothing else required first.

**Member path:** invite → auth → the destination. Nothing else.

---

## 17. Roadmap after v1

**v1.1:** Linear and Jira, then Azure DevOps; Confluence/Coda/tl;dv; librarian-mode replies inside Notion comment threads; Figma auto-fix (opt-in write-back); confidence cascade + batch-API scoring + full golden harness; runtime hook configs that hard-enforce the ticket fence in Claude Code; additional languages on demand.
**v2:** development and QA stages (opening from the Handed-over state), code-vs-spec validation (SDD's missing phase), voice intake and aenima's own meeting agent, the living tool-recommendation engine (scanning what real teams use per stage — every recommendation with receipts), teamspaces, custom roles, per-seat pricing.

---

## 18. Seed-content workstream

The platform is an engine; these packs are the fuel and the sellable IP. Two production laws: **English is the authoring source** (TR/NL are a translation build-step over finished packs, never parallel authoring), and **Sociera is the quarry** (rubrics extracted from real PRDs, real Figma files, real questions the dev team asked).

Production order: 1) universal loanword list + baselines table (days; everything renders with them) → 2) Feature Define rubric + interview pack at full depth → 3) mutation-built smoke set from two real PRDs → 4) remaining six type packs + design rulebook content + ceremony templates + prompt-pack constitution rules → 5) reference packs (Material / HIG–Liquid Glass / exemplars). Owner authoring concentrates in exactly two places: voice/glossary decisions, and the final word on every Must.

---

## 19. Open items

1. TR formality register (sen/siz) per product — decided once at product creation.
2. Final universal loanword list (~80 terms) — to author.
3. Seed baseline numbers — proposed values below; confirm or adjust.
4. At-risk sort weights — shipped as defaults above; tune after four weeks of real use.
Decided in v1.1: tickets land in an aenima-managed Development backlog database per product; Notion comments are read-only ingest.

---

# Appendices

## A. Seed baselines (team scale; solo ≈ 60%, multi-team ≈ 140%)

| Type | Brief | Define | Design | Tech spec | Refine + ceremony | Handover-ready (elapsed) |
|---|---|---|---|---|---|---|
| Feature | ~1 focused hour | 2–4 focused days | 3–7 days | 1–2 days | 1–2 days | 2–3 weeks |
| Enhancement | — | 1–2 days | 2–3 days | conditional | 1 day | 1–1.5 weeks |
| Technical | — | — | — | 2–4 days | 1 day | 1–2 weeks |
| Content | — | hours | 1–2 days | — | hours | 1–3 days |
| Experiment | ~1 hour | 2–3 days | 2–4 days | conditional | 1 day | 1–2 weeks |
| Fix | — | hours | conditional | — | hours | 1–2 days |
| Spike | — | — | — | — | — | its own timebox |

Labels read "items like this usually take about …". Tenant medians replace seeds after ~8 completed items per type.

**These are elapsed wall-clock durations** (§3), and two consequences follow from the table above. The **hour-scale cells are effort estimates, not baselines**: "~1 focused hour" is how long writing a brief takes someone, not how long a brief may sit, and spent as elapsed time it would mark an item at risk ninety minutes after it was created — against §1's "welcoming, never alarming". So **Discover carries no baseline for any type**, and no item is ever at-risk on time for sitting in Discover. The **day-scale cells are used as elapsed seeds and are knowingly loose**: several were also written as focused time, so they run short as wall-clock, which is a wrong magnitude rather than a wrong kind of quantity. §19 item 3 — confirming these numbers — stands, and tenant medians retire the whole question per type once there is history to compute one from.

## B. Feature interview bank (question → critic test, condensed)

1. "Forget the feature — what's going wrong for users right now?" → delete the proposed solution from the answer; if nothing remains, it's a solution in disguise.
2. "Which bigger goal does this serve?" → opportunity linked or created.
3. "Who exactly feels this — by what they do, not their age?" → the description could filter a user database.
4. "What made you sure this is real?" → ≥1 attached artifact with a source.
5. "What are you quietly assuming — and how would you notice if it's wrong?" → each assumption pairs with a detection signal.
6. "Complete: we believe ___ will lead to ___, measured by ___." → exact three-slot shape, measurable third slot.
7. "What's that number today, and where should it land?" → baseline + target, or an instrumentation plan.
8. "What result would make you turn this off?" → concrete threshold.
9. "Walk me through it as the user, step by step; I'll turn each into a story with an ID." → every capability became a story; no verb left storyless.
10. Per story: "You're checked in, you tap wave — what must be true right after, and how fast?" → GWT with an observable outcome a tester can verify.
11. "What will people ask for that we're NOT doing this round?" → adjacent-obvious exclusions named; an empty list on a Feature is bounced once.
12. "Beyond its own screens — what flows, emails, notifications, systems, or other people's work does this touch?" → named surfaces and systems, cross-checked against the Figma map.
13. "Where does this ship — platforms, cities, everyone or a test group?" → all three dimensions.
14. Per story: "It fails — network hiccup. What does the user see?" → a described behavior per failure, written down in EARS.
15. "First user, empty list — what's on the screen?" → content + a next action, not just "empty state exists."
16. "Location permission off. No internet. Walk me through each." → one behavior per condition; "ask for permission" alone fails (what if they refuse?).
17. "Which moments do we need to see in the data? I'll draft event names in your convention." → every user action has an event; the hypothesis metric is computable; misses are bounced with the missing event named.
18. "What does this store or read about a person — anything sensitive?" → storage list present; the personal-data flag consistent with it.
19. Critic sweep, no question: two-readings sentences returned as pointed choices ("'nearby' — same venue, or 100 m? MN-2 could mean either"), each resolution written into the doc.
20. Safety (conditional): "How could someone use this against another person at 2 a.m., and what stops them?" → protections cited in the spec.

Follow-ups are generated from the critic's specific objection — "be more specific" is banned phrasing. Probe library (open-ended, shared across types where the section exists): interruption/backgrounding mid-action, double-tap concurrency, stale data, unverified accounts, TR/NL text overflow, notification timing, old app versions, priority-if-cut.

## C. Ceremony transport templates

Slack/Teams message: "**[item] is handover-ready** — [n] stories, [n] accepted gaps. Your walkthrough: ~[n] questions, ≈10 min. → [deep link]". Nudge (48 h): "[item] is waiting on your sign-off — [n] questions left." Patch notice: "§[x] changed since you signed — 1-tap re-confirm. → [diff link]". All templates: one line, one link, no exclamation marks.

## D. Constitution skeleton (root AGENTS.md, per product)

```
# [Product] — Agent constitution
[Product] is [three lines: what, for whom, platforms].
## Stack
[.NET x.y · Supabase · Flutter x.y · test framework · repo layout]
## Commands
test: [exact] · build: [exact] · lint: [exact]
## Conventions
[only deviations from defaults: naming, error handling, commits,
 localization: every user-facing string in EN/TR/NL via string table]
## Prohibitions
- Never extend scope beyond the ticket.
- Never invent endpoints or fields the contract doesn't define.
- Where the spec is silent: stop and list the question. Never assume.
## Done means
All listed checks pass. Report: ACs implemented, tests written, open questions.
## References (read on demand)
docs/design-api.md · docs/events.md · docs/glossary.md
<!-- generated by aenima · [version tuple] · humans: edits happen in aenima -->
```

Nested AGENTS.md per area (backend/, app/) carry area-specific conventions only. CLAUDE.md mirrors the root.

## E. Glossary starters

Universal loanword seeds (EN kept inside TR/NL): sprint, backlog, event, endpoint, rollout, canary, feature flag, edge case, handover, spec, ticket, commit, deploy, staging, production, webhook, token, cache, latency, throughput, migration, rollback, opt-in, onboarding, retention, churn, funnel, cohort, A/B test, baseline, uptime, … (author to ~80). Workspace-glossary entry template: `term · definition (one line) · TR · NL · do-not-translate? · casing · status · usage-90d · evidence`.

## F. Golden-set specification

Core: 2 real anonymized Sociera PRDs (passing), 1 tech spec, 1 design file map, 5 intake fragments (incl. one multi-product transcript). Mutation classes: deleted Must content, blurred term (ambiguity), off-convention event name, missing state frame, wrong applicability, planted misuse gap, mistranslated variant. Target: 100–150 labeled checks, every Must across all seven types covered ≥2×, EN/TR/NL variants of the core PRD. Pass thresholds per task tier recorded per provider+model; a certification report is stored with every skill-pack release.

---

*End of specification. Change through aenima's own loop once it exists: patch → version → re-confirm.*
