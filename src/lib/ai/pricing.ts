import type { CallUsage, ProviderId } from "./types";

/**
 * Rate cards, and spend as arithmetic — product-spec.md §12 and §15.
 *
 * §12's code node law: "if a transformation can be described without the words
 * judge, decide, assess or summarize, it is code". Multiplying tokens by a rate
 * is exactly that, so spend is computed here and never stored. What *is* stored
 * on every `ai_usage` row is the id of the card in force at the time, which is
 * what keeps history stable: a price change means a **new card id, never an
 * edit to an existing one**, so re-pricing tomorrow cannot rewrite what last
 * month cost.
 *
 * Every card carries its source URL and the date it was read, so verifying one
 * is a fetch rather than an investigation. Nothing detects a stale card — no
 * check can be written against a price page — which is recorded as an open
 * question in docs/build-log.md rather than pretended away.
 *
 * **Rates are integer micro-dollars per million tokens.** $5/MTok is 5_000_000.
 * Integers because money in floating point drifts, and because every published
 * rate lands exactly on this unit — $0.02/MTok is 20_000, not a rounding.
 */

/** Micro-dollars: 1_000_000 of them make a dollar. */
export type MicroDollars = number;

export type ModelRates = {
  /** Base input, per million tokens. */
  input: MicroDollars;
  /** Input served from cache. Anthropic: 0.1× base. OpenAI: 0.1× base. */
  cacheRead: MicroDollars;
  /**
   * Input written into the cache.
   *
   * Anthropic charges 1.25× base for a 5-minute write. OpenAI's caching is
   * automatic and has no write charge, so its cards carry 0 — a real zero, not
   * an unknown.
   */
  cacheWrite: MicroDollars;
  output: MicroDollars;
};

/**
 * A second price band above a prompt-size threshold.
 *
 * OpenAI has one: "prompts with >272K input tokens are priced at 2x input and
 * 1.5x output for the full request." Anthropic has none — its 1M context window
 * is billed at standard rates end to end — so its cards omit this and the
 * comparison below is a no-op there.
 */
export type LongContextBand = {
  /** Input tokens above which the whole request re-prices. */
  thresholdInputTokens: number;
  rates: ModelRates;
};

export type RateCard = {
  id: string;
  provider: ProviderId;
  /** Where these numbers came from. */
  source: string;
  /** When they were read off that page. */
  readAt: string;
  models: Record<string, ModelRates>;
  longContext?: Record<string, LongContextBand>;
};

/**
 * Anthropic, read 2026-08-24.
 *
 * Cache multipliers are the published ones: 1.25× base for a 5-minute write,
 * 0.1× base for a read. This layer writes 5-minute caches only — the 1-hour
 * form costs 2× to write and pays back only after two reads, which is a bet on
 * traffic shape nothing has measured yet.
 */
export const ANTHROPIC_2026_08: RateCard = {
  id: "anthropic-2026-08",
  provider: "anthropic",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  readAt: "2026-08-24",
  models: {
    "claude-haiku-4-5-20251001": {
      input: 1_000_000,
      cacheRead: 100_000,
      cacheWrite: 1_250_000,
      output: 5_000_000,
    },
    "claude-sonnet-5": {
      input: 2_000_000,
      cacheRead: 200_000,
      cacheWrite: 2_500_000,
      output: 10_000_000,
    },
    "claude-opus-5": {
      input: 5_000_000,
      cacheRead: 500_000,
      cacheWrite: 6_250_000,
      output: 25_000_000,
    },
  },
  // No long-context band: "Claude 4.6 and later models include the full 1M
  // token context window at standard pricing."
};

/**
 * OpenAI, read 2026-08-24.
 *
 * `cacheWrite` is 0 across the board: caching is automatic and there is no
 * write charge to pass on.
 *
 * The long-context band is the published second column, transcribed rather than
 * derived — though it does come out as exactly 2× input, 2× cached input and
 * 1.5× output for all three models, which is the multiplier the model pages
 * state.
 */
export const OPENAI_2026_08: RateCard = {
  id: "openai-2026-08",
  provider: "openai",
  source: "https://developers.openai.com/api/docs/pricing",
  readAt: "2026-08-24",
  models: {
    "gpt-5.6-luna": { input: 200_000, cacheRead: 20_000, cacheWrite: 0, output: 1_200_000 },
    "gpt-5.6-terra": { input: 2_000_000, cacheRead: 200_000, cacheWrite: 0, output: 12_000_000 },
    "gpt-5.6-sol": { input: 4_000_000, cacheRead: 400_000, cacheWrite: 0, output: 20_000_000 },
  },
  longContext: {
    "gpt-5.6-luna": {
      thresholdInputTokens: 272_000,
      rates: { input: 400_000, cacheRead: 40_000, cacheWrite: 0, output: 1_800_000 },
    },
    "gpt-5.6-terra": {
      thresholdInputTokens: 272_000,
      rates: { input: 4_000_000, cacheRead: 400_000, cacheWrite: 0, output: 18_000_000 },
    },
    "gpt-5.6-sol": {
      thresholdInputTokens: 272_000,
      rates: { input: 8_000_000, cacheRead: 800_000, cacheWrite: 0, output: 30_000_000 },
    },
  },
};

const CARDS = [ANTHROPIC_2026_08, OPENAI_2026_08] satisfies RateCard[];

const BY_ID = new Map(CARDS.map((card) => [card.id, card]));

/** The card in force for a provider today. What a new `ai_usage` row stamps. */
export function currentCard(provider: ProviderId): RateCard {
  const card = CARDS.find((candidate) => candidate.provider === provider);
  // Unreachable while the enum has two members and both have a card, and the
  // test holds it that way — a provider without a card would meter for free.
  if (!card) throw new Error(`no rate card for provider "${provider}"`);
  return card;
}

/** A card by id — how a historical row is priced at the rate it was billed at. */
export function cardById(id: string): RateCard | undefined {
  return BY_ID.get(id);
}

/**
 * Which band a request falls in.
 *
 * The threshold is measured over the whole prompt — tokens served from cache
 * still had to be a prompt — which is what "prompts with >272K input tokens"
 * says. A provider with no band always returns the base rates, so the
 * comparison costs nothing where it means nothing.
 */
export function ratesFor(card: RateCard, model: string, usage: CallUsage): ModelRates | undefined {
  const base = card.models[model];
  if (!base) return undefined;

  const band = card.longContext?.[model];
  if (!band) return base;

  const promptTokens = usage.uncachedInputTokens + usage.cacheReadTokens;
  return promptTokens > band.thresholdInputTokens ? band.rates : base;
}

/**
 * What one call cost, in micro-dollars.
 *
 * Null for a model the card does not price rather than zero: a model we have no
 * rate for is an unknown cost, and reporting it as free is the one answer
 * guaranteed to be wrong. §12 gives the Owner an optional spend cap, and a cap
 * that silently ignores calls it cannot price is not a cap.
 */
export function spendOf(card: RateCard, model: string, usage: CallUsage): MicroDollars | null {
  const rates = ratesFor(card, model, usage);
  if (!rates) return null;

  const perMillion = (tokens: number, rate: MicroDollars) => (tokens * rate) / 1_000_000;

  return Math.round(
    perMillion(usage.uncachedInputTokens, rates.input) +
      perMillion(usage.cacheReadTokens, rates.cacheRead) +
      perMillion(usage.cacheWriteTokens, rates.cacheWrite) +
      perMillion(usage.outputTokens, rates.output),
  );
}
