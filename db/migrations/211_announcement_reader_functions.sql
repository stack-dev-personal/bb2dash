-- bb2dash :: db/migrations/211_announcement_reader_functions.sql
-- Phase 26 (the announcement reader; brief 120). Block 210-219. Applies after 210.
--
-- WHY. The reader is one `claude -p` run in the `apply` container, on the same login as Phase 23's
-- Inbox apply (181's `inbox_apply_runner`). It reads announcements, the course's planner rows and
-- the course's materials, and it may do exactly four things: claim a request, be told which
-- announcements to read, record one decision per announcement, and close. Everything it writes goes
-- through announcement_review_record, which validates the whole decision and then writes it in one
-- transaction. The reader never writes assignment_progress or reading_progress, and never a number
-- it cannot quote: every date, time or point value must come with a quote that appears in the post,
-- and the database checks the quote.
--
-- WHAT
--   1. select on announcements for the role, with a select policy (the one table grant)
--   2. helpers (owner only): announcement_review_is_own_claim, announcement_review_norm,
--      announcement_review_text
--   3. functions the role may run (SECURITY DEFINER, search_path public, pg_temp; a refusal is
--      SQLSTATE 22023 with a message that starts with the function's name):
--        announcement_review_claim, announcement_review_prepare, announcement_review_record,
--        announcement_review_skip, announcement_review_close
--   4. privileges
--   5. a guard block
--
-- The role holds NO insert/update on announcement_reviews or announcement_review_writes: only the
-- functions write them. 181's trigger inbox_apply_log_write does not fire for these writes (the
-- functions run as their owner, not as inbox_apply_runner); announcement_review_writes is this
-- path's log. The claimant is 'inbox-apply-runner' (181's).
--
-- NOTE (W-110), contract gaps resolved to the safer reading:
--   a. Two entries of one decision that would raise the same Inbox key (two changes to one
--      assignment field, two asks about one assignment, two adds of one slug) are refused: the
--      second would silently overwrite the first through raise_attention's open-row dedupe. Asks
--      with no assignment are kept apart by a '#n' suffix on the ref (n from the second on).
--   b. A change whose to_value equals the value the row already has is refused (it would raise a
--      conflict with identical sides).
--   c. announcement_review_claim and close raise no Inbox item on a dead claim or a failed close
--      (184 and 181 do): an unfinished announcement stays unreviewed, the next sync files a new
--      request, and nothing is lost. Add them if Stack wants the noise.
--   d. announcement_review_close files its follow-up only when this request reviewed at least one
--      announcement (the 181 rule: a run that gets nowhere never loops).
--   e. announcement_review_prepare's runs_today counts the worker's started runs of BOTH kinds,
--      since the day's cap is shared (brief, apply worker).
--   f. announcement_review_skip returns boolean: true when it marked the announcement refused,
--      false (a no-op) when it was already reviewed, so the worker may call it for every leftover.
--   g. A raise that returns false (a settled "keep" conflict) leaves attention_item_id null in the
--      write log; the add or ask itself is still written.
--
-- Additive only: no drop, no existing function body changed.

do $$
begin
  if to_regclass('public.announcement_reviews') is null then
    raise exception '211: announcement_reviews does not exist; apply 210_announcement_reviews first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'inbox_apply_runner') then
    raise exception '211: role inbox_apply_runner does not exist; apply 181 first';
  end if;
end $$;

-- =============================================================================================
-- 1. The one table the role reads
-- =============================================================================================
grant select on public.announcements to inbox_apply_runner;

do $$
begin
  -- The owner's policy on announcements is `to authenticated`, so the role sees no row without its own.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'announcements' and policyname = 'announcements_inbox_apply_read') then
    create policy announcements_inbox_apply_read on public.announcements
      for select to inbox_apply_runner using (true);
  end if;
end $$;

-- =============================================================================================
-- 2. Helpers (the owner's alone)
-- =============================================================================================
create or replace function public.announcement_review_is_own_claim(p_request bigint)
  returns boolean
  stable
  language sql security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from agent_requests a
     where a.id = p_request and a.kind = 'announcement_review' and a.state = 'claimed'
       and a.claimed_by = 'inbox-apply-runner');
$$;

comment on function public.announcement_review_is_own_claim(bigint) is
  'Helper (211): true when the request is an announcement_review request the apply worker holds '
  'claimed. Granted to nobody; the reader''s functions call it as their owner.';

-- Lowercase, whitespace collapsed to single spaces, trimmed: how a quote is compared with a post.
create or replace function public.announcement_review_norm(p_text text)
  returns text
  immutable
  language sql set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

comment on function public.announcement_review_norm(text) is
  'Helper (211): lowercase, whitespace collapsed, trimmed. A quote is checked against a post after this.';

-- A text field of a decision entry: required or optional, a length cap, never a non-string.
create or replace function public.announcement_review_text(
  p_obj jsonb, p_key text, p_max integer, p_required boolean)
  returns text
  immutable
  language plpgsql set search_path = public, pg_temp as $$
declare
  v jsonb := p_obj -> p_key;
  t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if p_required then
      raise exception 'announcement_review_record: % is required', p_key using errcode = '22023';
    end if;
    return null;
  end if;
  if jsonb_typeof(v) <> 'string' then
    raise exception 'announcement_review_record: % must be text', p_key using errcode = '22023';
  end if;
  t := v #>> '{}';
  if p_required and btrim(t) = '' then
    raise exception 'announcement_review_record: % must not be empty', p_key using errcode = '22023';
  end if;
  if length(t) > p_max then
    raise exception 'announcement_review_record: % is longer than % characters', p_key, p_max using errcode = '22023';
  end if;
  return t;
end $$;

comment on function public.announcement_review_text(jsonb, text, integer, boolean) is
  'Helper (211): one text field of a decision entry; refuses (22023) a missing required field, a '
  'non-string, an empty required string, or one past p_max characters.';

-- =============================================================================================
-- 3a. announcement_review_claim
-- =============================================================================================
create or replace function public.announcement_review_claim()
  returns table (id bigint, params jsonb, created_at timestamptz)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_claimant          constant text := 'inbox-apply-runner';
  -- 184's numbers: the worker kills its run at 14 minutes and closes within 2; anybody else's
  -- claim is released at 30 (R-96).
  c_own_release_after constant interval := interval '16 minutes';
  c_release_after     constant interval := interval '30 minutes';
begin
  -- A claim with no process behind it: the worker's own past 16 minutes, anybody else's past 30.
  -- Both close failed; what was recorded before stays recorded. The announcements stay unreviewed.
  update agent_requests a
     set state = 'failed', finished_at = now(),
         result = coalesce(a.result, '{}'::jsonb) || jsonb_build_object(
           'error', 'interrupted',
           'lines', jsonb_build_array(
             case when a.claimed_by = c_claimant
                  then 'The apply worker stopped before this request finished.'
                  else 'Claimed for more than 30 minutes without finishing; released.' end),
           'claude', jsonb_build_object('started', a.claimed_by = c_claimant))
   where a.kind = 'announcement_review' and a.state = 'claimed'
     and coalesce(a.claimed_at, a.created_at)
         < now() - case when a.claimed_by = c_claimant then c_own_release_after else c_release_after end;

  -- A live claim: one request at a time, nothing to take.
  if exists (select 1 from agent_requests a where a.kind = 'announcement_review' and a.state = 'claimed') then
    return;
  end if;

  return query
    update agent_requests a
       set state = 'claimed', claimed_at = now(), claimed_by = c_claimant,
           claim_attempts = a.claim_attempts + 1
     where a.id = (select q.id from agent_requests q
                    where q.kind = 'announcement_review' and q.state = 'queued'
                    order by q.created_at, q.id
                    limit 1
                    for update skip locked)
    returning a.id, a.params, a.created_at;
end $$;

comment on function public.announcement_review_claim() is
  'The announcement reader''s queue read and claim (211, 184''s pattern). First closes failed (error '
  'interrupted) any announcement_review claim of its own older than 16 minutes and anybody else''s '
  'older than 30. Then, unless a live claim is open, claims the oldest queued announcement_review '
  'request as inbox-apply-runner and returns it; no row when there is none. inbox_apply_runner only.';

-- =============================================================================================
-- 3b. announcement_review_prepare
-- =============================================================================================
create or replace function public.announcement_review_prepare(p_request bigint)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_batch constant integer := 6;
begin
  if not announcement_review_is_own_claim(p_request) then
    raise exception 'announcement_review_prepare: request % is not the apply worker''s claim',
      coalesce(p_request::text, 'null') using errcode = '22023';
  end if;

  -- Ids only: the text is read by the skill through its query tool.
  return jsonb_build_object(
    'announcements', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', u.id, 'course_id', u.course_id, 'title', u.title, 'posted_at', u.posted_at,
               'modified_at', u.modified_at, 'bb_item_id', u.bb_item_id)
               order by u.sort_at, u.id), '[]'::jsonb)
        from (select v.id, v.course_id, v.title, v.posted_at, v.modified_at, v.bb_item_id,
                     coalesce(v.posted_at, v.captured_at) as sort_at
                from v_announcements_unreviewed v
               order by coalesce(v.posted_at, v.captured_at), v.id
               limit c_batch) u),
    'runs_today', (
      select count(*) from agent_requests a
       where a.kind in ('inbox_feedback', 'announcement_review') and a.id <> p_request
         and a.claimed_by = 'inbox-apply-runner'
         and a.result->'claude'->>'started' = 'true'
         and (a.claimed_at at time zone 'America/New_York')::date
             = (now() at time zone 'America/New_York')::date));
end $$;

comment on function public.announcement_review_prepare(bigint) is
  'Which announcements the run reads (211): {announcements: [{id, course_id, title, posted_at, '
  'modified_at, bb_item_id}] for the at most 6 oldest unreviewed (ids and headers only), runs_today: '
  'how many of the worker''s requests of either kind started Claude on this New York day}. Refuses a '
  'request that is not the worker''s own claim. inbox_apply_runner only.';

-- =============================================================================================
-- 3c. announcement_review_record: the reader's only write path
-- =============================================================================================
create or replace function public.announcement_review_record(
  p_request bigint, p_announcement bigint, p_decision jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_entries constant integer := 5;
  c_max_quote   constant integer := 500;
  c_max_ask     constant integer := 300;
  v_a        announcements%rowtype;
  v_outcome  text;
  v_summary  text;
  v_add      jsonb;
  v_change   jsonb;
  v_ask      jsonb;
  v_title_n  text;
  v_body_n   text;
  e          jsonb;
  v_quote    text;
  v_question text;
  v_slug     text;
  v_field    text;
  v_id       text;
  v_key      text;
  v_keys     text[] := '{}';
  v_cur      assignments%rowtype;
  v_ts       timestamptz;
  v_dt       date;
  v_num      numeric;
  v_to       jsonb;
  v_from     jsonb;
  v_item     bigint;
  v_n        integer;
  v_ref      text;
  v_ask_n    integer := 0;
  v_sugg     jsonb;
  v_added    jsonb := '[]'::jsonb;
  v_raised   jsonb := '[]'::jsonb;
  v_due      jsonb;
begin
  if not announcement_review_is_own_claim(p_request) then
    raise exception 'announcement_review_record: request % is not the apply worker''s claim',
      coalesce(p_request::text, 'null') using errcode = '22023';
  end if;
  if p_announcement is null or p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'announcement_review_record: the decision must be a jsonb object for an announcement id'
      using errcode = '22023';
  end if;

  -- Locked, so two recorders of one announcement queue instead of both writing.
  select * into v_a from announcements a where a.id = p_announcement for update;
  if not found then
    raise exception 'announcement_review_record: announcement % does not exist', p_announcement
      using errcode = '22023';
  end if;
  if not exists (select 1 from v_announcements_unreviewed u where u.id = p_announcement) then
    raise exception 'announcement_review_record: announcement % is already reviewed', p_announcement
      using errcode = '22023';
  end if;

  v_title_n := announcement_review_norm(v_a.title);
  v_body_n  := announcement_review_norm(v_a.body);

  -- ---------------------------------------------------------------------------------------
  -- Validation. Any failure refuses the whole decision; nothing is written before it ends.
  -- ---------------------------------------------------------------------------------------
  begin
    v_outcome := p_decision->>'outcome';
    if jsonb_typeof(p_decision->'outcome') is distinct from 'string'
       or v_outcome not in ('nothing', 'acted') then
      raise exception 'announcement_review_record: outcome must be nothing or acted' using errcode = '22023';
    end if;
    v_summary := announcement_review_text(p_decision, 'summary', 300, true);

    v_add    := coalesce(p_decision->'add',    '[]'::jsonb);
    v_change := coalesce(p_decision->'change', '[]'::jsonb);
    v_ask    := coalesce(p_decision->'ask',    '[]'::jsonb);
    if jsonb_typeof(v_add) <> 'array' or jsonb_typeof(v_change) <> 'array' or jsonb_typeof(v_ask) <> 'array' then
      raise exception 'announcement_review_record: add, change and ask must each be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(v_add) > c_max_entries or jsonb_array_length(v_change) > c_max_entries
       or jsonb_array_length(v_ask) > c_max_entries then
      raise exception 'announcement_review_record: at most % entries in each of add, change and ask', c_max_entries
        using errcode = '22023';
    end if;
    if (v_outcome = 'nothing') is distinct from
       (jsonb_array_length(v_add) + jsonb_array_length(v_change) + jsonb_array_length(v_ask) = 0) then
      raise exception 'announcement_review_record: outcome is nothing if and only if add, change and ask are all empty'
        using errcode = '22023';
    end if;

    -- add
    for e in select x from jsonb_array_elements(v_add) x loop
      if jsonb_typeof(e) <> 'object' then
        raise exception 'announcement_review_record: each add entry must be an object' using errcode = '22023';
      end if;
      v_quote := announcement_review_text(e, 'quote', c_max_quote, true);
      if position(announcement_review_norm(v_quote) in v_title_n) = 0
         and position(announcement_review_norm(v_quote) in v_body_n) = 0 then
        raise exception 'announcement_review_record: the quote for an add does not appear in the announcement'
          using errcode = '22023';
      end if;
      perform announcement_review_text(e, 'question', c_max_ask, true);
      perform announcement_review_text(e, 'title', 200, true);
      v_slug := announcement_review_text(e, 'slug', 60, true);
      if v_slug !~ '^[a-z0-9][a-z0-9-]{0,59}$' then
        raise exception 'announcement_review_record: slug % is not lowercase letters, digits and hyphens', v_slug
          using errcode = '22023';
      end if;
      v_id := v_a.course_id || '/' || v_slug;
      if exists (select 1 from assignments x where x.id = v_id) or ('add:' || v_id) = any (v_keys) then
        raise exception 'announcement_review_record: assignment % already exists', v_id using errcode = '22023';
      end if;
      v_keys := v_keys || ('add:' || v_id);
      if (e->>'type') is null or not ((e->>'type') = any (enum_range(null::assignment_type)::text[])) then
        raise exception 'announcement_review_record: type % is not an assignment type', coalesce(e->>'type', 'null')
          using errcode = '22023';
      end if;
      if (e->>'submission') is not null
         and not ((e->>'submission') = any (enum_range(null::submission_channel)::text[])) then
        raise exception 'announcement_review_record: submission % is not a submission channel', e->>'submission'
          using errcode = '22023';
      end if;
      if announcement_review_text(e, 'due_at', 64, false) is null
         and announcement_review_text(e, 'due_date', 32, false) is null
         and announcement_review_text(e, 'event_start', 64, false) is null then
        raise exception 'announcement_review_record: an add needs one of due_at, due_date or event_start'
          using errcode = '22023';
      end if;
      v_ts := announcement_review_text(e, 'due_at', 64, false)::timestamptz;
      v_ts := announcement_review_text(e, 'event_start', 64, false)::timestamptz;
      v_dt := announcement_review_text(e, 'due_date', 32, false)::date;
      if announcement_review_text(e, 'series_key', 200, false) is not null
         and left(e->>'series_key', length(v_a.course_id) + 1) <> v_a.course_id || '/' then
        raise exception 'announcement_review_record: series_key must start with %/', v_a.course_id
          using errcode = '22023';
      end if;
      if e->'sequence_no' is not null and jsonb_typeof(e->'sequence_no') <> 'null' then
        if jsonb_typeof(e->'sequence_no') <> 'number'
           or (e->>'sequence_no')::numeric <> trunc((e->>'sequence_no')::numeric)
           or (e->>'sequence_no')::numeric not between 0 and 32767 then
          raise exception 'announcement_review_record: sequence_no must be a whole number' using errcode = '22023';
        end if;
      end if;
      if e->'points_possible' is not null and jsonb_typeof(e->'points_possible') <> 'null' then
        if jsonb_typeof(e->'points_possible') <> 'number' or (e->>'points_possible')::numeric < 0 then
          raise exception 'announcement_review_record: points_possible must be a number, zero or more'
            using errcode = '22023';
        end if;
      end if;
      perform announcement_review_text(e, 'description', 1000, false);
    end loop;

    -- change
    v_keys := '{}';
    for e in select x from jsonb_array_elements(v_change) x loop
      if jsonb_typeof(e) <> 'object' then
        raise exception 'announcement_review_record: each change entry must be an object' using errcode = '22023';
      end if;
      v_quote := announcement_review_text(e, 'quote', c_max_quote, true);
      if position(announcement_review_norm(v_quote) in v_title_n) = 0
         and position(announcement_review_norm(v_quote) in v_body_n) = 0 then
        raise exception 'announcement_review_record: the quote for a change does not appear in the announcement'
          using errcode = '22023';
      end if;
      perform announcement_review_text(e, 'question', c_max_ask, true);
      v_id := announcement_review_text(e, 'assignment_id', 200, true);
      select * into v_cur from assignments x where x.id = v_id and x.course_id = v_a.course_id;
      if not found then
        raise exception 'announcement_review_record: assignment % is not in the announcement''s course %',
          v_id, v_a.course_id using errcode = '22023';
      end if;
      v_field := announcement_review_text(e, 'field', 30, true);
      if v_field not in ('due_at', 'due_date', 'points_possible') then
        raise exception 'announcement_review_record: field % is not one of due_at, due_date, points_possible', v_field
          using errcode = '22023';
      end if;
      if v_id || '|' || v_field = any (v_keys) then
        raise exception 'announcement_review_record: two changes to % of %', v_field, v_id using errcode = '22023';
      end if;
      v_keys := v_keys || (v_id || '|' || v_field);
      if v_field = 'points_possible' then
        if jsonb_typeof(e->'to_value') is distinct from 'number' or (e->>'to_value')::numeric < 0 then
          raise exception 'announcement_review_record: to_value for points_possible must be a number, zero or more'
            using errcode = '22023';
        end if;
        if v_cur.points_possible is not distinct from (e->>'to_value')::numeric then
          raise exception 'announcement_review_record: % already has these points', v_id using errcode = '22023';
        end if;
      elsif jsonb_typeof(e->'to_value') is distinct from 'string' then
        raise exception 'announcement_review_record: to_value for % must be text', v_field using errcode = '22023';
      elsif v_field = 'due_at' then
        if v_cur.due_at is not distinct from (e->>'to_value')::timestamptz then
          raise exception 'announcement_review_record: % already has this due_at', v_id using errcode = '22023';
        end if;
      else
        if v_cur.due_date is not distinct from (e->>'to_value')::date then
          raise exception 'announcement_review_record: % already has this due_date', v_id using errcode = '22023';
        end if;
      end if;
    end loop;

    -- ask
    v_keys := '{}';
    for e in select x from jsonb_array_elements(v_ask) x loop
      if jsonb_typeof(e) <> 'object' then
        raise exception 'announcement_review_record: each ask entry must be an object' using errcode = '22023';
      end if;
      v_quote := announcement_review_text(e, 'quote', c_max_quote, true);
      if position(announcement_review_norm(v_quote) in v_title_n) = 0
         and position(announcement_review_norm(v_quote) in v_body_n) = 0 then
        raise exception 'announcement_review_record: the quote for an ask does not appear in the announcement'
          using errcode = '22023';
      end if;
      perform announcement_review_text(e, 'question', c_max_ask, true);
      v_id := announcement_review_text(e, 'assignment_id', 200, false);
      if v_id is not null then
        if not exists (select 1 from assignments x where x.id = v_id and x.course_id = v_a.course_id) then
          raise exception 'announcement_review_record: assignment % is not in the announcement''s course %',
            v_id, v_a.course_id using errcode = '22023';
        end if;
        if v_id = any (v_keys) then
          raise exception 'announcement_review_record: two asks about %', v_id using errcode = '22023';
        end if;
        v_keys := v_keys || v_id;
      end if;
    end loop;
  exception
    when sqlstate '22023' then
      raise;
    when others then
      -- A value that does not cast (a date, a timestamp, a number) is a refusal, not a crash.
      raise exception 'announcement_review_record: the decision does not validate (%)', sqlerrm
        using errcode = '22023';
  end;

  -- ---------------------------------------------------------------------------------------
  -- Writes. Every raise carries the same `suggested`; the web keys off suggested.source.
  -- ---------------------------------------------------------------------------------------
  for e in select x from jsonb_array_elements(v_add) x loop
    v_id    := v_a.course_id || '/' || (e->>'slug');
    v_sugg  := jsonb_build_object('source', 'announcement', 'announcement_id', v_a.id,
                 'bb_item_id', v_a.bb_item_id, 'announcement_title', v_a.title,
                 'posted_at', v_a.posted_at, 'quote', e->>'quote');
    insert into assignments (id, course_id, title, type, recurrence, series_key, sequence_no,
                             due_at, due_date, event_start, points_possible, submission, description,
                             bb_item_id, source, source_ref, confidence)
    values (v_id, v_a.course_id, e->>'title', (e->>'type')::assignment_type, 'one_off',
            nullif(e->>'series_key', ''), (e->>'sequence_no')::numeric::smallint,
            nullif(e->>'due_at', '')::timestamptz, nullif(e->>'due_date', '')::date,
            nullif(e->>'event_start', '')::timestamptz, (e->>'points_possible')::numeric,
            coalesce((e->>'submission')::submission_channel, 'unknown'), nullif(e->>'description', ''),
            v_a.bb_item_id, 'blackboard',
            format('announcement %s (%s)', v_a.bb_item_id, v_a.posted_at::date), 'tentative');
    select coalesce(to_jsonb(a.due_at), to_jsonb(a.due_date::text), to_jsonb(a.event_start)) into v_due
      from assignments a where a.id = v_id;
    perform raise_attention(null, 'deadline', v_a.course_id, 'assignment', v_id, 'announcement_add',
                            null, v_due, e->>'question', v_sugg);
    select i.id into v_item from attention_items i
     where i.state = 'open' and i.kind = 'deadline' and i.course_id = v_a.course_id
       and i.ref = v_id and i.field = 'announcement_add' order by i.id desc limit 1;
    insert into announcement_review_writes (request_id, announcement_id, action, assignment_id, attention_item_id)
    values (p_request, v_a.id, 'add', v_id, v_item);
    v_added := v_added || to_jsonb(v_id);
    if v_item is not null then v_raised := v_raised || to_jsonb(v_item); end if;
  end loop;

  for e in select x from jsonb_array_elements(v_change) x loop
    v_id    := e->>'assignment_id';
    v_field := e->>'field';
    v_sugg  := jsonb_build_object('source', 'announcement', 'announcement_id', v_a.id,
                 'bb_item_id', v_a.bb_item_id, 'announcement_title', v_a.title,
                 'posted_at', v_a.posted_at, 'quote', e->>'quote');
    select * into v_cur from assignments x where x.id = v_id;
    if v_field = 'points_possible' then
      v_from := to_jsonb(v_cur.points_possible);
      v_to   := to_jsonb((e->>'to_value')::numeric);
    elsif v_field = 'due_at' then
      v_from := coalesce(to_jsonb(v_cur.due_at), to_jsonb(v_cur.due_date::text));
      v_to   := to_jsonb((e->>'to_value')::timestamptz);
    else
      v_from := to_jsonb(v_cur.due_date::text);
      v_to   := to_jsonb(((e->>'to_value')::date)::text);
    end if;
    perform raise_attention(null, 'conflict', v_a.course_id, 'assignment', v_id, v_field,
                            v_from, v_to, e->>'question', v_sugg);
    select i.id into v_item from attention_items i
     where i.state = 'open' and i.kind = 'conflict' and i.course_id = v_a.course_id
       and i.ref = v_id and i.field = v_field order by i.id desc limit 1;
    insert into announcement_review_writes (request_id, announcement_id, action, assignment_id, attention_item_id)
    values (p_request, v_a.id, 'change', v_id, v_item);
    if v_item is not null then v_raised := v_raised || to_jsonb(v_item); end if;
  end loop;

  for e in select x from jsonb_array_elements(v_ask) x loop
    v_id   := e->>'assignment_id';
    v_sugg := jsonb_build_object('source', 'announcement', 'announcement_id', v_a.id,
                'bb_item_id', v_a.bb_item_id, 'announcement_title', v_a.title,
                'posted_at', v_a.posted_at, 'quote', e->>'quote');
    if v_id is not null then
      perform raise_attention(null, 'stack_must_confirm', v_a.course_id, 'assignment', v_id, 'announcement',
                              null, null, e->>'question', v_sugg);
      v_ref := v_id;
    else
      v_ask_n := v_ask_n + 1;
      v_ref := 'announcement:' || coalesce(v_a.bb_item_id, v_a.id::text)
               || case when v_ask_n > 1 then '#' || v_ask_n else '' end;
      perform raise_attention(null, 'stack_must_confirm', v_a.course_id, 'announcement', v_ref, 'announcement',
                              null, null, e->>'question', v_sugg);
    end if;
    select i.id into v_item from attention_items i
     where i.state = 'open' and i.kind = 'stack_must_confirm' and i.course_id = v_a.course_id
       and i.ref = v_ref and i.field = 'announcement' order by i.id desc limit 1;
    insert into announcement_review_writes (request_id, announcement_id, action, assignment_id, attention_item_id)
    values (p_request, v_a.id, 'ask', v_id, v_item);
    if v_item is not null then v_raised := v_raised || to_jsonb(v_item); end if;
  end loop;

  insert into announcement_reviews (announcement_id, modified_seen, request_id, reviewed_at, outcome, summary, detail)
  values (v_a.id, coalesce(v_a.modified_at, v_a.posted_at), p_request, now(), v_outcome, v_summary, p_decision)
  on conflict (announcement_id) do update
     set modified_seen = excluded.modified_seen, request_id = excluded.request_id,
         reviewed_at = excluded.reviewed_at, outcome = excluded.outcome,
         summary = excluded.summary, detail = excluded.detail;

  return jsonb_build_object('added', v_added, 'raised', v_raised);
end $$;

comment on function public.announcement_review_record(bigint, bigint, jsonb) is
  'The announcement reader''s only write path (211). One decision for one unreviewed announcement, from '
  'the worker''s own claim: validated whole (outcome nothing iff add, change and ask are all empty; at '
  'most 5 of each; every quote non-empty, at most 500 characters and found in the post''s title or body '
  'after lowercasing and collapsing whitespace; add: slug, free id, assignment_type, a date, series_key '
  'under the course, submission_channel; change: the assignment is in the announcement''s course, the '
  'field is due_at, due_date or points_possible, to_value casts; ask: the assignment, if named, is in '
  'the course), then written in one transaction: each add inserts a tentative blackboard row and raises '
  'a deadline notice, each change a conflict, each ask a stack_must_confirm, all through raise_attention '
  'with suggested.source = announcement. Logs each write in announcement_review_writes and upserts '
  'announcement_reviews. Returns {added: [assignment ids], raised: [attention ids]}. Any failure '
  'refuses the whole decision (22023). inbox_apply_runner only.';

-- =============================================================================================
-- 3d. announcement_review_skip
-- =============================================================================================
create or replace function public.announcement_review_skip(
  p_request bigint, p_announcement bigint, p_why text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a announcements%rowtype;
begin
  if not announcement_review_is_own_claim(p_request) then
    raise exception 'announcement_review_skip: request % is not the apply worker''s claim',
      coalesce(p_request::text, 'null') using errcode = '22023';
  end if;
  if p_why is null or btrim(p_why) = '' or length(p_why) > 300 then
    raise exception 'announcement_review_skip: the reason must be 1 to 300 characters' using errcode = '22023';
  end if;
  select * into v_a from announcements a where a.id = p_announcement for update;
  if not found then
    raise exception 'announcement_review_skip: announcement % does not exist', coalesce(p_announcement::text, 'null')
      using errcode = '22023';
  end if;
  -- Already reviewed (or recorded by this very run): nothing to mark.
  if not exists (select 1 from v_announcements_unreviewed u where u.id = p_announcement) then
    return false;
  end if;

  insert into announcement_reviews (announcement_id, modified_seen, request_id, reviewed_at, outcome, summary, detail)
  values (v_a.id, coalesce(v_a.modified_at, v_a.posted_at), p_request, now(), 'refused', p_why,
          jsonb_build_object('why', p_why))
  on conflict (announcement_id) do update
     set modified_seen = excluded.modified_seen, request_id = excluded.request_id,
         reviewed_at = excluded.reviewed_at, outcome = excluded.outcome,
         summary = excluded.summary, detail = excluded.detail;
  return true;
end $$;

comment on function public.announcement_review_skip(bigint, bigint, text) is
  'Marks one unreviewed announcement refused (211), for when the reader could not form a valid '
  'decision, so a bad post never loops. True when marked; false (a no-op) when it was already '
  'reviewed. Refuses a request that is not the worker''s own claim. inbox_apply_runner only.';

-- =============================================================================================
-- 3e. announcement_review_close
-- =============================================================================================
create or replace function public.announcement_review_close(p_request bigint, p_state text, p_result jsonb)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 210's lock: every function that files an announcement_review request takes it.
  c_lock_key constant bigint := 1400910003;
  v_follow   bigint;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or (p_result ? 'lines' and (jsonb_typeof(p_result->'lines') <> 'array'
         or exists (select 1 from jsonb_array_elements(p_result->'lines') l where jsonb_typeof(l) <> 'string'))) then
    raise exception 'announcement_review_close: the result must be an object whose lines, if present, is an array of text'
      using errcode = '22023';
  end if;
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'announcement_review_close: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;

  perform 1 from agent_requests a
    where a.id = p_request and a.kind = 'announcement_review' and a.state = 'claimed'
      and a.claimed_by = 'inbox-apply-runner'
    for update;
  if not found then
    raise exception 'announcement_review_close: request % is not the apply worker''s claim',
      coalesce(p_request::text, 'null') using errcode = '22023';
  end if;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_result
   where a.id = p_request;

  -- One follow-up for the rest, only after a run that reviewed something (a run that gets nowhere
  -- never loops).
  if p_state = 'done'
     and exists (select 1 from announcement_reviews r where r.request_id = p_request)
     and exists (select 1 from v_announcements_unreviewed) then
    perform pg_advisory_xact_lock(c_lock_key);
    if not exists (select 1 from agent_requests a
                    where a.kind = 'announcement_review' and a.state in ('queued', 'claimed')) then
      insert into agent_requests (kind, scope, state, params, note)
      values ('announcement_review', 'all', 'queued',
              jsonb_build_object('trigger', 'follow_up', 'after', p_request),
              format('queued by the apply worker after request %s', p_request))
      returning id into v_follow;
    end if;
  end if;
  return v_follow;
end $$;

comment on function public.announcement_review_close(bigint, text, jsonb) is
  'Closes an announcement_review request for the apply worker (211): its own claimed -> done or failed, '
  'with finished_at and result (an object). When the state is done, the run reviewed at least one '
  'announcement and unreviewed ones remain, files one queued follow-up {trigger: follow_up, after} and '
  'returns its id; null otherwise. Refuses any other transition. inbox_apply_runner only.';

-- =============================================================================================
-- 4. Privileges
-- =============================================================================================
revoke all on function
  public.announcement_review_is_own_claim(bigint),
  public.announcement_review_norm(text),
  public.announcement_review_text(jsonb, text, integer, boolean),
  public.announcement_review_claim(),
  public.announcement_review_prepare(bigint),
  public.announcement_review_record(bigint, bigint, jsonb),
  public.announcement_review_skip(bigint, bigint, text),
  public.announcement_review_close(bigint, text, jsonb)
from public, anon, authenticated, service_role, sync_runner;

grant execute on function
  public.announcement_review_claim(),
  public.announcement_review_prepare(bigint),
  public.announcement_review_record(bigint, bigint, jsonb),
  public.announcement_review_skip(bigint, bigint, text),
  public.announcement_review_close(bigint, text, jsonb)
to inbox_apply_runner, db_test_runner;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
declare
  f text;
  v_got text;
  v_fns text[] := array[
    'public.announcement_review_claim()',
    'public.announcement_review_prepare(bigint)',
    'public.announcement_review_record(bigint, bigint, jsonb)',
    'public.announcement_review_skip(bigint, bigint, text)',
    'public.announcement_review_close(bigint, text, jsonb)'];
begin
  foreach f in array v_fns loop
    if not (select p.prosecdef and p.proconfig = array['search_path=public, pg_temp']
              from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'FAIL 211: % is not SECURITY DEFINER with search_path public, pg_temp', f;
    end if;
    if not has_function_privilege('inbox_apply_runner', f, 'execute')
       or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute')
       or has_function_privilege('sync_runner', f, 'execute') then
      raise exception 'FAIL 211: % is not executable by inbox_apply_runner (and the test login) alone', f;
    end if;
  end loop;
  if has_function_privilege('inbox_apply_runner', 'public.announcement_review_is_own_claim(bigint)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.announcement_review_text(jsonb, text, integer, boolean)', 'execute') then
    raise exception 'FAIL 211: a helper is executable by inbox_apply_runner';
  end if;
  -- The role writes neither new table; the functions do.
  select string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv) into v_got
    from pg_class c
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('announcement_reviews', 'announcement_review_writes', 'announcements',
                       'v_announcements_unreviewed')
     and has_table_privilege('inbox_apply_runner', c.oid, p.priv);
  if v_got is distinct from 'announcements:select' then
    raise exception 'FAIL 211: inbox_apply_runner holds % on the announcement tables, expected announcements:select', v_got;
  end if;
end $$;
