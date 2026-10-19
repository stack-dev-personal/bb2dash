-- bb2dash :: 214_db_test_runner_phase26_grants.sql
-- Phase 26 follow-up (Stack, 2026-10-19: "fix the test grants"). Block 210-219.
--
-- The test login (100) holds select on every table and execute only on what earlier suites called.
-- Two Phase 26 units fail under it with "permission denied" (they passed when W-110 ran them as the
-- owner): phase26_212_bind calls 212's name helpers directly, and phase26_213_activity_new_only calls
-- stage_courses and inserts a course_staff row inside its rolled-back transaction. This grants
-- exactly those, the way 117 and 128 did for their phases:
--   * execute on announcement_singular(text) and announcement_slug(text) (212; owner only until now)
--   * execute on stage_courses(uuid, bigint) (034/213; service_role only until now)
--   * insert on course_staff (the 213 unit's fixture row)
-- Nothing on cron, vault, storage, auth or net; nothing else the role does not need. The live
-- roles (sync_runner, inbox_apply_runner, workspace_runner) are untouched.

grant execute on function
  public.announcement_singular(text),
  public.announcement_slug(text),
  public.stage_courses(uuid, bigint)
to db_test_runner;

grant insert on public.course_staff to db_test_runner;

do $$
begin
  if not has_function_privilege('db_test_runner', 'public.announcement_singular(text)', 'execute')
     or not has_function_privilege('db_test_runner', 'public.announcement_slug(text)', 'execute')
     or not has_function_privilege('db_test_runner', 'public.stage_courses(uuid, bigint)', 'execute')
     or not has_table_privilege('db_test_runner', 'public.course_staff', 'insert') then
    raise exception 'FAIL 214: a grant to db_test_runner is missing';
  end if;
  if has_function_privilege('anon', 'public.stage_courses(uuid, bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.stage_courses(uuid, bigint)', 'execute')
     or has_function_privilege('anon', 'public.announcement_slug(text)', 'execute') then
    raise exception 'FAIL 214: a function is executable by anon or authenticated';
  end if;
end $$;
