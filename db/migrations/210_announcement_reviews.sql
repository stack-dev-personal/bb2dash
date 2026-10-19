-- bb2dash :: db/migrations/210_announcement_reviews.sql
-- Phase 26 (the announcement reader; brief 120, Stack's answers of 2026-10-19). Block 210-219.
--
-- WHY. The sync stores announcements and shows them, but nothing reads them. Professors post
-- graded work there first, and some work only reaches Blackboard as a gradebook column once it is
-- graded (ECN 304's Quiz 5, 2026-10-19). The reader runs in the `apply` container, which is filed
-- a request after a sync closes done, exactly as Phase 23's Inbox apply is (B-43: the sync holds
-- no LLM). This file is the tracking and the request; 211 is what the reader may do; 212 stops a
-- row the reader added from being duplicated when its gradebook column appears.
--
-- APPLY ORDER. 210-212 go to prod only after Phase 25's migrations (200-209) are applied. This
-- phase does not touch the attention_items kind check, so the two phases do not clash there.
--
-- WHAT
--   1. agent_requests_kind_check gains 'announcement_review' (drop + re-add; the live check is
--      ('sync', 'transform', 'inbox_feedback'))
--   2. the partial unique index agent_requests_one_open_announcement_review (183's pattern)
--   3. table announcement_reviews (RLS on, owner select, no anon) and the write log
--      announcement_review_writes (written only by 211's functions)
--   4. the 14-day floor: one 'before_floor' review row for every announcement posted before
--      now() - 14 days at apply time (Stack's answer 2: the first run reads the last 14 days).
--      The floor needs no setting and no date constant.
--   5. view v_announcements_unreviewed (security_invoker)
--   6. sync_request_announcement_review(p_after): sync_request_inbox_apply's (187) pattern, under
--      advisory lock 1400910003
--   7. a guard block
--
-- NOTE (W-110): announcements.posted_at is nullable (none is null on prod today). The floor reads
-- coalesce(posted_at, captured_at), so a post with no posted_at is aged by when the crawl first saw
-- it and never escapes the floor by being undated.
--
-- Additive only: the one drop is the kind check, re-added in the same transaction with a fourth
-- kind; no function body changed.

do $$
begin
  if to_regprocedure('public.sync_request_inbox_apply(bigint)') is null then
    raise exception '210: sync_request_inbox_apply does not exist; apply 180 and 187 first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '210: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'sync_runner') then
    raise exception '210: role sync_runner does not exist; apply 091 first';
  end if;
end $$;

-- =============================================================================================
-- 1. The fourth request kind
-- =============================================================================================
alter table public.agent_requests drop constraint agent_requests_kind_check;
alter table public.agent_requests add constraint agent_requests_kind_check
  check (kind in ('sync', 'transform', 'inbox_feedback', 'announcement_review'));

-- =============================================================================================
-- 2. One open request at a time (183's pattern)
-- =============================================================================================
create unique index if not exists agent_requests_one_open_announcement_review
  on public.agent_requests (kind)
  where kind = 'announcement_review' and state in ('queued', 'claimed');

comment on index public.agent_requests_one_open_announcement_review is
  'One open (queued or claimed) announcement_review request at a time (210): the sync runner''s '
  'sync_request_announcement_review and the apply worker''s follow-up (announcement_review_close, '
  '211) cannot file two. A second insert raises 23505.';

-- =============================================================================================
-- 3. The tracking table and the write log
-- =============================================================================================
create table if not exists public.announcement_reviews (
  announcement_id bigint primary key references public.announcements (id) on delete cascade,
  -- The announcement's coalesce(modified_at, posted_at) when it was reviewed; a later edit moves
  -- the announcement past it and v_announcements_unreviewed lists it again.
  modified_seen   timestamptz,
  request_id      bigint references public.agent_requests (id),   -- null for the floor rows
  reviewed_at     timestamptz not null default now(),
  outcome         text not null check (outcome in ('nothing', 'acted', 'before_floor', 'refused')),
  summary         text,
  detail          jsonb not null default '{}'::jsonb
);

comment on table public.announcement_reviews is
  'One row per announcement the reader has dealt with (210): nothing to do, acted (rows added or '
  'questions raised), before_floor (older than 14 days when 210 was applied), or refused (the reader '
  'could not form a valid decision). Written only by the 211 functions; the apply login holds no '
  'write. modified_seen is the announcement''s coalesce(modified_at, posted_at) at review.';
comment on column public.announcement_reviews.request_id is
  'The announcement_review request whose run decided it. Null for the before_floor rows.';
comment on column public.announcement_reviews.detail is
  'The decision as recorded (211), or {"why": ...} for a refusal, or {} for the floor.';

create index if not exists announcement_reviews_request_idx
  on public.announcement_reviews (request_id) where request_id is not null;

alter table public.announcement_reviews enable row level security;
revoke all on public.announcement_reviews from public, anon, authenticated, service_role;
grant select on public.announcement_reviews to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'announcement_reviews' and policyname = 'announcement_reviews_owner_read') then
    create policy announcement_reviews_owner_read on public.announcement_reviews
      for select to authenticated
      using ((select auth.uid()) = (select public.app_owner()));
  end if;
end $$;

create table if not exists public.announcement_review_writes (
  id                bigint generated always as identity primary key,
  request_id        bigint references public.agent_requests (id),
  announcement_id   bigint not null references public.announcements (id) on delete cascade,
  action            text not null check (action in ('add', 'change', 'ask')),
  assignment_id     text,
  attention_item_id bigint references public.attention_items (id),
  at                timestamptz not null default now()
);

comment on table public.announcement_review_writes is
  'Every write the announcement reader made, at write time (210; B-59''s "every write logged"): one '
  'row per add, change question or ask question, with the request, the announcement, the assignment '
  'row (added, or the one the question is about) and the Inbox item raised. Written only by '
  'announcement_review_record (211). Append only. The 181 trigger does not fire for this path '
  '(the function runs as its owner), so this table is its log.';

create index if not exists announcement_review_writes_request_idx
  on public.announcement_review_writes (request_id);
create index if not exists announcement_review_writes_announcement_idx
  on public.announcement_review_writes (announcement_id);

alter table public.announcement_review_writes enable row level security;
revoke all on public.announcement_review_writes from public, anon, authenticated, service_role;
grant select on public.announcement_review_writes to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'announcement_review_writes'
                   and policyname = 'announcement_review_writes_owner_read') then
    create policy announcement_review_writes_owner_read on public.announcement_review_writes
      for select to authenticated
      using ((select auth.uid()) = (select public.app_owner()));
  end if;
end $$;

-- The suite writes these tables, and the announcements they hang on, inside its rolled-back
-- transactions (as 133 and 137 did for their tables). Nothing runs as this role outside the suite.
grant insert, update, delete on
  public.announcement_reviews, public.announcement_review_writes, public.announcements
to db_test_runner;

-- =============================================================================================
-- 4. The 14-day floor
-- =============================================================================================
insert into public.announcement_reviews (announcement_id, modified_seen, request_id, outcome, summary, detail)
select a.id, coalesce(a.modified_at, a.posted_at), null, 'before_floor',
       'Posted more than 14 days before the announcement reader was installed.', '{}'::jsonb
  from public.announcements a
 where coalesce(a.posted_at, a.captured_at) < now() - interval '14 days'
on conflict (announcement_id) do nothing;

-- =============================================================================================
-- 5. The unreviewed view
-- =============================================================================================
create or replace view public.v_announcements_unreviewed
  with (security_invoker = true) as
select a.id, a.course_id, a.title, a.posted_at, a.modified_at, a.bb_item_id, a.captured_at,
       r.announcement_id is not null as edited_since_review
  from public.announcements a
  left join public.announcement_reviews r on r.announcement_id = a.id
 where r.announcement_id is null
    or coalesce(a.modified_at, a.posted_at) > r.modified_seen;

comment on view public.v_announcements_unreviewed is
  'Announcements the reader has not dealt with (210): no review row, or edited since the review '
  '(coalesce(modified_at, posted_at) later than modified_seen). security_invoker.';

revoke all on public.v_announcements_unreviewed from public, anon, authenticated, service_role;
grant select on public.v_announcements_unreviewed to authenticated, db_test_runner;

-- =============================================================================================
-- 6. Filing the request after a sync
-- =============================================================================================
create or replace function public.sync_request_announcement_review(p_after bigint)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- One lock for every announcement_review filing (this and 211's follow-up), so two callers never
  -- insert two open requests. 1400910001, 1400910002 and 1400910024 are taken.
  c_lock_key constant bigint := 1400910003;
  v_id bigint;
begin
  -- Only after a sync this runner closed done: a failed sync files nothing, and neither does a
  -- sync the Windows skill ran.
  if p_after is null or not exists (
       select 1 from agent_requests a
        where a.id = p_after and a.kind = 'sync' and a.state = 'done'
          and a.claimed_by = 'sync-runner') then
    return null;
  end if;

  perform pg_advisory_xact_lock(c_lock_key);

  -- One request at a time: an open one is the answer.
  select a.id into v_id
    from agent_requests a
   where a.kind = 'announcement_review' and a.state in ('queued', 'claimed')
   order by a.created_at, a.id
   limit 1;
  if found then
    return v_id;
  end if;

  if not exists (select 1 from v_announcements_unreviewed) then
    return null;
  end if;

  insert into agent_requests (kind, scope, state, params, note)
  values ('announcement_review', 'all', 'queued',
          jsonb_build_object('trigger', 'sync', 'after', p_after),
          format('queued by the sync runner after sync %s', p_after))
  returning id into v_id;
  return v_id;
end $$;

comment on function public.sync_request_announcement_review(bigint) is
  'After a sync the sync runner closed done (210): files one queued announcement_review request with '
  'params {"trigger": "sync", "after": <sync request id>} when v_announcements_unreviewed is not '
  'empty. Under an advisory lock (1400910003), returns the open announcement_review request''s id if '
  'one is queued or claimed; returns null and inserts nothing when nothing is unreviewed or p_after '
  'is not a done sync claimed by sync-runner. The apply container runs the request; the sync holds '
  'no LLM (B-43). sync_runner only (plus service_role and the test login).';

revoke all on function public.sync_request_announcement_review(bigint)
  from public, anon, authenticated, inbox_apply_runner;
grant execute on function public.sync_request_announcement_review(bigint)
  to sync_runner, service_role, db_test_runner;

-- =============================================================================================
-- 7. Guard
-- =============================================================================================
do $$
begin
  if pg_get_constraintdef((select c.oid from pg_constraint c
                            where c.conrelid = 'public.agent_requests'::regclass
                              and c.conname = 'agent_requests_kind_check'))
     not like '%announcement_review%' then
    raise exception 'FAIL 210: agent_requests_kind_check does not name announcement_review';
  end if;
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.agent_requests_one_open_announcement_review'::regclass
                    and x.indisunique and x.indisvalid and x.indpred is not null) then
    raise exception 'FAIL 210: the one-open index is not a valid partial unique index';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.announcement_reviews'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.announcement_review_writes'::regclass) then
    raise exception 'FAIL 210: a tracking table has no row level security';
  end if;
  if has_table_privilege('anon', 'public.announcement_reviews', 'select')
     or has_table_privilege('authenticated', 'public.announcement_reviews', 'insert')
     or has_table_privilege('anon', 'public.announcement_review_writes', 'select')
     or has_table_privilege('authenticated', 'public.announcement_review_writes', 'insert')
     or has_table_privilege('anon', 'public.v_announcements_unreviewed', 'select') then
    raise exception 'FAIL 210: a tracking table is open to anon, or writable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.sync_request_announcement_review(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_request_announcement_review(bigint)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.sync_request_announcement_review(bigint)', 'execute')
     or not has_function_privilege('sync_runner', 'public.sync_request_announcement_review(bigint)', 'execute') then
    raise exception 'FAIL 210: sync_request_announcement_review is not executable by sync_runner alone';
  end if;
  if exists (select 1 from public.announcements a
              where coalesce(a.posted_at, a.captured_at) < now() - interval '14 days'
                and not exists (select 1 from public.announcement_reviews r where r.announcement_id = a.id)) then
    raise exception 'FAIL 210: an announcement older than 14 days has no floor row';
  end if;
end $$;
