-- bb2dash :: 221_assignment_due_override.sql
-- Fix (2026-10-26): Stack's own due date for an assignment.
--
-- ---------------------------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------------------------
-- ECN.304/quiz-5 was taken in class on Thu 10/22, but the professor only made its gradebook
-- column on 10/26, and Blackboard gave the column its default due date, "created + 1 day"
-- (2026-10-27 16:53). The row was `tentative`, so stage_assignments (220) overwrote due_at with
-- that date, and the quiz landed on 10/27 beside Quiz 6. Editing assignments.due_at by hand does
-- not hold: the next sync writes it back, or raises an Inbox conflict if the row is confirmed.
--
-- THE FIX: a due date Stack sets himself, stored with his planner state. assignment_progress is
-- never written by a sync (the one status exception, 078, does not touch this column), so the
-- override survives every sync. Blackboard's date stays in assignments.due_at, untouched, and is
-- emitted beside the effective one so the UI can show both.
--
-- WHERE IT APPLIES: v_work_items (the planner, Today, workload, the undated tray, the course
-- stream's "due" arm and the Workspace feed all read it) and v_calendar_push_items (the Google
-- mirror). Grade views, v_upcoming / v_overdue and the Inbox checks keep reading Blackboard's
-- facts on purpose.
--
-- SHAPE: v_work_items keeps its 24 columns in order with the same types; two are appended
-- (bb_due_at, due_overridden). v_calendar_push_items keeps its exact column list. Both stay
-- security_invoker with the same grants.

-- =============================================================================================
-- 1. The column
-- =============================================================================================
alter table assignment_progress add column due_override timestamptz;

comment on column assignment_progress.due_override is
  'Stack''s own due instant for this assignment (221). App-owned: no sync writes it. When set it '
  'replaces assignments.due_at / due_date in v_work_items and v_calendar_push_items; Blackboard''s '
  'date stays in assignments and is shown beside it. Null means "use Blackboard''s date".';

-- =============================================================================================
-- 2. v_work_items: the effective due date
-- =============================================================================================
create or replace view v_work_items
  with (security_invoker = true) as
select 'assignment'::text                          as item_kind,
       a.id::text                                  as item_id,
       a.course_id,
       a.title,
       a.type::text                                as type,
       e.category,
       e.glyph,
       (e.in_workload and not a.hidden_from_workload) as in_workload,
       coalesce(p.due_override, a.due_at)          as due_at,
       coalesce((coalesce(p.due_override, a.due_at) at time zone 'America/New_York')::date,
                a.due_date)                        as due_on,
       a.due_rule,
       a.points_possible,
       a.submission::text                          as submission,
       a.series_key,
       a.sequence_no,
       coalesce(p.status, 'not_started')::text     as status,
       p.priority::text                            as priority,
       e.effort,
       e.effort_source,
       e.is_override,
       e.multiplier_applied,
       suggested_start(a.course_id,
                       coalesce((coalesce(p.due_override, a.due_at) at time zone 'America/New_York')::date,
                                a.due_date),
                       e.effort)                   as suggested_start,
       (coalesce((coalesce(p.due_override, a.due_at) at time zone 'America/New_York')::date,
                 a.due_date) is null)              as undated,
       a.confidence::text                          as confidence,
       a.due_at                                    as bb_due_at,
       (p.due_override is not null)                as due_overridden
from assignments a
join v_assignment_effort e        on e.id = a.id
left join assignment_progress p   on p.assignment_id = a.id
union all
select 'reading'::text,
       r.id::text,
       r.course_id,
       r.citation,
       'reading'::text,
       'reading'::text,
       'R'::text,
       (r.required is not false),
       null::timestamptz,
       r.for_date,
       null::text,
       null::numeric,
       null::text,
       null::text,
       null::smallint,
       coalesce(rp.status, 'not_started')::text,
       null::text,
       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0),
       'base'::text,
       false,
       false,
       suggested_start(r.course_id, r.for_date,
                       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0)),
       (r.for_date is null),
       r.confidence::text,
       null::timestamptz,
       false
from readings r
left join reading_progress rp on rp.reading_id = r.id;

comment on view v_work_items is
  'Union of assignments and readings for every planner surface: due_on, undated flag, coalesced '
  'planner status, effort with its source label, glyph/category, in_workload and the suggested '
  'start date. v_upcoming/v_overdue stay as-is for compatibility. in_workload (073): an assignment '
  'counts when its type counts (effort_base) AND Stack has not set hidden_from_workload; a reading '
  'counts when required is not false. Rows are never dropped - hidden work is still listed in '
  'Materials, the gradebook and the course pages. due_on (089): the NEW YORK date of due_at, not '
  'its UTC date. due_at / due_on (221): Stack''s assignment_progress.due_override when set, else '
  'Blackboard''s; bb_due_at is Blackboard''s instant and due_overridden says which one won.';

alter view v_work_items set (security_invoker = true);
revoke all on v_work_items from public, anon;
grant select on v_work_items to authenticated, service_role;

-- =============================================================================================
-- 3. v_calendar_push_items: the Google mirror follows the effective date
--    Same columns as 068. Only the assignment arm's due_at, event_at and filter change; they read
--    the effective instant from v_work_items (already joined as w).
-- =============================================================================================
create or replace view v_calendar_push_items as
with newest_crawl as (
  select s.run_id
    from sync_runs s
   where s.source = 'blackboard'
     and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered'
     and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1
)
select 'assignment'::text           as source,
       a.id                         as ref_id,
       calendar_event_id(a.id)      as event_id,
       a.id                         as assignment_id,
       a.course_id,
       c.subject || ' ' || c.number as course_code,
       a.title,
       a.type::text                 as type,
       w.due_at,
       a.due_date,
       case
         when w.due_at is not null then w.due_at
         when a.type in ('project','exam','final_exam') and m.start_time is not null
           then (a.due_date + m.start_time) at time zone 'America/New_York'
         else (a.due_date + time '23:59') at time zone 'America/New_York'
       end                          as event_at,
       a.points_possible,
       w.status,
       coalesce(a.bb_item_id is not null and a.bb_last_seen < crawl.captured_at,
                false)              as absent_from_blackboard,
       null::text                   as kind,
       null::text                   as kind_label,
       null::text                   as summary,
       null::timestamptz            as starts_at,
       null::timestamptz            as ends_at,
       null::text                   as time_zone,
       null::boolean                as all_day,
       null::date                   as start_date,
       null::date                   as end_date,
       null::date                   as week_start,
       null::text                   as location_kind,
       null::text                   as location,
       null::text                   as notes,
       null::boolean                as done
  from assignments a
  join courses c      on c.id = a.course_id
  join v_work_items w on w.item_kind = 'assignment' and w.item_id = a.id
  -- meetings.day_of_week is 0 = Sunday (066), which is extract(dow).
  left join lateral (
       select mm.start_time
         from meetings mm
        where mm.course_id = a.course_id
          and mm.day_of_week = extract(dow from a.due_date)::smallint
          and mm.start_time is not null
          and (mm.starts_on is null or a.due_date >= mm.starts_on)
          and (mm.ends_on   is null or a.due_date <= mm.ends_on)
        order by mm.start_time
        limit 1) m on true
  -- When this course was crawled in the newest folded run (065).
  left join lateral (
       select b.captured_at
         from bb_raw b, newest_crawl n
        where b.run_id = n.run_id
          and b.kind = 'course'
          and b.bb_course_id = c.bb_id
        limit 1) crawl on true
 where w.in_workload
   and not w.undated

union all

select 'planner'::text              as source,
       p.id::text                   as ref_id,
       'pe' || left(encode(sha256(convert_to(p.id::text, 'UTF8')), 'hex'), 32)
                                    as event_id,
       null::text                   as assignment_id,
       p.course_id,
       pc.subject || ' ' || pc.number
                                    as course_code,
       p.title,
       null::text                   as type,
       null::timestamptz            as due_at,
       null::date                   as due_date,
       p.starts_at                  as event_at,
       null::numeric(7,2)           as points_possible,
       null::text                   as status,
       false                        as absent_from_blackboard,
       p.kind::text                 as kind,
       k.label                      as kind_label,
       concat_ws(U&' \00B7 ', pc.subject || ' ' || pc.number, k.label, p.title)
                                    as summary,
       p.starts_at,
       p.ends_at,
       p.time_zone,
       p.all_day,
       case when p.all_day then (p.starts_at at time zone p.time_zone)::date end
                                    as start_date,
       case when p.all_day then (p.ends_at at time zone p.time_zone)::date end
                                    as end_date,
       date_trunc('week',
                  case when p.all_day then (p.starts_at at time zone p.time_zone)::date
                       else (p.starts_at at time zone 'America/New_York')::date end)::date
                                    as week_start,
       p.location_kind,
       p.location,
       p.notes,
       p.done
  from planner_events p
  left join courses pc on pc.id = p.course_id
  cross join lateral (
       select case p.kind
                when 'event'            then 'Event'
                when 'task'             then 'Task'
                when 'out_of_office'    then 'Out of office'
                when 'focus_time'       then 'Focus time'
                when 'working_location' then 'Working location'
                when 'appointment_slot' then 'Appointment slot'
              end as label) k;

alter view v_calendar_push_items set (security_invoker = true);
revoke all on v_calendar_push_items from anon;
grant select on v_calendar_push_items to authenticated, service_role;

-- =============================================================================================
-- 4. A changed override re-pushes the calendar
--    061's trigger watches only `assignments`. This one watches the override column. It is
--    SECURITY DEFINER because the web app writes assignment_progress as `authenticated`, which
--    holds no update on app_settings; the body is one fixed statement and takes no input.
-- =============================================================================================
create or replace function assignment_progress_mark_calendar_dirty() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update app_settings set gcal_dirty = true where id and not gcal_dirty;
  return null;
end $$;

comment on function assignment_progress_mark_calendar_dirty() is
  'Statement-level AFTER trigger on assignment_progress (221): sets app_settings.gcal_dirty when a '
  'due_override is inserted, changed or deleted, so the next calendar_push_tick re-pushes. '
  'SECURITY DEFINER because the writer is the app''s authenticated user.';

revoke all on function public.assignment_progress_mark_calendar_dirty() from public, anon, authenticated;

create trigger assignment_progress_mark_calendar_dirty
  after insert or delete or update of due_override on assignment_progress
  for each statement execute function assignment_progress_mark_calendar_dirty();

-- =============================================================================================
-- Guards
-- =============================================================================================
do $$
declare
  n_cols int;
  bad    text;
begin
  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'v_work_items';
  if n_cols <> 26 then
    raise exception '221: v_work_items has % columns, expected 26', n_cols;
  end if;

  if not exists (select 1 from pg_options_to_table(
                   (select reloptions from pg_class where oid = 'v_work_items'::regclass))
                  where option_name = 'security_invoker' and option_value = 'true')
     or not exists (select 1 from pg_options_to_table(
                   (select reloptions from pg_class where oid = 'v_calendar_push_items'::regclass))
                  where option_name = 'security_invoker' and option_value = 'true') then
    raise exception '221: a view lost security_invoker';
  end if;

  select string_agg(table_name || ': ' || grantee || ' ' || privilege_type, ', ') into bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('v_work_items', 'v_calendar_push_items')
     and grantee in ('anon', 'PUBLIC');
  if bad is not null then
    raise exception '221: readable by %', bad;
  end if;

  if pg_get_viewdef('v_work_items'::regclass, true) like '%a.due_at::date%' then
    raise exception '221: v_work_items casts due_at to a date without a zone';
  end if;
end $$;
