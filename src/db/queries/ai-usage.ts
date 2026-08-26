import "server-only";

import { sharedDbClient } from "@/db/client";
import { spendOf, cardById } from "@/lib/ai/pricing";
import type { CallUsage, Outcome, ProviderId, Tier } from "@/lib/ai/types";

/**
 * The usage meter — product-spec.md §12 and §15.
 *
 * Writes go over the direct connection, never from a browser: `ai_usage` has no
 * INSERT policy at all, deliberately. A client that could write its own meter
 * row could under-report itself, and §12 has the Owner paying the bill for
 * everyone else's calls.
 *
 * The row records token counts and the id of the rate card in force. It does
 * not record money — see `src/lib/ai/pricing.ts` for why that is arithmetic
 * rather than storage, and why a price change means a new card id.
 */

export type UsageActor =
  | { kind: "human"; userId: string }
  /** §2's first-class agent: a sweep, a webhook, a scheduled re-score. */
  | { kind: "agent"; name: string };

export type UsageEntry = {
  workspaceId: string;
  productId: string | null;
  actor: UsageActor;
  provider: ProviderId;
  model: string;
  tier: Tier;
  purpose: string;
  usage: CallUsage;
  escalatedFrom: Tier | null;
  outcome: Outcome;
  latencyMs: number;
  rateCard: string;
};

/**
 * Records one call. Every call, including the ones that failed.
 *
 * A failed call still costs tokens sometimes and costs none other times, and
 * both facts belong in the meter: an outage that burned half a rubric's input
 * tokens before timing out is spend, and a meter that only counted successes
 * would under-report it.
 */
export async function recordUsage(entry: UsageEntry): Promise<void> {
  const { sql } = sharedDbClient();

  await sql`
    insert into ai_usage (
      workspace_id, product_id, actor_kind, actor_user_id, actor_agent,
      provider, model, tier, purpose,
      uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
      escalated_from, outcome, latency_ms, rate_card
    ) values (
      ${entry.workspaceId},
      ${entry.productId},
      ${entry.actor.kind}::actor_kind,
      ${entry.actor.kind === "human" ? entry.actor.userId : null},
      ${entry.actor.kind === "agent" ? entry.actor.name : null},
      ${entry.provider}::ai_provider,
      ${entry.model},
      ${entry.tier}::ai_tier,
      ${entry.purpose},
      ${entry.usage.uncachedInputTokens},
      ${entry.usage.cacheReadTokens},
      ${entry.usage.cacheWriteTokens},
      ${entry.usage.outputTokens},
      ${entry.escalatedFrom}::ai_tier,
      ${entry.outcome}::ai_outcome,
      ${entry.latencyMs},
      ${entry.rateCard}
    )
  `;
}

/** One row as the meter reads it back. */
export type UsageRow = {
  tier: Tier;
  model: string;
  rateCard: string;
  actorUserId: string | null;
  escalatedFrom: Tier | null;
  usage: CallUsage;
};

/**
 * Every call in a window, for the meter to aggregate.
 *
 * Rows rather than a `sum()` in SQL on purpose: spend is `tokens × the card
 * that row was billed at`, and a database sum would have to either join a price
 * table that does not exist there or assume one card for the whole window. The
 * aggregation lives in `src/lib/ai/meter.ts`, where the cards are.
 *
 * Unpaginated, like the list surface, and for a comparable reason: a workspace's
 * meter is bounded by its own traffic. Open question 7's warning applies here
 * too — when this stops being acceptable the answer is a date range, not a bare
 * LIMIT that silently drops the oldest spend in the period.
 */
export async function listUsage(workspaceId: string, since: Date): Promise<UsageRow[]> {
  const { sql } = sharedDbClient();

  const rows = await sql<
    Array<{
      tier: Tier;
      model: string;
      rate_card: string;
      actor_user_id: string | null;
      escalated_from: Tier | null;
      uncached_input_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      output_tokens: number;
    }>
  >`
    select tier, model, rate_card, actor_user_id, escalated_from,
           uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens
      from ai_usage
     where workspace_id = ${workspaceId} and occurred_at >= ${since}
     order by occurred_at desc
  `;

  return rows.map((row) => ({
    tier: row.tier,
    model: row.model,
    rateCard: row.rate_card,
    actorUserId: row.actor_user_id,
    escalatedFrom: row.escalated_from,
    usage: {
      uncachedInputTokens: row.uncached_input_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      outputTokens: row.output_tokens,
    },
  }));
}

/** One row's spend, at the card it was billed at rather than today's. */
export function spendOfRow(row: UsageRow): number | null {
  const card = cardById(row.rateCard);
  if (!card) return null;
  return spendOf(card, row.model, row.usage);
}
