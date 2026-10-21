-- bb2dash :: db/tests/phase25b_208_decide_409.sql
-- Phase 25b follow-up. Tests migration 208: `workspace_proposal_decide` refuses a second decision in
-- PostgREST's status-carrying form, so the page gets HTTP 409 with code 55000 instead of a 500.
--
--   0. installed: the refusal is the PGRST form and no 55000 errcode is left; one signature; SECURITY
--      INVOKER with a pinned path; executable by authenticated alone
--   1. a second decision on an applied proposal: SQLSTATE PGRST; the message is JSON
--      {code: "55000", message: "proposal <id> is already applied", details: null, hint: null}; the
--      detail is JSON {status: 409, headers: {}}; the proposal, its Inbox item and the planner row are
--      unchanged
--   2. the same for a rejected proposal ("already rejected"), approve and reject alike
--   3. every other refusal is 206's: a decision word that is not approve or reject is still 22023
--
-- Proposals are filed through 204 as the runner; decisions are made as the owner under `set local role
-- authenticated`, the way the page calls it. All data is synthetic. Nothing is committed.
--
-- RED against prod until 208 is applied: section 0 stops at "migration 208 is not applied". AN
-- `execute_sql` DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase25b_208_decide_409.sql`.

begin;

-- One decision as the owner: 'state|applied', or sqlstate, message and detail as one jsonb.
create function pg_temp.w208_decide(p_id bigint, p_decision text) returns jsonb
  language plpgsql as $$
declare
  v        jsonb;
  v_detail text;
begin
  perform set_config('request.jwt.claim.sub', (select public.app_owner()::text), true);
  set local role authenticated;
  begin
    select jsonb_build_object('ok', d.state || '|' || d.applied) into v
      from public.workspace_proposal_decide(p_id, p_decision) d;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v := jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm, 'detail', v_detail);
  end;
  reset role;
  return v;
end $$;

create function pg_temp.w208_req(p_title text) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'question ' || p_title, true) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at)
  values (v_conv, v_msg, 'claimed', 'w208-runner', now()) returning id into v_req;
  return v_req;
end $$;

create function pg_temp.w208_propose(p_req bigint, p_row text, p_field text, p_value jsonb) returns bigint
  language plpgsql as $$
declare
  v bigint;
begin
  set local role workspace_runner;
  select r.proposal_id into v
    from public.workspace_propose(p_req, 'w208-runner', 'assignment_progress', p_row, p_field, p_value, 'synthetic') r;
  reset role;
  return v;
end $$;

-- What a refused decision must leave as it is: the proposals, their Inbox items and the planner rows.
create function pg_temp.w208_snapshot(p_ids bigint[]) returns jsonb
  language sql stable as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'state', w.state, 'decided_at', w.decided_at,
                                                       'approved_value', w.approved_value, 'item_state', i.state,
                                                       'resolved_at', i.resolved_at, 'resolution', i.resolution) order by w.id)
                     from workspace_proposals w join attention_items i on i.workspace_proposal_id = w.id
                    where w.id = any (p_ids)), '[]'::jsonb)
      || coalesce((select jsonb_agg(to_jsonb(p) order by p.assignment_id) from assignment_progress p
                    where p.assignment_id in (select w.row_id from workspace_proposals w where w.id = any (p_ids))), '[]'::jsonb)
$$;

-- The refusal a second decision must get, for a proposal and the state it holds.
create function pg_temp.w208_refusal_problems(p_got jsonb, p_id bigint, p_state text) returns text[]
  language plpgsql as $$
declare
  v_fail text[] := '{}';
  v_msg  jsonb;
  v_det  jsonb;
begin
  if p_got ->> 'sqlstate' is distinct from 'PGRST' then
    return array[format('sqlstate is not PGRST: %s', p_got)];
  end if;
  begin
    v_msg := (p_got ->> 'message')::jsonb;
    v_det := (p_got ->> 'detail')::jsonb;
  exception when others then
    return array[format('message or detail is not JSON: %s', p_got)];
  end;
  if v_msg is distinct from jsonb_build_object('code', '55000',
                                               'message', format('proposal %s is already %s', p_id, p_state),
                                               'details', null, 'hint', null) then
    v_fail := v_fail || format('message %s', v_msg);
  end if;
  if v_det is distinct from '{"status": 409, "headers": {}}'::jsonb then
    v_fail := v_fail || format('detail %s', v_det);
  end if;
  return v_fail;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  f      constant text := 'public.workspace_proposal_decide(bigint, text, jsonb)';
  v_fail text[] := '{}';
  v_src  text;
  v_got  text;
begin
  if to_regprocedure(f) is null then
    raise exception 'FAIL phase25b_208: migration 206 is not applied (workspace_proposal_decide(bigint, text, jsonb) is missing)';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = f::regprocedure;
  if v_src not like '%raise sqlstate ''PGRST''%' then
    raise exception 'FAIL phase25b_208: migration 208 is not applied (the refusal is not the PGRST form)';
  end if;
  if v_src like '%errcode = ''55000''%' then
    v_fail := v_fail || 'a 55000 errcode is still raised'::text;
  end if;
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'workspace_proposal_decide') <> 1 then
    v_fail := v_fail || 'more than the one signature'::text;
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and not p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'not SECURITY INVOKER with search_path pinned'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('service_role'), ('db_test_runner'), ('workspace_runner'),
                 ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_got is not null then v_fail := v_fail || format('executable beyond authenticated: %s', v_got); end if;
  if not has_function_privilege('authenticated', f, 'execute') then
    v_fail := v_fail || 'authenticated cannot execute it'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_208 (0): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixtures
-- =============================================================================================
create temp table _w208 (k text primary key, v text) on commit drop;

do $$
declare
  v_req bigint;
begin
  insert into assignments (id, course_id, title, type, due_at)
  values ('ECN.304/w208-d1', 'ECN.304', 'W208 Decide 1', 'homework', '2026-11-01 14:00+00'),
         ('ECN.304/w208-d2', 'ECN.304', 'W208 Decide 2', 'homework', '2026-11-02 14:00+00');
  v_req := pg_temp.w208_req('w208 a');
  insert into _w208 values
    ('applied',  pg_temp.w208_propose(v_req, 'ECN.304/w208-d1', 'status', '"submitted"')::text),
    ('rejected', pg_temp.w208_propose(v_req, 'ECN.304/w208-d2', 'notes', '"proposed note"')::text);
end $$;

-- =============================================================================================
-- 1–3. The refusal
-- =============================================================================================
do $$
declare
  p_applied  constant bigint := (select v::bigint from _w208 where k = 'applied');
  p_rejected constant bigint := (select v::bigint from _w208 where k = 'rejected');
  v_fail     text[] := '{}';
  v_got      jsonb;
  v_before   jsonb;
  v_after    jsonb;
begin
  v_got := pg_temp.w208_decide(p_applied, 'approve');
  if v_got is distinct from '{"ok": "applied|true"}'::jsonb then v_fail := v_fail || format('first approve: %s', v_got); end if;
  v_got := pg_temp.w208_decide(p_rejected, 'reject');
  if v_got is distinct from '{"ok": "rejected|false"}'::jsonb then v_fail := v_fail || format('first reject: %s', v_got); end if;

  v_before := pg_temp.w208_snapshot(array[p_applied, p_rejected]);

  -- 1. Applied, asked again either way.
  v_fail := v_fail || pg_temp.w208_refusal_problems(pg_temp.w208_decide(p_applied, 'approve'), p_applied, 'applied');
  v_fail := v_fail || pg_temp.w208_refusal_problems(pg_temp.w208_decide(p_applied, 'reject'), p_applied, 'applied');
  -- 2. Rejected, asked again either way.
  v_fail := v_fail || pg_temp.w208_refusal_problems(pg_temp.w208_decide(p_rejected, 'approve'), p_rejected, 'rejected');
  v_fail := v_fail || pg_temp.w208_refusal_problems(pg_temp.w208_decide(p_rejected, 'reject'), p_rejected, 'rejected');

  v_after := pg_temp.w208_snapshot(array[p_applied, p_rejected]);
  if v_after is distinct from v_before then
    v_fail := v_fail || format('a refused decision changed something: %s -> %s', v_before, v_after);
  end if;

  -- 3. Every other refusal is still 206's.
  v_got := pg_temp.w208_decide(p_applied, 'maybe');
  if v_got ->> 'sqlstate' is distinct from '22023' then v_fail := v_fail || format('3 a bad decision word: %s', v_got); end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_208 (1-3): %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_208_decide_409: PASS' as result;

rollback;
