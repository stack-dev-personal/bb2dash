-- bb2dash :: db/migrations/208_workspace_proposal_decide_409.sql
-- Phase 25b follow-up (acceptance run 20261020T222413Z, operator note 1; STATUS.md).
--
-- WHY. 206 refuses a second decision on a proposal with SQLSTATE 55000 ("proposal <id> is already
-- <state>"). PostgREST answers every 55xxx code with HTTP 500, so an ordinary refusal (the card and the
-- Inbox decided the same proposal) looked like a server fault in the browser and in the API logs.
--
-- WHAT. workspace_proposal_decide(bigint, text, jsonb) is replaced with 206's body unchanged but for that
-- one raise, which now uses PostgREST's status-carrying form: SQLSTATE 'PGRST', the message a JSON object
-- {code, message, details, hint} and the detail {"status": 409, "headers": {}}. Over HTTP the caller gets
-- 409 Conflict with the same body as before: code "55000" and "proposal <id> is already <state>", so the
-- web app's isAlreadyDecided / heldStateOf (web/src/lib/workspace-proposals.ts) need no change.
--
-- A caller in SQL now sees SQLSTATE PGRST, with 55000 and the words inside the JSON message
-- (db/tests/phase25b_206_decide.sql unwraps it; phase25b_208_decide_409.sql proves the shape).
-- Every other refusal (22023) and every outcome is 206's. Signature, SECURITY INVOKER, search_path,
-- grants and the comment's other words are 206's.
--
-- Additive in effect: one function replaced in place. No password, key or DSN is in this file.

do $$
begin
  if to_regprocedure('public.workspace_proposal_decide(bigint, text, jsonb)') is null then
    raise exception '208: workspace_proposal_decide(bigint, text, jsonb) does not exist; apply 206 first';
  end if;
end $$;

create or replace function public.workspace_proposal_decide(p_id bigint, p_decision text, p_value jsonb default null)
  returns table (state text, applied boolean)
  language plpgsql security invoker set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v         workspace_proposals%rowtype;
  v_now     jsonb;
  v_found   boolean;
  v_fact    boolean;
  v_state   text;
  v_applied boolean := false;
  v_write   jsonb;   -- the value an approval writes: Stack's edit (p_value) or new_value (W-106)
  v_text    text;
  v_was     jsonb;   -- the value 204 read, a status with no row read as not_started (R2-4)
begin
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'workspace_proposal_decide: the decision must be approve or reject' using errcode = '22023';
  end if;
  if p_value is not null and p_decision <> 'approve' then
    raise exception 'workspace_proposal_decide: an edited value is taken only with approve' using errcode = '22023';
  end if;

  select * into v from workspace_proposals w where w.id = p_id for update;
  if not found then
    raise exception 'workspace_proposal_decide: there is no proposal %', coalesce(p_id::text, 'null')
      using errcode = '22023';
  end if;
  if v.state <> 'proposed' then
    -- 208: the same refusal, carried by PostgREST as HTTP 409 with code 55000 in the body.
    raise sqlstate 'PGRST' using
      message = json_build_object('code', '55000', 'message', format('proposal %s is already %s', p_id, v.state),
                                  'details', null, 'hint', null)::text,
      detail = '{"status": 409, "headers": {}}';
  end if;

  -- Stack's edit, on an approval that can still be made: it fits the field by 204's rule, or the call
  -- is refused (22023) and nothing changes.
  v_write := v.new_value;
  if p_value is not null and p_decision = 'approve' and now() < v.expires_at then
    v_write := workspace_proposal_value_check(v.target, v.field, p_value);
  end if;
  v_text := v_write #>> '{}';
  v_was := coalesce(v.old_value, 'null'::jsonb);
  if v.field = 'status' and v_was = 'null'::jsonb then v_was := to_jsonb('not_started'::text); end if;
  if now() >= v.expires_at then
    v_state := 'expired';
  elsif p_decision = 'reject' then
    v_state := 'rejected';
  elsif v.target = 'assignment_progress' then
    v_fact := exists (select 1 from assignments a where a.id = v.row_id);
    select true,
           case v.field when 'status'         then to_jsonb(p.status::text)
                        when 'notes'          then to_jsonb(p.notes)
                        when 'planned_start'  then to_jsonb(to_char(p.planned_start, 'YYYY-MM-DD'))
                        when 'planned_finish' then to_jsonb(to_char(p.planned_finish, 'YYYY-MM-DD'))
           end
      into v_found, v_now
      from assignment_progress p where p.assignment_id = v.row_id
       for update;
    -- R2-4: no progress row and a row at not_started are the same status, as 204 reads it.
    v_now := coalesce(v_now, 'null'::jsonb);
    if v.field = 'status' and v_now = 'null'::jsonb then v_now := to_jsonb('not_started'::text); end if;
    if not v_fact or v_now is distinct from v_was then
      v_state := 'stale';
    elsif p_value is not null and v_write = v_now then
      raise exception 'workspace_proposal_decide: an edited value must differ from the planner''s' using errcode = '22023';
    else
      if not coalesce(v_found, false) then
        insert into assignment_progress (assignment_id) values (v.row_id);
      end if;
      -- One statement per field, so no cast of the value is ever planned for a column it is not for.
      if v.field = 'status' then
        update assignment_progress p set status = v_text::progress_status where p.assignment_id = v.row_id;
      elsif v.field = 'notes' then
        update assignment_progress p set notes = v_text where p.assignment_id = v.row_id;
      elsif v.field = 'planned_start' then
        update assignment_progress p set planned_start = v_text::date where p.assignment_id = v.row_id;
      else
        update assignment_progress p set planned_finish = v_text::date where p.assignment_id = v.row_id;
      end if;
      v_state := 'applied';
      v_applied := true;
    end if;
  else
    v_fact := exists (select 1 from readings r where r.id = v.row_id::bigint);
    select true,
           case v.field when 'status' then to_jsonb(p.status::text)
                        when 'notes'  then to_jsonb(p.notes)
           end
      into v_found, v_now
      from reading_progress p where p.reading_id = v.row_id::bigint
       for update;
    -- R2-4: no progress row and a row at not_started are the same status, as 204 reads it.
    v_now := coalesce(v_now, 'null'::jsonb);
    if v.field = 'status' and v_now = 'null'::jsonb then v_now := to_jsonb('not_started'::text); end if;
    if not v_fact or v_now is distinct from v_was then
      v_state := 'stale';
    elsif p_value is not null and v_write = v_now then
      raise exception 'workspace_proposal_decide: an edited value must differ from the planner''s' using errcode = '22023';
    else
      if not coalesce(v_found, false) then
        insert into reading_progress (reading_id) values (v.row_id::bigint);
      end if;
      if v.field = 'status' then
        update reading_progress p set status = v_text::progress_status where p.reading_id = v.row_id::bigint;
      else
        update reading_progress p set notes = v_text where p.reading_id = v.row_id::bigint;
      end if;
      v_state := 'applied';
      v_applied := true;
    end if;
  end if;

  -- approved_value: what was written (W-106), only on applied (203's check).
  update workspace_proposals w
     set state = v_state, decided_at = now(), approved_value = case when v_applied then v_write end
   where w.id = p_id;

  update attention_items a
     set state = 'resolved', resolved_at = now(),
         resolution = jsonb_build_object('outcome', v_state, 'proposal_id', p_id,
                                         'edited', v_applied and p_value is not null)
   where a.workspace_proposal_id = p_id and a.state = 'open';

  return query select v_state, v_applied;
end $$;

comment on function public.workspace_proposal_decide(bigint, text, jsonb) is
  'Stack decides one planner proposal (migration 206, Phase 25b; refusal as 409 since 208), from the '
  'Workspace card or the Inbox item, which call nothing else. SECURITY INVOKER: it runs under his own row '
  'security. p_decision is approve or reject (22023 otherwise). Locks the proposal; refuses one not '
  'proposed with SQLSTATE PGRST, message {"code":"55000","message":"proposal <id> is already <state>"} and '
  'detail {"status":409}, which PostgREST sends as HTTP 409 with code 55000; writes expired past '
  'expires_at; reject -> rejected; approve re-reads the planner value and writes the one field (inserting '
  'the progress row when there is none) -> applied, or writes nothing -> stale when the value changed or '
  'the item is gone. p_value (W-106) is Stack''s edit of the proposed value, taken only with approve '
  '(22023 otherwise): it must fit the field (workspace_proposal_value_check) and differ from the '
  'planner''s value (22023), and is written instead of new_value. Sets decided_at and approved_value (the '
  'value written, on applied only) and resolves the Inbox item with {outcome, proposal_id, edited}. '
  'Returns (state, applied). authenticated only.';

revoke all on function public.workspace_proposal_decide(bigint, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.workspace_proposal_decide(bigint, text, jsonb) to authenticated;

do $$
declare
  f     constant text := 'public.workspace_proposal_decide(bigint, text, jsonb)';
  v_src text;
  v_bad text;
begin
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'workspace_proposal_decide') <> 1 then
    raise exception 'FAIL 208: workspace_proposal_decide has more than one signature';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and not p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 208: workspace_proposal_decide is not SECURITY INVOKER with search_path pinned';
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from 'TABLE(state text, applied boolean)' then
    raise exception 'FAIL 208: workspace_proposal_decide returns %', pg_get_function_result(f::regprocedure);
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = f::regprocedure;
  if v_src not like '%raise sqlstate ''PGRST''%"status": 409%' or v_src like '%errcode = ''55000''%' then
    raise exception 'FAIL 208: the refusal is not the PGRST 409 form';
  end if;
  if not has_function_privilege('authenticated', f, 'execute') then
    raise exception 'FAIL 208: authenticated cannot execute workspace_proposal_decide';
  end if;
  select string_agg(w.who, ', ' order by w.who) into v_bad
    from (values ('public'), ('anon'), ('service_role'), ('workspace_runner'), ('inbox_apply_runner'),
                 ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_bad is not null then
    raise exception 'FAIL 208: workspace_proposal_decide is executable beyond authenticated: %', v_bad;
  end if;
end $$;
