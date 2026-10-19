-- bb2dash :: db/tests/phase25_200_sync_file_text_put.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item B. Worker W-101.
-- Tests migration 200: the sync's insert of course text units, behind a sync_runner function.
--
--   0. installed: SECURITY DEFINER, search_path pinned, executable by sync_runner and by none of
--      anon, authenticated, service_role, inbox_apply_runner, workspace_runner, workspace_ingest_runner
--   a. sync_runner puts two new units of a real file: (inserted 2, present 0)
--   b. the same call again inserts nothing: (0, 2), and the file holds the two units once
--   c. one new unit sent with the two old ones: (1, 2)
--   d. a unit already there is never changed: sent with other text, it is present and keeps its text
--   e. the 165 trigger fires for this writer: a line of AI-use policy is cut on insert
--   f. bad input is refused with 22023 and writes nothing: a null file, a file not in bb_files, units
--      that are not an array, an empty array, an unknown kind, unit_no 0, a fractional unit_no, blank
--      text, a non-object unit, one (kind, number) twice
--   f2. a file too large to store is refused with 54000 and writes nothing: 1001 units, or more than
--      1.5 million characters (the sync then stores the file with text_status 'failed')
--   g. anon and authenticated calling it get 42501
--   h. nothing outside the probe's file moved
--
-- Every call is made under `set local role sync_runner` (094: the test login holds it with inherit
-- false); the setup and the reads that check a call's effect run as the session role. The probe's
-- units use page numbers 1000 past the file's highest, so they meet no real unit.
--
-- BEFORE 200 IS APPLIED this unit is RED at (0): "sync_file_text_put is not installed".
-- RUN IT: `node scripts/db-test.mjs --only phase25_200_sync_file_text_put.sql`. NOTHING IS COMMITTED:
-- the units it inserts go with the closing `rollback`.

begin;

do $$
declare
  f constant text := 'public.sync_file_text_put(bigint, jsonb)';
  v_file      bigint;
  v_no        integer;
  v_all_before bigint;
  v_all_after  bigint;
  v_file_before bigint;
  v_n         bigint;
  v_text      text;
  v_state     text;
  v_case      jsonb;
  v_units     jsonb;
  r           record;
begin
  -- 0. Installed and granted to sync_runner alone.
  if to_regprocedure(f) is null then
    raise exception 'FAIL 200 (0): sync_file_text_put is not installed';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 200 (0): sync_file_text_put is not SECURITY DEFINER with a pinned search_path';
  end if;
  if not has_function_privilege('sync_runner', f, 'execute')
     or has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute')
     or has_function_privilege('workspace_runner', f, 'execute')
     or has_function_privilege('workspace_ingest_runner', f, 'execute') then
    raise exception 'FAIL 200 (0): sync_file_text_put is not executable by sync_runner alone';
  end if;

  -- Setup (not an assertion): a real catalogued file and page numbers it has never used.
  select min(t.file_id) into v_file from bb_file_text t;
  if v_file is null then
    raise exception 'FAIL 200 (setup): bb_file_text holds no unit, so no file to put a probe on';
  end if;
  select coalesce(max(t.unit_no), 0) + 1000 into v_no
    from bb_file_text t where t.file_id = v_file and t.unit_kind = 'page';
  select count(*) into v_all_before from bb_file_text;
  select count(*) into v_file_before from bb_file_text t where t.file_id = v_file;
  v_units := jsonb_build_array(
    jsonb_build_object('unit_kind', 'page', 'unit_no', v_no,     'text', 'w101 probe one'),
    jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 1, 'text', 'w101 probe two'));

  -- a. Two new units.
  set local role sync_runner;
  select * into r from public.sync_file_text_put(v_file, v_units);
  reset role;
  if r.inserted is distinct from 2 or r.present is distinct from 0 then
    raise exception 'FAIL 200 (a): the first put answered (%, %), expected (2, 0)', r.inserted, r.present;
  end if;

  -- b. The same call again: present, not inserted twice.
  set local role sync_runner;
  select * into r from public.sync_file_text_put(v_file, v_units);
  reset role;
  if r.inserted is distinct from 0 or r.present is distinct from 2 then
    raise exception 'FAIL 200 (b): the repeat answered (%, %), expected (0, 2)', r.inserted, r.present;
  end if;
  select count(*) into v_n from bb_file_text t where t.file_id = v_file and t.unit_kind = 'page'
     and t.unit_no in (v_no, v_no + 1);
  if v_n <> 2 then
    raise exception 'FAIL 200 (b): the file holds % probe units, expected 2', v_n;
  end if;

  -- c. One new unit with the two old ones.
  set local role sync_runner;
  select * into r from public.sync_file_text_put(v_file,
    v_units || jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 2, 'text', 'w101 probe three')));
  reset role;
  if r.inserted is distinct from 1 or r.present is distinct from 2 then
    raise exception 'FAIL 200 (c): the partial put answered (%, %), expected (1, 2)', r.inserted, r.present;
  end if;

  -- d. A unit already there keeps its text.
  set local role sync_runner;
  select * into r from public.sync_file_text_put(v_file,
    jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no, 'text', 'w101 other text')));
  reset role;
  select t.text into v_text from bb_file_text t where t.file_id = v_file and t.unit_kind = 'page' and t.unit_no = v_no;
  if r.inserted is distinct from 0 or r.present is distinct from 1 or v_text is distinct from 'w101 probe one' then
    raise exception 'FAIL 200 (d): a put over an existing unit answered (%, %) and left text [%]', r.inserted, r.present, v_text;
  end if;

  -- e. The 165 cut runs for this writer (a synthetic line, no course text).
  set local role sync_runner;
  select * into r from public.sync_file_text_put(v_file,
    jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 3,
                                         'text', E'On the use of AI: w101 synthetic line\nw101 kept line')));
  reset role;
  select t.text into v_text from bb_file_text t where t.file_id = v_file and t.unit_kind = 'page' and t.unit_no = v_no + 3;
  if r.inserted is distinct from 1 or v_text is distinct from 'w101 kept line' then
    raise exception 'FAIL 200 (e): the AI-use line was not cut on insert: answered (%, %), stored [%]', r.inserted, r.present, v_text;
  end if;

  -- f. Bad input: 22023, nothing written.
  select count(*) into v_n from bb_file_text;
  for v_case in
    select c from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('label', 'null file', 'file', null, 'units', v_units),
      jsonb_build_object('label', 'file not in bb_files', 'file', (select max(id) + 1000000 from bb_files), 'units', v_units),
      jsonb_build_object('label', 'units not an array', 'file', v_file, 'units', jsonb_build_object('unit_kind', 'page')),
      jsonb_build_object('label', 'empty array', 'file', v_file, 'units', '[]'::jsonb),
      jsonb_build_object('label', 'unknown kind', 'file', v_file,
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'notes', 'unit_no', v_no + 10, 'text', 'x'))),
      jsonb_build_object('label', 'unit_no 0', 'file', v_file,
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', 0, 'text', 'x'))),
      jsonb_build_object('label', 'fractional unit_no', 'file', v_file,
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', 1.5, 'text', 'x'))),
      jsonb_build_object('label', 'blank text', 'file', v_file,
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 10, 'text', '   '))),
      jsonb_build_object('label', 'unit not an object', 'file', v_file, 'units', '["text"]'::jsonb),
      jsonb_build_object('label', 'a unit twice', 'file', v_file,
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 10, 'text', 'x'),
                                                    jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 10, 'text', 'y')))
    )) c
  loop
    set local role sync_runner;
    begin
      perform public.sync_file_text_put((v_case->>'file')::bigint, v_case->'units');
      v_state := 'no error';
    exception when others then
      v_state := sqlstate;
    end;
    reset role;
    if v_state is distinct from '22023' then
      raise exception 'FAIL 200 (f): % ended with [%], expected 22023', v_case->>'label', v_state;
    end if;
  end loop;
  if (select count(*) from bb_file_text) <> v_n then
    raise exception 'FAIL 200 (f): a refused put wrote a unit';
  end if;

  -- f2. Too large: 54000, its own SQLSTATE, and nothing written.
  for v_case in
    select c from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('label', '1001 units',
                         'units', (select jsonb_agg(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 100 + g, 'text', 'x'))
                                     from generate_series(1, 1001) g)),
      jsonb_build_object('label', '1,500,001 characters',
                         'units', jsonb_build_array(jsonb_build_object('unit_kind', 'page', 'unit_no', v_no + 20,
                                                                       'text', repeat('x', 1500001))))
    )) c
  loop
    set local role sync_runner;
    begin
      perform public.sync_file_text_put(v_file, v_case->'units');
      v_state := 'no error';
    exception when others then
      v_state := sqlstate;
    end;
    reset role;
    if v_state is distinct from '54000' then
      raise exception 'FAIL 200 (f2): % ended with [%], expected 54000', v_case->>'label', v_state;
    end if;
  end loop;
  if (select count(*) from bb_file_text) <> v_n then
    raise exception 'FAIL 200 (f2): a refused put wrote a unit';
  end if;

  -- g. Not anon's, not authenticated's.
  foreach v_text in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_text);
    begin
      perform public.sync_file_text_put(v_file, v_units);
      v_state := 'no error';
    exception when others then
      v_state := sqlstate;
    end;
    reset role;
    if v_state is distinct from '42501' then
      raise exception 'FAIL 200 (g): % calling sync_file_text_put ended with [%], expected 42501', v_text, v_state;
    end if;
  end loop;

  -- h. Only the probe's four units were added, all on the probe's file.
  select count(*) into v_all_after from bb_file_text;
  if v_all_after - v_all_before <> 4
     or (select count(*) from bb_file_text t where t.file_id = v_file) - v_file_before <> 4 then
    raise exception 'FAIL 200 (h): bb_file_text grew by % (the probe file by %), expected 4 on the probe file',
      v_all_after - v_all_before, (select count(*) from bb_file_text t where t.file_id = v_file) - v_file_before;
  end if;
end $$;

select 'phase25_200_sync_file_text_put: PASS' as result,
       has_function_privilege('sync_runner', 'public.sync_file_text_put(bigint, jsonb)', 'execute') as sync_runner_may,
       has_function_privilege('anon', 'public.sync_file_text_put(bigint, jsonb)', 'execute')        as anon_may;

rollback;
