-- bb2dash :: db/migrations/164_redirect_outside_links.sql
-- fix/redirect-outside-links (Stack, 2026-10-14: "the redirect links should be saved as links then and
-- not throw errors when bytes can't be pulled (only if the bytes can't be pulled and there is a redirect
-- link to another site; if no redirect link, then it should be flagged)"; his answers the same day: a
-- redirect to a Blackboard host not on the allow-list stays flagged, with the host named; only a truly
-- outside site becomes a link; the number is 164). Phase 18 overflow block (160-169). Re-creates the
-- three functions the change touches, each with its LIVE body and only the lines marked `-- 164:`, as
-- 187 and 188 did before it. 091 and 161 stay byte-frozen.
--
-- WHY. The sync runner's file pull (sync/src/files.ts) walks a Blackboard file URL's redirects and
-- downloads only from Blackboard's CDN. A file whose Blackboard link redirects to ANOTHER SITE was
-- refused (the walk carries Blackboard's logged-in cookies and must never go there), landed in the
-- report as "not pulled", and in the Inbox as a data gap ("its bytes were never stored"), every sync,
-- for a file that is really a link. 161 already made a row whose own source_url is off Blackboard an
-- outside link (no pull, no gap, "Outside link" in Materials). This extends that to a row whose
-- Blackboard URL redirects off Blackboard: the runner stores the redirect target on the row, and the
-- row is an outside link from then on. The target is never requested.
--
-- WHAT
--   1. bb_files.outside_url text: the redirect target, http(s) only, no whitespace or control
--      characters, 2048 characters at most (a check constraint). Null on every row today.
--   2. sync_file_outside_link(p_id bigint, p_url text) returns boolean: SECURITY DEFINER, search_path
--      pinned, for sync_runner and db_test_runner only. It re-checks the URL itself, because the
--      caller is a container that holds Blackboard's login: http(s); a host; no credentials; not an IP
--      literal in any spelling; not localhost or a single-label host; not a Blackboard host (the
--      institution's, its CDN family, blackboard.com, anthology.com); not a sign-in host or one of the
--      university's own domains (a dead session redirects there, and is not another site); not a signed
--      URL (a signature in the query). A bad URL raises 22023 and writes nothing.
--      It writes only a catalogued, unsuperseded, never-stored row that is not yet linked, is not a
--      submission and does not already have an outside source_url: any other row answers false and is
--      left alone. It sets outside_url, appends a note that names the HOST only (a CDN URL carries a
--      signature), and calls close_cleared_gaps. sync_runner goes from fourteen SECURITY DEFINER
--      functions to fifteen.
--   3. sync_file_worklist: 091's body, plus `and f.outside_url is null`.
--   4. stage_gaps and close_cleared_gaps: 161's bodies; an outside link is a row with an off-Blackboard
--      source_url OR an outside_url. No gap is raised for one, an open one closes (rule 'outside_link').
--   5. v_bb_files_current is re-created `select *` so it carries outside_url. 018 froze its column
--      list at creation ("a later migration that adds a bb_files column must recreate this view") and
--      the Materials page reads that view; the options (security_invoker) are restated because
--      CREATE OR REPLACE VIEW replaces them. It also now carries the columns 049 and later added.
--   6. a BEFORE UPDATE OF source_url row trigger on bb_files: a changed source_url clears outside_url
--      (stage_files rewrites source_url in place on a re-upload; the old link must not outlive it)
--   7. a guard block
--
-- WHERE EACH BODY CAME FROM (prod is byte-identical to the repo, so the live body is the body of the
-- last migration that created the function; found by searching db/migrations for each name):
--     sync_file_worklist   091 (no later migration re-creates it)
--     close_cleared_gaps   161 (114's, then 161's)
--     stage_gaps           161 (114's, then 161's)
-- Each change is marked `-- 164:` in the body. Signatures, SECURITY DEFINER, the pinned search_paths
-- and the grants are unchanged.
--
-- Additive in effect: one column, one function, three bodies replaced, one view widened; no drop, no
-- rename, no grant taken from a role that holds it.

-- =============================================================================================
-- 1. bb_files.outside_url
-- =============================================================================================
alter table public.bb_files add column if not exists outside_url text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.bb_files'::regclass and conname = 'bb_files_outside_url_ck') then
    alter table public.bb_files
      add constraint bb_files_outside_url_ck
      check (outside_url is null
             or (length(outside_url) <= 2048 and outside_url ~* '^https?://[^[:space:][:cntrl:]]+$'));
  end if;
end $$;

comment on column public.bb_files.outside_url is
  'Outside link (164): where a Blackboard file''s link redirects when that is ANOTHER SITE. Set by the '
  'sync runner (sync_file_outside_link); the target is never requested. A row with an outside_url, like '
  'one whose source_url is off Blackboard (161), has no bytes to pull, raises no storage_path gap and '
  'reads "Outside link" in the web app, which opens this URL. http(s), no whitespace, at most 2048 '
  'characters. Null otherwise.';

-- =============================================================================================
-- 2. sync_file_outside_link
-- =============================================================================================
create or replace function public.sync_file_outside_link(p_id bigint, p_url text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_authority text;
  v_host      text;
  v_query     text;
begin
  -- The same rule as ingest/fetch_signed.mjs's classifyRedirectTarget, which decides 'outside' before
  -- the runner calls this; the database does not trust the caller to have applied it.
  if p_url is null or length(p_url) > 2048 then
    raise exception 'sync_file_outside_link: the url is required and at most 2048 characters'
      using errcode = '22023';
  end if;
  if p_url !~* '^https?://[^[:space:][:cntrl:]]+$' then
    raise exception 'sync_file_outside_link: the url must be http(s) with no whitespace or control characters'
      using errcode = '22023';
  end if;

  v_authority := substring(p_url from '^[A-Za-z]+://([^/?#]*)');
  if v_authority is null or v_authority = '' then
    raise exception 'sync_file_outside_link: the url has no host' using errcode = '22023';
  end if;
  if position('@' in v_authority) > 0 then
    raise exception 'sync_file_outside_link: the url carries credentials' using errcode = '22023';
  end if;
  if left(v_authority, 1) = '[' then
    raise exception 'sync_file_outside_link: the url names an IP address' using errcode = '22023';
  end if;

  v_host := regexp_replace(lower(regexp_replace(v_authority, ':[0-9]*$', '')), '\.$', '');
  if v_host !~ '^[a-z0-9_-]+(\.[a-z0-9_-]+)+$' then
    raise exception 'sync_file_outside_link: the host is not a dotted host name' using errcode = '22023';
  end if;
  -- An IP in any spelling: the last label of a name is never all digits or 0x-hex, and a host whose
  -- last label is is read as an IPv4 address (127.0.0.1, 2130706433, 0x7f.1).
  if v_host ~ '(^|\.)(0x[0-9a-f]*|[0-9]+)$' then
    raise exception 'sync_file_outside_link: the url names an IP address' using errcode = '22023';
  end if;
  if v_host ~ '(^|\.)localhost$' then
    raise exception 'sync_file_outside_link: the url names localhost' using errcode = '22023';
  end if;
  if v_host ~ '(^|\.)(blackboard\.syracuse\.edu|blackboardcdn\.com|blackboard\.com|anthology\.com)$' then
    raise exception 'sync_file_outside_link: % is a Blackboard host, not another site', v_host
      using errcode = '22023';
  end if;
  -- A sign-in host or one of the university's own domains: a dead session, not another site. (The
  -- Blackboard check above comes first, so blackboard.syracuse.edu keeps its own message.)
  if v_host ~ '(^|\.)(login\.microsoftonline\.com|syracuse\.edu|syr\.edu)$' then
    raise exception 'sync_file_outside_link: % is a sign-in or university host, not another site', v_host
      using errcode = '22023';
  end if;
  -- A signed URL is not a link: it expires, and carries its own authorisation.
  v_query := lower(coalesce(substring(split_part(p_url, '#', 1) from '\?(.*)$'), ''));
  if v_query ~ '(^|&)(x-amz-signature|x-amz-credential|x-goog-signature|signature|sig|key-pair-id|policy|token|access_token)(=|&|$)'
     or (v_query ~ '(^|&)se(=|&|$)' and v_query ~ '(^|&)sp(=|&|$)') then
    raise exception 'sync_file_outside_link: the url at % carries a signature', v_host using errcode = '22023';
  end if;

  -- Only a catalogued, unsuperseded, never-stored row that is not yet linked, is not a submission, and
  -- does not already have an outside source_url (the worklist's own conditions, plus the last two).
  update bb_files f
     set outside_url = p_url,
         notes       = btrim(coalesce(f.notes || ' | ', '') || 'outside link to ' || v_host || ' saved '
                       || to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD')
                       || ' by sync-runner')
   where f.id = p_id
     and f.storage_path is null and f.superseded_by is null
     and f.outside_url is null
     and f.source_url is not null and not bb_file_is_outside_link(f.source_url)
     and f.bucket is distinct from 'my_submissions';
  if not found then
    return false;
  end if;

  -- The bb_files statement trigger (114) has just done this; the explicit call keeps the function
  -- right on its own if that trigger is ever dropped.
  perform close_cleared_gaps(null, 'sync_file_outside_link');
  return true;
end $$;

comment on function public.sync_file_outside_link(bigint, text) is
  'Saves a Blackboard file whose link redirects to another site as that link (164): bb_files.outside_url, '
  'plus a note naming the host. Refuses (22023) a url that is not http(s), has no host, carries '
  'credentials, names an IP address, localhost or a single-label host, is a Blackboard host, has '
  'whitespace or control characters, or is over 2048 characters. Writes only a catalogued, unsuperseded, '
  'never-stored row that is not yet linked, is not a submission and has no outside source_url; any other '
  'row answers false. Then calls close_cleared_gaps. sync_runner (and the test login) only.';

-- =============================================================================================
-- 3. sync_file_worklist: 091's body plus the outside_url exclusion
-- =============================================================================================
create or replace function public.sync_file_worklist()
  returns table (id bigint, file_name text, relpath text, mime text, source_url text,
                 bucket text, attempt_id text)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- ingest/pull_files.mjs's manifest query: catalogued, never stored, not superseded, and never an
  -- outside link (161).
  return query
    select f.id, f.file_name, bb_file_relpath(f.id), f.mime_type, f.source_url,
           f.bucket::text, f.attempt_id
      from bb_files f
     where f.storage_path is null and f.superseded_by is null
       and f.source_url is not null and not bb_file_is_outside_link(f.source_url)
       -- 164: nor a Blackboard file whose link redirects to another site.
       and f.outside_url is null
     order by f.id;
end $$;

comment on function public.sync_file_worklist() is
  'The sync runner''s file worklist (091): ingest/pull_files.mjs''s manifest query, bb_files rows with '
  'storage_path null, superseded_by null and a Blackboard source_url, with relpath = bb_file_relpath(id). '
  'Since 164 a row with an outside_url is left out too. sync_runner only.';

-- =============================================================================================
-- 4. close_cleared_gaps: 161's body plus outside_url
-- =============================================================================================
create or replace function public.close_cleared_gaps(p_sync_run_id bigint, p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed  integer := 0;
  v_flagged integer := 0;
begin
  if coalesce(btrim(p_trigger), '') = '' then
    raise exception 'close_cleared_gaps: p_trigger must name what ran it'
      using errcode = 'check_violation';
  end if;

  -- One statement: find the open stage_gaps rows whose condition has cleared (with the rule that
  -- cleared each, and whether the same key already closed itself in the last 24 hours), archive
  -- the others and flag the recent ones. The two updates touch disjoint rows.
  with cleared as (
    select ai.id, c.rule,
           exists (select 1 from attention_items prev
                    where prev.state = 'archived'
                      and prev.decision->>'closed_itself' = 'true'
                      and prev.archived_at > now() - interval '24 hours'
                      and prev.kind = ai.kind
                      and coalesce(prev.course_id, '') = coalesce(ai.course_id, '')
                      and coalesce(prev.ref, '')       = coalesce(ai.ref, '')
                      and coalesce(prev.field, '')     = coalesce(ai.field, '')) as recent
      from attention_items ai
      cross join lateral (
        select case
          when ai.kind = 'missing' and ai.entity = 'course' and ai.field = 'grading_scheme'
           and exists (select 1 from grading_schemes g where g.course_id = ai.ref)
            then 'grading_scheme_recorded'
          when ai.kind = 'missing' and ai.entity = 'assignment' and ai.field = 'due_at'
           and exists (select 1 from assignments a
                        where a.id = ai.ref
                          and (a.due_at is not null or a.due_date is not null or a.event_start is not null))
            then 'assignment_dated'
          when ai.kind = 'data_gap' and ai.entity = 'reading' and ai.field = 'for_date'
           and exists (select 1 from readings r where r.id::text = ai.ref and r.for_date is not null)
            then 'reading_dated'
          when ai.kind = 'data_gap' and ai.entity = 'bb_file' and ai.field = 'storage_path'
           and exists (select 1 from bb_files f
                        where f.id::text = ai.ref
                          and (f.storage_path is not null or f.superseded_by is not null))
            then 'file_stored_or_superseded'
          -- 161: an outside link never gets Storage bytes; its text is all there is to hold.
          when ai.kind = 'data_gap' and ai.entity = 'bb_file' and ai.field = 'storage_path'
           and exists (select 1 from bb_files f
                        where f.id::text = ai.ref
                          -- 164: an outside_url (a Blackboard link that redirects to another site) is one too.
                          and (bb_file_is_outside_link(f.source_url) or f.outside_url is not null))
            then 'outside_link'
        end as rule
      ) c
     where ai.state = 'open'
       and ai.suggested->>'source' = 'stage_gaps'
       and ai.suggested->>'reopened_within_24h' is distinct from 'true'
       and c.rule is not null
  ),
  closed as (
    update attention_items ai
       set state       = 'archived',
           archived_at = now(),
           archived_by = 'stage_gaps',
           decision    = jsonb_build_object('closed_itself', true,
                                            'rule',          g.rule,
                                            'sync_run_id',   p_sync_run_id,
                                            'trigger',       p_trigger)
      from cleared g
     where ai.id = g.id and not g.recent
    returning ai.id
  ),
  flagged as (
    update attention_items ai
       set suggested = coalesce(ai.suggested, '{}'::jsonb) || '{"reopened_within_24h": true}'::jsonb
      from cleared g
     where ai.id = g.id and g.recent
    returning ai.id
  )
  select (select count(*) from closed), (select count(*) from flagged)
    into v_closed, v_flagged;

  return jsonb_build_object('closed', v_closed, 'flagged', v_flagged);
end $$;

comment on function public.close_cleared_gaps(bigint, text) is
  'Gap self-close (114, B-29): archives every open stage_gaps attention row whose condition has '
  'cleared (grading scheme recorded | assignment dated | reading dated | file stored or '
  'superseded | outside link (161; since 164 also a file with an outside_url)) with archived_by stage_gaps and decision {closed_itself, rule, sync_run_id, '
  'trigger}. A key that closed itself within 24 h stays open, flagged '
  'suggested.reopened_within_24h, and is never machine-closed after that. Returns {closed, '
  'flagged}. service_role only; called by stage_gaps and the bb_files update trigger.';

revoke all on function public.close_cleared_gaps(bigint, text) from public, anon, authenticated;
grant execute on function public.close_cleared_gaps(bigint, text) to service_role;

-- =============================================================================================
-- 5. stage_gaps: 161's body plus the outside_url exclusion
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.stage_gaps(p_run_id uuid, p_sync_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_scheme int; v_dates int; v_read int; v_files int;
  v_closed jsonb;  -- 114
begin
  begin
    -- 114: close what has cleared before raising what is still missing (R-56, B-29).
    v_closed := close_cleared_gaps(p_sync_run_id, 'fold');

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', c.id, 'course', c.id, 'grading_scheme',
           format('%s has no grading scheme recorded, so nothing can forecast a grade for it. What is the grading method?', c.id),
           jsonb_build_object('source', 'stage_gaps')
      from courses c
     where not exists (select 1 from grading_schemes g where g.course_id = c.id)
       and not attention_answered('missing', c.id, c.id, 'grading_scheme')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_scheme = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', a.course_id, 'assignment', a.id, 'due_at',
           format('%s: "%s" has no date at all - not in the syllabus, not in Blackboard. When is it due?',
                  a.course_id, a.title),
           jsonb_build_object('source', 'stage_gaps', 'type', a.type)
      from assignments a
     where a.due_at is null and a.due_date is null and a.event_start is null
       and not attention_answered('missing', a.course_id, a.id, 'due_at')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_dates = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', r.course_id, 'reading', r.id::text, 'for_date',
           format('%s: the reading "%s" is not tied to a class date, so it cannot appear in the tracker.',
                  r.course_id, left(r.citation, 120)),
           jsonb_build_object('source', 'stage_gaps')
      from readings r
     where r.for_date is null
       and not attention_answered('data_gap', r.course_id, r.id::text, 'for_date')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_read = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', f.course_id, 'bb_file', f.id::text, 'storage_path',
           format('%s: "%s" is in the catalog but its bytes were never stored, so it cannot be opened or searched.',
                  coalesce(f.course_id, f.bb_course_id), f.file_name),
           jsonb_build_object('source', 'stage_gaps', 'source_url', f.source_url)
      from bb_files f
     where f.storage_path is null and f.superseded_by is null
       -- Phase 10a (R2-4): a pulled-back submission file is catalogued with no bytes ON PURPOSE,
       -- by stage_attempts, moments before this stage runs in the same transaction. bb-sync step
       -- 4b downloads it seconds later and nothing here would ever clear the item, so raising one
       -- puts a permanent question in the Inbox about a state that resolves itself. Step 4b
       -- reports the files it genuinely could not pull instead. A file Stack STAGED has a null
       -- attempt_id and is not excluded: if its bytes go missing, the gap is the right signal.
       and not (f.bucket = 'my_submissions' and f.attempt_id is not null)
       -- 161: an outside link (cbo.gov, sec.gov, ...) has no Blackboard bytes to store.
       and not bb_file_is_outside_link(f.source_url)
       -- 164: nor does a Blackboard file whose link redirects to another site (outside_url).
       and f.outside_url is null
       and not attention_answered('data_gap', f.course_id, f.id::text, 'storage_path')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_files = row_count;

    v_counts := jsonb_build_object(
      'courses_without_scheme', v_scheme,
      'assignments_without_date', v_dates,
      'readings_without_date',  v_read,
      'files_without_bytes',    v_files,
      'attention_raised',       v_scheme + v_dates + v_read + v_files,
      'gaps_closed',            coalesce((v_closed->>'closed')::int, 0));  -- 114
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gaps', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gaps','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

revoke all on function public.stage_gaps(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gaps(uuid,bigint) to service_role;

-- =============================================================================================
-- 6. v_bb_files_current carries outside_url
-- =============================================================================================
-- 018 froze `select *` at its creation, so the view has none of the columns added since. Re-created with
-- the same select, it gains them, outside_url among them. security_invoker is restated: CREATE OR REPLACE
-- VIEW replaces the view's options, and 036 set it on every public view.
create or replace view public.v_bb_files_current with (security_invoker = true) as
  select * from public.bb_files where superseded_by is null;

-- =============================================================================================
-- 6b. outside_url follows source_url
-- =============================================================================================
-- stage_files (124, rule 2) rewrites source_url IN PLACE when a file is re-uploaded. A link saved for
-- the old URL must not outlive it, or the new upload would stay off the worklist. A row trigger, not a
-- rule in stage_files, so every writer of source_url is covered and 124 stays frozen.
create or replace function public.bb_files_outside_url_follows_source()
  returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if new.source_url is distinct from old.source_url then
    new.outside_url := null;
  end if;
  return new;
end $$;

comment on function public.bb_files_outside_url_follows_source() is
  'Trigger function (164): a bb_files row whose source_url changes loses its outside_url, so a re-uploaded '
  'file is pulled again instead of staying a link to the old upload''s redirect.';

revoke all on function public.bb_files_outside_url_follows_source() from public, anon, authenticated;

drop trigger if exists bb_files_outside_url_follows_source on public.bb_files;
create trigger bb_files_outside_url_follows_source
  before update of source_url on public.bb_files
  for each row execute function public.bb_files_outside_url_follows_source();

-- =============================================================================================
-- 7. Privileges
-- =============================================================================================
revoke all on function public.sync_file_outside_link(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.sync_file_outside_link(bigint, text) to sync_runner, db_test_runner;

revoke all on function public.sync_file_worklist() from public, anon, authenticated, service_role;
grant execute on function public.sync_file_worklist() to sync_runner;

-- =============================================================================================
-- 8. Guard
-- =============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array['public.sync_file_outside_link(bigint, text)', 'public.sync_file_worklist()',
                           'public.close_cleared_gaps(bigint, text)', 'public.stage_gaps(uuid, bigint)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
      raise exception 'FAIL 164: % lost SECURITY DEFINER or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FAIL 164: % is executable by anon or authenticated', f;
    end if;
  end loop;
  foreach f in array array['public.sync_file_worklist()', 'public.close_cleared_gaps(bigint, text)', 'public.stage_gaps(uuid, bigint)'] loop
    if position('-- 164:' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      raise exception 'FAIL 164: % is not the 164 body', f;
    end if;
  end loop;
  -- sync_file_outside_link is sync_runner's and the test login's alone.
  f := 'public.sync_file_outside_link(bigint, text)';
  if has_function_privilege('service_role', f, 'execute') or has_function_privilege('inbox_apply_runner', f, 'execute')
     or not has_function_privilege('sync_runner', f, 'execute') or not has_function_privilege('db_test_runner', f, 'execute') then
    raise exception 'FAIL 164: % is not executable by sync_runner and the test login alone', f;
  end if;
  -- stage_gaps and close_cleared_gaps stay service_role's; the worklist stays sync_runner's.
  if not has_function_privilege('service_role', 'public.stage_gaps(uuid, bigint)', 'execute')
     or not has_function_privilege('service_role', 'public.close_cleared_gaps(bigint, text)', 'execute')
     or has_function_privilege('sync_runner', 'public.stage_gaps(uuid, bigint)', 'execute')
     or has_function_privilege('sync_runner', 'public.close_cleared_gaps(bigint, text)', 'execute')
     or not has_function_privilege('sync_runner', 'public.sync_file_worklist()', 'execute')
     or has_function_privilege('service_role', 'public.sync_file_worklist()', 'execute') then
    raise exception 'FAIL 164: a re-created function changed who can execute it';
  end if;
  -- The rules of 091, 114 and 161 are still in the bodies.
  if position('file_stored_or_superseded' in (select prosrc from pg_proc where oid = 'public.close_cleared_gaps(bigint, text)'::regprocedure)) = 0
     or position('outside_link' in (select prosrc from pg_proc where oid = 'public.close_cleared_gaps(bigint, text)'::regprocedure)) = 0
     or position('my_submissions' in (select prosrc from pg_proc where oid = 'public.stage_gaps(uuid, bigint)'::regprocedure)) = 0
     or position('bb_file_is_outside_link' in (select prosrc from pg_proc where oid = 'public.stage_gaps(uuid, bigint)'::regprocedure)) = 0
     or position('bb_file_is_outside_link' in (select prosrc from pg_proc where oid = 'public.sync_file_worklist()'::regprocedure)) = 0 then
    raise exception 'FAIL 164: a body lost a rule of 091, 114 or 161';
  end if;
  -- The column, its check, and the view.
  if not exists (select 1 from pg_constraint where conrelid = 'public.bb_files'::regclass and conname = 'bb_files_outside_url_ck') then
    raise exception 'FAIL 164: bb_files_outside_url_ck is missing';
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.v_bb_files_current'::regclass
                    and a.attname = 'outside_url' and not a.attisdropped) then
    raise exception 'FAIL 164: v_bb_files_current does not carry outside_url';
  end if;
  if not coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c
                    where c.oid = 'public.v_bb_files_current'::regclass), false) then
    raise exception 'FAIL 164: v_bb_files_current is not security_invoker';
  end if;
  if has_table_privilege('anon', 'public.v_bb_files_current', 'select') then
    raise exception 'FAIL 164: anon can select v_bb_files_current';
  end if;
  -- outside_url follows source_url: a BEFORE UPDATE OF row trigger with a pinned path.
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.bb_files'::regclass
                    and t.tgname = 'bb_files_outside_url_follows_source' and not t.tgisinternal
                    and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16
                    and t.tgattr::text <> ''
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 164: bb_files_outside_url_follows_source is missing or is not a BEFORE UPDATE OF row trigger';
  end if;
  if has_function_privilege('anon', 'public.bb_files_outside_url_follows_source()', 'execute')
     or has_function_privilege('authenticated', 'public.bb_files_outside_url_follows_source()', 'execute') then
    raise exception 'FAIL 164: the outside_url trigger function is executable by anon or authenticated';
  end if;
  -- sync_runner executes the fifteen: 187 and 188 pinned fourteen, and this is the one that adds to them.
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_outside_link,sync_file_stored,sync_file_worklist,'
     'sync_login_ok,sync_login_required,sync_next,sync_own_claims,sync_register_run,'
     'sync_request_inbox_apply,sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 164: sync_runner does not execute exactly the fifteen';
  end if;
end $$;
