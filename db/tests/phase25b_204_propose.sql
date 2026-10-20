-- bb2dash :: db/tests/phase25b_204_propose.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E. Worker W-104a. Tests
-- migration 204, `workspace_propose` (the contract `119b_PHASE25B_contract.md`, "204"). It needs 205
-- (the Inbox kind and `attention_items.workspace_proposal_id`), so a dry run applies 205 before it.
--
--   0. installed and fenced: SECURITY DEFINER of postgres with a pinned path, its result, executable
--      by workspace_runner alone; the role executes exactly FOURTEEN SECURITY DEFINER functions and
--      holds no table, view, column or sequence privilege in public, workspace_proposals included
--   1. a proposal, as the runner: the row it returns (label, the old value it read itself, the new
--      one); the proposal row (conversation from the request, course, 7 days to expire, proposed); the
--      open Inbox item of kind assistant_proposal, in the same transaction, with its fields; a status,
--      a note, a planned date on an assignment that has a progress row, a status on a reading that has
--      none; five in one request, and a sixth refused with 54000
--   2. the refusals, each 22023 and each leaving no proposal and no Inbox item: a request not claimed
--      by the caller (another runner's, a queued one, a finished one, one that does not exist, no
--      runner); a target or field outside the list; a planned date on a reading; a fact row that does
--      not exist; a reading named by something that is not a whole number; a value that is not a JSON
--      string, not a status, not a real date (2026-02-30, Oct 21, 2026-1-5), an empty or blank note or
--      one of 2,001 characters; a reason blank or of 501 characters; the value already shown (also
--      not_started where there is no progress row); the same field of a row twice in one request
--   3. the value check 204 and 206 share, `workspace_proposal_value_check(target, field, value)`
--      (W-106, Stack's edit of a proposed value): SECURITY INVOKER with a pinned path, returns jsonb,
--      executable by authenticated and workspace_runner alone, and not one of the runner's SECURITY
--      DEFINER functions (the fence above still reads fourteen); as authenticated it returns each
--      value that fits its field as given, and refuses each that does not with 22023 and 204's own
--      message
--
-- Every call is made under `set local role workspace_runner` (142's membership), the way the runner
-- calls it; setup rows are written as the session role. All data is synthetic. Nothing is committed.
--
-- RED against prod until 202, 203, 204 and 205 are applied (25b's cut-over): section 0 stops at
-- "migration 204 or 205 is not applied", and the fence reads thirteen until 204 is. AN `execute_sql`
-- DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase25b_204_propose.sql`.

begin;

-- 'ok:<rows>' or the SQLSTATE.
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

-- One workspace_propose call as the runner: the row as jsonb.
create function pg_temp.w104_propose(p_req bigint, p_runner text, p_target text, p_row text, p_field text,
                                     p_value jsonb, p_reason text default 'synthetic reason') returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  set local role workspace_runner;
  select to_jsonb(r) into v
    from public.workspace_propose(p_req, p_runner, p_target, p_row, p_field, p_value, p_reason) r;
  reset role;
  return v;
end $$;

-- The same call, answering with its SQLSTATE ('ok:1' when it went through).
create function pg_temp.w104_propose_try(p_req bigint, p_runner text, p_target text, p_row text, p_field text,
                                         p_value jsonb, p_reason text default 'synthetic reason') returns text
  language plpgsql as $$
begin
  return pg_temp.w104_try('workspace_runner', null,
    format('select * from public.workspace_propose(%s, %L, %L, %L, %L, %L::jsonb, %L)',
           coalesce(p_req::text, 'null'), p_runner, p_target, p_row, p_field, p_value::text, p_reason));
end $$;

-- A conversation with its question and a request in the given state.
create function pg_temp.w104_req(p_title text, p_state text, p_by text) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'question ' || p_title, true) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at, finished_at)
  values (v_conv, v_msg, p_state, p_by, case when p_state <> 'queued' then now() end,
          case when p_state in ('done', 'failed', 'cancelled') then now() end)
  returning id into v_req;
  return v_req;
end $$;

-- =============================================================================================
-- 0. Installed and fenced
-- =============================================================================================
do $$
declare
  f      constant text := 'public.workspace_propose(bigint, text, text, text, text, jsonb, text)';
  v_fail text[] := '{}';
  v_got  text;
begin
  if to_regprocedure(f) is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.attention_items'::regclass
                       and a.attname = 'workspace_proposal_id' and not a.attisdropped) then
    raise exception 'FAIL phase25b_204: migration 204 or 205 is not applied (workspace_propose or attention_items.workspace_proposal_id is missing)';
  end if;

  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef and p.proowner = 'postgres'::regrole
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'not a SECURITY DEFINER of postgres with search_path pinned'::text;
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from
     'TABLE(proposal_id bigint, label text, old_value jsonb, new_value jsonb)' then
    v_fail := v_fail || format('returns %s', pg_get_function_result(f::regprocedure));
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner'), ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_got is not null then v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got); end if;

  -- The fence: the fourteen since 204 added workspace_propose, and no relation privilege.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_claim_v3,workspace_finish,'
     'workspace_heartbeat,workspace_job_claim,workspace_job_finish,workspace_planner_feed,'
     'workspace_propose,workspace_search_timing,workspace_stream,workspace_turn_context,workspace_turn_put' then
    v_fail := v_fail || format('workspace_runner executes the SECURITY DEFINER functions [%s]', v_got);
  end if;
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and ((c.relkind in ('r', 'p', 'v', 'm', 'f')
           and (has_table_privilege('workspace_runner', c.oid,
                                    'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('workspace_runner', c.oid,
                                            'select, insert, update, references')))
          or (c.relkind = 'S'
              and has_sequence_privilege('workspace_runner', c.oid, 'usage, select, update')));
  if v_got is not null then v_fail := v_fail || format('workspace_runner holds a privilege on %s', v_got); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_204 (0): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixtures: two assignments (one with a progress row), a reading with none, four requests
-- =============================================================================================
create temp table _w104 (k text primary key, v text) on commit drop;

do $$
declare
  v_reading bigint;
begin
  insert into assignments (id, course_id, title, type, due_at)
  values ('ECN.304/w104-ps4', 'ECN.304', 'W104 Problem Set 4', 'homework', '2026-11-01 14:00+00'),
         ('ECN.304/w104-ps5', 'ECN.304', 'W104 Problem Set 5', 'homework', '2026-11-08 14:00+00');
  insert into assignment_progress (assignment_id, status, notes, planned_start)
  values ('ECN.304/w104-ps5', 'in_progress', 'old note', date '2026-10-20');
  insert into readings (course_id, citation, for_date, required, on_blackboard, source, confidence)
  values ('ECN.304', 'W104 Synthetic Reading, chapter 3', date '2026-10-22', true, true, 'manual', 'tentative')
  returning id into v_reading;
  insert into _w104 values
    ('reading', v_reading::text),
    ('req',     pg_temp.w104_req('w104 204 main', 'claimed', 'w104-runner')::text),
    ('req2',    pg_temp.w104_req('w104 204 refusals', 'claimed', 'w104-runner')::text),
    ('other',   pg_temp.w104_req('w104 204 other', 'claimed', 'w104-other')::text),
    ('queued',  pg_temp.w104_req('w104 204 queued', 'queued', null)::text),
    ('done',    pg_temp.w104_req('w104 204 done', 'done', 'w104-runner')::text);
end $$;

-- =============================================================================================
-- 1. Proposals, as the runner
-- =============================================================================================
do $$
declare
  v_req     constant bigint := (select v::bigint from _w104 where k = 'req');
  v_reading constant text   := (select v from _w104 where k = 'reading');
  v_fail    text[] := '{}';
  r         jsonb;
  p         record;
  a         record;
  v_n       integer;
begin
  -- 1a. A status on an assignment with no progress row: old value JSON null.
  r := pg_temp.w104_propose(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status',
                            '"submitted"', 'He said he turned it in today.');
  if r->>'label' is distinct from 'W104 Problem Set 4' or r->'old_value' is distinct from 'null'::jsonb
     or r->'new_value' is distinct from '"submitted"'::jsonb or (r->>'proposal_id') is null then
    v_fail := v_fail || format('1a returned %s', r);
  end if;
  select * into p from workspace_proposals w where w.id = (r->>'proposal_id')::bigint;
  if p.request_id <> v_req
     or p.conversation_id is distinct from (select q.conversation_id from workspace_requests q where q.id = v_req)
     or p.target <> 'assignment_progress' or p.row_id <> 'ECN.304/w104-ps4' or p.course_id is distinct from 'ECN.304'
     or p.label <> 'W104 Problem Set 4' or p.field <> 'status' or p.old_value is distinct from 'null'::jsonb
     or p.new_value <> '"submitted"'::jsonb or p.reason <> 'He said he turned it in today.'
     or p.state <> 'proposed' or p.decided_at is not null or p.expires_at <> p.created_at + interval '7 days' then
    v_fail := v_fail || format('1a stored %s', to_jsonb(p));
  end if;
  select * into a from attention_items i where i.workspace_proposal_id = p.id;
  if not found
     or a.kind <> 'assistant_proposal' or a.state <> 'open' or a.course_id is distinct from 'ECN.304'
     or a.entity <> 'assignment_progress' or a.ref <> 'workspace_proposal/' || p.id or a.field <> 'status'
     or a.from_value is distinct from 'null'::jsonb or a.to_value <> '"submitted"'::jsonb
     or a.question not like '%"W104 Problem Set 4"%submitted%'
     or a.suggested is distinct from jsonb_build_object('source', 'workspace', 'proposal_id', p.id,
          'conversation_id', p.conversation_id, 'request_id', v_req, 'reason', 'He said he turned it in today.')
     or a.raised_by is not null or a.resolved_at is not null then
    v_fail := v_fail || format('1a filed %s', to_jsonb(a));
  end if;

  -- 1b. A note, a planned start and a planned finish on the assignment with a progress row.
  r := pg_temp.w104_propose(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'notes', '"new note"');
  if r->'old_value' is distinct from '"old note"'::jsonb then v_fail := v_fail || format('1b notes %s', r); end if;
  r := pg_temp.w104_propose(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'planned_start', '"2026-10-22"');
  if r->'old_value' is distinct from '"2026-10-20"'::jsonb or r->'new_value' <> '"2026-10-22"'::jsonb then
    v_fail := v_fail || format('1b planned_start %s', r);
  end if;
  select i.question into a from attention_items i where i.workspace_proposal_id = (r->>'proposal_id')::bigint;
  if a.question not like '%planned start of "W104 Problem Set 5" to 2026-10-22 (now 2026-10-20)%' then
    v_fail := v_fail || format('1b question %s', a.question);
  end if;
  r := pg_temp.w104_propose(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'planned_finish', '"2026-10-25"');
  if r->'old_value' is distinct from 'null'::jsonb then v_fail := v_fail || format('1b planned_finish %s', r); end if;

  -- 1c. A status on the reading, which has no progress row: the citation is the label.
  r := pg_temp.w104_propose(v_req, 'w104-runner', 'reading_progress', v_reading, 'status', '"in_progress"');
  if r->>'label' is distinct from 'W104 Synthetic Reading, chapter 3' or r->'old_value' is distinct from 'null'::jsonb then
    v_fail := v_fail || format('1c %s', r);
  end if;
  select * into a from attention_items i where i.workspace_proposal_id = (r->>'proposal_id')::bigint;
  if a.entity <> 'reading_progress' or a.course_id is distinct from 'ECN.304' then
    v_fail := v_fail || format('1c filed %s', to_jsonb(a));
  end if;

  -- 1d. Five in this request now; a sixth, valid in every other way, is refused with 54000.
  select count(*) into v_n from workspace_proposals w where w.request_id = v_req;
  if v_n <> 5 then v_fail := v_fail || format('1d %s proposals, not 5', v_n); end if;
  if pg_temp.w104_propose_try(v_req, 'w104-runner', 'reading_progress', v_reading, 'notes', '"read it twice"') <> '54000' then
    v_fail := v_fail || '1d a sixth proposal is not refused with 54000'::text;
  end if;
  select count(*) into v_n from attention_items i
   where i.kind = 'assistant_proposal'
     and i.workspace_proposal_id in (select w.id from workspace_proposals w where w.request_id = v_req);
  if v_n <> 5 then v_fail := v_fail || format('1d %s Inbox items, not 5', v_n); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_204 (1): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 2. The refusals: 22023, and nothing left behind
-- =============================================================================================
do $$
declare
  v_req     constant bigint := (select v::bigint from _w104 where k = 'req2');
  v_reading constant text   := (select v from _w104 where k = 'reading');
  v_fail    text[] := '{}';
  v_props   bigint := (select count(*) from workspace_proposals);
  v_items   bigint := (select count(*) from attention_items);
  v_got     text;
  c         record;
begin
  for c in
    select * from (values
      ('another runner''s request', (select v::bigint from _w104 where k = 'other'),  'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"'::jsonb, 'r'),
      ('a queued request',          (select v::bigint from _w104 where k = 'queued'), 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"', 'r'),
      ('a finished request',        (select v::bigint from _w104 where k = 'done'),   'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"', 'r'),
      ('no such request',           -1::bigint,                                       'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"', 'r'),
      ('no runner',                 v_req,                                            null,          'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"', 'r'),
      ('target assignments',        v_req, 'w104-runner', 'assignments',         'ECN.304/w104-ps4', 'status',         '"submitted"', 'r'),
      ('target null',               v_req, 'w104-runner', null,                  'ECN.304/w104-ps4', 'status',         '"submitted"', 'r'),
      ('field score',               v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'score',          '"10"', 'r'),
      ('planned date on a reading', v_req, 'w104-runner', 'reading_progress',    v_reading,          'planned_start',  '"2026-10-21"', 'r'),
      ('no such assignment',        v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-none', 'status',        '"submitted"', 'r'),
      ('reading id not a number',   v_req, 'w104-runner', 'reading_progress',    'abc',              'status',         '"submitted"', 'r'),
      ('reading id 0',              v_req, 'w104-runner', 'reading_progress',    '0',                'status',         '"submitted"', 'r'),
      ('no such reading',           v_req, 'w104-runner', 'reading_progress',    '999999999999999',  'status',         '"submitted"', 'r'),
      ('value null',                v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status',         null, 'r'),
      ('value a number',            v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status',         '3', 'r'),
      ('status not a label',        v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status',         '"done"', 'r'),
      ('date 2026-02-30',           v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'planned_start',  '"2026-02-30"', 'r'),
      ('date Oct 21',               v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'planned_start',  '"Oct 21"', 'r'),
      ('date 2026-1-5',             v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'planned_finish', '"2026-1-5"', 'r'),
      ('note empty',                v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          '""', 'r'),
      ('note blank',                v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          '"   "', 'r'),
      ('note 2001',                 v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          to_jsonb(repeat('n', 2001)), 'r'),
      ('reason blank',              v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          '"x"', '  '),
      ('reason null',               v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          '"x"', null),
      ('reason 501',                v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',          '"x"', repeat('r', 501)),
      ('status already shown',      v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'status',         '"in_progress"', 'r'),
      ('date already shown',        v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'planned_start',  '"2026-10-20"', 'r'),
      ('note already shown',        v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps5', 'notes',          '"old note"', 'r'),
      ('not_started with no row',   v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'status',         '"not_started"', 'r')
    ) as t(what, req, runner, target, row_id, field, val, reason)
  loop
    v_got := pg_temp.w104_propose_try(c.req, c.runner, c.target, c.row_id, c.field, c.val, c.reason);
    if v_got <> '22023' then v_fail := v_fail || format('%s: %s, not 22023', c.what, v_got); end if;
  end loop;
  if (select count(*) from workspace_proposals) <> v_props or (select count(*) from attention_items) <> v_items then
    v_fail := v_fail || 'a refused call left a proposal or an Inbox item behind'::text;
  end if;

  -- The edges that pass: a 2,000-character note, a 500-character reason; then the same field twice.
  if pg_temp.w104_propose_try(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes',
                              to_jsonb(repeat('n', 2000)), repeat('r', 500)) <> 'ok:1' then
    v_fail := v_fail || 'a 2,000-character note with a 500-character reason is refused'::text;
  end if;
  if pg_temp.w104_propose_try(v_req, 'w104-runner', 'assignment_progress', 'ECN.304/w104-ps4', 'notes', '"other"') <> '22023' then
    v_fail := v_fail || 'the same field of a row twice in one request is not refused with 22023'::text;
  end if;
  -- And a proposal by another runner's name on this runner's request is refused too.
  if pg_temp.w104_propose_try(v_req, 'w104-other', 'assignment_progress', 'ECN.304/w104-ps4', 'status', '"submitted"') <> '22023' then
    v_fail := v_fail || 'another runner''s name on this request is not refused'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_204 (2): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 3. The shared value check (W-106)
-- =============================================================================================
-- One call as the given role: the value it returned as text, or the SQLSTATE and the message.
create function pg_temp.w106_check(p_role text, p_target text, p_field text, p_value jsonb) returns text
  language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claim.sub', (select public.app_owner()::text), true);
  execute format('set local role %I', p_role);
  begin
    select public.workspace_proposal_value_check(p_target, p_field, p_value)::text into v;
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;

do $$
declare
  f      constant text := 'public.workspace_proposal_value_check(text, text, jsonb)';
  v_fail text[] := '{}';
  v_got  text;
  c      record;
begin
  if to_regprocedure(f) is null then
    raise exception 'FAIL phase25b_204 (3): workspace_proposal_value_check(text, text, jsonb) is missing';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and not p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'the check is not SECURITY INVOKER with search_path pinned'::text;
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from 'jsonb' then
    v_fail := v_fail || format('the check returns %s', pg_get_function_result(f::regprocedure));
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'), ('workspace_runner'),
                 ('sync_runner'), ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_got is distinct from 'authenticated, workspace_runner' then
    v_fail := v_fail || format('the check is executable by [%s], not authenticated and workspace_runner', v_got);
  end if;
  if pg_temp.w106_check('anon', 'assignment_progress', 'status', '"graded"') not like '42501 %' then
    v_fail := v_fail || 'anon can call the check'::text;
  end if;

  -- What fits its field comes back as given.
  for c in
    select * from (values
      ('assignment_progress', 'status',         '"graded"'),
      ('assignment_progress', 'status',         '"planned"'),
      ('reading_progress',    'status',         '"in_progress"'),
      ('assignment_progress', 'planned_start',  '"2026-10-22"'),
      ('assignment_progress', 'planned_finish', '"2028-02-29"'),
      ('reading_progress',    'notes',          '" read section 2 "')
    ) as t(target, field, val)
  loop
    v_got := pg_temp.w106_check('authenticated', c.target, c.field, c.val::jsonb);
    if v_got is distinct from c.val then v_fail := v_fail || format('%s %s %s: %s', c.target, c.field, c.val, v_got); end if;
  end loop;
  v_got := pg_temp.w106_check('workspace_runner', 'assignment_progress', 'notes', to_jsonb(repeat('n', 2000)));
  if v_got is distinct from to_jsonb(repeat('n', 2000))::text then
    v_fail := v_fail || 'a 2,000-character note is refused for the runner'::text;
  end if;

  -- What does not fit is refused with 22023 and 204's own words.
  for c in
    select * from (values
      ('assignment_progress', 'status',         '"done"',         '22023 workspace_propose: done is not a planner status'),
      ('assignment_progress', 'status',         '"Graded"',       '22023 workspace_propose: Graded is not a planner status'),
      ('assignment_progress', 'status',         '12',             '22023 workspace_propose: the value must be a JSON string'),
      ('assignment_progress', 'status',         'null',           '22023 workspace_propose: the value must be a JSON string'),
      ('assignment_progress', 'planned_start',  '"2026-02-30"',   '22023 workspace_propose: a planned date is written YYYY-MM-DD and must be a real date, not 2026-02-30'),
      ('assignment_progress', 'planned_finish', '"Oct 21"',       '22023 workspace_propose: a planned date is written YYYY-MM-DD and must be a real date, not Oct 21'),
      ('assignment_progress', 'planned_start',  '"graded"',       '22023 workspace_propose: a planned date is written YYYY-MM-DD and must be a real date, not graded'),
      ('assignment_progress', 'notes',          '""',             '22023 workspace_propose: a note is 1 to 2000 characters and not only blanks'),
      ('assignment_progress', 'notes',          '"   "',          '22023 workspace_propose: a note is 1 to 2000 characters and not only blanks'),
      ('reading_progress',    'planned_start',  '"2026-10-22"',   '22023 workspace_propose: planned_start cannot be proposed on reading_progress'),
      ('assignment_progress', 'score',          '"1"',            '22023 workspace_propose: score cannot be proposed on assignment_progress'),
      ('assignments',         'status',         '"graded"',       '22023 workspace_propose: the target must be assignment_progress or reading_progress')
    ) as t(target, field, val, want)
  loop
    v_got := pg_temp.w106_check('authenticated', c.target, c.field, c.val::jsonb);
    if v_got is distinct from c.want then v_fail := v_fail || format('%s %s %s: [%s]', c.target, c.field, c.val, v_got); end if;
  end loop;
  v_got := pg_temp.w106_check('authenticated', 'assignment_progress', 'notes', to_jsonb(repeat('n', 2001)));
  if v_got is distinct from '22023 workspace_propose: a note is 1 to 2000 characters and not only blanks' then
    v_fail := v_fail || format('a 2,001-character note: [%s]', v_got);
  end if;
  v_got := pg_temp.w106_check('authenticated', 'assignment_progress', 'status', null);
  if v_got is distinct from '22023 workspace_propose: the value must be a JSON string' then
    v_fail := v_fail || format('an SQL null value: [%s]', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_204 (3): %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_204_propose: PASS' as result;

rollback;
