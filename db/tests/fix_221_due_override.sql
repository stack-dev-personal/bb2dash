-- bb2dash :: db/tests/fix_221_due_override.sql
-- Tests migration 221 (Stack's own due date, assignment_progress.due_override):
--
--   0. installed and shaped: the column, v_work_items' two new columns, the trigger function is
--      SECURITY DEFINER and not executable by anon or authenticated
--   1. the override wins: due_at, due_on, undated and due_overridden in v_work_items, and event_at
--      in v_calendar_push_items
--   2. a sync-style write to assignments.due_at leaves the effective date alone, and bb_due_at
--      shows Blackboard's new value
--   3. setting the override marks the Google calendar dirty
--   4. clearing it brings Blackboard's date back
--
-- It works on a scratch assignment of its own so no real row's date is relied on.
-- RUN IT: `node scripts/db-test.mjs --only fix_221_due_override.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'assignment_progress'
                    and column_name = 'due_override' and data_type = 'timestamp with time zone') then
    raise exception 'FAIL fix_221: assignment_progress.due_override (timestamptz) is missing';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'v_work_items'
         and column_name in ('bb_due_at', 'due_overridden')) <> 2 then
    raise exception 'FAIL fix_221: v_work_items lacks bb_due_at or due_overridden';
  end if;
  if not (select prosecdef from pg_proc
           where oid = 'public.assignment_progress_mark_calendar_dirty()'::regprocedure) then
    raise exception 'FAIL fix_221: the dirty trigger function is not SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', 'public.assignment_progress_mark_calendar_dirty()', 'execute')
     or has_function_privilege('authenticated', 'public.assignment_progress_mark_calendar_dirty()', 'execute') then
    raise exception 'FAIL fix_221: the dirty trigger function is executable by anon or authenticated';
  end if;
end $$;

-- A scratch assignment in a real course, due at Blackboard's placeholder time.
insert into assignments (id, course_id, title, type, due_at, source, confidence)
select 'TEST/fix-221', c.id, 'fix 221 scratch', 'quiz',
       timestamptz '2026-10-27 16:53:23+00', 'blackboard', 'tentative'
  from courses c
 order by c.id
 limit 1;

-- =============================================================================================
-- 1. The override wins
-- =============================================================================================
update app_settings set gcal_dirty = false where id;

insert into assignment_progress (assignment_id, due_override)
values ('TEST/fix-221', timestamptz '2026-10-22 15:30 America/New_York');

do $$
declare
  w record;
  cal timestamptz;
begin
  select * into w from v_work_items where item_kind = 'assignment' and item_id = 'TEST/fix-221';
  if w.due_at <> timestamptz '2026-10-22 19:30+00' then
    raise exception 'FAIL fix_221: due_at is %, expected the override', w.due_at;
  end if;
  if w.due_on <> date '2026-10-22' or w.undated or not w.due_overridden then
    raise exception 'FAIL fix_221: due_on % undated % due_overridden %', w.due_on, w.undated, w.due_overridden;
  end if;
  if w.bb_due_at <> timestamptz '2026-10-27 16:53:23+00' then
    raise exception 'FAIL fix_221: bb_due_at is %, expected Blackboard''s', w.bb_due_at;
  end if;

  -- The calendar arm only lists rows in the workload; check it when this type is in it.
  if w.in_workload then
    select event_at into cal from v_calendar_push_items
     where source = 'assignment' and ref_id = 'TEST/fix-221';
    if cal is distinct from timestamptz '2026-10-22 19:30+00' then
      raise exception 'FAIL fix_221: calendar event_at is %, expected the override', cal;
    end if;
  end if;
end $$;

-- =============================================================================================
-- 3. The calendar is marked dirty
-- =============================================================================================
do $$
begin
  if not (select gcal_dirty from app_settings where id) then
    raise exception 'FAIL fix_221: setting due_override did not mark the calendar dirty';
  end if;
end $$;

-- =============================================================================================
-- 2. A sync rewriting Blackboard's date does not move Stack's
-- =============================================================================================
update assignments set due_at = timestamptz '2026-10-29 16:00+00' where id = 'TEST/fix-221';

do $$
declare
  w record;
begin
  select * into w from v_work_items where item_kind = 'assignment' and item_id = 'TEST/fix-221';
  if w.due_on <> date '2026-10-22' then
    raise exception 'FAIL fix_221: a sync write moved due_on to %', w.due_on;
  end if;
  if w.bb_due_at <> timestamptz '2026-10-29 16:00+00' then
    raise exception 'FAIL fix_221: bb_due_at did not follow Blackboard (%)', w.bb_due_at;
  end if;
end $$;

-- =============================================================================================
-- 4. Clearing it brings Blackboard's date back
-- =============================================================================================
update assignment_progress set due_override = null where assignment_id = 'TEST/fix-221';

do $$
declare
  w record;
begin
  select * into w from v_work_items where item_kind = 'assignment' and item_id = 'TEST/fix-221';
  if w.due_on <> date '2026-10-29' or w.due_overridden then
    raise exception 'FAIL fix_221: after a reset due_on is % and due_overridden %', w.due_on, w.due_overridden;
  end if;
end $$;

select 'fix_221_due_override: PASS' as result;

rollback;
