-- bb2dash :: db/tests/phase26_210_announcement_reviews.sql
-- Phase 26 (the announcement reader; brief 120). Tests migration 210:
--
--   0. installed and shaped: the fourth request kind, the one-open index, the two tables (RLS on,
--      no anon, no authenticated write), the view (security_invoker), the filing function's grants
--   1. the 14-day floor: every before_floor row is an announcement older than 14 days, and no
--      before_floor row carries a request
--   2. v_announcements_unreviewed: no row lists it, a review hides it, an edit brings it back
--   3. sync_request_announcement_review: nothing after a sync that is not done and the runner's,
--      one request after one that is, the open one returned as it is, none when nothing is unreviewed
--   4. the one-open index refuses a second open request (23505)
--
-- RUN IT: `node scripts/db-test.mjs --only phase26_210_announcement_reviews.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t210 (label text primary key, id bigint, txt text) on commit drop;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_def  text;
begin
  if to_regclass('public.announcement_reviews') is null then
    raise exception 'FAIL phase26_210: migration 210 is not applied (no table announcement_reviews)';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.agent_requests'::regclass and c.conname = 'agent_requests_kind_check';
  if v_def is null or v_def not like '%sync%' or v_def not like '%transform%'
     or v_def not like '%inbox_feedback%' or v_def not like '%announcement_review%' then
    v_fail := v_fail || format('the kind check reads %s', v_def);
  end if;
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.agent_requests_one_open_announcement_review'::regclass
                    and x.indisunique and x.indisvalid and x.indpred is not null) then
    v_fail := v_fail || 'the one-open index is not a valid partial unique index'::text;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.announcement_reviews'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.announcement_review_writes'::regclass) then
    v_fail := v_fail || 'a tracking table has no row level security'::text;
  end if;
  if not exists (select 1 from pg_policies where tablename = 'announcement_reviews'
                   and policyname = 'announcement_reviews_owner_read' and cmd = 'SELECT' and roles = '{authenticated}') then
    v_fail := v_fail || 'announcement_reviews has no owner select policy'::text;
  end if;
  if has_table_privilege('anon', 'public.announcement_reviews', 'select')
     or has_table_privilege('anon', 'public.announcement_review_writes', 'select')
     or has_table_privilege('anon', 'public.v_announcements_unreviewed', 'select')
     or has_table_privilege('authenticated', 'public.announcement_reviews', 'insert')
     or has_table_privilege('authenticated', 'public.announcement_reviews', 'update')
     or has_table_privilege('authenticated', 'public.announcement_review_writes', 'insert')
     or has_table_privilege('inbox_apply_runner', 'public.announcement_reviews', 'select') then
    v_fail := v_fail || 'a tracking table is open to anon, writable by authenticated or readable by the apply login'::text;
  end if;
  if not coalesce((select 'security_invoker=true' = any (c.reloptions) from pg_class c
                    where c.oid = 'public.v_announcements_unreviewed'::regclass), false) then
    v_fail := v_fail || 'v_announcements_unreviewed is not security_invoker'::text;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.sync_request_announcement_review(bigint)'::regprocedure)
     or not has_function_privilege('sync_runner', 'public.sync_request_announcement_review(bigint)', 'execute')
     or has_function_privilege('anon', 'public.sync_request_announcement_review(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_request_announcement_review(bigint)', 'execute')
     or has_function_privilege('inbox_apply_runner', 'public.sync_request_announcement_review(bigint)', 'execute') then
    v_fail := v_fail || 'sync_request_announcement_review is not SECURITY DEFINER and executable by sync_runner alone'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase26_210 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. The floor
-- =============================================================================================
do $$
begin
  if exists (select 1 from announcement_reviews r join announcements a on a.id = r.announcement_id
              where r.outcome = 'before_floor'
                and (r.request_id is not null
                     or coalesce(a.posted_at, a.captured_at) >= now() - interval '14 days')) then
    raise exception 'FAIL 1: a before_floor row carries a request or covers an announcement newer than 14 days';
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): nothing real is open or unreviewed; two fixtures are.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'announcement_review' and state in ('queued', 'claimed');

insert into announcement_reviews (announcement_id, modified_seen, outcome, summary)
select v.id, coalesce(v.modified_at, v.posted_at), 'nothing', 'phase26_210 setup'
  from v_announcements_unreviewed v
on conflict (announcement_id) do update set modified_seen = excluded.modified_seen;

do $$
declare v_a bigint; v_b bigint;
begin
  insert into announcements (course_id, posted_at, title, body, bb_item_id)
  values ('ECN.304', now(), 'Phase 26 fixture A', 'Quiz 7 is in class.', '_t26_210_a') returning id into v_a;
  insert into announcements (course_id, posted_at, title, body, bb_item_id)
  values ('ECN.304', now() - interval '30 days', 'Phase 26 fixture B', 'An old post nobody reviewed.', '_t26_210_b')
  returning id into v_b;
  insert into _t210 values ('a', v_a, null), ('b', v_b, null);
end $$;

-- =============================================================================================
-- 2. The view
-- =============================================================================================
do $$
declare
  v_a bigint := (select id from _t210 where label = 'a');
  v_b bigint := (select id from _t210 where label = 'b');
begin
  if (select count(*) from v_announcements_unreviewed where id in (v_a, v_b)) <> 2 then
    raise exception 'FAIL 2: an announcement with no review row is not listed';
  end if;
  if (select count(*) from v_announcements_unreviewed) <> 2 then
    raise exception 'FAIL 2: the view lists % rows, expected the two fixtures', (select count(*) from v_announcements_unreviewed);
  end if;

  insert into announcement_reviews (announcement_id, modified_seen, outcome, summary)
  select id, coalesce(modified_at, posted_at), 'nothing', 'reviewed' from announcements where id = v_a;
  if exists (select 1 from v_announcements_unreviewed where id = v_a) then
    raise exception 'FAIL 2: a reviewed announcement is still listed';
  end if;

  update announcements set modified_at = now() + interval '1 hour' where id = v_a;
  if not exists (select 1 from v_announcements_unreviewed where id = v_a and edited_since_review) then
    raise exception 'FAIL 2: an announcement edited since its review is not listed again';
  end if;

  update announcement_reviews set modified_seen = (select modified_at from announcements where id = v_a)
   where announcement_id = v_a;
  if exists (select 1 from v_announcements_unreviewed where id = v_a) then
    raise exception 'FAIL 2: an announcement is listed after the review saw its latest edit';
  end if;
end $$;

-- =============================================================================================
-- 3. Filing the request
-- =============================================================================================
do $$
declare
  v_b      bigint := (select id from _t210 where label = 'b');
  v_sync   bigint;
  v_queued bigint;
  v_other  bigint;
  v_failed bigint;
  v_got    bigint;
  v_again  bigint;
  v_row    record;
begin
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at)
  values ('sync', 'all', 'done', 'sync-runner', now(), now()) returning id into v_sync;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at)
  values ('sync', 'all', 'claimed', 'sync-runner', now()) returning id into v_queued;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at)
  values ('sync', 'all', 'done', 'windows-skill', now(), now()) returning id into v_other;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at)
  values ('sync', 'all', 'failed', 'sync-runner', now(), now()) returning id into v_failed;

  -- Not after a sync that is not done, not the runner's, or not a sync at all.
  if sync_request_announcement_review(null) is not null
     or sync_request_announcement_review(v_queued) is not null
     or sync_request_announcement_review(v_other) is not null
     or sync_request_announcement_review(v_failed) is not null
     or sync_request_announcement_review(-1) is not null then
    raise exception 'FAIL 3: a request was filed after a sync that is not done and the runner''s';
  end if;
  if exists (select 1 from agent_requests where kind = 'announcement_review' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 3: a refused filing left a request behind';
  end if;

  -- After a done sync of the runner's, with one announcement unreviewed (fixture B).
  v_got := sync_request_announcement_review(v_sync);
  if v_got is null then
    raise exception 'FAIL 3: no request was filed after a done sync with an unreviewed announcement';
  end if;
  select kind, scope, state, params into v_row from agent_requests where id = v_got;
  if v_row.kind <> 'announcement_review' or v_row.state <> 'queued'
     or v_row.params is distinct from jsonb_build_object('trigger', 'sync', 'after', v_sync) then
    raise exception 'FAIL 3: the filed request reads %', row_to_json(v_row);
  end if;

  -- An open request is returned as it is, and nothing else is inserted.
  v_again := sync_request_announcement_review(v_sync);
  if v_again is distinct from v_got
     or (select count(*) from agent_requests where kind = 'announcement_review' and state in ('queued', 'claimed')) <> 1 then
    raise exception 'FAIL 3: a second call did not return the open request (got %, expected %)', v_again, v_got;
  end if;
  update agent_requests set state = 'claimed', claimed_by = 'inbox-apply-runner', claimed_at = now() where id = v_got;
  if sync_request_announcement_review(v_sync) is distinct from v_got then
    raise exception 'FAIL 3: a claimed request was not returned as the open one';
  end if;

  -- 4. The one-open index.
  begin
    insert into agent_requests (kind, scope, state) values ('announcement_review', 'all', 'queued');
    raise exception 'FAIL 4: a second open announcement_review request was accepted';
  exception when unique_violation then
    null;
  end;

  -- Nothing unreviewed: no request.
  update agent_requests set state = 'done', finished_at = now() where id = v_got;
  insert into announcement_reviews (announcement_id, modified_seen, outcome, summary)
  select id, coalesce(modified_at, posted_at), 'nothing', 'reviewed' from announcements where id = v_b
  on conflict (announcement_id) do update set modified_seen = excluded.modified_seen;
  if exists (select 1 from v_announcements_unreviewed) then
    raise exception 'FAIL 3: setup left an announcement unreviewed';
  end if;
  if sync_request_announcement_review(v_sync) is not null
     or exists (select 1 from agent_requests where kind = 'announcement_review' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 3: a request was filed with nothing unreviewed';
  end if;
end $$;

select 'phase26_210_announcement_reviews: PASS' as result;

rollback;
