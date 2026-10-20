-- bb2dash :: 220_ist352_knowledge_checks.sql
-- Phase 27 block (220-229). Stack's ask, Inbox item 6336 (2026-10-14): "Add it and refactor the
-- logic so that knowledge checks are expected to be posted day of my ist352 lectures."
--
-- IST.352 posts a 0-point "Knowledge Check - MM/DD/YY" gradebook column at the start of class.
-- stage_assignments records every new gradebook column it cannot match as a `tentative` row and
-- raises a `stack_must_confirm` question. Stack has answered each of the eleven knowledge-check
-- questions the same way (items 293, 294, 397, 487, 539, 754, 1903, 3434, 3669, 6336, 7168):
-- confirmed, submission blackboard, grade component 33 "Attendance, Class Contribution"
-- (rule derived in docs/inbox-decisions/2026-09-22.md, item 487).
--
-- The rule (class_day_knowledge_check): a NEW IST.352 gradebook column whose title starts with
-- "Knowledge Check" and whose due date (New York day) is an IST.352 class day is inserted as
-- confirmed, submission blackboard, under the course's `attendance` component, with the rule and
-- the syllabus deck it rests on cited in source_ref, and no question is raised.
--   * A class day is a `sessions` row that day of any kind but `no_class` (10/14 was kind `other`,
--     "Review / knowledge check"), or a day on the weekly `meetings` pattern (Mon/Wed) that has no
--     session row: the schedule lists only some Wednesdays, yet checks came on 9/16, 9/23, 9/30
--     and 10/7, all Wednesdays without a session row.
--   * A `no_class` session that day (Labor Day, Fall Break, Thanksgiving) always wins.
--   * The column must be worth 0 points (every knowledge check so far is 0.00): a graded "Knowledge
--     Check Quiz" worth points is not filed under attendance silently.
--   * An unbound, unconfirmed row that an announcement added (Phase 26, source_ref 'announcement
--     ...') due that New York day may be the same check under another title, which neither 212's
--     binding nor the title fallback matched; the column then asks, so no silent duplicate.
--   * No date, a date outside the term, another title, another course, points, or no single
--     `attendance` component: the helper returns null and the column takes today's path
--     (tentative + question).
--
-- No table holds per-course gradebook-column rules, so the course, the title pattern and the
-- component code are named constants in the helper. Only the new-column branch changes: a column
-- that matches an existing row (by column id or by title) goes through the existing path, so an
-- existing row is never promoted or rewritten, and assignment_progress is never touched.
--
-- stage_assignments is re-created from its live body (126; prod's body matched 126 on 2026-10-20)
-- with these changes only:
--   * the new-column insert asks class_day_knowledge_check() first and, when it answers, writes
--     confidence confirmed, submission blackboard, component_id and the cited source_ref;
--   * such a row raises no question and is counted in a new `expected_confirmed`, not `inserted`
--     (sync_change_lines() reads `inserted` as "added as tentative assignments").
-- run_transform (212) calls stage_assignments by name and is not restated here; no later
-- migration in the repo restates stage_assignments.

create or replace function public.class_day_knowledge_check(p_course_id text, p_name text,
                                                            p_due_at timestamptz, p_possible numeric)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  -- Stack's ask names one course. These are the rule's only inputs that are not data.
  KC_COURSE         constant text := 'IST.352';
  KC_TITLE          constant text := '^\s*knowledge\s+check\M';   -- matched case-insensitively
  KC_COMPONENT_CODE constant text := 'attendance';               -- "Attendance, Class Contribution"
  CLASS_TZ          constant text := 'America/New_York';
  -- The syllabus deck's line for the check (bb_file 70 "Origins of Software.pptx", unit 2), read
  -- on prod on 2026-10-20; the confirmed rows already cite it.
  KC_SOURCE         constant text := 'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-10-20';
  v_day       date;
  v_n         int;
  v_component bigint;
begin
  if p_course_id is distinct from KC_COURSE
     or p_name is null or p_name !~* KC_TITLE
     or coalesce(p_possible, 0) <> 0
     or p_due_at is null or not bb_date_in_term(p_due_at) then
    return null;
  end if;

  v_day := (p_due_at at time zone CLASS_TZ)::date;

  -- An announcement row for that day may be this very check: let Stack say so (Phase 26).
  if exists (select 1 from assignments a
              where a.course_id = p_course_id
                and a.bb_column_id is null
                and a.source_ref like 'announcement %'
                and a.confidence <> 'confirmed'
                and coalesce((a.due_at at time zone CLASS_TZ)::date, a.due_date) = v_day) then
    return null;
  end if;

  if exists (select 1 from sessions s
              where s.course_id = p_course_id and s.session_date = v_day and s.kind = 'no_class') then
    return null;
  end if;

  if not exists (select 1 from sessions s
                  where s.course_id = p_course_id and s.session_date = v_day)
     and not exists (select 1 from meetings m
                      where m.course_id = p_course_id
                        and m.day_of_week = extract(dow from v_day)
                        and (m.starts_on is null or v_day >= m.starts_on)
                        and (m.ends_on   is null or v_day <= m.ends_on)) then
    return null;
  end if;

  select count(*), min(g.id) into v_n, v_component
    from grade_components g
   where g.course_id = p_course_id and g.code = KC_COMPONENT_CODE;
  if v_n <> 1 then
    return null;
  end if;

  return jsonb_build_object(
    'component_id', v_component,
    'cite', format('rule 220: an %s Knowledge Check on a class day (%s) feeds component %s (Stack, Inbox 6336) | %s',
                   KC_COURSE, to_char(v_day, 'YYYY-MM-DD'), v_component, KC_SOURCE));
end
$function$;

comment on function public.class_day_knowledge_check(text, text, timestamptz, numeric) is
  '220 (Inbox 6336): for a new gradebook column, returns {component_id, cite} when it is a 0-point IST.352 Knowledge Check dated on an IST.352 class day (a non-no_class session, or a weekly meeting day with no no_class session) with no unbound announcement row that day; null otherwise. Called by stage_assignments.';

revoke all on function public.class_day_knowledge_check(text, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.class_day_knowledge_check(text, text, timestamptz, numeric) to service_role;

create or replace function public.stage_assignments(p_run_id uuid, p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_cols int := 0; v_skipped int := 0; v_ambiguous int := 0; v_linked int := 0;
  v_inserted int := 0; v_repointed int := 0; v_filled int := 0; v_overwritten int := 0;
  v_conflicts int := 0; v_out_of_term int := 0; v_mirror int := 0; v_url_set int := 0;
  v_settled int := 0; v_raised int := 0; v_shared int := 0; v_url_composed int := 0;
  v_expected int := 0;                     -- 220: new columns the class-day rule confirmed
  v_res jsonb := '{}'::jsonb;              -- apply_resolutions()'s counts, merged into ours
  v_n int; v_aid text; v_old_col text; v_new_id text;
  v_rule jsonb;                            -- 220: class_day_knowledge_check()'s answer, or null
  c record; a assignments%rowtype;
begin
  begin
    -- ---------------------------------------------------------------------------------------
    -- 0. Apply the answers Stack has already given. The body of this lives in
    --    apply_resolutions() so that a queued agent_requests row of kind 'transform' can apply
    --    answers without a crawl to fold (finding F8); the counts are merged into ours
    --    unchanged, so sync_change_lines() still reads them from the assignments stage.
    -- ---------------------------------------------------------------------------------------
    v_res := apply_resolutions();

    drop table if exists pg_temp._bb_cols;
    create temp table _bb_cols on commit drop as
      select cr.id                                  as course_id,
             g->>'columnId'                         as column_id,
             btrim(g->>'name')                      as name,
             nullif(g->>'possible','')::numeric     as possible,
             nullif(g->>'due','')::timestamptz      as due_at,
             nullif(g->>'contentId','')             as content_id,
             nullif(g->>'submissionStatus','')      as sub_status,
             coalesce((g->>'isCalc')::boolean, false) as is_calc,
             b.captured_at
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(g->>'columnId','') <> '';

    for c in select * from _bb_cols order by course_id, column_id loop
      v_cols := v_cols + 1;

      -- Blackboard's own computed columns are not deliverables. Inserting "Total Score" as an
      -- assignment would put a number nobody has to hand in on the tracker.
      if c.is_calc or c.name ~* '^(total|total score|overall|weighted total|running total|final letter grade|final grade|letter grade)$' then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      select count(*) into v_n from assignments
       where course_id = c.course_id and bb_column_id = c.column_id;

      if v_n > 1 then
        v_ambiguous := v_ambiguous + 1;
        v_shared := v_shared + 1;
        -- Phase 12b F-5 (084): this branch was reached BECAUSE every one of these rows already
        -- carries this column's id. That is a deliberate binding - Blackboard collects a whole
        -- packet of deliverables under one column - and since 075 the transform knows exactly
        -- what to do with it: restamp the liveness of every bound row and apply none of the
        -- column's values. Nothing is left for Stack to decide, so nothing is asked; the
        -- question below re-raised itself on every fold and was never answerable. The "which one
        -- does Blackboard mean?" question stays for the case it was written for - a column
        -- matched to several assignments by TITLE, none of which carries its id - and now lives
        -- in the fallback branch further down.
        -- Phase 12b X-3: shared column liveness restamp. Blackboard reported this column in this
        -- crawl, so every assignment bound to it was seen - whatever the values turn out to mean.
        -- Without this both rows keep a stale bb_last_seen, 065 calls them absent from Blackboard
        -- and the calendar push filters them out. The values stay untouched: which of the rows
        -- Blackboard's due date and points describe is still unknown, and 084 stopped asking
        -- because a deliberate shared column gives Stack nothing to answer.
        update assignments
           set bb_item_id   = coalesce(bb_item_id, c.content_id),
               bb_last_seen = greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at)
         where course_id = c.course_id and bb_column_id = c.column_id
           and (bb_item_id   is distinct from coalesce(bb_item_id, c.content_id)
             or bb_last_seen is distinct from greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at));
        get diagnostics v_n = row_count;
        v_mirror := v_mirror + v_n;

        continue;
      end if;

      v_aid := null; v_old_col := null;
      if v_n = 1 then
        select id into v_aid from assignments
         where course_id = c.course_id and bb_column_id = c.column_id;
      else
        -- No column match. Fall back to (course_id, title): an unbound row first, then a row
        -- whose stored column id is no longer in this run - that is a re-created Blackboard item.
        -- Phase 12b F-5 (084): if the title fits MORE THAN ONE such row, and none of them
        -- carries this column's id, the transform genuinely cannot tell which assignment
        -- Blackboard means. Binding one of them by `limit 1` would be a guess with a 1-in-N
        -- chance of being right, so ask instead - and, as in the shared-column branch, apply
        -- none of the column's values and bind nothing.
        select count(*) into v_n
          from assignments a2
         where a2.course_id = c.course_id
           and lower(a2.title) = lower(c.name)
           and (a2.bb_column_id is null
                or not exists (select 1 from _bb_cols k
                                where k.course_id = a2.course_id and k.column_id = a2.bb_column_id));

        if v_n > 1 then
          v_ambiguous := v_ambiguous + 1;
          if attention_keep_stands(c.course_id, 'column:' || c.column_id, 'bb_column_id',
               to_jsonb(c.name)) then
            v_settled := v_settled + 1;
          elsif raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
               'column:' || c.column_id, 'bb_column_id',
               to_jsonb((select string_agg(a2.id, ', ' order by a2.id) from assignments a2
                          where a2.course_id = c.course_id
                            and lower(a2.title) = lower(c.name)
                            and (a2.bb_column_id is null
                                 or not exists (select 1 from _bb_cols k
                                                 where k.course_id = a2.course_id
                                                   and k.column_id = a2.bb_column_id)))),
               to_jsonb(c.name),
               format('%s: gradebook column "%s" is attached to more than one assignment, so the transform cannot tell which one Blackboard means. Which is it?',
                      c.course_id, c.name),
               jsonb_build_object('column_id', c.column_id, 'possible', c.possible, 'due', c.due_at))
          then v_raised := v_raised + 1; end if;
          continue;
        end if;

        select id, bb_column_id into v_aid, v_old_col
          from assignments a2
         where a2.course_id = c.course_id
           and lower(a2.title) = lower(c.name)
           and (a2.bb_column_id is null
                or not exists (select 1 from _bb_cols k
                                where k.course_id = a2.course_id and k.column_id = a2.bb_column_id))
         order by (a2.bb_column_id is not null), a2.id
         limit 1;

        if v_aid is not null then
          update assignments
             set bb_column_id = c.column_id,
                 source_ref   = case when v_old_col is null then source_ref
                                     else btrim(coalesce(source_ref || ' | ', '') ||
                                          'bb column re-created ' || v_old_col || ' -> ' || c.column_id) end
           where id = v_aid;
          if v_old_col is null then v_linked := v_linked + 1; else v_repointed := v_repointed + 1; end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- New column, nothing to match: record it as a tentative Blackboard fact and ask.
      -- Phase 18 (126): the insert carries the column's contentId as bb_item_id, so step 2b
      -- can link it to its own Ultra page on this fold instead of the next.
      -- Phase 27 (220, Inbox 6336): an IST.352 Knowledge Check dated on a class day is what
      -- Stack has confirmed every time, so it is recorded as confirmed, under its component,
      -- with the rule cited, and nothing is asked. Any other new column is unchanged.
      -- ------------------------------------------------------------------------------------
      if v_aid is null then
        v_new_id := c.course_id || '/' || nullif(bb_slug(c.name), '');
        if v_new_id is null or exists (select 1 from assignments where id = v_new_id) then
          v_new_id := c.course_id || '/' || coalesce(nullif(bb_slug(c.name), ''), 'column')
                      || '-' || regexp_replace(c.column_id, '\D', '', 'g');
        end if;

        v_rule := class_day_knowledge_check(c.course_id, c.name, c.due_at, c.possible);

        insert into assignments (id, course_id, component_id, title, type, due_at, points_possible,
                                 bb_column_id, bb_item_id, bb_submission_status, bb_last_seen,
                                 submission, source, source_ref, confidence)
        values (v_new_id, c.course_id, (v_rule->>'component_id')::bigint,
                c.name, bb_assignment_type(c.name),
                case when bb_date_in_term(c.due_at) then c.due_at end,
                c.possible, c.column_id, c.content_id, c.sub_status, c.captured_at,
                -- 'unknown' is the column's default, written out so both cases read alike.
                case when v_rule is null then 'unknown' else 'blackboard' end::submission_channel,
                'blackboard',
                'Phase 9 transform, gradebook column ' || c.column_id || ' (type inferred from the column name)'
                  || coalesce(' | ' || (v_rule->>'cite'), ''),
                case when v_rule is null then 'tentative' else 'confirmed' end::confidence_level)
        on conflict (id) do nothing;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        -- The rule requires an in-term date, so the out-of-term question below cannot apply.
        if v_rule is not null then
          v_expected := v_expected + 1;
          continue;
        end if;
        v_inserted := v_inserted + 1;

        if raise_attention(p_sync_run_id, 'stack_must_confirm', c.course_id, 'assignment',
             v_new_id, null, null, to_jsonb(c.name),
             format('%s: Blackboard has a gradebook column "%s" that bb2dash had no assignment for. It was added as a %s worth %s points; is that right, and does it belong on the tracker?',
                    c.course_id, c.name, bb_assignment_type(c.name),
                    coalesce(c.possible::text, 'an unrecorded number of')),
             jsonb_build_object('column_id', c.column_id, 'due', c.due_at,
                                'possible', c.possible, 'type_guess', bb_assignment_type(c.name),
                                'source', 'stage_assignments'))
        then v_raised := v_raised + 1; end if;

        if c.due_at is not null and not bb_date_in_term(c.due_at) then
          if attention_keep_stands(c.course_id, v_new_id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_out_of_term := v_out_of_term + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
                 v_new_id, 'due_at', null, to_jsonb(c.due_at),
                 format('%s: Blackboard gives "%s" a due date of %s, which is outside the term. It was left with no date rather than put on the tracker in the wrong year.',
                        c.course_id, c.name, to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
        continue;
      end if;

      select * into a from assignments where id = v_aid;

      -- ------------------------------------------------------------------------------------
      -- due_at
      -- ------------------------------------------------------------------------------------
      if c.due_at is not null then
        if not bb_date_in_term(c.due_at) then
          if a.due_at is distinct from c.due_at then
            if attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
              v_settled := v_settled + 1;
            else
              v_out_of_term := v_out_of_term + 1; v_conflicts := v_conflicts + 1;
              if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                   to_jsonb(coalesce(a.due_at::text, a.due_date::text)), to_jsonb(c.due_at),
                   format('%s: Blackboard says "%s" is due %s, which is outside the term - the shell still carries a column from a previous year. bb2dash kept %s. Which is right?',
                          c.course_id, a.title,
                          to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD'),
                          coalesce(to_char(a.due_at at time zone 'America/New_York', 'YYYY-MM-DD'), to_char(a.due_date, 'YYYY-MM-DD'), 'no date')),
                   jsonb_build_object('column_id', c.column_id, 'out_of_term', true, 'source', 'stage_assignments'))
              then v_raised := v_raised + 1; end if;
            end if;
          end if;

        elsif a.due_at is null and a.due_date is null then
          update assignments set due_at = c.due_at where id = a.id;
          v_filled := v_filled + 1;

        elsif a.due_at is null then
          -- Only the day was known. Same day means Blackboard is adding the clock time, which
          -- contradicts nothing; a different day is a real disagreement.
          if (c.due_at at time zone 'America/New_York')::date = a.due_date then
            update assignments set due_at = c.due_at where id = a.id;
            v_filled := v_filled + 1;
          elsif a.confidence in ('tentative','inferred') then
            update assignments
               set due_at = c.due_at,
                   due_date = (c.due_at at time zone 'America/New_York')::date
             where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                 to_jsonb(a.due_date::text), to_jsonb(c.due_at),
                 format('%s: bb2dash has "%s" due %s; Blackboard says %s.',
                        c.course_id, a.title, a.due_date,
                        to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;

        elsif a.due_at is distinct from c.due_at then
          if a.confidence in ('tentative','inferred') then
            update assignments set due_at = c.due_at where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                 to_jsonb(a.due_at), to_jsonb(c.due_at),
                 format('%s: bb2dash has "%s" due %s; Blackboard says %s.',
                        c.course_id, a.title,
                        to_char(a.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI'),
                        to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- points_possible
      -- ------------------------------------------------------------------------------------
      if c.possible is not null then
        if a.points_possible is null then
          update assignments set points_possible = c.possible where id = a.id;
          v_filled := v_filled + 1;
        elsif a.points_possible <> c.possible then
          if a.confidence in ('tentative','inferred') then
            update assignments set points_possible = c.possible where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'points_possible',
                                      to_jsonb(c.possible)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id,
                 'points_possible', to_jsonb(a.points_possible), to_jsonb(c.possible),
                 format('%s: bb2dash has "%s" worth %s points; Blackboard says %s.',
                        c.course_id, a.title, a.points_possible, c.possible),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- Blackboard's own bookkeeping. No syllabus ever claimed these, so they simply mirror.
      -- ------------------------------------------------------------------------------------
      update assignments
         set bb_submission_status = coalesce(c.sub_status, bb_submission_status),
             bb_item_id           = coalesce(bb_item_id, c.content_id),
             bb_last_seen         = greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at)
       where id = a.id
         and (bb_submission_status is distinct from coalesce(c.sub_status, bb_submission_status)
           or bb_item_id           is distinct from coalesce(bb_item_id, c.content_id)
           or bb_last_seen         is distinct from greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at));
      get diagnostics v_n = row_count;
      v_mirror := v_mirror + v_n;
    end loop;

    -- ---------------------------------------------------------------------------------------
    -- 2. Content items only ever add a link we do not already have.
    -- ---------------------------------------------------------------------------------------
    update assignments asg
       set bb_url = ci.url
      from (select * from (
              select cr.id as course_id, ci->>'id' as item_id,
                     bb_abs_url(coalesce(ci->>'url',
                                         ci->'detail'->>'url',
                                         ci->'detail'->'file'->>'url')) as url
                from bb_raw b
                join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
                     lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
               where b.run_id = p_run_id and b.kind = 'course') q
             where q.url is not null) ci
     where asg.course_id = ci.course_id and asg.bb_item_id = ci.item_id and asg.bb_url is null;
    get diagnostics v_n = row_count;
    v_url_set := v_n;

    -- ---------------------------------------------------------------------------------------
    -- 2b. Phase 18 (126): a test item's own Ultra page, composed where bb_url is still null.
    --     Never over a value already there (a content item's url, or one Stack confirmed).
    -- ---------------------------------------------------------------------------------------
    update assignments asg
       set bb_url = assignment_bb_url(asg.course_id, asg.bb_item_id)
     where asg.bb_url is null
       and asg.bb_item_id is not null
       and assignment_bb_url(asg.course_id, asg.bb_item_id) is not null;
    get diagnostics v_n = row_count;
    v_url_composed := v_n;

    v_counts := jsonb_build_object(
      'columns_seen',        v_cols,
      'columns_skipped',     v_skipped,
      'ambiguous_columns',   v_ambiguous,
      'shared_columns',      v_shared,
      'linked_by_title',     v_linked,
      'repointed',           v_repointed,
      'inserted',            v_inserted,
      'expected_confirmed',  v_expected,
      'fields_filled',       v_filled,
      'fields_overwritten',  v_overwritten,
      'conflicts',           v_conflicts,
      'conflicts_settled',   v_settled,
      'out_of_term_dates',   v_out_of_term,
      'mirror_updates',      v_mirror,
      'urls_set',            v_url_set,
      'urls_composed',       v_url_composed,
      'resolutions_applied_blackboard', coalesce((v_res->>'applied_blackboard')::int, 0),
      'resolutions_applied_keep',       coalesce((v_res->>'applied_keep')::int, 0),
      'resolutions_applied_value',      coalesce((v_res->>'applied_value')::int, 0),
      'resolutions_unapplicable',       coalesce((v_res->>'unapplicable')::int, 0),
      'resolutions_unapplied',          coalesce((v_res->>'unapplied')::int, 0),
      'attention_raised',    v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'assignments', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','assignments','status',v_status,'counts',v_counts,'error',v_error);
end
$function$;

-- Guard: the live stage_assignments asks the rule, and the rule answers for the dates Stack has
-- already confirmed (10/14, a session of kind `other`; 10/7, a Wednesday with no session row) and
-- stays silent on Fall Break (10/12, `no_class`) and on another course.
do $$
declare
  def text := pg_get_functiondef('public.stage_assignments(uuid,bigint)'::regprocedure);
begin
  if position('class_day_knowledge_check(c.course_id, c.name, c.due_at, c.possible)' in def) = 0
     or position('''expected_confirmed''' in def) = 0 then
    raise exception '220: stage_assignments does not call the class-day rule';
  end if;
  -- The data checks run only on a database that holds IST.352's attendance component and its
  -- weekly meetings; a fresh or partial replay checks the function's text alone.
  if exists (select 1 from grade_components where course_id = 'IST.352' and code = 'attendance')
     and exists (select 1 from meetings where course_id = 'IST.352') then
    if class_day_knowledge_check('IST.352', 'Knowledge Check - 10/14/26', '2026-10-14 16:50+00', 0) is null
       or class_day_knowledge_check('IST.352', 'Knowledge Check - 10/7/26', '2026-10-07 16:50+00', 0) is null then
      raise exception '220: the rule does not answer for a knowledge check Stack already confirmed';
    end if;
    if class_day_knowledge_check('IST.352', 'Knowledge Check - 10/12/26', '2026-10-12 16:50+00', 0) is not null
       or class_day_knowledge_check('IST.323', 'Knowledge Check - 10/14/26', '2026-10-14 16:50+00', 0) is not null then
      raise exception '220: the rule answers on a no_class day or for another course';
    end if;
  end if;
end $$;
