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
    check(
      "gap_resolution_shape",
      sql`(${t.disposition} = 'open'
             and ${t.resolvedByUserId} is null and ${t.resolvedAt} is null
             and ${t.resolutionNote} is null)
       or (${t.disposition} in ('accepted','excluded')
             and ${t.resolvedByUserId} is not null and ${t.resolvedAt} is not null
             and length(btrim(${t.resolutionNote})) > 0)`,
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
