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
-- it. What it got wrong is the case it did not cover: a Developer who **is** the
-- product's named Decider was told the same thing, and for them being the
-- Decider *was* supposed to help.
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
--   product, and the Decider   settles both tags
--   developer, and the Decider settles both tags        ← what this migration adds
--   product, not the Decider   Should yes, Must 'not-decider'
--   viewer, and the Decider    'not-permitted', both tags — deferred, see below
--   anyone else                'not-permitted', both tags
--
-- ============================================================================
-- **This migration's own cold read found two defects in its first draft, and
-- the shape below is the answer to both.** The draft added
-- `app.is_product_decider` as one unscoped disjunct to `gap_update` and one to
-- `activity_insert`, and argued that each grant was narrower than one somebody
-- else already held. Both arguments compared against the wrong principal.
--
--   1. `gap_update` is a **whole-row** UPDATE policy. RLS cannot name columns,
--      so "may write this row" and "may settle this gap" are the same sentence
--      to it. The disjunct therefore handed a Decider the power to rewrite
--      `tag` from `must` to `should` — retiring a handover-blocking gap with no
--      acceptance and no ledger row — plus `evidence`, which §5 defines as the
--      scorer's quoted failure, plus `check_id`, plus `disposition = 'excluded'`,
--      which §14 gives to Product, plus another person's uuid in
--      `resolved_by_user_id`, which is 0012's stamp forged by hand. §14 gives a
--      Decider three approvals; none of those is one of them.
--
--      The draft's defence — "this is the gap-writing power a Product-role
--      member already holds, narrowed to one product" — is true about the scope
--      and silent about the fact that the power itself was never bounded to
--      settling. It is bounded now, by `app.gap_settle_shape` below.
--
--   2. `activity_insert` needed no widening at all, and the widening was worse
--      than 1. That policy has no `can_see_product` gate, 0003 dropped
--      `activity_actor_fk`, and `action`, `subject_table` and `subject_id` are
--      unconstrained. So the disjunct let a Decider append rows naming another
--      human, about a product they cannot see, to a table that is append-only
--      by three layers and that §15 calls load-bearing. The draft's defence —
--      "strictly narrower than what the same policy already grants every
--      Developer" — is true of a Developer-Decider and false of a
--      Viewer-Decider, who previously had no insert right whatsoever. It
--      compared the new grant against a principal that was not the one being
--      newly admitted.
--
--      **`activity_insert` is not touched by this migration.** Once the
--      appointment is scoped to roles §14 already lets write (below), the only
--      live case is a Developer-Decider, and 0001's `'developer'` arm has
--      admitted them since T0.4. There is nothing left for a disjunct to grant.
--
--      **Stated plainly, because it was asked: no, the functions do not need a
--      SECURITY DEFINER half.** They stay INVOKER and the two policies keep the
--      last word, exactly as 0012 argued. A definer half would only become
--      necessary if the open question below is answered "the Viewer row wins
--      for everything except the appointment" — because then a Viewer-Decider
--      would need a ledger row that `activity_insert` must go on refusing them
--      by any other route. If that day comes, **the argument for it has to be
--      made fresh.** 0012's justification for definer was "it can only subtract
--      — it is consumed as `AND NOT (...)`, never as a grant", and that clause
--      stopped being true the moment a definer predicate became a positive
--      disjunct in a policy. 0012's comment has been corrected to say so rather
--      than left to be inherited.
--
-- ============================================================================
-- **What is deferred, and why it is deferred rather than decided here.**
--
-- §14's Viewer row — "Read-only | Everything else" — is exactly as unqualified
-- as its Decider sentence, and 0001 read it as "Viewer appears in no write
-- policy anywhere". A product that names a Viewer as its Decider puts the two
-- in direct conflict, and which one wins is a product decision, not a
-- migration's. It is filed as open question 20 in docs/build-log.md.
--
-- Until it is answered, the appointment is scoped to the roles §14 already lets
-- write, which makes the live case the Developer-Decider and leaves a
-- Viewer-Decider exactly where 0004 and 0001 left them: `not-permitted`, no gap
-- write, no ledger row. Deferring costs one enum literal in one policy.
--
-- CLAUDE.md calls product isolation a security boundary. Nothing here crosses
-- it: `can_see_product` still gates `gap_update` unchanged, and
-- `app.is_product_decider` is scoped to workspaces the caller is still a member
-- of. It does move a line inside one, which is why it is its own migration with
-- its own argument rather than an edit smuggled into a copy of 0012.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §14's appointment, as a predicate a policy can ask.
--
-- SECURITY DEFINER for the reason 0001's helpers are: a predicate reading
-- `product` under the caller's own RLS would deny a legitimate Decider the
-- moment `product_select` narrowed for an unrelated reason, and a gate that
-- fails *open* on a row it cannot see would be worse than one that fails shut.
--
-- **Unlike 0001's helpers and unlike 0012's use of `may_settle_must`, this one
-- is consumed as a grant** — a positive disjunct in `gap_update`. So the usual
-- "definer can only subtract" comfort does not apply and the definer read has
-- to be justified on its own: it reads exactly one boolean off one `product`
-- row, the row is named by the gap being written rather than by the caller, and
-- the two things it can say yes to are both narrowed again by the policy that
-- asks it — `can_see_product` on the row, and `app.gap_settle_shape` on the
-- write. A caller who cannot see the product still cannot write to it.
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
-- reach; the join it replaces was the same EXISTS written inline, and
-- `item_product_fk` is composite, so the dropped `p.workspace_id =
-- i.workspace_id` was already implied by `i.workspace_id = ws`.
--
-- **Deliberately not role-aware**, even though `gap_update` below is. This
-- answers §14's question — "does the product route a blocking gap through this
-- person" — and the role matrix is a different question, asked separately in
-- both callers and enforced for real by the policy. Copying the policy's role
-- list into a second place is the drift 0012 refused when it declined to
-- restate `can_see_product`, and it would buy nothing: a Viewer-Decider is
-- refused by `gap_update`, the UPDATE matches zero rows, and the re-read turns
-- that into the same `not-permitted` the role gate would have returned.
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
-- One policy, widened by exactly one disjunct, and that disjunct scoped twice:
-- to the role, here — and to the write, by the trigger below.
--
-- `= 'developer'` rather than "any role", for the reason in the header: the
-- Viewer conflict is open question 20 and answering it in SQL is not this
-- migration's call. `'product'` is absent from the disjunct because the first
-- arm already holds it, and `'owner'` because §14 makes the Owner the fallback
-- Decider rather than an appointee.
--
-- Dropped and recreated rather than altered: CREATE OR REPLACE POLICY does not
-- exist, and ALTER POLICY … USING restates the whole expression anyway, so the
-- pair below is the smaller diff to read.
--
-- `can_see_product` is outside the disjunction on purpose. Inside it, the
-- appointment would become a way around per-product visibility; outside it, a
-- Decider who cannot see the product is refused exactly as anyone else is.
-- ---------------------------------------------------------------------------
DROP POLICY gap_update ON gap;--> statement-breakpoint
CREATE POLICY gap_update ON gap FOR UPDATE TO authenticated
  USING (
    (
      app.role_in(workspace_id) IN ('owner', 'product')
      OR (
        app.role_in(workspace_id) = 'developer'
        AND app.is_product_decider(app.item_product(item_id))
      )
    )
    AND app.can_see_product(app.item_product(item_id))
  )
  WITH CHECK (
    (
      app.role_in(workspace_id) IN ('owner', 'product')
      OR (
        app.role_in(workspace_id) = 'developer'
        AND app.is_product_decider(app.item_product(item_id))
      )
    )
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The second scope: **what the appointment may write, not merely which rows.**
--
-- §14 gives a Decider three approvals and "accepts flags" is the one that
-- reaches this table. Accepting a flag is a disposition transition carrying the
-- accepter's own name — the two statements `accept_gap` and `reopen_gap` issue,
-- and nothing else. RLS cannot say that: a policy is a row predicate and every
-- column rides in on the same yes. A row-level BEFORE trigger is the only place
-- in Postgres that can compare OLD to NEW, so that is where the column half of
-- §14's grant lives.
--
-- **This is a narrowing and can only ever be one.** It grants nothing, it is
-- SECURITY INVOKER, and it runs after `gap_update` has already decided the row
-- is reachable. Delete it and the policy above is the draft this migration was
-- sent back to fix.
--
-- Two callers are deliberately not its subject:
--
--   * **No `auth.uid()`.** The direct connection in `src/db/client.ts` — which
--     `writeRun` uses to write `gap.restated` and `gap.closed`, and which the
--     seed uses — holds BYPASSRLS, never met `gap_update`, and is governed by
--     0001's third layer rather than this one. `closed` is the machine's
--     disposition and a settle-shaped trigger must not be what stops a re-score.
--   * **Owner and Product.** 0004 gave them the whole row and this ticket does
--     not take it back; narrowing them is open question 21. Their role is read
--     off `OLD.workspace_id`, never `NEW`, so a caller cannot walk into the
--     early return by writing a workspace they own into the row — and moving
--     `workspace_id` is refused below in any case.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.gap_settle_shape()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL OR app.role_in(OLD.workspace_id) IN ('owner', 'product') THEN
    RETURN NEW;
  END IF;

  -- Everything still here reached the row through §14's appointment alone.
  --
  -- The identity of the gap is not the Decider's to edit. `tag` decides whether
  -- the gap blocks handover; `evidence` is §5's quoted failure and belongs to
  -- the scorer; `check_id` is which rubric check failed; `item_id` is which
  -- item it failed on. Accepting a flag changes none of them.
  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
  OR NEW.item_id      IS DISTINCT FROM OLD.item_id
  OR NEW.check_id     IS DISTINCT FROM OLD.check_id
  OR NEW.tag          IS DISTINCT FROM OLD.tag
  OR NEW.evidence     IS DISTINCT FROM OLD.evidence
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'gap %: the Decider settles a gap and does not rewrite one', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- And the transition is one of the two moves, with the stamp §5 requires.
  --
  -- `excluded` is §5's *first* move, which §14 gives to Product ("confirm
  -- exclusions"); `closed` is the machine's. Neither is an acceptance, so
  -- neither is reachable from here — and nor is `accepted → accepted`, which
  -- would be editing somebody's settled note in place.
  --
  -- `resolved_by_user_id = v_user` is 0012's "the stamp is `auth.uid()` read
  -- inside the function, never an argument" made true of the *table* and not
  -- only of the function: a Decider accepts in their own name or not at all.
  -- `resolved_at = now()` is the same property for the clock — `now()` is the
  -- transaction timestamp, so `accept_gap`'s own write satisfies it exactly and
  -- a backdated one cannot. `gap_resolution_shape` already forbids a blank note
  -- on an accepted row and any note at all on an open one, so neither is
  -- restated here.
  IF NOT (
       (OLD.disposition = 'open'     AND NEW.disposition = 'accepted'
          AND NEW.resolved_by_user_id = v_user
          AND NEW.resolved_at = now())
    OR (OLD.disposition = 'accepted' AND NEW.disposition = 'open')
  ) THEN
    RAISE EXCEPTION
      'gap %: % to % is not a settle the Decider may make', OLD.id,
      OLD.disposition, NEW.disposition
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Named to sort before `gap_touch`, which is the other BEFORE UPDATE trigger on
-- this table: Postgres fires same-timing row triggers in name order, and a
-- refusal should happen before `updated_at` is touched rather than after.
CREATE TRIGGER gap_settle_shape BEFORE UPDATE ON gap
  FOR EACH ROW EXECUTE FUNCTION app.gap_settle_shape();--> statement-breakpoint

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
  --
  -- A Viewer the product *does* name passes this gate and is then refused by
  -- `gap_update`, which is the re-read's `not-permitted` — the same sentence,
  -- reached by observation rather than by a second copy of the policy's role
  -- list. Open question 20 is what decides whether that stays true.
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
