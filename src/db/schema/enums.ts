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

/**
 * product-spec.md §4 — the flow-intent tag (Flow Framework). Auto-assigned by
 * the classifier in the same call that proposes the item type, invisible in
 * daily use, and read only by the flow-distribution analytics view. Nullable on
 * `item` until that classifier exists; a real enum because "one of four" is a
 * constraint the database should state.
 */
export const flowIntent = pgEnum("flow_intent", ["value", "quality", "risk", "debt"]);

/**
 * product-spec.md §5 — every check is tagged Must (blocks handover) or Should
 * (advisory). The tag rides on the gap the check produced.
 */
export const gapTag = pgEnum("gap_tag", ["must", "should"]);

/**
 * product-spec.md §5 — the gap lifecycle. Not named `state`: the first-law test
 * forbids `status`/`stage`/`state` anywhere in `public`, and that test is worth
 * more blunt than it is nuanced. A gap's lifecycle is genuinely *declared* by a
 * human — §5's three negotiation moves are exactly the act of declaring it —
 * which is the opposite of an item's stage, and `disposition` says so without
 * asking the guard to make an exception.
 */
export const gapDisposition = pgEnum("gap_disposition", ["open", "accepted", "excluded"]);

/**
 * product-spec.md §12 — the certified providers. "One provider is active at a
 * time; the Owner holds the key, pays the bill." A real enum because the set is
 * closed by certification: a provider is only usable once the golden set has
 * been run against it, which is a decision, not a string a workspace types.
 */
export const aiProvider = pgEnum("ai_provider", ["anthropic", "openai"]);

/**
 * §12's three intra-provider tiers: routine (intake classification,
 * applicability, translation) on the cheap model, analysis (scoring, evidence
 * extraction) on mid, generation (drafts, questions, patches) on top. "No
 * cross-provider juggling" — the tier names a rung within one provider, never a
 * provider.
 */
export const aiTier = pgEnum("ai_tier", ["routine", "analysis", "generation"]);

/**
 * How a call ended. `ok` and five ways not to.
 *
 * On the ledger rather than derived from the token counts because a failed call
 * still costs tokens sometimes and costs none other times, and "no tokens" is
 * not the same claim as "the provider refused".
 */
export const aiOutcome = pgEnum("ai_outcome", [
  "ok",
  "schema_invalid",
  "refused",
  "unavailable",
  "rate_limited",
  "rejected",
]);
