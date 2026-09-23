---
paths:
  - "src/packs/**"
---

# Skill packs and the rubric

Rules about the packs a run scores against.

- `percentageOf` is the only division in the product: a score is arithmetic over the stored `earned` and `denominator`, and two implementations of one formula can disagree. — "is the only division in the product"
- `packConditions` lives beside `applicableChecks`, because which conditions a pack can be asked about is a fact about the pack and not about a run. — "`packConditions` lives in `src/packs`, beside `applicableChecks`."
- `validatePack` holds the base checks to exactly `RUBRIC_TOTAL`, so a new check takes its points from an existing one and a rubric edit cannot move the total under a stored run. — "holds the base checks to exactly `RUBRIC_TOTAL`"
- A condition may carry probes the way a check does, and is decided by its probes and by nothing else; a condition that oscillates is the scorer having no settled answer. — `docs/log/T2.9.md`
