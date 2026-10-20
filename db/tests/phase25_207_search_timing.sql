-- bb2dash :: db/tests/phase25_207_search_timing.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item C, the index watch. Worker
-- W-102. Tests migration 207: `workspace_search_timing()`, workspace_runner's twelfth function.
--
--   0. installed and shaped: STABLE SECURITY DEFINER of postgres, search_path pinned, returns
--      double precision[]
--   1. who may call: workspace_runner may; public, anon, authenticated, service_role, sync_runner,
--      inbox_apply_runner and workspace_ingest_runner may not
--   2. the call, as workspace_runner: exactly eleven numbers, none null, none negative
--   3. the fence still stands: workspace_runner executes exactly thirteen SECURITY DEFINER functions
--      (twelve until 202 added workspace_claim_v3) and holds no table, view, column or sequence
--      privilege in public
--
-- The call is made under `set local role workspace_runner` (142's membership), the way the probe
-- calls it. It reads the stored vectors as they are and writes nothing; the times are not judged
-- here (that is the doctor's row), only their count and sign.
--
-- RED against prod until 207 is applied (25a's cut-over). AN `execute_sql` DRY RUN adds, inside its
-- own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase25_207_search_timing.sql`.

begin;

do $$
declare
  f      constant text := 'public.workspace_search_timing()';
  v_fail text[] := '{}';
  v_got  text;
  r      record;
begin
  if to_regprocedure(f) is null then
    raise exception 'FAIL phase25_207: migration 207 is not applied (workspace_search_timing is missing)';
  end if;

  -- 0. Shape.
  select p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner) as owner,
         coalesce(p.proconfig, '{}') as cfg, pg_get_function_result(p.oid) as result,
         pg_get_function_identity_arguments(p.oid) as args
    into r
    from pg_proc p where p.oid = f::regprocedure;
  if not r.prosecdef then v_fail := v_fail || 'not security definer'::text; end if;
  if r.provolatile <> 's' then v_fail := v_fail || format('volatility %s, not stable', r.provolatile); end if;
  if r.owner <> 'postgres' then v_fail := v_fail || format('owned by %s', r.owner); end if;
  if not r.cfg @> array['search_path=public, pg_temp'] then
    v_fail := v_fail || 'search_path not pinned to public, pg_temp'::text;
  end if;
  if r.result is distinct from 'double precision[]' then v_fail := v_fail || format('returns %s', r.result); end if;
  if r.args is distinct from '' then v_fail := v_fail || format('takes (%s)', r.args); end if;

  -- 1. Who may call.
  if not has_function_privilege('workspace_runner', f, 'execute') then
    v_fail := v_fail || 'workspace_runner cannot execute it'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('sync_runner'),
                 ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_got is not null then v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got); end if;

  -- 3. The fence: the thirteen since 202 added workspace_claim_v3 (RED against prod until 202 is
  --    applied, 25b's cut-over), and no relation privilege.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_claim_v3,workspace_finish,'
     'workspace_heartbeat,workspace_job_claim,workspace_job_finish,workspace_planner_feed,'
     'workspace_search_timing,workspace_stream,workspace_turn_context,workspace_turn_put' then
    v_fail := v_fail || format('workspace_runner executes the SECURITY DEFINER functions [%s]', v_got);
  end if;
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and ((c.relkind in ('r', 'p', 'v', 'm', 'f')
           and (has_table_privilege('workspace_runner', c.oid,
                                    'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('workspace_runner', c.oid,
                                            'select, insert, update, references')))
          or (c.relkind = 'S'
              and has_sequence_privilege('workspace_runner', c.oid, 'usage, select, update')));
  if v_got is not null then v_fail := v_fail || format('workspace_runner holds a privilege on %s', v_got); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25_207 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- 2. The call, as the runner's login.
set local role workspace_runner;

do $$
declare
  v_times double precision[];
begin
  v_times := public.workspace_search_timing();
  if v_times is null or cardinality(v_times) <> 11 then
    raise exception 'FAIL phase25_207 (call): % numbers, expected 11', coalesce(cardinality(v_times)::text, 'null');
  end if;
  if exists (select 1 from unnest(v_times) t where t is null or t < 0 or t = 'NaN'::double precision
                                              or t = 'Infinity'::double precision) then
    raise exception 'FAIL phase25_207 (call): a time is null, negative or not finite: %', v_times;
  end if;
end $$;

reset role;

select 'phase25_207_search_timing: PASS' as result;

rollback;
