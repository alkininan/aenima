Read CLAUDE.md first — it is this repo's constitution and overrides everything below.

## Build principles

- Pre-launch, single deployment: never preserve backward compatibility in code. No compatibility
  layers, no fallbacks, no legacy paths — remove the old path in the same change. The database is
  the one exception: schema changes go through migrations only, and applied migrations are
  immutable (see CLAUDE.md).
- Choose the simplest implementation that fully meets the current requirement. Seams the spec names
  (reserved routes, reserved layout columns, never-typed future inputs) are requirements, not
  speculation — keep them. Abstractions the spec doesn't name are speculation — don't build them.
- Grow in layers: every ticket ends with a working product. Never trade a working product for
  unfinished complexity.
- Prefer established, well-maintained libraries over reimplementing. Check a library's documentation
  and types before assuming it lacks a capability. The design spec outranks any library's defaults —
  when a library cannot express the spec'd behavior, and you've verified that in its docs,
  hand-roll and say so.
- Study how established products solve a problem before designing a solution; research current
  practice on fast-moving topics rather than answering from memory.
- A stopgap is legal only when it is recorded in the build log as an open question with a phase
  owner. An unrecorded stopgap is a bug.
- Three failed corrections on the same fix means the ticket is wrong, not the code. The loop cannot see
  the plan it came from — stop, say so, and ask for the ticket to be restated rather than attempting a
  fourth time.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
