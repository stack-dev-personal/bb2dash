-- bb2dash :: db/tests/phase27_220_knowledge_checks.sql
-- Tests migration 220 (Stack, Inbox item 6336, 2026-10-14: "refactor the logic so that knowledge
-- checks are expected to be posted day of my ist352 lectures"). A new IST.352 gradebook column
-- titled "Knowledge Check ..." whose date falls on an IST.352 class day is recorded as confirmed,
-- submission blackboard, under the attendance component (33), with a cited source, and no Inbox
-- question is raised. Everything else keeps today's behaviour: a tentative row and a question.
--
-- Cases (probe columns appended to the newest crawl's course payloads, then one replay of
-- stage_assignments):
--   A  Knowledge Check, IST.352, a lecture session day (Mon 2026-10-26)         -> confirmed, no question
--   B  Knowledge Check, IST.352, a session of kind `other` (Wed 2026-10-14)     -> confirmed, no question
--   C  Knowledge Check, IST.352, a weekly meeting day with no session row
--      (Wed 2026-10-21)                                                         -> confirmed, no question
--   D  Knowledge Check, IST.352, a `no_class` day on the meeting pattern
--      (Mon 2026-10-12, Fall Break)                                             -> tentative, asks
--   E  Knowledge Check, IST.352, no session and no meeting (Tue 2026-10-20)     -> tentative, asks
--   F  another title, IST.352, a lecture day                                    -> tentative, asks
--   G  Knowledge Check, another course (IST.323), its own class day             -> tentative, asks
--   H  an existing tentative IST.352 row the column binds to by title           -> untouched, not promoted
--   I  the existing confirmed knowledge checks and Stack's planner state         -> unchanged
--
-- It leans on prod's IST.352 sessions and meetings for its dates; section 0 checks that they still
-- say what the cases assume, so a changed calendar fails loudly instead of testing the wrong thing.
-- Failures are collected and raised once. The last statement is `rollback`.

begin;

do $$
declare
  KC_COURSE    constant text   := 'IST.352';
  OTHER_COURSE constant text   := 'IST.323';
  PROBE        constant text   := '_220_probe_';
  v_fail       text[] := '{}';
  v_run        uuid;
  v_sync       bigint;
  v_raw_kc     bigint;
  v_raw_other  bigint;
  v_progress_before text;
  v_progress_after  text;
  v_kc_before  text;
  v_kc_after   text;
  r            jsonb;
  p            record;
  a            assignments%rowtype;
  n            int;
begin
  -- =========================================================================================
  -- 0. The calendar the cases assume
  -- =========================================================================================
  if not exists (select 1 from sessions where course_id = KC_COURSE and session_date = '2026-10-26' and kind = 'lecture') then
    v_fail := v_fail || 'precondition: IST.352 2026-10-26 is no longer a lecture session'::text;
  end if;
  if not exists (select 1 from sessions where course_id = KC_COURSE and session_date = '2026-10-14' and kind = 'other') then
    v_fail := v_fail || 'precondition: IST.352 2026-10-14 is no longer a session of kind other'::text;
  end if;
  if exists (select 1 from sessions where course_id = KC_COURSE and session_date = '2026-10-21')
     or not exists (select 1 from meetings where course_id = KC_COURSE and day_of_week = 3) then
    v_fail := v_fail || 'precondition: IST.352 2026-10-21 is not a bare Wednesday meeting day'::text;
  end if;
  if not exists (select 1 from sessions where course_id = KC_COURSE and session_date = '2026-10-12' and kind = 'no_class')
     or not exists (select 1 from meetings where course_id = KC_COURSE and day_of_week = 1) then
    v_fail := v_fail || 'precondition: IST.352 2026-10-12 is not a no_class Monday'::text;
  end if;
  if exists (select 1 from sessions where course_id = KC_COURSE and session_date = '2026-10-20')
     or exists (select 1 from meetings where course_id = KC_COURSE and day_of_week = 2) then
    v_fail := v_fail || 'precondition: IST.352 now has class on Tuesday 2026-10-20'::text;
  end if;
  if not exists (select 1 from meetings where course_id = OTHER_COURSE and day_of_week = 1) then
    v_fail := v_fail || 'precondition: IST.323 no longer meets on Mondays'::text;
  end if;
  if (select count(*) from grade_components where course_id = KC_COURSE and code = 'attendance') <> 1 then
    v_fail := v_fail || 'precondition: IST.352 has not exactly one attendance component'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase27_220: %', array_to_string(v_fail, '; ');
  end if;

  -- =========================================================================================
  -- 1. Fixtures: probe columns on the newest crawl, one existing tentative row (case H)
  -- =========================================================================================
  select s.run_id, s.id into v_run, v_sync
    from sync_runs s
   where s.source = 'blackboard' and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered' and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1;
  if v_run is null then
    raise exception 'FAIL phase27_220: there is no folded Blackboard crawl to replay';
  end if;

  select b.id into v_raw_kc from bb_raw b
   where b.run_id = v_run and b.kind = 'course' and bb_resolve_course(b.bb_course_id) = KC_COURSE
   order by b.id limit 1;
  select b.id into v_raw_other from bb_raw b
   where b.run_id = v_run and b.kind = 'course' and bb_resolve_course(b.bb_course_id) = OTHER_COURSE
   order by b.id limit 1;
  if v_raw_kc is null or v_raw_other is null then
    raise exception 'FAIL phase27_220: the newest crawl lacks an IST.352 or IST.323 payload';
  end if;

  create temp table _probe (
    case_id  text primary key,
    course   text,
    col      text,
    name     text,
    due      timestamptz,
    expect   text          -- 'confirmed' (no question) or 'asks'
  ) on commit drop;

  insert into _probe values
    ('A', KC_COURSE,    PROBE || 'A', 'Knowledge Check - 220 probe A lecture',   '2026-10-26 16:50+00', 'confirmed'),
    ('B', KC_COURSE,    PROBE || 'B', 'Knowledge Check - 220 probe B other',     '2026-10-14 16:50+00', 'confirmed'),
    ('C', KC_COURSE,    PROBE || 'C', 'knowledge check 220 probe C wednesday',   '2026-10-21 16:50+00', 'confirmed'),
    ('D', KC_COURSE,    PROBE || 'D', 'Knowledge Check - 220 probe D no class',  '2026-10-12 16:50+00', 'asks'),
    ('E', KC_COURSE,    PROBE || 'E', 'Knowledge Check - 220 probe E tuesday',   '2026-10-20 16:50+00', 'asks'),
    ('F', KC_COURSE,    PROBE || 'F', 'Reading Check - 220 probe F lecture',     '2026-10-26 16:50+00', 'asks'),
    ('G', OTHER_COURSE, PROBE || 'G', 'Knowledge Check - 220 probe G other course', '2026-10-26 16:50+00', 'asks'),
    ('H', KC_COURSE,    PROBE || 'H', 'Knowledge Check - 220 probe H existing',  '2026-10-26 16:50+00', 'existing');

  update bb_raw b
     set payload = jsonb_set(b.payload, '{gradebook}',
                     bb_jarray(b.payload->'gradebook') ||
                     (select jsonb_agg(jsonb_build_object(
                               'columnId', pb.col, 'name', pb.name, 'possible', 0,
                               'due', to_char(pb.due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                               'isCalc', false) order by pb.case_id)
                        from _probe pb
                       where pb.course = case when b.id = v_raw_kc then KC_COURSE else OTHER_COURSE end))
   where b.id in (v_raw_kc, v_raw_other);

  -- Case H: a tentative row, unbound, whose title the probe column matches.
  insert into assignments (id, course_id, title, type, due_at, points_possible,
                           source, source_ref, confidence)
  values (KC_COURSE || '/220-probe-h', KC_COURSE, 'Knowledge Check - 220 probe H existing', 'quiz',
          '2026-10-26 16:50+00', 0, 'blackboard', 'phase27_220 test probe', 'tentative');

  -- Case I: snapshots of what must not move.
  select string_agg(format('%s|%s|%s|%s|%s', id, confidence, submission, component_id, source_ref), ';' order by id)
    into v_kc_before
    from assignments where course_id = KC_COURSE and title ~* '^knowledge check' and source_ref is distinct from 'phase27_220 test probe';
  select md5(coalesce(string_agg(t::text, ';' order by t::text), '')) into v_progress_before from assignment_progress t;

  -- =========================================================================================
  -- 2. One replay
  -- =========================================================================================
  r := stage_assignments(v_run, v_sync);
  if r->>'status' <> 'ok' then
    raise exception 'FAIL phase27_220: the replay failed: %', r;
  end if;
  if coalesce((r->'counts'->>'expected_confirmed')::int, -1) <> 3 then
    v_fail := v_fail || format('counts.expected_confirmed is %s, expected 3', coalesce(r->'counts'->>'expected_confirmed', '<missing>'));
  end if;

  -- =========================================================================================
  -- 3. Each probe
  -- =========================================================================================
  for p in select * from _probe where expect <> 'existing' order by case_id loop
    select * into a from assignments where course_id = p.course and bb_column_id = p.col;
    if a.id is null then
      v_fail := v_fail || format('case %s: no assignment was recorded for the column', p.case_id);
      continue;
    end if;
    select count(*) into n from attention_items where ref = a.id and state = 'open';

    if p.expect = 'confirmed' then
      if a.confidence <> 'confirmed' or a.submission <> 'blackboard'
         or a.component_id is distinct from (select id from grade_components where course_id = KC_COURSE and code = 'attendance') then
        v_fail := v_fail || format('case %s: recorded as %s / %s / component %s, expected confirmed / blackboard / attendance',
                                   p.case_id, a.confidence, a.submission, coalesce(a.component_id::text, 'null'));
      end if;
      if position('bb_file:70#unit:2 "Knowledge Check (5 min.)"' in coalesce(a.source_ref, '')) = 0
         or position('rule 220' in coalesce(a.source_ref, '')) = 0 then
        v_fail := v_fail || format('case %s: source_ref does not cite the rule and its source: %s', p.case_id, a.source_ref);
      end if;
      if n <> 0 then
        v_fail := v_fail || format('case %s: %s Inbox question(s) raised, expected none', p.case_id, n);
      end if;
    else
      if a.confidence <> 'tentative' or a.submission <> 'unknown' or a.component_id is not null then
        v_fail := v_fail || format('case %s: recorded as %s / %s / component %s, expected tentative / unknown / null',
                                   p.case_id, a.confidence, a.submission, coalesce(a.component_id::text, 'null'));
      end if;
      if position('rule 220' in coalesce(a.source_ref, '')) > 0 then
        v_fail := v_fail || format('case %s: source_ref cites rule 220 although the rule does not apply', p.case_id);
      end if;
      if not exists (select 1 from attention_items
                      where ref = a.id and state = 'open' and kind = 'stack_must_confirm') then
        v_fail := v_fail || format('case %s: no stack_must_confirm question was raised', p.case_id);
      end if;
    end if;
  end loop;

  -- Case H: bound by title, still tentative, nothing promoted, nothing asked about it here.
  select * into a from assignments where id = KC_COURSE || '/220-probe-h';
  if a.bb_column_id is distinct from PROBE || 'H' then
    v_fail := v_fail || format('case H: the existing row was not bound to its column (bb_column_id %s)', coalesce(a.bb_column_id, 'null'));
  end if;
  if a.confidence <> 'tentative' or a.submission <> 'unknown' or a.component_id is not null
     or a.source_ref is distinct from 'phase27_220 test probe' then
    v_fail := v_fail || format('case H: the existing row was changed (%s / %s / component %s / %s)',
                               a.confidence, a.submission, coalesce(a.component_id::text, 'null'), a.source_ref);
  end if;
  if exists (select 1 from assignments where course_id = KC_COURSE and bb_column_id = PROBE || 'H' and id <> a.id) then
    v_fail := v_fail || 'case H: a second row was inserted for a column that matched an existing one'::text;
  end if;

  -- Case I.
  select string_agg(format('%s|%s|%s|%s|%s', id, confidence, submission, component_id, source_ref), ';' order by id)
    into v_kc_after
    from assignments where course_id = KC_COURSE and title ~* '^knowledge check'
                       and source_ref is distinct from 'phase27_220 test probe'
                       and left(coalesce(bb_column_id, ''), length(PROBE)) <> PROBE;
  if v_kc_after is distinct from v_kc_before then
    v_fail := v_fail || 'case I: an existing IST.352 knowledge check changed'::text;
  end if;
  select md5(coalesce(string_agg(t::text, ';' order by t::text), '')) into v_progress_after from assignment_progress t;
  if v_progress_after is distinct from v_progress_before then
    v_fail := v_fail || 'case I: assignment_progress changed'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase27_220: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase27_220_knowledge_checks: PASS' as result;

rollback;
