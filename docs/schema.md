# aenima — database schema

The persistence layer behind product-spec.md §2's object tree. Postgres on
Supabase; Drizzle owns the table definitions and migrations, RLS owns access.

Referenced from CLAUDE.md. Change the schema files, run `pnpm db:generate`, and
update this page in the same commit.

---

## Invariants

These four are load-bearing. Each is enforced by the database, not by
convention — a rule that lives only in TypeScript gets broken by the first
script that talks to Postgres directly.

**1. `artifact_version`, `activity`, `decision`, `ai_usage`, `scoring_run`,
`scoring_check_result` and `scoring_check_not_asked` are append-only.**
No UPDATE, no DELETE, ever. New content is a new row with an incrementing
`version_no`. Three independent layers enforce it, because the first two have a
hole the third closes:

| Layer | Stops | Hole |
|---|---|---|
| RLS — no UPDATE/DELETE policy exists | signed-in users | service role holds `BYPASSRLS` |
| Grants — `REVOKE UPDATE, DELETE` from `anon`, `authenticated` | the same | same |
| Trigger — `app.deny_mutation()` raises | **everyone**, service role included | must be disabled explicitly, out of band |

`artifact_version → artifact` is `ON DELETE RESTRICT`, not CASCADE: a cascade
would delete version rows through the back door, and append-only that a parent
delete can launder is not append-only. The practical consequence is that an
artifact with versions cannot be deleted, and therefore neither can its item,
product or workspace. That is intended for an audit-grade ledger; archival is a
later ticket.

Rollback is §11's revert-as-new-version — restoring v4 inserts v7 carrying v4's
content. History never rewrites, so a signature always points at a version that
still exists.

**An append-only table cannot carry `ON DELETE SET NULL`, or any FK that blocks
its parent.** Nulling a column is an UPDATE, which the trigger refuses, so a
`SET NULL` reference makes the *parent* undeletable — and it fails at delete
time with an append-only error that names the child, which reads like a bug in
the wrong table. `NO ACTION` and `RESTRICT` do not make the parent deletable
either — they reject the delete outright — but they reject it *legibly*, which
is why `RESTRICT` is the right shape wherever the reference has to stay (see
below). `CASCADE` is refused by the trigger for the same reason `SET NULL` is,
and would launder rows out of the ledger if it ever succeeded.

So the actor columns — `activity.actor_user_id` and
`artifact_version.authored_by_user_id` — carry **no foreign key at all**. They
hold the uuid of whoever acted as a recorded fact, which is what a ledger is
for: the auth user can be deleted and the row does not move. The cost is
accepted deliberately — nothing stops a write naming a user id that never
existed, and a reader joining to `auth.users` must tolerate a missing row.
Resolving an actor to a *name* after deletion needs a snapshot taken at write
time; that is deferred, see the open questions in `docs/build-log.md`.

Mutable tables are unaffected: `product.decider_user_id` (`SET NULL`) and
`membership.user_id` (`CASCADE`) both work, because only `activity`,
`artifact_version` and `decision` carry `app.deny_mutation()`. The rule is not
"never reference `auth.users`" — it is "an append-only table's references must
not require the ledger to change".

**Where an append-only table does keep a parent reference, it is `RESTRICT`.**
That is the only shape that fails legibly. `CASCADE` is refused by the trigger,
because a cascade is a DELETE; `SET NULL` is refused for the same reason, and on
a composite foreign key it is worse still, since `SET NULL` nulls *every*
referencing column — including `workspace_id`, which is `NOT NULL`. Both
surface as an append-only error naming the child, from a delete the caller aimed
at a parent. `RESTRICT` surfaces as a foreign-key error naming the constraint
and the table that actually holds the reference. `decision` uses it for all four
of its parents, `activity` was corrected to it in `0004`, and
`artifact_version → artifact` was already this shape.

The practical consequence is unchanged and intended: a workspace or product
carrying ledger rows cannot be deleted. Archival is a later ticket.

**Applied migration files are immutable, for the same reason.** Once a
migration has run anywhere, its bytes never change — not for a typo, not for a
renamed path in a comment. A correction is a new migration. Postgres does not
enforce this one: `scripts/db-baseline.ts` hashes each file's raw bytes to
decide what is already recorded, so editing an applied file makes it stop
matching the baseline it already passed. `drizzle/0003`'s comment still names
`docs/aenima-build-log.md`, renamed since; the stale path is the cheaper half
of the trade.

**2. There is no status column.**
Not in any table. Stage is derived from which artifacts exist and what they
score (product-spec.md §3). A test asserts that no `status`, `stage` or `state`
column exists anywhere in `public`.

The derivation lives in **`src/lib/stage.ts`** and nowhere else — not in a
column, not in a view, not in a function. `deriveStage()` takes an item's
artifacts with their version counts and returns one of §3's four stages:

| Evidence | Stage |
|---|---|
| nothing, or no PRD with content | Discover |
| PRD with at least one version | Define |
| design package with at least one version | Design |
| signed packet | Handed over (terminal) |

Two things about it are deliberate. An `artifact` row with **zero versions
advances nothing** — an artifact row is identity, and §3 keys its stages on the
artifact existing as content, so opening an empty PRD does not move an item.
And the handover branch is **unreachable**: there is no packet table yet, so
`StageInput.signedPacket` is typed `never` rather than `boolean`. A boolean
would claim the signature is observable and currently false; `never` says it
cannot be observed at all, which is the truth until §8's packet ships.

It is TypeScript rather than SQL because Phase 2 feeds it readiness scores that
live in the app layer, because it must be unit-testable without a database —
and because a SQL derivation would mean a view column named `stage`, which the
first-law test above would catch. The test is telling you where derivation
belongs.

This is also why `gap`'s lifecycle column is `disposition` and not `state`. A
gap's lifecycle is *declared* by a human — §5's three negotiation moves are the
act of declaring it — which is the opposite of a derived stage. The name keeps
the guard blunt rather than asking it for an exception.

**3. Every table carries `workspace_id`, and RLS enforces it independently.**
Product isolation is a security boundary. Two mechanisms, deliberately
redundant:

- **RLS** on all eleven tables, `ENABLE` **and** `FORCE`. A verb with no policy
  is denied; the missing policies are deliberate, not oversights — `gap` has no
  DELETE policy because §5's answer to a gap that should not exist is
  `excluded`, and `decision` has neither UPDATE nor DELETE because it is a
  ledger.
- **Composite foreign keys.** Every child references its parent as
  `(workspace_id, id)`, never bare `id`. A plain FK would let a row in workspace
  A point at a parent in workspace B while carrying A's `workspace_id`, and RLS
  — which only reads `workspace_id` — would happily serve it. The composite form
  makes cross-tenant stitching structurally impossible even with RLS off.

`workspace` itself carries no `workspace_id`: its own `id` is the tenant key.

**4. Every mutating action writes an `activity` row, and the agent is a
first-class actor.**
`actor_kind` is `'human' | 'agent'` and is required; a CHECK forces exactly one
identity column to be populated per kind. An agent action is a positive
assertion, never a null `user_id`.

---

## Tables

| Table | Purpose |
|---|---|
| `workspace` | The tenant. One per account; holds name, timezone and locale. |
| `membership` | Who belongs to a workspace, in which role, and whether they see all products. |
| `membership_product` | Per-product visibility for members who do not have `all_products`. |
| `product` | The isolation and permission boundary. Names its Decider (§14). |
| `opportunity` | A problem or outcome that outlives individual bets. |
| `item` | A unit of work moving through the stages. May be unlinked from any opportunity. |
| `artifact` | The stable identity of an artifact on an item — one row per kind. |
| `artifact_version` | Immutable content. Append-only; `version_no` assigned by trigger. |
| `gap` | A failed check with the evidence it quoted. Mutable — §5's negotiation moves are transitions on it. |
| `decision` | "Decision, reason, date, who" (§13). Append-only; corrections supersede. |
| `activity` | The ledger: actor, timestamp, trigger, subject. Append-only. |
| `workspace_ai_credential` | §12's key, as a pointer into Supabase Vault, plus §5's pinned scorer model. |
| `ai_usage` | The meter: token counts and a rate-card id per call, never money. Append-only. |
| `scoring_run` | One run: artifact version, rubric version, protocol version, provider, model, earned out of denominator. Append-only. |
| `scoring_check_result` | One check's verdict inside a run, with the quote behind a failure. Append-only. |
| `scoring_check_not_asked` | Its sibling: one check §4 took out of the run's denominator, and the condition that did it. Append-only. |

### Enums

| Type | Values | Source |
|---|---|---|
| `item_type` | feature · enhancement · technical · content · experiment · fix · spike | §4, the seven types |
| `artifact_kind` | brief · prd · tech_spec · design_package · backlog | §7.1–7.5 |
| `member_role` | owner · product · developer · viewer | §14 |
| `actor_kind` | human · agent | §2 |
| `activity_trigger` | user · agent · schedule · webhook · sync | §2 |
| `flow_intent` | value · quality · risk · debt | §4, the Flow Framework tag |
| `gap_tag` | must · should | §5, what each check is tagged |
| `gap_disposition` | open · accepted · excluded · closed | §5, the gap lifecycle. `closed` is the only value a machine writes |
| `ai_provider` | anthropic · openai | §12, the certified providers |
| `ai_tier` | routine · analysis · generation | §12, the three intra-provider tiers |
| `ai_outcome` | ok · schema_invalid · refused · unavailable · rate_limited · rejected | §12, how a call ended |

`item_type` is a real Postgres enum rather than free text: "one of seven" is a
constraint the database should be able to state.

---

## Access

| Path | Client | RLS |
|---|---|---|
| Request path (pages, actions, route handlers) | `src/lib/supabase/server.ts` | **enforced** as the signed-in user |
| Browser | `src/lib/supabase/client.ts` | **enforced** |
| Schema, migrations, seed | Drizzle over `DATABASE_URL` (`src/db/client.ts`) | **bypassed** |
| Escape hatch | `src/lib/supabase/admin.ts` | **bypassed** |

Both bypassing modules import `server-only`, so pulling either into client code
is a build error rather than a review comment. Nothing in the request path uses
the service-role key today: first-run workspace creation goes through
`public.bootstrap_workspace()`, a `SECURITY DEFINER` function, precisely so that
key never has to be in play.

All database access lives in `src/db/queries/*` per CLAUDE.md, whatever the
driver underneath.

### Policy summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `workspace` | member | — (bootstrap only) | owner | — |
| `membership` | member | owner | owner | owner |
| `membership_product` | member | owner | owner | owner |
| `product` | member + visible | owner | owner | owner |
| `opportunity` | member + visible | owner, product | owner, product | owner, product |
| `item` | member + visible | owner, product | owner, product | owner, product |
| `artifact` | member + visible | owner, product; developer for `tech_spec` | — | owner, product |
| `artifact_version` | member + visible | as `artifact` | **never** | **never** |
| `gap` | member + visible | owner, product | owner, product | **none** |
| `decision` | member + visible | owner, product | **never** | **never** |
| `activity` | member + visible | owner, product, developer | **never** | **never** |
| `workspace_ai_credential` | **owner only**, minus `vault_secret_id` | owner | owner | — |
| `ai_usage` | **owner only** | **none** — written server-side | **never** | **never** |
| `scoring_run` | member + visible | **none** — written server-side | **never** | **never** |
| `scoring_check_result` | member + visible (through its run) | **none** — written server-side | **never** | **never** |
| `scoring_check_not_asked` | member + visible (through its run) | **none** — written server-side | **never** | **never** |

Viewer appears in no write policy anywhere: §14 read-only means read-only.

Helper functions live in the `app` schema — `workspace_ids()`, `role_in()`,
`can_see_product()` — and are `SECURITY DEFINER` on purpose. A policy on
`membership` that reads `membership` recurses forever; a definer function
bypasses RLS on its own read, so the policy terminates. Each pins its
`search_path`. `authenticated` has `USAGE` on `app` and nothing more; `anon` has
nothing.

---

## Migrations

`drizzle/0000_object_tree.sql` — tables, enums, keys, indexes, generated from
the schema files.

`drizzle/0001_policies.sql` — hand-written: `auth.users` foreign keys, the `app`
helper functions, the append-only and version-numbering triggers, RLS on every
table with the policy set above, and `bootstrap_workspace`. Hand-written because
it is the security boundary and because Drizzle's DSL cannot express it.

`drizzle/0002_bootstrap_returns_workspace.sql` — `bootstrap_workspace` returns
the workspace row it settled on and is idempotent under a per-user advisory
lock, so no caller has to read back what it just wrote.

`drizzle/0003_ledger_actor_is_a_fact.sql` — drops the `auth.users` foreign keys
from `activity.actor_user_id` and `artifact_version.authored_by_user_id`, per
invariant 1.

`drizzle/0004_gap_decision_flow_intent.sql` — hand-written like 0001: the `gap`
and `decision` tables, `item.flow_intent`, their RLS policies, and `activity`'s
two parent FKs corrected to `RESTRICT`.

`drizzle/0005_item_keys.sql` — hand-written: `product.key_prefix` and `item.key`,
backfilled, plus `app.assign_item_key()`. Keys come from the database and never
from the client, exactly as `version_no` does.

`drizzle/0006_activity_subject_index.sql` — an index on
`(workspace_id, subject_table, subject_id, occurred_at desc)`, so one item's feed
comes out of an index rather than a workspace-wide scan.

`drizzle/0007_ai_layer.sql` — hand-written: `workspace_ai_credential` and
`ai_usage`, their RLS, and the column grant that hides `vault_secret_id` from
the request path. The key itself is in Supabase Vault, not in this database's
`public` schema.

`drizzle/0008_scoring_run.sql` — hand-written: `scoring_run` and
`scoring_check_result` (both append-only, both server-side-write-only),
`artifact.next_scoring_attempt_at` for §5's queue, and `gap_disposition` gaining
`closed`. The enum is **replaced rather than extended**: Postgres forbids using
a value added by `ALTER TYPE … ADD VALUE` in the transaction that added it, and
`drizzle-kit migrate` runs every pending migration inside one transaction — so
adding the value and then writing a constraint that names it works on a database
where this migration lands alone and fails on a fresh one.

`drizzle/0009_check_constraints_are_not_null.sql` — two CHECK constraints that
did not hold. A CHECK rejects a row only when its expression is **FALSE**, and
`length(btrim(NULL)) > 0` is NULL, which passes. Both
`scoring_check_result_evidence_shape` and the inherited `gap_resolution_shape`
gain explicit `is not null` guards.

`drizzle/0010_protocol_version.sql` — `scoring_run.protocol_version`, and the
cache key gains it. The pack versions the rubric; this versions the protocol
wrapped around it (`src/lib/scoring/prompt.ts`), which changes verdicts just as
surely and was covered by nothing. The default is added and then dropped:
`scoring_run` is append-only, so a backfill UPDATE would be refused by its own
trigger, while `ADD COLUMN … NOT NULL DEFAULT` fills existing rows without
firing one.

The column holds `` `${release}+${digest}` `` — `1.1.0+602d20db225ee669`, semver
build-metadata shape, 22 characters against the constraint's 40. The release is
what a human reads and groups by (`where protocol_version like '1.1.0%'`); the
digest is sha-256 over everything in `src/lib/scoring/prompt.ts` that reaches the
model — `PROTOCOL`, and the output of `renderPack`, `renderCheck` and
`renderArtifact`. It is computed rather than typed so that editing a renderer
invalidates the cache whether or not anyone remembered to bump anything. No
migration: the shape of a text column's contents is the application's business,
and rows stamped with the old bare semver simply miss the cache and re-score,
which is what a protocol change is for.

`drizzle/0011_scoring_check_not_asked.sql` — the sibling of
`scoring_check_result`. Between them a run holds one row per check the rubric
contained at run time: verdicts on one side, the checks §4 renormalized out on
the other, each with the condition that kept it out. T2.4 derived that second
half at render time from the pack that ships *today*, which meant a rubric edit
could change what an old run said it did not ask — the page explaining a stored
denominator of 99 with a set of checks that no longer adds up to it. The
argument is `scoring_check_result`'s own, one table over: §5 versions rubrics
like documents, so `tag`, `points` and now the condition are copied rather than
looked up. Not named `excluded`, which is `gap_disposition`'s word for a person
arguing a check away with their name on it (§5's first negotiation move); this
is the applicability engine answering in the pass that scores. **Nothing is
backfilled**: a run written before this table lists its verdicts, stops short of
the rubric, and says so in one line rather than letting the list read as
complete — the missing lines are never reconstructed from the pack that ships
today. See build-log open question 19, which also carries the line's deletion.

```
pnpm db:generate   # diff the schema files into a new migration
pnpm db:migrate    # apply pending migrations to DATABASE_URL
pnpm db:baseline   # once per environment: record migrations already applied by hand
pnpm db:seed       # one workspace, two products, three opportunities, eleven items
pnpm score:smoke   # score the seeded Ghost mode PRD with the workspace's key
```

The seed is **idempotent**: it finds the workspace by name and stops, and the
steps that arrived after the first seeds ran top up an existing workspace rather
than needing a fresh one.

### Seeing the seed as yourself — `DEV_SEED_EMAIL`

The seed's Owner is `seed-owner@aenima.test`, an account nobody can sign in as.
Sign in with your own address and you get a workspace of your own and see none of
this. Setting `DEV_SEED_EMAIL` adds that account to the seed workspace as an
Owner, after which RLS shows you everything in it:

```
DEV_SEED_EMAIL=you@example.com pnpm db:seed
```

It does nothing unless the variable is set, does nothing under
`NODE_ENV=production`, and does nothing if no account has that address — all
three are silent, and none of them fails the seed. **It can only ever add a
member to the workspace the seed itself created**, which is the part worth
relying on: there is no input that would grant anyone access to a real
workspace.

**One caveat, and it bites on any machine where you signed in before seeding.**
`getCurrentWorkspace()` takes the *oldest* workspace you are a member of, and
there is no workspace switcher yet — which workspace a member of several lands
in has no deliberate answer yet (build log, open question 8). If signing in
created a workspace for you before the seed workspace existed, membership alone
will not change what `/app` shows: you will still land in your own, empty one.

**Deleting that workspace does not work, by design.** `activity_workspace_fk` is
`RESTRICT` and `activity` refuses DELETE beneath it, so a workspace that has ever
recorded anything cannot be removed — which is the ledger being load-bearing
rather than a bug. Drop *your membership* of it instead. The workspace and its
history stay; you simply stop being able to see it, and the seed workspace
becomes the oldest you can:

```sql
delete from membership m using auth.users u
 where m.user_id = u.id and u.email = 'you@example.com'
   and m.workspace_id = '<the workspace you want out of>';
```

Reversible: re-insert the row with `role = 'owner'` and `all_products = true`.

**Never `drizzle-kit push` here.** The policies above are not expressible in the
schema DSL, so push cannot see them in `src/db/schema/*` and plans to
`DROP POLICY … CASCADE` every one of them. Migrations are the only path.

`DATABASE_URL` must be a **session-mode or direct** connection (port 5432). The
transaction pooler on 6543 cannot run this DDL.

---

## Verifying the invariants

`src/db/rls.db.test.ts` proves isolation and append-only against a real
Postgres, impersonating users the way PostgREST does (`set local role
authenticated` plus `request.jwt.claims`), inside transactions that roll back.

It **skips when `DATABASE_URL` is absent** and says so loudly on stderr. A green
`pnpm test` without that variable has not verified any of this.
