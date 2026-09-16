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

One file per ticket under `docs/log/`, oldest first. This list is written by `node scripts/run/log-index.mjs` from that directory and its test refuses a stale copy: edit the files, never the list.

- [T0.1 — scaffold, strict TS, ESLint+Prettier, Vitest, Playwright, folder skeleton](log/T0.1.md) · 2026-08-21 · `4e4d5ae`
- [T0.2 — design tokens, three faces, Æ mark, five primitives, /dev/primitives preview](log/T0.2.md) · 2026-08-21 · `bdbaab6`
- [T0.3 — eleven composites, page.tsx replaced, layout metadata, scaffold assets removed](log/T0.3.md) · 2026-08-21 · `e04da9f`
- [T0.4 — Supabase + Drizzle, object tree schema, RLS isolation, append-only ledger, OTP sign-in, seed](log/T0.4.md) · 2026-08-22 · `774621d`
- [T0.4 follow-up — sign-in verified end to end; first-run /app crash fixed](log/T0.4-follow-up.md) · 2026-08-22 · `5a1514d`
- [T0.4 follow-up 2 — the ledger's actor id becomes a recorded fact, not a foreign key](log/T0.4-follow-up-2.md) · 2026-08-22 · `91c0b0f`
- [T0.5 — form language onto design spec v2.3](log/T0.5.md) · 2026-08-22 · `0cad302`
- [T1.1 — gap and decision tables, the typed query layer, derived stage](log/T1.1.md) · 2026-08-22 · `19e55a8`
- [T0.6 — second form-language pass onto design spec v2.5; Iconoir](log/T0.6.md) · 2026-08-22 · `a609532`
- [Design spec v2.7–v2.12 — the form language finished against real use](log/design-spec-v2.7-v2.12.md) · 2026-08-23 · `75d9b21`
- [Deploy — Vercel, live at aeni.ma; Resend sends the OTP mail](log/deploy.md) · 2026-08-23 · `9b3ac04`
- [T1.2 — the §13 list surface at /app](log/T1.2.md) · 2026-08-23 · `a615cc1`
- [Production 500 fix — the RSC boundary](log/production-500-fix.md) · 2026-08-23 · `55b10f5`
- [Design spec v2.13–v2.15 — SemiBold buttons, the account slot, the item row as a ledger](log/design-spec-v2.13-v2.15.md) · 2026-08-24 · `4f5443d`
- [T1.3 — the item page at /i/<key>](log/T1.3.md) · 2026-08-24 · `d96d70e`
- [T2.1 — the skill-pack format and the Feature PRD rubric as data](log/T2.1.md) · 2026-08-24 · `a30ab13`
- [T2.2 — the AI provider abstraction](log/T2.2.md) · 2026-08-26 · `a2bb53e`
- [T2.3 — the scoring run](log/T2.3.md) · 2026-08-27 · `19a079f`
- [T2.4 — the meter, and what it expands into](log/T2.4.md) · 2026-08-31 · `9e4371a`
- [T2.6 — absorbed, no ticket of its own; Phase 2 complete](log/T2.6.md) · 2026-08-31 · `1e375b7`
- [T2.5 — "we accept this risk", §5's third negotiation move](log/T2.5.md) · 2026-09-01 · `98fa70e`
- [T2.7 — how much of the wobble is sampling](log/T2.7.md) · 2026-09-01 · `6e0cc56`
- [T0.7 — the harness guidelines §5 assumes: guard, gate, reviewer, worktree include](log/T0.7.md) · 2026-09-03 · `fd16091`
- [T0.8 — /ticket as a project skill, eight run scripts](log/T0.8.md) · 2026-09-03 · `7136df3`
- [T0.98 — Smoke A: scripts/run/README.md and its test](log/T0.98.md) · 2026-09-03 · `87bc123`
- [T0.99 — Smoke B: the gate's release message, through a Decision and back](log/T0.99.md) · 2026-09-03 · `44459b1`
- [T0.9 — Run fixes: what three live runs taught](log/T0.9.md) · 2026-09-09 · `666f152`
- [T0.97 — Smoke C: plain sentences, a default taken, the first stale-run recovery](log/T0.97.md) · 2026-09-09 · `df9b0a6`
- [T0.96 — Smoke D: a package script and its test, on the schedule](log/T0.96.md) · 2026-09-13
- [T0.10 — Schedule: nobody types /ticket](log/T0.10.md) · 2026-09-13
- [T0.14 — Ignore worktrees in lint](log/T0.14.md) · 2026-09-13
- [T0.11 — Comments: a comment on the board is enough](log/T0.11.md) · 2026-09-13
- [T2.8 — Sufficiency probes](log/T2.8.md) · 2026-09-14
- [T0.12 — Telemetry and mirror: every run leaves a row, the mirrors keep up](log/T0.12.md) · 2026-09-14
- [T0.16 — Self-merge: a finished ticket merges itself](log/T0.16.md) · 2026-09-14
- [T0.17 — Linear ordering](log/T0.17.md) · 2026-09-15
- [T0.20 — Cap counts clarifying rounds](log/T0.20.md) · 2026-09-15
- [T1.4 — the opportunity page, and the key that makes its URL sayable](log/T1.4.md) · 2026-09-16

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
- **`drizzle()` mutates the client it is handed, and the raw `sql` beside it is not the same
  client afterwards.** `sharedDbClient()` returns `{ db, sql }` from one postgres.js instance, and
  passing that instance to `drizzle()` replaces its type handlers — so postgres.js's own `Date`
  serializer stops running on raw tagged templates and a `Date` parameter throws at the wire
  encoder. Two queries were written against the raw handle with a `Date` and both were broken from
  the day they shipped: §5's outage queue and §15's spend window. **The lesson is narrower than
  "convert your dates":** `{ db, sql }` looks like two views of one connection and behaves like
  two clients with different rules, and the db tests could not see it because they inject a handle
  that never met `drizzle()`. A fixture that skips the wiring cannot test the wiring.

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

- **Running aenima's own Development backlog on aenima produced six rulings, and product-spec
  v1.6 carries all six.** The board's own document is `docs/guidelines.md`; the product's is
  `docs/product-spec.md`. A ticket's status set is named — Backlog · Ready · In progress ·
  Decision · Review · Done — with Backlog as the proposal state every aenima-written ticket is
  born in and Backlog→Ready as the one transition aenima never makes for itself, which is law 4
  expressed as a status rather than a badge. Decision is a ticket state, carrying Question ·
  Where · Default in the ticket body, *Where* being §8's fault attribution. Each human answer
  gets exactly one assessment, capped by §6's two rounds, after which aenima stops asking and
  waits without stopping reading. The version tuple is checked when work starts and drift is
  surfaced the way §8 surfaces a patch to a signer. The no-orphan rule runs down to the ticket:
  every acceptance criterion names its test case and every test case names its criterion, before
  the ticket is pushed. And agent run telemetry — one row per run, for when aenima drives the
  coding agent itself — is named post-v1, since v1 reads completion back and never runs the
  agent. **Notion comments stayed read-only ingest, which is what puts the Decision question in
  the ticket body.** Asking in a comment thread would need the bidirectional Notion surface v1
  does not have, and would split one ticket's state across two places: aenima writes the question
  where it writes everything else, and reads the answer from a comment or from a body edit.

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

9. **~~Opportunities have no key column, so `/o/<key>` cannot be built.~~ Closed by T1.4.**
   `opportunity.key` is `item.key` one table over — a `key_prefix` counter assigned by
   `app.assign_opportunity_key()` on insert (`drizzle/0015`), unique per workspace, and ignored when
   a client supplies one. `/o/<key>` renders the problem and the items bet on it, and the item
   header's opportunity line is a link. **One property of the mirror is worth knowing:** the two
   counters are independent and the two unique constraints are on different tables, so `soc-3` can
   name an item *and* an opportunity in the same product. `/i/` and `/o/` tell them apart; a person
   saying "soc-3" does not. That is what mirroring asked for and it is what shipped — held by a test
   in `opportunity-key.db.test.ts` so the day it is judged not worth it, something says what
   changed. The original note follows.

   **Opportunities have no key column, so `/o/<key>` cannot be built.** `opportunity` carries `id`,
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

28. **~~`scheduleRetry` crashed on a real retryable failure.~~ Closed — root cause found, both
    call sites fixed.** `drizzle(sql, { schema })` **mutates the postgres.js client it is handed**,
    replacing its type handlers, so postgres.js's own `Date` serializer stops running on raw
    tagged templates from that client and a `Date` reaches the wire encoder unconverted:
    `The "string" argument must be of type string … Received an instance of Date`. Drizzle's query
    builder is unaffected — it converts first — so this bites only the `src/db/queries/*` functions
    that use the raw `sql` from `sharedDbClient()`.

    **Two of them did.** `scheduleRetry` — §5's outage queue, which throws instead of queueing
    exactly when a provider is down and nobody is watching — and `listUsage`, §15's spend view over
    a time window. Both now send `.toISOString()`.

    **Why every existing test missed it.** The `.db.test.ts` files inject a transaction handle
    taken straight from `postgres(...)` and never passed through `drizzle()`, so the mutation that
    causes this is absent from the fixture. The SQL was real, the schema was real, and the wiring
    was not. `src/db/date-binding.db.test.ts` builds the client the way `sharedDbClient()` builds
    it, and asserts the mechanism as well as the two call sites, so the `.toISOString()` calls
    cannot be tidied away as noise later.

29. **~~Open question 25's corner arrived, in twelve runs.~~ Measured at 8%, and the answer is not
    a fold.** Arm A lost a run to it. Source line 4 of `sample-juno-feature.md`:

    > Scheduling a date is locked until the chat has `**`5+ messages from each person`**` and
    > `**`spans at least 10 minutes`**`.

    and the model quoted `5+ messages from each person** and **spans at least 10 minutes` — it
    began inside the first bold span and ended inside the last, dropping the outer markers and
    keeping the inner ones. Source folds both pairs away; the quote's two markers are unpaired and
    survive; the run is rejected and nothing is written.

    **There is no safe fold for this, and the reason is not effort.** The tempting rule is to drop
    a marker that can only open or only close and has no partner — which distinguishes this case
    from `2**5`, where the run is both-flanking and ambiguous and must be kept. It fails on the
    corpus: in `/* surfaces */` the closing `*` is preceded by punctuation and followed by a slash,
    which makes it right-flanking-only and unpaired, so the rule would delete it and rewrite the
    comment. **That is the unconditional-deletion defect returning under a different name**, which
    is the test the fix has to pass and does not. The deeper reason is that the two sides carry
    different information: on the source a marker is resolvable against its partner, and in a
    *fragment* a lone marker is genuinely ambiguous between syntax and content. Normalizing the
    needle differently from the haystack would resolve it and is forbidden for the reason T2.6
    wrote down — two normalizers that agree today are the coincidence-shaped bug this project keeps
    finding.

    **So the fix is protocol-level, and it should ride with a ticket already paying for a
    re-baseline.** Telling the scorer to quote whole sentences, or to quote without markdown
    syntax, costs a `PROTOCOL_VERSION` move and invalidates §5's cache for every stored run — the
    same arithmetic as open question 23, and the same conclusion: pay it once, inside the ticket
    that was re-scoring anyway. **T2.8 was that ticket and did not carry it**: its body named
    probes only, and the question was read after its eleven runs had been paid for, so a second
    fingerprint move would have orphaned the measurement (docs/reports/T2.8.md open question 5).
    It rides with the next ticket that moves `PROTOCOL_VERSION`. Until then the rate is 1 run in
    12 on a document with 21 bold spans, and it scales with emphasis density, so a denser
    document is worse.

    One thing this investigation did fix, because it was a false accept rather than a false
    reject: reading the rejection showed the italic rule pairing the *leftovers* of a bold run that
    had not matched, folding `a** and **b` to `a* and *b` — which is what `a* and *b` folds to, so
    two different texts had one comparison form and a quote of either verified against the other.
    Italic delimiters are now single asterisks only, a `*` touching another `*` belonging to its
    run, as CommonMark's maximal delimiter runs already require. Strictly narrower, so it can
    create no new acceptance.

30. **T2.8 — probes for the five sufficiency checks; majority vote held in reserve.** Recommended
    by T2.7's measurement and not started there. Arm A's per-check rates say voting fixes the
    checks that were nearly stable already and cannot fix `prd-18` and `prd-19`, which sit near a
    coin flip — five samples still leave those disagreeing 22% of the time, for five times the
    cost, and move the score's spread only from 18.7 points to 14.1. A coin flip is the scorer
    having no settled answer, which is a probe's problem and not a vote's. **Probes do not wait on
    the golden set:** `score:spread` measures reliability with no labels and no answer key, because
    it asks whether the scorer agrees with itself. The golden set grades whether the settled answer
    is the *right* one and is still wanted — it gates validity, not measurability. Full numbers in
    the T2.7 entry.

31. **T0.7 — the gate runs from the hook's `cwd` when it is a package root, else
    `$CLAUDE_PROJECT_DIR`.** The ticket said the latter; it does not follow a worktree, so a
    worktree session would have had the untouched main checkout tested on its behalf. Settled by
    T0.8: the gate walks up from `cwd` to the nearest package root.

32. **T0.7 — `.worktreeinclude` carries no `.claude/settings.local.json`**, so a worktree session
    has no Supabase MCP. The ticket's criterion was "files the suite reads", and the suite does
    not read it. Scheduled runs are in worktrees since T0.10 and none has needed it. Owner: T0.11.

33. **T0.7 — `.env.example` is refused by guard rule (e)** because the ticket says `.env*` without
    a carve-out. It holds no secret and `.gitignore` already treats it as the exception. Settled
    by T0.8: `.env.example` is the one exception.

34. **T0.7 — what the guard's tokenizer does not reach.** Rule (e) covers `>`, `>>`, `>&`, `>|`,
    `tee`, `cp`/`mv`/`install`, `sed -i`/`--in-place`. Past it: `python -c`, `dd of=…`,
    `truncate`, an editor, a subshell group `(git push --force)`, a redirect quoted inside
    `sh -c`, `sed -i --expression=…` with no script operand. Rule (d) reads only `-C`/`-c` as
    value-taking git options (not `--git-dir`, `--work-tree`, `--namespace`, `--config-env`) and
    steps over only `env`/`command`/`exec` (not `sudo`, `time`, `nohup`, `nice`). T0.9 replaced
    the tokenizer with a parser that reads `$(…)`, backticks and `sh -c` as the commands they
    run, steps over `sudo`/`time`/`nohup`/`nice` and the long git options, and keeps heredoc
    bodies as data — an unquoted body's `$(…)` and backticks read as the commands they are,
    since the shell runs them. Still past it, by design: `bash file.sh`, `python -c`, `node -e`,
    `dd of=`, `truncate`, an editor, `echo '…' | sh`, `bash -lc '…'` (only the exact token `-c`
    is read as a nested line), `eval "…"`, `xargs pnpm db:push`, `yarn workspace aenima db:push`
    (`workspace` is not a runner verb the parser knows), a `#` comment (`git push # not -f` is
    refused as a force-push),
    and a runner option that takes a value and is not in the parser's per-runner list — its
    value would be read as the script and the real script missed. The parser reads command
    lines; it is not a shell, and it stops here.

35. **T0.7 — subagent types register at session start**, not on file creation; T0.7 invoked its
    own reviewer through `claude -p --agent reviewer` from Bash until the type appeared. Worth a
    line in the build guide if it recurs.

36. **T0.7 — guard rules (a)–(d) read the Bash command text, in both directions.** A script file
    containing `drizzle-kit push`, run as `bash file.sh`, is not refused; a *read* whose text
    contains the words (`grep -n "db:migrate" …`, `git log --grep=…`) is. The ticket asked for
    "containing … always" and got it. Settled by T0.9: rules match argv, never text, so a read
    that mentions a command is allowed and a script file that contains one is not inspected —
    the second direction is the parser's stated edge (34).

37. **T0.7 — `--fallback-model` is documented "(only works with --print)".** Whether the
    `fallbackModel` settings key shares that scope is unstated. Guidelines §5's scheduled run is
    headless, but the scheduled run has to be a Desktop task (`docs/reports/T0.8.md`, open
    question 4), and whether `fallbackModel` fires there is unconfirmed. Owner: T0.11, whose
    Runs row records the model a session ran on.

38. **T0.7 — rule (d) reads the branch of the hook's `cwd`.** For `git -C <path> merge …` the
    checkout that matters is `<path>`. Owner: T0.11.

39. **T0.7 — `git push origin +main` forces by refspec**, with neither `--force` nor `-f`. The
    ticket named the two flags. Settled by T0.8: `namesMain` strips the leading `+`.

40. **A migration's own db test cannot be green in the run that writes it — T1.4 made that a skip,
    and the pattern needs deciding once.** §5 step 6 splits a migration ticket in two: the run
    writes the SQL and stops at Decision, and a later run in a checkout holding `.env.migrate`
    applies it. Between those two runs the column exists in no database, so a db test written
    against it fails — and the Stop gate runs the whole suite at every stop, in every worktree, so
    one such test reddens *every* run in the repo until someone applies the migration. A suite that
    says "you have not applied a migration" by breaking is one nobody can read.
    `src/db/opportunity-key.db.test.ts` reads `information_schema` for the column and skips with a
    loud stderr banner naming the file to apply — the discipline `rls.db.test.ts` already uses for
    an absent `DATABASE_URL`, one cause over. It starts checking for real the moment the column
    lands, and nothing in it is conditional on what the trigger *does*: the assertions are the real
    ones or the file is silent.

    **What is undecided is whether this is the house pattern or this ticket's exception.** The cost
    is real: a test that skips itself cannot fail for the reason it exists, so a dropped column
    reads as a skip rather than as a break. The alternatives are a suite project that is excluded
    from the Stop gate, or a preflight step that fails the *run* rather than the *test* when a
    migration in the tree is unapplied — the second says the true thing in the right place. **Decide
    it at the next migration**, which is the first point where copying this or not is a choice
    somebody makes.

    Also from T1.4, and closed by the same apply: `src/db/database.types.ts` carries one hand-written
    block, `opportunity.key`. The generator reads the live database and there was none to read.
    **Regenerate and diff it in the run that applies `drizzle/0015`** — open question 5's rule, which
    T2.4 vindicated for `item.key`.

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
