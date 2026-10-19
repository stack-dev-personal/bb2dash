-- bb2dash :: db/tests/phase18_164_redirect_outside_links.sql
-- Tests migration 164 (fix/redirect-outside-links; Stack, 2026-10-14: "the redirect links should be
-- saved as links then and not throw errors when bytes can't be pulled"): a Blackboard file whose link
-- redirects to another SITE is saved as that link (bb_files.outside_url) by the sync runner, and then
-- reads as an outside link everywhere migration 161 made outside links count.
--
--   0. installed: sync_file_outside_link is 164's, SECURITY DEFINER, owned by postgres, path pinned,
--      executable by sync_runner and db_test_runner and nobody else; stage_gaps, close_cleared_gaps and
--      sync_file_worklist carry 164's marked lines; sync_runner executes exactly the seventeen;
--      v_bb_files_current exposes outside_url, still security_invoker, still closed to anon
--   a. the column's check: http(s) only, no whitespace or control characters, 2048 at most
--   b. the function refuses each bad URL (null, empty, not http(s), no host, credentials, IP literals
--      in every spelling, localhost, a single-label host, every Blackboard host, whitespace, control
--      characters, too long) with 22023 and writes nothing
--   c. it accepts a real outside link, with a host spelled in capitals and a port, and sets nothing else
--      but outside_url and a note that names the host
--   d. it writes only a catalogued, unsuperseded, never-stored, not-yet-linked row that is not a
--      submission and does not already carry an outside source_url: each other row answers false and
--      is left alone; an unknown id answers false
--   e. a linked row leaves sync_file_worklist; a row with the Blackboard URL and no link stays on it
--   f. an open storage_path gap on the row closes with rule outside_link; a Blackboard file with no
--      link keeps its gap; stage_gaps raises none for a linked row and one for the unlinked control
--
-- Every fixture is created inside the transaction and rolled back; real rows are only read (stage_gaps
-- folds over them and nothing is asserted about them). Runs as db_test_runner, which holds sync_runner
-- WITH INHERIT FALSE (094), so the calls are made under `set local role sync_runner`.
-- Needs migration 164. RUN IT: `node scripts/db-test.mjs --only phase18_164_redirect_outside_links.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

-- A synthetic file of ECN.304. `p_url` null means a Blackboard URL; `p_bucket` a file_bucket value.
create function pg_temp.t164_file(p_name text, p_url text default null, p_bucket text default 'lecture_slides',
                                  p_attempt text default null, p_storage text default null,
                                  p_superseded bigint default null) returns bigint language sql as $$
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket, attempt_id,
                        storage_path, superseded_by, notes)
  values ('_p164', 'ECN.304', 'p164 / ' || p_name, 'p164_' || p_name || '.pdf',
          coalesce(p_url, 'https://blackboard.syracuse.edu/bbcswebdav/p164-' || replace(p_name, ' ', '-')),
          p_bucket::file_bucket, p_attempt, p_storage, p_superseded, 'phase18_164 synthetic')
  returning id
$$;

-- One call of sync_file_outside_link as sync_runner: 'true', 'false', 'null', or 'raised <sqlstate>'.
create function pg_temp.t164_call(p_id bigint, p_url text) returns text language plpgsql as $$
declare
  v_ok boolean;
begin
  set local role sync_runner;
  begin
    v_ok := public.sync_file_outside_link(p_id, p_url);
  exception when others then
    reset role;
    return 'raised ' || sqlstate;
  end;
  reset role;
  return case when v_ok then 'true' when v_ok is false then 'false' else 'null' end;
end $$;

-- Is the file on sync_runner's worklist?
create function pg_temp.t164_listed(p_id bigint) returns boolean language plpgsql as $$
declare
  v_listed boolean;
begin
  set local role sync_runner;
  select exists (select 1 from public.sync_file_worklist() w where w.id = p_id) into v_listed;
  reset role;
  return v_listed;
end $$;

-- An open storage_path gap, as stage_gaps raises it.
create function pg_temp.t164_gap(p_file bigint) returns bigint language sql as $$
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('data_gap', 'ECN.304', 'bb_file', p_file::text, 'storage_path', 'phase18_164 synthetic',
          '{"source": "stage_gaps"}'::jsonb)
  returning id
$$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  f      text;
  v_fail text[] := '{}';
  r      record;
begin
  if to_regprocedure('public.sync_file_outside_link(bigint, text)') is null then
    raise exception 'FAIL phase18_164: migration 164 is not applied (sync_file_outside_link does not exist)';
  end if;

  select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg,
         p.prorettype::regtype::text as ret
    into r from pg_proc p where p.oid = 'public.sync_file_outside_link(bigint, text)'::regprocedure;
  if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] or r.ret <> 'boolean' then
    v_fail := v_fail || 'sync_file_outside_link lost SECURITY DEFINER, its owner, its search_path or its boolean result'::text;
  end if;
  f := 'public.sync_file_outside_link(bigint, text)';
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute')
     or not has_function_privilege('sync_runner', f, 'execute')
     or not has_function_privilege('db_test_runner', f, 'execute') then
    v_fail := v_fail || 'sync_file_outside_link is not executable by sync_runner and the test login alone'::text;
  end if;

  -- The three re-created bodies carry 164's marked lines, and keep what 091 and 161 gave them.
  foreach f in array array['public.stage_gaps(uuid, bigint)', 'public.close_cleared_gaps(bigint, text)', 'public.sync_file_worklist()'] loop
    if position('-- 164:' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      v_fail := v_fail || format('%s is not the 164 body', f);
    end if;
    if not (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp'] from pg_proc p where p.oid = f::regprocedure) then
      v_fail := v_fail || format('%s lost SECURITY DEFINER or its search_path', f);
    end if;
  end loop;
  if position('outside_link' in (select prosrc from pg_proc where oid = 'public.close_cleared_gaps(bigint, text)'::regprocedure)) = 0
     or position('file_stored_or_superseded' in (select prosrc from pg_proc where oid = 'public.close_cleared_gaps(bigint, text)'::regprocedure)) = 0
     or position('bb_file_is_outside_link' in (select prosrc from pg_proc where oid = 'public.stage_gaps(uuid, bigint)'::regprocedure)) = 0
     or position('my_submissions' in (select prosrc from pg_proc where oid = 'public.stage_gaps(uuid, bigint)'::regprocedure)) = 0
     or position('bb_file_is_outside_link' in (select prosrc from pg_proc where oid = 'public.sync_file_worklist()'::regprocedure)) = 0 then
    v_fail := v_fail || 'a re-created body lost a rule of 091, 114 or 161'::text;
  end if;
  -- stage_gaps and close_cleared_gaps stay service_role's; the worklist stays sync_runner's.
  if has_function_privilege('anon', 'public.stage_gaps(uuid, bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.close_cleared_gaps(bigint, text)', 'execute')
     or has_function_privilege('sync_runner', 'public.stage_gaps(uuid, bigint)', 'execute')
     or has_function_privilege('sync_runner', 'public.close_cleared_gaps(bigint, text)', 'execute')
     or not has_function_privilege('service_role', 'public.stage_gaps(uuid, bigint)', 'execute')
     or not has_function_privilege('service_role', 'public.close_cleared_gaps(bigint, text)', 'execute')
     or not has_function_privilege('sync_runner', 'public.sync_file_worklist()', 'execute')
     or has_function_privilege('anon', 'public.sync_file_worklist()', 'execute')
     or has_function_privilege('service_role', 'public.sync_file_worklist()', 'execute') then
    v_fail := v_fail || 'a re-created function changed who can execute it'::text;
  end if;

  -- sync_runner executes exactly the seventeen SECURITY DEFINER functions.
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.proname <> 'sync_file_text_put' -- Phase 25's 200 may land before or after this; it is checked there
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_outside_link,sync_file_pull_outcomes,sync_file_stored,sync_file_worklist,'
     'sync_login_ok,sync_login_required,sync_next,sync_own_claims,sync_register_run,'
     'sync_request_announcement_review,sync_request_inbox_apply,sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    v_fail := v_fail || 'sync_runner does not execute exactly the seventeen'::text;
  end if;

  -- 164's trigger: outside_url follows source_url (BEFORE UPDATE OF source_url, per row, path pinned).
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'public.bb_files'::regclass
                    and t.tgname = 'bb_files_outside_url_follows_source' and not t.tgisinternal
                    and (t.tgtype & 1) = 1          -- row-level
                    and (t.tgtype & 2) = 2          -- BEFORE
                    and (t.tgtype & 16) = 16        -- UPDATE
                    and t.tgattr::text <> ''        -- UPDATE OF <columns>
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'trigger bb_files_outside_url_follows_source is missing or is not a BEFORE UPDATE OF row trigger with a pinned path'::text;
  end if;

  -- The column, and the current-files view the Materials page reads.
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.bb_files'::regclass
                    and a.attname = 'outside_url' and a.atttypid = 'text'::regtype and not a.attisdropped) then
    v_fail := v_fail || 'bb_files.outside_url (text) does not exist'::text;
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.v_bb_files_current'::regclass
                    and a.attname = 'outside_url' and not a.attisdropped) then
    v_fail := v_fail || 'v_bb_files_current does not expose outside_url'::text;
  end if;
  if not coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c
                    where c.oid = 'public.v_bb_files_current'::regclass), false) then
    v_fail := v_fail || 'v_bb_files_current is no longer security_invoker'::text;
  end if;
  if has_table_privilege('anon', 'public.v_bb_files_current', 'select') then
    v_fail := v_fail || 'anon can select v_bb_files_current'::text;
  end if;
  -- The view is still the chain heads of bb_files: same row count.
  if (select count(*) from public.v_bb_files_current) <> (select count(*) from public.bb_files where superseded_by is null) then
    v_fail := v_fail || 'v_bb_files_current is no longer bb_files minus the superseded rows'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- a. The column's check
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_id   bigint := pg_temp.t164_file('check');
  v_case record;
  v_hit  boolean;
begin
  for v_case in
    select * from (values
      ('ftp',          'ftp://example.com/x'),
      ('javascript',   'javascript:alert(1)'),
      ('no scheme',    'www.example.com/x'),
      ('space',        'https://example.com/a b'),
      ('tab',          E'https://example.com/a\tb'),
      ('newline',      E'https://example.com/a\nb'),
      ('control',      E'https://example.com/a\x01b'),
      ('too long',     'https://example.com/' || repeat('a', 2049)),
      ('empty',        '')
    ) t(label, url)
  loop
    v_hit := false;
    begin
      update bb_files set outside_url = v_case.url where id = v_id;
    exception when check_violation then
      v_hit := true;
    end;
    if not v_hit then v_fail := v_fail || format('the check let "%s" through', v_case.label); end if;
  end loop;

  -- 2048 characters exactly, and an ordinary link, are fine; null clears it.
  update bb_files set outside_url = 'https://example.com/' || repeat('a', 2048 - length('https://example.com/')) where id = v_id;
  update bb_files set outside_url = 'HTTP://www.example.com:8080/a?b=c#d' where id = v_id;
  update bb_files set outside_url = null where id = v_id;
  if (select outside_url from bb_files where id = v_id) is not null then
    v_fail := v_fail || 'outside_url could not be cleared'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (a): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- b. The function refuses each bad URL
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_id   bigint := pg_temp.t164_file('refuse');
  v_case record;
  v_got  text;
begin
  for v_case in
    select * from (values
      ('null',                    null::text),
      ('empty',                   ''),
      ('ftp',                     'ftp://example.com/x'),
      ('javascript',              'javascript:alert(1)'),
      ('data',                    'data:text/html,hi'),
      ('file',                    'file:///etc/passwd'),
      ('no scheme',               'www.example.com/x'),
      ('no host',                 'https://'),
      ('no host, a path',         'https:///x'),
      ('credentials',             'https://user:pw@example.com/x'),
      ('user only',               'https://user@example.com/x'),
      ('ipv4',                    'https://127.0.0.1/x'),
      ('ipv4 private',            'http://10.0.0.5:8080/x'),
      ('ipv4 link-local',         'https://169.254.169.254/latest/meta-data/'),
      ('ipv4 trailing dot',       'https://1.2.3.4./x'),
      ('ipv4 as one number',      'https://2130706433/x'),
      ('ipv4 in hex',             'https://0x7f.1/x'),
      ('ipv6',                    'http://[::1]/x'),
      ('ipv6 with a port',        'https://[2001:db8::1]:8443/x'),
      ('localhost',               'https://localhost/x'),
      ('localhost, a port',       'http://localhost:3000/x'),
      ('a localhost subdomain',   'https://app.localhost/x'),
      ('a single label',          'https://intranet/x'),
      ('a single label, a port',  'https://intranet:8080/x'),
      ('blackboard',              'https://blackboard.syracuse.edu/x'),
      ('blackboard, http',        'http://blackboard.syracuse.edu/x'),
      ('a blackboard subdomain',  'https://cdn.blackboard.syracuse.edu/x'),
      ('blackboard, capitals',    'https://BLACKBOARD.Syracuse.EDU/x'),
      ('the CDN',                 'https://us-east-1.content.blackboardcdn.com/x?X-Amz-Signature=beef'),
      ('another CDN host',        'https://learn.blackboardcdn.com/x'),
      ('the CDN apex',            'https://blackboardcdn.com/x'),
      ('blackboard.com',          'https://blackboard.com/x'),
      ('help.blackboard.com',     'https://help.blackboard.com/x'),
      ('blackboard, a port',      'https://blackboard.syracuse.edu:8443/x'),
      ('anthology.com',           'https://anthology.com/x'),
      ('an anthology subdomain',  'https://help.anthology.com/x'),
      -- a sign-in page and the university's own hosts are not "another site"
      ('microsoft sign-in',       'https://login.microsoftonline.com/common/oauth2/authorize?client_id=x'),
      ('sign-in, a SAML request', 'https://login.microsoftonline.com/tenant/saml2?SAMLRequest=abc'),
      ('a sign-in subdomain',     'https://x.login.microsoftonline.com/y'),
      ('syracuse.edu',            'https://syracuse.edu/x'),
      ('a syracuse.edu host',     'https://shib.syracuse.edu/idp/x'),
      ('syr.edu',                 'https://www.syr.edu/x'),
      -- a signed URL is not a link
      ('X-Amz-Signature',         'https://example.org/f.pdf?X-Amz-Signature=beef&X-Amz-Expires=60'),
      ('X-Amz-Credential',        'https://example.org/f.pdf?x-amz-credential=abc'),
      ('X-Goog-Signature',        'https://example.org/f.pdf?X-Goog-Signature=beef'),
      ('Signature, any case',     'https://example.org/f.pdf?SIGNATURE=beef'),
      ('sig',                     'https://example.org/f.pdf?a=1&sig=beef'),
      ('se with sp',              'https://example.org/f.pdf?sv=1&se=2026-10-14&sp=r'),
      ('Key-Pair-Id',             'https://example.org/f.pdf?Key-Pair-Id=K1'),
      ('Policy',                  'https://example.org/f.pdf?Policy=abc'),
      ('token',                   'https://example.org/f.pdf?token=abc'),
      ('access_token',            'https://example.org/f.pdf?access_token=abc'),
      ('Expires with a signature','https://example.org/f.pdf?Expires=1&Signature=beef'),
      ('space',                   'https://example.com/a b'),
      ('space in the host',       'https://exa mple.com/x'),
      ('tab',                     E'https://example.com/a\tb'),
      ('newline',                 E'https://example.com/a\nb'),
      ('control',                 E'https://example.com/a\x01b'),
      ('trailing newline',        E'https://example.com/x\n'),
      ('too long',                'https://example.com/' || repeat('a', 2049))
    ) t(label, url)
  loop
    v_got := pg_temp.t164_call(v_id, v_case.url);
    if v_got is distinct from 'raised 22023' then
      v_fail := v_fail || format('"%s" answered %s, expected raised 22023', v_case.label, v_got);
    end if;
  end loop;

  if (select outside_url from bb_files where id = v_id) is not null
     or (select notes from bb_files where id = v_id) is distinct from 'phase18_164 synthetic' then
    v_fail := v_fail || 'a refused call wrote the row'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (b): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- c. A good call, d. the rows it will not write, e. the worklist
-- =============================================================================================
do $$
declare
  v_fail   text[] := '{}';
  v_url    constant text := 'https://www.cbo.gov/system/files/2024/report.pdf?page=2#p2';
  v_good   bigint := pg_temp.t164_file('good');
  v_before bb_files;
  v_after  bb_files;
  v_case   record;
  v_id     bigint;
  v_prior  bigint;
  v_got    text;
begin
  if not pg_temp.t164_listed(v_good) then
    v_fail := v_fail || 'e: a Blackboard file with no bytes and no link is not on the worklist'::text;
  end if;

  select * into v_before from bb_files where id = v_good;
  v_got := pg_temp.t164_call(v_good, v_url);
  if v_got <> 'true' then
    v_fail := v_fail || format('c: a good call answered %s', v_got);
  end if;
  select * into v_after from bb_files where id = v_good;
  if v_after.outside_url is distinct from v_url then
    v_fail := v_fail || format('c: outside_url reads %s', v_after.outside_url);
  end if;
  if v_after.notes not like 'phase18_164 synthetic | outside link to www.cbo.gov saved ____-__-__ by sync-runner' then
    v_fail := v_fail || format('c: the note reads %s', v_after.notes);
  end if;
  if position('page=2' in v_after.notes) > 0 or position('report.pdf' in v_after.notes) > 0 then
    v_fail := v_fail || 'c: the note carries more than the host'::text;
  end if;
  -- Nothing else moved: the row with outside_url and notes blanked is the row it was.
  if (to_jsonb(v_after) - 'outside_url' - 'notes') is distinct from (to_jsonb(v_before) - 'outside_url' - 'notes') then
    v_fail := v_fail || 'c: the call changed a column other than outside_url and notes'::text;
  end if;
  if v_after.storage_path is not null or v_after.sha256 is not null or v_after.downloaded_at is not null then
    v_fail := v_fail || 'c: the call wrote bytes columns'::text;
  end if;

  -- A row with no notes gets the note itself, with no leading separator (24664d1).
  v_id := pg_temp.t164_file('no notes');
  update bb_files set notes = null where id = v_id;
  v_got := pg_temp.t164_call(v_id, v_url);
  if v_got <> 'true' or (select notes from bb_files where id = v_id) not like 'outside link to www.cbo.gov saved ____-__-__ by sync-runner' then
    v_fail := v_fail || format('c: a row with no notes got %s', (select notes from bb_files where id = v_id));
  end if;

  -- A second call on the same row writes nothing (it is linked already).
  v_got := pg_temp.t164_call(v_good, 'https://www.sec.gov/other.pdf');
  if v_got <> 'false' or (select outside_url from bb_files where id = v_good) is distinct from v_url then
    v_fail := v_fail || format('d: a second call answered %s or moved the link', v_got);
  end if;

  -- e. it left the worklist.
  if pg_temp.t164_listed(v_good) then
    v_fail := v_fail || 'e: a linked row is still on the worklist'::text;
  end if;
  v_id := pg_temp.t164_file('still on the list');
  if not pg_temp.t164_listed(v_id) then
    v_fail := v_fail || 'e: the worklist lost an ordinary Blackboard row'::text;
  end if;

  -- c. spellings that are fine: capitals in the host, a port, http, a look-alike of Blackboard.
  for v_case in
    select * from (values
      ('capitals and a port', 'https://WWW.Example.COM:8443/a'),
      ('http',                'http://newyorkfed.org/x'),
      ('a lookalike',         'https://blackboard.syracuse.edu.evil.example/x'),
      ('not blackboard.com',  'https://notblackboard.com/x'),
      ('a hyphen and digits', 'https://my-site2.example.org/x'),
      ('se alone',            'https://example.org/f.pdf?se=1'),
      ('sp alone',            'https://example.org/f.pdf?sp=r'),
      ('expires alone',       'https://example.org/f.pdf?Expires=1'),
      ('a sig-like value',    'https://example.org/f.pdf?page=sig'),
      ('syracuse.edu in a path', 'https://www.example.edu/syracuse.edu'),
      ('exactly 2048',        'https://example.com/' || repeat('a', 2048 - length('https://example.com/')))
    ) t(label, url)
  loop
    v_id := pg_temp.t164_file('ok ' || v_case.label);
    v_got := pg_temp.t164_call(v_id, v_case.url);
    if v_got <> 'true' or (select outside_url from bb_files where id = v_id) is distinct from v_case.url then
      v_fail := v_fail || format('c: "%s" answered %s', v_case.label, v_got);
    end if;
  end loop;

  -- d. the rows it will not write: each answers false and is left as it was.
  v_prior := pg_temp.t164_file('newer');
  for v_case in
    select * from (values
      ('stored',        pg_temp.t164_file('stored', null, 'lecture_slides', null, 'bb-files/p164/stored.pdf')),
      ('superseded',    pg_temp.t164_file('superseded', null, 'lecture_slides', null, null, v_prior)),
      ('a submission',  pg_temp.t164_file('submission', null, 'my_submissions', '_p164_attempt_1')),
      ('already an outside source', pg_temp.t164_file('outside source', 'https://www.example.org/p164/src')),
      ('no such row',   -1::bigint)
    ) t(label, id)
  loop
    select * into v_before from bb_files where id = v_case.id;
    v_got := pg_temp.t164_call(v_case.id, 'https://www.cbo.gov/x.pdf');
    if v_got <> 'false' then
      v_fail := v_fail || format('d: the %s row answered %s, expected false', v_case.label, v_got);
    end if;
    select * into v_after from bb_files where id = v_case.id;
    if v_after is distinct from v_before then
      v_fail := v_fail || format('d: the %s row was changed', v_case.label);
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (c-e): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- f. Gaps: close_cleared_gaps and stage_gaps
-- =============================================================================================
do $$
declare
  v_fail   text[] := '{}';
  v_linked bigint := pg_temp.t164_file('gap linked');
  v_plain  bigint := pg_temp.t164_file('gap plain');
  v_direct bigint := pg_temp.t164_file('gap direct');
  v_stored bigint := pg_temp.t164_file('gap stored', null, 'lecture_slides', null, 'bb-files/p164/gap.pdf');
  v_ctrl   bigint := pg_temp.t164_file('gap control');
  v_gap_l  bigint;
  v_gap_p  bigint;
  v_gap_d  bigint;
  v_gap_s  bigint;
  v_sr     bigint;
  v_r      jsonb;
  v_row    attention_items;
  v_got    text;
begin
  v_gap_l := pg_temp.t164_gap(v_linked);
  v_gap_p := pg_temp.t164_gap(v_plain);
  v_gap_d := pg_temp.t164_gap(v_direct);
  v_gap_s := pg_temp.t164_gap(v_stored);

  -- The sync runner's call closes the linked row's gap by itself (the statement trigger, and the
  -- function's own call); the others are untouched, the stored one closing by its own rule.
  v_got := pg_temp.t164_call(v_linked, 'https://www.cbo.gov/x.pdf');
  if v_got <> 'true' then
    v_fail := v_fail || format('f: the call answered %s', v_got);
  end if;
  select * into v_row from attention_items where id = v_gap_l;
  if v_row.state is distinct from 'archived' or v_row.archived_by is distinct from 'stage_gaps'
     or v_row.decision->>'closed_itself' is distinct from 'true'
     or v_row.decision->>'rule' is distinct from 'outside_link' then
    v_fail := v_fail || format('f: the linked row''s gap is state %s, decision %s', v_row.state, v_row.decision);
  end if;
  if (select state from attention_items where id = v_gap_p) is distinct from 'open' then
    v_fail := v_fail || 'f: a Blackboard file with no link lost its gap'::text;
  end if;

  -- An outside_url written some other way (a person, a migration) counts the same to close_cleared_gaps.
  update bb_files set outside_url = 'https://www.sec.gov/d.pdf' where id = v_direct;
  v_r := close_cleared_gaps(null, 'phase18_164_test');
  select * into v_row from attention_items where id = v_gap_d;
  if v_row.state is distinct from 'archived' or v_row.decision->>'rule' is distinct from 'outside_link' then
    v_fail := v_fail || format('f: a directly linked row''s gap is state %s, decision %s', v_row.state, v_row.decision);
  end if;
  if (select state from attention_items where id = v_gap_p) is distinct from 'open' then
    v_fail := v_fail || 'f: close_cleared_gaps closed the gap of a file with no link'::text;
  end if;
  if (select decision->>'rule' from attention_items where id = v_gap_s) is distinct from 'file_stored_or_superseded' then
    v_fail := v_fail || 'f: a stored file''s gap no longer closes by its own rule'::text;
  end if;

  -- stage_gaps: the fold raises a gap for the control (a Blackboard file, no bytes, no link) and for
  -- neither linked row, whose earlier gaps are archived and so could be raised afresh if it forgot the rule.
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values ('00000000-0164-4000-8000-000000000164', 'ok', now(), now(), 'manual', 'blackboard', 'all')
  returning id into v_sr;
  v_r := stage_gaps('00000000-0164-4000-8000-000000000164', v_sr);
  if v_r->>'status' is distinct from 'ok' then
    v_fail := v_fail || format('f: stage_gaps returned %s', v_r);
  end if;
  if not exists (select 1 from attention_items where state = 'open' and kind = 'data_gap' and entity = 'bb_file'
                    and ref = v_ctrl::text and field = 'storage_path') then
    v_fail := v_fail || 'f: stage_gaps raised no gap for a Blackboard file with no bytes and no link'::text;
  end if;
  if exists (select 1 from attention_items where state = 'open' and kind = 'data_gap' and entity = 'bb_file'
                and ref in (v_linked::text, v_direct::text) and field = 'storage_path') then
    v_fail := v_fail || 'f: stage_gaps raised a gap for a row that is an outside link'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (f): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- g. outside_url follows source_url (stage_files rewrites source_url in place on a re-upload)
-- =============================================================================================
do $$
declare
  v_fail  text[] := '{}';
  v_f     bigint := pg_temp.t164_file('follows');
  v_other bigint := pg_temp.t164_file('follows other');
  v_new   constant text := 'https://blackboard.syracuse.edu/bbcswebdav/p164-reuploaded';
  v_url   constant text := 'https://www.cbo.gov/x.pdf';
  v_got   text;
begin
  v_got := pg_temp.t164_call(v_f, v_url) || pg_temp.t164_call(v_other, v_url);
  if v_got <> 'truetrue' or pg_temp.t164_listed(v_f) then
    v_fail := v_fail || 'g: setup, the rows are not linked and off the worklist'::text;
  end if;

  -- A change to another column keeps the link; so does a source_url "change" to the same value.
  update bb_files set notes = coalesce(notes, '') || ' | touched' where id = v_f;
  update bb_files set source_url = source_url where id = v_f;
  if (select outside_url from bb_files where id = v_f) is distinct from v_url or pg_temp.t164_listed(v_f) then
    v_fail := v_fail || 'g: an update that did not change source_url cleared the link'::text;
  end if;

  -- A new source_url clears the link, and the row is back on the worklist; the other row is untouched.
  update bb_files set source_url = v_new where id = v_f;
  if (select outside_url from bb_files where id = v_f) is not null then
    v_fail := v_fail || 'g: a changed source_url left the old outside_url'::text;
  end if;
  if not pg_temp.t164_listed(v_f) then
    v_fail := v_fail || 'g: the re-uploaded row is not back on the worklist'::text;
  end if;
  if (select outside_url from bb_files where id = v_other) is distinct from v_url then
    v_fail := v_fail || 'g: the trigger touched another row'::text;
  end if;

  -- One statement that changes source_url and sets outside_url: a changed source_url means no link.
  update bb_files set source_url = v_new || '-2', outside_url = v_url where id = v_f;
  if (select outside_url from bb_files where id = v_f) is not null then
    v_fail := v_fail || 'g: an update changing source_url kept an outside_url set in the same statement'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_164 (g): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase18_164_redirect_outside_links: PASS' as result, current_user as ran_as;

rollback;
