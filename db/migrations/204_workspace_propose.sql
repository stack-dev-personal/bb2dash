-- bb2dash :: db/migrations/204_workspace_propose.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E; the frozen contract
-- `119b_PHASE25B_contract.md`, "204". Worker W-104a.
--
-- WHY. The runner never writes the planner; it files a proposal. This is the one way a proposal row
-- (203) and its Inbox item come to exist, and the one way the runner reaches 203 at all: the runner's
-- login holds no table grant, and this SECURITY DEFINER function is its fourteenth.
--
-- WHAT
--   workspace_propose(p_request_id, p_runner, p_target, p_row_id, p_field, p_value, p_reason)
--     returns table(proposal_id, label, old_value, new_value): the row the tool shows the model.
--
-- THE CHECKS, in this order. Every refusal is 22023 unless named, and leaves nothing behind.
--   1. the request is claimed by p_runner, read as workspace_turn_put reads it (199), with the request
--      row locked until the transaction ends, so two calls of one turn are counted one after the other;
--   2. the target is assignment_progress or reading_progress, and the field is status or notes, or
--      planned_start or planned_finish on an assignment;
--   3. the FACT row exists (assignments.id, or readings.id from a whole number), not the progress row:
--      a planner row is made on approval when there is none;
--   4. the value fits the field: a JSON string that is a label of progress_status; a real calendar date
--      written YYYY-MM-DD; a note of 1 to 2,000 characters that is not only blanks;
--   5. the reason is 1 to 500 characters, not only blanks;
--   6. the value is not the one the planner shows now. The old value is read here, never supplied: the
--      progress row's field as a JSON string, JSON null when there is no row or the field is empty. A
--      status with no progress row is shown as not started, so not_started is a no-op there too;
--   7. the request holds fewer than five proposals (54000);
--   8. the same (request, target, row, field) is not proposed twice.
-- Then, in the same transaction, one proposal row and one Inbox item: kind assistant_proposal, open,
-- the fact row's course, entity = the target, ref = 'workspace_proposal/<id>', the field, from_value =
-- the old value, to_value = the new one, a plain question, suggested = {source: 'workspace',
-- proposal_id, conversation_id, request_id, reason}, workspace_proposal_id = the id.
--
-- ORDER WITH 205. The Inbox item's kind and its column `workspace_proposal_id` are 205's. PL/pgSQL
-- checks a body's names when it runs, not when it is created, so this file is applied before 205 and
-- the function only works once 205 is on; nothing calls it before the cut-over's `workspace` rebuild,
-- which comes after 206. Its unit (phase25b_204_propose.sql) is run with 205 applied.
--
-- workspace_runner goes from THIRTEEN SECURITY DEFINER functions (202) to FOURTEEN and still holds no
-- grant on any table, view or sequence (guard below). Additive: one new function. No password, key or
-- DSN is in this file.

do $$
begin
  if to_regclass('public.workspace_proposals') is null then
    raise exception '204: workspace_proposals does not exist; apply 203 first';
  end if;
  if to_regprocedure('public.workspace_claim_v3(text, integer)') is null then
    raise exception '204: workspace_claim_v3 does not exist; apply 202 first';
  end if;
  if to_regprocedure('public.workspace_propose(bigint, text, text, text, text, jsonb, text)') is not null then
    raise exception '204: workspace_propose already exists';
  end if;
end $$;

create function public.workspace_propose(
    p_request_id bigint, p_runner text, p_target text, p_row_id text, p_field text,
    p_value jsonb, p_reason text)
  returns table (proposal_id bigint, label text, old_value jsonb, new_value jsonb)
  language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  c_max_per_request constant integer := 5;
  c_note_max        constant integer := 2000;
  c_reason_max      constant integer := 500;
  c_question_label  constant integer := 200;
  c_date_shape      constant text    := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  c_reading_id      constant text    := '^[1-9][0-9]{0,17}$';
  v_state    text;
  v_by       text;
  v_conv     uuid;
  v_course   text;
  v_label    text;
  v_exists   boolean;
  v_old      jsonb;
  v_text     text;
  v_shown    text;
  v_id       bigint;
  v_question text;
  v_short    text;
  v_date     date;
begin
  -- 1. The request is the caller's own claim, held until this transaction ends.
  select r.state, r.claimed_by, r.conversation_id into v_state, v_by, v_conv
    from workspace_requests r where r.id = p_request_id
     for update;
  if not found or v_state <> 'claimed' or v_by is distinct from p_runner then
    raise exception 'workspace_propose: request % is not claimed by %', coalesce(p_request_id::text, 'null'),
      coalesce(p_runner, 'null') using errcode = '22023';
  end if;

  -- 2. The target and the field.
  if p_target is null or p_target not in ('assignment_progress', 'reading_progress') then
    raise exception 'workspace_propose: the target must be assignment_progress or reading_progress'
      using errcode = '22023';
  end if;
  if p_field is null
     or not (p_field in ('status', 'notes')
             or (p_target = 'assignment_progress' and p_field in ('planned_start', 'planned_finish'))) then
    raise exception 'workspace_propose: % cannot be proposed on %', coalesce(p_field, 'null'), p_target
      using errcode = '22023';
  end if;

  -- 3. The fact row, its course and its label; and the progress row's value as the planner holds it.
  if p_target = 'assignment_progress' then
    select a.course_id, a.title into v_course, v_label from assignments a where a.id = p_row_id;
    if not found then
      raise exception 'workspace_propose: there is no assignment %', coalesce(p_row_id, 'null') using errcode = '22023';
    end if;
    select true,
           case p_field when 'status'         then to_jsonb(p.status::text)
                        when 'notes'          then to_jsonb(p.notes)
                        when 'planned_start'  then to_jsonb(to_char(p.planned_start, 'YYYY-MM-DD'))
                        when 'planned_finish' then to_jsonb(to_char(p.planned_finish, 'YYYY-MM-DD'))
           end
      into v_exists, v_old
      from assignment_progress p where p.assignment_id = p_row_id;
  else
    if p_row_id is null or p_row_id !~ c_reading_id then
      raise exception 'workspace_propose: a reading is named by its whole-number id, not %', coalesce(p_row_id, 'null')
        using errcode = '22023';
    end if;
    select r.course_id, r.citation into v_course, v_label from readings r where r.id = p_row_id::bigint;
    if not found then
      raise exception 'workspace_propose: there is no reading %', p_row_id using errcode = '22023';
    end if;
    select true,
           case p_field when 'status' then to_jsonb(p.status::text)
                        when 'notes'  then to_jsonb(p.notes)
           end
      into v_exists, v_old
      from reading_progress p where p.reading_id = p_row_id::bigint;
  end if;
  v_exists := coalesce(v_exists, false);
  v_old := coalesce(v_old, 'null'::jsonb);

  -- 4. The value fits the field.
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    raise exception 'workspace_propose: the value must be a JSON string' using errcode = '22023';
  end if;
  v_text := p_value #>> '{}';
  if p_field = 'status' then
    if not (v_text = any (enum_range(null::progress_status)::text[])) then
      raise exception 'workspace_propose: % is not a planner status', left(v_text, 40) using errcode = '22023';
    end if;
  elsif p_field in ('planned_start', 'planned_finish') then
    v_date := null;
    if v_text ~ c_date_shape then
      begin
        v_date := v_text::date;
      exception when others then
        v_date := null;   -- 2026-02-30 and the like: not a calendar date
      end;
    end if;
    if v_date is null or to_char(v_date, 'YYYY-MM-DD') <> v_text then
      raise exception 'workspace_propose: a planned date is written YYYY-MM-DD and must be a real date, not %',
        left(v_text, 40) using errcode = '22023';
    end if;
  else
    if btrim(v_text) = '' or char_length(v_text) > c_note_max then
      raise exception 'workspace_propose: a note is 1 to % characters and not only blanks', c_note_max
        using errcode = '22023';
    end if;
  end if;

  -- 5. The reason.
  if p_reason is null or btrim(p_reason) = '' or char_length(p_reason) > c_reason_max then
    raise exception 'workspace_propose: the reason is 1 to % characters and not only blanks', c_reason_max
      using errcode = '22023';
  end if;

  -- 6. Not the value the planner shows now.
  if p_value = v_old or (p_field = 'status' and not v_exists and v_text = 'not_started') then
    raise exception 'workspace_propose: the % of % already is that value', p_field, p_row_id using errcode = '22023';
  end if;

  -- 7. Five a turn at most.
  if (select count(*) from workspace_proposals w where w.request_id = p_request_id) >= c_max_per_request then
    raise exception 'workspace_propose: request % already holds % proposals', p_request_id, c_max_per_request
      using errcode = '54000';
  end if;

  -- 8. One proposal per field of a row per turn.
  if exists (select 1 from workspace_proposals w
              where w.request_id = p_request_id and w.target = p_target and w.row_id = p_row_id
                and w.field = p_field) then
    raise exception 'workspace_propose: the % of % is already proposed in this turn', p_field, p_row_id
      using errcode = '22023';
  end if;

  insert into workspace_proposals as w
         (request_id, conversation_id, target, row_id, course_id, label, field, old_value, new_value, reason)
  values (p_request_id, v_conv, p_target, p_row_id, v_course, v_label, p_field, v_old, p_value, p_reason)
  returning w.id into v_id;

  -- The Inbox item: one plain sentence from the label, the field and the two values.
  v_shown := case when v_old = 'null'::jsonb then null else v_old #>> '{}' end;
  v_short := left(v_label, c_question_label);
  v_question := case p_field
    when 'status' then format('The Workspace assistant proposes marking "%s" as %s (now %s).', v_short,
                              replace(v_text, '_', ' '), replace(coalesce(v_shown, 'not_started'), '_', ' '))
    when 'notes' then format('The Workspace assistant proposes replacing the note on "%s".', v_short)
    else format('The Workspace assistant proposes setting the planned %s of "%s" to %s (now %s).',
                case p_field when 'planned_start' then 'start' else 'finish' end, v_short, v_text,
                coalesce(v_shown, 'not set'))
  end;

  insert into attention_items
         (kind, state, course_id, entity, ref, field, from_value, to_value, question, suggested,
          workspace_proposal_id)
  values ('assistant_proposal', 'open', v_course, p_target, 'workspace_proposal/' || v_id, p_field, v_old, p_value,
          v_question,
          jsonb_build_object('source', 'workspace', 'proposal_id', v_id, 'conversation_id', v_conv,
                             'request_id', p_request_id, 'reason', p_reason),
          v_id);

  return query select v_id, v_label, v_old, p_value;
end $$;

comment on function public.workspace_propose(bigint, text, text, text, text, jsonb, text) is
  'The Workspace runner files one planner proposal (migration 204, Phase 25b): for a request claimed by '
  'p_runner, one change of status or notes on an assignment or reading, or of planned_start or '
  'planned_finish on an assignment. Reads the old value itself; refuses (22023) a request not claimed '
  'by p_runner, a target or field outside the list, a fact row that does not exist, a value that does '
  'not fit the field (a progress_status label, a real YYYY-MM-DD date, a note of 1 to 2,000 characters), '
  'a reason outside 1 to 500 characters, a value equal to the one shown, and a second proposal of the '
  'same field of a row in one request; refuses a sixth proposal of a request with 54000. Inserts the '
  'workspace_proposals row and its open assistant_proposal Inbox item in the same transaction and '
  'returns (proposal_id, label, old_value, new_value). Writes no planner row. workspace_runner only.';

-- =============================================================================================
-- Privileges and the guard
-- =============================================================================================
revoke all on function public.workspace_propose(bigint, text, text, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_propose(bigint, text, text, text, text, jsonb, text) to workspace_runner;

do $$
declare
  f     constant text := 'public.workspace_propose(bigint, text, text, text, text, jsonb, text)';
  v_got text;
  v_bad text;
begin
  -- (a) The fourteen are exactly the SECURITY DEFINER functions workspace_runner can execute.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_claim_v3,workspace_finish,'
     'workspace_heartbeat,workspace_job_claim,workspace_job_finish,workspace_planner_feed,'
     'workspace_propose,workspace_search_timing,workspace_stream,workspace_turn_context,workspace_turn_put' then
    raise exception 'FAIL 204: workspace_runner executes SECURITY DEFINER functions %, expected the fourteen', v_got;
  end if;

  -- (b) Still no table, view or sequence privilege in public, on a relation or on a column.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('workspace_runner', c.oid, 'usage,select,update')
               else has_table_privilege('workspace_runner', c.oid,
                                        'select,insert,update,delete,truncate,references,trigger')
                    or has_any_column_privilege('workspace_runner', c.oid, 'select,insert,update,references')
          end);
  if v_bad is not null then
    raise exception 'FAIL 204: workspace_runner holds a privilege on %', v_bad;
  end if;

  -- (c) SECURITY DEFINER of postgres with a pinned path, its result, and executable by workspace_runner alone.
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef and p.proowner = 'postgres'::regrole
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 204: workspace_propose is not a SECURITY DEFINER of postgres with search_path pinned';
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from
     'TABLE(proposal_id bigint, label text, old_value jsonb, new_value jsonb)' then
    raise exception 'FAIL 204: workspace_propose returns %', pg_get_function_result(f::regprocedure);
  end if;
  select string_agg(w.who, ', ' order by w.who) into v_bad
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('sync_runner'),
                 ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, f, 'execute');
  if v_bad is not null then
    raise exception 'FAIL 204: workspace_propose is executable beyond workspace_runner: %', v_bad;
  end if;
end $$;
