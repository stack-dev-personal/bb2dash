-- bb2dash :: db/tests/phase26_213_activity_new_only.sql
-- Phase 26 (the announcement reader; brief 120, round 2). Tests migration 213:
--
--   0. installed and shaped: stage_courses counts staff_conflicts_new, sync_change_lines reads it,
--      the failure table (RLS on, no anon), sync_file_pull_outcomes' grants
--   1. the staff line: a new conflict is a line; the same one next crawl is not; one settled with
--      "Keep mine" is not; a different new one is
--   2. file pull failures: a first failure is returned and remembered, the same failure next call
--      is not, a changed reason is, a file now stored has its failure row cleared and is never
--      returned, and the input is validated (22023, the function's name first)
--
-- RUN IT: `node scripts/db-test.mjs --only phase26_213_activity_new_only.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t213 (label text primary key, id bigint, txt text) on commit drop;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
begin
  if to_regprocedure('public.sync_file_pull_outcomes(jsonb)') is null then
    raise exception 'FAIL phase26_213: migration 213 is not applied (sync_file_pull_outcomes is missing)';
  end if;
  if position('staff_conflicts_new' in (select prosrc from pg_proc where oid = 'public.stage_courses(uuid, bigint)'::regprocedure)) = 0
     or position('staff_conflicts_new' in (select prosrc from pg_proc where oid = 'public.sync_change_lines(jsonb)'::regprocedure)) = 0 then
    v_fail := v_fail || 'stage_courses or sync_change_lines is not 213''s body'::text;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.sync_file_pull_outcomes(jsonb)'::regprocedure)
     or not has_function_privilege('sync_runner', 'public.sync_file_pull_outcomes(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.sync_file_pull_outcomes(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.sync_file_pull_outcomes(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_file_pull_outcomes(jsonb)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.sync_file_pull_outcomes(jsonb)', 'execute') then
    v_fail := v_fail || 'sync_file_pull_outcomes is not SECURITY DEFINER and executable by sync_runner, service_role and the test login only'::text;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.bb_file_pull_failures'::regclass)
     or has_table_privilege('anon', 'public.bb_file_pull_failures', 'select')
     or has_table_privilege('authenticated', 'public.bb_file_pull_failures', 'insert')
     or has_table_privilege('sync_runner', 'public.bb_file_pull_failures', 'select')
     or not exists (select 1 from pg_policies where tablename = 'bb_file_pull_failures'
                      and policyname = 'bb_file_pull_failures_owner_read' and cmd = 'SELECT') then
    v_fail := v_fail || 'bb_file_pull_failures is open to anon, writable by authenticated, readable by sync_runner or has no owner policy'::text;
  end if;
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.proname <> 'sync_file_text_put' -- Phase 25's 200 may land before or after this; it is checked there
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_outside_link,sync_file_pull_outcomes,sync_file_stored,'
     'sync_file_worklist,sync_login_ok,sync_login_required,sync_next,sync_own_claims,sync_register_run,'
     'sync_request_announcement_review,sync_request_inbox_apply,sync_requeue_orphans,sync_run_outcome,'
     'sync_sweep_stale' then
    v_fail := v_fail || 'sync_runner does not execute exactly the seventeen'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase26_213 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. The staff line
-- =============================================================================================
insert into course_staff (course_id, name, role, source)
values ('ECN.304', 'T26 Old Name', 'instructor', 'syllabus');

do $$
declare
  v_sync  bigint;
  v_run1  uuid := gen_random_uuid();
  v_run2  uuid := gen_random_uuid();
  r       jsonb;
  v_lines jsonb;
begin
  insert into sync_runs (run_id, status, started_at, trigger, source, scope)
  values (gen_random_uuid(), 'running', now(), 'manual', 'blackboard', 'all') returning id into v_sync;
  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run1, '_572517_1', 'course', jsonb_build_object('teachers', jsonb_build_array(
    jsonb_build_object('name', 'T26 New Person', 'userId', '_t26_u1', 'role', 'P', 'email', null))));
  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run2, '_572517_1', 'course', jsonb_build_object('teachers', jsonb_build_array(
    jsonb_build_object('name', 'T26 Another Person', 'userId', '_t26_u2', 'role', 'P', 'email', null))));

  -- A new conflict is a line.
  r := stage_courses(v_run1, v_sync);
  if r->>'status' <> 'ok' then raise exception 'FAIL 1: stage_courses failed: %', r; end if;
  if (r->'counts'->>'staff_conflicts')::int <> 1 or (r->'counts'->>'staff_conflicts_new')::int <> 1 then
    raise exception 'FAIL 1: a first conflict counted % / % (all / new), expected 1 / 1',
      r->'counts'->>'staff_conflicts', r->'counts'->>'staff_conflicts_new';
  end if;
  v_lines := sync_change_lines(jsonb_build_object('courses', r->'counts'));
  if v_lines <> '["1 staff name disagreement(s) need your call"]'::jsonb then
    raise exception 'FAIL 1: a new conflict gave the lines %', v_lines;
  end if;

  -- The same conflict, still open, next crawl: counted as met, not new, no line.
  r := stage_courses(v_run1, v_sync);
  if (r->'counts'->>'staff_conflicts')::int <> 1 or (r->'counts'->>'staff_conflicts_new')::int <> 0 then
    raise exception 'FAIL 1: a standing conflict counted % / %', r->'counts'->>'staff_conflicts', r->'counts'->>'staff_conflicts_new';
  end if;
  v_lines := sync_change_lines(jsonb_build_object('courses', r->'counts'));
  if v_lines <> '["Nothing changed"]'::jsonb then
    raise exception 'FAIL 1: a standing conflict gave the lines %', v_lines;
  end if;

  -- Settled with "Keep mine": still met, not new, no line.
  update attention_items
     set state = 'resolved', resolved_at = now(), resolution = '{"accept":"keep"}'::jsonb
   where kind = 'conflict' and entity = 'course_staff' and ref = 'staff:_t26_u1' and state = 'open';
  r := stage_courses(v_run1, v_sync);
  if (r->'counts'->>'staff_conflicts')::int <> 1 or (r->'counts'->>'staff_conflicts_new')::int <> 0
     or exists (select 1 from attention_items where ref = 'staff:_t26_u1' and state = 'open') then
    raise exception 'FAIL 1: a settled conflict counted % / % or was raised again',
      r->'counts'->>'staff_conflicts', r->'counts'->>'staff_conflicts_new';
  end if;
  if sync_change_lines(jsonb_build_object('courses', r->'counts')) <> '["Nothing changed"]'::jsonb then
    raise exception 'FAIL 1: a settled conflict gave a line';
  end if;

  -- A different new one is a line again.
  r := stage_courses(v_run2, v_sync);
  if (r->'counts'->>'staff_conflicts_new')::int <> 1
     or sync_change_lines(jsonb_build_object('courses', r->'counts')) <> '["1 staff name disagreement(s) need your call"]'::jsonb then
    raise exception 'FAIL 1: a second, different conflict was not a line: %', r->'counts';
  end if;
end $$;

-- =============================================================================================
-- 2. File pull failures
-- =============================================================================================
do $$
declare
  v_a bigint; v_b bigint; v_c bigint;
begin
  select min(id), max(id) into v_a, v_b from (select id from bb_files where storage_path is null order by id limit 2) x;
  select id into v_c from bb_files where storage_path is not null order by id limit 1;
  if v_a is null or v_b is null or v_a = v_b or v_c is null then
    raise exception 'FAIL setup: the unit needs two files with no bytes and one with bytes in bb_files';
  end if;
  delete from bb_file_pull_failures;
  insert into _t213 values ('a', v_a, null), ('b', v_b, null), ('c', v_c, null);
end $$;

do $$
declare
  v_a bigint := (select id from _t213 where label = 'a');
  v_b bigint := (select id from _t213 where label = 'b');
  v_c bigint := (select id from _t213 where label = 'c');
  v_out jsonb;
  v_first timestamptz;
  v_last  timestamptz;
begin
  -- As the runner, a first failure is returned and remembered.
  set local role sync_runner;
  v_out := sync_file_pull_outcomes(jsonb_build_array(jsonb_build_object('id', v_a, 'reason', 'gone: status 404')));
  reset role;
  if v_out <> jsonb_build_array(jsonb_build_object('id', v_a, 'reason', 'gone: status 404')) then
    raise exception 'FAIL 2: a first failure returned %', v_out;
  end if;
  select first_at, last_at into v_first, v_last from bb_file_pull_failures where file_id = v_a;
  if v_first is null then raise exception 'FAIL 2: a first failure was not remembered'; end if;

  -- The same failure again: nothing to say.
  v_out := sync_file_pull_outcomes(jsonb_build_array(jsonb_build_object('id', v_a, 'reason', 'gone: status 404')));
  if v_out <> '[]'::jsonb then raise exception 'FAIL 2: the same failure was returned again: %', v_out; end if;

  -- A changed reason is returned and first_at stays.
  perform pg_sleep(0.01);
  v_out := sync_file_pull_outcomes(jsonb_build_array(jsonb_build_object('id', v_a, 'reason', 'forbidden: status 403')));
  if v_out <> jsonb_build_array(jsonb_build_object('id', v_a, 'reason', 'forbidden: status 403')) then
    raise exception 'FAIL 2: a changed reason returned %', v_out;
  end if;
  if (select first_at from bb_file_pull_failures where file_id = v_a) <> v_first
     or (select last_at from bb_file_pull_failures where file_id = v_a) <= v_last
     or (select reason from bb_file_pull_failures where file_id = v_a) <> 'forbidden: status 403' then
    raise exception 'FAIL 2: a changed reason did not keep first_at, move last_at and store the reason';
  end if;

  -- Two files, one standing and one new: only the new one comes back, in id order.
  v_out := sync_file_pull_outcomes(jsonb_build_array(
    jsonb_build_object('id', v_b, 'reason', 'timeout'),
    jsonb_build_object('id', v_a, 'reason', 'forbidden: status 403')));
  if v_out <> jsonb_build_array(jsonb_build_object('id', v_b, 'reason', 'timeout')) then
    raise exception 'FAIL 2: a standing and a new failure returned %', v_out;
  end if;

  -- A file with bytes is never a failure: a failure row of its own is cleared, and listing it
  -- returns nothing and stores nothing.
  insert into bb_file_pull_failures (file_id, reason) values (v_c, 'stale');
  v_out := sync_file_pull_outcomes(jsonb_build_array(jsonb_build_object('id', v_c, 'reason', 'still failing?')));
  if v_out <> '[]'::jsonb or exists (select 1 from bb_file_pull_failures where file_id = v_c) then
    raise exception 'FAIL 2: a stored file kept a failure row or was returned: %', v_out;
  end if;

  -- A file that gets stored between calls has its row cleared by the next call.
  update bb_files set storage_path = 'bb-files/t26-test' where id = v_a;
  v_out := sync_file_pull_outcomes('[]'::jsonb);
  if v_out <> '[]'::jsonb or exists (select 1 from bb_file_pull_failures where file_id = v_a) then
    raise exception 'FAIL 2: a file stored since its failure kept the row';
  end if;
  if not exists (select 1 from bb_file_pull_failures where file_id = v_b) then
    raise exception 'FAIL 2: the clearing took the row of a file with no bytes';
  end if;
end $$;

do $$
declare
  v_a bigint := (select id from _t213 where label = 'a');
  v_b bigint := (select id from _t213 where label = 'b');
  v_case record;
  v_state text; v_msg text; v_raised boolean;
begin
  for v_case in
    select * from (values
      ('not an array',            '{}'::jsonb),
      ('null',                    'null'::jsonb),
      ('501 failures',            (select jsonb_agg(jsonb_build_object('id', v_b, 'reason', 'x')) from generate_series(1, 501))),
      ('an id of zero',           jsonb_build_array(jsonb_build_object('id', 0, 'reason', 'x'))),
      ('a negative id',           jsonb_build_array(jsonb_build_object('id', -5, 'reason', 'x'))),
      ('an id as text',           jsonb_build_array(jsonb_build_object('id', v_b::text, 'reason', 'x'))),
      ('a fractional id',         jsonb_build_array(jsonb_build_object('id', 1.5, 'reason', 'x'))),
      ('an id that does not exist', jsonb_build_array(jsonb_build_object('id', 999999999, 'reason', 'x'))),
      ('an id twice',             jsonb_build_array(jsonb_build_object('id', v_b, 'reason', 'x'), jsonb_build_object('id', v_b, 'reason', 'y'))),
      ('an empty reason',         jsonb_build_array(jsonb_build_object('id', v_b, 'reason', '  '))),
      ('a missing reason',        jsonb_build_array(jsonb_build_object('id', v_b))),
      ('a reason that is a number', jsonb_build_array(jsonb_build_object('id', v_b, 'reason', 5))),
      ('a 501-character reason',  jsonb_build_array(jsonb_build_object('id', v_b, 'reason', repeat('r', 501)))),
      ('an element that is not an object', jsonb_build_array(5))
    ) t(label, input)
  loop
    v_raised := false;
    begin
      perform sync_file_pull_outcomes(v_case.input);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      v_raised := v_state = '22023' and v_msg like 'sync_file_pull_outcomes:%';
    end;
    if not v_raised then
      raise exception 'FAIL 2: % was not refused with 22023 and the function''s name (got % "%")', v_case.label, v_state, v_msg;
    end if;
  end loop;
  -- A refusal writes nothing: the row of b is still the one before.
  if (select reason from bb_file_pull_failures where file_id = v_b) <> 'timeout' then
    raise exception 'FAIL 2: a refused call changed a failure row';
  end if;
end $$;

select 'phase26_213_activity_new_only: PASS' as result;

rollback;
