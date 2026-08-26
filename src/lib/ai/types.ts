import type { z } from "zod";

import type { Database } from "@/db/database.types";

/**
 * The seam every AI call in the product goes through — product-spec.md §12.
 *
 * Nothing above this layer knows which provider answered. A call names its tier
 * and its purpose, hands over a prompt and a schema, and gets back a typed
 * result plus what it cost. That is the whole contract, and it is small on
 * purpose: the difference between the two certified providers — structured
 * outputs, caching semantics, token accounting — is absorbed inside the
 * adapters. If a provider's awkwardness ever needs a field here, the seam is
 * wrong rather than the provider being difficult.
 *
 * No prompts live in this file or any file beside it. A prompt is content and
 * belongs to the skill pack that owns it (§7).
 */

export type ProviderId = Database["public"]["Enums"]["ai_provider"];
export type Tier = Database["public"]["Enums"]["ai_tier"];
export type Outcome = Database["public"]["Enums"]["ai_outcome"];

/**
 * §12's three tiers, in order. Exported as data because the meter groups by
 * them and a hand-written list in two places is a list that disagrees with
 * itself.
 */
export const TIERS = ["routine", "analysis", "generation"] as const;

/**
 * What a call is for. §12 routes on the tier; §15's meter reports on this.
 *
 * A closed union rather than free text: the purpose is also half of the prompt
 * cache key, and a typo would silently open a second cache.
 */
export type Purpose =
  /** §10's router: classify by product, split by type. Routine. */
  | "classify"
  /** §12: the English working copy, and EN/TR/NL rendering. Routine. */
  | "translate"
  /** §4's applicability engine: which checks and layers are in play. Routine. */
  | "applicability"
  /** §5: the artifact against its rubric. Always the pinned scorer. */
  | "score"
  /** §5: the exact gap a failed check quotes. Always the pinned scorer. */
  | "evidence"
  /** §6: the author drafting from what exists. Generation. */
  | "draft"
  /** §6: the next unanswered interview question. Generation. */
  | "question"
  /** §11: a spec patch. Generation. */
  | "patch";

/** The purposes §5 pins. Scoring never routes on a tier — see `router.ts`. */
export const SCORER_PURPOSES = ["score", "evidence"] as const;
export type ScorerPurpose = (typeof SCORER_PURPOSES)[number];

/**
 * Everything else — the purposes that *do* route on a tier.
 *
 * The exclusion is the other half of §5's pin, and the half that is easy to
 * miss. `runScorer` having no tier parameter stops a scoring call from being
 * routed *down*; this stops one from going in through the tier-routed door in
 * the first place, where it would run on Haiku and still meter as
 * `purpose: "score"`. Both doors have to be shut, and only one of them is
 * guarded by the shape of a function signature.
 */
export type TierPurpose = Exclude<Purpose, ScorerPurpose>;

/**
 * One call's request, minus the model — which the router decides and the caller
 * cannot.
 *
 * `context` and `input` are two fields rather than one string because §12 wants
 * prompt caching "structured in from day one": the stable prefix has to be
 * separable from the part that changes, or there is nothing for a provider to
 * cache. `context` is the rubric, the pack, the instructions — whatever repeats
 * across calls. `input` is this artifact, this fragment, this answer.
 */
export type AiRequest<T> = {
  /**
   * Never a scoring purpose. §5's pinned model is reachable only through
   * `runScorer`, so `"score"` and `"evidence"` are not expressible here — see
   * `TierPurpose`.
   */
  purpose: TierPurpose;
  /** The stable prefix. Cached where the provider can cache it. */
  context: string;
  /** The part that changes per call. Always last in the request. */
  input: string;
  /**
   * The shape of the answer.
   *
   * Zod is the single source of truth: the TypeScript type, the JSON Schema
   * sent to the provider (`z.toJSONSchema`), and the runtime validation of what
   * came back are all this one value. **No optional fields** — OpenAI's strict
   * mode requires every property in `required`, so absent is spelled
   * `.nullable()`. See docs/build-log.md.
   */
  schema: z.ZodType<T>;
  maxTokens: number;
};

/** A scoring request. Note what it does not have: a tier. */
export type ScorerRequest<T> = Omit<AiRequest<T>, "purpose"> & { purpose: ScorerPurpose };

/**
 * The four token counts, normalized.
 *
 * The providers do not agree on what `input_tokens` means: Anthropic's excludes
 * anything served from cache, OpenAI's includes it and reports the cached share
 * as a detail. Both arrive here as the same four numbers, which is the adapter
 * absorbing a difference rather than the seam leaking one.
 *
 * `cacheWriteTokens` is Anthropic-only as a *price*: OpenAI's automatic caching
 * has no write charge, so its adapter reports zero. Zero because it genuinely
 * costs zero, not because the number is unknown.
 */
export type CallUsage = {
  /** Input tokens billed at the base rate — everything not served from cache. */
  uncachedInputTokens: number;
  /** Input tokens served from cache, billed at a fraction of base. */
  cacheReadTokens: number;
  /** Input tokens written into the cache, billed above base. Zero on OpenAI. */
  cacheWriteTokens: number;
  outputTokens: number;
};

export const NO_USAGE: CallUsage = {
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

/**
 * Why a call did not produce a value.
 *
 * `retryable` is the whole point of the distinction, and it is what §5's
 * "provider outages queue scoring silently; the timestamp does the honest work"
 * needs from this layer. **This layer does not queue and does not schedule** —
 * it says whether queueing is the right answer, and the caller decides. See
 * docs/build-log.md for where the scheduler lives.
 */
export type AiFailure =
  /** 5xx, timeout, connection refused. The provider is having a bad day. */
  | { kind: "unavailable"; retryable: true; detail: string }
  /** 429. `retryAfterMs` is the provider's own number when it sent one. */
  | { kind: "rate-limited"; retryable: true; detail: string; retryAfterMs: number | null }
  /** The answer did not match the schema, after §12's one retry. Never a third. */
  | { kind: "schema-invalid"; retryable: false; detail: string }
  /** The model declined. Not an outage and not our bug. */
  | { kind: "refused"; retryable: false; detail: string }
  /** No key set for this workspace. §12: the Owner holds it. */
  | { kind: "no-credential"; retryable: false; detail: string }
  /** 4xx: a bad key, a bad request. Retrying changes nothing. */
  | { kind: "rejected"; retryable: false; detail: string };

export type AiSuccess<T> = {
  ok: true;
  value: T;
  provider: ProviderId;
  model: string;
  tier: Tier;
  usage: CallUsage;
  /**
   * The tier the call started on, when §12's one schema retry moved it. Null on
   * every call that did not escalate. §15 reads the rate of this being non-null
   * as "the quality early-warning light".
   */
  escalatedFrom: Tier | null;
};

export type AiResult<T> = AiSuccess<T> | { ok: false; failure: AiFailure };

/** How a result lands in the meter. One place, so the mapping cannot drift. */
export function outcomeOf<T>(result: AiResult<T>): Outcome {
  if (result.ok) return "ok";
  switch (result.failure.kind) {
    case "schema-invalid":
      return "schema_invalid";
    case "refused":
      return "refused";
    case "unavailable":
      return "unavailable";
    case "rate-limited":
      return "rate_limited";
    case "no-credential":
    case "rejected":
      return "rejected";
  }
}

/**
 * What an adapter is handed, and what it gives back.
 *
 * The model is already decided: an adapter never chooses one, which is half of
 * why §5's pin cannot be overridden for cost. The other half is that no
 * function anywhere takes a pinned model and a fallback.
 */
export type ResolvedRequest = {
  model: string;
  purpose: Purpose;
  context: string;
  input: string;
  /** JSON Schema, produced from the caller's zod schema by the seam. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
};

/** Raw text plus counts. Validation happens above, in one place, for both. */
export type ProviderResponse =
  | { ok: true; text: string; usage: CallUsage }
  | { ok: false; failure: AiFailure; usage: CallUsage };

export type Provider = {
  id: ProviderId;
  /** §12's tier map for this provider. No cross-provider juggling. */
  modelFor: (tier: Tier) => string;
  send: (request: ResolvedRequest) => Promise<ProviderResponse>;
};
