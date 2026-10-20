-- bb2dash :: db/tests/phase25b_205_inbox_kind.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E. Worker W-104a. Tests
-- migration 205 (the contract `119b_PHASE25B_contract.md`, "205"): the Inbox kind, the readers that
-- leave it out (205's audit), v_workspace_proposals and the expiry sweep.
--
--   0. installed: the kind check holds the six kinds; workspace_proposal_id references 203, is unique
--      where set and set exactly on the kind; v_workspace_proposals has the page's eighteen columns,
--      is security_invoker and readable by authenticated and service_role alone; v_inbox_queue is
--      security_invoker with 090's columns; the sweep is a pinned SECURITY DEFINER no client role
--      executes, scheduled hourly as bb2dash-proposals-expire
--   1. no assistant_proposal item reaches the apply side, open or decided: v_inbox_queue; what
--      inbox_apply_runner can select; inbox_apply_begin_item (false) and a write naming the item
--      (42501); inbox_apply_archive (false) and archive_attention_item (P0002), the item not archived;
--      inbox_decisions_unfiled / _unlogged, even for a proposal forced into the archived shape;
--      sync_request_inbox_apply files no inbox_feedback request when only proposals are answered, and
--      files one once a real answer is there; run_transform's counts leave the kind out
--   2. the view: effective_state expired for a proposed row past expires_at, the Inbox item's id and
--      state joined; the owner reads it, a stranger reads nothing
--   3. the sweep: every proposed row past expires_at expired with decided_at, its Inbox item resolved
--      with {outcome: expired, proposal_id}; a proposal not due and a decided one untouched; a second
--      sweep expires nothing
--
-- The unit parks, INSIDE this transaction only, every answered Inbox item (archived with a test
-- mark) and every open inbox_feedback request (cancelled), so the queue holds only its own rows.
-- Proposals are filed through 204 as the runner. All data is synthetic. Nothing is committed.
--
-- RED against prod until 202 to 206 are applied (25b's cut-over): section 0 stops at "migration 205 is
-- not applied". AN `execute_sql` DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner, inbox_apply_runner, sync_runner to postgres with inherit false, set true;
-- (142's and 181's note). RUN IT: `node scripts/db-test.mjs --only phase25b_205_inbox_kind.sql`.

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
    v := sqlstate;
  end;
  reset role;
  return v;
end $$;

-- One value read as a role: the first column of the first row, as text.
create function pg_temp.w104_value(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute p_sql into v;
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

create function pg_temp.w104_propose(p_req bigint, p_row text, p_field text, p_value jsonb) returns bigint
  language plpgsql as $$
declare
  v bigint;
begin
  set local role workspace_runner;
  select r.proposal_id into v
    from public.workspace_propose(p_req, 'w104-runner', 'assignment_progress', p_row, p_field, p_value, 'synthetic') r;
  reset role;
  return v;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
begin
  if to_regclass('public.v_workspace_proposals') is null
     or to_regprocedure('public.workspace_proposals_expire()') is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.attention_items'::regclass
                       and a.attname = 'workspace_proposal_id' and not a.attisdropped) then
    raise exception 'FAIL phase25b_205: migration 205 is not applied (v_workspace_proposals, workspace_proposals_expire or attention_items.workspace_proposal_id is missing)';
  end if;

  select pg_get_constraintdef(c.oid) into v_got from pg_constraint c
   where c.conrelid = 'public.attention_items'::regclass and c.conname = 'attention_items_kind_check';
  if v_got is distinct from
     'CHECK ((kind = ANY (ARRAY[''conflict''::text, ''missing''::text, ''stack_must_confirm''::text, '
     '''deadline''::text, ''data_gap''::text, ''assistant_proposal''::text])))' then
    v_fail := v_fail || format('kind check is %s', v_got);
  end if;
  select pg_get_constraintdef(c.oid) into v_got from pg_constraint c
   where c.conrelid = 'public.attention_items'::regclass and c.conname = 'attention_items_proposal_link';
  if v_got is distinct from
     'CHECK (((kind = ''assistant_proposal''::text) = (workspace_proposal_id IS NOT NULL)))' then
    v_fail := v_fail || format('link check is %s', v_got);
  end if;
  if not exists (select 1 from pg_index i
                  where i.indrelid = 'public.attention_items'::regclass and i.indisunique
                    and pg_get_indexdef(i.indexrelid) like '%(workspace_proposal_id) WHERE (workspace_proposal_id IS NOT NULL)') then
    v_fail := v_fail || 'workspace_proposal_id is not unique where set'::text;
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.attention_items'::regclass and c.contype = 'f'
                    and c.confrelid = 'public.workspace_proposals'::regclass) then
    v_fail := v_fail || 'workspace_proposal_id does not reference workspace_proposals'::text;
  end if;

  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_proposals'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id bigint, created_at timestamp with time zone, expires_at timestamp with time zone, request_id bigint, '
     'conversation_id uuid, target text, row_id text, course_id text, label text, field text, old_value jsonb, '
     'new_value jsonb, reason text, state text, decided_at timestamp with time zone, effective_state text, '
     'attention_item_id bigint, attention_state text' then
    v_fail := v_fail || format('v_workspace_proposals columns are [%s]', v_got);
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_inbox_queue'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id,kind,course_id,entity,ref,field,question,from_value,to_value,suggested,state,resolution,accept,'
     'feedback,has_note,raised_at,raised_by_sync_run,resolved_at,applied_at,was_applied' then
    v_fail := v_fail || format('v_inbox_queue columns are [%s]', v_got);
  end if;
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.oid in ('public.v_inbox_queue'::regclass, 'public.v_workspace_proposals'::regclass)
     and not coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                         from unnest(c.reloptions) o where split_part(o, '=', 1) = 'security_invoker'), false);
  if v_got is not null then v_fail := v_fail || format('not security_invoker: %s', v_got); end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('anon'), ('workspace_runner'), ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.v_workspace_proposals', 'select, insert, update, delete');
  if v_got is not null then v_fail := v_fail || format('v_workspace_proposals is open to %s', v_got); end if;
  if not has_table_privilege('authenticated', 'public.v_workspace_proposals', 'select')
     or not has_table_privilege('service_role', 'public.v_workspace_proposals', 'select') then
    v_fail := v_fail || 'authenticated or service_role cannot read v_workspace_proposals'::text;
  end if;

  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.workspace_proposals_expire()'::regprocedure and p.prosecdef
                    and p.proowner = 'postgres'::regrole
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'the sweep is not a pinned SECURITY DEFINER of postgres'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('workspace_runner'),
                 ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, 'public.workspace_proposals_expire()', 'execute');
  if v_got is not null then v_fail := v_fail || format('the sweep is executable by %s', v_got); end if;
  if (select count(*) from cron.job j
       where j.jobname = 'bb2dash-proposals-expire' and j.schedule = '7 * * * *'
         and j.command = 'select public.workspace_proposals_expire()') <> 1 then
    v_fail := v_fail || 'the job bb2dash-proposals-expire is not scheduled once, hourly'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_205 (0): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixtures: the queue parked; four proposals (open, rejected, past due, not due); one real answer
-- =============================================================================================
create temp table _w104 (k text primary key, v text) on commit drop;

update attention_items set state = 'archived', archived_at = now(), archived_by = 'w104-park'
 where state in ('resolved', 'dismissed');
update agent_requests set state = 'cancelled', finished_at = now()
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

do $$
declare
  v_req   bigint;
  v_id    bigint;
  v_owner constant text := (select public.app_owner()::text);
begin
  insert into assignments (id, course_id, title, type, due_at)
  values ('ECN.304/w104-a1', 'ECN.304', 'W104 Item 1', 'homework', '2026-11-01 14:00+00'),
         ('ECN.304/w104-a2', 'ECN.304', 'W104 Item 2', 'homework', '2026-11-02 14:00+00');
  v_req := pg_temp.w104_req('w104 205');

  v_id := pg_temp.w104_propose(v_req, 'ECN.304/w104-a1', 'status', '"submitted"');
  insert into _w104 values ('open', v_id::text);

  -- Rejected as the owner, through 206: a resolved item of the kind.
  v_id := pg_temp.w104_propose(v_req, 'ECN.304/w104-a1', 'notes', '"rejected note"');
  insert into _w104 values ('rejected', v_id::text);
  perform set_config('request.jwt.claim.sub', v_owner, true);
  set local role authenticated;
  perform public.workspace_proposal_decide(v_id, 'reject');
  reset role;

  -- Past due (made 8 days ago), and one not due.
  v_id := pg_temp.w104_propose(v_req, 'ECN.304/w104-a2', 'status', '"submitted"');
  update workspace_proposals set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
   where id = v_id;
  insert into _w104 values ('due', v_id::text);
  v_id := pg_temp.w104_propose(v_req, 'ECN.304/w104-a2', 'planned_start', '"2026-10-30"');
  insert into _w104 values ('notdue', v_id::text);

  -- A real answered item, kept out of the queue for now.
  insert into attention_items (kind, course_id, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'ECN.304', 'assignment', 'ECN.304/w104-a1', 'w104_control', 'W104 control question',
          'archived', now(), '{"value": "x"}')
  returning id into v_id;
  insert into _w104 values ('control', v_id::text);
  -- A sync this runner closed done, which sync_request_inbox_apply files after.
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, note)
  values ('sync', 'all', 'done', 'sync-runner', now(), now(), 'w104 205 synthetic sync')
  returning id into v_id;
  insert into _w104 values ('sync', v_id::text);
end $$;

-- =============================================================================================
-- 1. Nothing on the apply side sees the kind
-- =============================================================================================
do $$
declare
  v_open     constant bigint := (select v::bigint from _w104 where k = 'open');
  v_rejected constant bigint := (select v::bigint from _w104 where k = 'rejected');
  v_item_open bigint := (select i.id from attention_items i where i.workspace_proposal_id = v_open);
  v_item_rej  bigint := (select i.id from attention_items i where i.workspace_proposal_id = v_rejected);
  v_control  constant bigint := (select v::bigint from _w104 where k = 'control');
  v_sync     constant bigint := (select v::bigint from _w104 where k = 'sync');
  v_fail     text[] := '{}';
  v_got      text;
  v_req      bigint;
  v_logs     bigint;
begin
  if v_item_open is null or v_item_rej is null
     or (select state from attention_items where id = v_item_rej) <> 'resolved' then
    raise exception 'FAIL phase25b_205 (1): the fixture proposals have no open and resolved Inbox items';
  end if;

  -- 1a. The queue, and the filing after a sync: nothing while only proposals are answered.
  if exists (select 1 from v_inbox_queue q where q.id in (v_item_open, v_item_rej) or q.kind = 'assistant_proposal') then
    v_fail := v_fail || 'v_inbox_queue holds a proposal'::text;
  end if;
  v_got := pg_temp.w104_value('sync_runner', null, format('select public.sync_request_inbox_apply(%s)::text', v_sync));
  if v_got is not null then v_fail := v_fail || format('sync_request_inbox_apply filed request %s for proposals alone', v_got); end if;

  -- 1b. What inbox_apply_runner can select.
  v_got := pg_temp.w104_value('inbox_apply_runner', null,
    'select count(*)::text from public.attention_items where kind = ''assistant_proposal''');
  if v_got <> '0' then v_fail := v_fail || format('inbox_apply_runner selects %s proposal items', v_got); end if;
  v_got := pg_temp.w104_value('inbox_apply_runner', null,
    format('select count(*)::text from public.attention_items where id = %s', v_control));
  if v_got <> '1' then v_fail := v_fail || 'inbox_apply_runner no longer selects other items'::text; end if;

  -- 1c. The worker's three calls, with a claim of its own.
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, note)
  values ('inbox_feedback', 'all', 'claimed', 'inbox-apply-runner', now(), 'w104 205 synthetic claim')
  returning id into v_req;
  v_got := pg_temp.w104_value('inbox_apply_runner', null,
    format('select public.inbox_apply_begin_item(%s, %s)::text', v_req, v_item_rej));
  if v_got <> 'false' then v_fail := v_fail || format('inbox_apply_begin_item on a proposal: %s', v_got); end if;
  -- A write by the apply role whose inbox_apply.item names the decided proposal (as if a begin had).
  insert into assignment_progress (assignment_id) values ('ECN.304/w104-a1') on conflict do nothing;
  v_logs := (select count(*) from inbox_apply_writes);
  perform set_config('inbox_apply.item', v_item_rej::text, true);
  perform set_config('inbox_apply.request', v_req::text, true);
  v_got := pg_temp.w104_try('inbox_apply_runner', null,
    'update public.assignment_progress set notes = ''w104'' where assignment_id = ''ECN.304/w104-a1''');
  if v_got <> '42501' then v_fail := v_fail || format('a write naming a proposal item: %s, not 42501', v_got); end if;
  if (select count(*) from inbox_apply_writes) <> v_logs then
    v_fail := v_fail || 'a write naming a proposal item was logged'::text;
  end if;
  perform set_config('inbox_apply.item', '', true);
  v_got := pg_temp.w104_value('inbox_apply_runner', null,
    format('select public.inbox_apply_archive(%s, %s, %L::jsonb)::text', v_req, v_item_rej,
           jsonb_build_object('schema', 'inbox-decision/1', 'item', v_item_rej::text, 'request', v_req::text,
                              'bucket', 'kept', 'mode', 'unattended', 'change', 'nothing', 'rule', 'w104')));
  if v_got <> 'false' then v_fail := v_fail || format('inbox_apply_archive on a proposal: %s', v_got); end if;
  if pg_temp.w104_try(null, null,
       format('select public.archive_attention_item(%s, %L::jsonb, %L)', v_item_rej, '{"schema": "inbox-decision/1"}', 'w104')) <> 'P0002' then
    v_fail := v_fail || 'archive_attention_item does not refuse a proposal with P0002'::text;
  end if;
  if (select state from attention_items where id = v_item_rej) <> 'resolved' then
    v_fail := v_fail || 'the decided proposal''s item was archived'::text;
  end if;

  -- 1d. The decision filing's two lists, even for a proposal forced into the archived shape.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'w104-forced',
         decision = '{"schema": "inbox-decision/1"}', decision_filed_at = null
   where id = v_item_rej;
  if exists (select 1 from public.inbox_decisions_unfiled(500) u where u.id = v_item_rej) then
    v_fail := v_fail || 'inbox_decisions_unfiled lists a proposal'::text;
  end if;
  update attention_items set decision_filed_at = now(), decision_filed = '{"note_path": "w104.md"}' where id = v_item_rej;
  if exists (select 1 from public.inbox_decisions_unlogged(500) u where u.id = v_item_rej) then
    v_fail := v_fail || 'inbox_decisions_unlogged lists a proposal'::text;
  end if;
  update attention_items set state = 'resolved', archived_at = null, archived_by = null, decision = null,
                             decision_filed_at = null, decision_filed = null
   where id = v_item_rej;

  -- 1e. A real answer is still the queue's and still filed for: the control comes back.
  update attention_items set state = 'resolved' where id = v_control;
  if not exists (select 1 from v_inbox_queue q where q.id = v_control) then
    v_fail := v_fail || 'v_inbox_queue lost a real answer'::text;
  end if;
  update agent_requests set state = 'cancelled' where id = v_req;
  v_got := pg_temp.w104_value('sync_runner', null, format('select public.sync_request_inbox_apply(%s)::text', v_sync));
  if v_got is null then v_fail := v_fail || 'sync_request_inbox_apply files nothing for a real answer'::text; end if;

  -- 1f. run_transform's two counts leave the kind out.
  select count(*)::text into v_got
    from regexp_matches((select p.prosrc from pg_proc p where p.oid = 'public.run_transform(uuid, text)'::regprocedure),
                        'select count\(\*\) into v_(before|after) from attention_items where kind <> ''assistant_proposal''', 'g');
  if v_got <> '2' then v_fail := v_fail || format('run_transform leaves the kind out of %s counts, not 2', v_got); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_205 (1): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 2. The view, and 3. the sweep
-- =============================================================================================
do $$
declare
  v_due      constant bigint := (select v::bigint from _w104 where k = 'due');
  v_notdue   constant bigint := (select v::bigint from _w104 where k = 'notdue');
  v_rejected constant bigint := (select v::bigint from _w104 where k = 'rejected');
  v_owner    constant text   := (select public.app_owner()::text);
  v_fail     text[] := '{}';
  v_got      text;
  r          record;
  v_n        integer;
begin
  -- 2. As the owner: the past-due row reads expired while it is still proposed.
  v_got := pg_temp.w104_value('authenticated', v_owner,
    format('select concat_ws(''|'', state, effective_state, attention_state, (attention_item_id is not null)::text) from public.v_workspace_proposals where id = %s', v_due));
  if v_got is distinct from 'proposed|expired|open|true' then v_fail := v_fail || format('2 the due row reads %s', v_got); end if;
  v_got := pg_temp.w104_value('authenticated', v_owner,
    format('select concat_ws(''|'', state, effective_state, attention_state) from public.v_workspace_proposals where id = %s', v_notdue));
  if v_got is distinct from 'proposed|proposed|open' then v_fail := v_fail || format('2 the open row reads %s', v_got); end if;
  v_got := pg_temp.w104_value('authenticated', v_owner,
    format('select concat_ws(''|'', state, effective_state, attention_state) from public.v_workspace_proposals where id = %s', v_rejected));
  if v_got is distinct from 'rejected|rejected|resolved' then v_fail := v_fail || format('2 the rejected row reads %s', v_got); end if;
  v_got := pg_temp.w104_value('authenticated', '00000000-0000-4000-8000-00000000dead',
    'select count(*)::text from public.v_workspace_proposals');
  if v_got <> '0' then v_fail := v_fail || format('2 a stranger reads %s rows', v_got); end if;
  if pg_temp.w104_try('anon', null, 'select 1 from public.v_workspace_proposals') <> '42501' then
    v_fail := v_fail || '2 anon can read the view'::text;
  end if;

  -- 3. The sweep, as db_test_runner (its one grant): the due row and nothing else.
  v_n := public.workspace_proposals_expire();
  if v_n <> (select count(*) from workspace_proposals w where w.id = v_due and w.state = 'expired') or v_n < 1 then
    v_fail := v_fail || format('3 the sweep expired %s', v_n);
  end if;
  select w.state, w.decided_at, i.state as item_state, i.resolved_at, i.resolution into r
    from workspace_proposals w join attention_items i on i.workspace_proposal_id = w.id where w.id = v_due;
  if r.state <> 'expired' or r.decided_at is null or r.item_state <> 'resolved' or r.resolved_at is null
     or r.resolution is distinct from jsonb_build_object('outcome', 'expired', 'proposal_id', v_due) then
    v_fail := v_fail || format('3 the due row after the sweep: %s', to_jsonb(r));
  end if;
  if (select w.state from workspace_proposals w where w.id = v_notdue) <> 'proposed'
     or (select i.state from attention_items i where i.workspace_proposal_id = v_notdue) <> 'open' then
    v_fail := v_fail || '3 the sweep touched a proposal not due'::text;
  end if;
  if (select w.state from workspace_proposals w where w.id = v_rejected) <> 'rejected' then
    v_fail := v_fail || '3 the sweep touched a decided proposal'::text;
  end if;
  if public.workspace_proposals_expire() <> 0 then v_fail := v_fail || '3 a second sweep expired more'::text; end if;
  v_got := pg_temp.w104_value('authenticated', v_owner,
    format('select concat_ws(''|'', state, effective_state, attention_state) from public.v_workspace_proposals where id = %s', v_due));
  if v_got is distinct from 'expired|expired|resolved' then v_fail := v_fail || format('3 the view reads %s', v_got); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_205 (2, 3): %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_205_inbox_kind: PASS' as result;

rollback;
