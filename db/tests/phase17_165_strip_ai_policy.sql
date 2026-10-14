-- bb2dash :: db/tests/phase17_165_strip_ai_policy.sql
-- Migration 165 (Stack, 2026-10-14: strip the AI-use policy now and automatically). Tests the rule,
-- `strip_ai_policy(text)`, on SYNTHETIC text only (this repository is public), the two triggers on
-- bb_file_text by their shape, and the live corpus: no current unit carries a policy section, and the
-- units migration 119 trimmed by hand are left as they are.
--
-- The triggers' behaviour (an insert is stripped; a changed text drops its embeddings) is proven in the
-- migration's rolled-back dry run as the owner: the test login cannot write bb_file_text, and a test
-- does not widen its grants.
--
-- Read-only. RUN IT: `node scripts/db-test.mjs --only phase17_165_strip_ai_policy.sql`. The last
-- statement is `rollback`.

begin;

do $$
declare
  c_removed constant text := '[AI-use policy section removed]';
  v_fail    text[] := '{}';
  v_got     text;
  v_bad     text;
  r         record;
begin
  if to_regprocedure('public.strip_ai_policy(text)') is null then
    raise exception 'FAIL phase17_165: migration 165 is not applied (strip_ai_policy does not exist)';
  end if;

  -- (a) the rule, shape by shape ------------------------------------------------------------------
  for r in
    select * from (values
      -- an inline label paragraph goes, that line only; the lines around it stay byte for byte
      ('inline label',
       E'Intro line.\nOn the use of AI: You may use AI tools on this assignment if you disclose how and where you used them.\nSubmission format. Hand it in.\nExams: three.',
       E'Intro line.\nSubmission format. Hand it in.\nExams: three.'),
      -- a bare heading goes with the long lines and blank lines after it, up to the next short line
      ('heading section',
       E'Policies\nAI Use\nStudents may use generative tools only as directed in each assignment, and must disclose any use.\n\nA second long paragraph that continues the same section for a while longer than eighty characters.\nDisability-Related Accommodations\nText.',
       E'Policies\nDisability-Related Accommodations\nText.'),
      -- the university template's paragraph
      ('template paragraph',
       E'Before.\nArtificial Intelligence Language: the use of generative tools in this course is governed by the instructor and the university.\nAfter.',
       E'Before.\nAfter.'),
      -- a short heading naming the policy
      ('named heading',
       E'Course Policies\nLimited and Specified Artificial Intelligence Use\nYou may use generative tools for brainstorming only, and you must say so in the work you hand in.\nGrading\nPoints.',
       E'Course Policies\nGrading\nPoints.'),
      ('zero tolerance',
       E'A.\nZero tolerance for artificial intelligence use applies to every exam and every written assignment in the course.\nB.',
       E'A.\nB.'),
      ('permitted',
       E'A.\nArtificial intelligence tools are permitted for drafting when the final text is your own and the use is disclosed.\nB.',
       E'A.\nB.'),
      -- CRLF line ends keep their \r on the lines that stay
      ('crlf',
       E'Keep one.\r\nAI Use\r\nA long policy paragraph that runs past eighty characters so it belongs to the section.\r\nKeep two\r\n',
       E'Keep one.\r\nKeep two\r\n'),
      -- review of 2026-10-14: a line that only mentions the phrase goes alone and takes nothing with it
      ('mention goes alone',
       E'Week 11: Artificial Intelligence Use in Incident Response\nAn ordinary bullet about the week that runs a good deal longer than eighty characters in all.\nRead chapter 9.',
       E'An ordinary bullet about the week that runs a good deal longer than eighty characters in all.\nRead chapter 9.'),
      ('short run-in label goes alone',
       E'On the use of AI: Prohibited.\nLate work. Work handed in late loses ten percent of its points for each day, up to three days.\nNext.',
       E'Late work. Work handed in late loses ten percent of its points for each day, up to three days.\nNext.'),
      -- hard-wrapped PDF text: a wrapped line does not end the section; the next heading does
      ('pdf wrapped',
       E'AI Use\nStudents may use generative tools only as directed in each assignment and must\ndisclose any use in a footnote on the first page.\nGrading\nPoints.',
       E'Grading\nPoints.'),
      ('ends at a colon heading',
       E'On the use of AI:\nA policy paragraph that runs past sixty characters and ends with a full stop.\nGrading:\nPoints.',
       E'Grading:\nPoints.'),
      ('a matching line at the end', E'Keep.\nAI Use', E'Keep.'),
      -- one heading takes at most 12 lines
      ('cap', E'Policies\nAI Use\nA long ordinary line number 1 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 2 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 3 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 4 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 5 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 6 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 7 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 8 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 9 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 10 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 11 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 12 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 13 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 14 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 15 that runs well past sixty characters and ends a sentence.\nNext', E'Policies\nA long ordinary line number 13 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 14 that runs well past sixty characters and ends a sentence.\nA long ordinary line number 15 that runs well past sixty characters and ends a sentence.\nNext'),
      -- kept: IST.323's deliverable, a mention in passing, and text with no policy
      ('appendix B kept', E'Appendix B: AI Use Statement\nDescribe how you used AI.', E'Appendix B: AI Use Statement\nDescribe how you used AI.'),
      ('mention kept', E'Week 12 | AI and Security | Reading', E'Week 12 | AI and Security | Reading'),
      ('untouched', E'Nothing here.\nAt all.', E'Nothing here.\nAt all.'),
      ('empty', '', ''),
      -- a unit that is the policy and nothing else keeps the placeholder
      ('all policy', E'AI Use\nUse of generative tools is not permitted unless the assignment says otherwise, and never on exams.', c_removed)
    ) as t(label, input, expected)
  loop
    v_got := public.strip_ai_policy(r.input);
    if v_got is distinct from r.expected then
      v_fail := v_fail || format('(a) %s: got %s', r.label, coalesce(quote_literal(left(v_got, 120)), 'null'));
    end if;
  end loop;
  if public.strip_ai_policy(null) is not null then
    v_fail := v_fail || '(a) null in, not null out'::text;
  end if;
  -- the rule is idempotent: stripping twice is stripping once
  if public.strip_ai_policy(public.strip_ai_policy(E'A.\nAI Use\nA long policy paragraph that runs past eighty characters so it belongs to the section.\nB'))
     is distinct from E'A.\nB' then
    v_fail := v_fail || '(a) not idempotent'::text;
  end if;

  -- (b) the function and the triggers ---------------------------------------------------------------
  if not exists (select 1 from pg_proc p where p.oid = 'public.strip_ai_policy(text)'::regprocedure
                    and p.provolatile = 'i' and coalesce(p.proconfig, '{}') @> array['search_path=pg_catalog, pg_temp']) then
    v_fail := v_fail || '(b) strip_ai_policy is not immutable with a pinned search_path'::text;
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.bb_file_text'::regclass and not t.tgisinternal
                    and t.tgname = 'bb_file_text_strip_ai_policy'
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16) then
    v_fail := v_fail || '(b) bb_file_text_strip_ai_policy is not a BEFORE INSERT OR UPDATE row trigger'::text;
  end if;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.bb_file_text'::regclass and not t.tgisinternal
                    and t.tgname = 'bb_file_text_drop_stale_embeddings'
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 0 and (t.tgtype & 16) = 16
                    and p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || '(b) bb_file_text_drop_stale_embeddings is not an AFTER UPDATE row trigger with a definer function'::text;
  end if;
  -- The insert trigger's behaviour, on a temporary table (the test login cannot write bb_file_text).
  create temp table p165_text (id integer, text text) on commit drop;
  create trigger p165_strip before insert or update of text on p165_text
    for each row execute function public.bb_file_text_strip_ai_policy();
  insert into p165_text values (1, E'Keep.\nOn the use of AI: You may use AI tools on this assignment if you disclose how and where you used them.\nKeep too.');
  update p165_text set text = E'Changed.\nAI Use' where id = 1;
  insert into p165_text values (2, E'Nothing here.');
  if (select text from p165_text where id = 1) is distinct from 'Changed.'
     or (select text from p165_text where id = 2) is distinct from 'Nothing here.' then
    v_fail := v_fail || '(b) the trigger function does not strip on insert and update'::text;
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.bb_file_text'::regclass
                    and t.tgname = 'bb_file_text_strip_ai_policy' and t.tgenabled = 'O'
                    and t.tgfoid = 'public.bb_file_text_strip_ai_policy()'::regprocedure) then
    v_fail := v_fail || '(b) bb_file_text_strip_ai_policy is not enabled, or runs another function'::text;
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.bb_file_text'::regclass
                    and t.tgname = 'bb_file_text_drop_stale_embeddings' and t.tgenabled = 'O'
                    and t.tgfoid = 'public.bb_file_text_drop_stale_embeddings()'::regprocedure
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a
                                           where a.attrelid = 'public.bb_file_text'::regclass and a.attname = 'text')) then
    v_fail := v_fail || '(b) bb_file_text_drop_stale_embeddings is not enabled on UPDATE OF text, or runs another function'::text;
  end if;
  if has_function_privilege('anon', 'public.bb_file_text_drop_stale_embeddings()', 'execute')
     or has_function_privilege('authenticated', 'public.bb_file_text_drop_stale_embeddings()', 'execute') then
    v_fail := v_fail || '(b) the embeddings trigger function is executable by anon or authenticated'::text;
  end if;

  -- (c) the live corpus ------------------------------------------------------------------------------
  select string_agg(t.id::text, ', ' order by t.id) into v_bad
    from bb_file_text t join bb_files f on f.id = t.file_id
   where f.superseded_by is null and public.strip_ai_policy(t.text) is distinct from t.text;
  if v_bad is not null then
    v_fail := v_fail || format('(c) current units the rule would still change: %s', v_bad);
  end if;
  -- 119's units are not touched by the rule (their sections were cut by hand)
  select string_agg(t.id::text, ', ' order by t.id) into v_bad
    from bb_file_text t
   where t.id in (214, 277, 350, 522, 89, 1, 733, 374) and t.text like '%' || c_removed || '%';
  if v_bad is not null then
    v_fail := v_fail || format('(c) 119''s units carry the placeholder: %s', v_bad);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_165: %', array_to_string(v_fail, '; ');
  end if;
end $$;

rollback;
