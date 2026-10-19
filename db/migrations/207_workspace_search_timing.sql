-- bb2dash :: db/migrations/207_workspace_search_timing.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item C, "The index watch". Worker
-- W-102. Block 200-209 (200-201 are W-101's, 202 the second runner's, 203-206 the proposals').
--
-- WHY. Stack's rule (109a item 23, answer "a", 2026-10-08): the assistant's search moves onto the HNSW
-- index once its timed median passes 60 ms. Nothing told anyone when that line is crossed. The doctor
-- of bb2dash-stack gets a `workspace search` row that reads `ok` under 45 ms, `watch` from 45 to 60 and
-- `move` over 60, from the median of eleven timed calls. `workspace_search` (192) is SECURITY INVOKER
-- and granted to service_role only, and none of the stack's logins can run it. This file carries
-- Stack's ruling of 2026-10-19 ("w-102) yes it may run"): workspace_runner gets one more function,
-- this one, and nothing else. The doctor reaches it the way its blackboard row reaches the sync:
-- `docker compose exec -T workspace node /app/workspace/dist/search-probe.js`, the runner's own login.
--
-- WHAT
--   1. workspace_search_timing() returns double precision[]: SECURITY DEFINER, owned by postgres,
--      search_path pinned, STABLE (so PL/pgSQL refuses any write inside it). It picks eleven stored
--      course vectors itself, deterministically: of bb_text_embeddings' rows of model gte-small in id
--      order, the ones at ranks 1 + floor(k * (n - 1) / 10) for k = 0..10, each with the first 80
--      characters of its own unit as the question's words (so the keyword arm runs, as for a real
--      question). It makes one warm-up call with the first of them, which it does not report, then
--      times eleven calls of workspace_search (every kind, no course, its defaults) with
--      clock_timestamp(), each call's rows counted so the whole search runs. It returns the eleven
--      times in milliseconds, in call order: no text, no id, no row.
--      Refusal: fewer than eleven stored gte-small vectors (22023).
--      Time guard: before each timed call it compares the time spent so far with BUDGET_MS (5 s) and
--      stops with 57014 once past it, so a slow index cannot hold the doctor. A statement_timeout set
--      inside a function does not re-arm the running statement's timer, so the guard is the
--      function's own clock; the role's statement_timeout (15 s, 142) still bounds the whole
--      statement, and the probe sets a tighter one on its own session.
--   2. privileges: revoked from public, anon, authenticated and service_role; granted to
--      workspace_runner only. workspace_runner goes from ELEVEN SECURITY DEFINER functions to TWELVE,
--      and still holds no grant on any table, view or sequence: it learns eleven numbers, never a
--      vector, a unit's text or an id.
--   3. a guard block
--
-- Additive: one function, its grants and a guard; no table, column, policy, index or other body
-- changes. Nothing is written. No password, key or DSN is in this file.

do $$
begin
  if to_regprocedure('public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text)') is null then
    raise exception '207: workspace_search does not exist; apply 192_workspace_search first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'workspace_runner') then
    raise exception '207: role workspace_runner does not exist; apply 142_workspace_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_search_timing
-- =============================================================================================
create or replace function public.workspace_search_timing()
  returns double precision[]
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $function$
declare
  -- The doctor's method (brief 119, item C): one warm-up, then eleven timed calls.
  CALLS        constant integer := 11;
  -- The function's own clock: once past this, no further call is started.
  BUDGET_MS    constant double precision := 5000;
  -- How much of a unit's text stands in for the question's words.
  QUESTION_LEN constant integer := 80;
  MODEL        constant text := 'gte-small';
  v_vectors    extensions.vector[];
  v_questions  text[];
  v_started    timestamptz;
  v_t0         timestamptz;
  v_spent_ms   double precision;
  v_rows       bigint;
  v_times      double precision[] := '{}';
begin
  -- The eleven stored vectors, spread evenly over the gte-small rows in id order.
  with ranked as (
    select e.embedding, e.text_id,
           row_number() over (order by e.id) as rn,
           count(*) over () as n
      from bb_text_embeddings e
     where e.model = MODEL
  ),
  picked as (
    select g.k, r.embedding, r.text_id
      from generate_series(0, CALLS - 1) as g(k)
      join ranked r
        on r.n >= CALLS
       and r.rn = 1 + floor(g.k::double precision * (r.n - 1) / (CALLS - 1))::bigint
  )
  select array_agg(p.embedding order by p.k), array_agg(left(t.text, QUESTION_LEN) order by p.k)
    into v_vectors, v_questions
    from picked p
    join bb_file_text t on t.id = p.text_id;

  if coalesce(cardinality(v_vectors), 0) <> CALLS then
    raise exception 'workspace_search_timing: fewer than % stored % vectors to time with', CALLS, MODEL
      using errcode = '22023';
  end if;

  -- The warm-up: a session's first call is cold (481.8 ms on 2026-10-18); it is not reported.
  select count(*) into v_rows from workspace_search(v_questions[1], v_vectors[1]);

  v_started := clock_timestamp();
  for i in 1 .. CALLS loop
    v_spent_ms := extract(epoch from (clock_timestamp() - v_started)) * 1000;
    if v_spent_ms > BUDGET_MS then
      raise exception 'workspace_search_timing: past its % ms budget after % of % calls', BUDGET_MS, i - 1, CALLS
        using errcode = '57014';
    end if;
    v_t0 := clock_timestamp();
    select count(*) into v_rows from workspace_search(v_questions[i], v_vectors[i]);
    v_times := v_times || (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::double precision;
  end loop;

  return v_times;
end
$function$;

alter function public.workspace_search_timing() owner to postgres;

comment on function public.workspace_search_timing() is
  'The index watch (207, brief 119 item C, Stack''s ruling of 2026-10-19): eleven calls of '
  'workspace_search timed with clock_timestamp(), after one warm-up it does not report, on eleven '
  'stored gte-small course vectors it picks itself (evenly spread by id, each with the first 80 '
  'characters of its own unit as the words). Returns the eleven times in ms, in call order, and '
  'nothing else. Stops with 57014 once 5000 ms are spent; 22023 with fewer than eleven vectors. '
  'STABLE: it writes nothing. SECURITY DEFINER, search_path pinned; workspace_runner only.';

-- =============================================================================================
-- 2. Privileges
-- =============================================================================================
revoke all on function public.workspace_search_timing() from public, anon, authenticated, service_role;
grant execute on function public.workspace_search_timing() to workspace_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  f constant text := 'public.workspace_search_timing()';
begin
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef and p.provolatile = 's'
                    and p.proowner = 'postgres'::regrole
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 207: % is not a STABLE SECURITY DEFINER of postgres with a pinned search_path', f;
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from 'double precision[]' then
    raise exception 'FAIL 207: % does not return double precision[]', f;
  end if;
  if has_function_privilege('public', f, 'execute') or has_function_privilege('anon', f, 'execute')
     or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('sync_runner', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute')
     or has_function_privilege('workspace_ingest_runner', f, 'execute')
     or not has_function_privilege('workspace_runner', f, 'execute') then
    raise exception 'FAIL 207: % is not executable by workspace_runner alone', f;
  end if;
  -- workspace_runner executes the twelve: 196's eleven and this one.
  if (select string_agg(p.proname, ',' order by p.proname collate "C")
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prosecdef
         and has_function_privilege('workspace_runner', p.oid, 'execute'))
     is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_finish,workspace_heartbeat,'
     'workspace_job_claim,workspace_job_finish,workspace_planner_feed,workspace_search_timing,'
     'workspace_stream,workspace_turn_context,workspace_turn_put' then
    raise exception 'FAIL 207: workspace_runner does not execute exactly the twelve';
  end if;
end $$;
