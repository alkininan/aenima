-- ============================================================================
-- T1.3 follow-up — one subject's ledger, indexed.
--
-- `activity` had exactly one index: (workspace_id, occurred_at desc). That
-- answers "what happened in this workspace lately" and nothing else, so the
-- item page's feed — filtered on subject_table and subject_id — scanned every
-- activity row in the workspace and discarded almost all of them.
--
-- Done now rather than later on purpose. The table is small today, and an index
-- migration on a ledger is a job that gets harder every week it waits.
--
-- `occurred_at desc` trails the equality columns so the newest-first order the
-- feed reads in falls out of the index rather than out of a sort.
--
-- Plain CREATE INDEX, not CONCURRENTLY: drizzle-kit runs migrations inside a
-- transaction and CONCURRENTLY cannot. At this size the lock is measured in
-- milliseconds; when it stops being, the answer is to run the concurrent form
-- by hand and record it with db:baseline.
-- ============================================================================

CREATE INDEX "activity_subject_idx" ON "activity"
  USING btree ("workspace_id", "subject_table", "subject_id", "occurred_at" DESC NULLS LAST);
