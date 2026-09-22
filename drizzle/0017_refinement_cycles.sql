-- ============================================================================
-- T3.2's addendum, AA1 and AA3 — the refinement ledger learns cycles, and stops
-- losing an objection to a column width.
--
-- **AA1. A surfaced check closes for the artifact version, not for ever.** T3.1
-- closed it on that section permanently: right within a session, wrong across
-- versions, since a judgement about text the human has since rewritten is a
-- judgement about text that no longer exists. What reopens it is the human
-- rewriting *that section* — never the author's own revision, which is a new
-- version of the section too and would reopen every check the loop had just
-- closed, so §6's two-round cap would never bite and the loop would not
-- terminate. So the cycle is keyed to the section's text in the newest
-- **human-authored** version, hashed: `base_section_hash`. The loop's versions
-- are agent-authored and never move it.
--
-- `cycle_no` rather than the hash alone in the key, because a human who reverts
-- a section to text it held before would otherwise collide with the cycle that
-- text already spent. The hash decides when the cycle turns; the number is what
-- the rows are unique on.
--
-- **AA3. An over-long objection is never discarded silently.** T3.1 dropped an
-- objection whose reason or evidence ran past 2000 characters — a gap nobody
-- hears about, which is §1 law 7 broken by a column width. Now the reason is cut
-- to what the column holds and `reason_truncated` records it; the quote is cut
-- the same way and `evidence_truncated` records that, and because a cut quote is
-- no longer the verbatim evidence §1 law 3 asks for, such an objection is never
-- sent to the author at all. It surfaces to the human instead — at whatever
-- round its cycle is on, which is why `surfaced` now runs 1 to 3 rather than 3
-- alone, and with no author position, because the author was never asked.
--
-- `author_position` therefore becomes nullable, and the shape constraint takes
-- over from NOT NULL: it is required of `revised`, `held` and `refused`, the
-- three outcomes the author answered, and optional on a surfacing. A length
-- CHECK passes on NULL (0009), so `refinement_round_position_len` needs no
-- change to allow it.
--
-- Hand-written, like every migration since 0002.
--
-- **Backfill.** Every row 0015 wrote is cycle 1 with an unrecorded baseline and
-- nothing truncated. A null `base_section_hash` is read as "unknown", and
-- unknown holds the closure where it stands rather than reopening it: reopening
-- on a guess would re-spend two paid rounds. The absence is detected, never
-- filled (0011's rule).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The cycle. Added with a default so the rows already written land on cycle 1,
-- then the default is dropped: every round written from here on names its cycle,
-- because a cycle nobody chose is the bug this column exists to prevent.
-- ---------------------------------------------------------------------------
ALTER TABLE "refinement_round"
  ADD COLUMN "cycle_no" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "refinement_round" ALTER COLUMN "cycle_no" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "refinement_round"
  ADD COLUMN "base_section_hash" text;--> statement-breakpoint

ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_cycle"
  CHECK ("cycle_no" >= 1);--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_base_hash_len"
  CHECK (length(btrim("base_section_hash")) between 1 and 200);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- AA3's two records. Defaulted false for the rows already written — none of
-- them was truncated, because T3.1 dropped an over-long objection rather than
-- cutting it — then dropped, so every round from here on states it.
-- ---------------------------------------------------------------------------
ALTER TABLE "refinement_round"
  ADD COLUMN "reason_truncated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "refinement_round" ALTER COLUMN "reason_truncated" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "refinement_round"
  ADD COLUMN "evidence_truncated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "refinement_round" ALTER COLUMN "evidence_truncated" DROP DEFAULT;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The key gains the cycle, above the round number. A check reopened by a human
-- rewrite starts at round zero and cannot collide with the cycle it spent.
-- ---------------------------------------------------------------------------
ALTER TABLE "refinement_round" DROP CONSTRAINT "refinement_round_key";--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_key"
  UNIQUE ("artifact_id", "section_id", "check_id", "cycle_no", "round_no");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A surfacing the author never saw carries no position, so the column stops
-- being NOT NULL and the shape constraint says which outcomes require one.
-- ---------------------------------------------------------------------------
ALTER TABLE "refinement_round" ALTER COLUMN "author_position" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "refinement_round" DROP CONSTRAINT "refinement_round_shape";--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_shape" CHECK (
  ("outcome" = 'revised' and "round_no" between 1 and 2
     and "revised_version_id" is not null and "outside_sections" is null
     and "author_position" is not null)
  or ("outcome" = 'held' and "round_no" between 1 and 2
     and "revised_version_id" is null and "outside_sections" is null
     and "author_position" is not null)
  or ("outcome" = 'refused' and "round_no" between 1 and 2
     and "revised_version_id" is null and "outside_sections" is not null
     and cardinality("outside_sections") > 0
     and "author_position" is not null)
  or ("outcome" = 'surfaced' and "round_no" between 1 and 3
     and "revised_version_id" is null and "outside_sections" is null)
);
