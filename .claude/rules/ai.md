---
paths:
  - "src/lib/ai/**"
---

# The AI seam

Rules about calling a provider and metering it. `CLAUDE.md` already requires `.nullable()` over `.optional()` in every schema sent to a provider; that is not repeated.

- `max_tokens` is a budget for the model's reasoning as well as its answer, and truncated JSON reads as a flaky provider rather than as a ceiling. Headroom is not billed. — "`max_tokens` is a budget for the model's reasoning, not just its answer."
- The scorer's pin is enforced by a missing parameter rather than by a rule: `runScorer` takes no tier, and `AiRequest.purpose` excludes the scorer's purposes. — "The scorer's pin is enforced by a missing parameter, not by a rule."
- Spend is arithmetic over the stored token counts and the rate card in force, never a stored number. — "Spend is arithmetic over stored token counts, never a stored number."
- A price change is a new rate card id and a new entry, never an edit to an existing one, because old rows are priced at the card they name. — "a price change means a new card id, never an edit to an existing one"
- A failed run writes nothing, and only a retryable failure leaves a mark — a non-retryable one queues no retry, because the same call would fail the same way. — "A failed run writes nothing, and only a retryable failure leaves a mark."
- The provider key lives in Supabase Vault and the public row holds only a pointer, so no signed-in member can read it through PostgREST. — "The AI key lives in Supabase Vault, and the public row holds a pointer."
- Haiku 4.5 caches nothing below 4,096 prompt tokens and reports no error for it, so a zero hit rate on the routine tier is the model rather than a bug. — "Haiku 4.5 will not cache a prompt below 4,096 tokens"
