-- ============================================================================
-- T3.1 — the author-critic loop's round ledger: product-spec.md §6's two-round
-- cap, stored rather than inferred.
--
-- "Two refinement rounds per section, maximum — after two, the disagreement
-- surfaces to the human as an open question." The count has to survive a reload
-- and "why does this section have an open question" has to be answerable later,
-- so every round is a row. T3.1's addendum settled the three things no spec
-- defined:
--
-- 1. **A section is a `##` heading block** of the artifact body, its id the
--    heading's slug. Sectioning is a parse over the stored body
--    (`src/lib/authoring/sections.ts`); `artifact_version.content` is untouched.
-- 2. **An open question is a round row marked `surfaced`** — no open-question
--    table is created. T3.2's Open Questions section and T3.4 read these rows.
-- 3. **One append-only row per round**, unique on (artifact, section, check,
--    round number). A row per artifact version could not stay append-only: a
--    refused revision cuts no new version, so the next round tests the same one.
--    The count is the highest round number for the key.
--
-- Hand-written, like every migration since 0002: `drizzle-kit generate` has no
-- snapshots after 0001 and would write a migration that undoes thirteen tickets.
--
-- `CREATE TYPE` and a CHECK naming its values in one transaction is legal — the
-- trap 0008 describes is `ALTER TYPE … ADD VALUE`, which this does not do.
-- ============================================================================

CREATE TYPE "public"."refinement_outcome" AS ENUM('revised', 'held', 'refused', 'surfaced');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- One round: which section of which artifact, argued over which check, the
-- critic's objection, the author's position, and how it ended.
--
-- `artifact_version_id` is the version the critic read. `revised` names the
-- version its revision cut; `refused` names the sections the revision strayed
-- into; `held` (the author returned the section unchanged) carries neither;
-- `surfaced` is round 3 and is the open question itself.
-- ---------------------------------------------------------------------------
CREATE TABLE "refinement_round" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "artifact_id" uuid NOT NULL,
  "artifact_version_id" uuid NOT NULL,
  "section_id" text NOT NULL,
  "check_id" text NOT NULL,
  "round_no" integer NOT NULL,
  "outcome" "refinement_outcome" NOT NULL,
  "reason" text NOT NULL,
  "evidence" text NOT NULL,
  "author_position" text NOT NULL,
  "revised_version_id" uuid,
  "outside_sections" text[],
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refinement_round_section_len" CHECK (length(btrim("section_id")) between 1 and 200),
  CONSTRAINT "refinement_round_check_len" CHECK (length(btrim("check_id")) between 1 and 120),
  CONSTRAINT "refinement_round_reason_len" CHECK (length(btrim("reason")) between 1 and 2000),
  CONSTRAINT "refinement_round_evidence_len" CHECK (length(btrim("evidence")) between 1 and 2000),
  CONSTRAINT "refinement_round_position_len" CHECK (
    length(btrim("author_position")) between 1 and 2000
  ),
  -- Which outcome carries which part, and §6's cap in the database: a revision
  -- is round 1 or 2, a surfacing is round 3, and there is no round 4.
  -- `cardinality`, not `array_length`: the latter is NULL on an empty array, and
  -- a CHECK whose expression is NULL accepts the row (0009).
  CONSTRAINT "refinement_round_shape" CHECK (
    ("outcome" = 'revised' and "round_no" between 1 and 2
       and "revised_version_id" is not null and "outside_sections" is null)
    or ("outcome" = 'held' and "round_no" between 1 and 2
       and "revised_version_id" is null and "outside_sections" is null)
    or ("outcome" = 'refused' and "round_no" between 1 and 2
       and "revised_version_id" is null and "outside_sections" is not null
       and cardinality("outside_sections") > 0)
    or ("outcome" = 'surfaced' and "round_no" = 3
       and "revised_version_id" is null and "outside_sections" is null)
  )
);--> statement-breakpoint

ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_workspace_id"
  UNIQUE ("workspace_id", "id");--> statement-breakpoint

-- The addendum's key, word for word. Also the index every read of an artifact's
-- rounds rides: `artifact_id` leads it.
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_key"
  UNIQUE ("artifact_id", "section_id", "check_id", "round_no");--> statement-breakpoint

-- RESTRICT on every parent: an append-only table cannot carry a cascade,
-- because a cascade is a DELETE and the trigger below refuses it.
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_item_fk"
  FOREIGN KEY ("workspace_id","item_id")
  REFERENCES "public"."item"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_artifact_fk"
  FOREIGN KEY ("workspace_id","artifact_id")
  REFERENCES "public"."artifact"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_version_fk"
  FOREIGN KEY ("workspace_id","artifact_version_id")
  REFERENCES "public"."artifact_version"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "refinement_round" ADD CONSTRAINT "refinement_round_revised_version_fk"
  FOREIGN KEY ("workspace_id","revised_version_id")
  REFERENCES "public"."artifact_version"("workspace_id","id") ON DELETE restrict;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Append-only, the eighth such table, enforced the same three ways as the
-- others: no UPDATE/DELETE policy, an explicit REVOKE, and a trigger that raises
-- for everyone including the service role.
-- ---------------------------------------------------------------------------
CREATE TRIGGER refinement_round_append_only
  BEFORE UPDATE OR DELETE ON refinement_round
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

REVOKE UPDATE, DELETE ON refinement_round FROM anon, authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security. Enabled AND forced, as on every other table.
--
-- A round is reached through its item, so per-product visibility runs through
-- app.item_product() exactly as `scoring_run`'s policy does.
--
-- **No INSERT policy**, like `scoring_run` and for the same reason: rounds are
-- written server-side over the direct connection, and a client that could write
-- its own round could spend or skip §6's cap.
-- ---------------------------------------------------------------------------
ALTER TABLE refinement_round ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE refinement_round FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY refinement_round_select ON refinement_round FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(app.item_product(item_id))
  );
