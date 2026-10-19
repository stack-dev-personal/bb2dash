# 120 · Phase 26 — the announcement reader

Status: **APPROVED by Stack 2026-10-19** (plan `~/.claude/plans/vivid-dreaming-tide.md`, his answers below).
Branch `feat/phase26-announcement-reader`, worktree `bb2dash-wt-26`. Migrations **210–219**. Runs in parallel with
Phase 25 (200–209). **210–212 go to prod only after Phase 25's migrations are applied.** This phase does not touch
the Inbox kind check, so the two phases do not clash there.

## Why

The sync stores announcements and shows them, but nothing reads them. Professors post work there first, and some
work only reaches Blackboard as a gradebook column once it is graded. On 2026-10-19, ECN 304 posted "Quiz 5 This
Thursday (10/22)" and the planner had no Quiz 5. Quiz 2 and Quiz 3 were added by hand from announcements, Quiz 3 only
after the class that held it. Quiz 5 was added by hand on 2026-10-19 (`ECN.304/quiz-5`, tentative, title "Quiz 5").

## Stack's answers (2026-10-19)

1. Search for what already exists. If nothing exists **for that class**, add it. Ask on changes.
2. The first run reads the **last 14 days**.
3. **Start now**, in parallel with Phase 25.
4. Add Quiz 5 by hand today (done).

## Rules that stand

* **B-43:** the sync holds no LLM. The reader runs in the `apply` container, which is filed a request after a
  sync closes done, exactly as Phase 23's Inbox apply is.
* `apply` shares no network or volume with the sync (`docker/apply/image.test.mjs`).
* `assignment_progress` and `reading_progress` are never written by the reader.
* **No fabricated numbers.** Every date, time or point value the reader writes must be quoted from the
  announcement, and the database checks the quote.

## How it decides (the skill, per announcement, scoped to its course)

1. List the graded work it names: title, kind, number, date and time, points if stated.
2. Search what exists for that course:
   * the course's `assignments` rows, including series placeholders (`*-series`), read with the `query` tool;
   * the course's materials (syllabus, schedule) with `search_materials`, course-scoped.
3. Decide:

| Case | Action | Inbox item |
|---|---|---|
| No planner row for this item, and the materials are silent or agree. A new number in a known series counts as "no row". | **add** the row | kind `deadline`: a notice, Dismiss = seen (a note on Dismiss goes to `/inbox-apply`) |
| No planner row, but the materials disagree (e.g. another date) | **ask** | `stack_must_confirm` |
| A row exists and the announcement gives a new **due date/time or points** | **change**, as a question | `conflict`: from = what bb2dash has, to = the announcement's. Accept is applied by `apply_resolutions()` on the next transform, as today. |
| A row exists and the change is not one field value (cancelled, "pushed out", presentation day moved) | **ask** | `stack_must_confirm`, free-text answer, applied by `/inbox-apply` |
| A row exists with the same facts, or the post is not about graded work (welcome, study guide posted, textbook) | nothing | none |

Every item the reader raises carries, in `suggested`:
`{"source": "announcement", "announcement_id": <announcements.id>, "bb_item_id": "...", "announcement_title": "...", "posted_at": "...", "quote": "..."}`.
The web UI keys off `suggested.source = 'announcement'`.

## Contract

### Migration 210 `210_announcement_reviews.sql`: tracking and the request

* The `agent_requests` kind check gains `'announcement_review'`. The live check is
  `('sync','transform','inbox_feedback')`: drop it and re-add it with the fourth kind.
* Table `announcement_reviews`:
  * `announcement_id bigint primary key references announcements(id) on delete cascade`
  * `modified_seen timestamptz`: the announcement's `coalesce(modified_at, posted_at)` when reviewed
  * `request_id bigint references agent_requests(id)` (null for the backfill floor rows)
  * `reviewed_at timestamptz not null default now()`
  * `outcome text not null check (outcome in ('nothing','acted','before_floor','refused'))`
  * `summary text`, `detail jsonb not null default '{}'`
  * RLS on; owner select policy; no anon.
* **The 14-day floor:** the migration inserts one `before_floor` row for every announcement whose `posted_at` is
  older than `now() - interval '14 days'` at apply time. The floor needs no setting or date constant.
* View `v_announcements_unreviewed` (security_invoker): announcements with no review row, or with
  `coalesce(modified_at, posted_at) > modified_seen` (edited since).
* `sync_request_announcement_review(p_after bigint) returns bigint`, SECURITY DEFINER. It copies the pattern of
  `sync_request_inbox_apply` (187):
  * only after a `sync` request that is `done` and claimed by `sync-runner`;
  * advisory lock key **1400910003**;
  * an open (queued or claimed) `announcement_review` request is returned as it is;
  * otherwise, when `v_announcements_unreviewed` is non-empty, insert one queued request with
    `params {"trigger":"sync","after":p_after}`;
  * execute for `sync_runner` only (plus `service_role`, `db_test_runner`).
* A partial unique index allowing one open `announcement_review` request (the pattern of 183).

### Migration 211 `211_announcement_reader_functions.sql`: what the reader may do

The worker and its Claude process share the `inbox_apply_runner` login (181). Additive grants:

* `select` on `announcements`, with a select policy for the role.
* Functions, all SECURITY DEFINER, `search_path = public, pg_temp`, refusals SQLSTATE 22023 with a message that
  starts with the function's name, executable by `inbox_apply_runner` (plus `db_test_runner`; never anon or
  authenticated). The claimant name is `'inbox-apply-runner'` (181's).
  * `announcement_review_claim() returns table(id bigint)`:
    1. releases dead claims the way 184 does (its own open claim, or another claimant's after 30 minutes);
    2. claims the oldest queued `announcement_review` request.
  * `announcement_review_prepare(p_request bigint) returns jsonb`: the request must be the caller's own claim.
    Returns `{"announcements":[{id, course_id, title, posted_at, modified_at, bb_item_id}...], "runs_today": n}`,
    the at most **6** oldest unreviewed. Ids only: the text is read by the skill through `query`.
  * `announcement_review_record(p_request bigint, p_announcement bigint, p_decision jsonb) returns jsonb`.
    This is **the reader's only write path**. In one transaction it validates everything, then writes.
    The decision shape:
    ```json
    { "outcome": "nothing" | "acted",
      "summary": "one sentence, ≤ 300 chars",
      "add":    [ { "slug": "quiz-5", "title": "Quiz 5", "type": "quiz",
                    "due_at": "2026-10-22T19:30:00Z" | null, "due_date": "2026-10-22" | null,
                    "event_start": "..." | null, "submission": "in_class" | null,
                    "series_key": "ECN.304/quiz" | null, "sequence_no": 5 | null,
                    "points_possible": null | number, "description": "≤ 1000 chars" | null,
                    "question": "the Inbox notice text, ≤ 300", "quote": "verbatim from the post" } ],
      "change": [ { "assignment_id": "ECN.304/quiz-4", "field": "due_at" | "due_date" | "points_possible",
                    "to_value": <json>, "question": "≤ 300", "quote": "..." } ],
      "ask":    [ { "assignment_id": "..." | null, "question": "≤ 300", "quote": "..." } ] }
    ```
    Checks; any failure refuses the whole decision:
    * the request is the caller's own claim;
    * the announcement is unreviewed;
    * `outcome = 'nothing'` iff all three arrays are empty;
    * each array has ≤ 5 entries;
    * `quote` is non-empty, ≤ 500 chars, and appears in the announcement's title or body, compared after
      lowercasing and collapsing whitespace;
    * add:
      * `slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'`;
      * `course_id || '/' || slug` does not exist;
      * `type` is an `assignment_type` value;
      * at least one of `due_at`, `due_date`, `event_start` is set;
      * `series_key`, if given, starts with `course_id || '/'`;
      * `submission` is a `submission_channel` value;
      * the row is inserted `source 'blackboard'`, `confidence 'tentative'`, `recurrence 'one_off'`,
        `bb_item_id` = the announcement's, `source_ref = format('announcement %s (%s)', bb_item_id, posted_at::date)`;
    * change: the assignment exists **in the announcement's course**; `field` is in the allow-list; `to_value`
      casts to the field's type;
    * ask: `assignment_id`, if given, exists in the same course.

    Writes:
    * each add inserts the row, then raises `deadline` (entity `assignment`, ref the new id, field
      `announcement_add`, to_value the due value);
    * each change raises `conflict` (field = the field, from = current value, to = to_value);
    * each ask raises `stack_must_confirm`:
      * entity `assignment` and ref its id, or entity `announcement` and ref `announcement:<bb_item_id>`;
      * field `announcement`.

    Every raise goes through `raise_attention(null, ...)` with the shared `suggested` object above. Then the
    function upserts `announcement_reviews` (outcome, summary, detail = the decision, `modified_seen`) and logs
    one row per write in `announcement_review_writes` (id, request_id, announcement_id, action
    `add|change|ask`, assignment_id, attention_item_id, at). It returns
    `{"added":[ids], "raised":[attention ids]}`.
  * `announcement_review_skip(p_request, p_announcement, p_why text)`: marks one announcement `refused`, for when
    the reader cannot form a valid decision, so a bad post never loops.
  * `announcement_review_close(p_request bigint, p_state text, p_result jsonb) returns bigint`:
    1. closes the caller's own claim `done` or `failed` with `result`;
    2. when the state is `done` and unreviewed announcements remain, files and returns one follow-up queued
       request (`params {"trigger":"follow_up","after":p_request}`), otherwise null.
* `inbox_apply_runner` holds **no** insert/update on `announcement_reviews` or `announcement_review_writes`.
  Only the functions write them. The 181 trigger `inbox_apply_log_write` does not fire, because the function runs
  as `postgres`; `announcement_review_writes` is this path's log.

### Migration 212 `212_bind_announcement_rows.sql`: no duplicate when the column appears

* `bind_announcement_rows(p_run_id uuid) returns jsonb`. For each gradebook column in the run's `kind='course'`
  payloads (read it the way `stage_assignments`, `126_assignment_bb_url.sql`, does) that no assignment carries as
  `bb_column_id`, bind it to the row when **exactly one** row in the same course matches all of:
  * `bb_column_id is null`;
  * `source_ref like 'announcement %'`;
  * `confidence <> 'confirmed'`;
  * one of:
    * lowercased, whitespace-collapsed title with any trailing `(…)` removed = the same of the column name; or
    * the column name parses as `<word> <n>` (e.g. "Quiz 5", "Lab #2"), the row's `sequence_no = n`, and the
      row's `series_key` ends with `'/' || <word stem>`.

  The bind sets only `bb_column_id`. Then `stage_assignments` matches the column by id, as it does today. Two or
  more candidates: no bind, so today's `stack_must_confirm` still fires. Returns counts.
* `run_transform` is replaced (latest body: `135_sync_run_open_at_claim.sql`, line 105), unchanged except one
  step: `bind_announcement_rows` runs before `stage_assignments`, recorded like the other stages.

### Sync (`sync/`)

`sync/src/db.ts` gains `requestAnnouncementReview(after)`, which calls `sync_request_announcement_review`. The loop
calls it right after `requestInboxApply`. A failure there is logged and never fails the sync. Unit tests follow
the `requestInboxApply` ones.

### Apply worker (`apply/`)

* The loop's pass claims `inbox_feedback` first (unchanged). If idle, it claims `announcement_review` and runs
  that pass instead, one request at a time.
* An announcement pass:
  1. `prepare`;
  2. one `claude -p` run of `/announcement-review <request> --unattended --announcements 1,2,3` (numbers only
     in argv), model **sonnet**, single agent, with the tools `query`, the **new** `record_review`, and the
     materials tools;
  3. any announcement still unreviewed after the run gets `announcement_review_skip(..., 'no decision recorded')`;
  4. close.

  It shares the same day's run cap, time limit, budget and init checks.
* The MCP SQL server (`apply/src/mcp-sql/server.ts`) gains the tool `record_review(announcement_id, decision)`,
  which calls `announcement_review_record` with the claimed request id. The tool gate (`apply/src/hooks/`) allows
  it only in an announcement run.

### Skill `skills/announcement-review/SKILL.md`

The decision procedure above, written for an unattended run:
* read each announcement with `query`, plus the course's assignments and series rows;
* search the materials course-scoped;
* build one decision per announcement and call `record_review` once per announcement;
* never invent a date, time or point value: unquotable means `ask`;
* class times come from the course's `meetings` rows when the post says "in class" with no time;
* the timezone is America/New_York.

### Web (`web/`)

For rows whose `suggested.source = 'announcement'`:
* `sourceText`: "From the announcement “<title>” in ECN 304. Raised by the announcement reader.";
* `sourceChip`: `announcement`;
* `sourceHref`: the assignment when ref is one, else `/announcements`;
* the conflict card's pane label "Announcement", not "Blackboard", and its button "Accept the announcement",
  with the same `accept: 'blackboard'` payload so `apply_resolutions` applies it;
* the `deadline` notice reads as added: "Added to your planner from this announcement. Dismiss once seen; a note
  asks for a change."

Unit tests in `web/test/`; the token audit stays at 0. This is visual, so it goes to a Vercel preview for Stack.

## Verification

* `db/tests/phase26_210_*.sql`, `phase26_211_*.sql`, `phase26_212_*.sql`, in the format of the phase23 units.
  Before the migrations are on prod, run them inside one rolled-back transaction with the migration
  (`begin; <migration>; <test body>; rollback;`) through `execute_sql`. **Never commit to prod before the
  cut-over.**
* Fixture cases (real posts):
  * ECN "Quiz 5 This Thursday (10/22)" before the hand row → add;
  * after it → nothing;
  * IST.323 "Due date changed for Quiz 1 & 2" → change (`due_*`) or ask;
  * ECN "Exam 1 Study Guide" → nothing;
  * IST.323 "Cancelling Class Today" → ask.
* `npm test` in `web/`, `apply/`, `sync/`; `/code-review`; `/security-review` (new grants, a new write path, a new
  MCP tool).
* Live, at cut-over:
  1. Phase 25's migrations are already in;
  2. apply 210–212 byte-identical;
  3. rebuild `sync` (no sync open) and `apply` alone;
  4. the next sync files one review;
  5. the 14-day backfill's Inbox items match the table.

## DECISIONS rows owed (in the PR)

1. The reader lives in `apply` (B-43 stands).
2. The add-from-announcement write path, through `announcement_review_record` only.
3. The auto-bind (212) amends 2026-09-22's "with Stack's confirmation first", for announcement rows only.
4. Block 210–219.
5. No new Inbox kind: the reader uses `deadline` / `conflict` / `stack_must_confirm` with `suggested.source`.
