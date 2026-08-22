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

import { actorKind, activityTrigger, artifactKind, itemType, memberRole } from "./enums";

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
    /** §14: each product names a Decider; null falls back to the Owner. */
    deciderUserId: authUsersId("decider_user_id"),
    ...timestamps,
  },
  (t) => [
    unique("product_workspace_slug").on(t.workspaceId, t.slug),
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
    title: text("title").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("item_workspace_id").on(t.workspaceId, t.id),
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
    check(
      "activity_actor_shape",
      sql`(${t.actorKind} = 'human' and ${t.actorUserId} is not null and ${t.actorAgent} is null)
       or (${t.actorKind} = 'agent' and ${t.actorAgent} is not null and ${t.actorUserId} is null)`,
    ),
  ],
);
