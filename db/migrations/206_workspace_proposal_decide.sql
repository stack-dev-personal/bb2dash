-- bb2dash :: db/migrations/206_workspace_proposal_decide.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E; the frozen contract
-- `119b_PHASE25B_contract.md`, "206". Worker W-104a.
--
-- WHY. Stack decides a proposal on the answer or in the Inbox (answer 7), and both places call this one
-- function and nothing else, so neither can disagree with the other. It runs as Stack (SECURITY
-- INVOKER), under the row security he already has on workspace_proposals (203), attention_items (031)
-- and the two planner tables: the write to the planner is his own, as any planner edit is.
--
-- WHAT
--   workspace_proposal_decide(p_id bigint, p_decision text) returns table(state text, applied boolean)
--
--   In one transaction: p_decision must be approve or reject (22023); the proposal is locked (for
--   update; one the caller cannot see does not exist for him, 22023); one no longer `proposed` is
--   refused with 55000 and "proposal <id> is already <state>"; one past expires_at is written `expired`
--   and returns (expired, false), whatever was asked. Reject writes `rejected`. Approve re-reads the
--   planner value (for update) the way 204 read it: when it differs from old_value, or the assignment or
--   reading no longer exists, the proposal is `stale` and nothing is written; when it is equal the one
--   field is written (the progress row inserted first when there is none) and the proposal is `applied`.
--   For a status, no progress row and a row at not_started are the same value, on both tables, as 204
--   reads them (119a R2-4): a row Stack created since (a note, say) does not make a status proposal stale.
--   Then decided_at = now(), and the Inbox item is resolved: state resolved, resolved_at = now(),
--   resolution = {outcome: <state>, proposal_id}.
--
-- THE INBOX-APPLY LOG. 181's trigger `assignment_progress_inbox_apply_log` fires only `WHEN
-- (CURRENT_USER = 'inbox_apply_runner')`. This function is SECURITY INVOKER and executable by
-- authenticated alone, so its write runs as authenticated and is never logged as an apply run's
-- (phase25b_206_decide.sql proves it on the log's row count).
--
-- THE CALENDAR PUSH. A planner write goes through assignment_progress's `set_updated_at` trigger as
-- every planner edit does (the planner's own save, `useSavePlanner`, writes the same table), so
-- updated_at moves (the unit checks it). Read on prod 2026-10-19: Google Calendar's push is armed only by
-- `assignments_mark_calendar_dirty` and `planner_events_mark_calendar_dirty`; neither progress table
-- arms it, so a planned date approved here reaches the calendar exactly as the same date typed in the
-- planner does.
--
-- THE RUNNER'S PROOF VIEW (PM round 2). Pack 25's proof `runner-grants` reads no pg_* relation, so
-- `v_workspace_runner_proof` hands the catalog's answers out as four plain columns, as 199's
-- v_workspace_store_proof does for pack 24 (same options and grants): definer_functions (the SECURITY
-- DEFINER functions of public workspace_runner can execute: 14 since 204), executes_propose,
-- relations_granted (public tables, views, materialized views, foreign tables and sequences on which it
-- holds any privilege, on the relation or a column: 0) and relations_checked (how many were asked about).
--
-- Additive: one function and one view. No password, key or DSN is in this file.

do $$
begin
  if to_regclass('public.v_workspace_proposals') is null
     or not exists (select 1 from pg_attribute a
                     where a.attrelid = 'public.attention_items'::regclass
                       and a.attname = 'workspace_proposal_id' and not a.attisdropped) then
    raise exception '206: v_workspace_proposals or attention_items.workspace_proposal_id does not exist; apply 205 first';
  end if;
  if to_regprocedure('public.workspace_proposal_decide(bigint, text)') is not null then
    raise exception '206: workspace_proposal_decide already exists';
  end if;
  if to_regclass('public.v_workspace_runner_proof') is not null then
    raise exception '206: v_workspace_runner_proof already exists';
  end if;
end $$;

create function public.workspace_proposal_decide(p_id bigint, p_decision text)
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
  v_text    text;
  v_was     jsonb;   -- the value 204 read, a status with no row read as not_started (R2-4)
begin
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'workspace_proposal_decide: the decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v from workspace_proposals w where w.id = p_id for update;
  if not found then
    raise exception 'workspace_proposal_decide: there is no proposal %', coalesce(p_id::text, 'null')
      using errcode = '22023';
  end if;
  if v.state <> 'proposed' then
    raise exception 'proposal % is already %', p_id, v.state using errcode = '55000';
  end if;

  v_text := v.new_value #>> '{}';
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

  update workspace_proposals w set state = v_state, decided_at = now() where w.id = p_id;

  update attention_items a
     set state = 'resolved', resolved_at = now(),
         resolution = jsonb_build_object('outcome', v_state, 'proposal_id', p_id)
   where a.workspace_proposal_id = p_id and a.state = 'open';

  return query select v_state, v_applied;
end $$;

comment on function public.workspace_proposal_decide(bigint, text) is
  'Stack decides one planner proposal (migration 206, Phase 25b), from the Workspace card or the Inbox '
  'item, which call nothing else. SECURITY INVOKER: it runs under his own row security. p_decision is '
  'approve or reject (22023 otherwise). Locks the proposal; refuses one not proposed with 55000 '
  '"proposal <id> is already <state>"; writes expired past expires_at; reject -> rejected; approve '
  're-reads the planner value and writes the one field (inserting the progress row when there is none) '
  '-> applied, or writes nothing -> stale when the value changed or the item is gone. Sets decided_at and '
  'resolves the Inbox item with {outcome, proposal_id}. Returns (state, applied). authenticated only.';

-- =============================================================================================
-- v_workspace_runner_proof: pack 25's runner-grants proof as one row of plain columns
-- =============================================================================================
-- The has_*_privilege expressions are 204's guard's, so the view and the guard can never disagree.
create view public.v_workspace_runner_proof
  with (security_invoker = true) as
select f.definer_functions,
       f.executes_propose,
       r.relations_granted,
       r.relations_checked
  from (select (select count(*) from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.prosecdef
                   and has_function_privilege('workspace_runner', p.oid, 'execute'))::integer as definer_functions,
               coalesce(has_function_privilege('workspace_runner',
                 to_regprocedure('public.workspace_propose(bigint, text, text, text, text, jsonb, text)'), 'execute'),
                 false) as executes_propose) f
 cross join (select count(*) filter (
                      where case when c.relkind = 'S'
                                 then has_sequence_privilege('workspace_runner', c.oid, 'usage,select,update')
                                 else has_table_privilege('workspace_runner', c.oid,
                                                          'select,insert,update,delete,truncate,references,trigger')
                                      or has_any_column_privilege('workspace_runner', c.oid,
                                                                  'select,insert,update,references')
                            end)::integer as relations_granted,
                    count(*)::integer as relations_checked
               from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')) r;

comment on view public.v_workspace_runner_proof is
  'One row (migration 206): the catalog answers of pack 25''s runner-grants proof as plain columns, for '
  'the acceptance run, which cannot read pg_* relations. definer_functions (SECURITY DEFINER functions '
  'of public that workspace_runner can execute; 14 since 204), executes_propose, relations_granted '
  '(public tables, views, materialized views, foreign tables and sequences on which workspace_runner '
  'holds any privilege, on the relation or a column; 0) and relations_checked. No row of any table. '
  'security_invoker with anon revoked, as 036 requires.';

revoke all on public.v_workspace_runner_proof from public, anon, authenticated;
grant select on public.v_workspace_runner_proof to service_role;

-- =============================================================================================
-- Privileges and the guard
-- =============================================================================================
revoke all on function public.workspace_proposal_decide(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_proposal_decide(bigint, text) to authenticated;

do $$
declare
  f     constant text := 'public.workspace_proposal_decide(bigint, text)';
  v_bad text;
begin
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and not p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 206: workspace_proposal_decide is not SECURITY INVOKER with search_path pinned';
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from 'TABLE(state text, applied boolean)' then
    raise exception 'FAIL 206: workspace_proposal_decide returns %', pg_get_function_result(f::regprocedure);
  end if;
  if not has_function_privilege('authenticated', f, 'execute') then
    raise exception 'FAIL 206: authenticated cannot execute workspace_proposal_decide';
  end if;
  select string_agg(w.who, ', ' order by w.who) into v_bad
    from (values ('public'), ('anon'), ('service_role'), ('workspace_runner'), ('inbox_apply_runner'),
                 ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_bad is not null then
    raise exception 'FAIL 206: workspace_proposal_decide is executable beyond authenticated: %', v_bad;
  end if;
  -- The 181 log trigger still fires only for the apply role, so this function's write is never logged.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.assignment_progress'::regclass
                    and t.tgname = 'assignment_progress_inbox_apply_log'
                    and pg_get_triggerdef(t.oid) like '%WHEN ((CURRENT_USER = ''inbox_apply_runner''::name))%') then
    raise exception 'FAIL 206: assignment_progress_inbox_apply_log no longer fires for inbox_apply_runner alone';
  end if;
  -- The proof view: its answer now, its options and its grants (199's for v_workspace_store_proof).
  if (select v.definer_functions <> 14 or not v.executes_propose or v.relations_granted <> 0 or v.relations_checked < 1
        from public.v_workspace_runner_proof v) then
    raise exception 'FAIL 206: v_workspace_runner_proof reads %',
      (select to_jsonb(v) from public.v_workspace_runner_proof v);
  end if;
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_runner_proof'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false
     or has_table_privilege('anon', 'public.v_workspace_runner_proof', 'select')
     or has_table_privilege('authenticated', 'public.v_workspace_runner_proof', 'select')
     or has_table_privilege('workspace_runner', 'public.v_workspace_runner_proof', 'select')
     or not has_table_privilege('service_role', 'public.v_workspace_runner_proof', 'select') then
    raise exception 'FAIL 206: v_workspace_runner_proof is not security_invoker and readable by service_role alone among the clients';
  end if;
end $$;
