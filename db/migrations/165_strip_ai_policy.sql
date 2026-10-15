-- bb2dash :: db/migrations/165_strip_ai_policy.sql
-- fix/strip-ai-policy (Stack, 2026-10-14: "Strip it now and automatically"). Phase 18 overflow block
-- (160-169). Additive: one function, two trigger functions, two triggers, and one data pass.
--
-- WHY. Stack decided on 2026-09-29 that a course's AI-use policy goes from the app and from the search
-- corpus. Migration 119 cut it from eight text units with hand-picked markers, and the guard unit
-- db/tests/phase17_119_no_ai_policy.sql says a re-pulled syllabus that brings a policy back must fail
-- it. On 2026-10-14 the new IST.323 syllabus (v1.5, file 3736, unit 1250) did. A one-time cut would be
-- undone by the next version, so the cut is now made by the database on every write of a text unit.
--
-- WHAT
--   1. strip_ai_policy(text) returns text: line by line, with the guard unit's own patterns.
--      * A line that matches a policy pattern is removed, that line alone.
--      * Only when the whole line IS a policy heading ("AI Use", "On the use of AI:", "Artificial
--        Intelligence Language:", "... Artificial Intelligence Use") do the lines after it go too: up to
--        the next heading (a line of 60 characters or fewer that does not end in . , or ;), and never
--        more than 12 lines. Blank lines in the section go with it.
--      * Everything else is returned byte for byte; a text with no match is returned as it came.
--      * A text left with nothing keeps one line, '[AI-use policy section removed]', so its file still
--        has a text unit and the search has nothing to quote.
--      A line that only mentions the phrase (a schedule row, a slide title) is removed alone and takes
--      nothing with it; the guard unit already counts such a line as policy. IST.323's "Appendix B: AI
--      Use Statement" deliverable does not match, and stays (as 119 left it). Review of 2026-10-14: a
--      section first ended at any short line (hard-wrapped PDF text ended it early) and began at any
--      short matching line (a schedule row took the lines after it).
--   2. bb_file_text_strip_ai_policy: BEFORE INSERT OR UPDATE OF text, sets new.text to the rule's
--      result. Every writer is covered: the sync runner's insert (as anon), the Windows /bb-sync
--      fallback, a hand insert.
--   3. bb_file_text_drop_stale_embeddings: AFTER UPDATE OF text, when the text changed, deletes the
--      unit's bb_text_embeddings rows, so embed-corpus chunks and embeds it afresh (it resumes by
--      (text_id, part_no) presence; 119 did this by hand). SECURITY DEFINER: the writer may be anon.
--   4. The one-time pass: every current unit the rule would change is rewritten in place (the triggers
--      do the cut and drop its embeddings). On 2026-10-14 that is unit 1250 alone. The PM then runs
--      `node ingest/embed_corpus.mjs` until `--check` prints missing_parts_before=0.
--   5. A guard block.
--
-- The patterns are the guard unit's six, line-anchored where the unit anchors them. No passage of any
-- course text is written here: this repository is public.

-- =============================================================================================
-- 1. strip_ai_policy
-- =============================================================================================
create or replace function public.strip_ai_policy(p_text text)
  returns text
  language plpgsql immutable
  set search_path = pg_catalog, pg_temp
as $$
declare
  -- A heading is a line of at most this many characters (edges trimmed) that does not end in . , or ;
  c_heading_max  constant integer := 60;
  -- The most lines one policy heading may take with it.
  c_section_max  constant integer := 12;
  -- A line that IS a policy heading, lower-cased, edges and a trailing colon trimmed.
  c_policy_heading constant text :=
    '^(ai use|on the use of ai|artificial intelligence language|([a-z ,-]+ )?artificial intelligence use( policy)?)$';
  -- db/tests/phase17_119_no_ai_policy.sql's patterns, case-insensitive.
  c_pattern constant text :=
    '(artificial intelligence language'
    '|artificial intelligence use\M'
    '|zero tolerance for artificial intelligence'
    '|artificial intelligence (tools? )?(is|are|may be) permitted'
    '|^\s*on the use of AI:'
    '|^\s*AI Use\s*$)';
  c_removed constant text := '[AI-use policy section removed]';
  v_out     text[] := '{}';
  v_line    text;
  v_trim    text;
  v_skip    boolean := false;
  v_taken   integer := 0;
  v_changed boolean := false;
  v_result  text;
begin
  if p_text is null then
    return null;
  end if;
  foreach v_line in array string_to_array(p_text, E'\n') loop
    v_trim := btrim(v_line, E' \t\r');
    if v_skip then
      -- Inside a policy heading's section: blank lines go; the next heading ends it, and so does the cap.
      if v_trim = '' then
        continue;
      end if;
      if (char_length(v_trim) <= c_heading_max and v_trim !~ '[.,;]$') or v_taken >= c_section_max then
        v_skip := false;
      else
        v_taken := v_taken + 1;
        continue;
      end if;
    end if;
    if v_line ~* c_pattern then
      v_changed := true;
      if lower(regexp_replace(v_trim, ':$', '')) ~ c_policy_heading then
        v_skip := true;
        v_taken := 0;
      end if;
      continue;
    end if;
    v_out := v_out || v_line;
  end loop;
  if not v_changed then
    return p_text;
  end if;
  v_result := array_to_string(v_out, E'\n');
  if btrim(v_result, E' \t\r\n') = '' then
    return c_removed;
  end if;
  return v_result;
end $$;

comment on function public.strip_ai_policy(text) is
  'AI-use policy rule (165; Stack 2026-09-29 and 2026-10-14): removes a course''s AI-use policy from '
  'extracted text, line by line, with the patterns of db/tests/phase17_119_no_ai_policy.sql. A matching '
  'line goes alone; a line that is a policy heading takes the lines after it up to the next heading (at '
  'most 12). Text with no match is returned unchanged; text left empty becomes '
  '''[AI-use policy section removed]''. Run on every bb_file_text write by a trigger.';

-- =============================================================================================
-- 2. The cut on every write
-- =============================================================================================
create or replace function public.bb_file_text_strip_ai_policy()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.text := strip_ai_policy(new.text);
  return new;
end $$;

comment on function public.bb_file_text_strip_ai_policy() is
  'Trigger function (165): bb_file_text.text passes through strip_ai_policy on every insert and update.';

revoke all on function public.bb_file_text_strip_ai_policy() from public, anon, authenticated;
-- The test login attaches it to a temporary table to prove what it does (phase17_165).
grant execute on function public.bb_file_text_strip_ai_policy() to db_test_runner;

drop trigger if exists bb_file_text_strip_ai_policy on public.bb_file_text;
create trigger bb_file_text_strip_ai_policy
  before insert or update of text on public.bb_file_text
  for each row execute function public.bb_file_text_strip_ai_policy();

-- =============================================================================================
-- 3. A changed text loses its embeddings
-- =============================================================================================
create or replace function public.bb_file_text_drop_stale_embeddings()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
begin
  if new.text is distinct from old.text then
    delete from bb_text_embeddings e where e.text_id = new.id;
  end if;
  return null;
end $$;

comment on function public.bb_file_text_drop_stale_embeddings() is
  'Trigger function (165): when a bb_file_text unit''s text changes, its bb_text_embeddings rows are '
  'deleted so embed-corpus re-chunks it. SECURITY DEFINER because the writer may be anon (the sync runner).';

revoke all on function public.bb_file_text_drop_stale_embeddings() from public, anon, authenticated;

drop trigger if exists bb_file_text_drop_stale_embeddings on public.bb_file_text;
create trigger bb_file_text_drop_stale_embeddings
  after update of text on public.bb_file_text
  for each row execute function public.bb_file_text_drop_stale_embeddings();

-- =============================================================================================
-- 4. The one-time pass over current units
-- =============================================================================================
do $$
declare
  v_n integer;
begin
  with changed as (
    update bb_file_text t
       set text = t.text
      from bb_files f
     where f.id = t.file_id and f.superseded_by is null
       and strip_ai_policy(t.text) is distinct from t.text
    returning t.id)
  select count(*) into v_n from changed;
  raise notice '165: % current text unit(s) had an AI-use policy section cut', v_n;
end $$;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = 'public.strip_ai_policy(text)'::regprocedure
                    and p.provolatile = 'i' and coalesce(p.proconfig, '{}') @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'FAIL 165: strip_ai_policy is not immutable with a pinned search_path';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.bb_file_text'::regclass and not t.tgisinternal
                    and t.tgname = 'bb_file_text_strip_ai_policy' and t.tgenabled = 'O'
                    and t.tgfoid = 'public.bb_file_text_strip_ai_policy()'::regprocedure
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16) then
    raise exception 'FAIL 165: bb_file_text_strip_ai_policy is not an enabled BEFORE INSERT OR UPDATE row trigger';
  end if;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.bb_file_text'::regclass and not t.tgisinternal
                    and t.tgname = 'bb_file_text_drop_stale_embeddings' and t.tgenabled = 'O'
                    and t.tgfoid = 'public.bb_file_text_drop_stale_embeddings()'::regprocedure
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 0 and (t.tgtype & 16) = 16
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a
                                           where a.attrelid = 'public.bb_file_text'::regclass and a.attname = 'text')
                    and p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 165: bb_file_text_drop_stale_embeddings is not an enabled AFTER UPDATE OF text row trigger with a definer function';
  end if;
  if has_function_privilege('anon', 'public.bb_file_text_drop_stale_embeddings()', 'execute')
     or has_function_privilege('authenticated', 'public.bb_file_text_drop_stale_embeddings()', 'execute') then
    raise exception 'FAIL 165: the embeddings trigger function is executable by anon or authenticated';
  end if;
  -- No current unit carries a policy section any more (the guard unit's own check).
  if exists (select 1 from bb_file_text t join bb_files f on f.id = t.file_id
              where f.superseded_by is null
                and (   t.text ~* 'artificial intelligence language'
                     or t.text ~* 'artificial intelligence use\M'
                     or t.text ~* 'zero tolerance for artificial intelligence'
                     or t.text ~* 'artificial intelligence (tools? )?(is|are|may be) permitted'
                     or t.text ~* '(^|\n)\s*on the use of AI:'
                     or t.text ~* '(^|\n)\s*AI Use\s*(\n|$)')) then
    raise exception 'FAIL 165: a current unit still carries an AI-use policy section';
  end if;
end $$;
