-- ============================================================================
-- First-run bootstrap returns the workspace it settled on, and is idempotent.
--
-- The bug this fixes: `ensureWorkspace` called this function for an id and then
-- re-read `workspace` over PostgREST to get the row. Both calls happen inside
-- one Next.js render pass, and Next memoizes identical GET fetches for the
-- whole pass — see `createDedupeFetch` in
-- node_modules/next/dist/server/lib/dedupe-fetch.js, which opts out only for a
-- truthy `signal`, and postgrest-js passes `signal: undefined`. So the
-- read-back was answered from the *pre-write* response, which was empty, and
-- first run threw "Workspace was created but could not be read back". The
-- Supabase edge log for the incident shows it plainly: three GETs on
-- /rest/v1/workspace, three POSTs on /rest/v1/rpc/bootstrap_workspace, and not
-- one GET after the writes — the read-backs never left the process.
--
-- A read-after-write over HTTP inside a render pass cannot be made reliable, so
-- the write returns the row instead. That is the whole fix; nothing retries.
--
-- Idempotent for the same reason. Raising on a second call forced the caller
-- into exactly the read-after-write it cannot do — that is where the second
-- error ("caller already belongs to a workspace") came from. Returning the
-- existing workspace does not weaken the guard the RAISE was there for: this
-- still never mints a second workspace for a user, which was the property that
-- mattered.
-- ============================================================================

-- Return type changes, so CREATE OR REPLACE cannot do it. The wrapper goes
-- first: it depends on the `app` function.
DROP FUNCTION IF EXISTS public.bootstrap_workspace(text);--> statement-breakpoint
DROP FUNCTION IF EXISTS app.bootstrap_workspace(text);--> statement-breakpoint

CREATE FUNCTION app.bootstrap_workspace(p_name text)
RETURNS SETOF workspace
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_workspace uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'bootstrap_workspace requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialises first run per user. The lookup below is otherwise check-then-act
  -- under READ COMMITTED, and /app really does open several render passes at
  -- once: the incident log shows three callers arriving inside 30ms, all three
  -- having read "no membership" before any of them wrote. Without this lock and
  -- with the RAISE now gone, all three would create a workspace. Transaction
  -- scoped, so it is released on commit — no unlock path to get wrong.
  PERFORM pg_advisory_xact_lock(hashtextextended('bootstrap_workspace:' || v_user::text, 0));

  SELECT m.workspace_id INTO v_workspace
    FROM membership m
   WHERE m.user_id = v_user
   ORDER BY m.created_at
   LIMIT 1;

  IF v_workspace IS NULL THEN
    INSERT INTO workspace (name) VALUES (p_name) RETURNING id INTO v_workspace;

    INSERT INTO membership (workspace_id, user_id, role, all_products)
    VALUES (v_workspace, v_user, 'owner', true);

    -- §2: every mutating action writes an activity row. Only on the branch that
    -- actually creates — handing back an existing workspace mutates nothing.
    INSERT INTO activity
      (workspace_id, actor_kind, actor_user_id, action, trigger_source, subject_table, subject_id)
    VALUES
      (v_workspace, 'human', v_user, 'workspace.created', 'user', 'workspace', v_workspace);
  END IF;

  -- SETOF workspace rather than a narrowed TABLE(...): the OUT parameters a
  -- TABLE(...) declares would collide with the column names in the RETURNING
  -- above. The caller selects the columns it wants over the wire.
  RETURN QUERY SELECT w.* FROM workspace w WHERE w.id = v_workspace;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.bootstrap_workspace(text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.bootstrap_workspace(text) TO authenticated;--> statement-breakpoint

-- PostgREST only exposes `public`, so the callable surface stays a thin wrapper
-- and the logic stays in `app`, which no client can reach directly.
CREATE FUNCTION public.bootstrap_workspace(p_name text)
RETURNS SETOF workspace
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT * FROM app.bootstrap_workspace(p_name);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.bootstrap_workspace(text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.bootstrap_workspace(text) TO authenticated;--> statement-breakpoint
