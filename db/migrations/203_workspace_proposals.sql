-- bb2dash :: db/migrations/203_workspace_proposals.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E, "Planner changes the
-- assistant proposes and Stack approves"; the frozen contract `119b_PHASE25B_contract.md`, "203". Worker
-- W-104a. Block 200-209 (200-201 W-101's, 202 W-103's, 207 W-102's, 203-206 this stream's).
--
-- WHY. Until now the Workspace assistant was read-only for the planner (DECISIONS B-5, D:195). Stack's
-- answers 6, 7 and 8 (2026-10-19): the assistant may PROPOSE a change to a planner row (status and
-- notes on both progress tables, the planned start and finish of an assignment); Stack approves or
-- rejects it on the answer or in the Inbox; one left alone expires after 7 days. The runner never
-- writes the planner: it writes a proposal (204), and Stack's own decision writes the row (206).
--
-- WHAT
--   1. workspace_proposals   one row per proposed change: the request and conversation that proposed
--                            it, the target table and row, the field, the value 204 read and the value
--                            proposed, the reason, the state and when it was decided.
--   2. row security          the owner reads and updates (as the other planner tables); there is no
--                            insert and no delete policy: rows come only from 204, which is SECURITY
--                            DEFINER, and are never deleted.
--   3. privileges, then a guard block over what this file states
--
-- THE STATES. `proposed` until decided; then `applied` (an approval that wrote the row), `rejected`,
-- `stale` (approved, but the row no longer held the value 204 read, so nothing was written) or
-- `expired` (left past expires_at). `approved` is in the check and unused in v1: 206 decides and writes
-- in one transaction, so nothing is ever approved and not yet written (119a, PM rulings 25b).
-- decided_at is set exactly when the state is not `proposed` (a check holds it).
--
-- THE VALUES. old_value is the value 204 read itself, never one it was handed: a status label or a date
-- (`YYYY-MM-DD`) or a note as a JSON string, and JSON null when there is no progress row or the field
-- is empty. new_value is always a JSON string of 1 to 2,000 characters (204 checks the field's own rule),
-- and stays what the assistant proposed: the record of what it asked. approved_value (W-106, Stack's
-- edit of a proposed value, amended in place before the cut-over) is the value an approval actually
-- wrote: new_value, or Stack's edit of it (206's p_value); null until then, and set exactly when the
-- state is `applied` (a check holds it), a JSON string of 1 to 2,000 characters like new_value.
--
-- No grant to workspace_runner, anon, inbox_apply_runner, sync_runner or workspace_ingest_runner: the
-- runner reaches this table only through 204, and still holds no table grant anywhere. authenticated may
-- select, and update only the three columns a decision writes (state, decided_at, approved_value); 206
-- is the one caller that does. db_test_runner gets the writes its units make (brief 95, "The role db_test_runner").
--
-- Additive: one table with its indexes and policies, and the trigger that keeps approved_value once
-- written (W-106 round 2). No earlier object changes. No password, key or DSN is in this file.

do $$
begin
  if to_regclass('public.workspace_requests') is null or to_regclass('public.workspace_conversations') is null then
    raise exception '203: workspace_requests or workspace_conversations does not exist; apply 140 first';
  end if;
  if to_regclass('public.assignment_progress') is null or to_regclass('public.reading_progress') is null then
    raise exception '203: assignment_progress or reading_progress does not exist';
  end if;
  if to_regprocedure('public.workspace_claim_v3(text, integer)') is null then
    raise exception '203: workspace_claim_v3 does not exist; apply 202 first';
  end if;
  if to_regclass('public.workspace_proposals') is not null then
    raise exception '203: workspace_proposals already exists';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_proposals
-- =============================================================================================
create table public.workspace_proposals (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  request_id      bigint not null references public.workspace_requests (id),
  conversation_id uuid   not null references public.workspace_conversations (id),
  target          text   not null
                  constraint workspace_proposals_target_known
                  check (target in ('assignment_progress', 'reading_progress')),
  row_id          text   not null
                  constraint workspace_proposals_row_id_shape
                  check (btrim(row_id) <> '' and char_length(row_id) <= 200),
  course_id       text,
  label           text   not null
                  constraint workspace_proposals_label_shape
                  check (btrim(label) <> ''),
  field           text   not null
                  constraint workspace_proposals_field_known
                  check (field in ('status', 'notes', 'planned_start', 'planned_finish')),
  old_value       jsonb,
  new_value       jsonb  not null
                  constraint workspace_proposals_new_value_shape
                  check (jsonb_typeof(new_value) = 'string'
                         and char_length(new_value #>> '{}') between 1 and 2000),
  reason          text   not null
                  constraint workspace_proposals_reason_shape
                  check (btrim(reason) <> '' and char_length(reason) <= 500),
  state           text   not null default 'proposed'
                  constraint workspace_proposals_state_known
                  check (state in ('proposed', 'approved', 'rejected', 'stale', 'applied', 'expired')),
  decided_at      timestamptz,
  approved_value  jsonb
                  constraint workspace_proposals_approved_value_shape
                  check (approved_value is null
                         or (jsonb_typeof(approved_value) = 'string'
                             and char_length(approved_value #>> '{}') between 1 and 2000)),
  -- The planned dates are an assignment's alone.
  constraint workspace_proposals_field_target
    check (target = 'assignment_progress' or field in ('status', 'notes')),
  constraint workspace_proposals_decided
    check ((state = 'proposed') = (decided_at is null)),
  -- What an approval wrote is there exactly when it wrote (W-106).
  constraint workspace_proposals_applied_value
    check ((state = 'applied') = (approved_value is not null)),
  constraint workspace_proposals_expires_after_created
    check (expires_at > created_at)
);

-- One proposal per field of a row per turn; the request's own index for its foreign key and 204's count.
create unique index workspace_proposals_one_per_field
  on public.workspace_proposals (request_id, target, row_id, field);
create index workspace_proposals_request_idx on public.workspace_proposals (request_id);
create index workspace_proposals_conversation_idx on public.workspace_proposals (conversation_id);
-- The open ones, for the hourly expiry sweep (205).
create index workspace_proposals_open_idx on public.workspace_proposals (expires_at)
  where state = 'proposed';

comment on table public.workspace_proposals is
  'A planner change the Workspace assistant proposed (migration 203, Phase 25b): one row per field of '
  'an assignment_progress or reading_progress row, inserted only by workspace_propose() (204) for the '
  'request that proposed it, decided only by workspace_proposal_decide() (206) or expired by '
  'workspace_proposals_expire() (205). The runner never writes the planner. Owner reads and updates '
  'under row security; nobody inserts or deletes directly.';
comment on column public.workspace_proposals.row_id is
  'assignment_progress.assignment_id, or reading_progress.reading_id as text.';
comment on column public.workspace_proposals.label is
  'The item''s title as the planner shows it, read by 204: assignments.title, or readings.citation.';
comment on column public.workspace_proposals.old_value is
  'The value 204 read itself when the proposal was made (a JSON string), JSON null when there was no '
  'progress row or the field was empty. 206 approves only while the row still holds it.';
comment on column public.workspace_proposals.new_value is
  'The value proposed: a progress_status label, a YYYY-MM-DD date, or the whole note (1 to 2,000 '
  'characters), as a JSON string. Kept as the assistant proposed it, also when Stack approved an edit.';
comment on column public.workspace_proposals.approved_value is
  'The value an approval wrote (206): new_value, or Stack''s edit of it (p_value), as a JSON string. '
  'Null until then; set exactly when state is applied.';
comment on column public.workspace_proposals.state is
  'proposed until decided; applied (approved and written), rejected, stale (approved, but the row had '
  'changed: nothing written) or expired (left past expires_at). approved is unused in v1.';

-- =============================================================================================
-- 2. Row security: the owner reads and updates; no insert or delete policy
-- =============================================================================================
alter table public.workspace_proposals enable row level security;

create policy workspace_proposals_owner_select on public.workspace_proposals
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

create policy workspace_proposals_owner_update on public.workspace_proposals
  for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

-- =============================================================================================
-- 2b. approved_value is written once (W-106 round 2)
-- =============================================================================================
-- authenticated may update approved_value (206 runs as Stack and writes it), so nothing but this
-- trigger stops a later PATCH from rewriting the record of what an approval wrote. Once it holds a
-- value it keeps it: any other value, null included, is refused with 55000. Every other update is left
-- alone: R2-6's owner PATCH of state, the expiry sweep (it touches only proposed rows, whose
-- approved_value is null) and 206's own single write.
create function public.workspace_proposals_approved_value_kept()
  returns trigger
  language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'workspace_proposals: the approved value of proposal % is written once', old.id
    using errcode = '55000';
end $$;

comment on function public.workspace_proposals_approved_value_kept() is
  'Trigger function (migration 203, W-106 round 2): refuses (55000) an update that changes '
  'workspace_proposals.approved_value once it holds a value. Fired only by its trigger''s WHEN.';

revoke all on function public.workspace_proposals_approved_value_kept() from public, anon, authenticated, service_role;

create trigger workspace_proposals_approved_value_kept
  before update on public.workspace_proposals
  for each row
  when (old.approved_value is not null and new.approved_value is distinct from old.approved_value)
  execute function public.workspace_proposals_approved_value_kept();

-- =============================================================================================
-- 3. Privileges and the guard
-- =============================================================================================
-- The project's default ACL hands a new table to anon, authenticated and service_role: take it back,
-- then give each role its list, as 202 did for the beats table.
revoke all on public.workspace_proposals from public, anon, authenticated, service_role;
grant select on public.workspace_proposals to authenticated, service_role;
grant update (state, decided_at, approved_value) on public.workspace_proposals to authenticated;
-- The units' setup rows (brief 95); it reads through 100's default privilege.
grant insert, update, delete on public.workspace_proposals to db_test_runner;

do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The columns, in order.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.workspace_proposals'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id bigint not null, created_at timestamp with time zone not null, '
     'expires_at timestamp with time zone not null, request_id bigint not null, '
     'conversation_id uuid not null, target text not null, row_id text not null, course_id text, '
     'label text not null, field text not null, old_value jsonb, new_value jsonb not null, '
     'reason text not null, state text not null, decided_at timestamp with time zone, approved_value jsonb' then
    raise exception 'FAIL 203: workspace_proposals columns are [%]', v_got;
  end if;

  -- (b) Row security on, the two owner policies and no other.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.workspace_proposals'::regclass) then
    raise exception 'FAIL 203: row security is off on workspace_proposals';
  end if;
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'workspace_proposals';
  if v_got is distinct from
     'workspace_proposals_owner_select:SELECT:authenticated, workspace_proposals_owner_update:UPDATE:authenticated' then
    raise exception 'FAIL 203: the policies on workspace_proposals are [%]', v_got;
  end if;

  -- (c) No client role but authenticated and service_role holds anything; authenticated writes two
  --     columns and nothing else (three since W-106: approved_value).
  select string_agg(w.who, ', ' order by w.who) into v_bad
    from (values ('anon'), ('workspace_runner'), ('inbox_apply_runner'), ('sync_runner'),
                 ('workspace_ingest_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.workspace_proposals',
                             'select, insert, update, delete, truncate, references, trigger')
      or has_any_column_privilege(w.who::name, 'public.workspace_proposals', 'select, insert, update, references');
  if v_bad is not null then
    raise exception 'FAIL 203: workspace_proposals is open to %', v_bad;
  end if;
  if not has_table_privilege('authenticated', 'public.workspace_proposals', 'select')
     or has_table_privilege('authenticated', 'public.workspace_proposals', 'insert, update, delete, truncate, references, trigger')
     or not has_column_privilege('authenticated', 'public.workspace_proposals', 'state', 'update')
     or not has_column_privilege('authenticated', 'public.workspace_proposals', 'decided_at', 'update')
     or not has_column_privilege('authenticated', 'public.workspace_proposals', 'approved_value', 'update')
     or has_column_privilege('authenticated', 'public.workspace_proposals', 'new_value', 'update')
     or has_column_privilege('authenticated', 'public.workspace_proposals', 'old_value', 'update')
     or has_any_column_privilege('authenticated', 'public.workspace_proposals', 'insert, references')
     or not has_table_privilege('service_role', 'public.workspace_proposals', 'select')
     or has_table_privilege('service_role', 'public.workspace_proposals', 'insert, update, delete, truncate') then
    raise exception 'FAIL 203: workspace_proposals grants are not select (authenticated, service_role) and update (state, decided_at, approved_value) for authenticated';
  end if;
end $$;

-- (d) The approved value is kept once written (W-106 round 2): the trigger, its WHEN, and a function
--     no client role can call.
do $$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.workspace_proposals'::regclass
                    and t.tgname = 'workspace_proposals_approved_value_kept' and not t.tgisinternal
                    and pg_get_triggerdef(t.oid) like '%BEFORE UPDATE%WHEN (((old.approved_value IS NOT NULL) AND (new.approved_value IS DISTINCT FROM old.approved_value)))%') then
    raise exception 'FAIL 203: workspace_proposals_approved_value_kept is not the BEFORE UPDATE trigger it should be';
  end if;
  if exists (select 1 from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('workspace_runner'),
                                   ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
              where has_function_privilege(w.who::name, 'public.workspace_proposals_approved_value_kept()', 'execute'))
     or not exists (select 1 from pg_proc p
                     where p.oid = 'public.workspace_proposals_approved_value_kept()'::regprocedure and not p.prosecdef
                       and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 203: workspace_proposals_approved_value_kept is callable by a client role, or not INVOKER with search_path pinned';
  end if;
end $$;
