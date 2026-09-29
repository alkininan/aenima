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
- A test that holds a server action open to observe an in-flight state settles it in a `finally`: React 19 entangles async transitions, so one left pending keeps every later test's `isPending` true. — `docs/log/T0.42.md`
- A test that pins a document's header pins the note its ticket added, wherever it stands in the header, never the header's first line: the next version bump pushes that note one entry down and reddens the test by construction. — `docs/log/T0.47.md`
- A computed style read on a node whose property transitions waits on `node.getAnimations()` settling first: read inside `.control`'s 120 ms `box-shadow` window it fails alone and passes under load, a flake the wrong way round. — `docs/log/T0.48.md`
- A responsiveness budget runs as its own Playwright project with the server to itself: under four workers the same route change painted in 468–991 ms that paints in 35–60 ms alone. — `docs/log/T0.48.md`
- A script-off browser never sees past a streamed Suspense boundary, whose reveal is an inline script; "the page never hydrates" is staged by blocking the bundles with script on. — `docs/log/T0.48.md`
- A threshold a container query decides is tested with the box held under it at a wide viewport (`/dev/list?box=`): that is the one case a viewport query gets wrong, and every viewport-only case passes either way. — `docs/log/T0.49.md`
- A row locator on a fixture page scopes to the fixture list's own links (`href="/dev/item"`): the sink's list surface renders the same titles in the same frame, and a title alone resolves to two rows. — `docs/log/T0.49.md`
