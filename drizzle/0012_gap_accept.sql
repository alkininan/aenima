-- ============================================================================
-- T2.5 — "we accept this risk": §5's third negotiation move, as two functions.
--
-- §5: "never closes the gap; converts it to an accepted gap stamped with the
-- accepter's name, routed through the Decider if handover-blocking." Three
-- clauses, three properties this migration makes true rather than conventional:
--
--   "never closes the gap"        `closed` is the machine's disposition and
--                                 stays unreachable from here. Accepting writes
--                                 `accepted`; the debt survives, dimmed, on the
--                                 page. §1 law 7: hiding it would delete the
--                                 name, which is the only part of accepting a
--                                 risk that costs anything.
--   "stamped with the name"       the stamp is `auth.uid()` read *inside* the
--                                 function, never an argument. A caller cannot
--                                 accept a risk in someone else's name because
--                                 there is no parameter through which to try.
--   "routed through the Decider"  `app.may_settle_must`, reading `product` at
--                                 write time. The page that rendered the form
--                                 is not consulted and could not be trusted if
--                                 it were: it rendered seconds ago and the
--                                 assignment may have moved since.
--
-- Hand-written, like every migration since 0002.
--
-- ---------------------------------------------------------------------------
-- **The atomicity mechanism, named — this is the first human write in the
-- product and it sets the precedent for every move after it.**
--
-- The move is two statements: the gap UPDATE, and the `activity` row §2 requires
-- of every mutating action. They commit together or not at all. A gap that
-- changed hands with no ledger row is the history §15 calls load-bearing going
-- missing; a ledger row with no gap change is the ledger saying something that
-- did not happen. PostgREST cannot transact two requests, so two `.update()` /
-- `.insert()` calls from the query layer cannot express this.
--
-- Three ways to get one transaction, and why this is the one:
--
--   1. The direct connection plus `sql.begin`, as `writeRun` does. **Rejected:**
--      that connection bypasses RLS entirely, so the boundary would move out of
--      the database and into our own remembering. `writeRun` earns the
--      exemption because `scoring_run` has no INSERT policy at all — a client
--      that could write its own run row could write its own score. No such
--      exemption exists here.
--   2. A SECURITY DEFINER function, as `app.bootstrap_workspace` is.
--      **Rejected:** that one is DEFINER because a user with no membership can
--      satisfy no INSERT policy on `workspace` — it has to act before the caller
--      has any rights at all. Every caller here is already a member.
--   3. **A SECURITY INVOKER function called over PostgREST.** Chosen.
--
-- PostgREST wraps every request in a transaction, RPC included, and a failure
-- inside rolls the whole thing back — so "the gap moved but the ledger did not"
-- is not merely unlikely, it is unrepresentable. That is the same argument
-- `writeRun` makes for its own `BEGIN`: "§5's 'no partial gaps' is not a
-- discipline here, it is a `BEGIN`."
--
-- SECURITY INVOKER — the default, and Supabase's documented best practice — runs
-- the body as the signed-in user, so `auth.uid()` resolves and the two policies
-- that already exist decide what it may write, unchanged and unloosened:
--
--   gap_update      (0004)  role owner|product, AND can_see_product
--   activity_insert (0001)  role owner|product|developer
--
-- **Nothing here bypasses RLS.** The one SECURITY DEFINER function added below
-- is a predicate that can only ever narrow.
--
-- **VOLATILE, and that is a correctness property rather than a planner hint.**
-- PostgREST serves a volatile function over POST and a stable one over GET, and
-- Next memoizes identical GETs for a whole render pass — 0002's incident, where
-- a read after a write replayed the pre-write response. A `STABLE` marker here
-- would be that bug wearing a planner hint's clothes. Volatile is the default,
-- so this is a note for whoever is tempted to "optimise" it.
--
-- ---------------------------------------------------------------------------
-- **Why a returned status token and not a RAISE, for the declared outcomes.**
--
-- PostgREST does map a custom SQLSTATE onto an HTTP status and a JSON error
-- body, so a RAISE would survive to the caller as `error.code`. But a RAISE
-- rolls the transaction back, and most of the outcomes below are **no-ops we
-- want to report**: "someone accepted this while you were typing" is the correct
-- answer to the request, not an error about it. Rolling back to say so is using
-- the error channel for a normal result.
--
-- It also keeps CLAUDE.md's rule intact — "a failure's `detail` string is a
-- diagnostic for the log and the developer, never surface copy". A RAISE's
-- payload *is* a detail string; a token is already the *kind* that rule says to
-- map to a translated sentence.
--
-- **Genuine failures still raise and still roll back**: a null `auth.uid()`
-- below, a constraint, or a policy refusing the ledger row. Declared outcomes
-- return; undeclared ones raise.
--
-- ---------------------------------------------------------------------------
-- **Write-time truth, in both directions (the reconciler's lesson).**
--
-- The accept re-asserts `disposition = 'open'` in its own WHERE and the reopen
-- re-asserts `'accepted'`. The read that classifies is not the write that acts:
-- between them a re-score can close the gap, or another person can accept it.
-- `writeRun` states it exactly — "the guard makes the snapshot's assumption a
-- condition of the write rather than a hope". A row that moved is a **reported
-- no-op**: no overwrite, no second stacked state, no silence, and no ledger row.
--
-- **No `SELECT … FOR UPDATE`.** Under READ COMMITTED an UPDATE that collides
-- with a concurrent writer does not use its own snapshot row: it blocks on the
-- row lock and then re-evaluates its WHERE against the committed successor. So
-- the guarded UPDATE is already an atomic check-and-act, and a prior lock would
-- add a statement, and a deadlock surface, to buy a property we have. The
-- leading SELECT classifies only; it takes no lock and is allowed to be stale.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The note becomes user-writable with this ticket, so it gets an upper bound.
--
-- 2000 matches `gap_evidence_len`. **Only the bound.** `gap_resolution_shape`
-- already refuses a null or blank note on an accepted row, and stating that
-- twice would mean two constraints failing on one row — the reader, and the
-- test that names a constraint, would then be told whichever fired first. Each
-- says one thing: shape decides which columns a disposition demands, this
-- decides how long the note may be.
--
-- The `IS NULL` arm is 0009's lesson, and it is load-bearing rather than tidy:
-- a CHECK rejects a row only when its expression is FALSE, and
-- `length(btrim(null)) <= 2000` is NULL. Without the guard this constraint would
-- forbid nothing at all on the rows where the column is null.
-- ---------------------------------------------------------------------------
ALTER TABLE gap ADD CONSTRAINT "gap_resolution_note_len" CHECK (
  "resolution_note" IS NULL OR length(btrim("resolution_note")) <= 2000
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §5's "routed through the Decider", as one predicate both moves share.
--
-- §14: each product names a **Decider** who "accepts flags"; the Owner "can do
-- everything" and is the **Fallback Decider**, so a product that names none is
-- decided by whoever owns the workspace — which is just the first half of this
-- OR. (T2.5's ticket said Owner-only "since product.decider does not exist yet";
-- it has existed since 0000 and is populated on both seeded products. The rule
-- below is §14's, not the ticket's. See docs/build-log.md.)
--
-- SECURITY DEFINER for the reason 0001's helpers are: a predicate reading
-- `product` under the caller's own RLS would deny a legitimate Decider the
-- moment `product_select` narrowed for an unrelated reason, and a gate that
-- fails *open* on a row it cannot see would be worse than one that fails shut.
-- Definer here can only subtract — it is consumed as `AND NOT (...)`, never as a
-- grant — and `app.role_in` is itself definer, so nesting changes nothing.
--
-- Takes the **item**, not the product, so a caller cannot pass a product it
-- picked: the item id comes off the gap row, which came off the gap id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.may_settle_must(ws uuid, itm uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.role_in(ws) = 'owner'
      OR EXISTS (
           SELECT 1
             FROM item i
             JOIN product p ON p.workspace_id = i.workspace_id AND p.id = i.product_id
            WHERE i.workspace_id = ws
              AND i.id = itm
              AND p.decider_user_id = (SELECT auth.uid())
         );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.may_settle_must(uuid, uuid) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.may_settle_must(uuid, uuid) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Accepting. Returns exactly one of:
--
--   'accepted'        the gap is now a named debt
--   'reason-required' nothing was written; the field needs filling in
--   'reason-too-long' likewise
--   'not-found'       no such gap, or none this caller may see
--   'not-open'        it moved between the read and the write
--   'not-decider'     §14: a blocking gap is the Decider's or an Owner's call
--   'not-permitted'   this caller's role or product visibility refuses the write
--
-- **'not-found' deliberately does not separate "gone" from "hidden".** Under
-- `gap_select` a SELECT returning nothing is ambiguous between the two, and
-- resolving it would need a definer read — turning this into an oracle that
-- answers "does this uuid exist in this database?" for anyone who can POST one.
-- `/i/[key]` already settled the question: "an unknown key and a key in someone
-- else's workspace are the same 404, by one code path… telling them apart would
-- answer 'does this key exist somewhere?', which is not a question a stranger
-- gets to ask." Being a workspace member does not change it, because
-- `can_see_product` is a boundary *inside* a workspace.
--
-- **The one ambiguity that IS resolved is a zero-row UPDATE**, because "someone
-- beat you to it" and "your role may not settle gaps" are different sentences to
-- a person. It is answered by re-reading the row and seeing what it says now —
-- still `open` after a guard of `open` failed means the guard held and the
-- policy refused. That diagnoses `gap_update`'s answer by observation rather
-- than restating its predicate in a second place, where the two would drift.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.accept_gap(p_gap_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
-- Not for privilege safety — an invoker function has no rights of its own to
-- abuse — but because an unpinned path lets the connection's configuration
-- decide which `gap` gets written, and because Supabase's
-- `function_search_path_mutable` advisor flags any function without it.
-- `pg_temp` is named last on purpose: omit it and Postgres searches it first.
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
  -- Trimmed once, here, and the trimmed value is what is stored: the constraint
  -- tests `btrim(...)`, so an untrimmed insert would store trailing whitespace
  -- the constraint approved and the page then renders.
  v_reason    text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'accept_gap requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Before the write rather than after. A blank note reaching the UPDATE trips
  -- `gap_resolution_shape`, which is a rollback and an error string, where what
  -- a person needs is a field to fill in.
  IF length(v_reason) = 0    THEN RETURN 'reason-required'; END IF;
  IF length(v_reason) > 2000 THEN RETURN 'reason-too-long'; END IF;

  SELECT g.workspace_id, g.item_id, g.check_id, g.tag
    INTO v_workspace, v_item, v_check, v_tag
    FROM gap g
   WHERE g.id = p_gap_id;

  IF NOT FOUND THEN RETURN 'not-found'; END IF;

  -- **The disposition is deliberately not checked here.** Reading it and
  -- branching would answer from the snapshot, and the snapshot is exactly what
  -- cannot be trusted: between this SELECT and the UPDATE below, a re-score can
  -- close the gap or another person can accept it. Worse, a pre-check makes the
  -- guard in the UPDATE redundant in every sequential path, so it would go on
  -- passing its tests after someone deleted it. The guard is the only thing that
  -- decides, and the re-read after it is what turns a zero-row write into a
  -- sentence.

  -- §14's role matrix, **asked before the Decider gate so the answer names the
  -- real obstacle.** Telling a Developer that a Must is "the Decider's call"
  -- implies that being the Decider would help; it would not — a Developer
  -- authors technical artifacts and a Viewer is read-only, and neither settles a
  -- gap of either tag.
  --
  -- This asks the membership row through `app.role_in`, the same helper
  -- `gap_update` calls, rather than copying the policy's text. The other half of
  -- that policy — `can_see_product` — is deliberately *not* restated here; it is
  -- diagnosed after the fact by the re-read below, where a copy could drift.
  v_role := app.role_in(v_workspace);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'product') THEN
    RETURN 'not-permitted';
  END IF;

  -- §5 routes through the Decider *if handover-blocking*, and §5 makes only a
  -- Must block. A Should is settled by whatever `gap_update` already allows.
  IF v_tag = 'must' AND NOT app.may_settle_must(v_workspace, v_item) THEN
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

  -- §2: every mutating action records actor, timestamp and trigger.
  --
  -- `product_id` is not decoration here. `activity_select` reads
  -- `product_id IS NULL OR app.can_see_product(product_id)`, so a null would
  -- publish this row to every member of the workspace including one who cannot
  -- see the product — a §14 leak rather than a missing field.
  --
  -- **`reason` is in the metadata because reopening nulls the column.** Without
  -- it, taking an acceptance back would erase from the system the only record of
  -- why the risk was accepted — §1 law 7 read backwards. The gap holds the
  -- current answer; the ledger holds how it got there.
  --
  -- `jsonb_build_object`, not a text cast: `writeRun`'s `::text::jsonb` rule is
  -- about a *driver* binding a JSON string and the server storing it as a jsonb
  -- string. Built server-side there is no bound parameter and no such failure.
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

REVOKE ALL ON FUNCTION public.accept_gap(uuid, text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.accept_gap(uuid, text) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Reopening. §1 law 4's "always undoable", as a standing control rather than a
-- toast that expires — and itself a move, so it is a ledger fact and not an
-- edit.
--
-- Returns 'reopened' | 'not-found' | 'not-accepted' | 'not-decider' |
-- 'not-permitted'.
--
-- **Gated exactly as accepting is.** §1 law 7 makes a debt something a *named*
-- person owns: whoever could have taken it on can hand it back, and nobody else
-- can quietly undo their name. A weaker gate would let a Product manager reverse
-- the Decider's judgement; a stronger one would leave the person who accepted it
-- unable to correct themselves.
--
-- **No reason.** `gap_resolution_shape`'s `open` arm forbids a note on an open
-- row, and the ledger row is where "who reopened this, and when" lives.
--
-- **The guard is `accepted`, which is what keeps the other two dispositions out
-- of reach.** `excluded` is §5's *first* move and is undone by whatever reverses
-- that one; `closed` is the machine's, written by a scoring run with a time and
-- no name, and a human hand-reopening it would put a person's name on a
-- transition nobody decided. Both answer `not-accepted`.
--
-- All four columns move in one statement. Two statements would traverse a state
-- `gap_resolution_shape` forbids, and the constraint would be right to refuse.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.reopen_gap(p_gap_id uuid)
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

  -- As in `accept_gap`: the disposition is decided by the UPDATE's own guard,
  -- never by this snapshot. A pre-check here would shadow the guard and let it
  -- be deleted without a test noticing.

  v_role := app.role_in(v_workspace);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'product') THEN
    RETURN 'not-permitted';
  END IF;

  IF v_tag = 'must' AND NOT app.may_settle_must(v_workspace, v_item) THEN
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

  -- `undid` carries the note the UPDATE above just erased. It is the second half
  -- of the pair `gap.accepted` opened, and the reason the column can be nulled
  -- without losing anything: the ledger still says what was accepted, why, and
  -- that it was taken back.
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
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.reopen_gap(uuid) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reopen_gap(uuid) TO authenticated;
