# aenima — agent constitution

aenima turns raw product ideas into validated, developer-ready specifications. It scores every
artifact against a rubric, interviews humans to close the gaps, and ends at a signed handover
packet plus an AI-ready spec bundle. Web app, dark-only, EN/TR/NL, teams of 1–50.

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind v4 · Supabase (Postgres + Auth + Storage, RLS on) ·
Drizzle ORM · Vitest + Playwright · Vercel

## Commands
```
dev        pnpm dev
build      pnpm build                # next build
start      pnpm start                # serve the production build
test       pnpm test                 # vitest, whole suite
test one   pnpm test <path>
e2e        pnpm e2e                  # playwright
lint       pnpm lint                 # eslint + prettier --check
types      pnpm typecheck            # tsc --noEmit
db gen     pnpm db:generate          # write a migration from the schema files
db migrate pnpm db:migrate           # apply pending migrations (needs DATABASE_URL)
db baseline pnpm db:baseline         # record already-applied migrations, once per environment
db seed    pnpm db:seed              # one workspace, two products, opportunities, items
```

## Conventions
Only what differs from framework defaults:

- Server Components by default. `"use client"` only where there is real interactivity.
- All database access goes through `src/db/queries/*`. No inline SQL in components or route handlers.
- Every table carries `workspace_id` and every query filters on it. RLS enforces it as well.
  Product isolation is a security boundary, not a convenience.
- Design tokens live in `src/app/globals.css` as CSS custom properties. Never hardcode a hex,
  a radius, a duration, or a font size. If a value is not in the design spec, stop and ask.
- Artifacts are immutable. Never UPDATE an artifact's content — INSERT a new version row.
- Status is **derived** from which artifacts exist and what they score. There is no settable
  status field anywhere in the schema or the UI.
- Every mutating action writes an `activity` row with actor (human or agent), timestamp, trigger.
- All user-facing strings go through `src/i18n/*` in EN/TR/NL. No bare strings in JSX.
- Store timestamps in UTC; render in the workspace timezone.

## Prohibitions
- Never extend scope beyond the ticket.
- Never invent endpoints, fields, or columns the ticket does not define.
- Never hardcode a color, size, or piece of copy that the design spec defines.
- Never let the agent write to an external system without an explicit human confirm step.
- Never run `drizzle-kit push` on this project. The RLS policies live in
  `drizzle/0001_policies.sql`, not in the schema DSL, so push does not know they
  exist and plans to `DROP POLICY … CASCADE` all of them — deleting the product
  isolation boundary. Migrations only: `db:generate` then `db:migrate`.
- Where the spec is silent: stop and list the question. Never assume.

## Done means
`pnpm lint && pnpm typecheck && pnpm test` all pass. New logic has tests.
Report back as: ACs implemented, tests written, open questions.

## References (read on demand)
`docs/product-spec.md` · `docs/design-spec.md` · `docs/schema.md`

<!-- Humans: this file is the contract; edits here change agent behaviour globally.
     Keep it under ~150 lines — it is loaded into every single session. -->

@AGENTS.md
