-- bb2dash :: db/tests/phase25b_203_proposals.sql
-- Phase 25b (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item E. Worker W-104a. Tests
-- migration 203, `workspace_proposals` (the contract `119b_PHASE25B_contract.md`, "203").
--
--   0. installed and shaped: the sixteen columns in order with their defaults (approved_value last,
--      W-106); row security on with the owner's select and update policies and nothing else; the
--      unique key and the three indexes
--   1. the grants: authenticated selects and updates state, decided_at and approved_value only;
--      service_role selects; anon, workspace_runner, inbox_apply_runner, sync_runner and
--      workspace_ingest_runner hold nothing
--   2. the checks: target, field (planned dates on an assignment only), new_value a string of 1 to
--      2,000 characters, reason 1 to 500, state, decided_at set exactly when decided, approved_value
--      a string of 1 to 2,000 characters set exactly when applied (W-106), one proposal per field of
--      a row per request
--   3. row security: the owner reads and updates his rows; a stranger reads none and updates none;
--      the owner cannot insert or delete
--
-- Setup rows are written as the session role (db_test_runner, 203's grant); the role checks run under
-- `set local role`. All data is synthetic. Nothing is committed.
--
-- RED against prod until 203 is applied (25b's cut-over): section 0 stops at "migration 203 is not
-- applied". RUN IT: `node scripts/db-test.mjs --only phase25b_203_proposals.sql`.

begin;

create function pg_temp.w104_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  n integer;
  v text;
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

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
begin
  if to_regclass('public.workspace_proposals') is null then
    raise exception 'FAIL phase25b_203: migration 203 is not applied (workspace_proposals is missing)';
  end if;

  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end
                    || coalesce(' = ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' order by a.attnum)
    into v_got
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.workspace_proposals'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id bigint not null, created_at timestamp with time zone not null = now(), '
     'expires_at timestamp with time zone not null = (now() + ''7 days''::interval), request_id bigint not null, '
     'conversation_id uuid not null, target text not null, row_id text not null, course_id text, '
     'label text not null, field text not null, old_value jsonb, new_value jsonb not null, reason text not null, '
     'state text not null = ''proposed''::text, decided_at timestamp with time zone, approved_value jsonb' then
    v_fail := v_fail || format('columns are [%s]', v_got);
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.workspace_proposals'::regclass) then
    v_fail := v_fail || 'row security is off'::text;
  end if;
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname) into v_got
    from pg_policies p where p.schemaname = 'public' and p.tablename = 'workspace_proposals';
  if v_got is distinct from
     'workspace_proposals_owner_select:SELECT:authenticated, workspace_proposals_owner_update:UPDATE:authenticated' then
    v_fail := v_fail || format('policies are [%s]', v_got);
  end if;

  select string_agg(regexp_replace(pg_get_indexdef(i.indexrelid), '^.* USING ', ''), ' | '
                    order by regexp_replace(pg_get_indexdef(i.indexrelid), '^.* USING ', '') collate "C")
    into v_got
    from pg_index i where i.indrelid = 'public.workspace_proposals'::regclass;
  if v_got is distinct from
     'btree (conversation_id) | btree (expires_at) WHERE (state = ''proposed''::text) | btree (id) | '
     'btree (request_id) | btree (request_id, target, row_id, field)' then
    v_fail := v_fail || format('indexes are [%s]', v_got);
  end if;
  if not exists (select 1 from pg_index i
                  where i.indrelid = 'public.workspace_proposals'::regclass and i.indisunique
                    and pg_get_indexdef(i.indexrelid) like '%(request_id, target, row_id, field)') then
    v_fail := v_fail || '(request_id, target, row_id, field) is not unique'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_203 (0): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. The grants
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
begin
  select string_agg(w.who, ', ' order by w.who) into v_got
    from (values ('anon'), ('workspace_runner'), ('inbox_apply_runner'), ('sync_runner'),
                 ('workspace_ingest_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.workspace_proposals',
                             'select, insert, update, delete, truncate, references, trigger')
      or has_any_column_privilege(w.who::name, 'public.workspace_proposals', 'select, insert, update, references');
  if v_got is not null then v_fail := v_fail || format('open to %s', v_got); end if;

  select string_agg(a.attname, ',' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.workspace_proposals'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', 'public.workspace_proposals', a.attname, 'update');
  if v_got is distinct from 'state,decided_at,approved_value' then
    v_fail := v_fail || format('authenticated updates [%s]', v_got);
  end if;
  if not has_table_privilege('authenticated', 'public.workspace_proposals', 'select')
     or has_table_privilege('authenticated', 'public.workspace_proposals', 'insert')
     or has_table_privilege('authenticated', 'public.workspace_proposals', 'delete')
     or has_table_privilege('authenticated', 'public.workspace_proposals', 'truncate') then
    v_fail := v_fail || 'authenticated holds more or less than select'::text;
  end if;
  if not has_table_privilege('service_role', 'public.workspace_proposals', 'select')
     or has_table_privilege('service_role', 'public.workspace_proposals', 'insert, update, delete, truncate') then
    v_fail := v_fail || 'service_role holds more or less than select'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_203 (1): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 2. The checks, and 3. row security
-- =============================================================================================
create temp table _w104_203 (k text primary key, v text) on commit drop;

do $$
declare
  v_conv uuid;
  v_msg  uuid;
  v_req  bigint;
  v_id   bigint;
begin
  insert into workspace_conversations (title) values ('w104 203') returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'w104 203 question', true) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at)
  values (v_conv, v_msg, 'claimed', 'w104-203', now()) returning id into v_req;
  insert into workspace_proposals (request_id, conversation_id, target, row_id, label, field, old_value, new_value, reason)
  values (v_req, v_conv, 'assignment_progress', 'ECN.304/w104-203', 'W104 203 item', 'status', 'null', '"submitted"',
          'synthetic')
  returning id into v_id;
  insert into _w104_203 values ('req', v_req::text), ('conv', v_conv::text), ('id', v_id::text);
end $$;

do $$
declare
  v_req   constant bigint := (select v::bigint from _w104_203 where k = 'req');
  v_conv  constant uuid   := (select v::uuid from _w104_203 where k = 'conv');
  v_id    constant bigint := (select v::bigint from _w104_203 where k = 'id');
  v_owner constant text   := (select public.app_owner()::text);
  v_fail  text[] := '{}';
  v_ins   constant text :=
    'insert into public.workspace_proposals (request_id, conversation_id, target, row_id, label, field, new_value, reason, state, decided_at) values (%s, %L, %L, %L, %L, %L, %L::jsonb, %L, %L, %s)';
  -- The same with approved_value (W-106): the value an approval wrote.
  v_ins_a constant text :=
    'insert into public.workspace_proposals (request_id, conversation_id, target, row_id, label, field, new_value, reason, state, decided_at, approved_value) values (%s, %L, %L, %L, %L, %L, %L::jsonb, %L, %L, %s, %s)';
  v_got   text;
  c       record;
begin
  -- 2. Each row below breaks exactly one check (23514), the last one the unique key (23505).
  for c in
    select * from (values
      ('target',         'assignments',         'status',         '"submitted"',               'r', 'proposed', 'null', '23514'),
      ('field',          'assignment_progress', 'score',          '"submitted"',               'r', 'proposed', 'null', '23514'),
      ('planned on rd',  'reading_progress',    'planned_start',  '"2026-10-21"',              'r', 'proposed', 'null', '23514'),
      ('value number',   'assignment_progress', 'notes',          '12',                        'r', 'proposed', 'null', '23514'),
      ('value empty',    'assignment_progress', 'notes',          '""',                        'r', 'proposed', 'null', '23514'),
      ('value 2001',     'assignment_progress', 'notes',          to_jsonb(repeat('n', 2001))::text, 'r', 'proposed', 'null', '23514'),
      ('reason blank',   'assignment_progress', 'notes',          '"x"',                       ' ', 'proposed', 'null', '23514'),
      ('reason 501',     'assignment_progress', 'notes',          '"x"',          repeat('r', 501), 'proposed', 'null', '23514'),
      ('state',          'assignment_progress', 'notes',          '"x"',                       'r', 'done',     'now()', '23514'),
      ('decided open',   'assignment_progress', 'notes',          '"x"',                       'r', 'proposed', 'now()', '23514'),
      ('undecided',      'assignment_progress', 'notes',          '"x"',                       'r', 'rejected', 'null', '23514'),
      ('applied bare',   'assignment_progress', 'notes',          '"x"',                       'r', 'applied',  'now()', '23514'),
      ('duplicate',      'assignment_progress', 'status',         '"graded"',                  'r', 'proposed', 'null', '23505')
    ) as t(what, target, field, val, reason, state, decided, code)
  loop
    v_got := pg_temp.w104_try(null, null,
      format(v_ins, v_req, v_conv, c.target,
             case when c.what = 'duplicate' then 'ECN.304/w104-203' else 'ECN.304/w104-203-' || c.what end,
             'label', c.field, c.val, c.reason, c.state, c.decided));
    if v_got <> c.code then v_fail := v_fail || format('%s: %s, not %s', c.what, v_got, c.code); end if;
  end loop;
  -- approved_value (W-106): a JSON string of 1 to 2,000 characters, set exactly when applied.
  for c in
    select * from (values
      ('approved on proposed', 'proposed', 'null',  '''"x"''::jsonb'),
      ('approved on rejected', 'rejected', 'now()', '''"x"''::jsonb'),
      ('approved number',      'applied',  'now()', '''12''::jsonb'),
      ('approved json null',   'applied',  'now()', '''null''::jsonb'),
      ('approved empty',       'applied',  'now()', '''""''::jsonb'),
      ('approved 2001',        'applied',  'now()', quote_literal(to_jsonb(repeat('a', 2001))::text) || '::jsonb')
    ) as t(what, state, decided, approved)
  loop
    v_got := pg_temp.w104_try(null, null,
      format(v_ins_a, v_req, v_conv, 'assignment_progress', 'ECN.304/w104-203-' || c.what, 'label', 'notes', '"x"',
             'r', c.state, c.decided, c.approved));
    if v_got <> '23514' then v_fail := v_fail || format('%s: %s, not 23514', c.what, v_got); end if;
  end loop;
  -- And the edge that passes: a note of exactly 2,000 characters, applied with its time and a
  -- 2,000-character value written.
  v_got := pg_temp.w104_try(null, null,
    format(v_ins_a, v_req, v_conv, 'assignment_progress', 'ECN.304/w104-203-edge', 'label', 'notes',
           to_jsonb(repeat('n', 2000))::text, repeat('r', 500), 'applied', 'now()',
           quote_literal(to_jsonb(repeat('a', 2000))::text) || '::jsonb'));
  if v_got <> 'ok:1' then v_fail := v_fail || format('a 2,000-character note: %s', v_got); end if;

  -- 3. Row security.
  if pg_temp.w104_try('authenticated', v_owner,
       format('select 1 from public.workspace_proposals where id = %s', v_id)) <> 'ok:1' then
    v_fail := v_fail || 'the owner does not read his row'::text;
  end if;
  if pg_temp.w104_try('authenticated', '00000000-0000-4000-8000-00000000dead',
       format('select 1 from public.workspace_proposals where id = %s', v_id)) <> 'ok:0' then
    v_fail := v_fail || 'a stranger reads the row'::text;
  end if;
  if pg_temp.w104_try('authenticated', '00000000-0000-4000-8000-00000000dead',
       format('update public.workspace_proposals set state = %L, decided_at = now() where id = %s', 'rejected', v_id)) <> 'ok:0' then
    v_fail := v_fail || 'a stranger updates the row'::text;
  end if;
  if pg_temp.w104_try('authenticated', v_owner,
       format('update public.workspace_proposals set new_value = %L where id = %s', '"graded"', v_id)) <> '42501' then
    v_fail := v_fail || 'the owner can rewrite new_value'::text;
  end if;
  if pg_temp.w104_try('authenticated', v_owner, format(v_ins, v_req, v_conv, 'assignment_progress',
       'ECN.304/w104-203-own', 'label', 'notes', '"x"', 'r', 'proposed', 'null')) <> '42501' then
    v_fail := v_fail || 'the owner can insert'::text;
  end if;
  if pg_temp.w104_try('authenticated', v_owner,
       format('delete from public.workspace_proposals where id = %s', v_id)) <> '42501' then
    v_fail := v_fail || 'the owner can delete'::text;
  end if;
  if pg_temp.w104_try('authenticated', v_owner,
       format('update public.workspace_proposals set state = %L, decided_at = now() where id = %s', 'rejected', v_id)) <> 'ok:1' then
    v_fail := v_fail || 'the owner cannot update state and decided_at'::text;
  end if;
  if pg_temp.w104_try('anon', null, 'select 1 from public.workspace_proposals') <> '42501'
     or pg_temp.w104_try('workspace_runner', null, 'select 1 from public.workspace_proposals') <> '42501'
     or pg_temp.w104_try('inbox_apply_runner', null, 'select 1 from public.workspace_proposals') <> '42501' then
    v_fail := v_fail || 'anon, workspace_runner or inbox_apply_runner can read the table'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase25b_203 (2, 3): %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase25b_203_proposals: PASS' as result;

rollback;
