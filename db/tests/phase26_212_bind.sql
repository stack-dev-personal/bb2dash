-- bb2dash :: db/tests/phase26_212_bind.sql
-- Phase 26 (the announcement reader; brief 120). Tests migration 212:
--
--   0. installed and shaped: bind_announcement_rows, run_transform's bind step before assignments
--   1. run_transform on a fixture crawl: the column "Reflection 3" binds to the announcement row
--      "Reflection 3 (draft)" and stage_assignments adds no second row (the title fallback alone
--      would have inserted one: the titles differ); the stage 'bind' is recorded before 'assignments'
--   2. bind_announcement_rows directly, on one crawl of two courses:
--        bound: "Lab #2" -> "Lab 2 (in class)" (word and number), "Policy memo" -> "Policy Memo (due
--               Friday)" (title with the trailing bracket removed), "Quiz 9" -> "Quiz 9"; and the
--               real ECN.304/quiz-5 with the real "Quiz 5" column, while that row is still unbound
--        not bound: two candidate rows ("Essay 9"), a confirmed row, a row that is not from an
--               announcement, one row claimed by two columns ("Quiz 8" and "Quiz #8"), a column an
--               assignment already carries, a computed column ("Total"), another course's column
--   3. it is idempotent and sets bb_column_id and nothing else
--
-- RUN IT: `node scripts/db-test.mjs --only phase26_212_bind.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t212 (label text primary key, id uuid, txt text) on commit drop;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare v_src text;
begin
  if to_regprocedure('public.bind_announcement_rows(uuid)') is null then
    raise exception 'FAIL phase26_212: migration 212 is not applied (bind_announcement_rows is missing)';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.run_transform(uuid, text)'::regprocedure;
  if position('bind_announcement_rows(p_run_id)' in v_src) = 0
     or position('bind_announcement_rows(p_run_id)' in v_src) > position('stage_assignments(p_run_id, v_id)' in v_src) then
    raise exception 'FAIL 0: run_transform does not run bind_announcement_rows before stage_assignments';
  end if;
  if position('material_history_record' in v_src) = 0 or position('stage_gaps(p_run_id, v_id)' in v_src) = 0
     or position('stage_attempts(p_run_id, v_id)' in v_src) = 0 or position('stage_files(p_run_id, v_id)' in v_src) = 0 then
    raise exception 'FAIL 0: run_transform lost a stage of 135''s body';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.bind_announcement_rows(uuid)'::regprocedure)
     or has_function_privilege('anon', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('anon', 'public.run_transform(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.run_transform(uuid, text)', 'execute') then
    raise exception 'FAIL 0: bind_announcement_rows is not SECURITY DEFINER, or a function is open beyond its owner';
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): fixture rows in ECN.304; every fixture id starts t26-.
-- =============================================================================================
insert into assignments (id, course_id, title, type, series_key, sequence_no, due_date, source, source_ref, confidence)
values
  ('ECN.304/t26-rt',      'ECN.304', 'Reflection 3 (draft)',     'paper', null,             null, '2026-11-10', 'blackboard', 'announcement _t26_rt (2026-10-19)', 'tentative'),
  ('ECN.304/t26-lab-2',   'ECN.304', 'Lab 2 (in class)',         'lab',   'ECN.304/lab',    2,    '2026-11-11', 'blackboard', 'announcement _t26_l2 (2026-10-19)', 'tentative'),
  ('ECN.304/t26-memo',    'ECN.304', 'Policy Memo (due Friday)', 'paper', null,             null, '2026-11-12', 'blackboard', 'announcement _t26_pm (2026-10-19)', 'tentative'),
  ('ECN.304/t26-quiz-9',  'ECN.304', 'Quiz 9',                   'quiz',  'ECN.304/quiz',   9,    '2026-11-13', 'blackboard', 'announcement _t26_q9 (2026-10-19)', 'tentative'),
  ('ECN.304/t26-essay-a', 'ECN.304', 'Essay 9 A',                'paper', 'ECN.304/essay',  9,    '2026-11-14', 'blackboard', 'announcement _t26_ea (2026-10-19)', 'tentative'),
  ('ECN.304/t26-essay-b', 'ECN.304', 'Essay 9 B',                'paper', 'ECN.304/essay',  9,    '2026-11-14', 'blackboard', 'announcement _t26_eb (2026-10-19)', 'tentative'),
  ('ECN.304/t26-exam-z',  'ECN.304', 'Exam Z',                   'exam',  null,             null, '2026-11-15', 'blackboard', 'announcement _t26_ez (2026-10-19)', 'confirmed'),
  ('ECN.304/t26-syl',     'ECN.304', 'Syllabus Project',         'project', null,           null, '2026-11-16', 'syllabus',   'syllabus p. 3',                     'tentative'),
  ('ECN.304/t26-quiz-8',  'ECN.304', 'Quiz 8',                   'quiz',  'ECN.304/quiz',   8,    '2026-11-17', 'blackboard', 'announcement _t26_q8 (2026-10-19)', 'tentative');

-- =============================================================================================
-- 1. run_transform on a fixture crawl
-- =============================================================================================
do $$
declare
  v_run  uuid := gen_random_uuid();
  v_id   bigint;
  v_n    int;
  v_b    timestamptz;
  v_a    timestamptz;
  v_bind jsonb;
begin
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, run_id)
  values ('sync', 'all', 'claimed', 'sync-runner', now(), v_run);
  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run, '_572517_1', 'course', jsonb_build_object('gradebook', jsonb_build_array(
    jsonb_build_object('columnId', '_t26_c_rt', 'name', 'Reflection 3', 'possible', '10', 'isCalc', false))));

  v_id := run_transform(v_run, 'manual');
  if v_id is null then raise exception 'FAIL 1: run_transform returned null'; end if;

  select count(*) into v_n from assignments where course_id = 'ECN.304' and bb_column_id = '_t26_c_rt';
  if v_n <> 1 then
    raise exception 'FAIL 1: % assignments carry the Reflection 3 column, expected 1 (the announcement row)', v_n;
  end if;
  if (select bb_column_id from assignments where id = 'ECN.304/t26-rt') is distinct from '_t26_c_rt' then
    raise exception 'FAIL 1: the announcement row did not receive the column';
  end if;
  if exists (select 1 from assignments where course_id = 'ECN.304' and lower(title) = 'reflection 3') then
    raise exception 'FAIL 1: stage_assignments inserted a second row for the column';
  end if;

  select s.started_at, s.counts into v_b, v_bind from sync_stage_runs s where s.sync_run_id = v_id and s.stage = 'bind' and s.status = 'ok';
  select s.started_at into v_a from sync_stage_runs s where s.sync_run_id = v_id and s.stage = 'assignments' order by s.started_at limit 1;
  if v_b is null then raise exception 'FAIL 1: run_transform recorded no ok stage "bind"'; end if;
  if v_a is not null and v_b > v_a then
    raise exception 'FAIL 1: the bind stage started after the assignments stage';
  end if;
  if (v_bind->>'bound')::int <> 1 then
    raise exception 'FAIL 1: the bind stage counts read %', v_bind;
  end if;
end $$;

-- =============================================================================================
-- 2. bind_announcement_rows directly
-- =============================================================================================
do $$
declare
  v_run uuid := gen_random_uuid();
  v_real boolean;
  v_got jsonb;
  v_expect int := 3;
  v_carried text;
begin
  -- The real case, while it is still the case: ECN.304/quiz-5, unbound, with Quiz 1 to 4 carried.
  v_real := exists (select 1 from assignments where id = 'ECN.304/quiz-5' and bb_column_id is null
                      and source_ref like 'announcement %' and confidence <> 'confirmed'
                      and series_key = 'ECN.304/quiz' and sequence_no = 5)
            and not exists (select 1 from assignments where course_id = 'ECN.304'
                              and (id <> 'ECN.304/quiz-5') and lower(title) like 'quiz 5%');
  if v_real then v_expect := 4; end if;
  select bb_column_id into v_carried from assignments where id = 'ECN.304/quiz-01';

  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run, '_572517_1', 'course', jsonb_build_object('gradebook', jsonb_build_array(
    jsonb_build_object('columnId', '_t26_c_lab2',  'name', 'Lab #2',        'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_memo',  'name', 'Policy memo',   'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_q9',    'name', 'Quiz 9',        'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_ess',   'name', 'Essay 9',       'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_exam',  'name', 'Exam Z',        'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_syl',   'name', 'Syllabus Project', 'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_q8a',   'name', 'Quiz 8',        'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_q8b',   'name', 'Quiz #8',       'isCalc', false),
    jsonb_build_object('columnId', '_t26_c_total', 'name', 'Total',         'isCalc', true),
    jsonb_build_object('columnId', '_t26_c_q5',    'name', 'Quiz 5',        'isCalc', false),
    jsonb_build_object('columnId', coalesce(v_carried, '_t26_none'), 'name', 'Policy Memo (due Friday)', 'isCalc', false))));
  -- Another course's "Lab #2": it must not reach a row of ECN.304.
  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run, '_571529_1', 'course', jsonb_build_object('gradebook', jsonb_build_array(
    jsonb_build_object('columnId', '_t26_c_other', 'name', 'Lab #2', 'isCalc', false))));

  v_got := bind_announcement_rows(v_run);
  if (v_got->>'bound')::int <> v_expect then
    raise exception 'FAIL 2: bound % columns, expected %: %', v_got->>'bound', v_expect, v_got;
  end if;
  if (v_got->>'columns_skipped')::int < 1 or (v_got->>'already_carried')::int < 1 then
    raise exception 'FAIL 2: the counts do not show the skipped and carried columns: %', v_got;
  end if;

  if (select bb_column_id from assignments where id = 'ECN.304/t26-lab-2')  is distinct from '_t26_c_lab2'
     or (select bb_column_id from assignments where id = 'ECN.304/t26-memo')   is distinct from '_t26_c_memo'
     or (select bb_column_id from assignments where id = 'ECN.304/t26-quiz-9') is distinct from '_t26_c_q9' then
    raise exception 'FAIL 2: a row that should be bound is not: lab-2 %, memo %, quiz-9 %',
      (select bb_column_id from assignments where id = 'ECN.304/t26-lab-2'),
      (select bb_column_id from assignments where id = 'ECN.304/t26-memo'),
      (select bb_column_id from assignments where id = 'ECN.304/t26-quiz-9');
  end if;
  if v_real and (select bb_column_id from assignments where id = 'ECN.304/quiz-5') is distinct from '_t26_c_q5' then
    raise exception 'FAIL 2: the real ECN.304/quiz-5 was not bound to the "Quiz 5" column';
  end if;

  if exists (select 1 from assignments
              where id in ('ECN.304/t26-essay-a', 'ECN.304/t26-essay-b', 'ECN.304/t26-exam-z',
                           'ECN.304/t26-syl', 'ECN.304/t26-quiz-8')
                and bb_column_id is not null) then
    raise exception 'FAIL 2: a row that must stay unbound was bound: %',
      (select string_agg(id || '=' || bb_column_id, ', ') from assignments
        where id like 'ECN.304/t26-%' and bb_column_id is not null and id not in
              ('ECN.304/t26-lab-2', 'ECN.304/t26-memo', 'ECN.304/t26-quiz-9', 'ECN.304/t26-rt'));
  end if;
  if exists (select 1 from assignments where bb_column_id in ('_t26_c_total', '_t26_c_other')) then
    raise exception 'FAIL 2: a computed column, or another course''s column, was bound';
  end if;
  if (select bb_column_id from assignments where id = 'ECN.304/quiz-01') is distinct from v_carried then
    raise exception 'FAIL 2: an already carried column moved';
  end if;

  -- 3. Only bb_column_id changed, and a second call has nothing left to bind.
  if exists (select 1 from assignments a
              where a.id = 'ECN.304/t26-lab-2'
                and (a.title <> 'Lab 2 (in class)' or a.due_date <> date '2026-11-11' or a.confidence::text <> 'tentative'
                     or a.source_ref <> 'announcement _t26_l2 (2026-10-19)' or a.series_key <> 'ECN.304/lab'
                     or a.sequence_no <> 2 or a.type::text <> 'lab')) then
    raise exception 'FAIL 3: the bind changed more than bb_column_id';
  end if;
  v_got := bind_announcement_rows(v_run);
  if (v_got->>'bound')::int <> 0 then
    raise exception 'FAIL 3: a second call bound % more columns', v_got->>'bound';
  end if;
end $$;

select 'phase26_212_bind: PASS' as result;

rollback;
