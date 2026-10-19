-- bb2dash :: db/tests/phase25_201_anon_insert_drop.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item B. Worker W-101.
-- Tests migration 201: the policy `bb_file_text_anon_insert` (007) is gone, so a holder of the
-- publishable key can no longer insert a course text unit, and the sync's writer is in its place.
--
--   a. the brief's own check: `select count(*) from pg_policies where policyname =
--      'bb_file_text_anon_insert'` gives 0
--   b. under `set local role anon` an insert of one synthetic unit raises 42501
--   c. the one policy left on bb_file_text is bb_file_text_owner_all, for authenticated, and row
--      security is still on
--   d. sync_runner still executes sync_file_text_put (200), the writer that replaced the policy
--   e. the table's row count is the same before and after the unit
--
-- BEFORE 201 IS APPLIED (Phase 25a's cut-over, after the rebuilt sync has stored text through 200
-- once) this unit is RED at (a). The insert in (b) is inside the unit's transaction and is rolled back.
-- RUN IT: `node scripts/db-test.mjs --only phase25_201_anon_insert_drop.sql`.

begin;

do $$
declare
  v_before bigint;
  v_after  bigint;
  v_file   bigint;
  v_state  text;
  v_got    text;
begin
  -- a. The brief's check.
  if (select count(*) from pg_policies where policyname = 'bb_file_text_anon_insert') <> 0 then
    raise exception 'FAIL 201 (a): the policy bb_file_text_anon_insert is still there';
  end if;

  select count(*) into v_before from public.bb_file_text;
  select min(t.file_id) into v_file from public.bb_file_text t;
  if v_file is null then
    raise exception 'FAIL 201 (setup): bb_file_text holds no unit, so no file to point a probe at';
  end if;

  -- b. The stranger's insert.
  set local role anon;
  begin
    insert into public.bb_file_text (file_id, unit_kind, unit_no, text)
    values (v_file, 'page', 999999, 'w101 201 probe');
    v_state := 'no error';
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  if v_state is distinct from '42501' then
    raise exception 'FAIL 201 (b): an anon insert into bb_file_text ended with [%], expected 42501', v_state;
  end if;

  -- c. What is left on the table.
  select string_agg(p.policyname || '|' || p.roles::text || '|' || p.cmd, ';' order by p.policyname collate "C")
    into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'bb_file_text';
  if v_got is distinct from 'bb_file_text_owner_all|{authenticated}|ALL' then
    raise exception 'FAIL 201 (c): the policies on bb_file_text are [%]', v_got;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.bb_file_text'::regclass) then
    raise exception 'FAIL 201 (c): row security is off on bb_file_text';
  end if;

  -- d. The writer that replaced it.
  if to_regprocedure('public.sync_file_text_put(bigint, jsonb)') is null
     or not has_function_privilege('sync_runner', 'public.sync_file_text_put(bigint, jsonb)', 'execute') then
    raise exception 'FAIL 201 (d): sync_runner cannot execute sync_file_text_put';
  end if;

  -- e. Nothing was written.
  select count(*) into v_after from public.bb_file_text;
  if v_after <> v_before then
    raise exception 'FAIL 201 (e): bb_file_text held % rows before and % after', v_before, v_after;
  end if;
end $$;

select 'phase25_201_anon_insert_drop: PASS' as result,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'bb_file_text') as unit_policies;

rollback;
