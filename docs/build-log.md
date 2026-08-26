# aenima — build log

<!-- Keep this file in the Claude Project context and update it after every ticket.
     It exists so a fresh chat knows where the build stands without you re-explaining.
     Keep it short: state, decisions, open questions. Not a diary. -->

## Current state

**Phase:** 2 — the scoring engine · phases 0 (foundation) and 1 (the spine) complete
**Next ticket:** T2.3 — scoring run: artifact → checks → evidence, cached per artifact version
**Repo:** github.com/alkininan/aenima
**Deployed:** yes — **aeni.ma** on Vercel

`docs/design-spec.md` is **v2.15** and `docs/product-spec.md` is **v1.4**, both complete and
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

- **A structural ticket does not close until a fresh context has reviewed it.** A new session,
  holding none of the writing context, reads the diff against the spec and reports findings —
  it changes nothing. T2.2's returned seven, of which two were real defects: a failed scoring
  call metered against the tier map's model instead of the pin, and a `purpose` union wide enough
  to route a scoring call down a tier. **Both were invisible while two values coincided** — the
  pinned model equalled the tier map's analysis model, so the wrong meter still read right, and
  no call site had yet carried a scoring purpose into a tier-routed request. The context that
  wrote the code knows what it meant, so it reads
  the coincidence as the invariant; a context that knows only the spec reads what is there. Fixes
  land with tests, and each test is negative-checked: reintroduce the defect, watch the named test
  fail, revert.

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

5. **`src/db/database.types.ts` was hand-edited — regenerate and diff.** T1.2 added `item.key` and
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
   both want a scoring clock, which arrives in **Phase 2**.
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

11. **The seed writes `gap.check_id` values that match no rubric check.** `MN-2`, `MN-7`, `SF-1` and
    `CN-1` in `scripts/seed.ts` predate any pack and are *requirement*-ID-shaped — the IDs a PRD
    gives its own stories — not rubric check ids like `prd-10`. Product spec v1.3 made the two id
    spaces explicit in §7.2: a gap names a check id, a story names a requirement id, and evidence
    may cite the requirement id as the place the gap lives. **Harmless while nothing resolves a
    check id against a pack, and it must be corrected before T2.3 scores real artifacts** — after
    that, a seeded gap names a check that does not exist, and the surface that expands a meter into
    its checks has nothing to expand into. They were left alone in T2.1 because rewriting them
    would have been authorship inside a transcription ticket. The fix is a reseed against
    `feature-prd`, unless T2.3 decides `gap.check_id` holds both kinds and says which is which.

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

## On the horizon

- Phase 2 gains a scorer eval harness — a golden set of artifacts with known planted gaps,
  measuring the scorer's precision against them before meters are trusted.
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
