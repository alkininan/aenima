import { z } from "zod";

import { ESCALATES_TO, canEscalate } from "./router";
import type {
  AiFailure,
  AiRequest,
  AiResult,
  CallUsage,
  Provider,
  ScorerRequest,
  Tier,
} from "./types";

/**
 * The call itself: schema in, typed value out, one retry and no more.
 *
 * Separate from `index.ts` and free of `server-only` because everything here is
 * pure given a `Provider` — which is what lets it be tested against a fake
 * transport rather than the network. The module that reads keys and writes
 * meter rows is the one that has to be server-only.
 *
 * §12, exactly: "A routine-tier output that fails schema validation retries
 * once on mid — robustness, not optimization." One retry. Then a typed failure.
 * Never a third attempt, and never a silent fallback to unvalidated text.
 */

/** Adds the two token counts of two calls, so an escalation reports both. */
export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Parse and validate, in one step that can only fail one way.
 *
 * A provider that returned malformed JSON and one that returned well-formed
 * JSON of the wrong shape are the same event from here: the answer is not the
 * thing that was asked for. Both become `schema-invalid`, and neither becomes
 * a value.
 */
export type Validated<T> = { ok: true; value: T } | { ok: false; detail: string };

export function validate<T>(schema: z.ZodType<T>, text: string): Validated<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, detail: `not JSON: ${error instanceof Error ? error.message : error}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, detail: z.prettifyError(result.error) };
  }
  return { ok: true, value: result.data };
}

/**
 * JSON Schema for the wire, from the caller's zod schema.
 *
 * `io: "output"` because this describes what the model must produce, and
 * draft-2020-12 because both providers document their schema support against
 * it. `additionalProperties: false` and a full `required` list come out of zod
 * by default, which is what OpenAI's strict mode demands.
 */
export function jsonSchemaOf(schema: z.ZodType<unknown>): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" }) as Record<
    string,
    unknown
  >;
}

type Attempt<T> =
  { ok: true; value: T; usage: CallUsage } | { ok: false; failure: AiFailure; usage: CallUsage };

async function attempt<T>(
  provider: Provider,
  model: string,
  request: AiRequest<T> | ScorerRequest<T>,
  jsonSchema: Record<string, unknown>,
): Promise<Attempt<T>> {
  const response = await provider.send({
    model,
    purpose: request.purpose,
    context: request.context,
    input: request.input,
    jsonSchema,
    maxTokens: request.maxTokens,
  });

  if (!response.ok) return { ok: false, failure: response.failure, usage: response.usage };

  const validated = validate(request.schema, response.text);
  if (!validated.ok) {
    return {
      ok: false,
      usage: response.usage,
      failure: { kind: "schema-invalid", retryable: false, detail: validated.detail },
    };
  }

  return { ok: true, value: validated.value, usage: response.usage };
}

/**
 * One call at one tier, with §12's single escalation.
 *
 * The escalation fires on a schema failure and on nothing else. An outage is
 * not a reason to spend more on a bigger model, and a refusal is not a reason
 * to ask a second time — those are the caller's problem, and `retryable` is how
 * this layer tells it which one it has.
 *
 * `tierFor` rather than a `tier` field on the request: the scoring entry point
 * passes a model with no tier to speak of, and this signature is what lets both
 * share the retry logic without giving scoring a tier it could be routed on.
 */
export async function callAtTier<T>(
  provider: Provider,
  tier: Tier,
  request: AiRequest<T>,
): Promise<AiResult<T> & { usage: CallUsage; tier: Tier }> {
  const jsonSchema = jsonSchemaOf(request.schema);
  const model = provider.modelFor(tier);

  const first = await attempt(provider, model, request, jsonSchema);
  if (first.ok) {
    return {
      ok: true,
      value: first.value,
      provider: provider.id,
      model,
      tier,
      usage: first.usage,
      escalatedFrom: null,
    };
  }

  // Everything except a schema failure stops here — including a schema failure
  // on a tier that has nowhere to escalate to.
  if (first.failure.kind !== "schema-invalid" || !canEscalate(tier)) {
    return { ok: false, failure: first.failure, usage: first.usage, tier };
  }

  const escalatedTier: Tier = ESCALATES_TO;
  const escalatedModel = provider.modelFor(escalatedTier);
  const second = await attempt(provider, escalatedModel, request, jsonSchema);
  const usage = addUsage(first.usage, second.usage);

  if (second.ok) {
    return {
      ok: true,
      value: second.value,
      provider: provider.id,
      model: escalatedModel,
      tier: escalatedTier,
      usage,
      escalatedFrom: tier,
    };
  }

  // Two attempts, and that is the end of it. The failure returned is the second
  // one, because it is the more recent account of what went wrong.
  return { ok: false, failure: second.failure, usage, tier: escalatedTier };
}

/**
 * A scoring call, against the model §5 pins.
 *
 * **No tier parameter, by construction.** The pinned model arrives from
 * `workspace_ai_credential.scorer_model` and there is no argument that could
 * substitute a cheaper one, no fallback, and no escalation — `callAtTier`'s
 * retry is unreachable from here because this does not call it.
 *
 * A scoring answer that fails its schema is a scoring failure. Retrying it on a
 * different model would be exactly the cost-driven model change §5 forbids, and
 * it would produce a score stamped with a model that is not the pinned one.
 */
export async function callPinned<T>(
  provider: Provider,
  pinnedModel: string,
  request: ScorerRequest<T>,
): Promise<AiResult<T> & { usage: CallUsage; tier: Tier }> {
  const jsonSchema = jsonSchemaOf(request.schema);
  const only = await attempt(provider, pinnedModel, request, jsonSchema);

  if (only.ok) {
    return {
      ok: true,
      value: only.value,
      provider: provider.id,
      model: pinnedModel,
      // §12 puts scoring on the analysis tier; the meter groups by it. The
      // *model* still comes from the pin, which is the point.
      tier: "analysis",
      usage: only.usage,
      escalatedFrom: null,
    };
  }

  return { ok: false, failure: only.failure, usage: only.usage, tier: "analysis" };
}
