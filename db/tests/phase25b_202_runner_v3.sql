-- bb2dash :: db/tests/phase25b_202_runner_v3.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item D, a second runner. Worker
-- W-103. Tests migration 202: `workspace_claim_v3`, the per-runner beat and v_workspace_status's two new
-- columns.
--
--   0. installed, shaped and fenced: claim_v3 SECURITY DEFINER of postgres with a pinned path, its
--      default cap 2, executable by workspace_runner alone; the role executes exactly fourteen (204 adds
--      workspace_propose) and holds no table, view, column or sequence privilege; workspace_runner_beats is row-secured, the owner
--      reads it and nobody else can write it; the view is security_invoker with its seven columns
--   1. claim_v3: two runners hold two claims at once, from two conversations; a third gets nothing at
--      the cap and the request stays queued; a cap of 3 lets it through; a cap of 1 is v2's rule; the
--      caller's own dead turn closed at once; the 10-minute sweep frees a slot; a cap outside 1..4 and an
--      empty name end in 22023; a conversation cannot hold a second open request (23505); v2 unchanged
--   2. heartbeat: one row per runner name; runners_alive and alive_runners count beats under 90 s old
--      (89.999 s alive, exactly 90 s not); 140's row keeps the newest beat; a name not beaten for 7 days
--      is forgotten by the next beat, one of 6 days is kept and not alive; a name over 200 characters
--      ends in 22023; the owner sees the counts, a stranger 0 and an empty list
--
-- Every runner call is made under `set local role workspace_runner` (142's membership), the way the
-- runner calls it; setup rows are written as the session role. The unit first parks, INSIDE this
-- transaction only, every open request and every real beat (moved a day back), so a claim or a count
-- cannot meet a row that is not its own. All data is synthetic. Nothing is committed.
--
-- RED against prod until 202 is applied (25b's cut-over): section 0 stops at "migration 202 is not
-- applied". AN `execute_sql` DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase25b_202_runner_v3.sql`.

begin;

create function pg_temp.w103_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  v text;
  n integer;
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

create function pg_temp.w103_call(p_role text, p_sub text, p_expr text) returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute 'select ' || p_expr into v;
  reset role;
  return v;
end $$;

-- A conversation with its first question and a request in the given state, created p_age ago.
create function pg_temp.w103_req(p_title text, p_state text, p_age interval, p_by text default null) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (v_conv, 'user', 'question ' || p_title, true, now() - p_age) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at, created_at,
                                  finished_at)
  values (v_conv, v_msg, p_state, p_by, case when p_state = 'claimed' then now() - p_age end, now() - p_age,
          case when p_state in ('done', 'failed', 'cancelled') then now() - p_age end)
  returning id into v_req;
  return v_req;
end $$;

-- One heartbeat as the runner.
create function pg_temp.w103_beat(p_runner text) returns void
  language plpgsql as $$
begin
  set local role workspace_runner;
  perform public.workspace_heartbeat(p_runner);
  reset role;
end $$;

-- One claim_v3 call as the runner: the row as jsonb, or null when nothing was handed out.
create function pg_temp.w103_claim(p_runner text, p_max_open integer default null) returns jsonb
  language plpgsql as $$
begin
  return pg_temp.w103_call('workspace_runner', null,
    case when p_max_open is null
         then format('(select to_jsonb(c) from public.workspace_claim_v3(%L) c)', p_runner)
         else format('(select to_jsonb(c) from public.workspace_claim_v3(%L, %s) c)', p_runner, p_max_open)
    end);
end $$;

-- =============================================================================================
-- 0. Installed, shaped and fenced
-- =============================================================================================
do $$
declare
  f      constant text := 'public.workspace_claim_v3(text, integer)';
  v_fail text[] := '{}';
  v_got  text;
  r      record;
begin
  if to_regprocedure(f) is null or to_regclass('public.workspace_runner_beats') is null then
    raise exception 'FAIL phase25b_202: migration 202 is not applied (workspace_claim_v3 or workspace_runner_beats is missing)';
  end if;

  -- claim_v3's shape.
  select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg,
         obj_description(p.oid, 'pg_proc') as note, pg_get_function_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result
    into r from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure;
  if not r.prosecdef then v_fail := v_fail || 'claim_v3 is not security definer'::text; end if;
  if r.lanname <> 'plpgsql' then v_fail := v_fail || format('claim_v3 is %s', r.lanname); end if;
  if r.owner <> 'postgres' then v_fail := v_fail || format('claim_v3 is owned by %s', r.owner); end if;
  if not r.cfg @> array['search_path=public, pg_temp'] then v_fail := v_fail || 'claim_v3 does not pin search_path'::text; end if;
  if r.note is null then v_fail := v_fail || 'claim_v3 has no comment'::text; end if;
  if r.args is distinct from 'p_runner text, p_max_open integer DEFAULT 2' then
    v_fail := v_fail || format('claim_v3 takes (%s)', r.args);
  end if;
  if r.result is distinct from 'TABLE(request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)' then
    v_fail := v_fail || format('claim_v3 returns %s', r.result);
  end if;

  -- heartbeat keeps 142's signature and stays a pinned definer.
  select p.prosecdef, coalesce(p.proconfig, '{}') as cfg, pg_get_function_result(p.oid) as result,
         obj_description(p.oid, 'pg_proc') as note
    into r from pg_proc p where p.oid = 'public.workspace_heartbeat(text)'::regprocedure;
  if not r.prosecdef or not r.cfg @> array['search_path=public, pg_temp'] or r.result <> 'void'
     or r.note not like '%202%' then
    v_fail := v_fail || 'workspace_heartbeat(text) is not the pinned definer returning void that 202 describes'::text;
  end if;

  -- Who may call the two.
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner'), ('inbox_apply_runner'), ('workspace_ingest_runner')) as w(who)
   cross join (values (f), ('public.workspace_heartbeat(text)')) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got); end if;
  if not has_function_privilege('workspace_runner', f, 'execute') then
    v_fail := v_fail || 'workspace_runner cannot execute claim_v3'::text;
  end if;

  -- The fence: the fourteen (since 204), and no relation privilege.
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

  -- The beats table: its columns, row security, its one policy, its grants.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.workspace_runner_beats'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from 'runner text not null, polled_at timestamp with time zone not null' then
    v_fail := v_fail || format('workspace_runner_beats columns are [%s]', v_got);
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.workspace_runner_beats'::regclass) then
    v_fail := v_fail || 'row security is off on workspace_runner_beats'::text;
  end if;
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'), ', ') into v_got
    from pg_policies p where p.schemaname = 'public' and p.tablename = 'workspace_runner_beats';
  if v_got is distinct from 'workspace_runner_beats_owner_select:SELECT:authenticated' then
    v_fail := v_fail || format('workspace_runner_beats policies are [%s]', v_got);
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('anon'), ('workspace_runner'), ('sync_runner'), ('inbox_apply_runner'),
                 ('workspace_ingest_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.workspace_runner_beats',
                             'select, insert, update, delete, truncate, references, trigger');
  if v_got is not null then v_fail := v_fail || format('workspace_runner_beats is open to %s', v_got); end if;
  if has_table_privilege('authenticated', 'public.workspace_runner_beats', 'insert, update, delete, truncate, references, trigger')
     or has_any_column_privilege('authenticated', 'public.workspace_runner_beats', 'insert, update, references')
     or not has_table_privilege('authenticated', 'public.workspace_runner_beats', 'select')
     or not has_table_privilege('service_role', 'public.workspace_runner_beats', 'select') then
    v_fail := v_fail || 'workspace_runner_beats is not select-only for authenticated and service_role'::text;
  end if;

  -- The view: security_invoker, 143's five then 202's two, its grants kept, its comment naming both.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    v_fail := v_fail || 'v_workspace_status is not security_invoker'::text;
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'polled_at timestamp with time zone, runner text, open_requests integer, '
     'oldest_open_at timestamp with time zone, polled_age_seconds integer, '
     'runners_alive integer, alive_runners text[]' then
    v_fail := v_fail || format('v_workspace_status columns are [%s]', v_got);
  end if;
  if not has_table_privilege('authenticated', 'public.v_workspace_status', 'select')
     or not has_table_privilege('service_role', 'public.v_workspace_status', 'select')
     or has_table_privilege('anon', 'public.v_workspace_status', 'select')
     or has_table_privilege('workspace_runner', 'public.v_workspace_status', 'select') then
    v_fail := v_fail || 'v_workspace_status grants are not 140''s'::text;
  end if;
  if coalesce(obj_description('public.v_workspace_status'::regclass, 'pg_class'), '') not like '%runners_alive%'
     or coalesce(obj_description('public.v_workspace_status'::regclass, 'pg_class'), '') not like '%polled_age_seconds%' then
    v_fail := v_fail || 'the comment on v_workspace_status does not name runners_alive and polled_age_seconds'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_202 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. claim_v3
-- =============================================================================================
do $$
declare
  c_r1 constant text := 'w103-r1';
  c_r2 constant text := 'w103-r2';
  c_r3 constant text := 'w103-r3';
  v_ra bigint; v_rb bigint; v_rc bigint; v_rd bigint; v_re bigint;
  v_out jsonb;
  v_row record;
  v_conv uuid;
  v_msg uuid;
begin
  -- Setup (not an assertion): park every open request that really exists, inside this transaction only.
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');

  v_ra := pg_temp.w103_req('w103 202 A', 'queued', interval '3 hours');
  v_rb := pg_temp.w103_req('w103 202 B', 'queued', interval '2 hours');
  v_rc := pg_temp.w103_req('w103 202 C', 'queued', interval '1 hour');

  -- 1a. The first runner gets the oldest, in v2's four columns.
  v_out := pg_temp.w103_claim(c_r1);
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,prompt,request_id,user_message_id'
     or (v_out->>'request_id')::bigint <> v_ra or v_out->>'prompt' <> 'question w103 202 A' then
    raise exception 'FAIL 1a: the first claim returned %', v_out;
  end if;
  select r.state, r.claimed_by, r.attempts, r.claimed_at is not null as stamped into v_row
    from workspace_requests r where r.id = v_ra;
  if v_row.state <> 'claimed' or v_row.claimed_by <> c_r1 or v_row.attempts <> 1 or not v_row.stamped then
    raise exception 'FAIL 1a: after the claim the request reads %', row_to_json(v_row);
  end if;

  -- 1b. Two at once: a second runner gets the next one while the first is claimed (v2 gave nothing).
  v_out := pg_temp.w103_claim(c_r2);
  if (v_out->>'request_id')::bigint is distinct from v_rb
     or (select r.claimed_by from workspace_requests r where r.id = v_rb) is distinct from c_r2 then
    raise exception 'FAIL 1b: the second runner was handed %, not request %', v_out, v_rb;
  end if;
  if (select count(distinct r.conversation_id) from workspace_requests r where r.state = 'claimed') <> 2 then
    raise exception 'FAIL 1b: the two claims are not two conversations';
  end if;

  -- 1c. At the cap (2, the default) a third runner gets nothing and the request stays queued.
  if pg_temp.w103_claim(c_r3) is not null or pg_temp.w103_claim(c_r3, 2) is not null then
    raise exception 'FAIL 1c: a third claim was handed out at the cap of 2';
  end if;
  if (select r.state from workspace_requests r where r.id = v_rc) <> 'queued' then
    raise exception 'FAIL 1c: the queued request moved at the cap';
  end if;

  -- 1d. A cap of 1 is v2's rule: nothing while any request is claimed.
  if pg_temp.w103_claim(c_r3, 1) is not null then
    raise exception 'FAIL 1d: a cap of 1 handed out a request while two were claimed';
  end if;

  -- 1e. A cap of 3 lets the third through.
  v_out := pg_temp.w103_claim(c_r3, 3);
  if (v_out->>'request_id')::bigint is distinct from v_rc then
    raise exception 'FAIL 1e: with a cap of 3 the third claim returned %', v_out;
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_rc;

  -- 1f. A conversation cannot hold a second open request (140's index), so two claims are two conversations.
  select r.conversation_id into v_conv from workspace_requests r where r.id = v_ra;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'w103 a second question', true) returning id into v_msg;
  if pg_temp.w103_try(null, null, format(
       'insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)', v_conv, v_msg)) <> '23505' then
    raise exception 'FAIL 1f: a conversation with a claimed request took a second open one';
  end if;

  -- 1g. The caller's own dead turn is closed at once, with its assistant row, and the next is claimed.
  v_rd := pg_temp.w103_req('w103 202 D', 'queued', interval '30 minutes');
  perform pg_temp.w103_call('workspace_runner', null,
    format('to_jsonb(public.workspace_begin(%s, ''mid'', ''claude-cli'', ''sonnet''))', v_ra));
  v_out := pg_temp.w103_claim(c_r1);
  select r.state, r.error_code, r.finished_at is not null as closed into v_row from workspace_requests r where r.id = v_ra;
  if v_row.state <> 'failed' or v_row.error_code <> 'stale_claim' or not v_row.closed then
    raise exception 'FAIL 1g: the runner''s own dead turn reads %', row_to_json(v_row);
  end if;
  if not exists (select 1 from workspace_messages m where m.request_id = v_ra and m.role = 'assistant'
                    and m.finished and m.error_code = 'stale_claim') then
    raise exception 'FAIL 1g: the dead turn''s assistant row was not finished with stale_claim';
  end if;
  if (v_out->>'request_id')::bigint is distinct from v_rd then
    raise exception 'FAIL 1g: the claim after the closed turn returned %', v_out;
  end if;
  -- The other runner's live claim was not touched.
  if (select r.state || '/' || r.claimed_by from workspace_requests r where r.id = v_rb) <> 'claimed/' || c_r2 then
    raise exception 'FAIL 1g: another runner''s claim was closed with the caller''s own';
  end if;

  -- 1h. The 10-minute sweep frees a slot: a stale claim of a gone runner is closed and the cap counts it no more.
  update workspace_requests set state = 'done', finished_at = now() where id = v_rd;
  update workspace_requests set claimed_at = now() - interval '11 minutes' where id = v_rb;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at)
  select r.conversation_id, r.user_message_id, 'claimed', 'w103-gone', now() - interval '11 minutes'
    from (select c.id as conversation_id, m.id as user_message_id
            from workspace_conversations c join workspace_messages m on m.conversation_id = c.id
           where c.title = 'w103 202 C' and m.role = 'user') r;
  v_re := pg_temp.w103_req('w103 202 E', 'queued', interval '1 minute');
  if (select count(*) from workspace_requests r where r.state = 'claimed') <> 2 then
    raise exception 'FAIL 1h: the setup holds % claimed requests, not 2', (select count(*) from workspace_requests r where r.state = 'claimed');
  end if;
  v_out := pg_temp.w103_claim(c_r3);
  if (v_out->>'request_id')::bigint is distinct from v_re
     or (select count(*) from workspace_requests r
          where r.state = 'failed' and r.error_code = 'stale_claim' and r.claimed_by in (c_r2, 'w103-gone')) <> 2 then
    raise exception 'FAIL 1h: the sweep or the claim after it went wrong: %', v_out;
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_re;

  -- 1i. Refusals: a cap outside 1..4, a null cap, an empty name.
  if pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(''w103-x'', 0)') <> '22023'
     or pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(''w103-x'', 5)') <> '22023'
     or pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(''w103-x'', null)') <> '22023'
     or pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(null)') <> '22023'
     or pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(''  '')') <> '22023' then
    raise exception 'FAIL 1i: a bad cap or an empty runner name did not end in 22023';
  end if;
  if pg_temp.w103_try('workspace_runner', null, 'select * from public.workspace_claim_v3(''w103-x'', 4)') <> 'ok:0' then
    raise exception 'FAIL 1i: a cap of 4 with an empty queue did not return zero rows';
  end if;

  -- 1j. v2 is unchanged: with one request claimed it still hands out nothing.
  v_rd := pg_temp.w103_req('w103 202 F', 'claimed', interval '1 minute', 'w103-other');
  v_re := pg_temp.w103_req('w103 202 G', 'queued', interval '30 seconds');
  if pg_temp.w103_call('workspace_runner', null, '(select to_jsonb(c) from public.workspace_claim_v2(''w103-r1'') c)') is not null
     or (select r.state from workspace_requests r where r.id = v_re) <> 'queued' then
    raise exception 'FAIL 1j: workspace_claim_v2 handed out a request while one was claimed';
  end if;
  if not has_function_privilege('workspace_runner', 'public.workspace_claim_v2(text)', 'execute') then
    raise exception 'FAIL 1j: workspace_claim_v2 lost its grant';
  end if;
end $$;

-- =============================================================================================
-- 2. The heartbeat, runners_alive and alive_runners
-- =============================================================================================
do $$
declare
  c_a constant text := 'w103-a';
  c_b constant text := 'w103-b';
  v_row record;
  v_got text;
begin
  -- Setup (not an assertion): every real beat moved a day back, inside this transaction only, so no
  -- live runner counts; 140's row removed, so the newest beat is this unit's.
  update workspace_runner_beats set polled_at = now() - interval '1 day' where polled_at > now() - interval '1 day';
  delete from workspace_runner_heartbeat where id = 1;

  -- 2a. Nobody alive: 0 and an empty list (never null).
  perform set_config('request.jwt.claim.sub', app_owner()::text, true);
  set local role authenticated;
  select count(*) as n, max(s.runners_alive) as alive, max(array_length(s.alive_runners, 1)) as names,
         bool_and(s.alive_runners = '{}'::text[]) as empty
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.alive is distinct from 0 or v_row.empty is not true then
    raise exception 'FAIL 2a: with no live beat the view reads %', row_to_json(v_row);
  end if;

  -- 2b. Two runners beat: one row each, both alive, sorted; 140's row holds the newest beat.
  perform pg_temp.w103_beat(c_b);
  perform pg_temp.w103_beat(c_a);
  perform pg_temp.w103_beat(c_a);
  if (select count(*) from workspace_runner_beats b where b.runner in (c_a, c_b)) <> 2
     or (select count(*) from workspace_runner_heartbeat) <> 1 then
    raise exception 'FAIL 2b: the beats are not one row per runner and one newest row';
  end if;
  perform set_config('request.jwt.claim.sub', app_owner()::text, true);
  set local role authenticated;
  select s.runners_alive as alive, array_to_string(s.alive_runners, ',') as names, s.runner, s.polled_age_seconds as age
    into v_row from v_workspace_status s;
  reset role;
  if v_row.alive is distinct from 2 or v_row.names is distinct from 'w103-a,w103-b'
     or v_row.runner is distinct from c_a or v_row.age is distinct from 0 then
    raise exception 'FAIL 2b: with two beats the view reads %', row_to_json(v_row);
  end if;

  -- 2c. The 90-second edge: 89.999 s is alive, exactly 90 s is not.
  update workspace_runner_beats set polled_at = now() - interval '89.999 seconds' where runner = c_b;
  if (select s.runners_alive from v_workspace_status s) <> 2 then
    raise exception 'FAIL 2c: a beat 89.999 s old does not count as alive';
  end if;
  update workspace_runner_beats set polled_at = now() - interval '90 seconds' where runner = c_b;
  select array_to_string(s.alive_runners, ',') into v_got from v_workspace_status s;
  if (select s.runners_alive from v_workspace_status s) <> 1 or v_got is distinct from c_a then
    raise exception 'FAIL 2c: a beat exactly 90 s old counts as alive (%)', v_got;
  end if;

  -- 2d. The newest beat is kept: a beat that reaches 140's row after a later one leaves it alone.
  update workspace_runner_heartbeat set polled_at = now() + interval '1 minute', runner = 'w103-later' where id = 1;
  perform pg_temp.w103_beat(c_b);
  if (select h.runner from workspace_runner_heartbeat h where h.id = 1) <> 'w103-later' then
    raise exception 'FAIL 2d: an earlier beat wrote over the newest';
  end if;
  if (select b.polled_at from workspace_runner_beats b where b.runner = c_b) <> now() then
    raise exception 'FAIL 2d: the caller''s own beat was not stamped';
  end if;

  -- 2e. A name not beaten for 7 days is forgotten by the next beat; one of 6 days is kept and not alive.
  insert into workspace_runner_beats (runner, polled_at) values
    ('w103-old', now() - interval '7 days 1 second'),
    ('w103-week', now() - interval '6 days');
  perform pg_temp.w103_beat(c_a);
  if exists (select 1 from workspace_runner_beats b where b.runner = 'w103-old')
     or not exists (select 1 from workspace_runner_beats b where b.runner = 'w103-week') then
    raise exception 'FAIL 2e: the 7-day rule forgot the wrong names';
  end if;
  select array_to_string(s.alive_runners, ',') into v_got from v_workspace_status s;
  if v_got is distinct from 'w103-a,w103-b' then
    raise exception 'FAIL 2e: alive_runners is [%], expected w103-a,w103-b', v_got;
  end if;

  -- 2f. Refusals: an empty name, a name over 200 characters.
  if pg_temp.w103_try('workspace_runner', null, 'select public.workspace_heartbeat(''  '')') <> '22023'
     or pg_temp.w103_try('workspace_runner', null, format('select public.workspace_heartbeat(%L)', repeat('x', 201))) <> '22023' then
    raise exception 'FAIL 2f: an empty or a 201-character name did not end in 22023';
  end if;
  if pg_temp.w103_try('workspace_runner', null, format('select public.workspace_heartbeat(%L)', repeat('x', 200))) <> 'ok:1' then
    raise exception 'FAIL 2f: a 200-character name was refused';
  end if;

  -- 2g. Who sees what: a stranger reads 0 and an empty list; nobody but the function writes a beat.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  set local role authenticated;
  select count(*) as n, max(s.runners_alive) as alive, bool_and(s.alive_runners = '{}'::text[]) as empty,
         (select count(*) from workspace_runner_beats) as rows
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.alive is distinct from 0 or v_row.empty is not true or v_row.rows <> 0 then
    raise exception 'FAIL 2g: a stranger reads %', row_to_json(v_row);
  end if;
  select string_agg(x.what || '=' || x.got, ', ') into v_got
    from (values
      ('owner insert', pg_temp.w103_try('authenticated', app_owner()::text,
         'insert into workspace_runner_beats (runner, polled_at) values (''me'', now())')),
      ('owner update', pg_temp.w103_try('authenticated', app_owner()::text,
         'update workspace_runner_beats set polled_at = now() where runner = ''w103-a''')),
      ('owner delete', pg_temp.w103_try('authenticated', app_owner()::text,
         'delete from workspace_runner_beats where runner = ''w103-a''')),
      ('anon select', pg_temp.w103_try('anon', null, 'select 1 from workspace_runner_beats where runner = ''w103-a''')),
      ('runner select', pg_temp.w103_try('workspace_runner', null, 'select 1 from workspace_runner_beats where runner = ''w103-a''')),
      ('runner status', pg_temp.w103_try('workspace_runner', null, 'select 1 from v_workspace_status'))
    ) as x(what, got)
   where x.got <> '42501';
  if v_got is not null then
    raise exception 'FAIL 2g: these were not refused with 42501: %', v_got;
  end if;
end $$;

select 'phase25b_202_runner_v3: PASS' as result;

rollback;
