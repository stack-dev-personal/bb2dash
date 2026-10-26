-- bb2dash :: db/tests/phase26_223_announcement_dates.sql
-- Phase 26 follow-up (2026-10-26). Tests migration 223: a day (or points) the announcement gave is
-- never replaced by a bound column's value without asking, and the reader's own open question on a
-- row's date or points is never overwritten by the transform.
--
--   0. installed: the live stage_assignments carries 223's rule and 220's class-day rule
--   1. run_transform on one fixture crawl of ECN.304, each fixture row already bound to its column
--      ("ann" = source_ref starts 'announcement '; "history" = an earlier crawl's bb_gradebook row):
--        a. ann, event_start 10/22 only, Blackboard 10/27              -> unchanged, conflict naming 10/22
--        b. ann, due_date 10/27, Blackboard 10/29                      -> unchanged, conflict
--        c. ann, due_date 11/3, Blackboard 11/3 at 4 PM                -> due_at filled
--        d. ann, no day at all, Blackboard 11/4                        -> due_at filled
--        e. ann, confirmed by "Keep mine" for 10/28, Blackboard 10/28  -> unchanged, settled, nothing new
--        f. not ann, tentative, 11/5 vs 11/6                           -> overwritten, as under 220
--        g. ann, points 10, Blackboard 8 on the same day               -> points kept and asked, due_at filled
--        h. ann, due_at 11/8 11:59 PM, Blackboard 11/9 11:59 PM        -> unchanged, conflict
--        i. ann, due_at 11/12 11:59 PM, Blackboard 11/12 5 PM          -> overwritten (same day), as under 220
--        j. ann, the reader's due_at question open, Blackboard 11/16   -> unchanged, that item untouched
--        k. ann, due_at Blackboard gave before (history), moved        -> overwritten, no question
--        l. ann, confirmed, event_start 10/22, Blackboard 10/27        -> unchanged, conflict naming 10/22
--        m. ann, points Blackboard gave before (history), moved        -> overwritten, as under 220
--        n. ann, confirmed by "Keep mine" for 10/28, Blackboard now 10/29 -> unchanged, a new conflict
--        o. not ann, confirmed, the reader's due_date question open   -> unchanged, that item untouched
--        p. ann, the reader's due_date question open, Blackboard out of term -> that item untouched
--        q. ann, event_start 10/22 only, Blackboard out of term        -> conflict naming 10/22
--      and the stage's counts: 10 conflicts (3 of them holds), 4 overwritten, 1 settled, 3 filled.
--
-- RUN IT: `node scripts/db-test.mjs --only phase26_223_announcement_dates.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare def text := pg_get_functiondef('public.stage_assignments(uuid,bigint)'::regprocedure);
begin
  if position('if c.due_at is not null and v_reader_due then' in def) = 0
     or position('and (not v_post_day or v_bb_day = v_ann_day) then' in def) = 0 then
    raise exception 'FAIL phase26_223: migration 223 is not applied (stage_assignments has no announced-day rule)';
  end if;
  if position('class_day_knowledge_check(c.course_id, c.name, c.due_at, c.possible)' in def) = 0 then
    raise exception 'FAIL 0: stage_assignments lost 220''s class-day rule';
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): fixture rows in ECN.304, each bound to its own fixture column.
-- Every fixture id starts t223-, every column id _t223_.
-- =============================================================================================
insert into assignments (id, course_id, title, type, due_at, due_date, event_start, points_possible,
                         source, source_ref, confidence, bb_column_id)
values
  ('ECN.304/t223-ev',    'ECN.304', 'T223 in class',      'quiz',  null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_ev (2026-10-19)', 'tentative', '_t223_ev'),
  ('ECN.304/t223-dd',    'ECN.304', 'T223 dated',         'quiz',  null, '2026-10-27', null, null,
   'blackboard', 'announcement _t223_dd (2026-10-25)', 'tentative', '_t223_dd'),
  ('ECN.304/t223-same',  'ECN.304', 'T223 same day',      'quiz',  null, '2026-11-03', null, null,
   'blackboard', 'announcement _t223_sd (2026-10-25)', 'tentative', '_t223_same'),
  ('ECN.304/t223-none',  'ECN.304', 'T223 no day',        'quiz',  null, null, null, null,
   'blackboard', 'announcement _t223_nd (2026-10-25)', 'tentative', '_t223_none'),
  ('ECN.304/t223-kept',  'ECN.304', 'T223 kept',          'quiz',  null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_kp (2026-10-19)', 'confirmed', '_t223_kept'),
  ('ECN.304/t223-syl',   'ECN.304', 'T223 syllabus',      'quiz',  null, '2026-11-05', null, null,
   'syllabus',   'syllabus p. 3', 'tentative', '_t223_syl'),
  ('ECN.304/t223-pts',   'ECN.304', 'T223 points',        'quiz',  null, '2026-11-07', null, 10,
   'blackboard', 'announcement _t223_pt (2026-10-25)', 'tentative', '_t223_pts'),
  ('ECN.304/t223-inst',  'ECN.304', 'T223 instant',       'paper', '2026-11-09 04:59+00', null, null, null,
   'blackboard', 'announcement _t223_in (2026-10-25)', 'tentative', '_t223_inst'),
  ('ECN.304/t223-clock', 'ECN.304', 'T223 clock',         'paper', '2026-11-13 04:59+00', null, null, null,
   'blackboard', 'announcement _t223_cl (2026-10-25)', 'tentative', '_t223_clock'),
  ('ECN.304/t223-rdr',   'ECN.304', 'T223 reader asks',   'quiz',  null, '2026-11-14', null, null,
   'blackboard', 'announcement _t223_rd (2026-10-25)', 'tentative', '_t223_rdr'),
  ('ECN.304/t223-moved', 'ECN.304', 'T223 moved later',   'paper', '2026-11-18 21:00+00', null, null, null,
   'blackboard', 'announcement _t223_mv (2026-10-19)', 'tentative', '_t223_moved'),
  ('ECN.304/t223-conf',  'ECN.304', 'T223 confirmed',     'quiz',  null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_cf (2026-10-19)', 'confirmed', '_t223_conf'),
  ('ECN.304/t223-ptsl',  'ECN.304', 'T223 points later',  'quiz',  null, null, null, 8,
   'blackboard', 'announcement _t223_pl (2026-10-19)', 'tentative', '_t223_ptsl'),
  ('ECN.304/t223-kmov',  'ECN.304', 'T223 kept then moved', 'quiz', null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_km (2026-10-19)', 'confirmed', '_t223_kmov'),
  ('ECN.304/t223-srdr',  'ECN.304', 'T223 syllabus asked', 'paper', '2026-11-10 21:00+00', null, null, null,
   'syllabus',   'syllabus p. 4', 'confirmed', '_t223_srdr'),
  ('ECN.304/t223-oot',   'ECN.304', 'T223 out of term asked', 'quiz', null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_ot (2026-10-19)', 'tentative', '_t223_oot'),
  ('ECN.304/t223-ootq',  'ECN.304', 'T223 out of term',   'quiz',  null, null, '2026-10-22 19:30+00', null,
   'blackboard', 'announcement _t223_oq (2026-10-19)', 'tentative', '_t223_ootq');

-- Cases k and m: an earlier crawl in which Blackboard gave the held value itself.
insert into bb_gradebook (run_id, course_id, column_id, name, column_kind, due_at, possible, seen_at, raw)
values
  (gen_random_uuid(), 'ECN.304', '_t223_moved', 'T223 moved later',  'item', '2026-11-18 21:00+00', null, now() - interval '2 days', '{}'::jsonb),
  (gen_random_uuid(), 'ECN.304', '_t223_ptsl',  'T223 points later', 'item', null,                  8,    now() - interval '2 days', '{}'::jsonb);

-- Cases e and n: Stack answered "Keep mine" to Blackboard's 10/28 (applied, archived).
insert into attention_items (kind, course_id, entity, ref, field, from_value, to_value, question, state,
                             resolved_at, resolution, applied_at, archived_at)
values
  ('conflict', 'ECN.304', 'assignment', 'ECN.304/t223-kept', 'due_at', to_jsonb('2026-10-22'::text),
   to_jsonb('2026-10-28 16:00+00'::timestamptz), 'T223 fixture: kept', 'archived',
   now(), '{"accept":"keep"}'::jsonb, now(), now()),
  ('conflict', 'ECN.304', 'assignment', 'ECN.304/t223-kmov', 'due_at', to_jsonb('2026-10-22'::text),
   to_jsonb('2026-10-28 16:00+00'::timestamptz), 'T223 fixture: kept, then moved', 'archived',
   now(), '{"accept":"keep"}'::jsonb, now(), now());

-- Cases j, o and p: the reader's own open questions (raised from posts that moved the work).
insert into attention_items (kind, course_id, entity, ref, field, from_value, to_value, question, state, suggested)
values
  ('conflict', 'ECN.304', 'assignment', 'ECN.304/t223-rdr',  'due_at',   to_jsonb('2026-11-14'::text),
   to_jsonb('2026-11-20'::text), 'T223 fixture: the reader asks (j)', 'open',
   '{"source":"announcement","quote":"T223 moved to 11/20"}'::jsonb),
  ('conflict', 'ECN.304', 'assignment', 'ECN.304/t223-srdr', 'due_date', to_jsonb('2026-11-10'::text),
   to_jsonb('2026-11-12'::text), 'T223 fixture: the reader asks (o)', 'open',
   '{"source":"announcement","quote":"T223 moved to 11/12"}'::jsonb),
  ('conflict', 'ECN.304', 'assignment', 'ECN.304/t223-oot',  'due_date', to_jsonb('2026-10-22'::text),
   to_jsonb('2026-10-23'::text), 'T223 fixture: the reader asks (p)', 'open',
   '{"source":"announcement","quote":"T223 moved to 10/23"}'::jsonb);

-- =============================================================================================
-- 1. run_transform on a fixture crawl
-- =============================================================================================
do $$
declare
  v_run uuid := gen_random_uuid();
  v_id  bigint;
  r     assignments%rowtype;
  v_cnt jsonb;
begin
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, run_id)
  values ('sync', 'all', 'claimed', 'sync-runner', now(), v_run);
  insert into bb_raw (run_id, bb_course_id, kind, payload)
  values (v_run, '_572517_1', 'course', jsonb_build_object('gradebook', jsonb_build_array(
    jsonb_build_object('columnId', '_t223_ev',    'name', 'T223 in class',     'due', '2026-10-27T16:53:23Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_dd',    'name', 'T223 dated',        'due', '2026-10-29T16:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_same',  'name', 'T223 same day',     'due', '2026-11-03T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_none',  'name', 'T223 no day',       'due', '2026-11-04T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_kept',  'name', 'T223 kept',         'due', '2026-10-28T16:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_syl',   'name', 'T223 syllabus',     'due', '2026-11-06T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_pts',   'name', 'T223 points',       'due', '2026-11-07T21:00:00Z',
                       'possible', '8', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_inst',  'name', 'T223 instant',      'due', '2026-11-10T04:59:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_clock', 'name', 'T223 clock',        'due', '2026-11-12T22:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_rdr',   'name', 'T223 reader asks',  'due', '2026-11-16T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_moved', 'name', 'T223 moved later',  'due', '2026-11-19T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_conf',  'name', 'T223 confirmed',    'due', '2026-10-27T16:53:23Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_ptsl',  'name', 'T223 points later', 'possible', '9', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_kmov',  'name', 'T223 kept then moved', 'due', '2026-10-29T16:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_srdr',  'name', 'T223 syllabus asked', 'due', '2026-11-11T21:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_oot',   'name', 'T223 out of term asked', 'due', '2025-10-27T16:00:00Z', 'isCalc', false),
    jsonb_build_object('columnId', '_t223_ootq',  'name', 'T223 out of term',  'due', '2025-10-27T16:00:00Z', 'isCalc', false))));

  v_id := run_transform(v_run, 'manual');
  if v_id is null then raise exception 'FAIL 1: run_transform returned null'; end if;
  if not exists (select 1 from sync_stage_runs where sync_run_id = v_id and stage = 'assignments' and status = 'ok') then
    raise exception 'FAIL 1: the assignments stage did not finish ok: %',
      (select error from sync_stage_runs where sync_run_id = v_id and stage = 'assignments' limit 1);
  end if;

  -- a. event_start only, another day: unchanged, asked, and the question names the held day.
  select * into r from assignments where id = 'ECN.304/t223-ev';
  if r.due_at is not null or r.due_date is not null then
    raise exception 'FAIL 1a: the in-class row took Blackboard''s date (due_at %, due_date %)', r.due_at, r.due_date;
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-ev' and kind = 'conflict' and field = 'due_at'
                    and state = 'open' and from_value = to_jsonb('2026-10-22'::text)
                    and to_value = to_jsonb('2026-10-27 16:53:23+00'::timestamptz)
                    and question like '%due 2026-10-22; Blackboard says 2026-10-27%') then
    raise exception 'FAIL 1a: no open due_at conflict naming 2026-10-22 against 2026-10-27';
  end if;

  -- b. due_date, another day: unchanged, asked.
  select * into r from assignments where id = 'ECN.304/t223-dd';
  if r.due_at is not null or r.due_date <> date '2026-10-27' then
    raise exception 'FAIL 1b: the dated row moved (due_at %, due_date %)', r.due_at, r.due_date;
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-dd' and kind = 'conflict'
                    and field = 'due_at' and state = 'open') then
    raise exception 'FAIL 1b: no open due_at conflict for the dated row';
  end if;

  -- c. same day: Blackboard adds the clock time.
  if (select due_at from assignments where id = 'ECN.304/t223-same') is distinct from '2026-11-03 21:00+00'::timestamptz then
    raise exception 'FAIL 1c: the same-day row was not given Blackboard''s time';
  end if;

  -- d. no held day: filled.
  if (select due_at from assignments where id = 'ECN.304/t223-none') is distinct from '2026-11-04 21:00+00'::timestamptz then
    raise exception 'FAIL 1d: the row with no day was not filled';
  end if;

  -- e. a kept answer stands: unchanged, nothing new raised.
  if (select due_at from assignments where id = 'ECN.304/t223-kept') is not null then
    raise exception 'FAIL 1e: the kept row took Blackboard''s date';
  end if;
  if exists (select 1 from attention_items where ref = 'ECN.304/t223-kept' and state = 'open') then
    raise exception 'FAIL 1e: a question was raised again after "Keep mine"';
  end if;

  -- f. not from an announcement: 220's behaviour, overwritten.
  select * into r from assignments where id = 'ECN.304/t223-syl';
  if r.due_at is distinct from '2026-11-06 21:00+00'::timestamptz or r.due_date <> date '2026-11-06' then
    raise exception 'FAIL 1f: the syllabus row was not overwritten as under 220 (due_at %, due_date %)', r.due_at, r.due_date;
  end if;
  if exists (select 1 from attention_items where ref = 'ECN.304/t223-syl' and state = 'open') then
    raise exception 'FAIL 1f: the syllabus row raised a question';
  end if;

  -- g. held points: kept and asked; same day, so due_at is filled.
  select * into r from assignments where id = 'ECN.304/t223-pts';
  if r.due_at is distinct from '2026-11-07 21:00+00'::timestamptz then
    raise exception 'FAIL 1g: the same-day due_at was not filled on the points row';
  end if;
  if r.points_possible <> 10 then
    raise exception 'FAIL 1g: the held points were overwritten (now %)', r.points_possible;
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-pts' and kind = 'conflict'
                    and field = 'points_possible' and state = 'open') then
    raise exception 'FAIL 1g: no open points_possible conflict';
  end if;

  -- h. a held instant on another day: unchanged, asked.
  if (select due_at from assignments where id = 'ECN.304/t223-inst') is distinct from '2026-11-09 04:59+00'::timestamptz then
    raise exception 'FAIL 1h: the held instant moved to another day';
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-inst' and kind = 'conflict'
                    and field = 'due_at' and state = 'open') then
    raise exception 'FAIL 1h: no open due_at conflict for the held instant';
  end if;

  -- i. same day, another clock time: Blackboard's time, as under 220.
  if (select due_at from assignments where id = 'ECN.304/t223-clock') is distinct from '2026-11-12 22:00+00'::timestamptz then
    raise exception 'FAIL 1i: the same-day clock time was not taken from Blackboard';
  end if;

  -- j. the reader's open due_at question stands, word for word, and the row waits for it.
  select * into r from assignments where id = 'ECN.304/t223-rdr';
  if r.due_at is not null or r.due_date <> date '2026-11-14' then
    raise exception 'FAIL 1j: the row moved while the reader asked (due_at %, due_date %)', r.due_at, r.due_date;
  end if;
  if (select count(*) from attention_items where ref = 'ECN.304/t223-rdr' and state = 'open') <> 1
     or not exists (select 1 from attention_items where ref = 'ECN.304/t223-rdr' and state = 'open'
                       and to_value = to_jsonb('2026-11-20'::text) and suggested->>'source' = 'announcement'
                       and question = 'T223 fixture: the reader asks (j)') then
    raise exception 'FAIL 1j: the reader''s open question was overwritten or doubled';
  end if;

  -- k. a day Blackboard gave before moves with Blackboard, without a question.
  if (select due_at from assignments where id = 'ECN.304/t223-moved') is distinct from '2026-11-19 21:00+00'::timestamptz then
    raise exception 'FAIL 1k: a due_at Blackboard gave earlier did not follow Blackboard';
  end if;
  if exists (select 1 from attention_items where ref = 'ECN.304/t223-moved' and state = 'open') then
    raise exception 'FAIL 1k: a question was raised for a value Blackboard gave itself';
  end if;

  -- l. a confirmed announcement row with an in-class day: unchanged, asked.
  if (select due_at from assignments where id = 'ECN.304/t223-conf') is not null then
    raise exception 'FAIL 1l: the confirmed in-class row took Blackboard''s date';
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-conf' and kind = 'conflict'
                    and field = 'due_at' and state = 'open' and from_value = to_jsonb('2026-10-22'::text)) then
    raise exception 'FAIL 1l: no open due_at conflict naming 2026-10-22 for the confirmed row';
  end if;

  -- m. points Blackboard gave before move with Blackboard.
  if (select points_possible from assignments where id = 'ECN.304/t223-ptsl') <> 9 then
    raise exception 'FAIL 1m: points Blackboard gave earlier did not follow Blackboard';
  end if;

  -- n. kept, then Blackboard moved again: not filled silently, asked anew.
  if (select due_at from assignments where id = 'ECN.304/t223-kmov') is not null then
    raise exception 'FAIL 1n: the kept in-class row took Blackboard''s new date without a question';
  end if;
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-kmov' and kind = 'conflict'
                    and field = 'due_at' and state = 'open'
                    and to_value = to_jsonb('2026-10-29 16:00+00'::timestamptz)) then
    raise exception 'FAIL 1n: no new conflict after Blackboard moved past the kept answer';
  end if;

  -- o. a row the reader did not make: its open due_date question stands, the row waits.
  if (select due_at from assignments where id = 'ECN.304/t223-srdr') is distinct from '2026-11-10 21:00+00'::timestamptz then
    raise exception 'FAIL 1o: the syllabus row moved while the reader asked';
  end if;
  if (select count(*) from attention_items where ref = 'ECN.304/t223-srdr' and state = 'open') <> 1
     or not exists (select 1 from attention_items where ref = 'ECN.304/t223-srdr' and state = 'open'
                       and question = 'T223 fixture: the reader asks (o)' and suggested->>'source' = 'announcement') then
    raise exception 'FAIL 1o: the reader''s open question on a syllabus row was overwritten or doubled';
  end if;

  -- p. an out-of-term date does not overwrite the reader's open question.
  if (select count(*) from attention_items where ref = 'ECN.304/t223-oot' and state = 'open') <> 1
     or not exists (select 1 from attention_items where ref = 'ECN.304/t223-oot' and state = 'open'
                       and question = 'T223 fixture: the reader asks (p)') then
    raise exception 'FAIL 1p: the out-of-term branch overwrote or doubled the reader''s question';
  end if;

  -- q. out of term on an in-class row: the question names the held day, not "no date".
  if not exists (select 1 from attention_items where ref = 'ECN.304/t223-ootq' and kind = 'conflict'
                    and field = 'due_at' and state = 'open' and from_value = to_jsonb('2026-10-22'::text)
                    and question like '%bb2dash kept 2026-10-22%') then
    raise exception 'FAIL 1q: the out-of-term question does not name the held day';
  end if;

  -- The stage's counts: a b g h l n q asked, j o p held; f i k m overwritten; e settled; c d g filled.
  select counts into v_cnt from sync_stage_runs where sync_run_id = v_id and stage = 'assignments';
  if (v_cnt->>'conflicts')::int <> 10 or (v_cnt->>'fields_overwritten')::int <> 4
     or (v_cnt->>'conflicts_settled')::int <> 1 or (v_cnt->>'fields_filled')::int <> 3 then
    raise exception 'FAIL 1: the assignments stage counts read %', v_cnt;
  end if;
end $$;

select 'phase26_223_announcement_dates: PASS' as result;

rollback;
