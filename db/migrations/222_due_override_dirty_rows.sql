-- bb2dash :: 222_due_override_dirty_rows.sql
-- Follow-up to 221 (code review, 2026-10-26).
--
-- 221's calendar trigger was statement-level on every INSERT into assignment_progress. Every
-- planner save is an upsert (INSERT ... ON CONFLICT DO UPDATE), so a status tick, a note, an
-- Inbox apply or an approved proposal each marked the Google calendar dirty and cost a push run
-- that changed nothing. This replaces it with three row-level triggers that fire only when
-- due_override itself appears, changes or goes away.
--
-- On an upsert that hits a conflict, Postgres fires the UPDATE row triggers, not the AFTER INSERT
-- ones, so each case below is covered once.
--
-- The function stays SECURITY DEFINER, but 221's comment gave the wrong reason. Stack's login can
-- update app_settings under its owner policy (035/038), and 181 granted inbox_apply_runner the
-- gcal_dirty column for 061's trigger. DEFINER keeps any later writer of assignment_progress from
-- needing its own grant on app_settings just to flag a push. The body is one fixed statement. The
-- comments on the function and on v_calendar_push_items are corrected here.

drop trigger assignment_progress_mark_calendar_dirty on assignment_progress;

create trigger assignment_progress_due_override_inserted
  after insert on assignment_progress
  for each row when (new.due_override is not null)
  execute function assignment_progress_mark_calendar_dirty();

create trigger assignment_progress_due_override_changed
  after update of due_override on assignment_progress
  for each row when (old.due_override is distinct from new.due_override)
  execute function assignment_progress_mark_calendar_dirty();

create trigger assignment_progress_due_override_deleted
  after delete on assignment_progress
  for each row when (old.due_override is not null)
  execute function assignment_progress_mark_calendar_dirty();

comment on function assignment_progress_mark_calendar_dirty() is
  'AFTER row trigger on assignment_progress (221, row-level since 222): sets app_settings.gcal_dirty '
  'when a due_override appears, changes or is removed, so the next calendar_push_tick re-pushes. '
  'SECURITY DEFINER so a writer of assignment_progress needs no grant on app_settings of its own '
  'to flag a push. The body is one fixed statement and reads nothing from the row.';

comment on view v_calendar_push_items is
  'Everything that belongs on the Google "bb2dash" calendar, one row per item, keyed by (source, '
  'ref_id) with the deterministic Google event_id. source = assignment: every dated assignment in '
  'the workload. due_at and event_at come from v_work_items, so Stack''s '
  'assignment_progress.due_override wins over Blackboard''s date (221); absent_from_blackboard is '
  'computed as in 066. source = planner (068): every planner_events row with its summary, '
  'kind_label, instants, zone, all-day local dates (exclusive end), week_start for the bb2dash '
  'link, location, notes and done. assignment_id is kept for readers that only know assignments and '
  'is null on planner rows. security_invoker with anon revoked, as 036 requires.';

-- Guard: exactly the three row triggers call the function, and the statement trigger is gone.
do $$
begin
  if (select count(*) from pg_trigger
       where tgrelid = 'public.assignment_progress'::regclass
         and tgfoid = 'public.assignment_progress_mark_calendar_dirty()'::regprocedure
         and not tgisinternal) <> 3 then
    raise exception '222: expected three due_override triggers on assignment_progress';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.assignment_progress'::regclass
                and tgname = 'assignment_progress_mark_calendar_dirty') then
    raise exception '222: 221''s statement trigger is still there';
  end if;
end $$;
