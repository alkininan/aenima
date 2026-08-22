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

**1. `artifact_version`, `activity` and `decision` are append-only.**
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
| `gap_disposition` | open · accepted · excluded | §5, the gap lifecycle |

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

```
pnpm db:generate   # diff the schema files into a new migration
pnpm db:migrate    # apply pending migrations to DATABASE_URL
pnpm db:baseline   # once per environment: record migrations already applied by hand
pnpm db:seed       # one workspace, product, opportunity, and seven items
```

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
