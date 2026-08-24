-- ============================================================================
-- T2.2 — the AI layer's two tables: the workspace's credential, and the meter.
--
-- Hand-written, like every migration since 0002. `drizzle-kit generate` has no
-- snapshots for 0002–0006 and diffs against 0001, so it writes a migration that
-- undoes four tickets. See docs/build-log.md.
--
-- product-spec.md §12 ("the Owner holds the key, pays the bill, and every
-- member's actions run on it with per-member usage attribution"), §5 (the
-- pinned scorer), §14 (Product, Developer and Viewer cannot touch AI keys) and
-- §15 (spend per tier and per member, escalation-to-mid rate).
--
-- **The key is not in this file and not in this database's public schema.** It
-- goes to Supabase Vault; `workspace_ai_credential.vault_secret_id` points at
-- it. `vault.decrypted_secrets` is granted to `postgres` and `service_role`
-- only — `authenticated` and `anon` hold no privilege on the vault schema at
-- all — so a signed-in member cannot read a key through PostgREST even if every
-- policy below were wrong. The policies are the second wall and the column
-- grant is the third.
-- ============================================================================

CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai');--> statement-breakpoint
CREATE TYPE "public"."ai_tier" AS ENUM('routine', 'analysis', 'generation');--> statement-breakpoint
CREATE TYPE "public"."ai_outcome" AS ENUM('ok', 'schema_invalid', 'refused', 'unavailable', 'rate_limited', 'rejected');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The credential. One row per workspace: §12 has one provider active at a time.
-- ---------------------------------------------------------------------------
CREATE TABLE "workspace_ai_credential" (
  "workspace_id" uuid PRIMARY KEY NOT NULL,
  "provider" "ai_provider" NOT NULL,
  "vault_secret_id" uuid NOT NULL,
  "key_hint" text NOT NULL,
  "scorer_model" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_ai_credential_hint_len" CHECK (length("key_hint") between 2 and 8),
  CONSTRAINT "workspace_ai_credential_model_len" CHECK (length(btrim("scorer_model")) between 1 and 120)
);--> statement-breakpoint

ALTER TABLE "workspace_ai_credential"
  ADD CONSTRAINT "workspace_ai_credential_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;--> statement-breakpoint

-- The setter is a recorded fact, not a foreign key — migration 0003's rule.
-- Who set the key stays answerable after the account is deleted.

-- ---------------------------------------------------------------------------
-- The meter. §15's usage view reads this and nothing else.
-- ---------------------------------------------------------------------------
CREATE TABLE "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "product_id" uuid,
  "actor_kind" "actor_kind" NOT NULL,
  "actor_user_id" uuid,
  "actor_agent" text,
  "provider" "ai_provider" NOT NULL,
  "model" text NOT NULL,
  "tier" "ai_tier" NOT NULL,
  "purpose" text NOT NULL,
  "uncached_input_tokens" integer NOT NULL,
  "cache_read_tokens" integer NOT NULL,
  "cache_write_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "escalated_from" "ai_tier",
  "outcome" "ai_outcome" NOT NULL,
  "latency_ms" integer NOT NULL,
  "rate_card" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_usage_actor_shape" CHECK (
    ("actor_kind" = 'human' and "actor_user_id" is not null and "actor_agent" is null)
    or ("actor_kind" = 'agent' and "actor_agent" is not null and "actor_user_id" is null)
  ),
  CONSTRAINT "ai_usage_tokens_nonneg" CHECK (
    "uncached_input_tokens" >= 0 and "cache_read_tokens" >= 0
    and "cache_write_tokens" >= 0 and "output_tokens" >= 0 and "latency_ms" >= 0
  ),
  CONSTRAINT "ai_usage_purpose_len" CHECK (length(btrim("purpose")) between 1 and 60)
);--> statement-breakpoint

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade;--> statement-breakpoint

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_product_fk"
  FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."product"("workspace_id","id") ON DELETE set null;--> statement-breakpoint

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_actor_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES auth.users (id) ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX "ai_usage_workspace_time_idx" ON "ai_usage"
  USING btree ("workspace_id", "occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_member_idx" ON "ai_usage"
  USING btree ("workspace_id", "actor_user_id", "occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_tier_idx" ON "ai_usage"
  USING btree ("workspace_id", "tier", "occurred_at" DESC NULLS LAST);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- `ai_usage` is the fourth append-only ledger, enforced the same three ways as
-- `artifact_version` and `activity`: no UPDATE/DELETE policy, an explicit
-- REVOKE, and a trigger that raises for everyone including the service role.
-- ---------------------------------------------------------------------------
CREATE TRIGGER ai_usage_append_only
  BEFORE UPDATE OR DELETE ON ai_usage
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

REVOKE UPDATE, DELETE ON ai_usage FROM anon, authenticated;--> statement-breakpoint

-- The credential is mutable — a key gets rotated — so it takes the standard
-- updated_at trigger rather than the append-only one.
CREATE TRIGGER workspace_ai_credential_touch BEFORE UPDATE ON workspace_ai_credential
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security. Enabled AND forced, as on every other table.
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_ai_credential ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspace_ai_credential FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ai_usage               ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ai_usage               FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

-- workspace_ai_credential ----------------------------------------------------
-- §14: only the Owner can see or set an AI key. Product, Developer and Viewer
-- match no policy, so for them the row does not exist. No DELETE policy: a
-- workspace switching provider updates in place, and one that stops using AI
-- has nothing to gain from a row that can vanish.
CREATE POLICY workspace_ai_credential_select ON workspace_ai_credential FOR SELECT TO authenticated
  USING (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY workspace_ai_credential_insert ON workspace_ai_credential FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY workspace_ai_credential_update ON workspace_ai_credential FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) = 'owner')
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint

-- The third wall: even an Owner reading their own row through PostgREST does
-- not get the pointer. Column-level grants replace the table-level one, so the
-- request path can read the metadata a settings screen shows and nothing else.
-- The server-side provider layer reads `vault_secret_id` over the direct
-- connection, which is not `authenticated`.
REVOKE SELECT ON workspace_ai_credential FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ("workspace_id", "provider", "key_hint", "scorer_model",
              "created_by_user_id", "created_at", "updated_at")
  ON workspace_ai_credential TO authenticated;--> statement-breakpoint

-- ai_usage -------------------------------------------------------------------
-- §12's meter is the Owner's ("the usage meter shows spend per tier and per
-- member, with an optional Owner-set cap"), and per-member attribution means
-- one member reading it would be reading everyone else's spend.
--
-- INSERT has no policy at all, deliberately: usage rows are written by the
-- server-side provider layer over the direct connection, never by a browser.
-- A client that could write its own meter row could under-report itself.
CREATE POLICY ai_usage_select ON ai_usage FOR SELECT TO authenticated
  USING (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
