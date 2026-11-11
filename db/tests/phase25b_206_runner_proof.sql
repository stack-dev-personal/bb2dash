-- bb2dash :: db/tests/phase25b_206_runner_proof.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E; PM round 2. Worker W-104a.
-- Tests migration 206's `v_workspace_runner_proof`, the one row pack 25's proof `runner-grants` reads
-- (acceptance/25/proofs.json), since a proof reads no pg_* relation.
--
--   0. installed: the four columns in order and type; security_invoker; select for service_role and
--      (100's default privilege) db_test_runner, none for anon, authenticated or the runner roles
--   1. its answer is the catalog's, computed here the way 204's guard computes it: fourteen SECURITY
--      DEFINER functions of public workspace_runner can execute, workspace_propose among them, no
--      privilege on any public relation or column; relations_checked counts every relation asked about;
--      and the proof's own statement reads ok
--
-- Read as the session role (db_test_runner). Nothing is written. Nothing is committed.
--
-- RED against prod until 202 to 206 are applied (25b's cut-over): section 0 stops at "migration 206
-- is not applied". RUN IT: `node scripts/db-test.mjs --only phase25b_206_runner_proof.sql`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  v_def  integer;
  v_rel  integer;
  v_all  integer;
begin
  if to_regclass('public.v_workspace_runner_proof') is null then
    raise exception 'FAIL phase25b_206_runner_proof: migration 206 is not applied (v_workspace_runner_proof is missing)';
  end if;

  -- 0. Shape, options, grants.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_runner_proof'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'definer_functions integer, executes_propose boolean, relations_granted integer, relations_checked integer' then
    v_fail := v_fail || format('columns are [%s]', v_got);
  end if;
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_runner_proof'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    v_fail := v_fail || 'not security_invoker'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('anon'), ('authenticated'), ('workspace_runner'), ('inbox_apply_runner'), ('sync_runner'),
                 ('workspace_ingest_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.v_workspace_runner_proof', 'select, insert, update, delete');
  if v_got is not null then v_fail := v_fail || format('readable by %s', v_got); end if;
  if not has_table_privilege('service_role', 'public.v_workspace_runner_proof', 'select')
     or not has_table_privilege('db_test_runner', 'public.v_workspace_runner_proof', 'select') then
    v_fail := v_fail || 'service_role or db_test_runner cannot read it'::text;
  end if;

  -- 1. The answer, against the catalog.
  select count(*) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  select count(*) filter (
           where case when c.relkind = 'S'
                      then has_sequence_privilege('workspace_runner', c.oid, 'usage, select, update')
                      else has_table_privilege('workspace_runner', c.oid, 'select, insert, update, delete, truncate, references, trigger')
                           or has_any_column_privilege('workspace_runner', c.oid, 'select, insert, update, references')
                 end),
         count(*)
    into v_rel, v_all
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S');
  select * into r from public.v_workspace_runner_proof;
  if r.definer_functions <> v_def or r.definer_functions <> 14 then
    v_fail := v_fail || format('definer_functions %s (catalog %s), not 14', r.definer_functions, v_def);
  end if;
  if r.executes_propose is not true then v_fail := v_fail || 'executes_propose is not true'::text; end if;
  if r.relations_granted <> v_rel or r.relations_granted <> 0 then
    v_fail := v_fail || format('relations_granted %s (catalog %s), not 0', r.relations_granted, v_rel);
  end if;
  if r.relations_checked <> v_all or r.relations_checked < 1
     or r.relations_checked < (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') then
    v_fail := v_fail || format('relations_checked %s (catalog %s)', r.relations_checked, v_all);
  end if;
  if (select count(*) from public.v_workspace_runner_proof) <> 1 then
    v_fail := v_fail || 'the view is not exactly one row'::text;
  end if;
  -- The proof's own statement (acceptance/25/proofs.json, runner-grants).
  if not (select (v.definer_functions = 14 and v.executes_propose and v.relations_granted = 0 and v.relations_checked > 0)
            from public.v_workspace_runner_proof v) then
    v_fail := v_fail || 'the runner-grants proof does not read ok'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_206_runner_proof: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_206_runner_proof: PASS' as result;

rollback;
