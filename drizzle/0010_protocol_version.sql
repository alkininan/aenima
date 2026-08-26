-- ============================================================================
-- T2.3, review finding 4 — the scoring protocol joins §5's cache key.
--
-- A run's verdicts come from two pieces of prompt: the rubric, which the pack
-- versions, and the protocol that wraps it (`src/lib/scoring/prompt.ts`), which
-- nothing versioned. Editing the protocol changes verdicts exactly as editing a
-- rubric does, so §5's promise — "editing a rubric triggers a quiet re-baseline
-- pass so numbers never wobble without explanation" — covered half of the
-- prompt and left the other half silent: an edit produced scores incomparable
-- with yesterday's, with no stamp to find the stale runs by and no cache miss to
-- re-score them.
--
-- `protocol_version` is stamped on every run and is part of the unique key, so
-- a protocol edit invalidates the cache the same way a pack version does.
--
-- **The default is added and then dropped.** `scoring_run` is append-only, so a
-- backfill UPDATE would be refused by its own trigger; `ADD COLUMN … NOT NULL
-- DEFAULT` fills existing rows without firing one. Dropping the default
-- afterwards means every future insert has to say which protocol produced it,
-- rather than inheriting a version nobody chose.
-- ============================================================================

ALTER TABLE scoring_run
  ADD COLUMN "protocol_version" text NOT NULL DEFAULT '1.0.0';--> statement-breakpoint

ALTER TABLE scoring_run ALTER COLUMN "protocol_version" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE scoring_run
  ADD CONSTRAINT "scoring_run_protocol_version_len"
  CHECK (length(btrim("protocol_version")) between 1 and 40);--> statement-breakpoint

ALTER TABLE scoring_run DROP CONSTRAINT "scoring_run_cache_key";--> statement-breakpoint

ALTER TABLE scoring_run ADD CONSTRAINT "scoring_run_cache_key"
  UNIQUE ("workspace_id", "artifact_version_id", "pack_id", "pack_version",
          "protocol_version");--> statement-breakpoint
