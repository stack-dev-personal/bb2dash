-- bb2dash :: db/migrations/200_sync_file_text_put.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item B, "The sync's text insert
-- behind a function". Worker W-101. Block 200-209.
--
-- WHY. The policy `bb_file_text_anon_insert` (007) lets any holder of the public key insert course
-- text. Its only writers are the sync runner (`sync/src/files.ts`, a REST POST inherited from the
-- Windows script, with no recorded reason) and the Windows fallback (`ingest/pull_files.mjs`, the
-- first pull and `--restale-post`). The runner already reaches the database only as `sync_runner`
-- through SECURITY DEFINER functions over `pg`, so the insert becomes one more of them, and the
-- policy can go (201, at the cut-over).
--
-- WHAT
--   1. sync_file_text_put(p_file_id bigint, p_units jsonb) returns table(inserted int, present int):
--      SECURITY DEFINER, search_path pinned. p_units is [{unit_kind, unit_no, text}], what
--      extract_text.py prints for one file. It refuses (22023, nothing written) a file id that is not
--      a bb_files row; p_units that is not a non-empty array; a unit that is not an object with a
--      unit_kind of doc, page, sheet or slide (the four extract_text.py writes), a unit_no of 1 or
--      more and non-blank text; one (unit_kind, unit_no) twice. A file too large to store, more than
--      1000 units or more than 1.5 million characters in all (the largest file on prod had 130,346 on
--      2026-10-19), is refused with its own SQLSTATE, 54000 (program_limit_exceeded), so a caller can
--      tell "this file's text is too large" from "this call is wrong": the sync then records the file
--      with text_status 'failed' through sync_file_stored, as it does for a failed extraction, and
--      the file is not downloaded again on the next sync (review of 25a). It inserts with
--      `on conflict (file_id, unit_kind, unit_no) do nothing`, on the table's unique key
--      (005_file_corpus.sql:40, `bb_file_text_file_id_unit_kind_unit_no_key`), and answers how many
--      units it inserted and how many were already present. A unit already there is never changed:
--      the REST insert's 409 meant the same ("already there"), and a re-pull replaces text only
--      through the owner's restale SQL. The 165 triggers fire as for any inserting role: the AI-use
--      policy cut on insert, and nothing on the embeddings (that trigger is AFTER UPDATE OF text).
--   2. privileges: revoked from public, anon, authenticated and service_role; granted to sync_runner
--      only. sync_runner goes from fifteen SECURITY DEFINER functions to sixteen. The SQL suite calls
--      it under `set local role sync_runner` (094).
--   3. a guard block
--
-- NOT HERE. The policy stays until 201, which is applied only at the cut-over, after the rebuilt
-- `sync` has stored text through this function once. Until then both paths work.
--
-- Additive: one function, its grants and a guard; no table, column, policy or other body changes.

-- =============================================================================================
-- 1. sync_file_text_put
-- =============================================================================================
create or replace function public.sync_file_text_put(p_file_id bigint, p_units jsonb)
  returns table (inserted integer, present integer)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_units constant integer := 1000;
  c_max_chars constant bigint  := 1500000;
  v_n        integer;
  v_chars    bigint;
  v_inserted integer;
begin
  if p_file_id is null then
    raise exception 'sync_file_text_put: p_file_id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from bb_files f where f.id = p_file_id) then
    raise exception 'sync_file_text_put: file % is not in bb_files', p_file_id using errcode = '22023';
  end if;

  if p_units is null or jsonb_typeof(p_units) <> 'array' then
    raise exception 'sync_file_text_put: p_units must be a json array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_units);
  if v_n < 1 then
    raise exception 'sync_file_text_put: a file puts at least one unit' using errcode = '22023';
  end if;
  if v_n > c_max_units then
    raise exception 'sync_file_text_put: too large: a file puts at most % units, not %', c_max_units, v_n
      using errcode = '54000';
  end if;

  -- Every unit is an object with one of extract_text.py's kinds, a positive number and some text.
  if exists (select 1
               from jsonb_array_elements(p_units) e
              where not coalesce(
                      jsonb_typeof(e) = 'object'
                      and jsonb_typeof(e->'unit_kind') = 'string'
                      and jsonb_typeof(e->'unit_no') = 'number'
                      and jsonb_typeof(e->'text') = 'string'
                      and (e->>'unit_kind') in ('doc', 'page', 'sheet', 'slide')
                      and case when (e->>'unit_no') ~ '^[0-9]{1,9}$'
                               then (e->>'unit_no')::integer >= 1 else false end
                      and btrim(e->>'text') <> '', false)) then
    raise exception 'sync_file_text_put: each unit needs a unit_kind of doc, page, sheet or slide, a unit_no of 1 or more and non-blank text'
      using errcode = '22023';
  end if;
  if (select count(distinct (e->>'unit_kind') || '/' || ((e->>'unit_no')::integer)::text)
        from jsonb_array_elements(p_units) e) <> v_n then
    raise exception 'sync_file_text_put: a (unit_kind, unit_no) appears twice' using errcode = '22023';
  end if;
  select coalesce(sum(char_length(e->>'text')), 0) into v_chars from jsonb_array_elements(p_units) e;
  if v_chars > c_max_chars then
    raise exception 'sync_file_text_put: too large: a file puts at most % characters, not %', c_max_chars, v_chars
      using errcode = '54000';
  end if;

  -- The unique key is (file_id, unit_kind, unit_no); a unit already there is left as it is.
  insert into bb_file_text (file_id, unit_kind, unit_no, text)
  select p_file_id, e->>'unit_kind', (e->>'unit_no')::integer, e->>'text'
    from jsonb_array_elements(p_units) with ordinality as x(e, ord)
   order by x.ord
  on conflict (file_id, unit_kind, unit_no) do nothing;
  get diagnostics v_inserted = row_count;

  return query select v_inserted, v_n - v_inserted;
end $$;

comment on function public.sync_file_text_put(bigint, jsonb) is
  'Puts one file''s text units for the sync runner (200): p_units is [{unit_kind, unit_no, text}], 1 to '
  '1000 units of kind doc, page, sheet or slide, unit_no 1 or more, non-blank text, no (kind, number) '
  'twice, at most 1.5 million characters. Inserts with on conflict (file_id, unit_kind, unit_no) do '
  'nothing and answers (inserted, present); a unit already there is never changed. 22023 for a file '
  'not in bb_files or a bad p_units; 54000 for a file over either size cap. The 165 triggers fire as '
  'for any insert. sync_runner only.';

-- =============================================================================================
-- 2. Privileges
-- =============================================================================================
revoke all on function public.sync_file_text_put(bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.sync_file_text_put(bigint, jsonb) to sync_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  f constant text := 'public.sync_file_text_put(bigint, jsonb)';
begin
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 200: % is not SECURITY DEFINER with a pinned search_path', f;
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute')
     or has_function_privilege('workspace_runner', f, 'execute')
     or has_function_privilege('workspace_ingest_runner', f, 'execute')
     or not has_function_privilege('sync_runner', f, 'execute') then
    raise exception 'FAIL 200: % is not executable by sync_runner alone', f;
  end if;
  -- The key the insert names is the table's unique key.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.bb_file_text'::regclass and c.contype = 'u'
                    and c.conname = 'bb_file_text_file_id_unit_kind_unit_no_key') then
    raise exception 'FAIL 200: bb_file_text has no unique key on (file_id, unit_kind, unit_no)';
  end if;
  -- The 165 triggers still fire on bb_file_text.
  if (select count(*) from pg_trigger t
       where t.tgrelid = 'public.bb_file_text'::regclass and not t.tgisinternal and t.tgenabled = 'O'
         and t.tgname in ('bb_file_text_strip_ai_policy', 'bb_file_text_drop_stale_embeddings')) <> 2 then
    raise exception 'FAIL 200: the 165 triggers on bb_file_text are not both enabled';
  end if;
  -- sync_runner executes the sixteen: 164's fifteen and this one. Phase 26's 210 and 213 add two more
  -- (sync_request_announcement_review, sync_file_pull_outcomes) and may be applied first (Stack,
  -- 2026-10-19); they are checked in 213, so they are left out of this list.
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.proname not in ('sync_request_announcement_review', 'sync_file_pull_outcomes')
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_outside_link,sync_file_stored,sync_file_text_put,'
     'sync_file_worklist,sync_login_ok,sync_login_required,sync_next,sync_own_claims,sync_register_run,'
     'sync_request_inbox_apply,sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 200: sync_runner does not execute exactly the sixteen';
  end if;
end $$;
