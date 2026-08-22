import { pgEnum } from "drizzle-orm/pg-core";

/**
 * product-spec.md §4 — the seven item types, on one axis: what evidence the
 * item needs before development. A real Postgres enum rather than free text:
 * "one of seven" is a constraint the database should be able to state.
 */
export const itemType = pgEnum("item_type", [
  "feature",
  "enhancement",
  "technical",
  "content",
  "experiment",
  "fix",
  "spike",
]);

/** product-spec.md §7.1–7.5 — the artifact packs an item can carry. */
export const artifactKind = pgEnum("artifact_kind", [
  "brief",
  "prd",
  "tech_spec",
  "design_package",
  "backlog",
]);

/** product-spec.md §14 — workspace-level roles. */
export const memberRole = pgEnum("member_role", ["owner", "product", "developer", "viewer"]);

/**
 * product-spec.md §2 — "The agent is a first-class actor." Two kinds, so an
 * agent action is a positive assertion rather than the absence of a human.
 */
export const actorKind = pgEnum("actor_kind", ["human", "agent"]);

/** What set an action off. §2 requires actor, timestamp and trigger on each. */
export const activityTrigger = pgEnum("activity_trigger", [
  "user",
  "agent",
  "schedule",
  "webhook",
  "sync",
]);
