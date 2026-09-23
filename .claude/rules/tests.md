---
paths:
  - "src/**/*.test.{ts,tsx}"
  - "scripts/**/*.test.{mjs,mts,ts}"
  - "e2e/**/*.spec.ts"
---

# Tests

Every way a green suite has lied here, one line each. `CLAUDE.md` already requires new logic to carry a test; this is about what makes one worth having.

- A test asserting on a row's position orders by a column the database guarantees: inside one transaction `now()` is constant, so `occurred_at` ties and the assertion is a coin flip. — "A test that asserts on the position of a row must order by something the database guarantees."
- A fixture is built the way production builds it; the db fixtures injected a handle that never met `drizzle()`, so the wiring the bug lived in was absent from the test. — "A fixture that skips the wiring cannot test the wiring."
- Verify a fix by breaking it: reintroduce the defect, watch the named assertion and only that assertion go red, revert. — "Verify a fix by breaking it."
- Pin the rule, not the pair of numbers that currently satisfy it, because an assertion that documents a discrepancy protects it. — "An assertion that documents a discrepancy protects it."
- Fake only the timers the code under test reads; faking `setTimeout` and `requestAnimationFrame` hangs every userEvent interaction with no useful error. — "Fake only the timers the code under test reads."
- A guard test for a memoized read asserts request counts, not returned values: the value was correct throughout and only the traffic was wrong. — "request counts, not returned values"
- A db test skips loudly without `DATABASE_URL` rather than quietly, because a green suite is not proof that the isolation boundary holds. — "a green suite is not proof that the isolation boundary holds"
- A test whose name promises more than it delivers is worse than no test: rename it to what it catches, or replace it with one that holds. — "A test whose name promises what it cannot deliver is worse than no test."
