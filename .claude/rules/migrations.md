---
paths:
  - "drizzle/**"
  - "src/db/schema/**"
---

# Migrations

What this repo learned about changing the schema. Each line ends in where the story is; `CLAUDE.md` carries the rules that hold everywhere, and they are not repeated here.

- A value added by `ALTER TYPE … ADD VALUE` cannot be used in the same run, because drizzle-kit wraps every pending migration in one transaction — create a new type and swap the column instead. — "Extending an enum and using the new value cannot happen in one migration here."
- A CHECK constraint rejects a row only when its expression is FALSE, so NULL passes: every arm says `is not null` before it says `length(...) > 0`. — "A CHECK constraint rejects a row only when its expression is FALSE."
- An append-only table's parent reference is `RESTRICT`, the only shape that fails legibly: the trigger refuses the DELETE a CASCADE needs and the UPDATE a SET NULL needs. — "Where an append-only table does keep a parent reference, it is `RESTRICT`"
- A ledger's actor column carries no foreign key into `auth.users` — the id is a recorded fact, so the user stays deletable and the ledger stays immutable. — "An append-only table cannot carry `ON DELETE SET NULL`"
- Foreign keys are composite on `(workspace_id, id)`, so cross-tenant stitching is structurally impossible rather than merely policed. — "Composite foreign keys on `(workspace_id, id)`"
- Baseline only an environment whose schema was applied by hand; baselining a fresh one marks the migrations done and skips them forever. — "Baseline only an environment whose schema was applied by hand."
- Regenerate `src/db/database.types.ts` against the live project after every migration and diff it whole, rather than at the next opportunity. — "Regenerate after every migration, not at the next opportunity."
- A db test for a column its own migration adds reads `information_schema` and skips with a loud banner naming the file to apply, because the Stop gate runs the whole suite in every worktree. — `docs/log/T1.4.md`
