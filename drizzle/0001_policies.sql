-- ============================================================================
-- Product isolation, append-only ledgers, and first-run bootstrap.
--
-- Hand-written: this is the security boundary, and it is SQL that Drizzle's
-- schema DSL cannot express. CLAUDE.md — "Product isolation is a security
-- boundary, not a convenience" — and product-spec.md §1 and §2.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- auth.users links. Drizzle only owns `public`, so these are added here.
-- ---------------------------------------------------------------------------
ALTER TABLE "membership"
  ADD CONSTRAINT "membership_user_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users (id) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "product"
  ADD CONSTRAINT "product_decider_fk"
  FOREIGN KEY ("decider_user_id") REFERENCES auth.users (id) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "artifact_version"
  ADD CONSTRAINT "artifact_version_author_fk"
  FOREIGN KEY ("authored_by_user_id") REFERENCES auth.users (id) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "activity"
  ADD CONSTRAINT "activity_actor_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES auth.users (id) ON DELETE SET NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Helper functions.
--
-- SECURITY DEFINER on purpose: a policy on `membership` that reads `membership`
-- recurses forever. A definer function bypasses RLS on its own read, so the
-- policy terminates. search_path is pinned so the definer right cannot be
-- redirected at a shadowed table.
--
-- `(select auth.uid())` is wrapped in a subselect so Postgres caches it as an
-- InitPlan instead of re-evaluating it once per row.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;--> statement-breakpoint

REVOKE ALL ON SCHEMA app FROM public, anon, authenticated;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO authenticated;--> statement-breakpoint

-- Workspaces the caller belongs to.
CREATE OR REPLACE FUNCTION app.workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.workspace_id FROM membership m WHERE m.user_id = (SELECT auth.uid());
$$;--> statement-breakpoint

-- The caller's role in one workspace, or NULL if they are not a member.
CREATE OR REPLACE FUNCTION app.role_in(ws uuid)
RETURNS member_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.role FROM membership m
   WHERE m.user_id = (SELECT auth.uid()) AND m.workspace_id = ws;
$$;--> statement-breakpoint

-- product-spec.md §14: workspace-level role, per-product visibility toggle.
CREATE OR REPLACE FUNCTION app.can_see_product(p uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM membership m
      JOIN product pr ON pr.id = p AND pr.workspace_id = m.workspace_id
      LEFT JOIN membership_product mp
        ON mp.membership_id = m.id AND mp.product_id = p
     WHERE m.user_id = (SELECT auth.uid())
       AND (m.all_products OR mp.product_id IS NOT NULL)
  );
$$;--> statement-breakpoint

-- The product an item belongs to, for artifact policies two levels down.
CREATE OR REPLACE FUNCTION app.item_product(i uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT it.product_id FROM item it WHERE it.id = i;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.artifact_item(a uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ar.item_id FROM artifact ar WHERE ar.id = a;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.artifact_kind_of(a uuid)
RETURNS artifact_kind
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ar.kind FROM artifact ar WHERE ar.id = a;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Append-only enforcement.
--
-- Three independent layers, because RLS alone is not enough: the service role
-- holds BYPASSRLS, and this project puts a service-role key in the seed script.
-- The trigger is the only layer that role cannot walk past.
--   1. RLS      — no UPDATE/DELETE policy exists (below).
--   2. Grants   — UPDATE/DELETE revoked from anon and authenticated.
--   3. Trigger  — raises for everyone, service role included.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.deny_mutation()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted (row %)',
    TG_TABLE_NAME, TG_OP, COALESCE(OLD.id::text, '?')
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

CREATE TRIGGER artifact_version_append_only
  BEFORE UPDATE OR DELETE ON artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

CREATE TRIGGER activity_append_only
  BEFORE UPDATE OR DELETE ON activity
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

-- Version numbers come from the database, never the client. The unique index
-- on (artifact_id, version_no) is the backstop against a concurrent insert.
CREATE OR REPLACE FUNCTION app.assign_version_no()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO NEW.version_no
    FROM artifact_version
   WHERE artifact_id = NEW.artifact_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER artifact_version_number
  BEFORE INSERT ON artifact_version
  FOR EACH ROW EXECUTE FUNCTION app.assign_version_no();--> statement-breakpoint

-- updated_at maintenance for the mutable tables. Artifacts have none.
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER workspace_touch BEFORE UPDATE ON workspace
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER membership_touch BEFORE UPDATE ON membership
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER product_touch BEFORE UPDATE ON product
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER opportunity_touch BEFORE UPDATE ON opportunity
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER item_touch BEFORE UPDATE ON item
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

REVOKE UPDATE, DELETE ON artifact_version FROM anon, authenticated;--> statement-breakpoint
REVOKE UPDATE, DELETE ON activity FROM anon, authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security. Enabled AND forced on every table.
-- A verb with no policy is denied; the gaps below are deliberate.
-- ---------------------------------------------------------------------------
ALTER TABLE workspace          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspace          FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE membership         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE membership         FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE membership_product ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE membership_product FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product            FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE opportunity        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE opportunity        FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE item               ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE item               FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE artifact           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE artifact           FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE artifact_version   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE artifact_version   FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE activity           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE activity           FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

-- workspace ------------------------------------------------------------------
CREATE POLICY workspace_select ON workspace FOR SELECT TO authenticated
  USING (id IN (SELECT app.workspace_ids()));--> statement-breakpoint
CREATE POLICY workspace_update ON workspace FOR UPDATE TO authenticated
  USING (app.role_in(id) = 'owner') WITH CHECK (app.role_in(id) = 'owner');--> statement-breakpoint
-- No INSERT policy: a user with no membership satisfies no predicate, so the
-- only way in is app.bootstrap_workspace() below. No DELETE policy at all.

-- membership -----------------------------------------------------------------
CREATE POLICY membership_select ON membership FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT app.workspace_ids()));--> statement-breakpoint
CREATE POLICY membership_insert ON membership FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY membership_update ON membership FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) = 'owner')
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY membership_delete ON membership FOR DELETE TO authenticated
  USING (app.role_in(workspace_id) = 'owner');--> statement-breakpoint

-- membership_product ---------------------------------------------------------
CREATE POLICY membership_product_select ON membership_product FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT app.workspace_ids()));--> statement-breakpoint
CREATE POLICY membership_product_insert ON membership_product FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY membership_product_update ON membership_product FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) = 'owner')
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY membership_product_delete ON membership_product FOR DELETE TO authenticated
  USING (app.role_in(workspace_id) = 'owner');--> statement-breakpoint

-- product --------------------------------------------------------------------
CREATE POLICY product_select ON product FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT app.workspace_ids()) AND app.can_see_product(id));--> statement-breakpoint
CREATE POLICY product_insert ON product FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY product_update ON product FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) = 'owner')
  WITH CHECK (app.role_in(workspace_id) = 'owner');--> statement-breakpoint
CREATE POLICY product_delete ON product FOR DELETE TO authenticated
  USING (app.role_in(workspace_id) = 'owner');--> statement-breakpoint

-- opportunity ----------------------------------------------------------------
-- §14: Developer cannot edit opportunities; Viewer is read-only.
CREATE POLICY opportunity_select ON opportunity FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT app.workspace_ids()) AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY opportunity_insert ON opportunity FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY opportunity_update ON opportunity FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id))
  WITH CHECK (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY opportunity_delete ON opportunity FOR DELETE TO authenticated
  USING (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint

-- item -----------------------------------------------------------------------
CREATE POLICY item_select ON item FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT app.workspace_ids()) AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY item_insert ON item FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY item_update ON item FOR UPDATE TO authenticated
  USING (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id))
  WITH CHECK (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint
CREATE POLICY item_delete ON item FOR DELETE TO authenticated
  USING (app.role_in(workspace_id) IN ('owner','product') AND app.can_see_product(product_id));--> statement-breakpoint

-- artifact -------------------------------------------------------------------
-- §14: Developer authors technical artifacts and nothing else.
CREATE POLICY artifact_select ON artifact FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint
CREATE POLICY artifact_insert ON artifact FOR INSERT TO authenticated
  WITH CHECK (
    app.can_see_product(app.item_product(item_id))
    AND (
      app.role_in(workspace_id) IN ('owner','product')
      OR (app.role_in(workspace_id) = 'developer' AND kind = 'tech_spec')
    )
  );--> statement-breakpoint
CREATE POLICY artifact_delete ON artifact FOR DELETE TO authenticated
  USING (
    app.role_in(workspace_id) IN ('owner','product')
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint
-- No UPDATE policy: an artifact row is identity only, and identity does not change.

-- artifact_version -----------------------------------------------------------
-- SELECT and INSERT only. The absence of UPDATE and DELETE policies here is the
-- first of the three append-only layers and is deliberate.
CREATE POLICY artifact_version_select ON artifact_version FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(app.item_product(app.artifact_item(artifact_id)))
  );--> statement-breakpoint
CREATE POLICY artifact_version_insert ON artifact_version FOR INSERT TO authenticated
  WITH CHECK (
    app.can_see_product(app.item_product(app.artifact_item(artifact_id)))
    AND (
      app.role_in(workspace_id) IN ('owner','product')
      OR (
        app.role_in(workspace_id) = 'developer'
        AND app.artifact_kind_of(artifact_id) = 'tech_spec'
      )
    )
  );--> statement-breakpoint

-- activity -------------------------------------------------------------------
CREATE POLICY activity_select ON activity FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND (product_id IS NULL OR app.can_see_product(product_id))
  );--> statement-breakpoint
CREATE POLICY activity_insert ON activity FOR INSERT TO authenticated
  WITH CHECK (app.role_in(workspace_id) IN ('owner','product','developer'));--> statement-breakpoint
-- Viewer appears in no write policy anywhere: §14 read-only means read-only.

-- ---------------------------------------------------------------------------
-- First run. A signed-in human with no workspace gets one, and owns it.
--
-- SECURITY DEFINER so the request path never needs the service-role key: a user
-- with no membership can satisfy no workspace INSERT policy, and this is the
-- only sanctioned way in. It refuses to run twice, so it cannot be used to mint
-- workspaces in a loop.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.bootstrap_workspace(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_workspace uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'bootstrap_workspace requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (SELECT 1 FROM membership WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'caller already belongs to a workspace'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO workspace (name) VALUES (p_name) RETURNING id INTO v_workspace;

  INSERT INTO membership (workspace_id, user_id, role, all_products)
  VALUES (v_workspace, v_user, 'owner', true);

  -- §2: every mutating action writes an activity row.
  INSERT INTO activity
    (workspace_id, actor_kind, actor_user_id, action, trigger_source, subject_table, subject_id)
  VALUES
    (v_workspace, 'human', v_user, 'workspace.created', 'user', 'workspace', v_workspace);

  RETURN v_workspace;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.bootstrap_workspace(text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.bootstrap_workspace(text) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- PostgREST only exposes `public`, so the callable surface is a thin wrapper.
-- The logic stays in `app`, which no client can reach directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_workspace(p_name text)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT app.bootstrap_workspace(p_name);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.bootstrap_workspace(text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.bootstrap_workspace(text) TO authenticated;--> statement-breakpoint
