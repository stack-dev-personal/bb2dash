-- bb2dash :: db/migrations/213_activity_new_only.sql
-- Phase 26 (the announcement reader; brief 120, round 2). Block 210-219. Applies after 212.
--
-- WHY. The Activity tab repeats the same lines at every sync (prod sync_runs 1923 to 2051 all carry
-- "2 staff name disagreement(s) need your call", "Files: 0 pulled, 1 not pulled" and "Not pulled:
-- file 3713 (gone: status 404)"). A line on Activity says what CHANGED in this crawl, so a standing
-- condition must not be one. Two sources, two fixes:
--
--   1. the staff line. stage_courses counted every staff conflict it met, new or standing; it now
--      also counts the ones raise_attention reports as new (staff_conflicts_new), and
--      sync_change_lines reads that. A conflict Stack settled with "Keep mine", or one still open
--      from an earlier sync, is no longer a line. staff_conflicts keeps its meaning.
--   2. the file lines. bb_file_pull_failures remembers why a file could not be pulled, and
--      sync_file_pull_outcomes hands the sync runner back only the failures that are new (a first
--      failure, or a changed reason), clears a failure once the file is stored, and so lets the
--      runner say a failure once.
--
-- WHAT
--   1. stage_courses: 034's body (the latest; no later migration replaced it) with ONE change, the
--      counter staff_conflicts_new
--   2. sync_change_lines: 134's body (the latest) with ONE change, the staff line reads
--      staff_conflicts_new
--   3. table bb_file_pull_failures (RLS on, owner select, no anon)
--   4. sync_file_pull_outcomes(p_failed jsonb): SECURITY DEFINER, sync_runner (plus service_role and
--      the test login). Input [{id, reason}] (an array of at most 500; ids positive and in bb_files;
--      reason text of 1 to 500 characters; no id twice). It (a) deletes the failure rows of files
--      that are now stored (bb_files.storage_path is not null, which is what sync_file_stored sets),
--      (b) upserts each input row of a file not yet stored, keeping first_at, and (c) returns the
--      subset that had no failure row before or whose reason changed, as [{id, reason}].
--   5. a guard block: sync_runner's SECURITY DEFINER set is the seventeen
--
-- sync_runner's DEFINER set grows to SEVENTEEN: 210 added sync_request_announcement_review, this file
-- adds sync_file_pull_outcomes. The pinned lists in the phase14, phase18 and phase23 units are updated
-- in the same change.
--
-- Additive in effect: two function bodies replaced, one table and one function added, nothing dropped.

do $$
begin
  if to_regprocedure('public.sync_request_announcement_review(bigint)') is null then
    raise exception '213: sync_request_announcement_review does not exist; apply 210 first';
  end if;
  if position('v_staff_conflict' in (select prosrc from pg_proc
        where oid = 'public.stage_courses(uuid, bigint)'::regprocedure)) = 0 then
    raise exception '213: stage_courses is not 034''s body';
  end if;
end $$;

-- =============================================================================================
-- 1. stage_courses: 034's body, one change
-- =============================================================================================
create or replace function stage_courses(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_seen int := 0; v_courses_updated int := 0;
  v_staff_ins int := 0; v_staff_linked int := 0; v_staff_updated int := 0;
  v_staff_conflict int := 0; v_role_unknown int := 0;
  v_staff_conflict_new int := 0;   -- 213: only a conflict raise_attention reports as new
  v_sched int := 0; v_raised int := 0; v_n int; v_unresolved int := 0;
  r record; t record; v_role staff_role; v_title text; v_url text; v_existing text;
begin
  begin
    -- A shell in the crawl that matches no courses row would otherwise vanish from every stage.
    for r in
      select b.bb_course_id
        from bb_raw b
       where b.run_id = p_run_id and b.kind = 'course'
         and bb_resolve_course(b.bb_course_id) is null
    loop
      v_unresolved := v_unresolved + 1;
      if raise_attention(p_sync_run_id, 'stack_must_confirm', null, 'course',
           'shell:' || r.bb_course_id, null, null, to_jsonb(r.bb_course_id),
           format('The crawl returned Blackboard shell %s, which matches no course in bb2dash (neither bb_id nor bb_course_id). Which course is it, or should it be ignored?',
                  r.bb_course_id),
           jsonb_build_object('source', 'stage_courses', 'run_id', p_run_id))
      then v_raised := v_raised + 1; end if;
    end loop;

    for r in
      select b.bb_course_id, b.payload, b.captured_at,
             c.id as course_id, c.bb_course_id as bb_code
      from bb_raw b
      join courses c on c.id = bb_resolve_course(b.bb_course_id)
      where b.run_id = p_run_id and b.kind = 'course'
      order by c.id
    loop
      v_seen := v_seen + 1;

      -- Blackboard names a shell "<bb_course_id>.<title>"; the bare title is what title_bb holds.
      v_title := r.payload->'course'->>'name';
      if v_title is not null and v_title like r.bb_code || '.%' then
        v_title := substr(v_title, length(r.bb_code) + 2);
      end if;
      v_title := nullif(btrim(coalesce(v_title, '')), '');
      v_url   := 'https://blackboard.syracuse.edu/ultra/courses/' || r.bb_course_id || '/outline';

      update courses c
         set title_bb = coalesce(v_title, c.title_bb),
             bb_id    = r.bb_course_id,
             bb_url   = v_url
       where c.id = r.course_id
         and (c.title_bb is distinct from coalesce(v_title, c.title_bb)
           or c.bb_id   is distinct from r.bb_course_id
           or c.bb_url  is distinct from v_url);
      get diagnostics v_n = row_count;
      v_courses_updated := v_courses_updated + v_n;

      -- Teaching staff. Upsert on bb_user_id, link by name where the seed row has no id yet,
      -- and never invent a second instructor for one course.
      for t in
        select e->>'name' as name, e->>'email' as email, e->>'role' as role, e->>'userId' as user_id
        from jsonb_array_elements(bb_jarray(r.payload->'teachers')) e
      loop
        continue when t.user_id is null or coalesce(btrim(t.name), '') = '';

        v_role := bb_staff_role(t.role);
        if v_role is null then
          v_role_unknown := v_role_unknown + 1;
          if raise_attention(p_sync_run_id, 'stack_must_confirm', r.course_id, 'course_staff',
               'staff:' || t.user_id, 'role', null, to_jsonb(t.role),
               format('%s: Blackboard lists %s with role identifier "%s", which bb2dash does not recognise. What role is that?',
                      r.course_id, t.name, t.role),
               jsonb_build_object('name', t.name, 'email', t.email, 'bb_user_id', t.user_id))
          then v_raised := v_raised + 1; end if;
          continue;
        end if;

        if exists (select 1 from course_staff s
                    where s.course_id = r.course_id and s.bb_user_id = t.user_id) then
          update course_staff s set email = t.email
           where s.course_id = r.course_id and s.bb_user_id = t.user_id
             and s.email is null and t.email is not null;
          get diagnostics v_n = row_count;
          v_staff_updated := v_staff_updated + v_n;
          continue;
        end if;

        update course_staff s
           set bb_user_id = t.user_id,
               email      = coalesce(s.email, t.email)
         where s.course_id = r.course_id and s.bb_user_id is null
           and lower(s.name) = lower(t.name);
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_staff_linked := v_staff_linked + v_n;
          continue;
        end if;

        select string_agg(s.name, ', ' order by s.name) into v_existing
          from course_staff s
         where s.course_id = r.course_id and s.role = v_role and s.bb_user_id is null;

        if v_existing is not null then
          v_staff_conflict := v_staff_conflict + 1;
          if raise_attention(p_sync_run_id, 'conflict', r.course_id, 'course_staff',
               'staff:' || t.user_id, 'name', to_jsonb(v_existing), to_jsonb(t.name),
               format('%s already records %s as %s; Blackboard''s shell lists %s. Same person under another name, or an extra one?',
                      r.course_id, v_existing, v_role, t.name),
               jsonb_build_object('bb_user_id', t.user_id, 'email', t.email, 'role', v_role))
          then v_raised := v_raised + 1; v_staff_conflict_new := v_staff_conflict_new + 1; end if;
          continue;
        end if;

        insert into course_staff (course_id, name, role, email, bb_user_id, source)
        values (r.course_id, btrim(t.name), v_role, t.email, t.user_id, 'blackboard');
        v_staff_ins := v_staff_ins + 1;
      end loop;

      -- Meetings: deliberately not written. See the header.
      v_n := jsonb_array_length(bb_jarray(r.payload->'schedule'));
      v_sched := v_sched + v_n;
      if v_n > 0 then
        if raise_attention(p_sync_run_id, 'data_gap', r.course_id, 'course',
             'schedule', 'meetings', null, to_jsonb(v_n),
             format('%s: Blackboard''s schedule endpoint returned %s entries. bb2dash has never seen a non-empty schedule payload, so the transform does not write meetings from it yet - the shape has to be read from a real payload first.',
                    r.course_id, v_n),
             jsonb_build_object('source', 'stage_courses', 'run_id', p_run_id))
        then v_raised := v_raised + 1; end if;
      end if;
    end loop;

    v_counts := jsonb_build_object(
      'courses_seen',     v_seen,
      'courses_unresolved', v_unresolved,
      'courses_updated',  v_courses_updated,
      'staff_inserted',   v_staff_ins,
      'staff_linked',     v_staff_linked,
      'staff_updated',    v_staff_updated,
      'staff_conflicts',  v_staff_conflict,
      'staff_conflicts_new', v_staff_conflict_new,
      'staff_role_unknown', v_role_unknown,
      'schedule_entries', v_sched,
      'meetings_written', 0,
      'attention_raised', v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'courses', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','courses','status',v_status,'counts',v_counts,'error',v_error);
end $$;


comment on function stage_courses(uuid, bigint) is
  'Fold the crawl''s course shells into courses and course_staff (034). 213 adds the count '
  'staff_conflicts_new: the staff conflicts raise_attention reported as new, which is what the '
  'Activity line reads; staff_conflicts still counts every one met.';

-- =============================================================================================
-- 2. sync_change_lines: 134's body, one change
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.sync_change_lines(p_stages jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb := '[]'::jsonb;
  n int;
  v_hist   jsonb;
  v_sample jsonb;
  v_kind   text;
  v_names  text[];
  v_line   text;
begin
  n := coalesce((p_stages->'courses'->>'courses_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('Course details changed for %s course(s)', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new staff member(s) from Blackboard', n)); end if;
  -- 213: only a disagreement raised new in this crawl is a change; a standing one repeats every fold.
  n := coalesce((p_stages->'courses'->>'staff_conflicts_new')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s staff name disagreement(s) need your call', n)); end if;
  n := coalesce((p_stages->'courses'->>'courses_unresolved')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard shell(s) match no course here', n)); end if;

  -- 134: materials new, changed or gone in this crawl, named, from the history stage (132).
  -- Replaces 051's two content-tree sentences.
  v_hist := case when jsonb_typeof(p_stages->'history') = 'object'
                 then p_stages->'history' else '{}'::jsonb end;
  v_sample := case when jsonb_typeof(v_hist->'sample') = 'array'
                   then v_hist->'sample' else '[]'::jsonb end;
  foreach v_kind in array array['appeared', 'changed', 'vanished'] loop
    n := coalesce((v_hist->>v_kind)::int, 0);
    if n > 0 then
      select coalesce(array_agg(s.title order by s.ord), '{}'::text[]) into v_names
        from (select e->>'title' as title, x.ord
                from jsonb_array_elements(v_sample) with ordinality as x(e, ord)
               where jsonb_typeof(x.e) = 'object'
                 and x.e->>'change' = v_kind
                 and nullif(btrim(coalesce(x.e->>'title', '')), '') is not null
               order by x.ord
               limit 3) s;
      v_line := format(case v_kind
                         when 'appeared' then '%s new material(s)'
                         when 'changed'  then '%s material(s) changed'
                         else '%s material(s) no longer in Blackboard' end, n);
      if cardinality(v_names) > 0 then
        v_line := v_line || ': ' || array_to_string(v_names, ', ');
        if n > cardinality(v_names) then
          v_line := v_line || format(' (+%s more)', n - cardinality(v_names));
        end if;
      end if;
      v := v || to_jsonb(v_line);
    end if;
  end loop;

  n := coalesce((p_stages->'assignments'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new gradebook column(s) added as tentative assignments', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_filled')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s missing due date or point value filled in from Blackboard', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_overwritten')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s tentative value(s) replaced by Blackboard''s', n)); end if;
  n := coalesce((p_stages->'assignments'->>'repointed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) re-pointed at a re-created Blackboard item', n)); end if;
  n := coalesce((p_stages->'assignments'->>'conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s disagreement(s) with Blackboard left for you to settle', n)); end if;
  n := coalesce((p_stages->'assignments'->>'out_of_term_dates')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard due date(s) fall outside the term and were not applied', n)); end if;
  n := coalesce((p_stages->'assignments'->>'resolutions_applied_blackboard')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_keep')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_value')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s of your Inbox answers applied', n)); end if;

  -- Phase 10a. Blackboard's numbers, said in Stack's words. Nothing here is computed by bb2dash:
  -- scores_new and scores_changed count gradebook ITEM columns whose effectiveScore moved since
  -- the previous crawl, and files_catalogued counts submission files now in the catalog.
  n := coalesce((p_stages->'gradebook'->>'scores_new')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new grade(s) posted', n)); end if;
  n := coalesce((p_stages->'gradebook'->>'scores_changed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s score(s) changed', n)); end if;
  -- 115: the status write 087 makes when Blackboard posts a score (reported, not added).
  n := coalesce((p_stages->'gradebook'->>'auto_graded')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) marked graded because Blackboard posted a score', n)); end if;
  n := coalesce((p_stages->'attempts'->>'files_catalogued')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s submission file(s) catalogued', n)); end if;

  n := coalesce((p_stages->'announcements'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new announcement(s)', n)); end if;
  n := coalesce((p_stages->'announcements'->>'updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s announcement(s) changed', n)); end if;

  n := coalesce((p_stages->'files'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new file(s) catalogued', n)); end if;
  n := coalesce((p_stages->'files'->>'source_url_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) were re-uploaded in Blackboard; the stored copy may be stale', n)); end if;
  n := coalesce((p_stages->'files'->>'marked_missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are no longer in Blackboard', n)); end if;
  -- 115: files Blackboard lists again, and readings tied to their file. reading_links is an
  -- object ({linked, ...}); only its `linked` member is read, as jsonb.
  n := coalesce((p_stages->'files'->>'missing_cleared')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are back in Blackboard', n)); end if;
  n := coalesce((p_stages->'files'->'reading_links'->>'linked')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s reading(s) linked to their file', n)); end if;
  n := coalesce((p_stages->'files'->>'session_scoped_skipped')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) had no durable link and were skipped', n)); end if;

  n := coalesce((p_stages->'gaps'->>'attention_raised')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s gap(s) added to the Inbox', n)); end if;

  if jsonb_array_length(v) = 0 then
    v := v || to_jsonb('Nothing changed'::text);
  end if;
  return v;
end $function$;

comment on function public.sync_change_lines(jsonb) is
  'Activity sentences for one sync (051; three counts added in 115: gradebook.auto_graded, '
  'files.reading_links.linked, files.missing_cleared; 134: the content-tree sentences replaced '
  'by three from the history stage, "N new material(s): A, B, C (+k more)", "N material(s) '
  'changed: ..." and "N material(s) no longer in Blackboard: ..."; 213: the staff line reads '
  'courses.staff_conflicts_new, so a standing disagreement is not a line on every sync). '
  'Convention (P-72): a count that repeats the same value on every fold is steady '
  'state and is not a change line, so assignments.conflicts_settled and '
  'assignments.shared_columns get no sentence. When no sentence fires the result is '
  '["Nothing changed"].';

revoke all on function public.sync_change_lines(jsonb) from public, anon;
grant execute on function public.sync_change_lines(jsonb) to authenticated, service_role;
grant execute on function public.sync_change_lines(jsonb) to db_test_runner;

-- =============================================================================================
-- 3. bb_file_pull_failures
-- =============================================================================================
create table if not exists public.bb_file_pull_failures (
  file_id  bigint primary key references public.bb_files (id) on delete cascade,
  reason   text not null,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now()
);

comment on table public.bb_file_pull_failures is
  'Why a Blackboard file could not be pulled, remembered so the sync says it once (213). One row per '
  'file; reason is the runner''s text; first_at is when it first failed, last_at the latest failure. '
  'Written only by sync_file_pull_outcomes, which also clears a row once its file is stored.';

alter table public.bb_file_pull_failures enable row level security;
revoke all on public.bb_file_pull_failures from public, anon, authenticated, service_role;
grant select on public.bb_file_pull_failures to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'bb_file_pull_failures' and policyname = 'bb_file_pull_failures_owner_read') then
    create policy bb_file_pull_failures_owner_read on public.bb_file_pull_failures
      for select to authenticated
      using ((select auth.uid()) = (select public.app_owner()));
  end if;
end $$;

-- The suite writes it inside its rolled-back transactions.
grant insert, update, delete on public.bb_file_pull_failures to db_test_runner;

-- =============================================================================================
-- 4. sync_file_pull_outcomes
-- =============================================================================================
create or replace function public.sync_file_pull_outcomes(p_failed jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max constant integer := 500;
  e        jsonb;
  v_id     bigint;
  v_ids    bigint[] := '{}';
  v_reason text;
  v_out    jsonb;
begin
  if p_failed is null or jsonb_typeof(p_failed) <> 'array' then
    raise exception 'sync_file_pull_outcomes: the failures must be a jsonb array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_failed) > c_max then
    raise exception 'sync_file_pull_outcomes: at most % failures in one call', c_max using errcode = '22023';
  end if;
  for e in select x from jsonb_array_elements(p_failed) x loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'id') is distinct from 'number'
       or (e->>'id') !~ '^[0-9]{1,18}$' or (e->>'id')::bigint <= 0 then
      raise exception 'sync_file_pull_outcomes: each failure needs a positive whole id' using errcode = '22023';
    end if;
    v_id := (e->>'id')::bigint;
    if not exists (select 1 from bb_files f where f.id = v_id) then
      raise exception 'sync_file_pull_outcomes: file % does not exist', v_id using errcode = '22023';
    end if;
    if v_id = any (v_ids) then
      raise exception 'sync_file_pull_outcomes: file % is listed twice', v_id using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;
    if jsonb_typeof(e->'reason') is distinct from 'string' then
      raise exception 'sync_file_pull_outcomes: the reason for file % must be text', v_id using errcode = '22023';
    end if;
    v_reason := e->>'reason';
    if btrim(v_reason) = '' or length(v_reason) > 500 then
      raise exception 'sync_file_pull_outcomes: the reason for file % must be 1 to 500 characters', v_id
        using errcode = '22023';
    end if;
  end loop;

  -- (a) A file that is now stored has nothing left to report.
  delete from bb_file_pull_failures p
   using bb_files f
   where f.id = p.file_id and f.storage_path is not null;

  -- (c) what is new, read before (b) writes it: a first failure, or a changed reason. A file that
  -- is already stored is not a failure at all.
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'reason', n.reason) order by n.id), '[]'::jsonb)
    into v_out
    from (select (x->>'id')::bigint as id, x->>'reason' as reason
            from jsonb_array_elements(p_failed) x) n
    join bb_files f on f.id = n.id and f.storage_path is null
    left join bb_file_pull_failures p on p.file_id = n.id
   where p.file_id is null or p.reason <> n.reason;

  -- (b) remember them, keeping first_at.
  insert into bb_file_pull_failures (file_id, reason)
  select (x->>'id')::bigint, x->>'reason'
    from jsonb_array_elements(p_failed) x
    join bb_files f on f.id = (x->>'id')::bigint and f.storage_path is null
  on conflict (file_id) do update
     set reason = excluded.reason, last_at = clock_timestamp();

  return v_out;
end $$;

comment on function public.sync_file_pull_outcomes(jsonb) is
  'The sync runner''s say-it-once for file pull failures (213). Input [{id, reason}] (an array of at most '
  '500; ids positive and in bb_files; reason 1 to 500 characters; no id twice). Deletes the failure rows '
  'of files now stored (storage_path set), upserts each input row of a file not yet stored (first_at '
  'kept), and returns [{id, reason}] for those with no failure row before or a changed reason. '
  'sync_runner (plus service_role and the test login).';

revoke all on function public.sync_file_pull_outcomes(jsonb)
  from public, anon, authenticated, inbox_apply_runner;
grant execute on function public.sync_file_pull_outcomes(jsonb)
  to sync_runner, service_role, db_test_runner;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
begin
  if position('v_staff_conflict_new := v_staff_conflict_new + 1' in (select prosrc from pg_proc
        where oid = 'public.stage_courses(uuid, bigint)'::regprocedure)) = 0
     or position('staff_conflicts_new' in (select prosrc from pg_proc
        where oid = 'public.sync_change_lines(jsonb)'::regprocedure)) = 0
     or position('material_history_record' in (select prosrc from pg_proc
        where oid = 'public.run_transform(uuid, text)'::regprocedure)) = 0 then
    raise exception 'FAIL 213: a function is not the 213 body';
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
    raise exception 'FAIL 213: sync_runner does not execute exactly the seventeen SECURITY DEFINER functions';
  end if;
  if has_function_privilege('anon', 'public.sync_file_pull_outcomes(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_file_pull_outcomes(jsonb)', 'execute') then
    raise exception 'FAIL 213: sync_file_pull_outcomes is executable by anon or authenticated';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.bb_file_pull_failures'::regclass)
     or has_table_privilege('anon', 'public.bb_file_pull_failures', 'select')
     or has_table_privilege('authenticated', 'public.bb_file_pull_failures', 'insert') then
    raise exception 'FAIL 213: bb_file_pull_failures is open to anon, or writable by authenticated';
  end if;
end $$;
