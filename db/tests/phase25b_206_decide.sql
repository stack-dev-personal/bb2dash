-- bb2dash :: db/tests/phase25b_206_decide.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E. Worker W-104a. Tests
-- migration 206, `workspace_proposal_decide` (the contract `119b_PHASE25B_contract.md`, "206").
--
--   0. installed: SECURITY INVOKER with a pinned path, returns (state, applied), executable by
--      authenticated alone; 181's log trigger still fires for inbox_apply_runner alone
--   1. approve, no progress row: the row is inserted with the one field, once; (applied, true); the
--      proposal applied with decided_at; the Inbox item resolved with {outcome: applied, proposal_id};
--      a second approve and a reject are refused with 55000 "proposal <id> is already applied" and
--      change nothing
--   2. approve, a progress row: the planned start written and nothing else; updated_at moves (the
--      planner's own trigger, as every planner edit); a note on a reading inserted and written
--   3. stale: the row changed after the proposal (as the owner, the way the planner writes it), or the
--      assignment is gone: (stale, false), nothing written, the item resolved as stale
--   4. reject in one place reads rejected in both: the view's state and effective_state, its
--      attention_state, the Inbox item's resolution; a later approve is refused with 55000
--   5. expired: a proposal past expires_at returns (expired, false) whatever was asked and writes
--      nothing; the next decide is refused with 55000 "already expired"
--   6. none of it is logged as an apply run: inbox_apply_writes has no new row
--   7. refusals: a decision that is not approve or reject (22023); a proposal the caller cannot see
--      (a stranger, 22023); anon and the runner roles cannot call it (42501)
--
-- Proposals are filed through 204 as the runner; every decision is made as the owner under `set local
-- role authenticated`, the way the page calls it. All data is synthetic. Nothing is committed.
--
-- RED against prod until 202 to 206 are applied (25b's cut-over): section 0 stops at "migration 206 is
-- not applied". AN `execute_sql` DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase25b_206_decide.sql`.

begin;

create function pg_temp.w104_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  n integer;
  v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := 'ok:' || n;
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;

-- A decision as the owner: 'state|applied', or the SQLSTATE and message.
create function pg_temp.w104_decide(p_id bigint, p_decision text, p_sub text default null) returns text
  language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, (select public.app_owner()::text)), true);
  set local role authenticated;
  begin
    select d.state || '|' || d.applied into v from public.workspace_proposal_decide(p_id, p_decision) d;
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;

create function pg_temp.w104_req(p_title text) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'question ' || p_title, true) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at)
  values (v_conv, v_msg, 'claimed', 'w104-runner', now()) returning id into v_req;
  return v_req;
end $$;

create function pg_temp.w104_propose(p_req bigint, p_target text, p_row text, p_field text, p_value jsonb) returns bigint
  language plpgsql as $$
declare
  v bigint;
begin
  set local role workspace_runner;
  select r.proposal_id into v
    from public.workspace_propose(p_req, 'w104-runner', p_target, p_row, p_field, p_value, 'synthetic') r;
  reset role;
  return v;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  f      constant text := 'public.workspace_proposal_decide(bigint, text)';
  v_fail text[] := '{}';
  v_got  text;
begin
  if to_regprocedure(f) is null then
    raise exception 'FAIL phase25b_206: migration 206 is not applied (workspace_proposal_decide is missing)';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and not p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'not SECURITY INVOKER with search_path pinned'::text;
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from 'TABLE(state text, applied boolean)' then
    v_fail := v_fail || format('returns %s', pg_get_function_result(f::regprocedure));
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('service_role'), ('db_test_runner'), ('workspace_runner'),
                 ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_got is not null then v_fail := v_fail || format('executable beyond authenticated: %s', v_got); end if;
  if not has_function_privilege('authenticated', f, 'execute') then
    v_fail := v_fail || 'authenticated cannot execute it'::text;
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.assignment_progress'::regclass
                    and t.tgname = 'assignment_progress_inbox_apply_log'
                    and pg_get_triggerdef(t.oid) like '%WHEN ((CURRENT_USER = ''inbox_apply_runner''::name))%') then
    v_fail := v_fail || 'the 181 log trigger no longer fires for inbox_apply_runner alone'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_206 (0): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixtures
-- =============================================================================================
create temp table _w104 (k text primary key, v text) on commit drop;

do $$
declare
  v_req     bigint;
  v_reading bigint;
begin
  insert into assignments (id, course_id, title, type, due_at)
  values ('ECN.304/w104-d1', 'ECN.304', 'W104 Decide 1', 'homework', '2026-11-01 14:00+00'),
         ('ECN.304/w104-d2', 'ECN.304', 'W104 Decide 2', 'homework', '2026-11-02 14:00+00'),
         ('ECN.304/w104-d3', 'ECN.304', 'W104 Decide 3', 'homework', '2026-11-03 14:00+00'),
         ('ECN.304/w104-d4', 'ECN.304', 'W104 Decide 4', 'homework', '2026-11-04 14:00+00');
  -- d2 has a progress row last touched a day ago.
  insert into assignment_progress (assignment_id, status, notes, planned_start, updated_at)
  values ('ECN.304/w104-d2', 'in_progress', 'old note', date '2026-10-20', now() - interval '1 day');
  insert into readings (course_id, citation, for_date, required, on_blackboard, source, confidence)
  values ('ECN.304', 'W104 Decide Reading', date '2026-10-22', true, true, 'manual', 'tentative')
  returning id into v_reading;
  insert into _w104 values ('reading', v_reading::text);

  v_req := pg_temp.w104_req('w104 206 a');
  insert into _w104 values
    ('applied',  pg_temp.w104_propose(v_req, 'assignment_progress', 'ECN.304/w104-d1', 'status', '"submitted"')::text),
    ('planned',  pg_temp.w104_propose(v_req, 'assignment_progress', 'ECN.304/w104-d2', 'planned_start', '"2026-10-22"')::text),
    ('stale',    pg_temp.w104_propose(v_req, 'assignment_progress', 'ECN.304/w104-d2', 'notes', '"proposed note"')::text),
    ('gone',     pg_temp.w104_propose(v_req, 'assignment_progress', 'ECN.304/w104-d3', 'status', '"submitted"')::text),
    ('rnote',    pg_temp.w104_propose(v_req, 'reading_progress', v_reading::text, 'notes', '"read section 2 again"')::text);
  v_req := pg_temp.w104_req('w104 206 b');
  insert into _w104 values
    ('rejected', pg_temp.w104_propose(v_req, 'reading_progress', v_reading::text, 'status', '"in_progress"')::text),
    ('expired',  pg_temp.w104_propose(v_req, 'assignment_progress', 'ECN.304/w104-d4', 'status', '"missed"')::text),
    ('logs',     (select count(*) from inbox_apply_writes)::text);
  update workspace_proposals set created_at = now() - interval '8 days', expires_at = now() - interval '1 second'
   where id = (select v::bigint from _w104 where k = 'expired');
end $$;

do $$
declare
  p_applied  constant bigint := (select v::bigint from _w104 where k = 'applied');
  p_planned  constant bigint := (select v::bigint from _w104 where k = 'planned');
  p_stale    constant bigint := (select v::bigint from _w104 where k = 'stale');
  p_gone     constant bigint := (select v::bigint from _w104 where k = 'gone');
  p_rnote    constant bigint := (select v::bigint from _w104 where k = 'rnote');
  p_rejected constant bigint := (select v::bigint from _w104 where k = 'rejected');
  p_expired  constant bigint := (select v::bigint from _w104 where k = 'expired');
  v_reading  constant bigint := (select v::bigint from _w104 where k = 'reading');
  v_owner    constant text   := (select public.app_owner()::text);
  v_fail     text[] := '{}';
  v_got      text;
  r          record;
begin
  -- 1. Approve with no progress row.
  v_got := pg_temp.w104_decide(p_applied, 'approve');
  if v_got is distinct from 'applied|true' then v_fail := v_fail || format('1 approve: %s', v_got); end if;
  select count(*) as n, min(p.status::text) as status, min(p.notes) as notes, min(p.planned_start) as ps,
         min(p.updated_at) as at into r
    from assignment_progress p where p.assignment_id = 'ECN.304/w104-d1';
  if r.n <> 1 or r.status <> 'submitted' or r.notes is not null or r.ps is not null then
    v_fail := v_fail || format('1 the row: %s', to_jsonb(r));
  end if;
  select w.state, w.decided_at, i.state as item_state, i.resolved_at, i.resolution into r
    from workspace_proposals w join attention_items i on i.workspace_proposal_id = w.id where w.id = p_applied;
  if r.state <> 'applied' or r.decided_at is null or r.item_state <> 'resolved' or r.resolved_at is null
     or r.resolution is distinct from jsonb_build_object('outcome', 'applied', 'proposal_id', p_applied) then
    v_fail := v_fail || format('1 after approve: %s', to_jsonb(r));
  end if;
  v_got := pg_temp.w104_decide(p_applied, 'approve');
  if v_got not like '55000 %' or v_got not like format('%%proposal %s is already applied%%', p_applied) then
    v_fail := v_fail || format('1 a second approve: %s', v_got);
  end if;
  v_got := pg_temp.w104_decide(p_applied, 'reject');
  if v_got not like '55000 %already applied%' then v_fail := v_fail || format('1 a reject after: %s', v_got); end if;
  if (select count(*) from assignment_progress p where p.assignment_id = 'ECN.304/w104-d1' and p.status = 'submitted') <> 1
     or (select w.state from workspace_proposals w where w.id = p_applied) <> 'applied' then
    v_fail := v_fail || '1 a refused decision changed something'::text;
  end if;

  -- 2. Approve with a progress row: the one field, and updated_at moves to this transaction's now().
  v_got := pg_temp.w104_decide(p_planned, 'approve');
  if v_got is distinct from 'applied|true' then v_fail := v_fail || format('2 approve: %s', v_got); end if;
  select p.status::text as status, p.notes, p.planned_start, p.planned_finish, p.updated_at into r
    from assignment_progress p where p.assignment_id = 'ECN.304/w104-d2';
  if r.planned_start is distinct from date '2026-10-22' or r.status <> 'in_progress' or r.notes <> 'old note'
     or r.planned_finish is not null or r.updated_at <> now() then
    v_fail := v_fail || format('2 the row: %s', to_jsonb(r));
  end if;
  v_got := pg_temp.w104_decide(p_rnote, 'approve');
  if v_got is distinct from 'applied|true'
     or (select p.notes from reading_progress p where p.reading_id = v_reading) is distinct from 'read section 2 again'
     or (select p.status::text from reading_progress p where p.reading_id = v_reading) <> 'not_started' then
    v_fail := v_fail || format('2 a reading note: %s', v_got);
  end if;

  -- 3. Stale: the note changed after the proposal, as the owner writes it in the planner.
  v_got := pg_temp.w104_try('authenticated', v_owner,
    'update public.assignment_progress set notes = ''edited in the planner'' where assignment_id = ''ECN.304/w104-d2''');
  if v_got <> 'ok:1' then v_fail := v_fail || format('3 the owner''s edit: %s', v_got); end if;
  v_got := pg_temp.w104_decide(p_stale, 'approve');
  if v_got is distinct from 'stale|false'
     or (select p.notes from assignment_progress p where p.assignment_id = 'ECN.304/w104-d2') <> 'edited in the planner'
     or (select i.resolution->>'outcome' from attention_items i where i.workspace_proposal_id = p_stale) is distinct from 'stale' then
    v_fail := v_fail || format('3 stale: %s', v_got);
  end if;
  -- The assignment is gone: stale, and nothing inserted.
  delete from assignments where id = 'ECN.304/w104-d3';
  v_got := pg_temp.w104_decide(p_gone, 'approve');
  if v_got is distinct from 'stale|false'
     or exists (select 1 from assignment_progress p where p.assignment_id = 'ECN.304/w104-d3') then
    v_fail := v_fail || format('3 gone: %s', v_got);
  end if;

  -- 4. Reject in one place reads rejected through the view and on the Inbox item.
  v_got := pg_temp.w104_decide(p_rejected, 'reject');
  if v_got is distinct from 'rejected|false' then v_fail := v_fail || format('4 reject: %s', v_got); end if;
  perform set_config('request.jwt.claim.sub', v_owner, true);
  set local role authenticated;
  select v.state, v.effective_state, v.attention_state, v.decided_at into r
    from public.v_workspace_proposals v where v.id = p_rejected;
  reset role;
  if r.state is distinct from 'rejected' or r.effective_state is distinct from 'rejected'
     or r.attention_state is distinct from 'resolved' or r.decided_at is null then
    v_fail := v_fail || format('4 the view: %s', to_jsonb(r));
  end if;
  if (select i.resolution from attention_items i where i.workspace_proposal_id = p_rejected)
     is distinct from jsonb_build_object('outcome', 'rejected', 'proposal_id', p_rejected) then
    v_fail := v_fail || '4 the Inbox item is not resolved as rejected'::text;
  end if;
  if exists (select 1 from reading_progress p where p.reading_id = v_reading and p.status <> 'not_started') then
    v_fail := v_fail || '4 a rejected status was written'::text;
  end if;
  v_got := pg_temp.w104_decide(p_rejected, 'approve');
  if v_got not like '55000 %already rejected%' then v_fail := v_fail || format('4 approve after reject: %s', v_got); end if;

  -- 5. Expired: whatever is asked, nothing is written.
  v_got := pg_temp.w104_decide(p_expired, 'approve');
  if v_got is distinct from 'expired|false'
     or exists (select 1 from assignment_progress p where p.assignment_id = 'ECN.304/w104-d4')
     or (select i.resolution->>'outcome' from attention_items i where i.workspace_proposal_id = p_expired) is distinct from 'expired'
     or (select w.decided_at from workspace_proposals w where w.id = p_expired) is null then
    v_fail := v_fail || format('5 expired: %s', v_got);
  end if;
  v_got := pg_temp.w104_decide(p_expired, 'reject');
  if v_got not like '55000 %already expired%' then v_fail := v_fail || format('5 decide after expiry: %s', v_got); end if;

  -- 6. Not one of these writes is an apply run's.
  if (select count(*) from inbox_apply_writes) <> (select v::bigint from _w104 where k = 'logs') then
    v_fail := v_fail || '6 a decision was logged in inbox_apply_writes'::text;
  end if;

  -- 7. Refusals.
  if pg_temp.w104_decide(p_planned, 'maybe') not like '22023 %'
     or pg_temp.w104_decide(p_planned, null) not like '22023 %' then
    v_fail := v_fail || '7 a decision outside approve and reject is not 22023'::text;
  end if;
  if pg_temp.w104_decide(-1, 'approve') not like '22023 %' then
    v_fail := v_fail || '7 a proposal that does not exist is not 22023'::text;
  end if;
  if pg_temp.w104_decide(p_rejected, 'approve', '00000000-0000-4000-8000-00000000dead') not like '22023 %' then
    v_fail := v_fail || '7 a stranger is not refused as for a proposal he cannot see'::text;
  end if;
  if pg_temp.w104_try('anon', null, format('select * from public.workspace_proposal_decide(%s, ''approve'')', p_planned)) not like '42501 %'
     or pg_temp.w104_try('workspace_runner', null, format('select * from public.workspace_proposal_decide(%s, ''approve'')', p_planned)) not like '42501 %'
     or pg_temp.w104_try('inbox_apply_runner', null, format('select * from public.workspace_proposal_decide(%s, ''approve'')', p_planned)) not like '42501 %' then
    v_fail := v_fail || '7 anon or a runner role can call it'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_206: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_206_decide: PASS' as result;

rollback;
