-- bb2dash :: 223_announcement_dates_ask.sql
-- Phase 26 follow-up (2026-10-26): a day the announcement gave is never replaced without asking.
--
-- ---------------------------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------------------------
-- ECN.304/quiz-5 came from the announcement "Quiz 5 This Thursday (10/22)" and held its day only as
-- event_start (in class). When the professor made its gradebook column on 10/26, 212 bound the column
-- to the row, as it should. Blackboard gave the new column its placeholder due date, "created + 1 day"
-- (2026-10-27 16:53). The row had no due_at and no due_date, so stage_assignments (220) filled due_at
-- with that date, and the quiz moved to 10/27 without a question. A tentative row whose due_date
-- differs is overwritten the same way: that is the path ECN.304/quiz-6 (due_date 10/27, from an
-- announcement) takes when its column appears. Phase 26's rule is "ask on changes" (brief 120).
--
-- ---------------------------------------------------------------------------------------------
-- THE RULE
-- ---------------------------------------------------------------------------------------------
-- For a matched row whose source_ref starts 'announcement ' (written by 211, or by hand from a post):
--   * the held day is the New York day of due_at, else due_date, else the New York day of event_start;
--   * while the row's values are still the post's - the first fold that sees its column
--     (bb_last_seen still null), or later while a due_at question about it is open or Stack's
--     "Keep mine" stands - a different Blackboard day is asked as a due_at conflict and the row is
--     left as it is (the branch a confirmed row already takes); points differing likewise;
--   * Blackboard's day equal to the held day, or no held day at all: filled, as under 220;
--   * after that, a value Blackboard filled moves with Blackboard, as under 220;
--   * an open question the reader (211) raised on the same field is left standing: raise_attention
--     keeps one open item per field and would otherwise overwrite it.
-- Every other row behaves exactly as under 220.
--
-- SHAPE: stage_assignments(uuid, bigint) is 220's body, copied by script, patched in the
-- declarations, after the row is read, in the fill, day-only, instant and points branches, and in
-- the values of the out-of-term and day-only conflicts (which now name an event_start-only day).
-- Signature, SECURITY DEFINER, search_path and grants unchanged; the function's comment restated.
-- Known and unchanged (as for a confirmed row since 042): "Accept Blackboard" on a day-only row
-- writes due_at only, so due_date keeps the old day; every reader takes due_at first.
-- Quiz 5's present 10/27 is not repaired here: Stack's own date (221) covers it.

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
  v_from_ann boolean;                      -- 223: the row came from an announcement
  v_ann_day date;                          -- 223: the day the row holds (announced), or null
  v_bb_day date;                           -- 223: Blackboard's due day, in New York
  v_ask_due boolean;                       -- 223: a different day is asked, not written
  v_ask_pts boolean;                       -- 223: different points are asked, not written
  v_reader_due boolean;                    -- 223: the reader's own due_at question is open
  v_reader_pts boolean;                    -- 223: the reader's own points question is open
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

      -- 223: a row made from an announcement (by the reader, 211, or by hand from a post) holds the
      -- day and points the post gave. A new column's due date can be Blackboard's placeholder
      -- ("created + 1 day"; ECN.304 Quiz 5, 2026-10-26), so a difference is asked, never written over,
      -- while the values are still the post's: on the first fold that sees the row's column
      -- (bb_last_seen still null), and after that only while Stack's question about it is open or
      -- his "Keep mine" stands. A value Blackboard filled itself moves with Blackboard, as under 220.
      -- An in-class row may carry its day only as event_start. The reader's own open question on the
      -- same field is left as it is: raise_attention would overwrite it (one open item per field).
      v_from_ann := coalesce(a.source_ref like 'announcement %', false);
      v_ann_day  := coalesce((a.due_at at time zone 'America/New_York')::date, a.due_date,
                             (a.event_start at time zone 'America/New_York')::date);
      v_bb_day   := (c.due_at at time zone 'America/New_York')::date;
      v_ask_due  := v_from_ann and c.due_at is not null and (
                      a.bb_last_seen is null
                      or exists (select 1 from attention_items ai
                                  where ai.kind = 'conflict' and ai.state = 'open' and ai.ref = a.id
                                    and coalesce(ai.course_id, '') = c.course_id and ai.field = 'due_at')
                      or attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)));
      v_ask_pts  := v_from_ann and c.possible is not null and (
                      a.bb_last_seen is null
                      or exists (select 1 from attention_items ai
                                  where ai.kind = 'conflict' and ai.state = 'open' and ai.ref = a.id
                                    and coalesce(ai.course_id, '') = c.course_id
                                    and ai.field = 'points_possible')
                      or attention_keep_stands(c.course_id, a.id, 'points_possible', to_jsonb(c.possible)));
      v_reader_due := v_from_ann and exists (
                      select 1 from attention_items ai
                       where ai.kind = 'conflict' and ai.state = 'open' and ai.ref = a.id
                         and coalesce(ai.course_id, '') = c.course_id and ai.field = 'due_at'
                         and ai.suggested->>'source' = 'announcement');
      v_reader_pts := v_from_ann and exists (
                      select 1 from attention_items ai
                       where ai.kind = 'conflict' and ai.state = 'open' and ai.ref = a.id
                         and coalesce(ai.course_id, '') = c.course_id and ai.field = 'points_possible'
                         and ai.suggested->>'source' = 'announcement');

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
                   to_jsonb(coalesce(a.due_at::text, a.due_date::text,
                                     case when v_from_ann then v_ann_day::text end)), to_jsonb(c.due_at),
                   format('%s: Blackboard says "%s" is due %s, which is outside the term - the shell still carries a column from a previous year. bb2dash kept %s. Which is right?',
                          c.course_id, a.title,
                          to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD'),
                          coalesce(to_char(a.due_at at time zone 'America/New_York', 'YYYY-MM-DD'), to_char(a.due_date, 'YYYY-MM-DD'),
                                   case when v_from_ann then to_char(v_ann_day, 'YYYY-MM-DD') end, 'no date')),
                   jsonb_build_object('column_id', c.column_id, 'out_of_term', true, 'source', 'stage_assignments'))
              then v_raised := v_raised + 1; end if;
            end if;
          end if;

        elsif a.due_at is null and a.due_date is null
              and (not v_ask_due or v_ann_day is null or v_bb_day = v_ann_day) then
          update assignments set due_at = c.due_at where id = a.id;
          v_filled := v_filled + 1;

        elsif a.due_at is null then
          -- Only the day was known. Same day means Blackboard is adding the clock time, which
          -- contradicts nothing; a different day is a real disagreement.
          if v_bb_day = a.due_date then
            update assignments set due_at = c.due_at where id = a.id;
            v_filled := v_filled + 1;
          elsif a.confidence in ('tentative','inferred') and not v_ask_due then
            update assignments
               set due_at = c.due_at,
                   due_date = v_bb_day
             where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          elsif v_reader_due then
            v_conflicts := v_conflicts + 1;     -- 223: the reader's open question stands
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                 to_jsonb(coalesce(a.due_date, v_ann_day)::text), to_jsonb(c.due_at),
                 format('%s: bb2dash has "%s" due %s; Blackboard says %s.',
                        c.course_id, a.title, coalesce(a.due_date, v_ann_day),
                        to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;

        elsif a.due_at is distinct from c.due_at then
          if a.confidence in ('tentative','inferred')
             and not (v_ask_due and v_bb_day is distinct from v_ann_day) then
            update assignments set due_at = c.due_at where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          elsif v_reader_due then
            v_conflicts := v_conflicts + 1;     -- 223: the reader's open question stands
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
          if a.confidence in ('tentative','inferred') and not v_ask_pts then
            update assignments set points_possible = c.possible where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'points_possible',
                                      to_jsonb(c.possible)) then
            v_settled := v_settled + 1;
          elsif v_reader_pts then
            v_conflicts := v_conflicts + 1;     -- 223: the reader's open question stands
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

comment on function public.stage_assignments(uuid, bigint) is
  'Folds one crawl''s gradebook columns and content links into assignments, and starts by calling '
  'apply_resolutions() so Stack''s answers land before Blackboard''s values are read. A disagreement '
  'with a confirmed row is raised as an attention_items conflict and the row is left alone - unless '
  'Stack already settled that exact disagreement with "Keep mine" and Blackboard has not changed its '
  'answer since (conflicts_settled). A tentative row takes Blackboard''s value, except a row made from '
  'an announcement (223): while its day and points are still the post''s (first fold that sees its '
  'column, or a question about it open or kept), a different value is asked instead, and the reader''s '
  'own open question on that field is left standing. A column several rows are bound to applies none '
  'of its values but restamps bb_last_seen on each (075, 084); a column whose name fits several unbound '
  'rows binds nothing and asks which one. assignment_progress is never touched.';

-- Guard: the live body carries both the announced-day rule and 220's class-day rule.
do $$
declare
  def text := pg_get_functiondef('public.stage_assignments(uuid,bigint)'::regprocedure);
begin
  if position('v_from_ann := coalesce(a.source_ref like ''announcement %'', false);' in def) = 0
     or position('and (not v_ask_due or v_ann_day is null or v_bb_day = v_ann_day) then' in def) = 0
     or position('and not (v_ask_due and v_bb_day is distinct from v_ann_day) then' in def) = 0
     or position('if a.confidence in (''tentative'',''inferred'') and not v_ask_pts then' in def) = 0 then
    raise exception '223: stage_assignments does not carry the announced-day rule';
  end if;
  if position('class_day_knowledge_check(c.course_id, c.name, c.due_at, c.possible)' in def) = 0
     or position('''expected_confirmed''' in def) = 0 then
    raise exception '223: stage_assignments lost 220''s class-day rule';
  end if;
end $$;
