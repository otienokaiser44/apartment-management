-- Test helpers. Included at the top of every test file (inside its transaction) with:
--   \ir support/helpers.sql
-- Everything lives in schema "t" and disappears on ROLLBACK, so tests never leave data behind.
-- Output: one "ok - ..." / "not ok - ..." NOTICE per assertion; t.finish() raises if any failed.

create schema t;
grant usage on schema t to public;

create table t.results (n serial, name text not null, passed boolean not null, detail text);
grant all on t.results to public;
grant usage on all sequences in schema t to public;

-- Impersonation: mimics what PostgREST does for a signed-in / anonymous request.
create function t.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

create function t.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- Assertions -------------------------------------------------------------------------------
create function t.ok(p_cond boolean, p_name text, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into t.results (name, passed, detail) values (p_name, coalesce(p_cond, false), p_detail);
  if coalesce(p_cond, false) then
    raise notice 'ok - %', p_name;
  else
    raise notice 'not ok - % %', p_name, coalesce('(' || p_detail || ')', '');
  end if;
end $$;

create function t.eq(p_actual text, p_expected text, p_name text) returns void
language plpgsql as $$
begin
  perform t.ok(p_actual is not distinct from p_expected, p_name,
    'got ' || coalesce(p_actual, 'NULL') || ', expected ' || coalesce(p_expected, 'NULL'));
end $$;

-- Runs a statement and returns the scalar result as text ('' if no row).
create function t.scalar(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
end $$;

-- Runs a statement, returns the number of rows it touched (for RLS-filtered UPDATE/DELETE).
create function t.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Asserts that the statement raises an error; optionally matches SQLSTATE and/or message text.
create function t.throws(p_sql text, p_name text, p_sqlstate text default null, p_like text default null)
returns void language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform t.ok(
      (p_sqlstate is null or v_state = p_sqlstate) and (p_like is null or v_msg ilike '%' || p_like || '%'),
      p_name, 'raised ' || v_state || ': ' || v_msg);
    return;
  end;
  perform t.ok(false, p_name, 'expected an error but statement succeeded');
end $$;

create function t.lives(p_sql text, p_name text) returns void language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  execute p_sql;
  perform t.ok(true, p_name);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  perform t.ok(false, p_name, 'raised ' || v_state || ': ' || v_msg);
end $$;

create function t.finish() returns void language plpgsql as $$
declare
  v_total int;
  v_failed int;
begin
  select count(*), count(*) filter (where not passed) into v_total, v_failed from t.results;
  raise notice '# % assertions, % failed', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'TEST FILE FAILED: % of % assertions failed', v_failed, v_total;
  end if;
end $$;
