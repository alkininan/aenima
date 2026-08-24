import "server-only";

import { readApiKey } from "@/db/queries/ai-credential";
import { recordUsage, type UsageActor } from "@/db/queries/ai-usage";

import { createAnthropicProvider } from "./anthropic";
import { callAtTier, callPinned } from "./call";
import { createOpenAiProvider } from "./openai";
import { currentCard } from "./pricing";
import type { AiRequest, AiResult, Provider, ProviderId, ScorerRequest } from "./types";
import { NO_USAGE, outcomeOf } from "./types";

/**
 * The seam — product-spec.md §12. Every AI call in the product comes through
 * here, and nothing above knows which provider answered.
 *
 * `server-only`, so an AI call from a Client Component is a build error. Keys
 * are read here and handed straight to an adapter; they are never returned,
 * never logged, and never placed in a failure.
 *
 * Three entry points, and the difference between them is the whole of §5's pin:
 *
 * - `runRoutine` — §12's cheap tier, and the only one that can escalate.
 * - `runGeneration` — the top tier. Drafts, questions, patches.
 * - `runScorer` — **no tier parameter exists.** The model comes from
 *   `workspace_ai_credential.scorer_model` and there is no argument, flag or
 *   fallback that could substitute a cheaper one. "The scorer is pinned and
 *   never moved for cost" is not enforced by a rule here; it is enforced by
 *   there being no way to express the alternative.
 */

export type {
  AiFailure,
  AiRequest,
  AiResult,
  CallUsage,
  Purpose,
  ScorerRequest,
  Tier,
} from "./types";
export { TIERS } from "./types";
export { ANTHROPIC_MODELS, OPENAI_MODELS, modelFor, initialScorerModel } from "./router";
export { escalationRate, spendByMember, spendByTier, formatSpend } from "./meter";
export { currentCard, spendOf, cardById } from "./pricing";

/** Who the call is on behalf of, and what it is about. Straight to the meter. */
export type CallContext = {
  workspaceId: string;
  productId: string | null;
  actor: UsageActor;
};

function providerFor(id: ProviderId, apiKey: string): Provider {
  return id === "anthropic" ? createAnthropicProvider(apiKey) : createOpenAiProvider(apiKey);
}

const noCredential = <T>(): AiResult<T> => ({
  ok: false,
  failure: {
    kind: "no-credential",
    retryable: false,
    // Says what is missing and nothing about what would have been sent.
    detail: "this workspace has no AI key; §12 has the Owner set one",
  },
});

/**
 * Runs a call and meters it, whatever happened.
 *
 * The meter row is written for failures too: an outage that burned a rubric's
 * worth of input tokens before timing out is spend, and a meter that counted
 * only successes would under-report the bill §12 makes the Owner pay.
 *
 * A metering failure never fails the call. The value is already in hand and
 * throwing it away to report a bookkeeping problem would trade the thing the
 * user asked for against a number nobody is watching in real time.
 */
async function meter<T>(
  context: CallContext,
  run: (
    provider: Provider,
    credential: { scorerModel: string },
  ) => Promise<AiResult<T> & { usage: import("./types").CallUsage; tier: import("./types").Tier }>,
  purpose: string,
): Promise<AiResult<T>> {
  const credential = await readApiKey(context.workspaceId);
  if (!credential) return noCredential<T>();

  const provider = providerFor(credential.provider, credential.apiKey);
  const startedAt = Date.now();
  const result = await run(provider, credential);
  const latencyMs = Date.now() - startedAt;

  const usage = "usage" in result ? result.usage : NO_USAGE;
  const model = result.ok ? result.model : provider.modelFor(result.tier);

  try {
    await recordUsage({
      workspaceId: context.workspaceId,
      productId: context.productId,
      actor: context.actor,
      provider: credential.provider,
      model,
      tier: result.tier,
      purpose,
      usage,
      escalatedFrom: result.ok ? result.escalatedFrom : null,
      outcome: outcomeOf(result),
      latencyMs,
      rateCard: currentCard(credential.provider).id,
    });
  } catch (error) {
    // Written where a log aggregator sees it, without the request or the key.
    console.error(
      `ai: usage row not recorded for ${context.workspaceId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return result.ok
    ? {
        ok: true,
        value: result.value,
        provider: result.provider,
        model: result.model,
        tier: result.tier,
        usage: result.usage,
        escalatedFrom: result.escalatedFrom,
      }
    : { ok: false, failure: result.failure };
}

/**
 * §12's routine tier: intake classification, applicability, translation.
 *
 * The only entry point that can escalate, and it escalates exactly once, only
 * on a schema failure — "robustness, not optimization".
 */
export function runRoutine<T>(context: CallContext, request: AiRequest<T>): Promise<AiResult<T>> {
  return meter(context, (provider) => callAtTier(provider, "routine", request), request.purpose);
}

/** §12's top tier: drafts, questions, patches. Never escalates; it is the top. */
export function runGeneration<T>(
  context: CallContext,
  request: AiRequest<T>,
): Promise<AiResult<T>> {
  return meter(context, (provider) => callAtTier(provider, "generation", request), request.purpose);
}

/**
 * §5's pinned scorer.
 *
 * Look at the signature: there is no tier to pass. The model is the
 * workspace's, read from its credential row, and a schema failure here is a
 * scoring failure rather than a reason to try a different model — retrying on
 * one would be the cost-driven model change §5 forbids, and it would stamp the
 * run with a model that is not the pinned one.
 */
export function runScorer<T>(
  context: CallContext,
  request: ScorerRequest<T>,
): Promise<AiResult<T>> {
  return meter(
    context,
    (provider, credential) => callPinned(provider, credential.scorerModel, request),
    request.purpose,
  );
}
