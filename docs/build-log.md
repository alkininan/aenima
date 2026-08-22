# aenima — build log

<!-- Keep this file in the Claude Project context and update it after every ticket.
     It exists so a fresh chat knows where the build stands without you re-explaining.
     Keep it short: state, decisions, open questions. Not a diary. -->

## Current state

**Phase:** 1 — the spine · phase 0 (foundation) complete
**Next ticket:** T1.2 — bucket assignment (your move / at risk / flowing)
**Repo:** github.com/alkininan/aenima
**Deployed:** no

`docs/design-spec.md` is **v2.4**, complete and closed. v2.3 was the form-language
revision — 48h fields, floating labels, state-only helper lines, the subtitle slot,
autofill paint, the multi-step action row. v2.4 added the OTP's two sizes (≥768 52/r27/
gap 16 · <768 44/r22/gap 8), retired its visible label row, and named **the auth flow as
the exception to "read-only mobile web" (§4)**: it must be fully usable at 375, because an
invited member signs in on whatever they are holding. Code matches both.

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

## Decisions made during the build

_(when a ticket's report-back raises a question and you answer it, record the answer here.
If the answer is a rule that should hold everywhere, also add it to CLAUDE.md in the repo.)_

- `build` and `start` stay in `package.json` and in CLAUDE.md's Commands block.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on deliberately.
- Prettier `printWidth` 100.
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
- **`Database` types are generated from the live schema via the Supabase MCP server**, not the CLI
  — `supabase gen types --db-url` needs a container runtime this machine does not have.
  **Regenerate after every migration**; the clients are parameterised with them, so drift and typos
  both surface as `pnpm typecheck` failures rather than runtime nulls.

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

## Accounts and keys needed

- [x] Supabase project (URL, anon key, service role key)
- [ ] Anthropic and/or OpenAI API key — the workspace BYO key for the AI layer
- [ ] Notion internal integration (token + the pages/databases it can see)
- [ ] Figma personal access token
- [ ] Google Cloud OAuth client (Google sign-in, Drive watch) — deferred, not blocking
- [ ] Apple sign-in credentials — deferred, not blocking
- [ ] Vercel project — not yet
- [x] Resend — arrived at T0.4 as the Supabase SMTP sender for the OTP mail, not phase 6

Supabase and Playwright MCP servers are connected.
