-- bb2dash :: db/tests/phase26_211_reader_functions.sql
-- Phase 26 (the announcement reader; brief 120). Tests migration 211, acting as the role:
--
--   0. installed and shaped: the five functions, the role's one table grant, nothing written by it
--   1. what the role must be refused: the new tables, assignments written directly, a function
--      called on a request that is not its own claim (22023, message starting with the name)
--   2. claim: takes the oldest queued request; a live claim is left alone; its own claim past 16
--      minutes and anybody's past 30 are released failed
--   3. prepare: the six oldest unreviewed, ids and headers only
--   4. record, refused: every check of the brief refuses the WHOLE decision and writes nothing
--   5. record, accepted: add (row, notice, log, review), change (two conflicts, row untouched),
--      ask (with and without an assignment), nothing; an announcement is recorded once
--   6. skip: marks refused once, no-ops after
--   7. an edited announcement is reviewed again
--   8. close: done files one follow-up while unreviewed ones remain; failed files none
--
-- Every call is made under `set local role inbox_apply_runner` (181 grants db_test_runner the role
-- with inherit false). RUN IT: `node scripts/db-test.mjs --only phase26_211_reader_functions.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t211 (label text primary key, id bigint, txt text) on commit drop;

-- One call as the role: ok, SQLSTATE and message on failure, the rows it returned as a jsonb array.
create function pg_temp.t26_as_runner(p_sql text, out ok boolean, out state text, out msg text, out res jsonb)
  language plpgsql as $$
begin
  set local role inbox_apply_runner;
  begin
    if p_sql ~* '^\s*select' then
      execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (' || p_sql || ') t' into res;
    else
      execute p_sql;
      res := '[]'::jsonb;
    end if;
    ok := true;
  exception when others then
    ok := false;
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
  end;
  reset role;
end $$;

-- record, as the role: the function's own result object, or the refusal.
create function pg_temp.t26_rec(p_req bigint, p_ann bigint, p_dec jsonb, out ok boolean, out state text, out msg text, out res jsonb)
  language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.t26_as_runner(
    format('select public.announcement_review_record(%s, %s, %L::jsonb) as r', p_req, p_ann, p_dec::text));
  ok := r.ok; state := r.state; msg := r.msg;
  res := r.res->0->'r';
end $$;

-- Asserts that a decision is refused whole: 22023, the function's name first, and nothing written.
create function pg_temp.t26_refused(p_label text, p_req bigint, p_ann bigint, p_dec jsonb)
  returns void
  language plpgsql as $$
declare
  r record;
  v_asg int := (select count(*) from assignments where id like '%/t26-%');
  v_att int := (select count(*) from attention_items where suggested->>'source' = 'announcement');
  v_log int := (select count(*) from announcement_review_writes);
begin
  select * into r from pg_temp.t26_rec(p_req, p_ann, p_dec);
  if r.ok then
    raise exception 'FAIL 4: % was accepted', p_label;
  end if;
  if r.state <> '22023' or r.msg not like 'announcement_review_record:%' then
    raise exception 'FAIL 4: % was refused with % "%", expected 22023 and the function''s name first', p_label, r.state, r.msg;
  end if;
  if (select count(*) from assignments where id like '%/t26-%') <> v_asg
     or (select count(*) from attention_items where suggested->>'source' = 'announcement') <> v_att
     or (select count(*) from announcement_review_writes) <> v_log
     or exists (select 1 from announcement_reviews where announcement_id = p_ann and request_id is not null) then
    raise exception 'FAIL 4: the refusal of % left a write behind', p_label;
  end if;
end $$;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  f      text;
  v_got  text;
  v_fns  text[] := array[
    'public.announcement_review_claim()',
    'public.announcement_review_prepare(bigint)',
    'public.announcement_review_record(bigint, bigint, jsonb)',
    'public.announcement_review_skip(bigint, bigint, text)',
    'public.announcement_review_close(bigint, text, jsonb)'];
begin
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase26_211: migration 211 is not applied (% is missing)', f;
    end if;
    if not (select p.prosecdef and p.proconfig = array['search_path=public, pg_temp'] from pg_proc p where p.oid = f::regprocedure) then
      v_fail := v_fail || format('%s is not SECURITY DEFINER with search_path public, pg_temp', f);
    end if;
    if not has_function_privilege('inbox_apply_runner', f, 'execute')
       or has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute') then
      v_fail := v_fail || format('%s is not executable by inbox_apply_runner alone', f);
    end if;
  end loop;
  if has_function_privilege('inbox_apply_runner', 'public.announcement_review_is_own_claim(bigint)', 'execute') then
    v_fail := v_fail || 'the claim helper is executable by the role'::text;
  end if;

  select string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv) into v_got
    from pg_class c
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) p(priv)
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('announcement_reviews', 'announcement_review_writes', 'announcements', 'v_announcements_unreviewed')
     and has_table_privilege('inbox_apply_runner', c.oid, p.priv);
  if v_got is distinct from 'announcements:select' then
    v_fail := v_fail || format('the role holds %s on the announcement tables', v_got);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'announcements'
                   and policyname = 'announcements_inbox_apply_read' and roles = '{inbox_apply_runner}' and cmd = 'SELECT') then
    v_fail := v_fail || 'announcements has no select policy for the role'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase26_211 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): nothing real is open or unreviewed; eight fixture posts are.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'announcement_review' and state in ('queued', 'claimed');
update agent_requests set claimed_by = 'phase26_211 setup'
 where kind in ('inbox_feedback', 'announcement_review') and claimed_by = 'inbox-apply-runner' and state in ('done', 'failed');

insert into announcement_reviews (announcement_id, modified_seen, outcome, summary)
select v.id, coalesce(v.modified_at, v.posted_at), 'nothing', 'phase26_211 setup'
  from v_announcements_unreviewed v
on conflict (announcement_id) do update set modified_seen = excluded.modified_seen;

do $$
declare
  v_id bigint;
  i    int;
  v_title text;
  v_body  text;
begin
  for i in 1..8 loop
    v_title := case i when 1 then 'Quiz 7 This Thursday (10/29)' when 2 then 'Homework 3 update'
                      when 3 then 'Cancelling Class Today' when 4 then 'Welcome' else 'Phase 26 filler ' || i end;
    v_body  := case i when 1 then E'Hello class,\nQuiz 7 will be held in class on  Thursday 10/29.\n  Bring a pencil.'
                      when 2 then 'Homework 3 is now due on Thursday, November 5th at 9:30 AM. It is worth 20 points.'
                      when 3 then 'Class is cancelled today.' when 4 then 'Welcome to the course.'
                      else 'Filler text ' || i end;
    insert into announcements (course_id, posted_at, title, body, bb_item_id)
    values ('ECN.304', now() - ((10 - i) * interval '1 minute'), v_title, v_body, '_t26_211_' || i)
    returning id into v_id;
    insert into _t211 values ('f' || i, v_id, null);
  end loop;

  insert into assignments (id, course_id, title, type, due_at, points_possible)
  values ('ECN.304/t26-hw', 'ECN.304', 'Homework 3', 'homework', '2026-11-01 14:00+00', 10);
  insert into assignments (id, course_id, title, type, due_at)
  values ('IST.323/t26-other', 'IST.323', 'Other course homework', 'homework', '2026-11-02 14:00+00');
end $$;

-- =============================================================================================
-- 1. What the role must be refused
-- =============================================================================================
do $$
declare
  v_case record;
  r      record;
begin
  for v_case in
    select * from (values
      ('read the review table',  'select 1 from announcement_reviews limit 1'),
      ('read the write log',     'select 1 from announcement_review_writes limit 1'),
      ('read the view',          'select 1 from v_announcements_unreviewed limit 1'),
      ('write a review',         'insert into announcement_reviews (announcement_id, outcome) values (1, ''nothing'')'),
      ('write the log',          'insert into announcement_review_writes (announcement_id, action) values (1, ''add'')'),
      ('write an announcement',  'update announcements set title = title where false'),
      ('delete an announcement', 'delete from announcements where false'),
      ('ask whose claim it is',  'select announcement_review_is_own_claim(1)'),
      ('call the text helper',   'select announcement_review_text(''{}''::jsonb, ''k'', 1, false)')
    ) t(label, stmt)
  loop
    select * into r from pg_temp.t26_as_runner(v_case.stmt);
    if r.ok or r.state <> '42501' then
      raise exception 'FAIL 1: the role was not refused (42501) when it tried to %: got % %', v_case.label, r.state, r.msg;
    end if;
  end loop;
end $$;

do $$
declare
  c record;
  r record;
begin
  -- A request that is not the worker's own claim: every function refuses, naming itself.
  for c in
    select * from (values
      ('announcement_review_prepare', 'select announcement_review_prepare(-1)'),
      ('announcement_review_record',  'select announcement_review_record(-1, -1, ''{}''::jsonb)'),
      ('announcement_review_skip',    'select announcement_review_skip(-1, -1, ''why'')'),
      ('announcement_review_close',   'select announcement_review_close(-1, ''done'', ''{}''::jsonb)')
    ) t(fn, stmt)
  loop
    select * into r from pg_temp.t26_as_runner(c.stmt);
    if r.ok or r.state <> '22023' or r.msg not like c.fn || ':%' then
      raise exception 'FAIL 1: % on a request that is not the claim gave % "%"', c.fn, r.state, r.msg;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 2. Claim
-- =============================================================================================
do $$
declare
  r1 bigint; r2 bigint; v_row record; r record;
begin
  -- Nothing queued: no row.
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if not r.ok or r.res <> '[]'::jsonb then
    raise exception 'FAIL 2: claim with nothing queued returned % % %', r.ok, r.state, r.res;
  end if;

  insert into agent_requests (kind, scope, state, params, note)
  values ('announcement_review', 'all', 'queued', '{"trigger":"sync"}', 'phase26_211 R1') returning id into r1;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if not r.ok or (r.res->0->>'id')::bigint is distinct from r1 then
    raise exception 'FAIL 2: claim returned % % %, expected request %', r.ok, r.state, r.res, r1;
  end if;
  select state, claimed_by, claim_attempts into v_row from agent_requests where id = r1;
  if v_row.state <> 'claimed' or v_row.claimed_by <> 'inbox-apply-runner' or v_row.claim_attempts <> 1 then
    raise exception 'FAIL 2: after the claim the request reads %', row_to_json(v_row);
  end if;

  -- A live claim (the worker's own, 10 minutes old) is left alone.
  update agent_requests set claimed_at = now() - interval '10 minutes' where id = r1;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if not r.ok or r.res <> '[]'::jsonb or (select state from agent_requests where id = r1) <> 'claimed' then
    raise exception 'FAIL 2: a live claim of its own was released or something was claimed beside it';
  end if;

  -- Somebody else's claim, 20 minutes old: live. 40 minutes old: released failed, interrupted.
  update agent_requests set claimed_by = 'someone-else', claimed_at = now() - interval '20 minutes' where id = r1;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if (select state from agent_requests where id = r1) <> 'claimed' then
    raise exception 'FAIL 2: another claimant''s 20-minute claim was released';
  end if;
  update agent_requests set claimed_at = now() - interval '40 minutes' where id = r1;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  select state, result->>'error' as err, result->'claude'->>'started' as started into v_row from agent_requests where id = r1;
  if v_row.state <> 'failed' or v_row.err <> 'interrupted' or v_row.started <> 'false' then
    raise exception 'FAIL 2: another claimant''s 40-minute claim was not released failed: %', row_to_json(v_row);
  end if;

  -- The worker's own claim past 16 minutes is released and counts as a run that started.
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at)
  values ('announcement_review', 'all', 'claimed', 'inbox-apply-runner', now() - interval '17 minutes')
  returning id into r2;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  select state, result->'claude'->>'started' as started into v_row from agent_requests where id = r2;
  if v_row.state <> 'failed' or v_row.started <> 'true' then
    raise exception 'FAIL 2: the worker''s own 17-minute claim was not released: %', row_to_json(v_row);
  end if;
  update agent_requests set claimed_by = 'phase26_211 setup' where id = r2;

  -- The request the rest of the unit works.
  insert into agent_requests (kind, scope, state, params, note)
  values ('announcement_review', 'all', 'queued', '{"trigger":"sync"}', 'phase26_211 R3') returning id into r2;
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if (r.res->0->>'id')::bigint is distinct from r2 then
    raise exception 'FAIL 2: the working request was not claimed (got %)', r.res;
  end if;
  insert into _t211 values ('req', r2, null);
end $$;

-- =============================================================================================
-- 3. Prepare
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  r record;
  v_ids bigint[];
  v_want bigint[];
begin
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_prepare(%s) as p', v_req));
  if not r.ok then raise exception 'FAIL 3: prepare failed: % %', r.state, r.msg; end if;
  select array_agg((e->>'id')::bigint order by ord) into v_ids
    from jsonb_array_elements(r.res->0->'p'->'announcements') with ordinality as t(e, ord);
  select array_agg(id order by label) into v_want from _t211 where label in ('f1','f2','f3','f4','f5','f6');
  if v_ids is distinct from v_want then
    raise exception 'FAIL 3: prepare listed %, expected the six oldest %', v_ids, v_want;
  end if;
  if (r.res->0->'p'->>'runs_today')::int <> 0 then
    raise exception 'FAIL 3: runs_today is %, expected 0', r.res->0->'p'->>'runs_today';
  end if;
  if exists (select 1 from jsonb_array_elements(r.res->0->'p'->'announcements') e
              where e ? 'body' or not (e ?& array['id','course_id','title','posted_at','modified_at','bb_item_id'])) then
    raise exception 'FAIL 3: prepare returned text, or lacks a header field';
  end if;
end $$;

-- =============================================================================================
-- 4. record, refused (all on f1; every refusal leaves nothing behind)
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  v_f1  bigint := (select id from _t211 where label = 'f1');
  v_add jsonb := jsonb_build_object(
    'slug', 't26-quiz-7', 'title', 'Quiz 7', 'type', 'quiz', 'due_at', null, 'due_date', '2026-10-29',
    'event_start', null, 'submission', 'in_class', 'series_key', 'ECN.304/quiz', 'sequence_no', 7,
    'points_possible', null, 'description', null, 'question', 'Quiz 7 is in class on Thursday 10/29.',
    'quote', 'Quiz 7 will be held in class on Thursday 10/29');
  v_chg jsonb := jsonb_build_object(
    'assignment_id', 'ECN.304/t26-hw', 'field', 'points_possible', 'to_value', 20,
    'question', 'Is Homework 3 worth 20 points?', 'quote', 'quiz 7 will be held');
  v_ask jsonb := jsonb_build_object('assignment_id', null, 'question', 'What is this?', 'quote', 'bring a pencil');
  v_six jsonb;
begin
  -- shape and counts
  perform pg_temp.t26_refused('a non-object decision', v_req, v_f1, '[]'::jsonb);
  perform pg_temp.t26_refused('no outcome', v_req, v_f1, jsonb_build_object('summary', 's'));
  perform pg_temp.t26_refused('an unknown outcome', v_req, v_f1, jsonb_build_object('outcome', 'maybe', 'summary', 's'));
  perform pg_temp.t26_refused('no summary', v_req, v_f1, jsonb_build_object('outcome', 'nothing'));
  perform pg_temp.t26_refused('a summary past 300 characters', v_req, v_f1,
    jsonb_build_object('outcome', 'nothing', 'summary', repeat('x', 301)));
  perform pg_temp.t26_refused('acted with all arrays empty', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's'));
  perform pg_temp.t26_refused('nothing with an entry', v_req, v_f1,
    jsonb_build_object('outcome', 'nothing', 'summary', 's', 'ask', jsonb_build_array(v_ask)));
  perform pg_temp.t26_refused('an array that is not an array', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'ask', v_ask));
  v_six := jsonb_build_array(v_ask, v_ask, v_ask, v_ask, v_ask, v_ask);
  perform pg_temp.t26_refused('six asks', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'ask', v_six));

  -- quotes
  perform pg_temp.t26_refused('a quote not in the post', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"quote":"Quiz 8 will be held"}')));
  perform pg_temp.t26_refused('an empty quote', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"quote":"   "}')));
  perform pg_temp.t26_refused('a missing quote', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add - 'quote')));
  perform pg_temp.t26_refused('a quote past 500 characters', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add',
      jsonb_build_array(v_add || jsonb_build_object('quote', repeat('quiz ', 101)))));
  perform pg_temp.t26_refused('a change quote not in the post', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change', jsonb_build_array(v_chg || '{"quote":"worth 20 points"}')));
  perform pg_temp.t26_refused('an ask quote not in the post', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'ask', jsonb_build_array(v_ask || '{"quote":"bring a calculator"}')));

  -- add
  perform pg_temp.t26_refused('a slug with a capital and a space', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"slug":"Quiz 7"}')));
  perform pg_temp.t26_refused('a slug starting with a hyphen', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"slug":"-quiz"}')));
  perform pg_temp.t26_refused('a slug past 60 characters', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add',
      jsonb_build_array(v_add || jsonb_build_object('slug', repeat('a', 61)))));
  perform pg_temp.t26_refused('an id that exists', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"slug":"quiz-5"}')));
  perform pg_temp.t26_refused('the same slug twice', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add, v_add)));
  perform pg_temp.t26_refused('a type that is not an assignment type', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"type":"quizz"}')));
  perform pg_temp.t26_refused('no date at all', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"due_date":null}')));
  perform pg_temp.t26_refused('a date that is not a date', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"due_date":"next week"}')));
  perform pg_temp.t26_refused('a series key of another course', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"series_key":"IST.323/quiz"}')));
  perform pg_temp.t26_refused('a submission channel that does not exist', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"submission":"carrier pigeon"}')));
  perform pg_temp.t26_refused('a negative point value', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add || '{"points_possible":-1}')));
  perform pg_temp.t26_refused('a description past 1000 characters', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add',
      jsonb_build_array(v_add || jsonb_build_object('description', repeat('d', 1001)))));
  perform pg_temp.t26_refused('a question past 300 characters', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add',
      jsonb_build_array(v_add || jsonb_build_object('question', repeat('q', 301)))));

  -- change
  perform pg_temp.t26_refused('a change to an assignment of another course', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change',
      jsonb_build_array(v_chg || '{"assignment_id":"IST.323/t26-other"}')));
  perform pg_temp.t26_refused('a change to an assignment that does not exist', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change',
      jsonb_build_array(v_chg || '{"assignment_id":"ECN.304/nope"}')));
  perform pg_temp.t26_refused('a change to a field off the list', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change', jsonb_build_array(v_chg || '{"field":"title"}')));
  perform pg_temp.t26_refused('points that are not a number', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change', jsonb_build_array(v_chg || '{"to_value":"twenty"}')));
  perform pg_temp.t26_refused('a due_at that does not cast', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change',
      jsonb_build_array(v_chg || '{"field":"due_at","to_value":"next week"}')));
  perform pg_temp.t26_refused('a change to the value it already has', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change', jsonb_build_array(v_chg || '{"to_value":10}')));
  perform pg_temp.t26_refused('two changes to one field', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'change', jsonb_build_array(v_chg, v_chg)));

  -- ask
  perform pg_temp.t26_refused('an ask about an assignment of another course', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'ask',
      jsonb_build_array(v_ask || '{"assignment_id":"IST.323/t26-other"}')));
  perform pg_temp.t26_refused('two asks about one assignment', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'ask',
      jsonb_build_array(v_ask || '{"assignment_id":"ECN.304/t26-hw"}', v_ask || '{"assignment_id":"ECN.304/t26-hw"}')));

  -- all or nothing: a good add beside a bad ask writes no add
  perform pg_temp.t26_refused('a good add beside a bad ask', v_req, v_f1,
    jsonb_build_object('outcome', 'acted', 'summary', 's', 'add', jsonb_build_array(v_add),
                       'ask', jsonb_build_array(v_ask || '{"quote":"not in the post at all"}')));
  if exists (select 1 from assignments where id = 'ECN.304/t26-quiz-7') then
    raise exception 'FAIL 4: the add of a refused decision was written';
  end if;
end $$;

-- =============================================================================================
-- 5. record, accepted
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  v_f1  bigint := (select id from _t211 where label = 'f1');
  v_f2  bigint := (select id from _t211 where label = 'f2');
  v_f3  bigint := (select id from _t211 where label = 'f3');
  v_f4  bigint := (select id from _t211 where label = 'f4');
  v_dec jsonb;
  r     record;
  v_row record;
  v_item bigint;
begin
  -- 5a. add: a quote that differs from the post in case and spacing, found after normalising.
  v_dec := jsonb_build_object('outcome', 'acted', 'summary', 'Adds Quiz 7, in class Thursday 10/29.',
    'add', jsonb_build_array(jsonb_build_object(
      'slug', 't26-quiz-7', 'title', 'Quiz 7', 'type', 'quiz', 'due_at', null, 'due_date', '2026-10-29',
      'event_start', null, 'submission', 'in_class', 'series_key', 'ECN.304/quiz', 'sequence_no', 7,
      'points_possible', null, 'description', null,
      'question', 'Quiz 7 is in class on Thursday 10/29. Added to your planner.',
      'quote', 'QUIZ 7 will be   held in class on' || E'\n' || 'thursday 10/29')));
  select * into r from pg_temp.t26_rec(v_req, v_f1, v_dec);
  if not r.ok then raise exception 'FAIL 5a: the add was refused: % %', r.state, r.msg; end if;
  if r.res->'added' <> '["ECN.304/t26-quiz-7"]'::jsonb or jsonb_array_length(r.res->'raised') <> 1 then
    raise exception 'FAIL 5a: record returned %', r.res;
  end if;
  select a.* into v_row from assignments a where a.id = 'ECN.304/t26-quiz-7';
  if v_row.title <> 'Quiz 7' or v_row.type::text <> 'quiz' or v_row.source::text <> 'blackboard'
     or v_row.confidence::text <> 'tentative' or v_row.recurrence::text <> 'one_off'
     or v_row.bb_item_id <> '_t26_211_1' or v_row.due_date <> date '2026-10-29' or v_row.due_at is not null
     or v_row.submission::text <> 'in_class' or v_row.series_key <> 'ECN.304/quiz' or v_row.sequence_no <> 7
     or v_row.bb_column_id is not null
     or v_row.source_ref <> format('announcement _t26_211_1 (%s)', (select posted_at::date from announcements where id = v_f1)) then
    raise exception 'FAIL 5a: the added row reads %', row_to_json(v_row);
  end if;
  v_item := (r.res->'raised'->>0)::bigint;
  select i.kind, i.course_id, i.entity, i.ref, i.field, i.state, i.question, i.suggested, i.to_value into v_row
    from attention_items i where i.id = v_item;
  if v_row.kind <> 'deadline' or v_row.course_id <> 'ECN.304' or v_row.entity <> 'assignment'
     or v_row.ref <> 'ECN.304/t26-quiz-7' or v_row.field <> 'announcement_add' or v_row.state <> 'open'
     or v_row.to_value <> to_jsonb('2026-10-29'::text)
     or v_row.suggested->>'source' <> 'announcement' or (v_row.suggested->>'announcement_id')::bigint <> v_f1
     or v_row.suggested->>'bb_item_id' <> '_t26_211_1'
     or v_row.suggested->>'announcement_title' <> 'Quiz 7 This Thursday (10/29)'
     or v_row.suggested->>'quote' <> 'QUIZ 7 will be   held in class on' || E'\n' || 'thursday 10/29'
     or v_row.suggested->>'posted_at' is null then
    raise exception 'FAIL 5a: the notice reads %', row_to_json(v_row);
  end if;
  select w.* into v_row from announcement_review_writes w where w.announcement_id = v_f1;
  if v_row.request_id <> v_req or v_row.action <> 'add' or v_row.assignment_id <> 'ECN.304/t26-quiz-7'
     or v_row.attention_item_id <> v_item then
    raise exception 'FAIL 5a: the write log reads %', row_to_json(v_row);
  end if;
  select rv.* into v_row from announcement_reviews rv where rv.announcement_id = v_f1;
  if v_row.outcome <> 'acted' or v_row.request_id <> v_req or v_row.detail <> v_dec
     or v_row.summary <> 'Adds Quiz 7, in class Thursday 10/29.'
     or v_row.modified_seen <> (select posted_at from announcements where id = v_f1) then
    raise exception 'FAIL 5a: the review reads %', row_to_json(v_row);
  end if;
  -- recorded once
  select * into r from pg_temp.t26_rec(v_req, v_f1, v_dec);
  if r.ok or r.state <> '22023' or r.msg not like 'announcement_review_record:%already reviewed%' then
    raise exception 'FAIL 5a: a second record of the same announcement gave % "%"', r.state, r.msg;
  end if;

  -- 5b. change: two conflicts, the row itself untouched (apply_resolutions writes it on an Accept).
  v_dec := jsonb_build_object('outcome', 'acted', 'summary', 'Homework 3 moves to Nov 5 9:30 AM and is worth 20.',
    'change', jsonb_build_array(
      jsonb_build_object('assignment_id', 'ECN.304/t26-hw', 'field', 'due_at', 'to_value', '2026-11-05T14:30:00Z',
        'question', 'Homework 3 is now due Thursday Nov 5 at 9:30 AM. Accept?',
        'quote', 'due on Thursday, November 5th at 9:30 AM'),
      jsonb_build_object('assignment_id', 'ECN.304/t26-hw', 'field', 'points_possible', 'to_value', 20,
        'question', 'Homework 3 is now worth 20 points. Accept?', 'quote', 'It is worth 20 points')));
  select * into r from pg_temp.t26_rec(v_req, v_f2, v_dec);
  if not r.ok then raise exception 'FAIL 5b: the change was refused: % %', r.state, r.msg; end if;
  if r.res->'added' <> '[]'::jsonb or jsonb_array_length(r.res->'raised') <> 2 then
    raise exception 'FAIL 5b: record returned %', r.res;
  end if;
  if (select due_at from assignments where id = 'ECN.304/t26-hw') <> timestamptz '2026-11-01 14:00+00'
     or (select points_possible from assignments where id = 'ECN.304/t26-hw') <> 10 then
    raise exception 'FAIL 5b: a change was written to the assignment directly';
  end if;
  select i.* into v_row from attention_items i
   where i.suggested->>'announcement_id' = v_f2::text and i.field = 'due_at';
  if v_row.kind <> 'conflict' or v_row.entity <> 'assignment' or v_row.ref <> 'ECN.304/t26-hw'
     or v_row.state <> 'open' or (v_row.from_value #>> '{}')::timestamptz <> timestamptz '2026-11-01 14:00+00'
     or (v_row.to_value #>> '{}')::timestamptz <> timestamptz '2026-11-05 14:30+00'
     or v_row.suggested->>'source' <> 'announcement' or v_row.suggested->>'quote' <> 'due on Thursday, November 5th at 9:30 AM' then
    raise exception 'FAIL 5b: the due_at conflict reads %', row_to_json(v_row);
  end if;
  select i.* into v_row from attention_items i
   where i.suggested->>'announcement_id' = v_f2::text and i.field = 'points_possible';
  if v_row.kind <> 'conflict' or v_row.from_value <> to_jsonb(10) or v_row.to_value <> to_jsonb(20) then
    raise exception 'FAIL 5b: the points conflict reads %', row_to_json(v_row);
  end if;
  if (select count(*) from announcement_review_writes where announcement_id = v_f2 and action = 'change'
        and attention_item_id is not null) <> 2 then
    raise exception 'FAIL 5b: the write log does not hold two change rows';
  end if;

  -- 5c. ask: one about the announcement, one about an assignment.
  v_dec := jsonb_build_object('outcome', 'acted', 'summary', 'Class cancelled; asks what it means for the schedule.',
    'ask', jsonb_build_array(
      jsonb_build_object('assignment_id', null, 'question', 'Class is cancelled today. Does anything move?',
        'quote', 'Class is cancelled today'),
      jsonb_build_object('assignment_id', 'ECN.304/t26-hw', 'question', 'Does the cancelled class move Homework 3?',
        'quote', 'cancelling class today')));
  select * into r from pg_temp.t26_rec(v_req, v_f3, v_dec);
  if not r.ok then raise exception 'FAIL 5c: the ask was refused: % %', r.state, r.msg; end if;
  select i.* into v_row from attention_items i
   where i.suggested->>'announcement_id' = v_f3::text and i.entity = 'announcement';
  if v_row.kind <> 'stack_must_confirm' or v_row.ref <> 'announcement:_t26_211_3' or v_row.field <> 'announcement'
     or v_row.course_id <> 'ECN.304' or v_row.state <> 'open' then
    raise exception 'FAIL 5c: the announcement ask reads %', row_to_json(v_row);
  end if;
  select i.* into v_row from attention_items i
   where i.suggested->>'announcement_id' = v_f3::text and i.entity = 'assignment';
  if v_row.kind <> 'stack_must_confirm' or v_row.ref <> 'ECN.304/t26-hw' or v_row.field <> 'announcement' then
    raise exception 'FAIL 5c: the assignment ask reads %', row_to_json(v_row);
  end if;
  if (select count(*) from announcement_review_writes where announcement_id = v_f3 and action = 'ask') <> 2 then
    raise exception 'FAIL 5c: the write log does not hold two ask rows';
  end if;

  -- 5d. nothing
  select * into r from pg_temp.t26_rec(v_req, v_f4,
    jsonb_build_object('outcome', 'nothing', 'summary', 'A welcome post; no graded work.'));
  if not r.ok or r.res <> '{"added": [], "raised": []}'::jsonb then
    raise exception 'FAIL 5d: nothing was refused or returned %: % %', r.res, r.state, r.msg;
  end if;
  if (select outcome from announcement_reviews where announcement_id = v_f4) <> 'nothing'
     or exists (select 1 from announcement_review_writes where announcement_id = v_f4) then
    raise exception 'FAIL 5d: the nothing decision wrote a log row or the wrong outcome';
  end if;
end $$;

-- =============================================================================================
-- 6. skip
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  v_f1  bigint := (select id from _t211 where label = 'f1');
  v_f5  bigint := (select id from _t211 where label = 'f5');
  r record;
begin
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_skip(%s, %s, %L) as s', v_req, v_f5, 'no decision recorded'));
  if not r.ok or r.res->0->'s' <> 'true'::jsonb then
    raise exception 'FAIL 6: skip returned % % %', r.ok, r.state, r.res;
  end if;
  if (select outcome from announcement_reviews where announcement_id = v_f5) <> 'refused'
     or (select detail from announcement_reviews where announcement_id = v_f5) <> '{"why": "no decision recorded"}'::jsonb
     or exists (select 1 from v_announcements_unreviewed where id = v_f5) then
    raise exception 'FAIL 6: skip did not mark the announcement refused';
  end if;
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_skip(%s, %s, %L) as s', v_req, v_f5, 'again'));
  if not r.ok or r.res->0->'s' <> 'false'::jsonb then
    raise exception 'FAIL 6: a second skip returned % %', r.ok, r.res;
  end if;
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_skip(%s, %s, %L) as s', v_req, v_f1, 'late'));
  if not r.ok or r.res->0->'s' <> 'false'::jsonb or (select outcome from announcement_reviews where announcement_id = v_f1) <> 'acted' then
    raise exception 'FAIL 6: a skip overwrote a recorded review';
  end if;
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_skip(%s, %s, %L) as s', v_req, (select id from _t211 where label = 'f6'), ''));
  if r.ok or r.state <> '22023' or r.msg not like 'announcement_review_skip:%' then
    raise exception 'FAIL 6: an empty reason gave % %', r.state, r.msg;
  end if;
end $$;

-- =============================================================================================
-- 7. An edited announcement is reviewed again
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  v_f4  bigint := (select id from _t211 where label = 'f4');
  r record;
begin
  update announcements set modified_at = now() + interval '1 hour' where id = v_f4;
  if not exists (select 1 from v_announcements_unreviewed where id = v_f4) then
    raise exception 'FAIL 7: an edited announcement is not unreviewed';
  end if;
  select * into r from pg_temp.t26_rec(v_req, v_f4,
    jsonb_build_object('outcome', 'nothing', 'summary', 'Edited; still no graded work.'));
  if not r.ok then raise exception 'FAIL 7: the edited announcement was refused: % %', r.state, r.msg; end if;
  if exists (select 1 from v_announcements_unreviewed where id = v_f4)
     or (select modified_seen from announcement_reviews where announcement_id = v_f4)
        <> (select modified_at from announcements where id = v_f4) then
    raise exception 'FAIL 7: the second review did not move modified_seen';
  end if;
end $$;

-- =============================================================================================
-- 8. close
-- =============================================================================================
do $$
declare
  v_req bigint := (select id from _t211 where label = 'req');
  r record;
  v_follow bigint;
  v_row record;
begin
  -- Bad calls: a state that is not done or failed, a result that is not an object.
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_close(%s, ''cancelled'', ''{}''::jsonb)', v_req));
  if r.ok or r.state <> '22023' or r.msg not like 'announcement_review_close:%' then
    raise exception 'FAIL 8: a state of cancelled gave % %', r.state, r.msg;
  end if;
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_close(%s, ''done'', ''[]''::jsonb)', v_req));
  if r.ok or r.state <> '22023' then
    raise exception 'FAIL 8: a result that is an array was accepted';
  end if;

  -- Done, with unreviewed announcements left (f6..f8): one follow-up.
  select * into r from pg_temp.t26_as_runner(
    format('select announcement_review_close(%s, ''done'', %L::jsonb) as c', v_req, '{"lines":["ok"]}'));
  if not r.ok then raise exception 'FAIL 8: close failed: % %', r.state, r.msg; end if;
  v_follow := (r.res->0->>'c')::bigint;
  if v_follow is null then
    raise exception 'FAIL 8: close done filed no follow-up with unreviewed announcements left';
  end if;
  select state, finished_at is not null as fin, result into v_row from agent_requests where id = v_req;
  if v_row.state <> 'done' or not v_row.fin or v_row.result <> '{"lines":["ok"]}'::jsonb then
    raise exception 'FAIL 8: the closed request reads %', row_to_json(v_row);
  end if;
  select kind, state, params into v_row from agent_requests where id = v_follow;
  if v_row.kind <> 'announcement_review' or v_row.state <> 'queued'
     or v_row.params <> jsonb_build_object('trigger', 'follow_up', 'after', v_req) then
    raise exception 'FAIL 8: the follow-up reads %', row_to_json(v_row);
  end if;
  -- Closed once: the request is no longer a claim.
  select * into r from pg_temp.t26_as_runner(format('select announcement_review_close(%s, ''done'', ''{}''::jsonb)', v_req));
  if r.ok then raise exception 'FAIL 8: a closed request was closed again'; end if;

  -- The follow-up: claimed, closed failed, files nothing.
  select * into r from pg_temp.t26_as_runner('select * from announcement_review_claim()');
  if (r.res->0->>'id')::bigint is distinct from v_follow then
    raise exception 'FAIL 8: the follow-up was not claimed (got %)', r.res;
  end if;
  select * into r from pg_temp.t26_as_runner(
    format('select announcement_review_close(%s, ''failed'', %L::jsonb) as c', v_follow, '{"error":"boom","lines":[]}'));
  if not r.ok or r.res->0->'c' <> 'null'::jsonb or (select state from agent_requests where id = v_follow) <> 'failed' then
    raise exception 'FAIL 8: a failed close gave % % and filed a follow-up', r.ok, r.res;
  end if;
  if exists (select 1 from agent_requests where kind = 'announcement_review' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 8: a request is open after a failed close';
  end if;

  -- Done, but the run reviewed nothing: no follow-up (a run that gets nowhere never loops).
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at)
  values ('announcement_review', 'all', 'claimed', 'inbox-apply-runner', now()) returning id into v_follow;
  select * into r from pg_temp.t26_as_runner(
    format('select announcement_review_close(%s, ''done'', ''{}''::jsonb) as c', v_follow));
  if not r.ok or r.res->0->'c' <> 'null'::jsonb then
    raise exception 'FAIL 8: a run that reviewed nothing filed a follow-up: % %', r.ok, r.res;
  end if;
end $$;

select 'phase26_211_reader_functions: PASS' as result;

rollback;
