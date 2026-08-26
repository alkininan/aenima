-- ============================================================================
-- T2.3, second migration — two CHECK constraints that do not hold.
--
-- **A CHECK constraint rejects a row only when its expression is FALSE.** An
-- expression that evaluates to NULL passes: SQL's three-valued logic makes
-- `NOT NULL` of an unknown unknown, and Postgres treats "unknown" as satisfied.
-- `length(btrim(NULL)) > 0` is NULL, not false, so both constraints below let
-- through exactly the row they were written to forbid:
--
--   - `scoring_check_result_evidence_shape` accepted a failed check with a NULL
--     note — §5's binary law is "checks are binary **with evidence**", and a
--     failure that says nothing is the number §1 law 3 refuses to ship.
--   - `gap_resolution_shape` accepted an accepted or excluded gap with a NULL
--     resolution note, which is §1 law 7's named debt with the reason missing.
--     That one is inherited: 0004 wrote it, 0008 carried it forward with the
--     `closed` arm added, and neither noticed. The `length(...) > 0` test looks
--     like it covers null and does not.
--
-- 0008 is corrected here rather than edited, because it has been applied.
--
-- Found by a test that asserted the first constraint rejects a NULL note and
-- watched the insert succeed.
-- ============================================================================

ALTER TABLE scoring_check_result
  DROP CONSTRAINT "scoring_check_result_evidence_shape";--> statement-breakpoint

ALTER TABLE scoring_check_result ADD CONSTRAINT "scoring_check_result_evidence_shape" CHECK (
  ("passed" and "note" is null and "quote" is null and "requirement_id" is null)
  or (not "passed" and "note" is not null and length(btrim("note")) > 0)
);--> statement-breakpoint

ALTER TABLE gap DROP CONSTRAINT "gap_resolution_shape";--> statement-breakpoint

ALTER TABLE gap ADD CONSTRAINT "gap_resolution_shape" CHECK (
  ("disposition" = 'open'
     and "resolved_by_user_id" is null and "resolved_at" is null
     and "resolution_note" is null)
  or ("disposition" in ('accepted','excluded')
     and "resolved_by_user_id" is not null and "resolved_at" is not null
     and "resolution_note" is not null and length(btrim("resolution_note")) > 0)
  or ("disposition" = 'closed'
     and "resolved_by_user_id" is null and "resolved_at" is not null
     and "resolution_note" is null)
);--> statement-breakpoint
