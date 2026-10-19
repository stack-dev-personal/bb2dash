-- bb2dash :: db/migrations/201_drop_bb_file_text_anon_insert.sql
-- Phase 25a (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), item B. Worker W-101.
--
-- APPLIED ONLY AT THE CUT-OVER, and only after the rebuilt `sync` has stored text through
-- `sync_file_text_put` (200) once: apply 200, rebuild `sync` between syncs, run one sync, see its
-- units land, then apply this file. Applied before that, the running sync (still on the REST insert)
-- loses its text insert: every file it pulls fails with "bb_file_text 401/403" and stays unstored.
--
-- WHY. `bb_file_text_anon_insert` (007) let any holder of the public key insert course text. Its two
-- writers, the sync runner and the Windows fallback (`ingest/pull_files.mjs`), now insert through
-- `sync_file_text_put` as `sync_runner` (200), so the policy only serves a stranger. 198 did the same
-- for the vector table; 049_bb_files_submissions.sql:65 is the precedent for dropping a policy in a
-- numbered migration.
--
-- WHAT. One statement, `drop policy`, and a guard. NOTHING ELSE MOVES: anon keeps the table grant the
-- project's default gave it; with the policy gone, row security refuses every insert it attempts
-- (SQLSTATE 42501). The owner policy `bb_file_text_owner_all` and the 165 triggers stay.
--
-- Removes one policy; adds nothing.

do $$
begin
  if to_regprocedure('public.sync_file_text_put(bigint, jsonb)') is null then
    raise exception '201: sync_file_text_put does not exist; apply 200_sync_file_text_put first';
  end if;
end $$;

drop policy if exists bb_file_text_anon_insert on public.bb_file_text;

-- Guard: the policy is gone, no policy on the table names anon, row security is still on, and the
-- writer the sync now uses is in place.
do $$
declare
  v_got text;
begin
  if exists (select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = 'bb_file_text'
                and p.policyname = 'bb_file_text_anon_insert') then
    raise exception 'FAIL 201: the policy bb_file_text_anon_insert is still there';
  end if;

  select string_agg(p.policyname || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'bb_file_text'
     and ('anon' = any (p.roles) or 'public' = any (p.roles));
  if v_got is not null then
    raise exception 'FAIL 201: a policy still lets anon in on bb_file_text: %', v_got;
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.bb_file_text'::regclass) then
    raise exception 'FAIL 201: row security is off on bb_file_text';
  end if;

  if not has_function_privilege('sync_runner', 'public.sync_file_text_put(bigint, jsonb)', 'execute') then
    raise exception 'FAIL 201: sync_runner cannot execute sync_file_text_put';
  end if;
end $$;
