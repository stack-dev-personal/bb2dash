-- bb2dash :: db/migrations/212_bind_announcement_rows.sql
-- Phase 26 (the announcement reader; brief 120). Block 210-219. Applies after 211.
--
-- WHY. The reader adds a planner row from an announcement ("Quiz 5 This Thursday") before Blackboard
-- has a gradebook column for it. When the column appears, stage_assignments (126) finds no row that
-- carries its id and falls back on a title match; if the title or the numbering differs by a word,
-- it inserts a second row and the planner shows the quiz twice. This file binds the column to the
-- announcement's row first, by id, so stage_assignments then matches by id as it does for every
-- bound row.
--
-- It amends 2026-09-22's rule "bind with Stack's confirmation first", for announcement rows only
-- (rows whose source_ref begins 'announcement ' and that are not yet confirmed). Two or more
-- candidates: no bind, so today's stack_must_confirm still fires.
--
-- WHAT
--   1. bind_announcement_rows(p_run_id uuid) returns jsonb. For each gradebook column in the run's
--      kind = 'course' payloads (read the way stage_assignments reads them) that no assignment
--      carries as bb_column_id, it binds the column to the row when EXACTLY ONE row in the same
--      course matches all of: bb_column_id is null; source_ref like 'announcement %'; confidence
--      <> 'confirmed'; and one of
--        (a) the lowercased, whitespace-collapsed title, with any trailing (...) removed, equals the
--            same of the column's name; or
--        (b) the column name parses as <words> <n> ("Quiz 5", "Lab #2", "Problem Set 3"; the pattern is
--            ^(.+?)\s*#?\s*(\d+)$), the row's sequence_no = n and the row's series tail (after the last
--            '/') equals the words as a lowercase hyphen slug, both singularised (ies to y, zzes to z,
--            sses to ss, xes/ches/shes drop es, zes to z, then a trailing s; so 'quizzes' meets "Quiz"
--            and 'problem-sets' meets "Problem Set").
--      It sets bb_column_id and nothing else, and returns counts.
--   2. run_transform is replaced: 135's body (the latest), unchanged except one step,
--      bind_announcement_rows, run just before stage_assignments and recorded in sync_stage_runs
--      as the stage 'bind', like the stages beside it. The step has its own exception block, so a
--      failure in it is recorded as that stage's failure and the fold goes on.
--   3. a guard block
--
-- NOTE (W-110): a binding must be one to one. A column is bound only when exactly one row matches
-- it AND that row matches no other unbound column of the same run; otherwise two columns ("Quiz 5"
-- and "Quiz 5 makeup") could both claim one row in column-id order. The contract says "exactly one
-- row" for the column; the second half is the same rule from the row's side.
--
-- Additive in effect: one function added, one body replaced; no drop, no grant widened.

do $$
begin
  if to_regprocedure('public.run_transform(uuid, text)') is null
     or position('material_history_record' in (select prosrc from pg_proc
                   where oid = to_regprocedure('public.run_transform(uuid, text)'))) = 0 then
    raise exception '212: run_transform is not 135''s body; apply 135 first (prod order must equal name order)';
  end if;
end $$;

-- =============================================================================================
-- 0. Name helpers (the owner's alone)
-- =============================================================================================
create or replace function public.announcement_slug(p_text text)
  returns text
  immutable
  language sql set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

comment on function public.announcement_slug(text) is
  'Helper (212): lowercase, every run of other characters becomes one hyphen, hyphens trimmed.';

create or replace function public.announcement_singular(p_text text)
  returns text
  immutable
  language sql set search_path = public, pg_temp as $$
  select case
    when p_text ~ 'zzes$'          then regexp_replace(p_text, 'zzes$', 'z')
    when p_text ~ 'ies$'           then regexp_replace(p_text, 'ies$', 'y')
    when p_text ~ 'sses$'          then regexp_replace(p_text, 'sses$', 'ss')
    when p_text ~ '(x|ch|sh)es$'   then regexp_replace(p_text, 'es$', '')
    when p_text ~ 'zes$'           then regexp_replace(p_text, 'zes$', 'z')
    when p_text ~ '[^s]s$'         then regexp_replace(p_text, 's$', '')
    else p_text
  end;
$$;

comment on function public.announcement_singular(text) is
  'Helper (212): the singular of a series tail or a column word: zzes to z, ies to y, sses to ss, '
  'xes/ches/shes lose es, zes to z, then one trailing s (not ss) is dropped.';

-- =============================================================================================
-- 1. bind_announcement_rows
-- =============================================================================================
create or replace function public.bind_announcement_rows(p_run_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_seen int := 0; v_skipped int := 0; v_carried int := 0; v_candidates int := 0; v_bound int := 0;
begin
  drop table if exists pg_temp._bb_bind_cols;
  drop table if exists pg_temp._bb_bind_pairs;

  -- The columns of this run, read as stage_assignments reads them (126).
  create temp table _bb_bind_cols on commit drop as
    select distinct on (cr.id, g->>'columnId')
           cr.id                                   as course_id,
           g->>'columnId'                          as column_id,
           btrim(g->>'name')                       as name,
           coalesce((g->>'isCalc')::boolean, false) as is_calc
      from bb_raw b
      join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
           lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
     where b.run_id = p_run_id and b.kind = 'course'
       and coalesce(g->>'columnId', '') <> ''
     order by cr.id, g->>'columnId', b.captured_at desc;

  select count(*) into v_seen from _bb_bind_cols;

  -- Blackboard's own computed columns are not deliverables (126's rule).
  delete from _bb_bind_cols c
   where coalesce(c.name, '') = ''
      or c.is_calc
      or c.name ~* '^(total|total score|overall|weighted total|running total|final letter grade|final grade|letter grade)$';
  v_skipped := v_seen - (select count(*) from _bb_bind_cols);

  -- A column some assignment already carries is matched by id; nothing to bind.
  delete from _bb_bind_cols c
   where exists (select 1 from assignments a
                  where a.course_id = c.course_id and a.bb_column_id = c.column_id);
  v_carried := v_seen - v_skipped - (select count(*) from _bb_bind_cols);

  -- Every (column, row) pair that matches.
  create temp table _bb_bind_pairs on commit drop as
    select distinct c.course_id, c.column_id, a.id as assignment_id
      from _bb_bind_cols c
      join assignments a on a.course_id = c.course_id
      cross join lateral (
        select regexp_match(c.name, '^\s*(.+?)\s*#?\s*([0-9]{1,4})\s*$') as m) p
     where a.bb_column_id is null
       and a.source_ref like 'announcement %'
       and a.confidence <> 'confirmed'
       and (
         btrim(regexp_replace(lower(regexp_replace(a.title, '\s*\([^()]*\)\s*$', '')), '\s+', ' ', 'g'))
           = btrim(regexp_replace(lower(regexp_replace(c.name, '\s*\([^()]*\)\s*$', '')), '\s+', ' ', 'g'))
         or (p.m is not null
             and a.sequence_no = p.m[2]::int
             and a.series_key is not null
             and announcement_singular(announcement_slug(split_part(a.series_key, '/', -1)))
                 = announcement_singular(announcement_slug(p.m[1])))
       );

  select count(distinct (course_id, column_id)) into v_candidates from _bb_bind_pairs;

  -- Bind only a one-to-one match.
  update assignments a
     set bb_column_id = p.column_id
    from _bb_bind_pairs p
   where a.id = p.assignment_id and a.bb_column_id is null
     and (select count(*) from _bb_bind_pairs q
           where q.course_id = p.course_id and q.column_id = p.column_id) = 1
     and (select count(*) from _bb_bind_pairs q
           where q.assignment_id = p.assignment_id) = 1;
  get diagnostics v_bound = row_count;

  drop table if exists pg_temp._bb_bind_cols;
  drop table if exists pg_temp._bb_bind_pairs;

  return jsonb_build_object(
    'columns_seen',   v_seen,
    'columns_skipped', v_skipped,
    'already_carried', v_carried,
    'with_candidates', v_candidates,
    'bound',           v_bound,
    'left_ambiguous',  v_candidates - v_bound);
end $$;

comment on function public.bind_announcement_rows(uuid) is
  'Before stage_assignments (212): binds a gradebook column of this run to the announcement-sourced '
  'row it is, by setting that row''s bb_column_id and nothing else. A column no assignment carries is '
  'bound when exactly one unconfirmed row of its course with source_ref like ''announcement %'' and no '
  'column matches it by title (trailing (...) removed, case and spacing folded) or by "<word> <n>" '
  '(sequence_no = n, series_key ending in the word''s stem), and that row matches no other column of '
  'the run. Two or more candidates bind nothing, so stage_assignments'' stack_must_confirm still '
  'fires. Returns counts {columns_seen, columns_skipped, already_carried, with_candidates, bound, '
  'left_ambiguous}. Called by run_transform; nobody else.';

revoke all on function public.announcement_slug(text), public.announcement_singular(text)
  from public, anon, authenticated, service_role;
revoke all on function public.bind_announcement_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bind_announcement_rows(uuid) to db_test_runner;

-- =============================================================================================
-- 2. run_transform: 135's body plus one step
-- =============================================================================================
create or replace function run_transform(p_run_id uuid, p_trigger text default 'manual')
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_prev record;
  v_stages  jsonb := '{}'::jsonb;   -- {stage: counts}
  v_errors  jsonb := '[]'::jsonb;
  v_r       jsonb;
  v_cc      jsonb;
  v_hist    jsonb;
  v_started timestamptz;
  v_before  bigint;
  v_after   bigint;
  v_failed  int := 0;
  v_status  text;
  v_trigger text := case when p_trigger in ('manual','scheduled','app_request')
                         then p_trigger else 'manual' end;
begin
  -- Idempotent. A run that already has a FINISHED real sync_runs row is never folded twice: that
  -- row is returned as-is. A row still marked running is the one the claim opened (migration 135's
  -- trigger), and it is adopted below. The row is locked, so a second caller waits here and then
  -- reads the row the first one finished. A quarantine row is not a fold, so it is skipped here.
  select id, status into v_prev
    from sync_runs
   where run_id = p_run_id and scope is distinct from 'unregistered'
   order by id desc limit 1
     for update;
  if found and v_prev.status <> 'running' then
    return v_prev.id;
  end if;

  -- The guard. bb_raw accepts anon inserts, so "this run exists in bb_raw" proves nothing.
  if not exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.run_id = p_run_id) then
    raise exception
      'run % is not registered by an owner-authenticated sync request; refusing to fold it', p_run_id
      using hint = 'Insert or update an agent_requests row (kind = sync) with this run_id from an authenticated session first.';
  end if;

  if v_prev.id is not null then
    -- Adopt the row opened at claim. started_at stays the claim's; the trigger is this fold's.
    v_id := v_prev.id;
    update sync_runs set trigger = v_trigger where id = v_id;
  else
    insert into sync_runs (run_id, status, started_at, trigger, source, scope)
    values (p_run_id, 'running', now(), v_trigger, 'blackboard', 'all')
    returning id into v_id;
  end if;

  begin
    select count(*) into v_before from attention_items;

    v_r := stage_courses(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('courses', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- stage_content belongs to Phase 8. Call it if it is installed; record an honest skipped
    -- row if it is not, rather than failing a whole sync over a function someone else owns.
    v_started := clock_timestamp();
    if to_regprocedure('public.stage_content(uuid)') is null then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'content', 'skipped', '{}'::jsonb, v_started, clock_timestamp(),
              'stage_content not installed');
      v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
      v_errors := v_errors || to_jsonb('stage_content not installed'::text);
    else
      begin
        execute 'select public.stage_content($1)' into v_cc using p_run_id;
        v_cc := coalesce(v_cc, '{}'::jsonb);
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'ok', v_cc, v_started, clock_timestamp(), null);
        v_stages := v_stages || jsonb_build_object('content', v_cc);
      exception when others then
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
                left(sqlstate || ' ' || sqlerrm, 1000));
        v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
        v_errors := v_errors || to_jsonb(left('stage_content: ' || sqlerrm, 1000));
      end;
    end if;

    -- Phase 26 (212). A gradebook column that is really an announcement-sourced row is bound to it
    -- BEFORE stage_assignments, which then matches the column by id and adds no second row. The
    -- step records itself as the stage 'bind' and fails alone, like 'content' and 'history'.
    v_started := clock_timestamp();
    begin
      v_cc := coalesce(bind_announcement_rows(p_run_id), '{}'::jsonb);
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'bind', 'ok', v_cc, v_started, clock_timestamp(), null);
      v_stages := v_stages || jsonb_build_object('bind', v_cc);
    exception when others then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'bind', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
              left(sqlstate || ' ' || sqlerrm, 1000));
      v_stages := v_stages || jsonb_build_object('bind', '{}'::jsonb);
      v_errors := v_errors || to_jsonb(left('bind_announcement_rows: ' || sqlerrm, 1000));
    end;

    v_r := stage_assignments(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('assignments', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 10a. Gradebook AFTER assignments, because stage_assignments is what creates and
    -- re-points assignments.bb_column_id, and attempts AFTER gradebook, because the file
    -- catalogue reads that link to decide which assignment a submission file belongs to.
    v_r := stage_gradebook(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gradebook', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_attempts(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('attempts', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_announcements(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('announcements', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_files(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('files', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 19. The per-crawl material history, AFTER stage_files: a file's history row carries
    -- the bb_files id that stage has just catalogued. material_history_record (132) writes no
    -- stage row of its own, so the row is written here, and the call sits in its own block so a
    -- failure in it is this stage's failure and nobody else's: the run reads partial.
    v_started := clock_timestamp();
    begin
      v_hist := coalesce(material_history_record(p_run_id), '{}'::jsonb);
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'ok', v_hist, v_started, clock_timestamp(), null);
      v_stages := v_stages || jsonb_build_object('history', v_hist);
    exception when others then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
              left(sqlstate || ' ' || sqlerrm, 1000));
      v_stages := v_stages || jsonb_build_object('history', '{}'::jsonb);
      v_errors := v_errors || to_jsonb(left('material_history_record: ' || sqlerrm, 1000));
    end;

    v_r := stage_gaps(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gaps', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    select count(*) into v_after from attention_items;

    select count(*) into v_failed from sync_stage_runs
     where sync_run_id = v_id and status = 'failed';
    v_status := case when v_failed > 0 then 'partial' else 'ok' end;

    update sync_runs
       set status      = v_status,
           finished_at = clock_timestamp(),
           summary     = jsonb_build_object(
                           'stages',           v_stages,
                           'changes',          sync_change_lines(v_stages),
                           'attention_raised', greatest(v_after - v_before, 0),
                           'errors',           v_errors)
     where id = v_id;

  exception when others then
    -- Belt and braces: the stages catch their own errors, so reaching here means something
    -- outside them broke. Record it on the run rather than leaving a row stuck at running.
    update sync_runs
       set status = 'failed', finished_at = clock_timestamp(),
           notes  = btrim(coalesce(notes || ' | ', '') || left('driver: ' || sqlerrm, 500))
     where id = v_id;
  end;

  return v_id;
end $$;

comment on function run_transform(uuid, text) is
  'Fold one crawl into the typed tables. Refuses any run_id that no agent_requests row of kind '
  'sync has registered, because bb_raw takes anon inserts. Adopts the running sync_runs row the '
  'claim opened (migration 135), or inserts one when there is none; calls the stages in order '
  '(courses, content, bind, assignments, gradebook, attempts, announcements, files, history, '
  'gaps), and writes summary = {stages, changes, attention_raised, errors}. The bind stage (212) '
  'binds a gradebook column to the announcement-sourced row it is, before assignments. Idempotent: '
  'a run whose real sync_runs row has finished returns that id and does nothing.';

-- Privileges, as 135 left them.
revoke all on function public.run_transform(uuid, text) from public, anon, authenticated;
grant execute on function public.run_transform(uuid, text) to service_role;
grant execute on function public.run_transform(uuid, text) to db_test_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.run_transform(uuid, text)'::regprocedure;
  if position('bind_announcement_rows(p_run_id)' in v_src) = 0
     or position('bind_announcement_rows(p_run_id)' in v_src) > position('stage_assignments(p_run_id, v_id)' in v_src) then
    raise exception 'FAIL 212: run_transform does not run bind_announcement_rows before stage_assignments';
  end if;
  if position('material_history_record' in v_src) = 0 or position('stage_gaps(p_run_id, v_id)' in v_src) = 0 then
    raise exception 'FAIL 212: run_transform lost a stage of 135''s body';
  end if;
  if has_function_privilege('anon', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.bind_announcement_rows(uuid)', 'execute')
     or has_function_privilege('anon', 'public.run_transform(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.run_transform(uuid, text)', 'execute') then
    raise exception 'FAIL 212: a function is executable beyond its owner and the test login';
  end if;
end $$;
