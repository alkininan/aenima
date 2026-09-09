-- ============================================================================
-- T0.10 — users for the database tests, under the pipeline's role.
--
-- DATABASE_URL is now `aenima_pipeline`, a member of `service_role` that starts
-- every connection as it (docs/guidelines.md §5, the capability boundary). That
-- role reads and writes every row in `public` and cannot create, alter or own
-- anything — which is the point — and it holds no privilege at all on
-- `auth.users`, where `postgres` can grant only SELECT. Eight db test files
-- seed users by inserting there and three delete them, inside transactions
-- they roll back, so the schema's ON DELETE rules can be proved against a real
-- delete. Two definer functions owned by `postgres`, which may insert and
-- delete there, carry exactly those two statements and nothing else.
--
-- `service_role` is server-side only and already bypasses RLS, so granting it
-- USAGE on `app` widens nothing a client can reach: PostgREST exposes `public`.
-- `authenticated` and `anon` get no execute here, and `revoke ... from public`
-- takes away the default every function is created with.
-- ============================================================================

create function app.seed_user(p_id uuid, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at)
  values
    (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     p_email, '', now(), now(), now());
$$;

create function app.delete_user(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = p_id;
$$;

revoke all on function app.seed_user(uuid, text) from public;
revoke all on function app.delete_user(uuid) from public;

grant usage on schema app to service_role;
grant execute on function app.seed_user(uuid, text) to service_role;
grant execute on function app.delete_user(uuid) to service_role;
