-- bb2dash :: db/migrations/205_assistant_proposal_inbox_kind.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E; the frozen contract
-- `119b_PHASE25B_contract.md`, "205". Worker W-104a.
--
-- WHY. Stack's answer 7: a proposal is approved on the answer OR in the Inbox, and a decision in one
-- place shows in the other. So each proposal is also an Inbox item (204 files it), of a new kind,
-- `assistant_proposal`. Nothing on the apply side may ever see that kind: the Inbox auto-apply (the
-- `apply` container, `/inbox-apply`), the decision filing and the sync's `inbox_feedback` filing act on
-- answered Inbox items, and a proposal is decided by 206 alone, which writes the planner as Stack.
--
-- WHAT
--   1. attention_items: the kind check (031's `attention_items_kind_check`, dropped and added again
--      under the same name) gains `assistant_proposal`; a nullable `workspace_proposal_id` -> 203, unique
--      where set; a check that the column is set exactly on that kind.
--   2. The readers of answered Inbox items that a proposal could reach leave it out (the audit below).
--   3. v_workspace_proposals (security_invoker): every column of 203, effective_state, and the Inbox
--      item's id and state.
--   4. workspace_proposals_expire() and the hourly pg_cron job `bb2dash-proposals-expire` (119a, PM
--      rulings 25b): the Inbox count and Home read attention_items, so an expired proposal must stop
--      being an open item, not only read as expired through the view.
--   5. a guard block over what this file states.
--
-- THE AUDIT (2026-10-19, every reader of attention_items read on prod with pg_get_functiondef /
-- pg_get_viewdef, read-only). "Reached" = an assistant_proposal row, open or resolved by 206 or by the
-- sweep, can come into what it reads or writes.
--
--   reader                         reached?  why / what this file does
--   -----------------------------  --------  -----------------------------------------------------------
--   v_inbox_queue (090)            YES       every resolved/dismissed row: REDEFINED, kind left out. It is
--                                            the apply side's one queue: inbox_apply_prepare (the worker's
--                                            and the skill's batch), inbox_apply_held_items,
--                                            inbox_apply_run_facts' left_ids, sync_request_inbox_apply
--                                            (the sync's inbox_feedback filing), the page's "Answered,
--                                            not applied" and the Apply answers count all read it
--   policy attention_items_        YES       inbox_apply_runner read every row (`true`), so its `query`
--     inbox_apply_read (181)                 tool could select a proposal: REDEFINED, kind left out
--   inbox_apply_begin_item (181)   YES       takes any resolved/dismissed id: REDEFINED, a proposal is
--                                            refused as one taken back (false)
--   inbox_apply_log_write (181)    YES       the item named in inbox_apply.item may be any answered row:
--                                            REDEFINED, a proposal is not an item a write may name
--   inbox_apply_archive (181/186)  YES       locks any resolved/dismissed id: REDEFINED, false for a
--                                            proposal, nothing archived
--   archive_attention_item (090)   YES       archives any resolved/dismissed id: REDEFINED, refuses a
--                                            proposal (P0002, the class it already raised); a decided
--                                            proposal stays resolved and is never archived
--   inbox_decisions_unfiled (182)  YES*      archived rows with an inbox-decision/1 record; a proposal is
--   inbox_decisions_unlogged (182) YES*      never archived now, but the owner's own row security can
--                                            still write any row: REDEFINED, kind left out (*belt)
--   run_transform (035 ... 212)    YES       counts every row before and after a fold, so a proposal
--                                            filed during a fold was counted in `attention_raised`:
--                                            REDEFINED (212's live body), both counts leave the kind out
--   inbox_decision_filed/_logged/  no        act by id on what unfiled/unlogged list, and only on an
--     _skipped (182, 187)                    archived row with an inbox-decision/1 record: never a proposal
--   inbox_apply_run_facts (186)    no        archived_by = the request (archive refuses a proposal),
--                                            writes logged (the log refuses one), left_ids from the view
--   inbox_apply_prepare / _held_   no        read v_inbox_queue only (redefined above)
--     items / sync_request_inbox_
--     apply (181, 187)
--   inbox_apply_claim / _is_own_   no        agent_requests only
--     claim, sync_sweep_stale
--   apply_resolutions (042)        no        kind in (conflict, stack_must_confirm, missing) only
--   attention_answered (041, 114)  no        filters on the kind its caller passes; every caller
--                                            (raise_attention, stage_gaps) passes missing or data_gap
--   attention_keep_stands          no        kind = conflict only
--   raise_attention (041)          no        inserts the caller's kind; no caller passes this one, and a
--                                            proposal's ref 'workspace_proposal/<id>' is its own key
--   close_cleared_gaps (114, 164)  no        every rule needs kind missing or data_gap
--   stage_gaps (054, 114, 164)     no        inserts missing/data_gap; asks attention_answered for those
--   sync_login_ok / _required      no        kind stack_must_confirm, ref sync-login-required
--   link_file_sessions,            no        kind stack_must_confirm, entity bb_file, their own refs
--     link_reading_files,
--     supersede_replaced_files
--   announcement_review_record     no        open conflict / deadline / stack_must_confirm by its refs
--   inbox_accept_question (186)    no        entity agent_request, ref accept/%
--   v_sync_status (137)            no*       open_attention counts OPEN rows by kind for Home; an open
--                                            proposal is waiting for Stack and is counted there (the page
--                                            names the kind "proposal"); an expired one is resolved by
--                                            the sweep, so it stops counting. Not an apply-side reader
--                                            (*kept on purpose; the PM's ruling on expiry assumes it)
--
-- The redefined functions keep their signatures, owners, grants and SECURITY settings (`create or
-- replace` keeps a function's ACL); each body is the live one with the lines marked 205 added. The
-- redefined view keeps 090's columns and its grants; its options are written out (143's note).
--
-- Additive in the sense of the SOP: one column, one index, two checks, one policy and five functions
-- restated, one view, one function and one cron job new. No row is changed. No password, key or DSN.

do $$
begin
  if to_regclass('public.workspace_proposals') is null then
    raise exception '205: workspace_proposals does not exist; apply 203 first';
  end if;
  if to_regprocedure('public.workspace_propose(bigint, text, text, text, text, jsonb, text)') is null then
    raise exception '205: workspace_propose does not exist; apply 204 first';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.attention_items'::regclass
                    and c.conname = 'attention_items_kind_check') then
    raise exception '205: attention_items_kind_check does not exist';
  end if;
  if to_regnamespace('cron') is null then
    raise exception '205: pg_cron is not installed (035 installs it)';
  end if;
end $$;

-- =============================================================================================
-- 1. attention_items: the kind, the link column, its index and its check
-- =============================================================================================
alter table public.attention_items drop constraint attention_items_kind_check;
alter table public.attention_items add constraint attention_items_kind_check
  check (kind in ('conflict', 'missing', 'stack_must_confirm', 'deadline', 'data_gap', 'assistant_proposal'));

alter table public.attention_items
  add column workspace_proposal_id bigint references public.workspace_proposals (id);

create unique index attention_items_workspace_proposal_idx
  on public.attention_items (workspace_proposal_id)
  where workspace_proposal_id is not null;

-- Every existing row is another kind with the column null, so the check holds as it is added.
alter table public.attention_items add constraint attention_items_proposal_link
  check ((kind = 'assistant_proposal') = (workspace_proposal_id is not null));

comment on column public.attention_items.workspace_proposal_id is
  'The proposal (workspace_proposals, 203) an assistant_proposal item stands for (migration 205); null '
  'on every other kind. 204 files the item, 206 or the expiry sweep resolves it with resolution = '
  '{outcome, proposal_id}. No apply-side reader ever sees this kind.';

-- =============================================================================================
-- 2. The readers that leave the kind out
-- =============================================================================================

-- 2a. v_inbox_queue: 090's columns; the apply side's queue never holds a proposal.
create or replace view public.v_inbox_queue
  with (security_invoker = true) as
select ai.id,
       ai.kind,
       ai.course_id,
       ai.entity,
       ai.ref,
       ai.field,
       ai.question,
       ai.from_value,
       ai.to_value,
       ai.suggested,
       ai.state,
       ai.resolution,
       (ai.resolution ->> 'accept')                     as accept,
       ai.resolution_note                               as feedback,
       (coalesce(btrim(ai.resolution_note), '') <> '') as has_note,
       ai.raised_at,
       ai.raised_by                                     as raised_by_sync_run,
       ai.resolved_at,
       ai.applied_at,
       (ai.applied_at is not null)                      as was_applied
  from public.attention_items ai
 where ai.state in ('resolved', 'dismissed')
   and ai.kind <> 'assistant_proposal';   -- 205

comment on view public.v_inbox_queue is
  'The Inbox''s answered queue (migration 090; 205 leaves out assistant_proposal): every resolved or '
  'dismissed attention_items row not archived yet, which /inbox-apply and the apply worker act on and '
  'archive. A proposal is decided by workspace_proposal_decide (206) and is never in it.';

-- 2b. inbox_apply_runner reads every row but a proposal.
drop policy attention_items_inbox_apply_read on public.attention_items;
create policy attention_items_inbox_apply_read on public.attention_items
  for select to inbox_apply_runner
  using (kind <> 'assistant_proposal');   -- 205

-- 2c. inbox_apply_begin_item: a proposal is never an item the worker writes for.
create or replace function public.inbox_apply_begin_item(p_request bigint, p_item bigint)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_begin_item: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  -- The lock holds until the caller's transaction ends, so an Undo in the app waits for it.
  perform 1 from attention_items i
    where i.id = p_item and i.state in ('resolved', 'dismissed')
      and i.kind <> 'assistant_proposal'   -- 205: decided by 206, never applied
    for update;
  if not found then
    -- Taken back (Undo) or archived since the batch was read: the caller skips it.
    perform set_config('inbox_apply.item', '', true);
    return false;
  end if;

  perform set_config('inbox_apply.item', p_item::text, true);
  perform set_config('inbox_apply.request', p_request::text, true);
  return true;
end $function$;

-- 2d. inbox_apply_log_write: a write may never name a proposal.
create or replace function public.inbox_apply_log_write()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item    bigint;
  v_request bigint;
  v_new     jsonb := to_jsonb(new);
  v_old     jsonb;
begin
  -- Invoker rights on purpose: this runs as inbox_apply_runner (the trigger's WHEN), with the
  -- role's own select on attention_items and insert on the log.
  begin
    v_item    := nullif(current_setting('inbox_apply.item', true), '')::bigint;
    v_request := nullif(current_setting('inbox_apply.request', true), '')::bigint;
  exception when others then
    v_item := null;
  end;
  if v_item is null or not exists (
       select 1 from attention_items i where i.id = v_item and i.state in ('resolved', 'dismissed')
          and i.kind <> 'assistant_proposal') then   -- 205
    raise exception 'inbox_apply_log_write: a write to % must name an answered Inbox item; call inbox_apply_begin_item first',
      tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  insert into inbox_apply_writes (request_id, item_id, table_name, op, row_key, old_row, new_row)
  values (v_request, v_item, tg_table_name, lower(tg_op),
          coalesce(v_new->>'id', v_new->>'assignment_id'), v_old, v_new);
  return null;
end $function$;

-- 2e. inbox_apply_archive: false for a proposal, as for a row taken back.
create or replace function public.inbox_apply_archive(p_request bigint, p_item bigint, p_decision jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  c_buckets constant text[] := array['needs_change', 'applied_by_transform', 'kept', 'dismissed',
                                     'recorded_elsewhere'];
  v_wrote boolean;
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_archive: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;
  if p_item is null or p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'inbox_apply_archive: the decision must be a jsonb object' using errcode = '22023';
  end if;
  -- The shape the exporter renders (182) and the app reads (decision.change). Text, not trust.
  if p_decision->>'schema' is distinct from 'inbox-decision/1'
     or p_decision->>'item' is distinct from p_item::text
     or p_decision->>'request' is distinct from p_request::text
     or (p_decision->>'bucket' = any (c_buckets)) is not true
     or p_decision->>'mode' is distinct from 'unattended'
     or jsonb_typeof(p_decision->'change') is distinct from 'string'
     or btrim(p_decision->>'change') = ''
     or jsonb_typeof(p_decision->'rule') is distinct from 'string'
     or (p_decision ? 'sources' and jsonb_typeof(p_decision->'sources') <> 'array')
     or (p_decision ? 'flagged' and jsonb_typeof(p_decision->'flagged') not in ('object', 'null')) then
    raise exception 'inbox_apply_archive: the decision for item % is not an inbox-decision/1 record', p_item
      using errcode = '22023';
  end if;
  -- 186: the mark of a question nobody answered. On an answer it would make the transform read
  -- the answer as never given (163), so it is never this function's to store, whatever its value.
  if p_decision ? 'closed_itself' then
    raise exception 'inbox_apply_archive: the decision for item % carries closed_itself, which marks a question nobody answered', p_item
      using errcode = '22023';
  end if;

  perform 1 from attention_items i
    where i.id = p_item and i.state in ('resolved', 'dismissed')
      and i.kind <> 'assistant_proposal'   -- 205: a proposal is never archived
    for update;
  if not found then
    return false;
  end if;

  -- 042's F3 rule, read from the log and not from the caller: applied_at is stamped only when a
  -- row was actually written for this item by this request.
  select exists (select 1 from inbox_apply_writes w
                  where w.item_id = p_item and w.request_id = p_request) into v_wrote;
  if v_wrote then
    update attention_items i set applied_at = now()
     where i.id = p_item and i.applied_at is null;
  end if;

  perform archive_attention_item(p_item, p_decision, 'inbox-apply request ' || p_request);
  perform set_config('inbox_apply.item', '', true);
  return true;
end $function$;

-- 2f. archive_attention_item: a proposal is never archived, by any caller.
create or replace function public.archive_attention_item(p_id bigint, p_decision jsonb, p_by text default 'inbox-apply'::text)
 returns attention_items
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare v_row attention_items;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'archive_attention_item: decision must be a jsonb object'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_by), '') = '' then
    raise exception 'archive_attention_item: archived_by must name the worker'
      using errcode = 'check_violation';
  end if;
  -- 205: a proposal is decided by workspace_proposal_decide and stays resolved.
  if exists (select 1 from attention_items i where i.id = p_id and i.kind = 'assistant_proposal') then
    raise exception 'archive_attention_item: item % is an assistant proposal, which is never archived', p_id
      using errcode = 'no_data_found';
  end if;

  update attention_items
     set state = 'archived', archived_at = now(), archived_by = p_by, decision = p_decision
   where id = p_id and state in ('resolved', 'dismissed')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'archive_attention_item: item % is not a closed (resolved or dismissed) row', p_id
      using errcode = 'no_data_found';
  end if;
  return v_row;
end $function$;

-- 2g. The decision filing's two lists.
create or replace function public.inbox_decisions_unfiled(p_limit integer default 100)
 returns table(id bigint, kind text, course_id text, entity text, ref text, field text, question text, resolution jsonb, resolution_note text, resolved_at timestamp with time zone, applied_at timestamp with time zone, archived_at timestamp with time zone, archived_by text, decision jsonb)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select i.id, i.kind, i.course_id, i.entity, i.ref, i.field, i.question,
         i.resolution, i.resolution_note, i.resolved_at, i.applied_at,
         i.archived_at, i.archived_by, i.decision
    from attention_items i
   where i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is null
     and i.kind <> 'assistant_proposal'   -- 205
   order by i.archived_at, i.id
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

create or replace function public.inbox_decisions_unlogged(p_limit integer default 100)
 returns table(id bigint, kind text, course_id text, entity text, ref text, field text, question text, resolution jsonb, resolution_note text, resolved_at timestamp with time zone, applied_at timestamp with time zone, archived_at timestamp with time zone, archived_by text, decision jsonb)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select i.id, i.kind, i.course_id, i.entity, i.ref, i.field, i.question,
         i.resolution, i.resolution_note, i.resolved_at, i.applied_at,
         i.archived_at, i.archived_by, i.decision
    from attention_items i
   where i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is not null
     and jsonb_typeof(i.decision_filed->'note_path') = 'string'
     and coalesce(jsonb_typeof(i.decision_filed->'log_path'), 'null') = 'null'
     and i.kind <> 'assistant_proposal'   -- 205
   order by i.archived_at, i.id
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- 2h. run_transform: a proposal filed while a fold runs is not one the fold raised. The live body
--     (212's, read with pg_get_functiondef on 2026-10-19) with the two counts marked 205 changed.
CREATE OR REPLACE FUNCTION public.run_transform(p_run_id uuid, p_trigger text DEFAULT 'manual'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id bigint;
  v_prev record;
  v_stages  jsonb := '{}'::jsonb;   -- {stage: counts}
  v_errors  jsonb := '[]'::jsonb;
  v_r       jsonb;
  v_cc      jsonb;
  v_hist    jsonb;
  v_started timestamptz;
  v_before  bigint;
  v_after   bigint;
  v_failed  int := 0;
  v_status  text;
  v_trigger text := case when p_trigger in ('manual','scheduled','app_request')
                         then p_trigger else 'manual' end;
begin
  -- Idempotent. A run that already has a FINISHED real sync_runs row is never folded twice: that
  -- row is returned as-is. A row still marked running is the one the claim opened (migration 135's
  -- trigger), and it is adopted below. The row is locked, so a second caller waits here and then
  -- reads the row the first one finished. A quarantine row is not a fold, so it is skipped here.
  select id, status into v_prev
    from sync_runs
   where run_id = p_run_id and scope is distinct from 'unregistered'
   order by id desc limit 1
     for update;
  if found and v_prev.status <> 'running' then
    return v_prev.id;
  end if;

  -- The guard. bb_raw accepts anon inserts, so "this run exists in bb_raw" proves nothing.
  if not exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.run_id = p_run_id) then
    raise exception
      'run % is not registered by an owner-authenticated sync request; refusing to fold it', p_run_id
      using hint = 'Insert or update an agent_requests row (kind = sync) with this run_id from an authenticated session first.';
  end if;

  if v_prev.id is not null then
    -- Adopt the row opened at claim. started_at stays the claim's; the trigger is this fold's.
    v_id := v_prev.id;
    update sync_runs set trigger = v_trigger where id = v_id;
  else
    insert into sync_runs (run_id, status, started_at, trigger, source, scope)
    values (p_run_id, 'running', now(), v_trigger, 'blackboard', 'all')
    returning id into v_id;
  end if;

  begin
    select count(*) into v_before from attention_items where kind <> 'assistant_proposal';   -- 205

    v_r := stage_courses(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('courses', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- stage_content belongs to Phase 8. Call it if it is installed; record an honest skipped
    -- row if it is not, rather than failing a whole sync over a function someone else owns.
    v_started := clock_timestamp();
    if to_regprocedure('public.stage_content(uuid)') is null then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'content', 'skipped', '{}'::jsonb, v_started, clock_timestamp(),
              'stage_content not installed');
      v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
      v_errors := v_errors || to_jsonb('stage_content not installed'::text);
    else
      begin
        execute 'select public.stage_content($1)' into v_cc using p_run_id;
        v_cc := coalesce(v_cc, '{}'::jsonb);
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'ok', v_cc, v_started, clock_timestamp(), null);
        v_stages := v_stages || jsonb_build_object('content', v_cc);
      exception when others then
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
                left(sqlstate || ' ' || sqlerrm, 1000));
        v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
        v_errors := v_errors || to_jsonb(left('stage_content: ' || sqlerrm, 1000));
      end;
    end if;

    -- Phase 26 (212). A gradebook column that is really an announcement-sourced row is bound to it
    -- BEFORE stage_assignments, which then matches the column by id and adds no second row. The
    -- step records itself as the stage 'bind' and fails alone, like 'content' and 'history'.
    v_started := clock_timestamp();
    begin
      v_cc := coalesce(bind_announcement_rows(p_run_id), '{}'::jsonb);
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'bind', 'ok', v_cc, v_started, clock_timestamp(), null);
      v_stages := v_stages || jsonb_build_object('bind', v_cc);
    exception when others then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'bind', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
              left(sqlstate || ' ' || sqlerrm, 1000));
      v_stages := v_stages || jsonb_build_object('bind', '{}'::jsonb);
      v_errors := v_errors || to_jsonb(left('bind_announcement_rows: ' || sqlerrm, 1000));
    end;

    v_r := stage_assignments(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('assignments', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 10a. Gradebook AFTER assignments, because stage_assignments is what creates and
    -- re-points assignments.bb_column_id, and attempts AFTER gradebook, because the file
    -- catalogue reads that link to decide which assignment a submission file belongs to.
    v_r := stage_gradebook(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gradebook', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_attempts(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('attempts', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_announcements(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('announcements', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_files(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('files', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 19. The per-crawl material history, AFTER stage_files: a file's history row carries
    -- the bb_files id that stage has just catalogued. material_history_record (132) writes no
    -- stage row of its own, so the row is written here, and the call sits in its own block so a
    -- failure in it is this stage's failure and nobody else's: the run reads partial.
    v_started := clock_timestamp();
    begin
      v_hist := coalesce(material_history_record(p_run_id), '{}'::jsonb);
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'ok', v_hist, v_started, clock_timestamp(), null);
      v_stages := v_stages || jsonb_build_object('history', v_hist);
    exception when others then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
              left(sqlstate || ' ' || sqlerrm, 1000));
      v_stages := v_stages || jsonb_build_object('history', '{}'::jsonb);
      v_errors := v_errors || to_jsonb(left('material_history_record: ' || sqlerrm, 1000));
    end;

    v_r := stage_gaps(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gaps', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    select count(*) into v_after from attention_items where kind <> 'assistant_proposal';    -- 205

    select count(*) into v_failed from sync_stage_runs
     where sync_run_id = v_id and status = 'failed';
    v_status := case when v_failed > 0 then 'partial' else 'ok' end;

    update sync_runs
       set status      = v_status,
           finished_at = clock_timestamp(),
           summary     = jsonb_build_object(
                           'stages',           v_stages,
                           'changes',          sync_change_lines(v_stages),
                           'attention_raised', greatest(v_after - v_before, 0),
                           'errors',           v_errors)
     where id = v_id;

  exception when others then
    -- Belt and braces: the stages catch their own errors, so reaching here means something
    -- outside them broke. Record it on the run rather than leaving a row stuck at running.
    update sync_runs
       set status = 'failed', finished_at = clock_timestamp(),
           notes  = btrim(coalesce(notes || ' | ', '') || left('driver: ' || sqlerrm, 500))
     where id = v_id;
  end;

  return v_id;
end $function$;

-- =============================================================================================
-- 3. v_workspace_proposals
-- =============================================================================================
-- Every column of 203 in its order, then effective_state (an open proposal past expires_at reads as
-- expired before the sweep or a decide call writes it), then the Inbox item's id and state. Under
-- security_invoker a caller who is not the owner reads nothing (203's and 031's row security).
create view public.v_workspace_proposals
  with (security_invoker = true) as
select p.id,
       p.created_at,
       p.expires_at,
       p.request_id,
       p.conversation_id,
       p.target,
       p.row_id,
       p.course_id,
       p.label,
       p.field,
       p.old_value,
       p.new_value,
       p.reason,
       p.state,
       p.decided_at,
       case when p.state = 'proposed' and now() >= p.expires_at then 'expired' else p.state end
         as effective_state,
       a.id    as attention_item_id,
       a.state as attention_state
  from public.workspace_proposals p
  left join public.attention_items a on a.workspace_proposal_id = p.id;

comment on view public.v_workspace_proposals is
  'The Workspace assistant''s planner proposals as the page reads them (migration 205): every column of '
  'workspace_proposals, effective_state (expired once a proposed row is past expires_at, else state) and '
  'the Inbox item''s id and state. security_invoker: the owner reads his rows, anyone else none.';

revoke all on public.v_workspace_proposals from public, anon, authenticated, service_role;
grant select on public.v_workspace_proposals to authenticated, service_role;

-- =============================================================================================
-- 4. The expiry sweep and its hourly job
-- =============================================================================================
create function public.workspace_proposals_expire()
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  -- The two writes are one statement: a proposal and its Inbox item expire together.
  with expired as (
    update workspace_proposals p
       set state = 'expired', decided_at = now()
     where p.state = 'proposed' and p.expires_at <= now()
    returning p.id
  ), resolved as (
    update attention_items a
       set state = 'resolved', resolved_at = now(),
           resolution = jsonb_build_object('outcome', 'expired', 'proposal_id', e.id)
      from expired e
     where a.workspace_proposal_id = e.id and a.state = 'open'
    returning a.id
  )
  select count(*) into v_n from expired;
  return v_n;
end $$;

comment on function public.workspace_proposals_expire() is
  'The hourly expiry of the assistant''s planner proposals (migration 205; pg_cron job '
  'bb2dash-proposals-expire): every proposed row past expires_at becomes expired with decided_at = now(), '
  'and its open Inbox item resolved with resolution = {outcome: expired, proposal_id}. Returns how many '
  'expired. No client role executes it (db_test_runner does, for its unit).';

revoke all on function public.workspace_proposals_expire() from public, anon, authenticated, service_role;
grant execute on function public.workspace_proposals_expire() to db_test_runner;

-- cron.schedule replaces a job of the same name, so applying this again is safe (035's note).
select cron.schedule('bb2dash-proposals-expire', '7 * * * *',
                     $cron$select public.workspace_proposals_expire()$cron$);

-- =============================================================================================
-- 5. The guard
-- =============================================================================================
do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The kind check, the link column and its check and index.
  if pg_get_constraintdef((select c.oid from pg_constraint c
                            where c.conrelid = 'public.attention_items'::regclass
                              and c.conname = 'attention_items_kind_check'))
     not like '%''assistant_proposal''%' then
    raise exception 'FAIL 205: attention_items_kind_check does not hold assistant_proposal';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.attention_items'::regclass and c.contype = 'f'
                    and c.confrelid = 'public.workspace_proposals'::regclass) then
    raise exception 'FAIL 205: attention_items.workspace_proposal_id does not reference workspace_proposals';
  end if;

  -- (b) The two views run as their caller; the proposals view's columns are the page's.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.oid in ('public.v_inbox_queue'::regclass, 'public.v_workspace_proposals'::regclass)
     and not coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                         from unnest(c.reloptions) o where split_part(o, '=', 1) = 'security_invoker'), false);
  if v_bad is not null then
    raise exception 'FAIL 205: not security_invoker: %', v_bad;
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_proposals'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id bigint, created_at timestamp with time zone, expires_at timestamp with time zone, request_id bigint, '
     'conversation_id uuid, target text, row_id text, course_id text, label text, field text, old_value jsonb, '
     'new_value jsonb, reason text, state text, decided_at timestamp with time zone, effective_state text, '
     'attention_item_id bigint, attention_state text' then
    raise exception 'FAIL 205: v_workspace_proposals columns are [%]', v_got;
  end if;
  if not has_table_privilege('authenticated', 'public.v_workspace_proposals', 'select')
     or has_table_privilege('anon', 'public.v_workspace_proposals', 'select')
     or has_table_privilege('workspace_runner', 'public.v_workspace_proposals', 'select')
     or has_table_privilege('inbox_apply_runner', 'public.v_workspace_proposals', 'select') then
    raise exception 'FAIL 205: v_workspace_proposals is not readable by authenticated alone among the client roles';
  end if;

  -- (c) The sweep: SECURITY DEFINER of postgres, pinned, no client role; its job is scheduled.
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.workspace_proposals_expire()'::regprocedure and p.prosecdef
                    and p.proowner = 'postgres'::regrole
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 205: workspace_proposals_expire is not a SECURITY DEFINER of postgres with search_path pinned';
  end if;
  select string_agg(w.who, ', ' order by w.who) into v_bad
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('workspace_runner'),
                 ('inbox_apply_runner'), ('sync_runner'), ('workspace_ingest_runner')) as w(who)
   where has_function_privilege(w.who::name, 'public.workspace_proposals_expire()', 'execute');
  if v_bad is not null then
    raise exception 'FAIL 205: workspace_proposals_expire is executable by %', v_bad;
  end if;
  if not exists (select 1 from cron.job j
                  where j.jobname = 'bb2dash-proposals-expire' and j.schedule = '7 * * * *'
                    and j.command = 'select public.workspace_proposals_expire()') then
    raise exception 'FAIL 205: the cron job bb2dash-proposals-expire is not scheduled hourly';
  end if;

  -- (d) Every redefined reader names the kind; the view and the policy leave it out.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_bad
    from pg_proc p
   where p.oid in ('public.inbox_apply_begin_item(bigint, bigint)'::regprocedure,
                   'public.inbox_apply_log_write()'::regprocedure,
                   'public.inbox_apply_archive(bigint, bigint, jsonb)'::regprocedure,
                   'public.archive_attention_item(bigint, jsonb, text)'::regprocedure,
                   'public.inbox_decisions_unfiled(integer)'::regprocedure,
                   'public.inbox_decisions_unlogged(integer)'::regprocedure,
                   'public.run_transform(uuid, text)'::regprocedure)
     and p.prosrc not like '%assistant_proposal%';
  if v_bad is not null then
    raise exception 'FAIL 205: these readers do not leave assistant_proposal out: %', v_bad;
  end if;
  if pg_get_viewdef('public.v_inbox_queue'::regclass) not like '%assistant_proposal%' then
    raise exception 'FAIL 205: v_inbox_queue does not leave assistant_proposal out';
  end if;
  if not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = 'attention_items'
                    and p.policyname = 'attention_items_inbox_apply_read' and p.cmd = 'SELECT'
                    and p.roles = array['inbox_apply_runner']::name[]
                    and p.qual like '%assistant_proposal%') then
    raise exception 'FAIL 205: attention_items_inbox_apply_read does not leave assistant_proposal out';
  end if;
end $$;
