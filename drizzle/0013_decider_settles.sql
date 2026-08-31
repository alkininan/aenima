-- ============================================================================
-- T2.5 review — §14's Decider settles a Must whatever their workspace role.
--
-- 0012 asked the role first and the Decider second:
--
--     IF v_role NOT IN ('owner','product') THEN RETURN 'not-permitted'; END IF;
--     IF v_tag = 'must' AND NOT app.may_settle_must(...) THEN RETURN 'not-decider';
--
-- That ordering was written to make the *answer* name the real obstacle, and it
-- does: a Developer who is not the Decider is told their role does not settle
-- gaps, rather than being told it is the Decider's call — which would imply that
-- being the Decider would help. The argument is good and this migration keeps
-- it. What it got wrong is the case it did not cover: a Developer or a Viewer
-- who **is** the product's named Decider was told the same thing, and for them
-- being the Decider *was* supposed to help.
--
-- §14 is unqualified about this. "Each product names a **Decider** (config
-- field) who approves spec patches, accepts flags, and can waive walkthroughs."
-- It names a person, not a role, and the appointment is per product — it is an
-- explicit assignment, and a general role table must not silently shadow one.
-- The Owner is the fallback for the *absence* of a Decider, not an override of a
-- present one.
--
-- So the order becomes: **is this person the Decider (or the Owner) — and if
-- not, do they have a role that writes gaps at all.** Both answers are still
-- distinct, and each still names its own obstacle:
--
--   owner                      settles both tags
--   named Decider, any role    settles both tags        ← what this migration adds
--   product, not the Decider   Should yes, Must 'not-decider'
--   anyone else                'not-permitted', both tags
--
-- ---------------------------------------------------------------------------
-- **This widens two policies, and that is the honest cost of the rule.**
--
-- A function gate is not where this is decided — the functions are SECURITY
-- INVOKER, so `gap_update` and `activity_insert` have the last word. Under
-- 0001/0004 a Developer-Decider's UPDATE matches zero rows and a Viewer-
-- Decider's ledger INSERT raises, so honouring §14 in plpgsql alone would have
-- produced 'not-permitted' from the re-read anyway — the reorder would have
-- been a comment, not a change. The policies have to say it too.
--
-- What each widening actually grants, stated plainly rather than minimised:
--
--   gap_update       a named Decider may UPDATE gap rows **of the product they
--                    decide**, which is the gap-writing power a Product-role
--                    member already holds, narrowed to one product. §14 calls
--                    that power "accepts flags"; accepting a flag *is* writing a
--                    gap row, so this is the policy finally saying what §14 says.
--
--   activity_insert  a named Decider may write ledger rows carrying that
--                    product's id. Strictly narrower than what the same policy
--                    already grants every Developer, which is any activity row
--                    anywhere in the workspace.
--
-- Both are additive and both are scoped by `app.is_product_decider`, which is
-- itself scoped to workspaces the caller is a member of: a Decider removed from
-- the workspace loses it, and `product` isolation is untouched — nothing here
-- can reach a product the caller does not decide. `can_see_product` still gates
-- gap_update as it did, so per-product visibility is unchanged.
--
-- CLAUDE.md calls product isolation a security boundary. This does not cross it.
-- It does move a line inside one, which is why it is its own migration with its
-- own argument rather than an edit smuggled into a copy of 0012.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §14's appointment, as a predicate a policy can ask.
--
-- SECURITY DEFINER for the reason 0001's helpers are: a predicate reading
-- `product` under the caller's own RLS would deny a legitimate Decider the
-- moment `product_select` narrowed for an unrelated reason, and a gate that
-- fails *open* on a row it cannot see would be worse than one that fails shut.
--
-- The membership clause is a narrowing, not a courtesy: it is what keeps the
-- appointment from outliving the account's presence in the workspace.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_product_decider(p uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM product pr
     WHERE pr.id = p
       AND pr.decider_user_id = (SELECT auth.uid())
       AND pr.workspace_id IN (SELECT app.workspace_ids())
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.is_product_decider(uuid) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_product_decider(uuid) TO authenticated;--> statement-breakpoint

-- Restated over the new helper. Same answer as 0012's for every row 0012 could
-- reach; the join it replaces was the same EXISTS written inline.
CREATE OR REPLACE FUNCTION app.may_settle_must(ws uuid, itm uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.role_in(ws) = 'owner'
      OR EXISTS (
           SELECT 1
             FROM item i
            WHERE i.workspace_id = ws
              AND i.id = itm
              AND app.is_product_decider(i.product_id)
         );
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The two policies, widened by exactly one disjunct each.
--
-- Dropped and recreated rather than altered: CREATE OR REPLACE POLICY does not
-- exist, and ALTER POLICY … USING restates the whole expression anyway, so the
-- pair below is the smaller diff to read.
-- ---------------------------------------------------------------------------
DROP POLICY gap_update ON gap;--> statement-breakpoint
CREATE POLICY gap_update ON gap FOR UPDATE TO authenticated
  USING (
    (
      app.role_in(workspace_id) IN ('owner', 'product')
      OR app.is_product_decider(app.item_product(item_id))
    )
    AND app.can_see_product(app.item_product(item_id))
  )
  WITH CHECK (
    (
      app.role_in(workspace_id) IN ('owner', 'product')
      OR app.is_product_decider(app.item_product(item_id))
    )
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint

DROP POLICY activity_insert ON activity;--> statement-breakpoint
CREATE POLICY activity_insert ON activity FOR INSERT TO authenticated
  WITH CHECK (
    app.role_in(workspace_id) IN ('owner', 'product', 'developer')
    OR app.is_product_decider(product_id)
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Both moves, with the gate reordered. Bodies are 0012's except for the block
-- marked below; `CREATE OR REPLACE` because the signature is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_gap(p_gap_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user      uuid := (SELECT auth.uid());
  v_workspace uuid;
  v_item      uuid;
  v_check     text;
  v_tag       gap_tag;
  v_state     gap_disposition;
  v_role      member_role;
  v_decides   boolean;
  v_reason    text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'accept_gap requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(v_reason) = 0    THEN RETURN 'reason-required'; END IF;
  IF length(v_reason) > 2000 THEN RETURN 'reason-too-long'; END IF;

  SELECT g.workspace_id, g.item_id, g.check_id, g.tag
    INTO v_workspace, v_item, v_check, v_tag
    FROM gap g
   WHERE g.id = p_gap_id;

  IF NOT FOUND THEN RETURN 'not-found'; END IF;

  -- The disposition is still deliberately not read here; the UPDATE's own WHERE
  -- is the only thing that decides it, and the re-read below is what turns a
  -- zero-row write into a sentence. See 0012.

  -- §14, in the order the appointment demands. The Decider question is asked
  -- first because it can override the role table; the role question is asked
  -- second and only of people the appointment did not already answer for. Both
  -- obstacles keep their own name: someone with no gap-writing role and no
  -- appointment hears about their role, and someone with the role but not the
  -- appointment hears about the Decider.
  v_decides := app.may_settle_must(v_workspace, v_item);
  v_role    := app.role_in(v_workspace);

  IF NOT v_decides AND (v_role IS NULL OR v_role NOT IN ('owner', 'product')) THEN
    RETURN 'not-permitted';
  END IF;

  IF v_tag = 'must' AND NOT v_decides THEN
    RETURN 'not-decider';
  END IF;

  UPDATE gap
     SET disposition         = 'accepted'::gap_disposition,
         resolved_by_user_id = v_user,
         resolved_at         = now(),
         resolution_note     = v_reason
   WHERE id           = p_gap_id
     AND workspace_id = v_workspace
     AND disposition  = 'open';

  IF NOT FOUND THEN
    SELECT g.disposition INTO v_state FROM gap g WHERE g.id = p_gap_id;
    IF NOT FOUND THEN RETURN 'not-found'; END IF;
    RETURN CASE WHEN v_state = 'open' THEN 'not-permitted' ELSE 'not-open' END;
  END IF;

  INSERT INTO activity (
    workspace_id, product_id, actor_kind, actor_user_id,
    action, trigger_source, subject_table, subject_id, metadata
  ) VALUES (
    v_workspace, app.item_product(v_item), 'human', v_user,
    'gap.accepted', 'user', 'gap', p_gap_id,
    jsonb_build_object('checkId', v_check, 'tag', v_tag::text, 'reason', v_reason)
  );

  RETURN 'accepted';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.reopen_gap(p_gap_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user      uuid := (SELECT auth.uid());
  v_workspace uuid;
  v_item      uuid;
  v_check     text;
  v_tag       gap_tag;
  v_state     gap_disposition;
  v_role      member_role;
  v_decides   boolean;
  v_note      text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'reopen_gap requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT g.workspace_id, g.item_id, g.check_id, g.tag, g.resolution_note
    INTO v_workspace, v_item, v_check, v_tag, v_note
    FROM gap g
   WHERE g.id = p_gap_id;

  IF NOT FOUND THEN RETURN 'not-found'; END IF;

  -- Gated exactly as accepting is, reordering included: whoever could have taken
  -- the debt on can hand it back, and nobody else can quietly undo their name.
  v_decides := app.may_settle_must(v_workspace, v_item);
  v_role    := app.role_in(v_workspace);

  IF NOT v_decides AND (v_role IS NULL OR v_role NOT IN ('owner', 'product')) THEN
    RETURN 'not-permitted';
  END IF;

  IF v_tag = 'must' AND NOT v_decides THEN
    RETURN 'not-decider';
  END IF;

  UPDATE gap
     SET disposition         = 'open'::gap_disposition,
         resolved_by_user_id = NULL,
         resolved_at         = NULL,
         resolution_note     = NULL
   WHERE id           = p_gap_id
     AND workspace_id = v_workspace
     AND disposition  = 'accepted';

  IF NOT FOUND THEN
    SELECT g.disposition INTO v_state FROM gap g WHERE g.id = p_gap_id;
    IF NOT FOUND THEN RETURN 'not-found'; END IF;
    RETURN CASE WHEN v_state = 'accepted' THEN 'not-permitted' ELSE 'not-accepted' END;
  END IF;

  INSERT INTO activity (
    workspace_id, product_id, actor_kind, actor_user_id,
    action, trigger_source, subject_table, subject_id, metadata
  ) VALUES (
    v_workspace, app.item_product(v_item), 'human', v_user,
    'gap.reopened', 'user', 'gap', p_gap_id,
    jsonb_build_object('checkId', v_check, 'tag', v_tag::text, 'undid', v_note)
  );

  RETURN 'reopened';
END;
$$;
