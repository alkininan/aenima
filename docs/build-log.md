# aenima — build log

<!-- Keep this file in the Claude Project context and update it after every ticket.
     It exists so a fresh chat knows where the build stands without you re-explaining.
     Keep it short: state, decisions, open questions. Not a diary. -->

## Current state

**Phase:** 3 — authoring · phases 0 (foundation), 1 (the spine) and 2 (the scoring engine) complete
**Next ticket:** T3.1 — the author/critic loop: two-round limit, check-ID binding (§6)
**Repo:** github.com/alkininan/aenima
**Deployed:** yes — **aeni.ma** on Vercel

`docs/design-spec.md` is **v2.17** and `docs/product-spec.md` is **v1.5**, both complete and
closed, and the code matches. v1.4 landed just ahead of T2.2: §12's code node law, and the scope
a critic objection carries (§6).

The form language was settled over two runs against real use of the sign-in flow. v2.3–v2.6:
48h fields, floating labels bound at every moment, an always-reserved label zone and helper
line, the subtitle slot, the step header, one-text fields, the focus split, flag-slow
validation. v2.7–v2.12: centred step chrome and the **neutral** button variant; the deep ramp
and aero materials (#08090C base, `--grad-primary`, field sheen, press squish); derived values
pinned and the brand hexes reconciled; the resend cooldown, and a helper line carrying only its
own field's errors; field state reaching the leading icon, a 24h label zone, and one variant
for all step chrome.

v2.13–v2.15 came out of the first surfaces rather than the sign-in flow: SemiBold buttons, the
sidebar's bottom account slot and a nested-radius rule, then the laws the list surface needed —
glass is navigation and nothing else, buttons a step smaller again, the item row as a
continuous ledger, the type label bare, and row meters waiting until scoring exists.

## Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript strict | confirmed |
| Styling | Tailwind v4 | confirmed |
| Data + auth | Supabase (Postgres, Auth, Storage, RLS) | confirmed |
| ORM | Drizzle | confirmed |
| Jobs | decide at Phase 2, default Inngest | deferred |
| Tests | Vitest + Playwright | confirmed |
| Hosting | Vercel | confirmed |

Mark each **confirmed** before T0.1. Swapping after T1.1 is expensive.

## Tickets done

T0.1 — scaffold, strict TS, ESLint+Prettier, Vitest, Playwright, folder skeleton — `4e4d5ae`
T0.2 — design tokens, three faces, Æ mark, five primitives, /dev/primitives preview — `bdbaab6`
T0.3 — eleven composites, page.tsx replaced, layout metadata, scaffold assets removed — `e04da9f`
T0.4 — Supabase + Drizzle, object tree schema, RLS isolation, three-layer append-only ledger,
  passwordless email OTP, first-run bootstrap, seed — `774621d`
T0.4 follow-up — sign-in verified end to end (code arrives, verifies, session sticks). Guard test
  pinning the OTP call arguments — `5c6709c`. First-run `/app` crash fixed: `bootstrap_workspace`
  now returns the workspace row and is idempotent — `5a1514d`, migration `0002`.
T0.4 follow-up 2 — the ledger's actor id becomes a recorded fact, not a foreign key, so an
  auth user can be deleted without rewriting history — `91c0b0f`, migration `0003`.
T0.5 — form language onto design spec v2.3: 48h fields, floating labels bound at every
  moment, reserved label zone and helper line, autofill paint, subtitle slot, §8 multi-step
  action row. OTP responsive per v2.4 — `0cad302`.
  **§4 ruling:** "any control on the path from invite link to landed session carries a <768
  rule" means **verified usable at 375, not given a distinct narrow variant**. Add a variant
  only where verification fails — the OTP needed one because it overflowed. Settled; do not
  re-litigate.
T1.1 — `gap` and `decision` tables, `item.flow_intent`, RLS on both, the typed query layer
  over the object tree, derived stage as a pure function, extended seed — `19e55a8`,
  migration `0004`.
T0.6 — second form-language pass onto design spec v2.5: Iconoir replaces the hand-drawn
  glyphs with `icons.tsx` as the single import point, step header, `ui-label`, one-text
  fields, the focus split, flag-slow validation, dimmed placeholder — `e078857`; the spec
  revision itself is `ceb5789`. Its three findings closed as design spec v2.6 — `a609532`.

Design spec v2.7–v2.12 — the form language finished against real use of the deployed flow:
  step alignment and the neutral variant `6ce8522`; the deep ramp and aero materials `ad7f718`;
  the derived press value and the brand hexes `ffe8e3c`; the resend cooldown, the 1px label
  offset and the step title's type `e80dee9`; the cooldown starting at the first send `1726709`;
  field state to the leading icon, the 24h label zone, one step-chrome variant, and the
  wrong-code/expired split `75d9b21`. `/dev` gated on the build mode — `f9ef16b`.
Deploy — Vercel, live at **aeni.ma**. Resend sends the OTP mail as `auth@aeni.ma`. First run
  verified end to end for a non-Gmail address. Checked in production: `/sign-in` 200, `/app`
  redirects to it, `/dev/primitives` 404s.

T1.2 — the §13 list surface at /app: three buckets, pipeline strip, 56h item row, over T1.1's
  query layer and real `deriveStage`. Item keys (`soc-12`) by trigger, migration `0005`. Pure
  `buckets.ts` and `baselines.ts`; `Meter` as a new primitive, hollow everywhere until scoring
  exists — `1d87402`. The effort/elapsed ambiguity it surfaced closed as product spec v1.2, with
  the seed extended so all three buckets have something in them — `a615cc1`.

Production 500 fix — the RSC boundary: dictionary functions cannot cross from a Server Component
  to a client one. Closed the hole that let it ship — `/dev/list` renders that boundary in a
  Playwright run against a real `next build`, and the `/dev` gate is negative-checked. Sign-in's
  focus modality starts unset — `55b10f5`.

Design spec v2.13–v2.15 — SemiBold buttons and the production-build e2e `b1e9e22`; the sidebar's
  bottom account slot and the nested-radius rule `b9fa68b`; glass as navigation only, buttons a
  step smaller, the item row as a continuous ledger, the bare type label, and row meters waiting
  for scoring `36a38e4`; the sm button's padding derived from its height `4f5443d`.

T1.3 — the item page at `/i/<key>`: header, artifact list, activity ledger, chat dock, all
  read-only over `getItemByKey` — `d09ba0b`. The ledger indexed by subject, migration `0006`, and
  the seed writing item-level activity so the page has something to show — `4f66847`. The
  opportunity an item came out of now renders in the header as plain text: `/o/<key>` is
  unbuildable until opportunities have a key column, and a uuid route defeats the reason
  `routes.ts` keeps segments short — `d96d70e`, open question 9.

T2.1 — the skill-pack format and the Feature PRD rubric as data: §7.2's checks and Appendix B's
  interview bank transcribed, applicability and denominator renormalization as pure functions,
  §5's zero-sum budget enforced at load and throwing — `67f0c05`. Four things §7.2 left open were
  decided on the ticket: check ids are its own row numbers, check 20 is a conditional layer rather
  than a base check, check 15 is conditional too, and the seed's `gap.check_id` values were left
  for T2.3. The arithmetic behind the second was already in the table — rows 1–19 carry exactly
  100 points and exactly 9 Musts — and §7.2 now says so, as product spec v1.3 — `a30ab13`.

T2.2 — the AI provider abstraction: one seam every AI call goes through, both providers behind it,
  three tiers per §12, schema-validated output with §12's single escalation, and the usage meter.
  Keys are workspace-held in Supabase Vault with the public row holding only a pointer, a hint and
  §5's pinned scorer model; migration `0007` — `cdacb24`. Model IDs, structured-output shapes,
  caching semantics and prices were read off each provider's live documentation on 2026-08-24
  rather than recalled. A fresh-context review of the diff against the spec returned seven
  findings, all closed with the tests that keep them closed — `a2bb53e`. Two were real defects: a
  failed scoring call metered against the tier map's model rather than the pin, and an
  `AiRequest.purpose` wide enough to route a scoring call down a tier. Both were invisible while
  two values coincided.

T2.3 — the scoring run: an artifact version and a pack in, per-check verdicts with quoted evidence
  out, stored and reconciled into gaps. `scoring_run` and `scoring_check_result` are the fifth and
  sixth append-only tables; §5's cache is the unique index on (artifact version, pack, pack
  version), so re-scoring an unchanged version is a hit rather than a second opinion. One call per
  run, applicability decided in the same pass and renormalized by T2.1's pure function, every
  failure's quote verified against the artifact before anything is written, and a failed run
  writing nothing at all. Migrations `0008`, `0009` for two CHECK constraints that did not hold,
  and `0010` for the protocol fingerprint in §5's cache key. The seed gained a real PRD to score,
  and open question 11 is closed — `MN-2`, `MN-7`, `SF-1` and `SF-2` were requirement ids naming
  no check, and are now `prd-19`, `prd-16` and
  `prd-20` with the requirement id moved into the evidence where §7.2 puts it — `19a079f`.
  Verified end to end against Claude Sonnet 5 on the seeded PRD: **58.6 out of 100, 58 of 99
  points**, six checks failed, every quote real, and a second run answering from the cache in
  581ms without calling the provider. **That run predates the second review pass below**, which cut
  a sentence from the protocol; re-scored against the shipped protocol the same document comes back
  **66 of 99**, because `prd-19` was passing on the leak rather than on its own rubric prose. The
  answer key still says 58 — it is labelled against what the rubric should find, not against what
  the current prompt does find, and the gap between the two is the finding. See the second run
  recorded beside the marking scheme.

  A **second** fresh-context review, run against §5, §4, §1 and §12 after the first, returned four
  more, all real and all fixed here:

  1. **The fabrication guard normalized past typography.** `normalizeForQuote` opened with NFKC,
     which is *compatibility* normalization — it rewrites characters into other characters. `10⁵`
     folded to `105`, `m²` to `m2`, `½` to `1⁄2`, `№` to `No`, `Ⅳ` to `IV`. A model that retyped a
     superscript as a digit had its quote verified against a number four orders of magnitude from
     the one the PRD wrote. NFC now, and the five pairs are the test.
  2. **`prd-19`'s standard was in the protocol.** "If two readings of a sentence are possible, give
     both" is the misreading-sweep check — an 8-point Must — paraphrased into the run layer, where
     it would have applied to every pack that ever ships. Cut.
  3. **The cache key covered `PROTOCOL` and not the rest of the prompt.** `renderPack`,
     `renderCheck` and `renderArtifact` shape what the model reads just as directly and nothing
     versioned them. `PROTOCOL_VERSION` is now computed rather than typed.
  4. **Nothing bounded a note or a quote before the column that refuses them.** An over-long answer
     aborted the write transaction and threw past all four of `ScoreResult`'s failure shapes, after
     the provider had been called and billed. Clipped at read time and recorded; the write returns
     a typed failure.

  Each fix negative-checked: defect reintroduced, named test observed failing, reverted. The
  review's four fixes are in `19a079f` with the rest of the ticket — the cold session read the
  working tree, so there is no separate follow-up commit to name.

  **The guard's first real markdown document, found while testing before Phase 3.** The fold above
  handles typography and stops there, so on a markdown artifact it compared a model's prose against
  the source's syntax: a quote spanning `**on the server only**` came back without the markers and
  failed. Scoring a five-page internal spec died that way on run five of six — the run rejected,
  nothing written, the provider already billed — and the rule was arbitrary from a reader's side,
  since a quote wholly inside or outside an emphasis span verified and one that *spanned* one did
  not. So the guard preferentially rejected the longer, more contextual quotes, the better ones, on
  any document where people bold the load-bearing phrase. Emphasis markers now normalize away the
  way whitespace does, on the same grounds: they are how a sentence was set down, not what it says.
  `sample-juno-feature.md` scores end to end where it could not before, and that run's `prd-19`
  failure cites `the same pair is rewarded for their first 2 dates only` — a bold span in the
  source, quoted without its markers, the exact shape that used to abort the run. Not a new ticket:
  this is T2.3's `normalizeForQuote`, and the four decisions it turns on are below.

  `PROTOCOL_VERSION` does not move. The guard is not in the digest — `fingerprintSubject` covers
  `PROTOCOL` and the three renderers, all in `prompt.ts`, which this does not touch — so the stamp
  stays `1.1.0+602d20db225ee669`, §5's cache key is unchanged and no re-baseline is owed. That is
  right in kind rather than lucky: the fingerprint versions what the model *reads*, and the model
  reads the same bytes as before. Nor is any stored run affected: every row in the ledger was
  accepted by the stricter guard, and this one only ever accepts more of what a model sends next.
  (What is **not** true is that no quote which verified before can fail now — the pairing rules are
  context-sensitive, and open question 25 holds that corner.) Both sides still normalize through the
  one function, and `renderArtifact` was deliberately left alone: `run.ts` builds `artifactText`
  once and hands the same variable to the scorer and to `readAnswer`, so what the model reads and
  what the quote is checked against cannot drift apart.

  Every new test negative-checked by reintroducing the defect it names — each fold removed or
  un-paired, the folds reordered, code-span protection removed, the flanking rule dropped, the line
  and paragraph bounds removed, the link and underscore folds added, the substring test loosened to
  a word-subset match. **Four fixtures were found worthless that way and replaced**, which is the
  practice earning its keep: a quote sitting *within* an italic span is a substring of the source
  with no fold at all; a quote echoing the source's markers back verbatim is too, so it now moves
  them instead; the line-break case needed two CSS comments rather than two paths, since flanking
  already excluded the paths; and the paragraph-bound case needed two markers that are both flanked,
  since nothing was pairing them otherwise. The NFKC test was negative-checked by reintroducing
  **NFKC** rather than by breaking the italic rule: the claim it makes is that the fold did not
  reopen that hole, so NFKC itself is the defect that has to make it red — `4f9292c`.

  The fresh-context review found two real defects in the first version, both recorded as decisions
  below: the unconditional `**` deletion merging `2**5` into `25`, and a flanking rule that was only
  half of CommonMark's, eating two globs separated by a comma. A self-review had found neither. The
  first version's own negative checks all passed, because a mutation suite only tests the cases the
  suite already thought of.

T2.7 — how much of the wobble is sampling. **A measurement ticket, and the measurement falsified its
  own premise before spending anything.** Eight runs of `score:file` on identical bytes had produced
  13.1–27.3 across two denominators, and the hypothesis was a loose sampling temperature. There is no
  temperature to loosen. Probed against the live API on `claude-sonnet-5`, this workspace's pinned
  scorer, with the workspace's own key: `temperature: 0` and `temperature: 0.2` both return **400** —
  "`temperature` is deprecated for this model" — as do `top_p: 0.1` and `top_k: 1`. Only
  `temperature: 1.0` is accepted, for backwards compatibility, and it is the default. Anthropic's
  reference says the same of everything released after Opus 4.6. **The seam sending no sampling
  parameter was already running at the only sampling setting the model has**, so "pin the
  temperature" was never an available move: pinning it to 1.0 is a no-op and pinning it to 0 would
  400 every scoring run in the product.

  What replaced sampling is `output_config.effort`, and `SCORER_EFFORT` in `router.ts` now pins it
  beside `initialScorerModel` — a constant rather than a column, because §5 names no per-workspace
  effort and AGENTS.md rules an unnamed abstraction speculation. It threads to
  `ResolvedRequest.effort`, is set only by `callPinned`, and is deliberately absent from `AiRequest`:
  the same structural guarantee the model pin has, that a caller cannot reach it. Anthropic takes it
  in the `output_config` that already carried the schema; OpenAI takes it as `reasoning.effort`,
  whose shape was read off the installed SDK's own `Shared.Reasoning` types and is **untested against
  a live API — this project has no OpenAI key.**

  **The pin sits at `high`, today's default, because the rungs above it cannot run.** Effort is
  charged against the same `max_tokens` as the answer, so `xhigh` and `max` both spend the scorer's
  whole 16,000-token ceiling thinking and return truncated JSON — `schema_invalid`, output exactly
  16,000, three attempts for three. **The blocker is the wall clock, not the adapter** — a correction
  to this entry's first draft, which claimed a streaming rewrite was needed. The SDK's "Streaming is
  required for operations that may take longer than 10 minutes" fires only when no explicit timeout
  is set; probed with one, non-streaming accepts 24,000 and 64,000 without complaint. Anthropic's
  docs put `xhigh` at 64,000 max_tokens, which by the SDK's own formula is a half-hour non-streaming
  call, and §5's meter re-scores on every edit. **Measuring a configuration the product could never
  ship tells us nothing**, which is what stopped arm B; the ticket's own three-corrections rule is
  what stopped it being attempted a fourth time. Pinning the current default still earns its line: it
  is what stops every score in the product moving on the day the provider moves its default.

  **Arm A — 11 runs, shipped configuration, `sample-juno-feature.md`, one pack version, one protocol
  version (`1.1.0+602d20db225ee669`), one model.** Reported by `pnpm score:spread`, which reads the
  stored runs rather than parsing stdout.

  | | |
  |---|---|
  | score | min **8.6**, max **27.3**, median 19.2 — **spread 18.7 points** |
  | denominator | 99 in 7 runs, 105 in 4 — `list-rendering-surface` held in **4 of 11** |
  | checks | 14 of 20 held one state; **6 moved** |

  The denominator is reported apart from the score on purpose: whether the model settles *which
  checks apply* is a different question from whether it settles *the verdicts*, and one spread number
  hides it. `prd-15` is the whole of the difference — it moved `fail 4 / not asked 7`, which is
  §4's condition oscillating, not a verdict changing.

  **The five checks whose verdicts moved are exactly the sufficiency checks**, which is the ticket's
  hypothesis confirmed and widened: it named `prd-12`, `prd-16` and `prd-19`, and the data adds
  `prd-14` and `prd-18`.

  | check | pt | states | what it asks |
  |---|---|---|---|
  | `prd-12` | 4 | fail 2 / pass 9 | side effects — other flows, systems, teams this touches |
  | `prd-14` | 8 | fail 10 / pass 1 | per story: what the user sees on failure (EARS) |
  | `prd-16` | 6 | pass 9 / fail 2 | permission-denied, offline, degraded behavior |
  | `prd-18` | 4 | pass 8 / fail 3 | data footprint declared, personal data flagged |
  | `prd-19` | 8 | pass 3 / fail 8 | misreading sweep: no sentence readable two ways |

  Every one asks whether what is present is *enough*. None of the fourteen stable checks does — with
  a caveat worth keeping, because it sharpens the rule: `prd-10` ("every story has testable GWT")
  and `prd-17` ("every user action has a named tracking event") are sufficiency questions too, and
  they were perfectly stable. **This document contains no stories and no events at all**, so they
  had nothing partial to weigh and answered a clean absence eleven times out of eleven. It is not
  the check's wording that makes a verdict unstable; it is whether the document hands it a partial
  case. That also bounds the finding: on a document with more in it, more checks would move.

  **What it cost, and what that changes.** 22 provider calls, **$1.60** total, at $0.067 and ~59s
  per successful run. Wall-clock, not money, is the binding constraint on a measurement of this
  shape — 12 runs is twelve minutes and eighty cents — which is worth knowing before the next
  measurement ticket asks for three runs on grounds of expense.

  Three things this measurement cannot see: it is one artifact, one model, one provider, one pack;
  arm B never ran, so **no claim is made here about whether effort moves the spread**; and the
  OpenAI half of the pin is unexercised.

  **Arm B was cancelled on the research, not on the budget.** Two findings settled it before money
  was spent. `xhigh` needs 64,000 max_tokens per Anthropic's own guidance — a half-hour
  non-streaming call for a meter that re-scores on edit, so it is a configuration this product
  cannot ship and measuring it would describe a lever nobody can pull. And the hypothesis it was
  going to test has already been tested: **Haldar and Hockenmaier (2025) find chain-of-thought does
  not significantly improve self-consistency in LLM judges.** More thinking was the wrong lever.

  **The recommendation is T2.8 — self-consistency, and the numbers say what it will and will not
  buy.** N samples per scoring run, majority per check *and* per condition, aggregation in code
  (§12's code node law: a majority is arithmetic, not judgment), all N quotes on a failing check
  kept and each verified by the fabrication guard, and one `scoring_run` row with N samples beneath
  it so §5's cache key is unchanged — the run is still one artifact version × pack × pack version ×
  protocol version, and the samples are what it is made of rather than a second row to reconcile.
  Precedent: majority-vote aggregation (arXiv 2510.27106) and atomic decomposition of judgments
  (arXiv 2603.00077).

  **N = 5, and the defence comes from arm A's own per-check rates rather than a rule of thumb.**
  Taking each moving check's observed majority share as its rate, and asking how often two
  *aggregated* runs disagree on that check:

  | check | majority share | N=1 | N=3 | **N=5** | N=9 |
  |---|---|---|---|---|---|
  | `prd-14` | 10/11 | .165 | .045 | **.013** | .001 |
  | `prd-12`, `prd-16` | 9/11 | .298 | .159 | **.086** | .026 |
  | `prd-18`, `prd-19` | 8/11 | .397 | .298 | **.225** | .128 |
  | `prd-15`'s condition | 7/11 | .463 | .420 | **.382** | .315 |

  N=5 is where the cost curve and the benefit curve cross: it removes most of the disagreement on
  the checks that were nearly stable already, and 5× cost is $0.34 and — **run in parallel** — the
  latency of the slowest of five calls rather than five times one, so ~60–105s against arm A's
  ~59s. N=9 buys another few points for 9× and its own rate-limit problem.

  **What N=5 does not buy, and this is the part to read before funding it.** Simulating the whole
  score from those same rates — the simulation reproduces arm A's observed 8.6–27.3 at N=1, which
  is what makes it trustworthy — majority voting moves the 95% score interval like this:

  | N | 95% of runs land in | width |
  |---|---|---|
  | 1 | 8.6 – 27.3 | 18.7 |
  | 3 | 11.1 – 27.3 | 16.2 |
  | **5** | **13.1 – 27.3** | **14.1** |
  | 9 | 15.2 – 27.3 | 12.1 |

  **Five samples cut the headline number's spread from 18.7 points to 14.1.** That is not §5's
  promise kept; it is a wobble made smaller. The reason is visible in the first table: the two
  checks nearest a coin flip carry 16 of the 99 points between them, and `prd-15`'s condition moves
  6 more, and majority voting converges slowly exactly where a judgment is genuinely balanced.
  **Sampling noise is real and is not the whole story** — which retires the ticket's original
  hypothesis in both directions, since neither a temperature nor more thinking was ever going to
  fix it.

  **Then probes, gated on the golden set.** Majority vote makes the number repeatable; probes make
  it right; and the second cannot be measured against a baseline that still moves 14 points. The
  order is T2.8, then the golden-set harness that can grade a change to the checks, then probes for
  the five sufficiency checks — `prd-12`, `prd-14`, `prd-16`, `prd-18`, `prd-19` — where the
  ambiguity actually lives.

T2.4 — the meter, and what it expands into: `/i/<key>` renders the artifact's latest run as §8's
  8h meter with its mono-readout percentage, opening into the canonical view of that run — every
  check in pack order, passes included, each failure carrying the quote T2.3 verified, and the
  checks §4 renormalized out shown as **not asked** with the condition that did not hold. The run's
  provenance sits under it in mono-readout, and freshness reads §5's clock: `--prime` dot normally,
  `--warning` plus "scored Nh ago — retrying" when §5's queue holds one, never a banner and never
  red. The gap list narrows to §13 — open Musts, and accepted or excluded gaps with the person who
  owns them.

  **The expansion is a native `<details>`, so the item page still has no client island.** The
  disclosure needs open/closed state and nothing else, and `<summary>` already has it — with §11's
  keyboard path and §6's focus ring included. A `"use client"` component would have put the first
  RSC boundary on this page for a triangle, and the dictionary these components are handed holds
  formatter functions, which is exactly what cannot cross one.

  **The read is the first in `src/db/queries/scoring.ts` to go through PostgREST as the signed-in
  human.** Everything else in that file writes over the direct connection, which bypasses RLS. A
  surface must not: `scoring_run_select` checks `app.can_see_product`, and a workspace-id filter
  alone would hand a member the scores of a product they cannot see.

  Verified against real data rather than the fixture. `pnpm score:smoke` reports **66 of 99** on
  soc-9 from the cache, and reading those same rows back through `composeRunView` produces all
  twenty checks in pack order, five unclear with the stored quotes, `prd-15` not asked and `prd-20`
  asked — both directions of §4 on one screen — and 3 of the 6 stored gap rows on the page.

  Three things found while building, all closed here:

  1. **`src/db/database.types.ts` was two migrations stale**, with no `scoring_run` or
     `scoring_check_result` at all, no `artifact.next_scoring_attempt_at`, and `gap_disposition`
     missing `closed`. Regenerating it surfaced a **live bug**: `writeRun` has written closed gaps
     since T2.3 and `getItemByKey` selects every disposition, so a closed gap fell through
     `GapList`'s ternary and rendered as **"Open"** — the page telling someone they owed work a run
     had already found done. soc-9 holds one (`prd-19`, closed when the protocol change made it
     pass), so this was on screen, not hypothetical. Closes open question 5: `item.key`,
     `product.key_prefix`, `ai_usage` and `workspace_ai_credential` all came back identical in shape
     to the hand-written versions. One value had drifted — `PostgrestVersion` was hand-typed `14.15`
     against the platform's `14.5`. Nothing read it.
  2. **The first `excludedChecks` test could not fail.** `prd-20` carries no `appliesWhen` of its
     own, so on the real pack "the layer's condition" and "the check's condition" are the same
     object, and a function reading the wrong one passed every assertion. That is the shape of
     T2.2's escalation bug — invisible while two values coincide — so the rule got a synthetic pack
     where the two differ. Negative-checked: defect reintroduced, named test observed failing,
     reverted.
  3. **§6's `prefers-reduced-motion` rule for the meter had never been reachable.** Every meter in
     the product rendered hollow, and a hollow meter has no fill element to animate. T2.4 is the
     first ticket that puts a width on one, so `.meter-fill` and the rule that switches its
     transition off arrived with it.

T2.5 — §5's third negotiation move, "we accept this risk", and the first human mutation of product
  data in the codebase: an open gap becomes a named person's accepted debt with a required reason,
  reversibly, and no score moves. `public.accept_gap` and `public.reopen_gap` are SECURITY INVOKER
  and called over `supabase.rpc()`, so PostgREST's one-transaction-per-request is what makes the gap
  UPDATE and the `activity` row §2 requires atomic, and `gap_update` and `activity_insert` decide
  what they may write. Declared outcomes return a status token; only genuine failures raise. A plain
  `<form action={settleGap}>` in a Server Component, so the item page still has no client island.
  Migration `0012` — `f8a4b73`.

  A fresh-context review found six, all real: a confirmation rendered inside the disclosure its own
  outcome closes, everything that speaks about an open Should having to follow it into the
  expansion, one outcome token serving two moves so the copy named the wrong one, two exits
  reporting into silence, three tests that could not fail, and three docstrings asserting the
  opposite of their files — `8163065`.

  The sixth finding was the §14 reading and cost migration `0013`: the appointment is asked before
  the role table, so a Developer who *is* the product's named Decider settles a Must. **That
  widening was itself sent back by its own cold read**, which found both defences comparing the new
  grant against a principal who was not the one being newly admitted. `gap_update` is a whole-row
  policy, so the disjunct had handed a Decider `tag`, `evidence`, `check_id`, `item_id`, `excluded`
  and another person's uuid in `resolved_by_user_id` along with the acceptance; `activity_insert`
  needed no widening at all and its own was worse. 0013 was unwound and reapplied rather than
  repaired on top of, so what ships is one correct migration: one disjunct on `gap_update` only,
  scoped by role and again by `app.gap_settle_shape`, a BEFORE UPDATE trigger holding the column
  half of §14's grant that RLS has nowhere to put — `a5174e9`. Open question 20 came back "§14's
  Viewer row beats the appointment", making that scope the law rather than a holding position, with
  the assignment-time refusal handed to Phase 6 — `98fa70e`.

T2.6 — **absorbed, no ticket of its own.** The applicability engine and conditional layers were
  built inside the three tickets that needed them rather than after: T2.3 decides applicability in
  the same pass that scores and renormalizes the denominator through T2.1's pure function
  (`conditions_met` on the run, `19a079f`); T2.4 renders the checks §4 renormalized out as **not
  asked** with the condition that did not hold, in pack order beside the verdicts (`2714aea`,
  `9e4371a`); and `0011` gives them a table, `scoring_check_not_asked`, so a run stores what it did
  not ask instead of the surface re-deriving it from whatever pack ships today (`1e375b7`). Nothing
  of 2.6's scope is outstanding — recorded here so nobody goes looking for it. **Phase 2 is
  complete.**

### T2.4's rulings

**Pack prose is not an i18n string.** A check's wording (`RubricCheck.prose`) and its applicability
condition (`ApplicabilityCondition.when`) are read by a person in the meter's expansion, which looks
like a breach of CLAUDE.md's "all user-facing strings go through `src/i18n/*`" and is not. **The
i18n rule governs strings the product says; pack prose is a string the rubric says, and it travels
with its version.** It is the standard itself — cited by every gap and every critic objection, shown
to the model in the same words the human reviewer reads (§4), and versioned like a document (§5). A
Turkish workspace sees a Turkish check by being shipped a **translated pack**, which §18 already
makes the law: "TR/NL are a translation build-step over finished packs, never parallel authoring."
Copying rubric text into `src/i18n` would create two sources for one sentence that disagree on the
first version bump — the pack scoring against one standard while the page displays another. Until
translated packs exist, a TR or NL workspace reads English check prose inside otherwise translated
chrome: **a known gap with an owner (§18's seed-content workstream), not an oversight.** The rule is
written into `src/packs/types.ts` so the next session does not "fix" it.

**A not-asked check must say why the condition did NOT hold.** `when` is written affirmatively — "The
feature renders a list, so it has empty and first-use states." — and a check is not asked precisely
because that is **false** of the artifact. Rendering the condition bare states the opposite of the
reason, and it reads perfectly while doing it, which is what makes it a test rather than a comment.
The negation lives in the i18n frame (`t.item.checkNotAskedReason`), never in the pack: one key so
TR/NL can order both clauses, and a second clause that says nothing about the first's grammar.

**§8's `--success`-at-100 branch stays unwritten, and the reason is not that nothing reaches 100.**
It is that a fixture proving the branch would assert a state the product cannot produce, and a test
over an unproducible state is how T2.2's escalation bug hid. The trigger is also undecided: §8's
"All Musts passed / 100" names **two different conditions**, and a run can pass every Must and sit
at 94 on Shoulds. Rendering that as a triumphant 94 and rendering it as a plain 100 are both
defensible; picking by accident is not. Whoever writes the branch resolves which one fires it and
ships it with an artifact that actually reaches the state. The note in `variants.ts` says so.

### T2.5 — "we accept this risk"

§5's third negotiation move, and the **first mutation of product data in the codebase**. An open
gap becomes a named person's accepted debt with a required reason, reversibly. No score moves: §5
says accept never closes the gap, and nothing here touches the three tables the meter reads.

**The atomicity mechanism, which is the precedent for every human move after this one.** The move is
two statements — the gap UPDATE and the `activity` row §2 requires — and they commit together or
not at all. PostgREST cannot transact two requests, so this is **one `SECURITY INVOKER` function per
move, called over `supabase.rpc()`** (`drizzle/0012_gap_accept.sql`). PostgREST wraps every request
including an RPC in one transaction, and SECURITY INVOKER runs the body as the caller, so
`gap_update` and `activity_insert` — both already present since 0004 and 0001 — decide what it may
write. **Nothing bypasses RLS and no policy was loosened.** The two in-repo alternatives were
rejected for reasons that do not carry over: `writeRun` uses the RLS-bypassing direct connection
because `scoring_run` has *no* INSERT policy at all, and `app.bootstrap_workspace` is DEFINER
because a user with no membership can satisfy no INSERT policy on `workspace`. Every caller here is
already a member. The functions live in `public` because PostgREST exposes only that; the usual
thin-wrapper split exists to hide a DEFINER body, and there is none to hide.

**Declared outcomes return a token; only genuine failures raise.** A RAISE rolls the transaction
back, which is right for a constraint violation and wrong for "someone accepted this while you were
typing" — a no-op we want to *report*. The tokens are a closed set in `src/lib/gap-move.ts`, keyed
into `t.item.gapMove`, so the compiler will name any one still missing a sentence when TR and NL
land. No string the database produced ever reaches a person.

**Write-time truth, both directions.** The accept re-asserts `disposition = 'open'` in its own
WHERE and the reopen re-asserts `'accepted'`; a row that moved is a reported no-op with no ledger
row. **The first draft had this untestable and the negative check caught it**: a pre-UPDATE
`IF v_state <> 'open'` branch answered from the snapshot and shadowed the guard, so deleting the
guard entirely left every test green. The classification SELECT now reads only the tag, the guard is
the only thing that decides, and a re-read after a zero-row write is what separates "someone beat
you to it" from "your role cannot settle gaps" — by observation rather than by restating
`gap_update`'s predicate somewhere it could drift.

**No client island.** The item page still has none. The form is a plain `<form action={settleGap}>`
in a Server Component and the outcome comes back in two search params rather than through
`useActionState`; §8's floating label is pure CSS (`:placeholder-shown`), so the field is assembled
from the same server-safe builders `Input.tsx` uses. Every path ends in `redirect()`, which is also
what dodges the memoization trap 0002 recorded — a read after a PostgREST write in one render pass
replays the pre-write response, and a redirect starts a new request.

**A search param is a claim about a finished request; the row is the truth now.** A shared or
bookmarked link carries `?move=accepted` indefinitely and a re-score can move the gap underneath it,
so each token renders only where the current state agrees — and "you accepted this" only to the
person whose name is on it. Same epistemics as `writeRun`'s "where nothing changes, no ledger row is
written".

**The move is rendered twice and written once.** `GapMoves` is used by the gap card and by the
expansion's unclear check. Both are necessary: §13's narrowing (T2.4) keeps open Shoulds off the
card, so for `prd-5` and `prd-8` the expansion is the only route, while the card is where §13 puts
what an item owes. The `checkId → gap` map is passed **alongside** the `RunView`, never folded into
it — a run is immutable history and a disposition changes underneath it, so merging them would make
`composeRunView` a function of two clocks.

Verified on real data as the real account, not only against fixtures: signed in as
`alkininan@gmail.com`, accepted `prd-10` on soc-9 through PostgREST, saw the page render 67% and
"66 of 99 points" unchanged with the debt named and dimmed, got `not-open` on a second accept,
reopened it, got `not-accepted` on a second reopen, and found `gap.accepted` and `gap.reopened` in
the ledger as `human`/`user` with the reason on both. soc-9 is back as it was.

### T2.5's rulings

**AC2's premise was wrong, and §14 is what shipped.** The ticket gated a Must on the Owner "since
`product.decider` does not exist yet". It has existed since `0000_object_tree.sql:98`, is FK'd in
0001, is read into `ProductSummary`, and is populated on both seeded products. §14 names the Decider
as the one who "accepts flags" and the Owner as "Everything… Fallback Decider", so the gate is
**`caller is product.decider_user_id OR role = 'owner'`**, and a null decider makes the Owner half
the automatic fallback §14 describes. Read at write time inside the function, never handed in by the
page: the Decider can change between render and submit. `app.may_settle_must` is the predicate, and
a db test pins the whole §14 matrix including the row that matters most — a Product-role member who
*is* the named Decider settling a Must.

**"A Should, any member" is `owner|product`.** `gap_update` admits those two, which is also §14's
division: a Developer authors technical artifacts and a Viewer is read-only. A Developer or Viewer
gets `not-permitted` rather than `not-decider`, because telling them a Must is "the Decider's call"
would imply that being the Decider would help — the first draft did exactly that, and the role
matrix test is what surfaced it. **Superseded in part by the review below**: the reasoning holds for
someone the product does not name, and was wrong for someone it does. See drizzle/0013.

**Reopening is gated exactly as accepting is, and carries no reason.** §1 law 7 makes a debt
something a *named* person owns, so whoever could take it on can hand it back and nobody else can
quietly undo their name. `gap_resolution_shape`'s `open` arm forbids a note on an open row, so the
ledger is where "who reopened this, and when" lives.

**The accepted reason lives in the ledger as well as the column, and that is not redundancy.**
Reopening nulls `resolution_note`; without `metadata->>'reason'` on the `gap.accepted` row, undoing
an acceptance would erase from the system the only record of *why* the risk was accepted — §1 law 7
read backwards. `gap.reopened` carries `undid` for the same reason. The schema's own doctrine: the
gap holds the current answer, the ledger holds how it got there.

**`encType` is not the hazard it first looked like.** Next drops a urlencoded action POST and falls
through to a page render, which with JavaScript off is a silent no-op — but React's server renderer
picks `multipart/form-data` for an action form and overrides a disagreeing prop, warning about the
mismatch rather than shipping the wrong body. The negative check proved that: overriding `encType`
produced a hydration warning and a still-correct form. The real hazard is a hand-written
`<form method="post">` that bypasses the action, so the e2e submits the accept form **with
JavaScript disabled** and asserts it lands on `/sign-in` — proof the POST reached `settleGap`
rather than re-rendering the page. Replacing the form with a hand-written one turns that test red.

**The one Danger on this surface is the reason field's helper line.** §8 tones a helper line's error
`--danger` and §0 law 2 names validation errors as one of its three sanctioned uses. Nothing else —
not the chip, not the card, not either button: accepting is not destructive, reopening is not
either, and both have standing reversals.

### T2.5's fresh-context review — six findings, all fixed

A cold session read the diff against §5, §1 (laws 4, 6, 7), §14, §8 and §12. Every finding was
real. Five were in the surface; one was the §14 reading, and it is the one that cost a migration.

**1. The reversal's confirmation rendered into a collapsed disclosure.** `AcceptForm` put every
non-field message *inside* the `<details>` whose `open` the outcome itself decided — and a landed
move closes it. So "Reopened." was in the DOM, inside a closed element, reaching nobody, on the one
move §1 law 4 exists to make visible. **The rule now, stated in the component:** the disclosure
decides whether the *form* is open and never whether a sentence is readable; every message on this
surface is a sibling of it. Both branches carry a test, so neither can regress alone.

**2. Everything that speaks about an open Should had to follow it into the expansion.** §13 files
open Shoulds under the score, so `prd-8` has no card — but `gapOutcomeHref` emitted `#gap-<id>` for
an anchor only the card carried, and the message landed inside the readiness `<details>`, closed by
default. A failed accept on a Should therefore scrolled nowhere and said nothing, twice collapsed.
Now the check line carries the anchor for exactly the gaps with no card, and the panel opens itself
when the URL names one. **Exactly one element wears `gap-<id>`**, which is why `gapHasCard` is
exported from `GapList` and asked by all three surfaces rather than restated in each.

**3. One outcome token served two moves, so the copy named the wrong one.** Both functions answer
`not-decider`, and "Accepting a Must is the Decider's call" was said to someone who pressed
*reopen* — a move they did not make. The intent now travels in the URL beside the outcome, the two
are validated as a **pair**, and `t.item.gapMove` is keyed by move first over each move's own
outcome set. That second part matters: the compiler still lists every missing sentence, and refuses
to demand one for a pair the database cannot produce. A crafted `?intent=reopen&move=reason-required`
now renders nothing rather than borrowing the other move's words.

**And the §14 reading was wrong, which is drizzle/0013.** T2.5 asked the role gate first, so a
Developer who *was* the product's named Decider was told their role does not settle gaps. §14 names
a person, not a role — "each product names a **Decider** who approves spec patches, accepts flags" —
and the Owner is the fallback for a Decider's *absence*, not an override of a present one. An
explicit per-product assignment must not be shadowed by the general table. The ordering argument
T2.5 made is still right for the case it covered and is kept.

**This is the one place the fix widened a boundary, and its own cold read sent it back.** The
paragraph that stood here defended the first draft of 0013 and was wrong twice, in the same way both
times: each defence compared the new grant against a principal who was not the one being newly
admitted. It is kept below, struck, because the shape of the mistake is the reusable part.

> ~~`app.is_product_decider` is added as one disjunct to each. Against `gap_update` it grants the
> gap-writing power a Product member already has, narrowed to one product, which is what §14 calls
> "accepts flags"; against `activity_insert` it is strictly narrower than the whole-workspace insert
> every Developer already had.~~

**Against `gap_update`**, "the power a Product member already has" was true about the scope and
silent about the power. RLS has no column list: a policy that says "may write this row" says "may
write `tag`", so the draft let a Decider flip a Must to a Should — retiring a handover-blocking gap
with no acceptance, no name and no ledger row — and rewrite `evidence`, `check_id`, `item_id`, set
`excluded`, and stamp somebody else's uuid into `resolved_by_user_id`. §14 gives a Decider three
approvals and none of those is one. **Against `activity_insert`**, "strictly narrower than every
Developer's" is true of a Developer-Decider and false of a Viewer-Decider, who had no insert right at
all — and that policy has no `can_see_product` gate, 0003 dropped `activity_actor_fk`, and
`action`/`subject_table`/`subject_id` are free text, so the draft let a Viewer append rows naming
another human, about a product they cannot see, to the append-only ledger §15 calls load-bearing.

**What ships instead.** One disjunct, on `gap_update` only, scoped twice: to `= 'developer'` (it
shipped deferring the Viewer to open question 20, which has since been answered "the Viewer row
wins", so the scope is the law and the Developer-Decider is the only case), and to the settle
transition itself by `app.gap_settle_shape`, a BEFORE UPDATE trigger — the only place in Postgres
that can compare OLD to NEW, which is where the column half of §14's grant has to live. It grants
nothing, runs after the policy has already admitted the row, and skips callers with no `auth.uid()`
so `writeRun`'s `gap.closed` and `gap.restated` are untouched. **`activity_insert` is not touched at
all**: once the appointment is scoped to roles §14 already lets write, 0001's `'developer'` arm has
covered the only live case since T0.4, so there is nothing left for a disjunct to grant and the
functions need no SECURITY DEFINER half. `can_see_product` still gates `gap_update` outside the
disjunction, so the appointment is not a way around per-product visibility.

Five negative checks, each observed red: the draft's `gap_update` disjunct restored, the draft's
`activity_insert` disjunct restored, the trigger dropped, and the trigger's `tag` invariant and its
`resolved_by_user_id = auth.uid()` and `resolved_at = now()` conjuncts each removed in turn. A db
test also pins that the policy half is load-bearing: with the functions reordered and `gap_update`
restored to 0004's text, the Developer-Decider gets `not-permitted` from the re-read.

**0013 was unwound and reapplied rather than amended in place**, as 0012 was: the dev database is the
only one, the draft was applied only there and only in this commit, so `gap_update`, `activity_insert`,
`may_settle_must` and both functions were restored from 0001/0004/0012 verbatim, `app.is_product_decider`
dropped, the `__drizzle_migrations` row deleted, and `db:migrate` run again. What ships is one correct
migration and no repair on top of a wrong one. (drizzle-kit decides what to apply by the journal's
`when` against `created_at`, not by hash, which is also why correcting a comment in applied 0012 does
not re-run it.)

**4. Two exits reported into silence.** `not-found` names a gap the page does not hold, so no card
and no check line could ever render its sentence; a form missing its gap or intent redirected to
`?move=not-found` with no `gap` param, which the page parsed to `null` and rendered as nothing. §12
has copy for every outcome and none for a silent no-op. The page now speaks for an answer no gap can
claim — at the top, where a fragment-less redirect lands — and a submission carrying no readable
move reports as `unreadable` rather than borrowing one move's words for something that was neither.

**5. Three tests could not fail.** The worst was the one whose name claimed to cover finding 1:
"closes it on a move that landed" passed `outcome={null}`, which is no move at all, so the clause
that hid the message could be deleted and the test stayed green. Two danger assertions rendered with
no outcome, so no message and no field state existed to be painted wrong. All three now pass the
outcome that reaches the branch, and each was observed failing with its own defect restored — as was
every other changed test in this pass, the policy widening included.

**6. Three docstrings asserted the opposite of what their files did.** `page.tsx`, `GapList` and
`CheckList` still said "read-only" and "nothing here is a control" above files that render §5's
third move. T2.5 restated the *tests* below them and left the prose. Corrected, and each now says
which move it carries and which are still Phase 3.

**Minor, also fixed:** `gapId` was the one form value interpolated into a URL without a shape check —
`URLSearchParams` encodes the query but not the fragment. It is now checked against the uuid the
database issues, exactly as the item key is checked before becoming a path segment.

### T2.4's fresh-context review — six findings, all fixed

A cold session read the diff against §1 laws 3/6/7, §5, §13 and design §8/§10/§12. Six real defects,
fixed in `0011`'s commit. Every changed test was negative-checked: defect restored, that test
observed failing, reverted.

1. **The meter's not-asked lines were recomputed from today's pack** —
   `excludedChecks(getPack(...), run.conditionsMet)` at render time. The lines that explain why the
   denominator is 99 were therefore derived from a rubric that can change after the run, so a pack
   edit would move a check in or out of the excluded set and the page would go on explaining a
   stored 99 with a set that no longer adds up to it — reading perfectly while doing it. It also
   read `tag` and `points` off the current pack for those lines, directly against the invariant the
   module's own header states, and a check the pack newly conditioned could render twice: once as a
   stored verdict, once as not-asked, on a duplicate React key.
   **Fixed with a table**, `scoring_check_not_asked` (drizzle/0011): the sibling of
   `scoring_check_result`, written in the same transaction, so between them a run holds one row per
   check the rubric contained and the expansion is readable off the run alone. §5 versions rubrics
   like documents and T2.3 already copied `tag` and `points` for this exact reason; this is that
   argument applied to the other half of the list. **A jsonb column on `scoring_run` was the cheaper
   option and was not taken:** it would store the two halves of one rendered list two different ways,
   and it cannot carry `points > 0` or the non-blank reason as constraints. The name avoids
   `excluded` on purpose — that is `gap_disposition`'s word for §5's first negotiation move, a
   person arguing a check away with their name on it, and this is the applicability engine answering
   in the pass that scores. **Nothing is backfilled**, so a run written before the table says so in
   one line rather than letting its list read as complete — a denominator with nothing under it is
   the number law 3 forbids — and soc-9 was re-scored so the seeded item shows the whole picture.
   Open question 19 carries both, and the line's deletion.
2. **A run whose pack no longer ships rendered as "connect AI to activate scoring"** — §10's no-key
   line, shown to someone who has a key and a stored run, hiding a number the run had already
   computed. §1 law 3 read backwards. `composeRunView` now takes `SkillPack | undefined` and renders
   the run with what survives: score, verdicts, not-asked lines, provenance, and check ids with no
   prose — the same floor `CheckLine.prose` already gave a single dropped check. The sort gained an
   id tie-break so the no-pack fallback is a **total** order; without it the rows nobody can rank
   kept the database's arbitrary order and one stored run could render two ways on two page loads.
3. **`{run.score}%` was built in JSX.** Not pack prose, so the T2.4 ruling does not cover it: it is
   copy that moves, and §12 renders numbers per locale — Turkish writes `%67`, sign first. Now
   `t.item.scorePercent`. The test drives the panel with a dictionary that puts the sign first,
   because no assertion over the English render can tell the two apart — both produce "67%", which
   is how the hard-coded version survived review once already.
4. **Three tests could not fail.** The container test counted occurrences of the word "Unclear",
   which says nothing about whether a pass is wearing a chip — it now reads the fill, the outline and
   the pill on each of the three state labels. The polarity test compared the render to
   `t.item.checkNotAskedReason(...)`, the very function that decides the polarity, so an affirmative
   reframe changed both sides at once — the expected sentence is now spelled out in the test, which
   is the cost of a copy rule being a rule. Both were confirmed blind: with the defects in place the
   old bodies stayed green. And a docstring claimed a closed `<details>` is reachable by a screen
   reader, which is false and was never asserted; deleted rather than tested.
5. **The `/dev/item` fixture staged two states `reconcileGaps` cannot produce** — an open Must on
   `prd-19`, which the same run passed (a pass closes an open gap), and a closed gap on `prd-10`,
   which the same run found unclear (a failure with nothing settled raises one). Three e2e tests
   rested on the pair, including the one proving the closed-gap filter. Swapped, which is also
   soc-9's real story: `prd-19` closed when the protocol change made it pass. `run-view.test.ts` now
   holds the fixture to the reconciler's table so it cannot drift back — the fixture is what the
   browser tests measure, and a fixture the product cannot reach measures the mock. Same objection
   that keeps §8's `--success`-at-100 branch unwritten.
6. **The disclosure had §6's focus ring and not its glow.** `:focus-visible` in `globals.css` gives
   every element the outline; §6 and §7 both pair the ring **with** `--prime-glow`, and §7 gives any
   interactive element press physics — both live on `.control`, which the hand-rolled
   `hover:bg-hover-overlay` did not bring. The summary now wears `control control-edge-none`, the
   pairing an interactive chip uses (§8 states the specular edge for Primary alone). The e2e tabs to
   it and measures outline and box-shadow, because `.focus()` does not make the claim
   `:focus-visible` is about.

Two nits with them: the hollow branch sat at a different inset from the summary, so the meter moved
8px between the scored and unscored states; and `item-fixture.ts` pointed at `/dev/primitives` for
the retry state, which has no meter on it.

### The golden set's first labeled sample

`scripts/seed-prd.ts` is a Feature PRD for a Sociera feature — Ghost mode, a per-venue
invisibility toggle — written to be scored rather than to be good. It is seeded by
`ensureScorableItem`, a top-up like the at-risk item's rather than a row in `ITEMS`: it arrived
after the first seeds ran, and `pnpm db:seed && pnpm score:smoke` would otherwise do nothing on
every environment that already exists. §12 builds the golden set "by
mutation … so expected verdicts are known by construction"; this is one artifact carrying several
planted defects at once. **The answer key lives here and not beside the document**, because the
document is what a model reads.

**The marking scheme.** Expected verdicts are known by construction, so a future run is graded
against this table rather than against an impression. Three parts, and a run has to get all three
right: the conditions, the verdicts, and the arithmetic they produce.

**Conditions** (§4, answered in the same pass that scores):

| Condition | Expected | Why, by construction |
|---|---|---|
| `list-rendering-surface` | **false** | The feature adds one control and one indicator. The document says so in Out of scope: "It renders no list of its own." |
| `network-dependent-surface` | **true** | Location permission and offline both have EARS lines. |
| `user-to-user-or-location` | **true** | Presence at a venue, visible to other members. |

So `prd-15` renormalizes **out** (−6) and the safety layer's `prd-20` renormalizes **in** (+5).
A denominator of **99** rather than 100 or 105 is one number proving both directions ran, and it
is the first thing to check when a run looks wrong.

**Verdicts.** Six planted failures, thirteen expected passes, one check not asked:

| Check | Pts | Expected | The defect, or why it passes |
|---|---|---|---|
| `prd-1` | 5 | pass | Problem is observed behaviour — 213 reversed check-ins, 41 support conversations — with no solution embedded. |
| `prd-2` | 3 | pass | "Opportunity: OPP-4, 'presence is all-or-nothing'." |
| `prd-3` | 4 | pass | "checked into two or more venues in the last 30 days and have at least one blocked contact" — a filter you could run. |
| `prd-4` | 2 | pass | Three typed signals, plus counter-evidence as a first-class slot. |
| `prd-5` | 3 | **fail** | **Planted:** three assumptions, and no statement of how we would notice any of them being wrong. |
| `prd-6` | 6 | pass | "We believe that … will reduce … measured by …", in the required form. |
| `prd-7` | 4 | pass | Baseline 3.4%, target 2.0%, eight weeks. |
| `prd-8` | 4 | **fail** | **Planted:** no kill or rollback line anywhere. An *absence* failure — there is nothing to quote, and a null quote is legal. |
| `prd-9` | 6 | pass | GM-1 … GM-5, stable ids on every story. |
| `prd-10` | 10 | **fail** | **Planted:** GM-4 is prose. The other four stories carry Given/When/Then. |
| `prd-11` | 5 | pass | Four explicit out-of-scope lines. |
| `prd-12` | 4 | pass | Four side effects, including the partner webhook and the digest. |
| `prd-13` | 4 | pass | iOS and Android, EN/TR at launch and NL later, and why web is unaffected. |
| `prd-14` | 8 | **fail** | **Planted:** GM-3 and GM-4 have no failure behaviour. GM-1, GM-2 and GM-5 do. |
| `prd-15` | 6 | **not asked** | By construction — no list surface. It leaves the denominator. |
| `prd-16` | 6 | pass | Permission denied, offline and degraded, all three in EARS. |
| `prd-17` | 8 | **fail** | **Planted:** `GhostOn` and `ghost_mode_toggled` disagree on convention, there is no off event, and the hypothesis metric is not computable from either. |
| `prd-18` | 4 | pass | One boolean and one venue id, both flagged personal, deleted with the check-in. |
| `prd-19` | 8 | **fail** | **Planted** — see the two sentences below. |
| `prd-20` | 5 | pass | Two named misuse routes with a protection for each. |

**Arithmetic:** 100 − 6 (`prd-15` out) + 5 (`prd-20` in) = **99 available**. The six failures cost
3 + 4 + 10 + 8 + 8 + 8 = **41**. Expected: **58 of 99, 58.6 / 100.**

**The two ambiguous sentences, verbatim.** `prd-19` is the check that asks for no sentence two
developers could read two ways, and this document contains two. The planted one, in GM-2:

> WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.

— "leaves" is a geofence exit, or a tap on check out, and the two build differently. The second,
in the Safety section, went in **unnoticed while writing**:

> that count is rounded to the nearest five whenever the difference would be inferable

— "inferable" names no threshold and no method. The first real run failed `prd-19` on the second
sentence, not the first. **A labeled sample is labeled against what the rubric should say, not
against what we meant to plant**, so both are part of the answer: a run that quotes either has
found the defect, and a run that quotes neither has missed it. The golden-set harness will need to
accept a set of acceptable citations per check rather than one.

**First real run, 2026-08-26, `feature-prd@1.0.0` on `claude-sonnet-5`:** 58 of 99, all three
conditions as expected, all six planted failures found, every quote verbatim, no false positives
among the thirteen passes. The full marking scheme was met.

**Second real run, `feature-prd@1.0.0` on `claude-sonnet-5`, protocol fingerprint
`1.1.0+602d20db`:** `prd-19` flipped from fail to pass when the "give both readings" sentence was
cut from `PROTOCOL`. Score moved **58/99 → 66/99**, exactly `prd-19`'s 8 points; nothing else
changed. The leak was carrying that check. **Open question:** is `prd-19`'s rubric prose too thin
to find a subtle ambiguity unaided, or is GM-2's planted sentence too quiet to be found? §5's
answer for a check that underperforms is **probes, not rewording** — the standard stays one line,
the probe library behind it carries the specific traps. Do not tune from one sample; the golden-set
harness decides.


## Decisions made during the build

_(when a ticket's report-back raises a question and you answer it, record the answer here.
If the answer is a rule that should hold everywhere, also add it to CLAUDE.md in the repo.)_

- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on deliberately.
- Font faces declared in `@theme static`, not `:root` — Tailwind tree-shakes unused theme vars,
  so `static` is load-bearing.
- `next/font/google` accepted as self-hosted per design spec v2.1 §3; DM Sans preloaded alongside
  Space Grotesk.
- Select and menu option rows: 36h wins over §8's pad 8/12; horizontal padding 12, vertical
  centred within the 36.
- Toasts run 5s by default, 8s when carrying an undo action. §8 is the default, §12 the undo case.
- `Esc` is last-opened-wins. The z-ladder governs painting only — a popover inside a modal takes
  the first Escape even though §4 ranks it lower.
- System status dot and the radio's inner dot are both 8px; floating panels stand off their
  trigger by 8px.
- Overlay padding (modal, sheet, toast) is 20; any gap the spec does not name falls on the
  8-grid.
- jsdom + @testing-library/{react,dom,user-event} added as devDependencies — the focus-trap and
  keyboard tests §11 requires cannot run without a DOM.
- Composite foreign keys on `(workspace_id, id)` — cross-tenant stitching is structurally
  impossible, not merely policed.
- Append-only is enforced three ways; the trigger is the only layer the service role cannot
  bypass, so it is the one that actually holds.
- `activity` is append-only too, not just `artifact_version`.
- The activity column is `trigger_source`, not `trigger`.
- `on delete restrict` on version → artifact, so v1 ships no delete UI.
- `membership_product` join table carries per-product visibility.
- Google and Apple are deferred as clean seams — email OTP is the only auth path that exists.
- The DB tests need `DATABASE_URL` and skip **loudly** without it: a green suite is not proof
  that the isolation boundary holds.
- `drizzle-kit push` is prohibited on this project — it cannot see the policies in
  `drizzle/0001_policies.sql` and plans to drop every one. Migrations only.
- Baseline only an environment whose schema was applied by hand. A fresh, empty project gets
  `pnpm db:migrate`; baselining it would mark the migrations done and skip them forever.
- `DATABASE_URL` must use the session pooler for the project's own region
  (`aws-0-<region>.pooler.supabase.com:5432`, username `postgres.<ref>`). The direct
  `db.<ref>.supabase.co` host publishes AAAA only, so it fails on any IPv4-only network — CI and
  Vercel included — even where a v6-routed dev machine happens to reach it.
- Next memoizes identical GET fetches for a whole render pass, and postgrest-js `.select()` is a
  GET with `signal: undefined`, which is not the opt-out. **A read-after-write in one pass
  replays the pre-write response.** So a write must return the row it wrote — RPCs are POSTs and
  are never memoized. This cost a first-run crash that looked like stale JWT claims and was not:
  the read-back never reached PostgREST at all.
- `bootstrap_workspace` is idempotent and takes a per-user advisory lock. Idempotent because
  raising on a second call forces the caller into exactly the read-after-write it cannot do;
  locked because the membership lookup is then check-then-act under READ COMMITTED, and `/app`
  really does open several render passes at once. It still never mints a second workspace.
- Guard tests for this class assert **request counts, not returned values**. The value was correct
  throughout — only the traffic was wrong — so any mock that answers honestly hides the bug.
- An append-only table cannot carry `ON DELETE SET NULL`, because nulling is an UPDATE the trigger
  refuses — and `NO ACTION` / `RESTRICT` only trade that for a blocked parent delete. The ledger's
  actor columns therefore carry **no FK into `auth.users`**: the id is a recorded fact, so the user
  is deletable and the ledger is immutable. Mutable tables keep theirs. See `docs/schema.md` §1.
- **Where an append-only table does keep a parent reference, it is `RESTRICT`** — the only shape
  that fails legibly. `CASCADE` is refused by the trigger because a cascade is a DELETE; `SET NULL`
  is refused the same way, and on a composite key it also nulls `workspace_id`, which is `NOT NULL`.
  Both surface as an append-only error naming the *child*, from a delete aimed at a parent.
  `RESTRICT` names the constraint and the table actually holding the reference. Neither of
  `activity`'s two original FKs ever worked; `0004` corrects them.
- **`gap` is mutable and its lifecycle column is `disposition`.** §5's three negotiation moves are
  transitions on that row, so it cannot be append-only. `disposition` rather than `state` because
  the first-law test forbids `status`/`stage`/`state` anywhere in `public` and **that test stays
  broad and absolute** — a legitimate exception picks a different word rather than asking the guard
  to carve one out. A gap's lifecycle is *declared* by a human, which is the opposite of a derived
  stage, so the different word is also the more accurate one.
- **`decision` is append-only, with `supersedes_id`.** §8's packet is a frozen coordinate carrying
  the decision-log extract, §15 calls history load-bearing, and §8 wants "who agreed to ship
  without offline handling?" answerable forever. Correcting one is logging another that supersedes
  it — §11's revert-as-new-version. Without the self-reference, append-only plus supersede-not-edit
  is conventional rather than real.
- **Stage lives in TypeScript (`src/lib/stage.ts`), never SQL.** Phase 2 feeds it app-layer scores
  and it must be testable without a database — but the decisive reason is that a SQL derivation
  means a view column named `stage`, which the first-law test would catch. The test is telling you
  where derivation belongs. `information_schema` carries no forbidden column and no views at all.
- **`:focus-visible` is not the focus split.** Chromium matches it on a clicked text input,
  so gating the ring on it keeps the double stroke the split exists to remove. The modality
  is tracked on `<html>` instead (`src/lib/focus-modality.ts`), rendered server-side and set
  before first paint, and the ring is drawn behind it.
- Icons come from **Iconoir**, and `src/components/ui/icons.tsx` is the only module that
  imports `iconoir-react`. Call sites take named exports from it.
- A field carries **one text** — the floated label. Format-hint placeholders are refused by
  `Input` itself rather than trusted to call sites.
- **`Database` types are generated from the live schema via the Supabase MCP server**, not the CLI
  — `supabase gen types --db-url` needs a container runtime this machine does not have.
  **Regenerate after every migration**; the clients are parameterised with them, so drift and typos
  both surface as `pnpm typecheck` failures rather than runtime nulls.

- **Supabase answers a wrong OTP and an expired one with the same error** — `otp_expired`,
  message "Token has expired or is invalid": one reply covering both, so that verifying is not an
  oracle for which codes exist. Reading that code's *name* as a finding is how every mistyped
  digit was answered with the expiry line and sent someone to their inbox for a code already in
  it. There is no second code to map to, so the split is made against **our own send clock**
  (`hasCodeExpired`) — the one fact the refusal does not carry.
- **`otp_disabled` is an outage, not a bad code.** It is email OTP switched off for the project;
  telling someone to re-check their digits sends them round a loop that cannot close.
- **Fake only the timers the code under test reads.** `vi.useFakeTimers()` also fakes `setTimeout`
  and `requestAnimationFrame`, which userEvent and RTL's `waitFor` both wait on, so faking them
  hangs every interaction test with no useful error. `toFake: ["setInterval", "clearInterval",
  "Date"]` is what the cooldown reads and leaves the harness on real time.
- **An assertion that documents a discrepancy protects it.** `otp.test.ts` pinned "Token has
  expired or is invalid" → expired, and the layout e2e pinned the label sitting 1px off its
  value — both green, both describing a bug in a comment rather than forbidding it. Pin the rule
  (`toBe(valueFromEdge)`), not the pair of numbers that currently satisfy it.
- **Verify a fix by breaking it.** Every law added in v2.10–v2.12 was checked by reverting the
  implementation and confirming the new assertion — and only that assertion — went red. A CSS
  rule that matches nothing and a mapping that never fires both pass a green suite otherwise.
- **A test that asserts on the position of a row must order by something the database guarantees.**
  Inside one transaction `now()` is constant, so `occurred_at` ties and any assertion on "the last
  row" is a coin flip. Negative-checking proves a test *can* fail; it does not prove the test fails
  only when it should. This one passed on roughly two runs in three and closed T2.3 as green — the
  third distinct way a green suite has lied here, after tests that measured layout boxes instead of
  painted glyphs and a substring test that passed with the leak it named already in place. The
  discriminator is `writeRun`'s returned run id, matched against the `score.recorded` row's
  `subject_id`: the run is that row's subject, so the id is a column the server must honour rather
  than a metadata key. Writing the fix found the second half of the same defect — the first
  assertion in the test read `rows[0]`, which sorted to a `gap.*` row and passed because a gap row
  has no `clipped` key at all, so a null it was never testing satisfied it.

- **`/app` is workspace-wide; the product switcher filters it in place.** §13's buckets are a
  priority queue — "anything awaiting a human" — so a list that stopped at a product boundary would
  answer "what should I do next in Sociera" rather than "what should I do next", and a Must gap in
  the other product would stay invisible until someone went looking for it. The switcher narrows
  what is already there rather than navigating away, which is also why "all products" is a real
  default rather than an absence. `/p/<slug>` stays reserved for a product's own page.
- **An item's key comes from `product.key_prefix`, not from its slug.** `soc-12` is what people say
  out loud, so it has to survive a product being renamed — a slug does not. The separate column is
  also what makes keys unique per workspace safely: `sociera` and `social` both derive `soc`, and a
  derived prefix would make the second product's first item fail to insert, at runtime, with a
  constraint error. Prefixes are unique per workspace for the same reason.
- **Keys are assigned by the database and never by the client**, like `artifact_version.version_no`
  — `app.assign_item_key()` overwrites whatever an insert supplies, and the unique index is the
  backstop for the MAX+1 race. A client that can choose an identifier can collide with one.
- **Baselines are elapsed wall-clock, upper bound of the range** (product spec v1.2 §3). aenima
  observes when things happen and never how long anyone concentrated, so an effort baseline is
  unmeasurable by construction — nothing in the system could compare a value against it. A stage
  with no seeded cell has **no** baseline, and an item there is never at-risk on time: that is the
  honest answer to "is this taking too long" when nothing says how long it should take. Hour-scale
  cells are effort estimates, so Discover has no baseline for any type.
- **An input that cannot yet exist is typed `never`, never faked with a boolean.** `stage.ts` set
  this with `signedPacket` and `buckets.ts` follows it for §13's sign-offs, triage, walkthroughs and
  score regression. A `boolean` would say "observable, currently false", which is a different claim
  and a false one — and it invites a caller to pass `false` as though that were an answer about a
  ceremony that cannot happen. `never` makes the branch unreachable to the compiler while leaving
  the rule visible in the file, so switching one on is a type change rather than a rule someone has
  to remember to come back and write.

- **Every zod schema sent to a provider uses `.nullable()`, never `.optional()`.** OpenAI's strict
  structured-output mode requires `additionalProperties: false` **and every property listed in
  `required`** — an optional field is rejected by the API, not by us, and not until a real call is
  made. So absent is spelled `null`. This lands before the first schema that needed it: T2.3's
  `CheckResult` union is the first, and discovering the rule there would have meant rewriting a
  schema rather than writing it correctly. `src/lib/ai/call.test.ts` asserts that
  `z.toJSONSchema()` still produces the strict shape, since that is a zod behaviour we depend on
  and do not control.
- **The scorer's pin is enforced by a missing parameter, not by a rule.** §5 says the scoring model
  is "pinned per workspace and never juggled for cost", so `runScorer` takes no tier, reads its
  model from `workspace_ai_credential.scorer_model`, and does not call the escalating code path at
  all. There is no function anywhere that accepts a pinned model plus a fallback. A comment saying
  "do not route this for cost" would be a rule someone could follow wrongly; an argument that does
  not exist cannot be passed. **The other direction is closed the same way**: `AiRequest.purpose` is
  `Exclude<Purpose, ScorerPurpose>`, so a tier-routed entry point has no scoring purpose to carry,
  just as `runScorer` has no tier to route down. It was the whole `Purpose` union until the review
  — wide enough to run a scoring call on Haiku through `runRoutine` and meter it as a scoring run.
- **The AI key lives in Supabase Vault, and the public row holds a pointer.** `authenticated` and
  `anon` hold no privilege on the `vault` schema — that is Supabase's own grant, not ours — so a
  signed-in member cannot read a key through PostgREST even if every policy we wrote were wrong.
  Owner-only RLS is the second wall and a column-level grant hiding `vault_secret_id` is the third.
  The alternative considered was app-level AES-GCM with a master key in the Vercel env, which would
  additionally survive a database dump; it was not chosen because `SUPABASE_SERVICE_ROLE_KEY` and
  `DATABASE_URL` already live in that same env, so the separation is thin, and it would cost us key
  management, rotation and a crypto path we own.
- **A secret bound as a query parameter needs its error scrubbed, always.** `postgres@3` hangs
  `query`, `parameters` and `args` off every rejected query's error, so `err.parameters[0]` is the
  plaintext key. They are non-enumerable while `debug` is off — invisible to `console.error` and to
  `JSON.stringify`, which is exactly why this reads as safe — but an error reporter that walks
  `Object.getOwnPropertyNames` captures non-enumerable own properties and ships them off the box.
  "Not usually printed" is a weaker promise than "never logged". The two vault statements that bind
  the key run inside a wrapper that rethrows the message alone, with the key replaced in it in case
  a driver ever interpolates one.
- **Spend is arithmetic over stored token counts, never a stored number.** Each `ai_usage` row keeps
  the four token counts the provider reported plus the id of the rate card in force. §12's own code
  node law puts the multiplication in code, and the card id is what keeps history stable: **a price
  change means a new card id, never an edit to an existing one**, so re-pricing tomorrow cannot
  rewrite what last month cost.
- **Haiku 4.5 will not cache a prompt below 4,096 tokens, and we accept that rather than route
  around it.** The minimum is per model — Opus 5 is 512, Sonnet 5 is 1,024, Haiku 4.5 is 4,096 —
  and a prompt below it is processed **without caching and without an error**, which is exactly how
  a cache-hit rate of zero on the routine tier looks like a bug. It is not one. Caching is an
  optimization and no correctness depends on it; moving routine work to a larger model to earn a
  cache hit would pay more to save less. The rubric prefix will grow — the `feature-prd` pack is
  already 19 checks of prose — so this may resolve itself.
  https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **The AI layer holds one direct Postgres connection for the process, not one per call.**
  `src/db/client.ts` used to say the direct connection was "not for the request path", and T2.2
  made that untrue: reading a key out of `vault.decrypted_secrets` and writing `ai_usage` are both
  things no signed-in role is permitted to do, so neither can go through PostgREST. Opening a
  client per call meant **two TLS handshakes against the pooler per model call, plus two
  teardowns**, none of which anyone is waiting on the database for. `sharedDbClient()` keeps
  `max: 1` — so concurrent callers queue exactly as before and the only change is that the
  connection survives — with an `idle_timeout` so an idle instance releases its pooler slot.
  Raising the pool is the next lever if metering ever becomes the wait, and it is deliberately not
  being guessed at now. Scripts must call `closeSharedDbClient()`, because a connection that
  outlives a request also outlives a script's work and keeps Node's event loop alive.
- **A provider outage is not this layer's problem to solve, only to name.** §5 has a failed run
  queue silently while "the timestamp does the honest work", so `AiFailure` carries `retryable` and
  stops there. **The queue's shape is a `next_attempt_at` on the scoring-run row T2.3 owns** — the
  run is simply not written, and the item keeps showing "scored 6 h ago". **The scheduler belongs
  with §5's other re-scoring machinery** — the webhook, the debounce and the nightly sweep — which
  is **Phase 4**. Building one here would have meant a cron with nothing to run.
- **A preview must render on the same side of the RSC boundary as the surface it previews.** A
  client-rooted preview cannot catch a Server→Client serialization error, because inside it there is
  no boundary to cross. That is how the i18n dictionary's formatter functions reached production:
  `/dev/primitives` carries `"use client"`, so `ItemRow → ItemRowMenu` was client-to-client there and
  server-to-client on `/app`, and only the second one throws. Every gate passed —
  unit tests render client components directly, the browser tests drove the client-rooted preview,
  and `/app` is behind auth. **`/dev/list` exists for exactly this**: the same fixture rendered from
  a Server Component, `force-dynamic` so its rendering mode matches `/app`'s too. Note that
  `next build` is no help here — a non-serializable prop throws at render, and a dynamic route is
  never prerendered.
- **Client components read their own copy; they are never handed the dictionary.** `getDictionary()`
  returns formatter functions, and a function cannot cross the boundary. Anything needing
  interpolation crosses as an already-formatted string.
- **`/dev` is gated on the build mode, and `e2e/production.spec.ts` is what proves the gate is
  wired.** It runs against a real `next build` on its own port, because the gate is inert under
  `next dev` — every other browser test depends on it being inert. A unit test covers `devOnly()`
  in isolation; only an HTTP status from the build that would ship covers the segment being
  attached to it.

- **A scoring run is stored as two append-only tables, and the score is not a column.**
  `scoring_run` keeps `earned` and `denominator`; the score is `earned / denominator × 100`, which
  is arithmetic over two stored facts and belongs in code by §12's own law. **`percentageOf` in
  `src/packs/scoring.ts` is the only division in the product** — a fresh run divides what it just
  computed and a cached one divides what it recorded, and two implementations of one formula is two
  things that can disagree, which is the reason the score is not a column in the first place. It is the same refusal
  `ai_usage` makes about money, for a related reason: a stored quotient is a second copy of a
  derived fact, and two copies can disagree. §5's "stamps … the denominator that produced it" is
  satisfied by storing the denominator.
- **§5's cache is a unique index, not a lookup someone remembers to do.**
  `(workspace_id, artifact_version_id, pack_id, pack_version, protocol_version)`. An artifact version is immutable,
  so one version scored against one rubric version can only ever have produced one run — and the
  database says so rather than the code path. **Provider and model are stamped but deliberately
  not in the key**: §5 makes a model or rubric change trigger a *deliberate* re-baseline pass, and
  a key that included the model would silently re-score a whole workspace the day a pin moved.
  "Only checks whose artifact changed re-run" resolves at the artifact: a run scores one artifact
  against one pack, so a new PRD version does not re-score the design package. Below the artifact
  there is nothing finer to diff — §11's per-block hashes exist as a column, but blocks are not
  modelled.
- **`closed` is the fourth gap disposition, and the only one a machine may write.** §5 move 2 ends
  "Pass → closed with the evidence linked" and the enum had nowhere to put it. `accepted` and
  `excluded` stay human declarations carrying a name; `closed` claims nothing about the debt, it
  says reality moved. A closed row therefore carries a time and no name, and *why* it closed is a
  ledger fact — `gap.closed` with `reason: passed` or `no longer applicable`. **A check that
  stopped applying closes its gap too**, because leaving it open would have §13 calling an item
  "Your move" over a Must outside its own denominator. What §5's first negotiation move routes
  through a human is an *argument* that a check does not apply; this is §4's engine answering in
  the pass that scores.
- **Extending an enum and using the new value cannot happen in one migration here.** Postgres
  forbids using a value added by `ALTER TYPE … ADD VALUE` in the transaction that added it, and
  `drizzle-kit migrate` runs **every pending migration inside one transaction**
  (`drizzle-orm/pg-core/dialect.cjs` — `session.transaction(...)` wraps the whole loop). So
  `ADD VALUE 'closed'` plus a CHECK naming `'closed'` works on a database where the migration
  lands alone and fails on any fresh one — CI, and a new environment. `0008` creates a new type and
  swaps the column instead. Its partial index has to be dropped and recreated around the swap:
  `gap_open_idx` stores `disposition = 'open'` with the literal already bound to the old type.
- **A CHECK constraint rejects a row only when its expression is FALSE.** NULL passes. So
  `length(btrim(note)) > 0` forbids an empty note and *not* a null one, and both
  `scoring_check_result_evidence_shape` and the inherited `gap_resolution_shape` accepted exactly
  the row they were written to forbid — a failure with no reading, and a named debt with no reason.
  Every arm now says `is not null` before it says `length(...) > 0`. Found by a test asserting the
  first constraint rejects a null note and watching the insert succeed; 0004 wrote the second one
  in 2026 and nobody noticed for five tickets.
- **The scoring protocol is the run's; the rubric's prose is the pack's.** `src/lib/scoring/prompt.ts`
  holds how to answer — binary verdicts, verbatim quotes, conditions asked apart from checks — and
  contains no rubric content; `renderPack` renders the pack and nothing else. `assembleContext` is
  asserted to be exactly `PROTOCOL + renderPack(pack)`. A protocol copied into each pack would let
  two packs disagree about what "pass" means, which is worse than the coupling it avoids. The split
  is also §12's cache split: the context is stable per pack version, the artifact is what changes.
- **A test whose name promises what it cannot deliver is worse than no test.** Beside that equality
  sat a substring sweep asserting no check's `prose` appeared inside `PROTOCOL`, named "carries no
  rubric prose in the protocol half" — and it shipped green while the protocol carried `prd-19`'s
  standard in different words. The weakness was known and written down as a limit when it shipped;
  writing it down is not the same as it being harmless, because the *name* is what a reviewer reads
  and the name claimed a guarantee. A test that catches a copy-paste should be called that, or it
  should be replaced by one that holds. This one was replaced: `PROTOCOL_VERSION` pins a digest, so
  any edit to what the scorer reads turns the suite red and has to be acknowledged in the diff. The
  judgement about what a sentence is *about* stays a human's; what the test guarantees is that a
  human is asked.
- **Everything that reaches the model is versioned, and the version is computed rather than typed.**
  Migration 0010 put the protocol in §5's cache key and stopped one layer short: `PROTOCOL` was
  versioned, `renderCheck`, `renderPack` and `renderArtifact` were not, though the model reads their
  output just as directly — editing `renderCheck` to stop printing a check's points would change
  every verdict in the product and hit the cache on all of them. `PROTOCOL_VERSION` is now
  `` `${PROTOCOL_RELEASE}+${digest}` ``: a semver a human reads, and sha-256 over a rendered
  fixture pack plus `renderArtifact`'s output, truncated to 16 hex characters. The fixture is
  synthetic on purpose — a real pack would fold rubric content into the number describing the layer
  *above* the rubric, and a pack edit would then move both stamps. Discipline you can forget;
  a digest moves whether anyone remembered or not.
- **A quote is verified against the artifact before the run is written, and a fabricated one fails
  the whole run.** §1 law 3 is evidence or nothing, and an invented quote is the one failure that
  looks exactly like a real finding on the surface. Whitespace and typography are normalized —
  a model rarely echoes the source's line width, and curly quotes survive a round trip
  inconsistently — and **nothing else**: case is kept, because "MUST NOT" and "must not" are
  different claims in a specification, and every word still has to match. A **null** quote is legal
  and different from a missing one: some checks fail because something is absent, and there is
  nothing to point at when the out-of-scope list does not exist.
- **NFC, never NFKC.** The two differ by one letter and by what they *do*. Canonical normalization
  composes accents — `e` + U+0301 and a precomposed `é` are the same letter, and which one arrives
  depends on the keyboard that typed the artifact. *Compatibility* normalization rewrites characters
  into other characters: under NFKC `10⁵` becomes `105`, `m²` becomes `m2`, `½` becomes `1⁄2`, `№`
  becomes `No`, `Ⅳ` becomes `IV`. Reaching for the more thorough-sounding one put a paraphrase
  detector one keystroke away from certifying `105` as a verbatim quote of `10⁵`. The five pairs are
  pinned as tests, so the docstring's promise — "whitespace and typography, and nothing else" — is
  an assertion rather than an intention.
- **Emphasis markers are syntax, and go the way whitespace goes — which is not the way NFKC went.**
  The artifacts are markdown and `renderArtifact` hands the model the source, so a model shown
  `**on the server only**` quotes back `on the server only` and the guard rejected the run. The rule
  that produced was arbitrary from a reader's side: a quote wholly inside or wholly outside an
  emphasis span verified, one that *spanned* one did not — so the guard preferentially rejected the
  longer, more contextual quotes, the better ones, on any document where people bold the
  load-bearing phrase. **The category is the licence.** NFKC changed what a sentence *said*, `10⁵`
  to `105`; removing a bold marker changes only how it was *typeset*, and every word, digit and case
  distinction survives it. That is the test a future fold has to pass, and a fold that drops content
  — a link's URL, an identifier's underscores — fails it exactly the way NFKC did.
- **A marker is only typesetting when it is really a delimiter.** The first version of the fold
  deleted `**` and `` ` `` unconditionally, on the measurement that neither is ever content in this
  corpus. A fresh-context review broke it in one line: `2**5` normalized to `25`, because an unpaired
  `**` is literal text in markdown and deleting it merged two digits — so the guard would certify
  `25` as a verbatim quote of `2**5`. **That is `10⁵` → `105` arriving through a different
  keystroke**, in the fold written to be the safe kind. The same review found the flanking rule was
  only half of CommonMark's: two globs separated by a comma rather than a space pair through it, so
  ``​`src/db/queries/*`, `src/db/schema/*`​`` folded to `src/db/queries/, src/db/schema/` — a false
  accept for a quote that dropped both globs, and a false *reject* for a quote of either. Both are
  fixed by pairing rather than deleting, and by protecting inline code: markdown does not read
  emphasis inside a code span, and this corpus keeps its asterisks there. **The lesson is the one
  the corpus measurement cannot give you** — a count tells you what a document contains, not what an
  operation does to a document it has not seen, and `score:file` scores arbitrary documents by
  design.
- **A measurement of the corpus tells you what the documents that exist contain, never what the next
  one will.** The unconditional deletion above was justified by a count, and every fact in the count
  was true: no `2 ** 3`, no doublestar glob, no bare backtick, in any of the six artifacts that
  exist. The fold was wrong anyway. **"No `2**3` in any artifact" is a fact about five files; it is
  not a property of markdown**, and a guard runs against the document nobody has written yet —
  `score:file` takes an arbitrary path by design, and a PRD is exactly the kind of document that
  says `2**5` once. So a corpus count is the right way to choose *scope*, which constructs are worth
  handling at all, and it is why no link fold shipped; it is the wrong way to establish *safety*.
  Safety comes from the shape of the operation instead, which is why the shipped fold holds where
  the counted one did not: every rule is a pairing rule with flanked edges, so it removes a marker
  only where a marker really is a delimiter, on text it has never seen. **Where a rule's correctness
  rests on a measurement, write down what the measurement cannot see.**
- **The fold's scope came from measuring the corpus, not from the markdown spec.** Counted across the
  two sample documents, the seed PRD and the three specs — everything the guard can be pointed at —
  they contain 1207 bold markers, 612 inline-code spans and 83 lone-asterisk pairs; the shipped fold
  matches 592 bold pairs and 38 italic pairs, and the rest — 23 unpaired markers and 45 asterisk
  pairs that are content — are what the pairing, flanking and code-span rules decline. What they contain
  none of is links (**0** — the ticket asserted otherwise and the measurement disagreed), images,
  reference links, autolinks, underscore emphasis, strikethrough, escapes, and fenced code blocks in
  anything that gets scored. So: inline code is unwrapped and its contents protected from the
  emphasis rules; `**bold**` folds as a matched pair with non-space inner edges within a paragraph;
  `*italic*` the same, within a line. The non-space inner edge is the half of CommonMark's
  left/right-flanking rule a lone content asterisk fails — it is not the whole of that rule, and what
  carries the rest is protecting code spans. A general markdown parser is still a bigger dependency
  than the problem. Anyone widening this brings a count, not a format reference.
- **A pinned effort changes verdicts and leaves §5's cache key untouched — the same hole 0010
  closed for the renderers.** `PROTOCOL_VERSION` is a digest over `PROTOCOL` plus the three
  renderers, all of `prompt.ts`. `SCORER_EFFORT` is not in it and cannot be: it is a request
  parameter, not assembled context. But it moves the number exactly as a renderer edit does, so **a
  run stored before the pin and a run stored after it are not comparable, and nothing marks them
  apart** — the same artifact version, pack, pack version and protocol version, so §5's cache will
  serve one to the other. That is the defect migration 0010 was written to close one layer up, in a
  new layer: 0010 caught that "everything that reaches the model is versioned" had stopped at
  `PROTOCOL` and missed `renderCheck`, `renderPack` and `renderArtifact`; this catches that it also
  misses everything that *shapes how* the model answers rather than what it reads. Whoever writes
  the fix should find both entries together, and should decide whether the stamp covers the request
  parameters or whether the cache key grows a second component. **Reported, not fixed** — T2.7 was a
  measurement ticket, and moving the stamp would have invalidated the measurement it was taking.
- **An over-long answer is compliance, not corruption.** `gap.evidence` caps at 2000 characters and
  `scoring_check_result.quote` at 2000; nothing bounded a note or a quote before they got there, so
  a model that answered at length aborted the write transaction on a CHECK — throwing away nineteen
  other verdicts, and a provider call already billed, over the shape of one sentence. The parts are
  clipped at read time to what the columns hold, the elision is marked where a reader sees it, and
  the check ids go in the ledger so a shortened reading is a recorded fact. **The guard still runs on
  the quote the model actually sent**, before any clipping: verifying a clipped quote would verify a
  prefix, and a prefix of an invented sentence is still invented.
- **Every failure a caller has already paid for gets a shape it can read.** `writeRun` is wrapped, so
  a constraint violation or a dropped connection returns `reason: "write"` rather than throwing past
  all four of `ScoreResult`'s cases — the transaction still rolled back, so §5's "a failed run writes
  nothing" is untouched; this is only about how the caller hears it. No retry is queued, for the same
  reason an off-schema answer queues none: the same verdicts written the same way fail the same way,
  and §5's queue is for outages, not for bugs.
- **Two provider limits shape the answer schema, and both were found by a real call.** The schema
  that states the law best is an object keyed by check id — one required property per check, so a
  skipped check is unrepresentable under OpenAI's strict mode. Anthropic refuses it twice: *"too
  many parameters with union types … limit: 16"* (a nullable field is a union, and three per check
  across twenty checks is sixty), and then *"the compiled grammar is too large"* (twenty checks ×
  four properties is eighty properties for constrained decoding to compile). So **absent is spelled
  `""` on the wire**, and **results are an array**. The completeness law moved out of the schema
  and into `readAnswer`, which refuses a run whose results miss any applicable check — the rule is
  unchanged and the wall is one layer further in. `minItems` would buy half of it back and is not
  available: strict mode rejects a schema carrying keywords it does not support. The conditions
  half stays a keyed object, where three properties cost nothing and the guarantee still holds.
- **`max_tokens` is a budget for the model's reasoning, not just its answer.** Claude Sonnet 5
  returns a `thinking` block by default; the seam drops it — a verdict is the answer and the
  reasoning is not evidence — but the provider counts those tokens against the same ceiling. The
  first real run spent ~4,100 tokens thinking and ~800 answering, and cut off mid-quote at a 4,900
  ceiling sized to the JSON. **Truncated JSON reads as a flaky provider rather than as a ceiling**,
  which is the expensive way to learn this. `maxTokensFor` is now 2,000 + 700 per check. A ceiling
  is not a cost — nothing is billed for headroom — so the only thing a generous number buys is that
  a long answer finishes.
- **A failed run writes nothing, and only a retryable failure leaves a mark.**
  `artifact.next_scoring_attempt_at` is that mark, on the artifact because a failed run has no row
  to hang it off — which corrects what T2.2 recorded here. A non-retryable failure sets nothing at
  all: §5 queues *outages*, and a pinned model that answered off-schema is a quality signal §15
  already reads out of the `ai_usage` row the seam wrote. Retrying that on the same pinned model is
  the cost-driven retry §5 forbids. **Phase 4 owns the scheduler** that reads the field, with the
  webhook, the debounce and the nightly sweep.
- **The whole write is one transaction** — run, verdicts, gap moves, ledger, and clearing the retry.
  §5's "no partial gaps" is a `BEGIN` rather than a discipline: a run that inserted three gaps and
  then failed would leave an item carrying debts no score explains, and the next run would find
  them open and restate them forever.
- **A run may only touch gaps in its own rubric's id space.** An item carries a PRD and a design
  package, each scored by its own pack against its own check ids. Without the filter, scoring the
  PRD would find no verdict for a design-pack gap and close it as no longer applicable.
- **`packConditions` lives in `src/packs`, beside `applicableChecks`.** Which conditions a pack can
  be asked about is a fact about the pack, not about a run — the scoring call asks them, a pack
  review reads them, and the next pack will need the same list.
- **The protocol is versioned and stamped, because it is half the prompt.** A verdict comes from
  the rubric and from the protocol wrapped around it (`src/lib/scoring/prompt.ts`). The pack
  versions the first; nothing versioned the second, so §5's "editing a rubric triggers a quiet
  re-baseline pass so numbers never wobble without explanation" covered half of what decides a
  score. `PROTOCOL_VERSION` is stamped on every run and is in the cache key, so an edit invalidates
  stored runs the way a pack version does and the stale ones are findable afterwards. **Bump it on
  any protocol edit that is not a typo**: the cost of bumping needlessly is one re-score, and the
  cost of not bumping is two incomparable numbers with nothing to tell them apart.
- **Law 7 is re-checked in the WHERE clause, not trusted from the read.** The reconciler decides
  from a snapshot taken outside the transaction, so a human can accept a gap between the read and
  the write; both gap updates therefore carry `and disposition = 'open'`. Before that, the evidence
  update would silently rewrite an accepted gap — a machine editing a named person's debt — and the
  close was stopped only by a constraint violation aborting the run, which is law 7 holding by
  accident rather than by design. Where nothing changed, no ledger row is written: a `gap.restated`
  entry for a gap that was not restated is the ledger saying something that did not happen.
- **`::text::jsonb`, never a bare `::jsonb`, when binding JSON as a parameter.** A bare cast lets
  the driver decide the parameter's type, and where it decides `jsonb` the JSON text is stored as a
  jsonb **string** rather than parsed into an object. `jsonb_typeof` says `string`, `->>` returns
  null for every key, and the value prints identically to the correct one — so a ledger written this
  way answers null to every question §15 asks it, and nothing looks wrong. The double cast says
  text first, which forces the parse. Found while writing the write-path tests, on a row that had
  looked fine in every previous inspection.
- **A cached run is re-sorted into pack order on the way out.** `check_id` sorts `prd-10` before
  `prd-2`, so serving the stored rows in database order would make the same run read one way when
  written and another when cached — and §8's meter expansion is a list a person compares against the
  last run. The database cannot know a pack's order, so the read is deliberately unordered and
  `run.ts` restores it from `applicableChecks`.
- **A structural ticket does not close until a fresh context has reviewed it, and the review must
  run in a session that did not write the code.** A new session, holding none of the writing
  context, reads the diff against the spec and reports findings — it changes nothing. T2.2's
  returned seven, of which two were real defects: a failed scoring call metered against the tier
  map's model instead of the pin, and a `purpose` union wide enough to route a scoring call down a
  tier. **Both were invisible while two values coincided** — the pinned model equalled the tier
  map's analysis model, so the wrong meter still read right, and no call site had yet carried a
  scoring purpose into a tier-routed request. The context that wrote the code knows what it meant,
  so it reads the coincidence as the invariant; a context that knows only the spec reads what is
  there. **T2.3 is why the second half of the rule is written down.** The writing session reviewed
  its own diff and reported it clean; a cold session then found four, all real: NFKC folding
  `10⁵` to `105` inside the fabrication guard, an 8-point Must's standard paraphrased into the
  protocol, three renderers shaping the prompt from outside the cache key, and an over-long answer
  aborting a transaction the provider had already been billed for. A self-review re-reads its own
  intent and finds it consistent, which is the one thing it cannot fail to do. Fixes land with
  tests, and each test is negative-checked: reintroduce the defect, watch the named test fail,
  revert.
- **Claude Code is started from the repo root.** Not a preference: `CLAUDE.md`, `AGENTS.md` and
  `.claude/commands/` are discovered at-or-above the working directory and never below it, so a
  session started from the home directory has no constitution at launch, acquires it only when
  something attaches a project file — 53 minutes and 8 writes into T2.3 — loses it again on every
  compaction, and never registers the project's commands at all. **Everything through T2.3 was
  built this way.** The work held up because the tickets carried their own rules in prose; that is
  not a reason to keep doing it. The evidence is in the session records: a `nested_memory`
  attachment naming `dev/aenima/CLAUDE.md` arrives at +10.9 min in the T2.1/T2.2 session, +53.5 min
  in T2.3's, and never at all in two others. A shell-only session can run indefinitely without it —
  71 Bash calls did — because the load is triggered by a file attachment, not by the working
  directory. Started from the root, all three become launch context and survive compaction.
  Confirm with `/context` (both files under **Memory files**) and `/help` (both commands under
  Custom).

## Open questions

1. Seed content still owed: TR formality register per product, the ~80-term universal loanword
   list, confirmation of the appendix A baseline numbers, at-risk sort weights after four weeks
   of real use. None of these block phases 0–1.
2. **Actor label in the ledger — decide at Phase 5.** Product spec §8 requires sign-off
   answerable by name forever; the ledger currently holds only a uuid that stops resolving once
   the auth user is deleted. Decide the actor-label snapshot when the ceremony packet is built,
   and prefer a display name over an email. Deferred, not dropped.
3. **Unattended agent decision logging — revisit at Phase 3.** `decision.decided_by_user_id` is
   human-only, with no `actor_kind` pair, because §13 has the agent *capture* decision moments and
   a human confirm them. If an agent ever needs to log one unattended, this needs the same
   `actor_kind` shape `activity` and `artifact_version` carry.

4. **OTP expiry drift — verify on any change to the dashboard setting.** `OTP_EXPIRY_SECONDS`
   mirrors Supabase Auth → Email → OTP Expiration by hand. Change one without the other and the
   wrong-code/expired strings silently disagree with reality. No test can catch it — verify on
   any change to that dashboard setting. **A build-time check was investigated and is not
   possible with this project's credentials:** `/auth/v1/settings` does not carry the value (the
   service-role key returns a byte-identical response), the value lives in GoTrue's environment
   rather than in Postgres, and the Management API endpoint that does expose `mailer_otp_exp`
   (`api.supabase.com/v1/projects/{ref}/config/auth`) requires an account-scoped personal access
   token — one that can modify every project on the account. Putting that in the Vercel build
   env to read one integer is the trade, if this ever needs automating.

5. **~~`src/db/database.types.ts` was hand-edited — regenerate and diff.~~ Closed by T2.4.** The
   file was regenerated from the live project and every hand-written shape was correct: `item.key`,
   `product.key_prefix`, `ai_usage` and `workspace_ai_credential` came back identical — required on
   Row and Insert, optional on Update. One value had drifted and nothing read it: `PostgrestVersion`
   was hand-typed `14.15` where the platform reports `14.5`. The stale *content* was the real cost —
   two migrations of scoring schema were missing, and with them the `closed` disposition that was
   already rendering wrong on the item page. **Regenerate after every migration, not at the next
   opportunity.** The original note follows.

   **`src/db/database.types.ts` was hand-edited — regenerate and diff.** T1.2 added `item.key` and
   `product.key_prefix` to that file by hand, because the Supabase MCP server was not connected in
   that session and there is no second route to the generator on this machine. Both follow
   `artifact_version.version_no` exactly — required on Row and Insert, optional on Update, which is
   the shape the generator gives a NOT NULL column with no default. **Regenerate when MCP
   reconnects and diff the result: a clean diff retires this note and the one in the file's
   header.** A dirty one means the hand-written shape was wrong, and the typed client has been
   lying about a column ever since.

6. **What T1.2 left on the list surface, and where each goes.** The "Park?" chip renders and does
   nothing — park is a mutation plus an activity row plus §13's undo toast, so it lands with the
   negotiation moves in **Phase 2**; it renders now because adding it later would shift every idle
   row's layout after the fact. Arrow-key walking of list rows (§11) is unwired, and
   `src/lib/roving.ts` is already there for whoever does it — **T1.3 or a later pass**. The row's
   freshness is *last activity*, not *scored at*: §8's dot and §10's "scored 6 h ago — retrying"
   both want a scoring clock, which arrives in **Phase 2**. **Half-answered by T2.4:** the item page
   now reads that clock — `scoring_run.scored_at` for the timestamp, `artifact.next_scoring_attempt_at`
   for the retry — and renders both states. The *row* still shows last activity, because §13's list
   is a workspace-wide ranking and giving every row its newest run is a second read across the whole
   workspace, not a column on the one it already makes. Decide it with the list's pagination question
   (open question 7), which is the same read.
7. **The list read is unpaginated, deliberately — revisit when a workspace gets large.** The buckets
   are a ranking over the whole workspace, so there is no page of rows that could be bucketed
   correctly: you cannot tell that an item belongs at the top of Your move from a slice of the
   table. The read is bounded by workspace size and nothing else. **When that stops being
   acceptable the fix is a cap plus a visible "and N more", never a bare `LIMIT`** — silently
   truncating the bucket §13 puts "always on top" is the failure nobody would notice. Also worth
   confirming this project's PostgREST `db-max-rows` before it bites: if it is set, the platform
   truncates the result and says so only in a response header.

8. **Which workspace a member lands in is arbitrary — decide at Phase 6.**
   `getCurrentWorkspace()` takes the *oldest* workspace the caller belongs to, and no spec section
   says how a member of several should land in one. That is not a rule, it is the first row of an
   unordered set with an `order by created_at` bolted on to make it deterministic.
   **Multi-workspace membership is real** — §14's invited member can belong to two teams — so this
   needs a deliberate answer: a stored last-active workspace, an explicit switcher in the §4
   sidebar beside the product one, or workspace-scoped URLs. Deferred to **Phase 6** with onboarding
   and roles, which is where the invite path and the role matrix get built and where the question
   stops being hypothetical. `docs/schema.md`'s `DEV_SEED_EMAIL` caveat points here: it is the same
   arbitrariness, felt first by developers because signing in before seeding leaves your own empty
   workspace older than the seed's.

9. **Opportunities have no key column, so `/o/<key>` cannot be built.** `opportunity` carries `id`,
   `workspace_id`, `product_id`, `title` and `summary` — nothing to put in a URL a person can say.
   **When the opportunity page ships, mirror `item.key`:** a `key_prefix` counter assigned by
   trigger, the same discipline as `artifact_version.version_no`. **Not a uuid route.**
   `src/lib/routes.ts` keeps its segments short for one stated reason — "`/i/soc-12` is a URL a
   person can read out" — and `/o/6f3c…` defeats it entirely. Until then the item header shows the
   opportunity's **title as plain text**, no href: it fixes the thing that mattered (an item that
   shows its product but not its opportunity hides why it exists) and needs no migration.

10. **§4's data/compliance layer has no checks to encode.** Check 18 "triggers compliance layer"
    and §4 turns "privacy checks on" for personal data or an auth surface — but §7.2 never
    enumerates them, so T2.1 could encode the safety layer and not this one. **The compliance
    layer arrives with the checks it contains**, and until §7 lists them there is nothing to
    transcribe. `src/packs/types.ts` already holds the shape; it needs content, not code.

11. **~~The seed writes `gap.check_id` values that match no rubric check.~~ Closed by T2.3.** The
    four gaps now name `prd-19`, `prd-16` and `prd-20`, and the requirement ids they used to hold
    moved into the evidence, in §5's own format — a gap names a check, a story names a requirement,
    and the evidence cites the requirement as the place the gap lives. The accepted gap's tag
    changed from Should to Must with it: `prd-16` is a Must in the pack, and a seeded tag that
    disagreed with the rubric would be the same class of lie one level down. They had predated any
    pack and were left alone in T2.1 rather than rewritten inside a transcription ticket.

12. **A pack is keyed by artifact kind, not by item type.** §7.2 is the *Feature* PRD rubric, and §4
    gives each of the seven types its own "rubric weight centre" — an Enhancement's lean PRD is
    scored on what must not change, a Fix's on its regression guard. So `prd` will eventually need
    more than one pack. The pack id carries the distinction today (`feature-prd`) and
    `SkillPack.artifactKind` does not; whoever writes the second PRD rubric decides whether
    selection keys on item type or stays a plain id lookup.

13. **Rate cards go stale silently, and no check can be written against a price page.** Each card in
    `src/lib/ai/pricing.ts` carries its source URL and the date it was read, so verifying one is a
    fetch rather than an investigation — but nothing detects that a published price moved, and a
    wrong rate makes §12's optional Owner-set spend cap a cap that does not hold. **A price change
    means a new card id and a new entry, never an edit to an existing one**, because old rows are
    priced at the card they name. Re-read both pages when either provider announces pricing changes,
    and at every provider certification pass. One ambiguity found while writing the cards and
    resolved in favour of the published table: OpenAI's `gpt-5.6-terra` model page says cached input
    is "unchanged" above the 272k long-context threshold, while the pricing table lists an explicit
    long-context cached rate of exactly 2× the short one — consistent across all three models, and
    consistent with the stated "2x input" multiplier, so the table was taken as authoritative.

14. **A gap closed as "no longer applicable" is a case T2.5's surface should show.** The machine
    closing a gap because §4's condition stopped holding is correct and it is also the one closure
    a person might disagree with — the safety layer turning off is a judgment about the artifact,
    not an observation that a check now passes. The ledger records it (`gap.closed`, reason "no
    longer applicable") and nothing surfaces it. **T2.5 owns the human-facing view**, where §5's
    first negotiation move already lives: the place to say "the safety layer turned off on this
    version — is that right?" is beside the move that argues applicability.

15. **The re-baseline pass has no trigger yet.** §5: "Switching AI provider or editing a rubric
    triggers a quiet re-baseline pass so numbers never wobble without explanation." Every run stamps
    provider, model, pack id and pack version, so the stale runs are findable — a re-baseline is a
    query plus a re-score of what it returns. Nothing runs it. **Phase 4**, with the scheduler that
    reads `next_scoring_attempt_at`: both are "re-score this set of artifacts, quietly", and
    building one without the other would be two halves of one sweep.

16. **`scoring_check_result` stores `points`, which is a copy of pack data.** Deliberate — §5
    versions rubrics like documents and a run has to stay readable against the rubric that produced
    it, so a lookup would re-price last month's run through this month's rubric. It does mean a
    pack whose points were edited *without* a version bump would leave a run whose stored points
    disagree with the pack, and nothing detects that. `validatePack` enforces the zero-sum budget
    but not that a change came with a version. **Worth a check when packs start syncing from a git
    repo (§7)**, which is the point where an edit can arrive without a human bumping anything.

17. **Which artifact's meter, once a second pack ships.** T2.4 reads "the artifact's latest run" as
    *the item's* latest run, which is exact today: `packForKind` gives one pack per artifact kind and
    only `prd` has one, so an item has at most one scorable artifact. §2 says "per-stage readiness
    scores" and §13's row carries "per-stage readiness meters" — both plural. **When the tech-spec or
    brief pack lands, the item page needs a meter per scored artifact**, and `getLatestRunForItem`
    becomes a read per artifact rather than one per item. The seam is small on purpose: `RunView` is
    composed from one run, so the change is the query and the layout, not the composition.

18. **A run's check prose is not versioned with the run — and after 0011 it is the only thing that
    is not.** T2.3 copied `tag` and `points` onto `scoring_check_result` so a run stays priced by the
    rubric that produced it; T2.4's review copied the not-asked checks and their conditions onto
    `scoring_check_not_asked` for the same reason. Prose was not copied, and `getPack` returns the
    **current** pack. So a rubric that reworded a check displays the new sentence against an old
    verdict, and one that dropped a check — or was retired entirely — displays no sentence at all:
    `CheckLine.prose` is nullable and the line renders on its id alone, which is the honest floor
    rather than a fix. The blast radius is now bounded to the sentence; nothing that decides what a
    line *says about the run* comes from the pack any more. **Decide when a pack version actually
    bumps**: either copy prose onto the row like everything else, or make packs loadable by version
    so a run can be read against its own. The second is what §5 means by versioning rubrics like
    documents, and it is what a re-baseline pass (open question 15) will want anyway.

19. **A run stored before `scoring_check_not_asked` says so, and the line goes when the last such
    run does.** 0011 backfills nothing, so a run written before it lists its verdicts and stops
    short of the rubric with nothing accounting for the difference — 66 of 99, and no line under it
    for the missing 6. That is §1 law 3's "a number that cannot be interrogated", so the expansion
    discloses it: `RunView.notAskedUnrecorded` and `t.item.checksNotAskedUnrecorded`, one quiet
    ui-footnote saying the run predates the record and a re-score adds it. **The absence is
    detected, never filled** — deriving the missing lines from the pack that ships today is the
    defect 0011 removed, sound only for as long as the rubric happens not to have moved.

    The detection is the run's own rows against the rubric's total: flagged when a run has verdicts,
    no not-asked rows, and its points fall short. §5's zero-sum budget is what makes that stable —
    `validatePack` holds the base checks to exactly `RUBRIC_TOTAL`, so a new check takes its points
    from an existing one and a rubric edit cannot move the total underneath a stored run. Only a
    layer arriving or leaving can, and a layer that did not enter writes not-asked rows, which the
    flag excludes. With no pack loaded it says nothing rather than guessing.

    **soc-9 was re-scored** so the seeded item shows the complete picture: 67% from 66 of 99, twenty
    checks in pack order, fourteen answered, five unclear, and `prd-15` not asked with its condition.
    Runs cache per artifact version and are append-only, so a re-score is a new version — the PRD's
    content and hash were copied forward from version 1 rather than retyped, leaving the golden
    labeled sample byte-identical, and the run that followed was a real provider call (41s, the same
    five failures). The two pre-0011 runs are still in the table and still account for 99 of 105;
    they are no longer the newest, so no surface reaches them today.

    **Delete `notAskedUnrecorded`, its string, its line and its tests once no run predating 0011
    remains** — in this database that is already true of every run a surface can reach, and becomes
    true outright once the two stragglers are gone or a fresh environment is seeded. If a backfill is
    ever wanted instead, it belongs in a script that loads the pack by version, not in SQL that
    hardcodes rubric prose.

20. **~~Does a product's named Decider override §14's Viewer row?~~ Answered: the Viewer row wins.**
    §14 says "Each product names a **Decider** (config field) who approves spec patches, accepts
    flags, and can waive walkthroughs", unqualified. §14's table says "Viewer | Read-only |
    Everything else", equally unqualified, and 0001 read it as "Viewer appears in no write policy
    anywhere". A product that named a Viewer as its Decider put the two in direct conflict, and
    0013's first draft resolved it in SQL, in the Decider's favour, without saying it was resolving
    anything.

    **The ruling: a Viewer named as Decider gets no write, ever. The appointment does not override
    read-only.** The Decider sentence describes what a Decider *does*; the role table describes what
    a role *may do*. The table is the narrower and more absolute of the two — "Read-only. Everything
    else." — and a per-product config field must not be able to silently grant a workspace-level
    write power. 0013's `= 'developer'` scope on the `gap_update` disjunct is therefore the shipped
    law rather than a holding position, and the db test that refuses a Viewer-Decider on all three
    routes (the move, a direct UPDATE, a direct `activity` insert) is pinning a rule and not a
    deferral. `activity_insert` never needs the disjunct and the functions never need a SECURITY
    DEFINER half, so 0012's corrected "definer can only subtract" comment has no successor to warn.

    **The real fix is that the configuration should not exist — and that belongs to Phase 6.**
    Refusing a Viewer at *assignment* time is better than honouring the refusal at write time,
    because a product whose named Decider cannot decide is a silently broken product: §14's fallback
    ("removal or absence falls back to the Owner automatically — handover never blocks on a missing
    human") covers an *absent* Decider, not a present one who is powerless. Phase 6 owns roles and
    membership, so the assignment-time refusal is that ticket's: either the Decider picker excludes
    Viewers, or demoting a member to Viewer clears every Decider field naming them. Until it ships,
    the misconfiguration is possible to create and inert when used.

    §14 is being patched to carry the law where people read it rather than leaving it in a policy;
    that edit is the owner's, in the doc sweep, not this ticket's.

21. **A settle written straight at the table carries no ledger row — decide when §2's ledger stops
    being a convention.** §2 requires an `activity` row for every mutating action, and for gaps that
    requirement lives in `accept_gap` and `reopen_gap` rather than in the table. So an Owner or
    Product member who PATCHes `gap` over PostgREST instead of calling the RPC changes a
    disposition with no ledger row at all. That is 0004's shape and predates this ticket; 0013 does
    not widen it, and bounds the one principal it newly admits to the same two transitions the
    functions perform — but a Developer-Decider now has the same silent route the other two had.

    The structural fix is to move the ledger write into an AFTER UPDATE trigger on `gap`, which
    would make §2 true of the table rather than of the callers, cover `excluded` and the machine's
    `closed` the same way, and let the two functions drop their INSERTs. It changes behaviour for
    three roles and belongs in its own ticket, not in a review of a review. `gap-accept.db.test.ts`
    asserts the empty ledger after a direct settle, so the assertion turns red the day it is fixed
    and points here.

22. **Applicability wobbles run to run, and it moves the denominator — a ticket, not a patch.**
    Two `score:file` runs over the **same bytes**, three minutes apart, disagreed about which §4
    layers entered. Nothing that is supposed to determine a score differed: same content hash
    `9d89778f501e30e7…`, same pack `feature-prd@1.0.0`, same `PROTOCOL_VERSION`
    `1.1.0+602d20db225ee669`, same `anthropic` / `claude-sonnet-5`.

    | | `soc-10`, 19:37:46Z | `soc-11`, 19:40:11Z |
    |---|---|---|
    | conditions met | `list-rendering-surface`, `user-to-user-or-location` | `list-rendering-surface` |
    | not asked | `prd-16` (Must, 6) | `prd-16` (Must, 6), `prd-20` (Must, 5) |
    | earned / denominator | 10 / 99 | 10 / 94 |
    | score | 10.1 | 10.6 |

    The verdicts did not move — **`earned` is 10 on both**. The entire difference is `prd-20`, the
    safety layer's Must, entering one run's denominator and not the other's: the scorer decided the
    document carried "user-to-user visibility, interaction, or location" once and not the second
    time. A worse document therefore scored *higher* on the run where the safety layer failed to
    turn on, because the check it would have failed was never asked.

    **What it violates:** §5, "Switching AI provider or editing a rubric triggers a quiet
    re-baseline pass so numbers never wobble without explanation." Neither the provider nor the
    rubric changed here and the number wobbled anyway — this is the promise's precondition failing,
    not its remedy. It is also §1 law 3 in a second form: 99 and 94 are both interrogable, and
    nothing can say why this document got one rather than the other.

    **Why it surfaced only now.** §5's cache is keyed per artifact version, so scoring the same
    artifact twice returned the first run and the second opinion was never taken. `score:file`
    writes a new version per run by construction, which is what made the same bytes reachable twice
    — the cache was not hiding a rare event, it was preventing the observation. Any surface that
    re-scores (a re-baseline, open question 15) hits this immediately.

    Candidates, none chosen:
    - **Pin the sampling temperature.** It is not pinned today — `anthropicBody` sets `model`,
      `max_tokens`, `system`, `messages` and `output_config` and no `temperature`, so every scoring
      call runs at the provider's default. Cheapest to try, and it narrows the variance rather than
      removing it: a pinned temperature is not a determinism guarantee.
    - **Split applicability into its own pass, cached per artifact version.** Conditions and
      verdicts come back from one call against one schema (`schema.ts`'s `conditions` object beside
      the results array). Deciding conditions once per version and caching *that* makes the
      denominator a property of the artifact rather than of the run — the same document always
      brings in the same checks, and a re-score can still disagree about whether they pass, which is
      the disagreement §5 actually permits.
    - **Accept it and change §5's promise.** Say denominators are per-run judgments and make every
      surface that shows one show its conditions beside it. Honest, and it gives up comparing two
      runs of the same document, which is what a golden set is for.

    **Both runs are still in the database**, and cannot be removed: `scoring_run`,
    `scoring_check_result`, `scoring_check_not_asked` and `artifact_version` all carry
    `app.deny_mutation()` on DELETE, so the append-only law that makes a score interrogable also
    makes this evidence permanent. The scratch items `soc-10` and `soc-11` were meant to be cleaned
    up and stay for that reason — see the note under open question 24. The table above is the
    record either way. Reproducing it from scratch is two `pnpm score:file` runs over one file
    written with an ambiguous safety surface.

23. **Passing checks cite nothing, and the protocol stays as it is until the golden set needs it.**
    `prompt.ts` tells the scorer "A passing verdict carries none of the three. Leave all three
    empty", so `quote` is null on every passing row in the database — **0 of 41**. `score:file`
    prints the zero with that sentence under it rather than letting an empty list read as a defect,
    and the loop that would print them stays because it is right the moment the sentence changes.

    **Leave the protocol alone.** The half of interrogation that is missing is real — a person
    reading a 66/99 can see what the scorer rejected and not what it accepted — but the fix is not
    a tweak. `PROTOCOL_VERSION` is a hash of the assembled context, so editing that sentence moves
    the version, invalidates §5's cache for every stored run, and triggers the re-baseline §5
    requires. Paying that to add prose nothing reads yet is the wrong order.

    **The trigger is the scorer eval harness** (On the horizon, Phase 2's golden set with planted
    gaps). That harness is the first thing that needs a passing quote: measuring precision means
    checking that a check passed *for the right reason*, and a pass with no evidence is a pass that
    cannot be graded — a scorer that accepts every check for no stated reason measures as perfect.
    It is also the ticket that can pay the re-baseline, because re-scoring the golden set is what it
    does anyway. Change the sentence there, in the same change as the harness, and bump
    `PROTOCOL_RELEASE` with it.

24. **Scratch rows in the seed workspace cannot be deleted, and there is no supported reset.**
    `soc-10` and `soc-11` — two `score:file` experiments over the same throwaway document — were
    meant to be deleted and cannot be. `scoring_run`, `scoring_check_result`,
    `scoring_check_not_asked`, `artifact_version`, `activity`, `ai_usage` and `decision` each carry
    `app.deny_mutation()` on `BEFORE DELETE OR UPDATE`, so the delete fails at the first scoring
    row: *"scoring_check_result is append-only: DELETE is not permitted"*. The two items, their two
    runs, 37 check results, 3 not-asked rows and 31 gaps stay in the seed workspace.

    **That is the law working, not a defect.** A score is interrogable because the rows behind it
    cannot be quietly revised, and §2's ledger holds what happened rather than what someone would
    prefer had happened. The cost is that a *development* workspace has no eraser, which nobody
    priced when the triggers went in.

    **Do not reach for `ALTER TABLE … DISABLE TRIGGER`.** It is the same class of act as
    `drizzle-kit push` dropping the RLS policies: a boundary removed by a convenience, in a
    database where the boundary is the feature. If these rows ever have to go, the honest route is
    dropping and rebuilding the environment — `db:migrate` then `db:seed` on an empty database —
    not switching the guarantee off and on around a `DELETE`.

    Mitigated but not answered: `score:file` now reuses one item per file, so re-scoring a document
    adds a version rather than an item and the workspace stops growing one row per experiment. That
    bounds the mess; it does not reverse the part already there. Candidates for the rest, none
    chosen: a documented `db:reset` that drops the schema and re-migrates, a scratch workspace
    `score:file` writes to that can be dropped whole, or simply accepting that the seed workspace
    accumulates and re-seeding a fresh database when it gets noisy.

25. **A quote that begins or ends inside an emphasis span is narrower than it was — accepted, and
    named so it is not rediscovered as a mystery.** Every rule in the fold is a *pairing* rule, so a
    quote carrying one unbalanced marker from a span it cut through keeps that marker where the
    source side has lost it, and fails where it passed before: `*y**z` no longer verifies against
    `x**y**z`. It needs a model to echo a marker verbatim *and* stop mid-span, which is why it is
    accepted rather than engineered around — the alternative is deleting markers unconditionally,
    which is exactly the defect the review found (`2**5` → `25`) and which fails the test the fold
    exists to pass. **The trigger to revisit is a real rejection with an unbalanced marker in the
    quote**, which `score:file` prints in full. Until one appears this is a shape, not a defect.

    Recorded honestly: the first draft of this entry claimed the `**` and backtick folds were
    context-free deletions that could not break any quote. `replaceAll("**", "")` is a
    two-character non-overlapping scan, not a per-character map, so that was never true even of the
    version it described.

26. **The link fold is decided and waiting for its first real case.** The ticket said the corpus
    contains links; measuring it found **zero** — not one inline link, image, reference link or
    autolink in any sample, any seed artifact or any doc. So no link fold shipped, and the reason is
    the one that rejected NFKC: dropping a URL discards content, and `[policy](a.md)` and
    `[policy](b.md)` folding to one string is two sentences becoming one, which is the property the
    guard exists to prevent. **The answer, if a real case arrives:** fold to the visible text, since
    that is what a model reading rendered prose echoes. A test pins the current non-folding, so
    adding it is a deliberate edit rather than a drift. The trigger is an artifact that actually
    contains a link — bring the count.

27. **The emphasis fold is line-sensitive, so a re-wrap is no longer perfectly neutral.** An italic
    pair is confined to one line and a bold pair to one paragraph, because a rule that crossed those
    would pair the stray asterisks of two consecutive CSS comments and rewrite what the block says
    (`/* app background */ /* glass */` → `/* app background / / glass */`). The cost is a
    disagreement the function's own first paragraph says it exists to prevent: where a *source* wraps
    mid-span and a model's one-line quote does not, the quote folds and the source does not, and the
    two sides differ on nothing but where the line broke.

    **Not fixed, because every fix is worse than the shape.** Dropping the bounds reintroduces the
    CSS-comment rewrite; normalizing line breaks before the emphasis pass puts the whole document on
    one line and lets stray markers pair across paragraphs, which is the same defect from the other
    side. It is bounded in practice: bold already crosses single line breaks (only a *blank* line
    stops it), so this is italic-only, and no artifact in the corpus wraps inside an italic span.
    **The trigger is a rejection whose quote and source differ only in wrapping** — the same trigger
    as q25, and the same place it would show up, so whichever arrives first should look at both.

28. **`scheduleRetry` crashed on a real retryable failure, and I could not reproduce it in
    isolation.** T2.7's raised-`max_tokens` attempts failed as `unavailable`, which is retryable, so
    `run.ts` called `scheduleRetry` — and that threw
    `TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type string … Received an
    instance of Date` from inside postgres.js's `Bind`, at `src/db/queries/scoring.ts:485`. **This
    is pre-existing** — `scoring.ts` is untouched by T2.7 and was last changed in `9e4371a`. It
    matters because it is the one path §5 leans on during a provider outage: a retryable failure is
    supposed to leave `next_scoring_attempt_at` and return a typed `ScoreResult`, and instead it
    throws past all four failure shapes — the same class of defect T2.3 fixed for `writeRun`.

    **Not diagnosed further, on purpose.** The obvious causes are all ruled out: `retryDelayFor`
    returns a number for `unavailable`, so the `Date` is valid; and the exact statement shape with a
    `Date` parameter, against the same column, on a client with the same options, succeeds when run
    on its own. That leaves connection state or concurrency on the shared `max: 1` client, which is a
    real investigation and not a measurement ticket's. **The trigger to pick it up is any provider
    outage**, where it will fire on the path that exists to survive outages.

29. **Open question 25's corner arrived, in twelve runs.** T2.6 accepted that a quote beginning or
    ending mid-emphasis-span would fail, on the grounds that it needs a model to echo a marker
    verbatim *and* cut inside the span, and filed the trigger as "a real rejection with an unbalanced
    marker in the quote". Arm A produced one: `prd-19` quoted
    `5+ messages from each person** and **spans at least 10 minutes`, whose `**` are space-flanked
    and so survive the fold, against a source where both spans are balanced and fold away. The run
    was rejected and nothing was written. **One in twelve is not the vanishing rate q25 assumed**,
    and it costs a whole run each time. It is still not obviously worth fixing — the alternatives
    are the ones q25 rejected — but the frequency is now measured rather than guessed, and whoever
    revisits q25 should start from this number.

30. **T2.8 — self-consistency, then the golden set, then probes.** Recommended by T2.7's
    measurement and not started there. N=5 samples per scoring run, majority per check and per
    condition, aggregation in code, all N quotes kept and verified, one run row with the samples
    beneath it. The full defence of N, the cost and latency shape, and the honest limit — five
    samples cut the score's spread from 18.7 points to 14.1, which is smaller but is not §5's
    promise — are in the T2.7 entry above. **Probes come after, gated on the golden set**: majority
    vote makes the number repeatable, probes make it right, and the second cannot be graded against
    a baseline that still moves 14 points.

## On the horizon

- Phase 2 gains a scorer eval harness — a golden set of artifacts with known planted gaps,
  measuring the scorer's precision against them before meters are trusted. It owns the protocol
  change that makes a passing check cite the document (open question 23), and it is the run that
  can pay the re-baseline that change costs.
- Phase 5, backlog refinement (§7.5): the slicing dimension is the decision that determines whether a
  backlog is buildable. Slicing a PRD by document section produces stories that all touch the same code;
  slicing by user-visible capability produces stories that can be built independently. §7.5 requires no
  story too big and no requirement orphaned but names no axis — decide it when the ticket is written.

## Accounts and keys needed

- [x] Supabase project (URL, anon key, service role key)
- [ ] Anthropic and/or OpenAI API key — the workspace BYO key for the AI layer
- [ ] Notion internal integration (token + the pages/databases it can see)
- [ ] Figma personal access token
- [ ] Google Cloud OAuth client (Google sign-in, Drive watch) — deferred, not blocking
- [ ] Apple sign-in credentials — deferred, not blocking
- [x] Vercel project — deployed, **aeni.ma**
- [x] Resend — the Supabase SMTP sender for the OTP mail since T0.4, now sending as
      `auth@aeni.ma` on the verified domain. Not phase 6.

Supabase MCP is connected from the repo's `.mcp.json`, read-only. Playwright MCP is
configured in local Claude Code settings only, so it does not travel with the repo.
