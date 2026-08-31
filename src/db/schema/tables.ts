import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import {
  actorKind,
  activityTrigger,
  aiOutcome,
  aiProvider,
  aiTier,
  artifactKind,
  flowIntent,
  gapDisposition,
  gapTag,
  itemType,
  memberRole,
} from "./enums";

/**
 * The object tree of product-spec.md §2: workspace → product → opportunity →
 * item, plus membership, artifacts and the activity ledger.
 *
 * Three rules run through every table here and are stated once:
 *
 * 1. **Every table carries `workspace_id`** and every child references its
 *    parent as `(workspace_id, id)` rather than bare `id`. A plain foreign key
 *    would let a row in workspace A point at a parent in workspace B while
 *    carrying A's `workspace_id`, and RLS — which only reads `workspace_id` —
 *    would serve it. The composite form makes cross-tenant stitching
 *    structurally impossible, independent of RLS.
 * 2. **There is no status column.** Stage is computed from which artifacts
 *    exist and what they score (§3).
 * 3. **Timestamps are UTC** (`timestamptz`); the workspace timezone is a
 *    render-time concern.
 *
 * RLS policies, the append-only triggers and the bootstrap function live in
 * `drizzle/0001_policies.sql` — they are SQL that Drizzle's schema DSL cannot
 * express, and they are the security boundary, so they are written by hand.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** auth.users lives in Supabase's schema; referenced by id, never mirrored. */
const authUsersId = (name: string) => uuid(name);

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** CLAUDE.md: store UTC, render in the workspace timezone. */
    timezone: text("timezone").notNull().default("UTC"),
    /** product-spec.md §12: EN/TR/NL. */
    locale: text("locale").notNull().default("en"),
    ...timestamps,
  },
  // The workspace's own id is the tenant key, so it carries no workspace_id.
  (t) => [
    check("workspace_name_len", sql`length(btrim(${t.name})) between 1 and 120`),
    check("workspace_locale", sql`${t.locale} in ('en','tr','nl')`),
  ],
);

export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: authUsersId("user_id").notNull(),
    role: memberRole("role").notNull(),
    /** §14: per-product visibility toggles. True skips the join table. */
    allProducts: boolean("all_products").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("membership_workspace_user").on(t.workspaceId, t.userId),
    index("membership_user_idx").on(t.userId),
    index("membership_workspace_idx").on(t.workspaceId),
  ],
);

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /**
     * The prefix every one of this product's item keys carries — `soc` in
     * `soc-12`.
     *
     * Its own column rather than the first few letters of `slug`, because two
     * products can slug to the same prefix (`sociera` and `social` both give
     * `soc`) and item keys are unique per workspace. Deriving would make the
     * second product's first item fail to insert. Separate from `slug` for a
     * second reason: renaming a product changes its slug, and a key that has
     * been pasted into a ticket or said out loud must not change with it.
     */
    keyPrefix: text("key_prefix").notNull(),
    /** §14: each product names a Decider; null falls back to the Owner. */
    deciderUserId: authUsersId("decider_user_id"),
    ...timestamps,
  },
  (t) => [
    unique("product_workspace_slug").on(t.workspaceId, t.slug),
    // Keys are unique per workspace, so their prefixes must be too.
    unique("product_workspace_key_prefix").on(t.workspaceId, t.keyPrefix),
    // Anchor for the composite foreign keys below.
    unique("product_workspace_id").on(t.workspaceId, t.id),
    index("product_workspace_idx").on(t.workspaceId),
    check("product_name_len", sql`length(btrim(${t.name})) between 1 and 120`),
    check("product_slug_shape", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,62}$'`),
  ],
);

/** §14: which products a member without `all_products` can see. */
export const membershipProduct = pgTable(
  "membership_product",
  {
    workspaceId: uuid("workspace_id").notNull(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => membership.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.productId] }),
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "membership_product_product_fk",
    }).onDelete("cascade"),
    index("membership_product_workspace_idx").on(t.workspaceId, t.productId),
  ],
);

export const opportunity = pgTable(
  "opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    ...timestamps,
  },
  (t) => [
    unique("opportunity_workspace_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "opportunity_product_fk",
    }).onDelete("cascade"),
    index("opportunity_product_idx").on(t.workspaceId, t.productId),
    check("opportunity_title_len", sql`length(btrim(${t.title})) between 1 and 200`),
  ],
);

export const item = pgTable(
  "item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    /** §2: an item may be unlinked from any opportunity — advisory, never a block. */
    opportunityId: uuid("opportunity_id"),
    type: itemType("type").notNull(),
    /**
     * §4: assigned by the same classification call that proposes the type, and
     * invisible in daily use — it exists for the flow-distribution view. Null
     * until that classifier ships, which is a real state and not a default: an
     * unclassified item is not a "value" item.
     */
    flowIntent: flowIntent("flow_intent"),
    /**
     * What people call this item out loud — `soc-12`. The product's key prefix
     * plus a per-product counter.
     *
     * Assigned by `app.assign_item_key()` on insert and never by the client,
     * the same discipline as `artifact_version.version_no`: a client that could
     * choose could collide, and a key is a name rather than a preference. The
     * unique constraint below is the backstop against the concurrent-insert
     * race that a MAX+1 counter leaves open.
     */
    key: text("key").notNull(),
    title: text("title").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("item_workspace_id").on(t.workspaceId, t.id),
    unique("item_workspace_key").on(t.workspaceId, t.key),
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "item_product_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.opportunityId],
      foreignColumns: [opportunity.workspaceId, opportunity.id],
      name: "item_opportunity_fk",
    }).onDelete("set null"),
    index("item_product_idx").on(t.workspaceId, t.productId),
    index("item_opportunity_idx").on(t.workspaceId, t.opportunityId),
    check("item_title_len", sql`length(btrim(${t.title})) between 1 and 200`),
  ],
);

/** The stable identity of an artifact. Its content lives in its versions. */
export const artifact = pgTable(
  "artifact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    itemId: uuid("item_id").notNull(),
    kind: artifactKind("kind").notNull(),
    /**
     * §5: "Provider outages queue scoring silently; the timestamp does the
     * honest work." When a scoring run fails on a *retryable* provider failure
     * this is when to try again, and null the rest of the time.
     *
     * It lives here rather than on `scoring_run` because a failed run writes no
     * row at all — no partial score, no half-reconciled gaps — so there is
     * nothing to hang it off. The artifact is the thing that gets re-scored, and
     * §13's "scored 6 h ago — retrying" reads the last run's timestamp and this
     * field, both without a join.
     *
     * A non-retryable failure never sets it: §5 queues outages, and a pinned
     * model that answered off-schema is a quality signal §15 reads out of the
     * `ai_usage` row the seam already wrote. **This ticket writes and clears the
     * field; the scheduler that reads it is Phase 4** (§5's webhook, debounce
     * and nightly sweep are one piece of machinery and belong together).
     */
    nextScoringAttemptAt: timestamp("next_scoring_attempt_at", { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    unique("artifact_workspace_id").on(t.workspaceId, t.id),
    unique("artifact_item_kind").on(t.itemId, t.kind),
    foreignKey({
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [item.workspaceId, item.id],
      name: "artifact_item_fk",
    }).onDelete("cascade"),
    index("artifact_item_idx").on(t.workspaceId, t.itemId),
  ],
);

/**
 * Append-only. Never UPDATE, never DELETE — new content is a new row with an
 * incrementing version_no, assigned by trigger rather than by the client.
 * §11: rollback is revert-as-new-version, so history never rewrites and a
 * signature always points at a version that still exists.
 *
 * The link to `artifact` is ON DELETE RESTRICT, not CASCADE: a cascade would
 * delete version rows through the back door, and append-only that a parent
 * delete can launder is not append-only.
 *
 * There is deliberately no `updated_at`. A row that can never change has none.
 */
export const artifactVersion = pgTable(
  "artifact_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    /** Assigned by `app.assign_version_no()`; the unique index is the backstop. */
    versionNo: integer("version_no").notNull(),
    content: jsonb("content").notNull(),
    /** §11: content-hash per block drives sync diffing. */
    contentHash: text("content_hash").notNull(),
    authoredByKind: actorKind("authored_by_kind").notNull(),
    authoredByUserId: authUsersId("authored_by_user_id"),
    authoredByAgent: text("authored_by_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    unique("artifact_version_no").on(t.artifactId, t.versionNo),
    // What a child references. Every foreign key in this schema is
    // `(workspace_id, id)`, and `scoring_run` is the first table to point here.
    unique("artifact_version_workspace_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.artifactId],
      foreignColumns: [artifact.workspaceId, artifact.id],
      name: "artifact_version_artifact_fk",
    }).onDelete("restrict"),
    index("artifact_version_artifact_idx").on(t.workspaceId, t.artifactId),
    index("artifact_version_current_idx").on(t.artifactId, t.versionNo.desc()),
    check("artifact_version_no_positive", sql`${t.versionNo} > 0`),
    check(
      "artifact_version_actor_shape",
      sql`(${t.authoredByKind} = 'human' and ${t.authoredByUserId} is not null and ${t.authoredByAgent} is null)
       or (${t.authoredByKind} = 'agent' and ${t.authoredByAgent} is not null and ${t.authoredByUserId} is null)`,
    ),
  ],
);

/**
 * §2: "Every mutating action — human or agent — records its actor, timestamp,
 * and trigger. The agent is a first-class actor."
 *
 * `actor_kind` is required and the check forces exactly one identity column per
 * kind, so an agent action is asserted rather than inferred from a null user.
 * Append-only for the same reason artifact versions are: a ledger that accepts
 * UPDATE is not a ledger.
 *
 * `trigger_source`, not `trigger` — TRIGGER is a reserved SQL keyword.
 */
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Null for workspace-level actions that belong to no product. */
    productId: uuid("product_id"),
    actorKind: actorKind("actor_kind").notNull(),
    actorUserId: authUsersId("actor_user_id"),
    actorAgent: text("actor_agent"),
    action: text("action").notNull(),
    triggerSource: activityTrigger("trigger_source").notNull(),
    subjectTable: text("subject_table").notNull(),
    subjectId: uuid("subject_id").notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "activity_product_fk",
    }).onDelete("set null"),
    index("activity_workspace_time_idx").on(t.workspaceId, t.occurredAt.desc()),
    /**
     * One subject's ledger, which is what an item page reads.
     *
     * The workspace-and-time index above answers "what happened here lately"
     * and nothing else: a feed for one item filtered on `subject_table` and
     * `subject_id` scans every row in the workspace and throws almost all of
     * them away. `occurred_at` is the trailing column so the newest-first order
     * comes out of the index rather than out of a sort.
     */
    index("activity_subject_idx").on(
      t.workspaceId,
      t.subjectTable,
      t.subjectId,
      t.occurredAt.desc(),
    ),
    check(
      "activity_actor_shape",
      sql`(${t.actorKind} = 'human' and ${t.actorUserId} is not null and ${t.actorAgent} is null)
       or (${t.actorKind} = 'agent' and ${t.actorAgent} is not null and ${t.actorUserId} is null)`,
    ),
  ],
);

/**
 * product-spec.md §5 — a failed check, quoting the exact gap it found.
 *
 * **Mutable, deliberately.** The three negotiation moves of §5 are state
 * transitions on this row: "doesn't apply here" removes the check, "already
 * covered" re-runs it against evidence, and "we accept this risk" converts the
 * gap to `accepted` stamped with the accepter's name. A gap that could not
 * change would make the whole protocol unrepresentable. Each transition writes
 * an `activity` row, which is where the history §15 calls load-bearing lives —
 * the gap holds the current answer, the ledger holds how it got there.
 *
 * `disposition`, not `state`: see the enum. `check_id` is free text until
 * rubric packs arrive in Phase 2.
 */
export const gap = pgTable(
  "gap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    checkId: text("check_id").notNull(),
    tag: gapTag("tag").notNull(),
    disposition: gapDisposition("disposition").notNull().default("open"),
    /** §5: "a failure quotes the exact gap" — evidence, not a verdict. */
    evidence: text("evidence").notNull(),
    /**
     * §5 stamps accepted and excluded gaps with the accepter. No foreign key to
     * `auth.users`, matching the ledger's actor: this is a historical stamp, and
     * an account being deleted must not erase who accepted a risk. Deliberately
     * unlike `product.decider_user_id`, where nulling on delete is correct
     * because a decider is a *current* assignment rather than a record.
     */
    resolvedByUserId: authUsersId("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    ...timestamps,
  },
  (t) => [
    unique("gap_workspace_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [item.workspaceId, item.id],
      name: "gap_item_fk",
    }).onDelete("cascade"),
    index("gap_item_idx").on(t.workspaceId, t.itemId),
    check("gap_check_len", sql`length(btrim(${t.checkId})) between 1 and 120`),
    check("gap_evidence_len", sql`length(btrim(${t.evidence})) between 1 and 2000`),
    // An open gap carries no stamp; a resolved one carries all three parts of
    // it. The shape is a constraint rather than a convention, the same way the
    // actor shape is on `activity`.
    // Four arms since T2.3. `closed` is the machine's: a time, no name, no note.
    // The `is not null` guards are load-bearing — a CHECK whose expression is
    // NULL passes, so `length(btrim(null)) > 0` forbids nothing (0009).
    check(
      "gap_resolution_shape",
      sql`(${t.disposition} = 'open'
             and ${t.resolvedByUserId} is null and ${t.resolvedAt} is null
             and ${t.resolutionNote} is null)
       or (${t.disposition} in ('accepted','excluded')
             and ${t.resolvedByUserId} is not null and ${t.resolvedAt} is not null
             and ${t.resolutionNote} is not null and length(btrim(${t.resolutionNote})) > 0)
       or (${t.disposition} = 'closed'
             and ${t.resolvedByUserId} is null and ${t.resolvedAt} is not null
             and ${t.resolutionNote} is null)`,
    ),
  ],
);

/**
 * product-spec.md §13 — "decision, reason, date, who".
 *
 * **Append-only**, for the same reason `activity` is. §8 makes the packet a
 * frozen coordinate carrying "the decision-log extract", and says nothing
 * signed is ever cleaner than reality; a decision that could be edited after
 * signing would make that false. §15 calls history load-bearing, and §8 wants
 * "who agreed to ship without offline handling?" answerable forever.
 *
 * Correcting a decision is logging a new one that supersedes it — the same
 * revert-as-new-version shape §11 gives artifacts. `supersedes_id` is what
 * makes that queryable rather than a convention nobody can follow.
 *
 * **Every parent reference is `RESTRICT`.** An append-only table cannot carry
 * `SET NULL` (nulling is an UPDATE the trigger refuses) and cannot carry
 * `CASCADE` (a cascade is a DELETE, refused the same way). `RESTRICT` is the
 * only shape that fails legibly: a foreign-key error naming this table, rather
 * than an append-only error naming it from a delete the caller aimed elsewhere.
 * `artifact_version → artifact` is the same choice for the same reason.
 *
 * There is deliberately no `updated_at`. A row that can never change has none.
 */
export const decision = pgTable(
  "decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    /** Null when the decision attaches to the product rather than one item. */
    itemId: uuid("item_id"),
    statement: text("statement").notNull(),
    reason: text("reason").notNull(),
    /** No foreign key, as on `gap` and the ledger: this is a record, not a link. */
    decidedByUserId: authUsersId("decided_by_user_id").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    unique("decision_workspace_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId],
      foreignColumns: [workspace.id],
      name: "decision_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "decision_product_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [item.workspaceId, item.id],
      name: "decision_item_fk",
    }).onDelete("restrict"),
    // Self-reference: a correction points at the decision it replaces. Same
    // composite shape and same RESTRICT as every other parent here.
    foreignKey({
      columns: [t.workspaceId, t.supersedesId],
      foreignColumns: [t.workspaceId, t.id],
      name: "decision_supersedes_fk",
    }).onDelete("restrict"),
    index("decision_product_idx").on(t.workspaceId, t.productId, t.decidedAt.desc()),
    index("decision_item_idx").on(t.workspaceId, t.itemId),
    check("decision_statement_len", sql`length(btrim(${t.statement})) between 1 and 2000`),
    check("decision_reason_len", sql`length(btrim(${t.reason})) between 1 and 2000`),
    check("decision_not_self", sql`${t.supersedesId} is distinct from ${t.id}`),
  ],
);

/**
 * product-spec.md §12 — the workspace's AI credential and the model §5 pins.
 *
 * **The key itself is not here.** It lives in Supabase Vault, and this row
 * holds `vault_secret_id`, a pointer that is worthless without a grant on the
 * `vault` schema — which `authenticated` and `anon` do not have, on this
 * project or on any Supabase project by default. That grant table is the real
 * boundary: a signed-in member cannot read a key through PostgREST even if
 * every policy we wrote were wrong. The policies in `drizzle/0007_ai_layer.sql`
 * are the second wall (Owner-only, per §14) and the column grant is the third,
 * so `vault_secret_id` is unreadable even to the Owner through the request path.
 *
 * One row per workspace, because §12 has one provider active at a time.
 *
 * `scorer_model` is §5's pin — "the scoring model is pinned per workspace and
 * never juggled for cost". Set when the key is set, and changed only when the
 * provider changes, which §5 says triggers a re-baseline. It is a column rather
 * than a lookup for exactly that reason: a pin that recomputed itself from the
 * tier map would move the day the map moved.
 */
export const workspaceAiCredential = pgTable(
  "workspace_ai_credential",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    /** `vault.secrets.id`. Never selected by anything that can reach a browser. */
    vaultSecretId: uuid("vault_secret_id").notNull(),
    /** Last four characters. The only part of a key anyone is ever shown. */
    keyHint: text("key_hint").notNull(),
    scorerModel: text("scorer_model").notNull(),
    /**
     * A recorded fact, not a foreign key — migration 0003's rule for the
     * ledger, and it holds here for the same reason: who set the key stays
     * answerable after the account is deleted.
     */
    createdByUserId: authUsersId("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    check("workspace_ai_credential_hint_len", sql`length(${t.keyHint}) between 2 and 8`),
    check(
      "workspace_ai_credential_model_len",
      sql`length(btrim(${t.scorerModel})) between 1 and 120`,
    ),
  ],
);

/**
 * product-spec.md §12 and §15 — the usage meter: "spend per tier and per
 * member", plus the escalation-to-mid rate, which §15 calls "the quality
 * early-warning light" rather than a cost statistic.
 *
 * The fourth append-only ledger, enforced the same three ways as
 * `artifact_version` and `activity`: no UPDATE or DELETE policy, an explicit
 * REVOKE, and a trigger. A meter that could be edited would be a meter nobody
 * could invoice from.
 *
 * The actor columns are `activity`'s, with its check: a nightly sweep is an
 * agent action asserted positively, not a human row with a null user.
 *
 * **Token counts, not money.** Four counts, exactly as the providers report
 * them once the adapter has normalized them, plus the id of the rate card in
 * force at the time. Spend is that multiplication, done in code — §12's own
 * code node law, since "counting and arithmetic each have exactly one correct
 * answer" — and history stays stable because a price change means a new card
 * id, never an edit to an old one.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Null for workspace-level work that belongs to no product. */
    productId: uuid("product_id"),
    actorKind: actorKind("actor_kind").notNull(),
    actorUserId: authUsersId("actor_user_id"),
    actorAgent: text("actor_agent"),
    provider: aiProvider("provider").notNull(),
    model: text("model").notNull(),
    tier: aiTier("tier").notNull(),
    /** What the call was for. §12 routes on the tier; the meter reports on this. */
    purpose: text("purpose").notNull(),
    uncachedInputTokens: integer("uncached_input_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    /**
     * The tier this call started on, when §12's one schema retry moved it. Null
     * on every call that did not escalate, so the rate §15 wants is a count of
     * non-nulls over a count of routine calls — arithmetic, in code.
     */
    escalatedFrom: aiTier("escalated_from"),
    outcome: aiOutcome("outcome").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    /** Which price list was in force. Cards are immutable; see `src/lib/ai/pricing.ts`. */
    rateCard: text("rate_card").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.productId],
      foreignColumns: [product.workspaceId, product.id],
      name: "ai_usage_product_fk",
    }).onDelete("set null"),
    // The meter's own read: one workspace, newest first.
    index("ai_usage_workspace_time_idx").on(t.workspaceId, t.occurredAt.desc()),
    // §12's per-member attribution, and §15's per-tier spend.
    index("ai_usage_member_idx").on(t.workspaceId, t.actorUserId, t.occurredAt.desc()),
    index("ai_usage_tier_idx").on(t.workspaceId, t.tier, t.occurredAt.desc()),
    check(
      "ai_usage_actor_shape",
      sql`(${t.actorKind} = 'human' and ${t.actorUserId} is not null and ${t.actorAgent} is null)
       or (${t.actorKind} = 'agent' and ${t.actorAgent} is not null and ${t.actorUserId} is null)`,
    ),
    check(
      "ai_usage_tokens_nonneg",
      sql`${t.uncachedInputTokens} >= 0 and ${t.cacheReadTokens} >= 0
      and ${t.cacheWriteTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.latencyMs} >= 0`,
    ),
    check("ai_usage_purpose_len", sql`length(btrim(${t.purpose})) between 1 and 60`),
  ],
);

/**
 * product-spec.md §5 — one scoring run: an artifact version, a rubric, and what
 * the pinned scorer said about it.
 *
 * **The fifth append-only ledger**, after `artifact_version`, `activity`,
 * `decision` and `ai_usage`, enforced the same three ways: no UPDATE or DELETE
 * policy, an explicit REVOKE, and `app.deny_mutation()` as a trigger that the
 * service role cannot bypass either. Runs are history — §5's re-baseline "so
 * numbers never wobble without explanation" is only answerable if the old
 * numbers are still there to compare against, and a run that could be edited
 * would make "scored 4 min ago" a claim about nothing.
 *
 * **There is no score column.** The run stores `earned` and `denominator`,
 * which are facts, and the score is `earned / denominator × 100` — arithmetic
 * over them, and §12's code node law puts arithmetic in code. It is the same
 * refusal `ai_usage` makes about money for a related reason: a stored quotient
 * is a second copy of a derived fact, and the two can disagree. `scoreRun()` in
 * `src/packs/scoring.ts` is the one place that divides.
 *
 * **The unique index is the cache.** §5: "Results cache per artifact version;
 * only checks whose artifact changed re-run." An artifact version is immutable,
 * so one version scored against one rubric version can only ever have produced
 * one run, and the database says so rather than the code path remembering to.
 * Asking twice cannot return two different scores.
 *
 * Provider and model are stamped but deliberately **not** in that key: §5 makes
 * a model or rubric change trigger a deliberate re-baseline pass, and a key
 * that included the model would instead re-score the whole workspace silently
 * the moment a pin moved.
 */
export const scoringRun = pgTable(
  "scoring_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    /** Denormalized from the artifact so RLS and the item's history read it directly. */
    itemId: uuid("item_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    artifactVersionId: uuid("artifact_version_id").notNull(),
    /** §5: "Every scoring run stamps provider + model + rubric version." */
    packId: text("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    /**
     * The other half of the prompt — `src/lib/scoring/prompt.ts`'s protocol.
     *
     * The pack versions the rubric; this versions the instruction wrapped around
     * it, which changes verdicts just as surely. It is in the cache key for that
     * reason: a protocol edit has to invalidate a stored run, or one artifact
     * carries two numbers produced by two different questions.
     */
    protocolVersion: text("protocol_version").notNull(),
    provider: aiProvider("provider").notNull(),
    /** The pinned model that actually ran, never a tier-map lookup. */
    model: text("model").notNull(),
    /** §4's conditions that held, as the model answered them in the scoring pass. */
    conditionsMet: text("conditions_met").array().notNull(),
    earned: integer("earned").notNull(),
    /** §5's renormalized denominator — what the applicable checks were worth. */
    denominator: integer("denominator").notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("scoring_run_workspace_id").on(t.workspaceId, t.id),
    // §5's cache, as a constraint rather than a convention.
    // Every input that decides a verdict is in here: the text scored, the
    // rubric, and the protocol that asked. Provider and model are deliberately
    // *not* — §5 makes those a re-baseline someone runs, not a silent re-score.
    unique("scoring_run_cache_key").on(
      t.workspaceId,
      t.artifactVersionId,
      t.packId,
      t.packVersion,
      t.protocolVersion,
    ),
    // RESTRICT on every parent, because an append-only table cannot carry a
    // cascade: a cascade is a DELETE and the trigger refuses it. v1 ships no
    // delete UI, which is the same trade `artifact_version → artifact` makes.
    foreignKey({
      columns: [t.workspaceId],
      foreignColumns: [workspace.id],
      name: "scoring_run_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [item.workspaceId, item.id],
      name: "scoring_run_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.artifactId],
      foreignColumns: [artifact.workspaceId, artifact.id],
      name: "scoring_run_artifact_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.artifactVersionId],
      foreignColumns: [artifactVersion.workspaceId, artifactVersion.id],
      name: "scoring_run_version_fk",
    }).onDelete("restrict"),
    // "What is this item's freshness" — newest run per artifact, §13's clock.
    index("scoring_run_artifact_idx").on(t.workspaceId, t.artifactId, t.scoredAt.desc()),
    index("scoring_run_item_idx").on(t.workspaceId, t.itemId, t.scoredAt.desc()),
    check("scoring_run_earned_nonneg", sql`${t.earned} >= 0`),
    check("scoring_run_denominator_positive", sql`${t.denominator} > 0`),
    // A run cannot earn more than it was scored out of. The one arithmetic
    // invariant the database can state without knowing what a rubric is.
    check("scoring_run_earned_bounded", sql`${t.earned} <= ${t.denominator}`),
    check("scoring_run_pack_len", sql`length(btrim(${t.packId})) between 1 and 120`),
    check("scoring_run_pack_version_len", sql`length(btrim(${t.packVersion})) between 1 and 40`),
    check(
      "scoring_run_protocol_version_len",
      sql`length(btrim(${t.protocolVersion})) between 1 and 40`,
    ),
  ],
);

/**
 * One check's verdict inside a run — §5: "Checks are binary with evidence. A
 * check passes or fails, and a failure quotes the exact gap."
 *
 * Append-only, like its run, and `RESTRICT` to it for the same reason.
 *
 * Only *applicable* checks get a row. §4 has non-applicable checks leave the
 * denominator, and a row for one would be a verdict about a check that was not
 * being asked, sitting in the table a meter expands into.
 *
 * `tag` and `points` are **copied from the pack as it was at run time**, not
 * looked up. §5 versions rubrics like documents, so a run has to stay readable
 * against the rubric that produced it — a lookup would re-price last month's
 * run through this month's rubric and call it history.
 *
 * The three evidence columns are the parts, stored apart:
 *
 * - `requirementId` — the PRD's own label for the story the gap lives at
 *   (`MN-2`), which §7.2 keeps in a different id space from `check_id`.
 * - `quote` — verbatim from the artifact. Verified to occur in it before the
 *   run is written; §1 law 3 is "evidence or nothing" and an invented quote is
 *   worse than no score. Null only for an absence, where there is nothing to
 *   cite because the thing is missing.
 * - `note` — the reading. Null exactly when the check passed.
 *
 * `gap.evidence` is one text column, so the three are rendered into §5's own
 * sentence shape at the boundary. Rendering is code; storing the parts is what
 * lets it be re-rendered when the surface wants them apart.
 */
export const scoringCheckResult = pgTable(
  "scoring_check_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    /** A rubric check id (`prd-19`), never a requirement id. */
    checkId: text("check_id").notNull(),
    tag: gapTag("tag").notNull(),
    points: integer("points").notNull(),
    passed: boolean("passed").notNull(),
    requirementId: text("requirement_id"),
    quote: text("quote"),
    note: text("note"),
  },
  (t) => [
    unique("scoring_check_result_run_check").on(t.workspaceId, t.runId, t.checkId),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [scoringRun.workspaceId, scoringRun.id],
      name: "scoring_check_result_run_fk",
    }).onDelete("restrict"),
    index("scoring_check_result_run_idx").on(t.workspaceId, t.runId),
    // §15 counts which checks fail across a workspace; this is that read.
    index("scoring_check_result_check_idx").on(t.workspaceId, t.checkId, t.passed),
    check("scoring_check_result_points_positive", sql`${t.points} > 0`),
    check("scoring_check_result_check_len", sql`length(btrim(${t.checkId})) between 1 and 120`),
    // §5's binary law, as a constraint: a failure carries a reading, and a pass
    // carries none. Evidence or nothing, in the shape the database can hold.
    // `is not null` before the length test, and not merely for tidiness: a CHECK
    // rejects a row only when its expression is FALSE, and `length(btrim(null))
    // > 0` is NULL. Without the guard this constraint accepts the one row it
    // exists to forbid — see drizzle/0009.
    check(
      "scoring_check_result_evidence_shape",
      sql`(${t.passed} and ${t.note} is null and ${t.quote} is null and ${t.requirementId} is null)
       or (not ${t.passed} and ${t.note} is not null and length(btrim(${t.note})) > 0)`,
    ),
    check(
      "scoring_check_result_quote_len",
      sql`${t.quote} is null or length(btrim(${t.quote})) between 1 and 2000`,
    ),
  ],
);

/**
 * One check the run did **not** ask, and the condition that kept it out — §4's
 * renormalization, stored rather than re-derived.
 *
 * The sibling of `scoring_check_result`: between them they hold every check the
 * rubric contained at run time, one row each, which is exactly the list §8's
 * meter expands into. Verdicts on one side, the checks §4 removed on the other.
 *
 * **Why this is a table and not arithmetic done at read time.** The denominator
 * is 99 rather than 100 because these rows exist, and §1 law 3 makes a number
 * that cannot be interrogated something that does not ship — so the explanation
 * has to be as durable as the number it explains. Re-deriving it from today's
 * pack looks equivalent and is not: a rubric edit moves a check in or out of the
 * excluded set without touching the run, and the page would then explain a
 * stored 99 with a set of checks that no longer adds up to it. §5 versions
 * rubrics like documents; a run has to stay readable against the one that
 * produced it, and that is the same argument `scoring_check_result` makes for
 * copying `tag` and `points` rather than looking them up.
 *
 * `tag` and `points` are copied for that reason, and are what the check was
 * worth *had it been asked* — the run's denominator does not contain them.
 *
 * `conditionId` and `conditionWhen` are the condition that did not hold, both
 * of it: the id so §15 can count how often a condition removes a check, and the
 * sentence so the surface can say why in the rubric's own words years later.
 * **The sentence is written affirmatively** — "The feature renders a list, so it
 * has empty and first-use states." — and it is stored here because it was
 * *false* of this artifact. Negating it belongs to the surface (`src/i18n`), not
 * to this column; see `src/packs/scoring.ts`.
 *
 * Not the same word as `gap_disposition`'s `excluded`, deliberately. That is
 * §5's first negotiation move — a person arguing a check away, with their name
 * on it. This is the applicability engine answering in the pass that scores, and
 * no one decided anything. The surface says "not asked" for the same reason.
 */
export const scoringCheckNotAsked = pgTable(
  "scoring_check_not_asked",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    /** A rubric check id (`prd-15`), never a requirement id. */
    checkId: text("check_id").notNull(),
    /** What it would have been worth. Not in the run's denominator. */
    tag: gapTag("tag").notNull(),
    points: integer("points").notNull(),
    /** §4's condition id, as `packConditions` names it. */
    conditionId: text("condition_id").notNull(),
    /** The condition's sentence, verbatim from the pack that ran. */
    conditionWhen: text("condition_when").notNull(),
  },
  (t) => [
    unique("scoring_check_not_asked_run_check").on(t.workspaceId, t.runId, t.checkId),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [scoringRun.workspaceId, scoringRun.id],
      name: "scoring_check_not_asked_run_fk",
    }).onDelete("restrict"),
    index("scoring_check_not_asked_run_idx").on(t.workspaceId, t.runId),
    // §5's learning loop: "when a workspace repeatedly accepts or excludes the
    // same check, the agent proposes a rubric change". This is the read that
    // counts how often a condition takes a check out of the denominator.
    index("scoring_check_not_asked_condition_idx").on(t.workspaceId, t.conditionId),
    check("scoring_check_not_asked_points_positive", sql`${t.points} > 0`),
    check("scoring_check_not_asked_check_len", sql`length(btrim(${t.checkId})) between 1 and 120`),
    check(
      "scoring_check_not_asked_condition_len",
      sql`length(btrim(${t.conditionId})) between 1 and 120`,
    ),
    // The reason is the whole point of the row, so it may not be blank. `is not
    // null` is redundant against a NOT NULL column and is left out; 0009's
    // lesson was about a *nullable* column, where `length(btrim(null)) > 0` is
    // NULL and a CHECK accepts what it exists to forbid.
    check(
      "scoring_check_not_asked_condition_when_len",
      sql`length(btrim(${t.conditionWhen})) between 1 and 2000`,
    ),
  ],
);
