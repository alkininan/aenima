-- ============================================================================
-- T2.3 — the scoring run: §5's engine, as two append-only tables plus the two
-- things the run needs from tables that already exist.
--
-- Hand-written, like every migration since 0002. `drizzle-kit generate` has no
-- snapshots for 0002–0007 and diffs against 0001, so it writes a migration that
-- undoes five tickets. See docs/build-log.md.
--
-- product-spec.md §5 (checks are binary with evidence, results cache per
-- artifact version, every run stamps provider + model + rubric version), §4
-- (applicability and the conditional layers), §1 laws 3 and 7, and §12 (the
-- pinned scorer and the code node law).
--
-- **Why the gap enum is replaced rather than extended.** §5's second
-- negotiation move ends "Pass → closed with the evidence linked", and
-- `gap_disposition` has no value for a debt that reality removed. The obvious
-- `ALTER TYPE … ADD VALUE 'closed'` is a trap here: Postgres forbids *using* a
-- new enum value in the transaction that added it, and `drizzle-kit migrate`
-- runs every pending migration inside one transaction
-- (drizzle-orm/pg-core/dialect.cjs — `session.transaction(...)` around the
-- whole loop). Adding the value and then writing a CHECK constraint that names
-- it therefore works on a database where this migration lands alone, and fails
-- on any database that applies 0001–0008 together — CI and a fresh production
-- project. Creating a new type and swapping the column has no such rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- `gap_disposition` gains `closed` — the only value a machine may write.
-- ---------------------------------------------------------------------------
ALTER TABLE gap DROP CONSTRAINT "gap_resolution_shape";--> statement-breakpoint
ALTER TABLE gap ALTER COLUMN "disposition" DROP DEFAULT;--> statement-breakpoint

-- 0004's partial index stores `disposition = 'open'` with the literal already
-- resolved to the old type, so the column cannot change type underneath it —
-- Postgres rejects the ALTER with "operator does not exist:
-- gap_disposition_next = gap_disposition". It comes back below, unchanged.
DROP INDEX gap_open_idx;--> statement-breakpoint

CREATE TYPE "public"."gap_disposition_next" AS ENUM('open', 'accepted', 'excluded', 'closed');--> statement-breakpoint

ALTER TABLE gap
  ALTER COLUMN "disposition" TYPE "public"."gap_disposition_next"
  USING "disposition"::text::"public"."gap_disposition_next";--> statement-breakpoint

DROP TYPE "public"."gap_disposition";--> statement-breakpoint
ALTER TYPE "public"."gap_disposition_next" RENAME TO "gap_disposition";--> statement-breakpoint

ALTER TABLE gap ALTER COLUMN "disposition" SET DEFAULT 'open';--> statement-breakpoint

-- Four arms now. `open` carries no stamp. `accepted` and `excluded` are §5's
-- human moves and carry all three parts of one. `closed` carries a time and
-- nothing else: no human resolved it, so there is no name to record and no note
-- to write — the ledger row holds which run closed it and why, which is the
-- same split the gap comment already draws ("the gap holds the current answer,
-- the ledger holds how it got there").
-- §13's read: the open gaps on one item, which is what makes an item "Your
-- move". Recreated as 0004 wrote it, now against the four-value type.
CREATE INDEX gap_open_idx ON gap (workspace_id, item_id) WHERE disposition = 'open';--> statement-breakpoint

ALTER TABLE gap ADD CONSTRAINT "gap_resolution_shape" CHECK (
  ("disposition" = 'open'
     and "resolved_by_user_id" is null and "resolved_at" is null
     and "resolution_note" is null)
  or ("disposition" in ('accepted','excluded')
     and "resolved_by_user_id" is not null and "resolved_at" is not null
     and length(btrim("resolution_note")) > 0)
  or ("disposition" = 'closed'
     and "resolved_by_user_id" is null and "resolved_at" is not null
     and "resolution_note" is null)
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- What the run needs from the tables it points at.
-- ---------------------------------------------------------------------------

-- Every foreign key in this schema is `(workspace_id, id)`, so cross-tenant
-- stitching is impossible independent of RLS. `artifact_version` has never been
-- a parent before and carries no such unique; `scoring_run` is the first child.
ALTER TABLE artifact_version
  ADD CONSTRAINT "artifact_version_workspace_id" UNIQUE ("workspace_id", "id");--> statement-breakpoint

-- §5: "Provider outages queue scoring silently; the timestamp does the honest
-- work." A failed run writes no row, so the retry time cannot live on one. The
-- artifact is what gets re-scored. Phase 4 builds the scheduler that reads it.
ALTER TABLE artifact
  ADD COLUMN "next_scoring_attempt_at" timestamp with time zone;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The run. §5's stamp: provider, model, rubric version, the artifact version it
-- scored, when, and what it earned out of what.
--
-- No score column: the score is `earned / denominator * 100`, which is
-- arithmetic over two stored facts, and §12's code node law puts arithmetic in
-- code. `ai_usage` refuses to store money for a related reason.
-- ---------------------------------------------------------------------------
CREATE TABLE "scoring_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "artifact_id" uuid NOT NULL,
  "artifact_version_id" uuid NOT NULL,
  "pack_id" text NOT NULL,
  "pack_version" text NOT NULL,
  "provider" "ai_provider" NOT NULL,
  "model" text NOT NULL,
  "conditions_met" text[] NOT NULL,
  "earned" integer NOT NULL,
  "denominator" integer NOT NULL,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scoring_run_earned_nonneg" CHECK ("earned" >= 0),
  CONSTRAINT "scoring_run_denominator_positive" CHECK ("denominator" > 0),
  CONSTRAINT "scoring_run_earned_bounded" CHECK ("earned" <= "denominator"),
  CONSTRAINT "scoring_run_pack_len" CHECK (length(btrim("pack_id")) between 1 and 120),
  CONSTRAINT "scoring_run_pack_version_len" CHECK (length(btrim("pack_version")) between 1 and 40)
);--> statement-breakpoint

ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_workspace_id"
  UNIQUE ("workspace_id", "id");--> statement-breakpoint

-- §5's cache, as a constraint rather than a convention: one artifact version,
-- one rubric version, one run. Asking twice cannot produce two scores.
ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_cache_key"
  UNIQUE ("workspace_id", "artifact_version_id", "pack_id", "pack_version");--> statement-breakpoint

-- RESTRICT on every parent: an append-only table cannot carry a cascade,
-- because a cascade is a DELETE and the trigger below refuses it.
ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_item_fk"
  FOREIGN KEY ("workspace_id","item_id")
  REFERENCES "public"."item"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_artifact_fk"
  FOREIGN KEY ("workspace_id","artifact_id")
  REFERENCES "public"."artifact"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "scoring_run" ADD CONSTRAINT "scoring_run_version_fk"
  FOREIGN KEY ("workspace_id","artifact_version_id")
  REFERENCES "public"."artifact_version"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint

CREATE INDEX "scoring_run_artifact_idx" ON "scoring_run"
  USING btree ("workspace_id", "artifact_id", "scored_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scoring_run_item_idx" ON "scoring_run"
  USING btree ("workspace_id", "item_id", "scored_at" DESC NULLS LAST);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- One check's verdict. Only applicable checks get a row — §4 has the others
-- leave the denominator, and a verdict about a check nobody asked is noise in
-- the table §8's meter expands into.
--
-- `tag` and `points` are copied from the pack as it was at run time: §5 versions
-- rubrics like documents, and a lookup would re-price an old run through
-- today's rubric and call the result history.
-- ---------------------------------------------------------------------------
CREATE TABLE "scoring_check_result" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "check_id" text NOT NULL,
  "tag" "gap_tag" NOT NULL,
  "points" integer NOT NULL,
  "passed" boolean NOT NULL,
  "requirement_id" text,
  "quote" text,
  "note" text,
  CONSTRAINT "scoring_check_result_points_positive" CHECK ("points" > 0),
  CONSTRAINT "scoring_check_result_check_len" CHECK (
    length(btrim("check_id")) between 1 and 120
  ),
  -- §5's binary law, in the shape the database can hold: a failure carries a
  -- reading, a pass carries nothing at all. §1 law 3 is evidence or nothing.
  CONSTRAINT "scoring_check_result_evidence_shape" CHECK (
    ("passed" and "note" is null and "quote" is null and "requirement_id" is null)
    or (not "passed" and length(btrim("note")) > 0)
  ),
  CONSTRAINT "scoring_check_result_quote_len" CHECK (
    "quote" is null or length(btrim("quote")) between 1 and 2000
  )
);--> statement-breakpoint

ALTER TABLE "scoring_check_result" ADD CONSTRAINT "scoring_check_result_run_check"
  UNIQUE ("workspace_id", "run_id", "check_id");--> statement-breakpoint

ALTER TABLE "scoring_check_result" ADD CONSTRAINT "scoring_check_result_run_fk"
  FOREIGN KEY ("workspace_id","run_id")
  REFERENCES "public"."scoring_run"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint

CREATE INDEX "scoring_check_result_run_idx" ON "scoring_check_result"
  USING btree ("workspace_id", "run_id");--> statement-breakpoint
CREATE INDEX "scoring_check_result_check_idx" ON "scoring_check_result"
  USING btree ("workspace_id", "check_id", "passed");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Both are append-only, the fifth and sixth such tables, enforced the same
-- three ways as `artifact_version`, `activity`, `decision` and `ai_usage`: no
-- UPDATE/DELETE policy, an explicit REVOKE, and a trigger that raises for
-- everyone including the service role.
-- ---------------------------------------------------------------------------
CREATE TRIGGER scoring_run_append_only
  BEFORE UPDATE OR DELETE ON scoring_run
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint
CREATE TRIGGER scoring_check_result_append_only
  BEFORE UPDATE OR DELETE ON scoring_check_result
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

REVOKE UPDATE, DELETE ON scoring_run          FROM anon, authenticated;--> statement-breakpoint
REVOKE UPDATE, DELETE ON scoring_check_result FROM anon, authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security. Enabled AND forced, as on every other table.
--
-- A run is reached through its item, so per-product visibility runs through
-- app.item_product() exactly as `gap`'s policies do. No new helpers: these are
-- 0001's.
--
-- **No INSERT policy on either table**, like `ai_usage` and for the same
-- reason: runs are written server-side over the direct connection, and a client
-- that could write its own run row could write its own score.
-- ---------------------------------------------------------------------------
ALTER TABLE scoring_run          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scoring_run          FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scoring_check_result ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scoring_check_result FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY scoring_run_select ON scoring_run FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint

-- The child has no item column of its own, so it borrows its run's visibility.
-- One EXISTS against a primary key, which is what the composite unique above
-- makes cheap.
CREATE POLICY scoring_check_result_select ON scoring_check_result FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND EXISTS (
      SELECT 1 FROM scoring_run r
       WHERE r.workspace_id = scoring_check_result.workspace_id
         AND r.id = scoring_check_result.run_id
         AND app.can_see_product(app.item_product(r.item_id))
    )
  );--> statement-breakpoint
