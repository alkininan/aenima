---
paths:
  - "src/db/**"
---

# Database access

Rules about reading and writing through `src/db/`. `CLAUDE.md` already says every query filters on `workspace_id`, that artifacts are versioned rather than updated, and that a bound secret's error is scrubbed; those are not repeated.

- Bind JSON as `::text::jsonb`, never a bare `::jsonb`: a bare cast stores the text as a jsonb string, `->>` answers null for every key, and the value prints identically to the correct one. — "`::text::jsonb`, never a bare `::jsonb`, when binding JSON as a parameter."
- `drizzle()` mutates the postgres.js client it is handed, so a `Date` bound on the raw `sql` beside it reaches the wire encoder unconverted — send `.toISOString()`. — "mutates the client it is handed, and the raw `sql` beside it is not the same client afterwards"
- A write must return the row it wrote: Next memoizes identical GETs for a whole render pass, so a read-after-write in one pass replays the pre-write response. — "So a write must return the row it wrote"
- `bootstrap_workspace` is idempotent and takes a per-user advisory lock, because the membership lookup is check-then-act under READ COMMITTED and `/app` opens several render passes at once. — "is idempotent and takes a per-user advisory lock"
- An item's and an opportunity's key are assigned by the database, which overwrites whatever an insert supplies; a client that can choose an identifier can collide with one. — "Keys are assigned by the database and never by the client"
- The process holds one direct Postgres connection rather than one per call, and a script must close it or it keeps Node's event loop alive. — "Scripts must call `closeSharedDbClient()`"
