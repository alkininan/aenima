-- ============================================================================
-- T2.4, review finding 1 — a run explains its own denominator.
--
-- §8's meter expands into every check, and the checks §4 renormalized out are
-- shown as "not asked" with the condition that did not hold. T2.4 produced that
-- list by calling `excludedChecks(currentPack, run.conditions_met)` at render
-- time, which is the one thing §1 law 3 forbids: a rubric edit moves a check in
-- or out of the excluded set without touching the stored run, so the page would
-- go on explaining a stored denominator of 99 with a set of checks that no
-- longer adds up to it — and would do it while reading perfectly.
--
-- §5 versions rubrics like documents. `scoring_check_result` already copies
-- `tag` and `points` off the pack at write time for exactly this reason ("a
-- lookup would re-price last month's run through this month's rubric and call
-- it history"). This table is the same argument applied to the other half of
-- the list.
--
-- Hand-written, like every migration since 0002: `drizzle-kit generate` has no
-- snapshots for 0002–0010 and diffs against 0001, so it writes a migration that
-- undoes eight tickets. See docs/build-log.md.
--
-- **Nothing is backfilled.** The two runs already stored predate the column, so
-- they carry no rows here and their expansions show no not-asked lines. That is
-- the honest reading — those runs did not record what they did not ask — and
-- the alternative is to derive the rows from today's pack, which is the defect
-- this migration exists to remove. §5's cache key re-scores them the moment the
-- artifact, the pack version or the protocol version moves. Recorded as an open
-- question in docs/build-log.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The sibling of `scoring_check_result`. Between them they hold every check the
-- rubric contained at run time, one row each — verdicts on one side, the checks
-- §4 removed on the other.
--
-- `tag` and `points` are what the check was worth *had it been asked*; the run's
-- denominator does not contain them. `condition_id` is what §15 counts by;
-- `condition_when` is the sentence, so the surface can still say why in the
-- rubric's own words after the rubric has moved on.
--
-- Not the same word as `gap_disposition`'s `excluded`, deliberately: that is
-- §5's first negotiation move, a person arguing a check away with their name on
-- it. This is the applicability engine answering in the pass that scores, and
-- nobody decided anything. The surface says "not asked" for the same reason.
-- ---------------------------------------------------------------------------
CREATE TABLE "scoring_check_not_asked" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "check_id" text NOT NULL,
  "tag" "gap_tag" NOT NULL,
  "points" integer NOT NULL,
  "condition_id" text NOT NULL,
  "condition_when" text NOT NULL,
  CONSTRAINT "scoring_check_not_asked_points_positive" CHECK ("points" > 0),
  CONSTRAINT "scoring_check_not_asked_check_len" CHECK (
    length(btrim("check_id")) between 1 and 120
  ),
  CONSTRAINT "scoring_check_not_asked_condition_len" CHECK (
    length(btrim("condition_id")) between 1 and 120
  ),
  -- The reason is the whole point of the row, so it may not be blank. No `is
  -- not null` guard: 0009's lesson was about a *nullable* column, where
  -- `length(btrim(null)) > 0` is NULL and the CHECK accepts the one row it
  -- exists to forbid. This column is NOT NULL, so the length test is total.
  CONSTRAINT "scoring_check_not_asked_condition_when_len" CHECK (
    length(btrim("condition_when")) between 1 and 2000
  )
);--> statement-breakpoint

-- One row per check per run, which is also what makes "a check has a verdict or
-- a reason, never both" checkable: the two tables share this key shape.
ALTER TABLE "scoring_check_not_asked" ADD CONSTRAINT "scoring_check_not_asked_run_check"
  UNIQUE ("workspace_id", "run_id", "check_id");--> statement-breakpoint

-- RESTRICT, because an append-only table cannot carry a cascade: a cascade is a
-- DELETE and the trigger below refuses it.
ALTER TABLE "scoring_check_not_asked" ADD CONSTRAINT "scoring_check_not_asked_run_fk"
  FOREIGN KEY ("workspace_id","run_id")
  REFERENCES "public"."scoring_run"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint

CREATE INDEX "scoring_check_not_asked_run_idx" ON "scoring_check_not_asked"
  USING btree ("workspace_id", "run_id");--> statement-breakpoint
-- §5's learning loop: "when a workspace repeatedly accepts or excludes the same
-- check, the agent proposes a rubric change". This is the read that counts how
-- often a condition takes a check out of the denominator.
CREATE INDEX "scoring_check_not_asked_condition_idx" ON "scoring_check_not_asked"
  USING btree ("workspace_id", "condition_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Append-only, the seventh such table, enforced the same three ways as
-- `scoring_check_result`: no UPDATE/DELETE policy, an explicit REVOKE, and a
-- trigger that raises for everyone including the service role.
-- ---------------------------------------------------------------------------
CREATE TRIGGER scoring_check_not_asked_append_only
  BEFORE UPDATE OR DELETE ON scoring_check_not_asked
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

REVOKE UPDATE, DELETE ON scoring_check_not_asked FROM anon, authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security, enabled AND forced, as on every other table.
--
-- **No INSERT policy**, like `scoring_run` and `scoring_check_result`: a run is
-- written server-side over the direct connection, and a client that could write
-- its own not-asked row could take a check out of its own denominator.
--
-- The SELECT policy is `scoring_check_result_select` verbatim against this
-- table — the row has no item column of its own, so it borrows its run's
-- visibility. A workspace filter alone is not enough: `app.can_see_product` is
-- what stops a member reading the scores of a product they cannot see.
-- ---------------------------------------------------------------------------
ALTER TABLE scoring_check_not_asked ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scoring_check_not_asked FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY scoring_check_not_asked_select ON scoring_check_not_asked FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND EXISTS (
      SELECT 1 FROM scoring_run r
       WHERE r.workspace_id = scoring_check_not_asked.workspace_id
         AND r.id = scoring_check_not_asked.run_id
         AND app.can_see_product(app.item_product(r.item_id))
    )
  );
