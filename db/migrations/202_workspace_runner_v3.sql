-- bb2dash :: db/migrations/202_workspace_runner_v3.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item D, "A second runner". Worker
-- W-103. Block 200-209 (200-201 W-101's, 207 W-102's, 203-206 the proposals').
--
-- WHY. Stack's answer 5 (2026-10-19): two answers at once, from two conversations, cap 2. Today
-- `workspace_claim_v2` (196) returns nothing while ANY request is claimed, so a second runner only
-- answers when the first is idle; and the heartbeat is one row (`id = 1`, 140), so a second runner
-- writes over the first and nobody can tell how many are alive. Probe P-4 (119a) showed two `claude -p`
-- turns at once on the one subscription both succeed.
--
-- WHAT
--   1. workspace_runner_beats      a new table: one row per runner name, its last beat. RLS on, the
--                                  owner reads it (as 140's heartbeat table), nobody writes it but
--                                  workspace_heartbeat.
--   2. workspace_heartbeat(text)   `create or replace`, same signature and grant: it still upserts 140's
--                                  one row (`id = 1`), which keeps the NEWEST beat of any runner, and
--                                  now also upserts the caller's own row of workspace_runner_beats and
--                                  forgets a row no runner has beaten for 7 days.
--   3. v_workspace_status          `create or replace view`: 143's five columns unchanged (polled_at
--                                  and runner are the newest beat), then two new last columns:
--                                  runners_alive integer (the runners whose last beat is under 90 s
--                                  old) and alive_runners text[] (their names, sorted).
--   4. workspace_claim_v3(text, integer default 2)
--                                  v2's body with ONE rule changed: it claims while fewer than
--                                  p_max_open requests are claimed, across runners, instead of only
--                                  while none is. p_max_open outside 1..4 is refused (22023).
--   5. privileges, then a guard block over what this file states
--
-- THE CAP. workspace_claim_v3 takes v2's advisory lock (key 1400910024), so a v2 claim of the old image
-- and a v3 claim of the new one never interleave during the cut-over: the count of claimed requests a
-- caller reads under the lock is the one it claims against. A conversation still holds at most one
-- open request (140's unique index workspace_requests_one_open), so two claims at once are always two
-- conversations. Each runner still answers one turn at a time (`workspace/src/config.ts`,
-- TURN_CONCURRENCY): the cap is across runners. Everything else is v2's, word for word: the caller's
-- own dead turn closed at once (a runner asks for a claim only when it holds no turn), 143's two
-- sweeps (a claim older than 10 minutes, an assistant row a closed request left behind), the oldest
-- queued request with `for update skip locked`, attempts + 1, the same four columns returned. The
-- own-turn rule needs each runner's name to be its own and stable across a restart: the runner takes
-- it from WORKSPACE_RUNNER_NAME, which compose sets per service (Phase 25b).
--
-- ALIVE. A runner beats every 30 s; its container's healthcheck passes while its last successful beat
-- is under 90 s old (`workspace/src/config.ts`, HEALTH_MAX_AGE_MS). runners_alive uses the same 90 s,
-- strictly: a beat exactly 90 s old is not alive. A name that stopped beating (a renamed or removed
-- runner, or one from before the names were fixed) stops counting 90 s after its last beat and is
-- forgotten after 7 days.
--
-- THE VIEW'S OPTIONS. `create or replace view` replaces a view's options with the list it is given (143's
-- note), so `with (security_invoker = true)` is written out: left out, the view would run as its owner
-- and show the beats to every caller. Its grants and comment survive the replace; the comment is
-- replaced below because this file made it incomplete.
--
-- workspace_runner goes from TWELVE SECURITY DEFINER functions to THIRTEEN (this file's
-- workspace_claim_v3) and still holds no grant on any table, view or sequence. workspace_claim_v2(text)
-- stays as it is, with its grant, so the old image works until the cut-over.
--
-- Additive: one table with its policy, one function, `create or replace` of one function and one view.
-- No column, index or policy of an earlier file changes. No password, key or DSN is in this file.

do $$
begin
  if to_regprocedure('public.workspace_claim_v2(text)') is null
     or to_regprocedure('public.workspace_heartbeat(text)') is null then
    raise exception '202: workspace_claim_v2 or workspace_heartbeat does not exist; apply 142 and 196 first';
  end if;
  if to_regclass('public.workspace_runner_heartbeat') is null or to_regclass('public.v_workspace_status') is null then
    raise exception '202: workspace_runner_heartbeat or v_workspace_status does not exist; apply 140 first';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.v_workspace_status'::regclass
                    and a.attname = 'polled_age_seconds' and not a.attisdropped) then
    raise exception '202: v_workspace_status has no polled_age_seconds; apply 143 first';
  end if;
  if to_regprocedure('public.workspace_search_timing()') is null then
    raise exception '202: workspace_search_timing does not exist; apply 207 first';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_runner_beats
-- =============================================================================================
create table public.workspace_runner_beats (
  runner    text primary key
            constraint workspace_runner_beats_runner_shape
            check (btrim(runner) <> '' and char_length(runner) <= 200),
  polled_at timestamptz not null
);

comment on table public.workspace_runner_beats is
  'The Workspace runners'' beats (migration 202): one row per runner name, its last beat, upserted '
  'every 30 s by workspace_heartbeat(). A runner is alive while its beat is under 90 s old (the '
  'healthcheck''s window); a row not beaten for 7 days is deleted by the next heartbeat. 140''s '
  'workspace_runner_heartbeat still holds the newest beat of any runner. Read through '
  'v_workspace_status (runners_alive, alive_runners).';

alter table public.workspace_runner_beats enable row level security;

create policy workspace_runner_beats_owner_select on public.workspace_runner_beats
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- The project's default ACL hands a new table to anon, authenticated and service_role: take it back,
-- then give each role its list, as 140 did for the heartbeat table.
revoke all on public.workspace_runner_beats from public, anon, authenticated, service_role;
grant select on public.workspace_runner_beats to authenticated, service_role;
-- The units' setup rows (brief 95, "The role db_test_runner"); it reads through 100's default privilege.
grant insert, update, delete on public.workspace_runner_beats to db_test_runner;

-- =============================================================================================
-- 2. workspace_heartbeat: the newest beat in 140's row, and the caller's own beat
-- =============================================================================================
-- 142's body with the marked 202 lines added. 140's row keeps the newest beat: an upsert that
-- reaches it after a later one (two runners' transactions committing out of order) leaves it alone.
create or replace function public.workspace_heartbeat(p_runner text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_runner_max   constant integer  := 200;                 -- 202
  c_forget_after constant interval := interval '7 days';   -- 202
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_heartbeat: p_runner is required' using errcode = '22023';
  end if;
  -- 202: the beats table holds names up to 200 characters.
  if char_length(p_runner) > c_runner_max then
    raise exception 'workspace_heartbeat: p_runner is longer than % characters', c_runner_max
      using errcode = '22023';
  end if;
  insert into workspace_runner_heartbeat as h (id, polled_at, runner)
  values (1, now(), p_runner)
  on conflict (id) do update
     set polled_at = excluded.polled_at, runner = excluded.runner
   where h.polled_at <= excluded.polled_at;                -- 202

  -- 202: the caller's own beat, and the names nobody has beaten for 7 days forgotten.
  insert into workspace_runner_beats as b (runner, polled_at)
  values (p_runner, now())
  on conflict (runner) do update
     set polled_at = excluded.polled_at
   where b.polled_at <= excluded.polled_at;
  delete from workspace_runner_beats b
   where b.polled_at < now() - c_forget_after;
end $$;

comment on function public.workspace_heartbeat(text) is
  'The Workspace runner''s heartbeat (142; the per-runner beat added by 202): upserts the one row of '
  'workspace_runner_heartbeat (id = 1) with polled_at = now() and runner = p_runner unless that row '
  'already holds a later beat, so it keeps the newest beat of any runner; upserts p_runner''s own row '
  'of workspace_runner_beats; deletes the beats older than 7 days. p_runner is required and at most '
  '200 characters (22023). The runner calls it every 30 s on its own timer, during turns too; the page '
  'calls the service offline when polled_at is null or older than 120 s. workspace_runner only.';

-- =============================================================================================
-- 3. v_workspace_status: runners_alive and alive_runners
-- =============================================================================================
-- 143's five columns, unchanged in name, type, order and meaning; the two new ones last. Under
-- security_invoker a caller who is not the owner reads 0 and an empty list, as for the counts.
create or replace view public.v_workspace_status
  with (security_invoker = true) as
select h.polled_at,
       h.runner,
       (select count(*) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))::integer as open_requests,
       (select min(r.created_at) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))          as oldest_open_at,
       case when h.polled_at is not null
            then greatest(0, floor(extract(epoch from (now() - h.polled_at))))::integer
       end                                                as polled_age_seconds,
       (select count(*) from public.workspace_runner_beats b
         where now() - b.polled_at < interval '90 seconds')::integer as runners_alive,
       (select coalesce(array_agg(b.runner order by b.runner collate "C"), '{}'::text[])
          from public.workspace_runner_beats b
         where now() - b.polled_at < interval '90 seconds') as alive_runners
  from (select 1 as id) one
  left join public.workspace_runner_heartbeat h on h.id = one.id;

comment on view public.v_workspace_status is
  'The Workspace service line (migration 140; polled_age_seconds added by 143; runners_alive and '
  'alive_runners by 202): always exactly one row. polled_at and runner are the newest heartbeat of '
  'any runner, null before the first one; open_requests and oldest_open_at count the queued and '
  'claimed requests; polled_age_seconds is the whole seconds from polled_at to the server''s now(), '
  'never negative, null before the first heartbeat. runners_alive counts the runners of '
  'workspace_runner_beats whose last beat is under 90 s old (the runner healthcheck''s window) and '
  'alive_runners names them, sorted, empty when none. Offline = polled_age_seconds null or over 120, '
  'read on the server''s clock: the page adds the time that has passed since its read and never '
  'compares its own wall clock with polled_at. security_invoker with anon revoked, as 036 requires: '
  'a caller who is not the owner gets the row with nulls, 0 and an empty list.';

-- =============================================================================================
-- 4. workspace_claim_v3
-- =============================================================================================
-- 196's workspace_claim_v2 with only what is marked 202 changed. Every column the body reads is
-- qualified by its table alias: the returns-table names are also column names (142's note).
create or replace function public.workspace_claim_v3(p_runner text, p_max_open integer default 2)
  returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lock_key     constant bigint   := 1400910024;
  c_stale_after  constant interval := interval '10 minutes';
  c_orphan_after constant interval := interval '10 minutes';
  c_max_open_min constant integer  := 1;   -- 202
  c_max_open_max constant integer  := 4;   -- 202
  v_id      bigint;
  v_conv    uuid;
  v_message uuid;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_claim_v3: p_runner is required' using errcode = '22023';
  end if;
  -- 202: the cap is a small whole number.
  if p_max_open is null or p_max_open < c_max_open_min or p_max_open > c_max_open_max then
    raise exception 'workspace_claim_v3: p_max_open must be from % to %, not %', c_max_open_min,
      c_max_open_max, coalesce(p_max_open::text, 'null') using errcode = '22023';
  end if;

  -- One claim at a time, across runners and across v2 and v3, until this transaction ends.
  perform pg_advisory_xact_lock(c_lock_key);

  -- A runner asks for a claim only when it holds no turn, so a request still `claimed` under its own
  -- name is its own dead turn: closed at once, with its assistant row.
  with own as (
    update workspace_requests r
       set state = 'failed', error_code = 'stale_claim', finished_at = now()
     where r.state = 'claimed' and r.claimed_by = p_runner
    returning r.id
  )
  update workspace_messages m
     set error_code = 'stale_claim', finished = true
    from own o
   where m.request_id = o.id and m.role = 'assistant';

  -- 143's two sweeps: claims older than 10 minutes, and an assistant row a closed request left behind.
  with swept as (
    update workspace_requests r
       set state = 'failed', error_code = 'stale_claim', finished_at = now()
     where r.state = 'claimed'
       and coalesce(r.claimed_at, r.created_at) < now() - c_stale_after
    returning r.id
  )
  update workspace_messages m
     set error_code = 'stale_claim', finished = true
    from swept s
   where m.request_id = s.id and m.role = 'assistant';

  update workspace_messages m
     set finished = true, error_code = r.error_code
    from workspace_requests r
   where r.id = m.request_id
     and m.role = 'assistant'
     and not m.finished
     and r.state in ('cancelled', 'failed', 'done')
     and r.finished_at < now() - c_orphan_after;

  -- 202: answers are held to p_max_open at a time across runners: nothing once that many are claimed.
  if (select count(*) from workspace_requests r where r.state = 'claimed') >= p_max_open then
    return;
  end if;

  select r.id, r.conversation_id, r.user_message_id
    into v_id, v_conv, v_message
    from workspace_requests r
   where r.state = 'queued'
   order by r.created_at, r.id
   limit 1
     for update skip locked;
  if not found then
    return;
  end if;

  update workspace_requests r
     set state = 'claimed', claimed_at = now(), claimed_by = p_runner, attempts = r.attempts + 1
   where r.id = v_id;

  return query
    select v_id, v_conv, v_message, um.content
      from workspace_messages um
     where um.id = v_message;
end $$;

comment on function public.workspace_claim_v3(text, integer) is
  'The runner''s poll from Phase 25b (202): workspace_claim_v2 with the one-at-a-time rule replaced by '
  'a cap. Refuses (22023) an empty p_runner and a p_max_open outside 1 to 4. Takes v2''s '
  'transaction-level advisory lock; closes as failed / stale_claim any request still claimed under '
  'p_runner''s own name (its dead turn), with its assistant row; runs 143''s two sweeps; returns '
  'NOTHING while p_max_open or more requests are claimed, across runners; otherwise claims the oldest '
  'queued request (for update skip locked, attempts + 1) and returns (request_id, conversation_id, '
  'user_message_id, prompt). A conversation holds at most one open request (140), so two claims at '
  'once are two conversations. workspace_claim_v2(text) is unchanged. workspace_runner only.';

-- =============================================================================================
-- 5. Privileges and the guard
-- =============================================================================================
revoke all on function public.workspace_claim_v3(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.workspace_claim_v3(text, integer) to workspace_runner;

do $$
declare
  f     constant text := 'public.workspace_claim_v3(text, integer)';
  v_got text;
  v_bad text;
begin
  -- (a) The thirteen are exactly the SECURITY DEFINER functions workspace_runner can execute.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_claim_v3,workspace_finish,'
     'workspace_heartbeat,workspace_job_claim,workspace_job_finish,workspace_planner_feed,'
     'workspace_search_timing,workspace_stream,workspace_turn_context,workspace_turn_put' then
    raise exception 'FAIL 202: workspace_runner executes SECURITY DEFINER functions %, expected the thirteen', v_got;
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
    raise exception 'FAIL 202: workspace_runner holds a privilege on %', v_bad;
  end if;

  -- (c) The two functions this file states: SECURITY DEFINER of postgres with a pinned path, and
  --     executable by workspace_runner alone.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_bad
    from pg_proc p
   where p.oid in (f::regprocedure, 'public.workspace_heartbeat(text)'::regprocedure)
     and (not p.prosecdef or p.proowner <> 'postgres'::regrole
          or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']);
  if v_bad is not null then
    raise exception 'FAIL 202: not a SECURITY DEFINER of postgres with search_path pinned: %', v_bad;
  end if;
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who, g.fn) into v_bad
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('sync_runner'),
                 ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   cross join (values (f), ('public.workspace_heartbeat(text)')) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_bad is not null then
    raise exception 'FAIL 202: executable beyond workspace_runner: %', v_bad;
  end if;
  if pg_get_function_result(f::regprocedure) is distinct from
     'TABLE(request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)' then
    raise exception 'FAIL 202: workspace_claim_v3 returns %', pg_get_function_result(f::regprocedure);
  end if;

  -- (d) The view still runs as its caller, and its columns are 143's five with 202's two last.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 202: v_workspace_status is not security_invoker';
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'polled_at timestamp with time zone, runner text, open_requests integer, '
     'oldest_open_at timestamp with time zone, polled_age_seconds integer, '
     'runners_alive integer, alive_runners text[]' then
    raise exception 'FAIL 202: v_workspace_status columns are [%]', v_got;
  end if;

  -- (e) The beats table: row security on, the one select policy, no write for anon or the browser.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.workspace_runner_beats'::regclass) then
    raise exception 'FAIL 202: row security is off on workspace_runner_beats';
  end if;
  select string_agg(p.policyname || ':' || p.cmd, ', ' order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'workspace_runner_beats';
  if v_got is distinct from 'workspace_runner_beats_owner_select:SELECT' then
    raise exception 'FAIL 202: the policies on workspace_runner_beats are [%]', v_got;
  end if;
  if has_table_privilege('anon', 'public.workspace_runner_beats',
                         'select, insert, update, delete, truncate, references, trigger')
     or has_any_column_privilege('anon', 'public.workspace_runner_beats', 'select, insert, update, references')
     or has_table_privilege('authenticated', 'public.workspace_runner_beats',
                            'insert, update, delete, truncate, references, trigger')
     or has_any_column_privilege('authenticated', 'public.workspace_runner_beats', 'insert, update, references')
     or not has_table_privilege('authenticated', 'public.workspace_runner_beats', 'select')
     or not has_table_privilege('service_role', 'public.workspace_runner_beats', 'select') then
    raise exception 'FAIL 202: workspace_runner_beats grants are not select for authenticated and service_role only';
  end if;
end $$;
