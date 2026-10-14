# Phase 24ab: finish 24a (the walk, the PRs, the cut-over, the acceptance run) and make 24b ready to start

Date 2026-10-14 · PM: the Fable session · Product manager: Stack · Named by Stack on 2026-10-14: "lets
call it phase 24ab. This phase should be to complete this walk and transition us into getting ready
to begin the development of phase 24b." · Branch `feat/workspace-24` in bb2dash and in bb2dash-stack
(24a's, not merged; 24ab adds no branch of its own) · Worktrees `C:/Users/stack/projects/bb2dash-wt-24`
and `C:/Users/stack/projects/bb2dash-stack-wt-24` · Record: append to
`docs/planning/sprint-2/verification/109c_PHASE24_VERIFICATION.md` (24a's), under a heading "Phase 24ab"
· No migration (the block 190–199 is used up; a database change here needs a ruling and a new block) ·
Extra workers, if any are needed, take W-95 to W-97 (Session 3's numbers; W-95 was the pack's author,
so a new one starts at W-96), on Opus (Stack, 2026-10-14: "Workers on opus for phase 24 only (keep sonnet on
for the default workflow)") · New planning documents take 119 and 120.

**This brief is the plan for one session.** Its start prompt is the last section. It does not repeat
brief 109: 109 is the contract of what 24a built, and 109c is the record of what was done.

**When 24ab is done** (Stack, 2026-10-14: "ab's completion should essentially be a and ab getting merged
to main"): when the two PRs that hold 24a and 24ab are merged to `main`. The cut-over and `just accept
24` follow at once on his separate word, and the old transcript volume is removed only after that run
is green ("wait until its accepted to delete old transcripts").

**Beside it, from 2026-10-14:** Phase 24b's data layer runs in its own session (brief 111, "The data
layer, started early"), on `feat/workspace-page-24b`, cut from `origin/feat/workspace-24`. It writes only
new files under `web/src/lib/`, `use-workspace-stream.ts`, the labels file and their tests, and none of
those is 24ab's. When 24ab pushes, that session merges `origin/feat/workspace-24`; push this branch
after each piece so it is never far behind.

## The end goal, and the road to it

**Where the Workspace is meant to end up** (Stack's request of 2026-10-08 and his seventeen answers,
`109a_PHASE24_open_questions.md`): a personal study assistant inside bb2dash. He opens one page, picks
a course or attaches a file (from his materials or from his laptop), picks a routine (quiz me, study
guide, explain this file, summarise a reading, plan my week, drafting help) and how hard to think,
and asks. Before the answer is written, his course files, his own uploads and what it remembers of
earlier conversations are searched for him, and it sees what is due and what has been graded. The
answer is formatted, every source it used is a numbered chip that opens the file, and a side panel
shows those sources, the files he has uploaded with whether each has been read yet, and what it
remembers, each item deletable. It runs on his Claude subscription, inside his own database, and it
can change nothing in his planner or his grades.

**The road, in four steps:**

| step | what it is | state on 2026-10-14 |
|---|---|---|
| **24a** | everything behind the page: sessions from the database, the planning and answering turns, the one pgvector store, uploads and their worker, the planner and grades feed, memory (built, switched off) | built and reviewed on `feat/workspace-24`; migrations 190–199 and two edge functions live on prod; the test images built; **not walked, not merged, not cut over** |
| **24ab** (this brief) | walk 24a on the real site, merge it, cut it over, accept it with `just accept 24`, and bring brief 111 up to date so 24b can start the day its gate opens | starting |
| **24b** | the page: the lobby, the composer with its chips and menus, formatted answers with source chips, the side panel, uploads from his laptop, memory switched on (brief `111_PHASE24B_workspace_page.md`) | specified; its data layer starts now beside 24ab (Stack, 2026-10-14); the page's streams start when Phase 22 and 24a/24ab are on `main`; it merges after 24a is accepted |
| **after 24b** | what the answers left for later, each a phase only if he asks: a name-checking proxy for the containers' outbound traffic; moving the sync's insert of course units behind a function; the assistant's search onto the HNSW index once its median passes 60 ms (his answer "a" to item 23); a second runner; a write path to the planner with propose-then-approve | not planned |

What he sees change at each step: after **24a's cut-over** today's page answers better (it searches
first, follows a conversation from the database, sees the planner, says plainly when nothing of his
matched) and looks the same. After **24b** the page is the one in his pictures.

## Where 24a stands (read 2026-10-14)

* **On prod, live:** migrations 190–199, each byte-identical to its file, every `phase24_*` unit and the
  store's proof green; `workspace-search` v1 and `workspace-embed` v3, `verify_jwt` on; the login
  `workspace_ingest_runner` with its password set by Stack (task 48 done, 2026-10-09).
* **Built, not live:** the runner, the materials server's batch entry, the upload worker and parser,
  the images (`bb2dash-workspace:wt24`, `bb2dash-workspace-ingest:wt24`, `bb2dash-apply:wt24`, built
  2026-10-09 from the branch after the review round; the live tags have never moved).
* **Proved:** probes P-1 to P-6, P-8 to P-11; both reviews, every finding acted on fixed; all suites
  green on the branch. **Not proved:** P-7 (the first real download through the worker's firewall),
  the walk, the acceptance run.
* **The branch is behind `main`.** On 2026-10-14 `origin/main` is e820b29 and `feat/workspace-24` is 64
  commits behind it (Phase 23's follow-ups merged and were accepted, Phase 16's migration 107, export
  fixes). Files both sides touched: `CLAUDE.md`, `DATA_SYNTAX.md` and the three `project-state` files;
  in bb2dash-stack, `doctor/lib/constants.mjs`. Rows on both sides are kept, as before.
* **Open PRs that are not this phase's:** #84 (Phase 21's step 1) and #59.
* **Phase 22 is still building** (`feat/styling-22` and its worker branches), so walk boxes
  (`bb2dash-walk22-…`) may be running. Its merge is one half of 24b's gate.

## Tasks, in order

"Runner on `<file>`" is `node scripts/db-test.mjs --only <file>` from the worktree. Every docker command
names its service; never a whole-project `up`; never `exec` into a live container. The rules file
`C:/Users/stack/projects/PARALLEL-SESSIONS-bb2dash-2026-10-08.md` still holds where it names Session 1
(Phase 22) and the shared Docker, plan, checkouts and SQL login.

| # | task | owner | check |
|---|---|---|---|
| 1 | **Read state.** `git fetch`; open PRs; worktrees; `docker ps`; `C:/Users/stack/.bb2dash-accept/` for an `accept.lock`. Note what moved since this brief | PM | a short "where it stands" paragraph in 109c under "Phase 24ab" |
| 2 | **Merge `origin/main` into both branches** (a merge, never a rebase), keeping both sets of rows in the shared files. Then re-do brief 109's list after a merge: `node docker/apply/fork-firewall.mjs --write` and `--check`, `git diff --exit-code docker/apply`; `cd apply && npm ci && npm run typecheck && npm run build && npx vitest run`; the five container test files; the runner, ingest, materials, sync and web suites; `node --test acceptance/acceptance.test.mjs`; the scripts suite; the types file (regenerate from prod; keep `main`'s file plus 24a's objects, and nothing of another phase that is not on `main`); in bb2dash-stack `node --test doctor/*.test.mjs scripts/*.test.mjs` | PM | every suite green, the figures in 109c; the sync and apply services resolved by `docker compose config` identical to `main`'s |
| 3 | **Rebuild the three test images** from the merged head, under their test tags (`C:/Users/stack/.bb2dash-wt24/test-tags.compose.yaml`), the four live tags read before and after | PM | the four live ids unchanged; three build exits 0; the image ids in 109c |
| 4 | **The walk window, on Stack's word.** The procedure is the next section. It holds P-7 | PM | the section's checks |
| 5 | **Record the walk and fix what it finds.** A defect goes to a worker (W-96 on, Opus) with a test first; a fix is merged and the walk step that found it is walked again | PM | 109c "Phase 24ab, the walk": one line per step, what the page showed, the host's reads, the defects and their fixes |
| 6 | **Docs and the two PRs.** STATUS ("Phase 24a" section: walked; the "Not done yet" list), DECISIONS (the walk's rulings), ORCHESTRATOR (rows 24a, 24ab, 24b; §4), the root `CLAUDE.md` if a fact moved. Open the bb2dash PR (base `main`, head `feat/workspace-24`) and the bb2dash-stack PR, each body naming what it holds, the migrations already on prod, and what waits for the cut-over. **Stop at "ready when you say so."** | PM | `gh pr view --json state -q .state` prints `OPEN` in both repositories |
| 7 | **Merge, on Stack's word, bb2dash first, then bb2dash-stack**, only with no acceptance run open (rules file, rule 2) | PM | both merged; `main` holds 24a |
| 8 | **The cut-over, on a separate word.** With no question, apply request or sync open: fast-forward both main checkouts (`C:/Users/stack/projects/bb2dash`, `C:/Users/stack/projects/bb2dash-stack`), then from bb2dash-stack, one service at a time, each alone: `workspace` (made again with `up -d --build workspace`, so its new tmpfs and secrets take effect), `workspace-extract`, `workspace-ingest`, `apply` (it copies the runner's modules), then `sync` (its files pass changed). The old volume `workspace-claude-home` is left in place; removing it is Stack's word | PM | each service healthy; the ingest worker's first heartbeat row (`select count(*) from workspace_ingest_heartbeat` gives 1); the sync container's login intact (no `sync-login-required` item) |
| 9 | **`just accept 24`** from bb2dash-stack's `main`, right after the cut-over, Step 1 (Usage credits) stays Stack's. Green counts as acceptance: write the "accepted" record and the DECISIONS row and merge that docs-only PR (ORCHESTRATOR §3, step 9). Red goes to Stack with the run's `REPORT.md`. Blocked is run again | PM | the run's `REPORT.md` reads green |
| 10 | **Bring brief 111 up to date with 24a as built** (the section "What 24b must know about 24a as built" below is the list), re-read Phase 22 as it stands, and write 111's open questions for Stack (the section "24b: what is still his to say" below) | PM | 111 holds an "Amendments after 24a, as built" section; the questions are put to Stack in the session's last report |
| 11 | **Cleanup** after the merge: the 24a worker worktrees (`bb2dash-wt-24-db`, `-runner`, `-search`, `-ingest`, `-pack`, `-port`) and their branches, local and remote, once each head is an ancestor of `main`; the test images and the test project's leftovers by name; the session's scratch files. **After `just accept 24` is green, the old transcript volume `workspace-claude-home`**, by name (Stack's word of 2026-10-14 covers it). Ask before deleting anything else Stack might want | PM | `git worktree list` shows none of them; `docker image ls` shows no `:wt24` tag; `docker volume ls` shows no `workspace-claude-home` after the green run |
| 12 | **24b's start prompt for the page**, written into brief 111's last section and ORCHESTRATOR §6, for the session that opens when the page's gate is open (it may be the data layer's session, continuing) | PM | the prompt names the gate and the first three things to do |

Tasks 7 to 9 each wait for their own word. Task 10 and 12 can be done while waiting for them. If
Phase 22 merges before task 6, run pack 24's browser tests against the merged page before saying
"ready" (rules file, Session 3).

## The walk window (task 4)

**Before asking.** Tell Stack how long (about 40 minutes) and what it costs (about nine answers on his
plan, none on Opus: the questions are worded so the router sends them to Haiku or Sonnet). His word
for this session's walk is given in its start prompt; still check, at the moment of starting, that
nothing is open: no `sync` request claimed or queued, no `inbox_feedback` request claimed, no
`bb2dash-accept-` container and no `accept.lock`, no `bb2dash-walk22-` container (rules file, rules 2
and 3). If one is, wait.

**Setup, before anything stops.**

* The browser session: copy `.env.testing` from the shared checkout into the worktree's root without
  opening it (it is gitignored; it holds the test login, which is the owner's account), then
  `cd web && WALK_BASE_URL=https://web-xi-ten-uy9xk6c6p0.vercel.app WALK_STATE_PATH=<scratch>/state24.json node e2e/login.mjs`.
* An output folder in the session's scratch folder, outside every repository: answers quote course
  material, and nothing written there is committed.
* Read, and write into 109c: the four live image ids; `bb2dash-sync-1`'s id and start time; the count
  of `workspace_documents`, `workspace_document_text`, `workspace_text_embeddings` and objects in
  `workspace-uploads`; `select count(*) from workspace_conversations where not archived`.

**The window.**

1. **Stop the live Workspace**, by name, from `C:/Users/stack/projects/bb2dash-stack`:
   `docker compose stop workspace`. A question asked on the page now waits; it is answered by the test
   runner when that starts.
2. **Start the test services**, each by name, from the 24a worktree, with
   `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1`
   in front and `docker compose -p bb2dash-wt24 -f compose.yaml -f C:/Users/stack/.bb2dash-wt24/test-tags.compose.yaml --profile workspace`
   as the base: `up -d --no-deps workspace`, then `up -d --no-deps workspace-extract`, then
   `up -d --no-deps workspace-ingest`. Wait for each to be healthy. Read `v_workspace_status` (the
   runner's heartbeat) and `workspace_ingest_heartbeat` (the worker's first row: the login of task 48
   proved).
3. **Walk pack 24's browser tests, one at a time, in the spec's order**, each with
   `ACCEPT=1 ACCEPT_ONLY="<exact title>" WALK_BASE_URL=<the site> ACCEPT_STATE=<the state file> ACCEPT_OUT=<the output folder>`
   and, from the second stage on, `ACCEPT_IN=<a folder holding carry.json>` built from the earlier
   steps' facts files as `acceptance/README.md` describes, run as `npx playwright test -c e2e/accept.config.ts`
   from `web/`. The titles: `2 open workspace`, `3 course question`, `4 lookup one turn`,
   `5 standard plan`, `6 planner feed`, `7 follow-up`, `8 nothing matches`, `9 stop then answer`,
   then the upload stage `11 upload file`, then the host's wait (read the document's state until
   `indexed`, at most a few minutes), then `13 find upload`, `14 send twice`, `15 delete upload`.
4. **After each step**: open its screenshots and look at them (the lesson of Phase 21: a green test is
   not a look); read the host facts the pack's proofs read (`acceptance/24/proofs.json`), by SQL as
   read-only selects or through `scripts/accept-proofs.mjs`: the turn's `plan_state`,
   `retrieval_state`, tier and source rows; the planner's fingerprint before and after; the document's
   states. Nothing of an answer's text goes into 109c.
5. **P-7** is the worker's first download, at step 11: the row goes `stored` → `reading` →
   `text_ready` → `indexed`, and the worker's log shows the fetch and no redirect. Its pass or fail
   line goes into 109c.
6. **The store's five host proofs** (`store-*` in the pack) and `conversations-unarchived` at the end.

**Close the window, whatever happened.** Stop the three test services by name; remove their
containers, the test project's network and its exchange volume, each by name; start the live
Workspace (`docker compose start workspace` from bb2dash-stack); read it healthy and its heartbeat
fresh. Read again: `bb2dash-sync-1`'s id and start time (unchanged), the four live image ids
(unchanged), the store's counts (back to what they were: the walk's file was deleted), and the
unarchived conversations (back to the count before). If a step failed part way, the walk's own
cleanup still runs: archive what it opened through the page, and delete the synthetic upload in its
two steps.

**If the plan's limit is reached** the step is blocked, not failed: close the window the same way and
walk the rest later.

## What 24b must know about 24a as built (task 10)

Brief 111 was written on 2026-10-08, before 24a was built. These changed or were decided since, and
each goes into 111 as an amendment:

1. **No migration number is left.** 111 says "199 stays slack": 199 is 24a's review round. A database
   change for 24b needs a ruling and a new block (the next free block of ten after 199 is 200–209 at
   the time of writing; check before taking it).
2. **The labels and the source rows** (`workspace/test/fixtures/contract24/README.md`): `[M<n>]` resolves
   by `workspace_sources.text_id`, `[U<n>]` by `doc_text_id` of kind `upload`, `[R<n>]` by a memory
   row's `document_id`, `[P]` by the row of kind `feed`. **An attached file is one block with no
   label and one source row of origin `attached` with no unit id**: the page shows an attached file as
   a source row, not as numbered chips.
3. **Shapes the page calls**: `workspace_upload_register(p_sha256, p_title (1–200), p_mime, p_byte_size,
   p_signed_url, p_signed_url_expires_at, p_course_id)` returns `{id, state, existing}`;
   `workspace_document_delete(id, removed)` returns `{id, kind, state, storage_key}`;
   `workspace_ask_with`'s options keys and refusals; the ten error codes of a failed upload; the
   attachment states a turn records (`read`, `cut`, `not_ready`, `failed`, `missing`, `no_text`); the
   `sources` event `{request_id, state, found_n}`; `v_workspace_memory` and `v_workspace_index_status`
   as 197 and 199 define them; a search row now ends with `written_at`.
4. **Memory.** The runner asks for memory jobs only with `WORKSPACE_MEMORY_JOBS=on`; compose says `off`
   and its comment is right since the review round (the rolling summary is on regardless). Since 199
   a job's finish is checked against its holder and lease. 24b's task 13 flips the one value.
5. **The acceptance pack exists**: `acceptance/24/` (sixteen steps), `web/e2e/accept24.spec.ts` and
   `accept24.lib.ts`; the upload step carries a uuid and the proofs derive the file's hash in SQL; the
   four store proofs read `v_workspace_store_proof`; the host actions `ingest.start`,
   `ingest.startNoBuild` and `db.proofUntil` exist. 24b extends this pack; its browser tests' titles
   must not repeat pack 21's (a suite case forbids it).
6. **What the walk shows** (task 4) goes in too: anything the page's first real answers revealed.
7. **Workers.** 111 says Opus; 24a ran on Sonnet by Stack's word. Ask him which for 24b (below).
8. **Phase 22 as merged**: re-read its tokens, class names and the two Workspace folders when it is on
   `main`, as 111's task 1 already says.

## 24b: what was his to say (answered 2026-10-14)

His answers are written in brief 111's amendments: Opus for Phase 24; memory on at 24b's cut-over;
the data layer starts now beside 24ab; the old volume goes after the acceptance run. The questions
as they were put:

1. **Workers for 24b: Sonnet or Opus?** Default: Sonnet, as 24a.
2. **Memory switched on at 24b's cut-over** (his answer 1 asked for automatic summaries; 24a built them
   and left them off until he can see and delete them). Default: on at 24b's cut-over, as 111 says.
3. **Start 24b's non-visual half before Phase 22 merges?** The data layer (W-86: the query modules, the
   renderer's parser, citations, upload rules, the stream's `sources` event) shares no file with
   Phase 22's sweep. Default: no, keep the gate as written; the PM may cut the data stream early only
   on his word.
4. **The old transcript volume** (`workspace-claude-home`): remove it after 24a's acceptance? Default:
   leave it until he says.

## Stack's words this phase needs

| word | for |
|---|---|
| (given in the start prompt) the walk | task 4, when nothing is open |
| "merge" | task 7, both PRs, bb2dash first |
| "cut over" | tasks 8 and 9 (the acceptance run follows the cut-over without another word) |
| answers to the four questions | brief 111's freeze, later |

## Out of scope

Any page control (24b). Any change to a migration, an edge function or the store (24a's are frozen and
live). Phase 22's files. Removing pack 21. The Inbox and the sync beyond what 24a's cut-over rebuilds.

## Risks

* **The branch is 64 commits behind `main`.** The merge touches only docs on both sides in bb2dash and
  one file in bb2dash-stack, but the brief's list after a merge is re-done in full.
* **A walk box or an acceptance run is open when the window should start.** Wait; never start beside
  one.
* **The live Workspace is stopped during the window.** A question asked then is answered by the test
  runner. Close the window the same way whatever happens.
* **The network intercepts again** (it did on 2026-10-08): the images are already built; only a rebuild
  needs the network. If task 3 cannot download, walk on the images built on 2026-10-09 if the merge
  changed no file they hold, and say so.
* **The first real answers may find what the tests did not.** That is the walk's purpose; a defect goes
  to a worker before the PR, not after.

## Session prompt

Paste into a new Claude Code window started in `C:/Users/stack/projects/bb2dash`:

> `/bb2dash-pm` Start Phase 24ab: finish Phase 24a and make 24b ready. Work in the worktrees `C:/Users/stack/projects/bb2dash-wt-24` (bb2dash, branch `feat/workspace-24`) and `C:/Users/stack/projects/bb2dash-stack-wt-24` (bb2dash-stack, the branch of the same name), by full paths: a relative path from where you start lands in the shared checkout, which stays on `main`. Read, in that bb2dash worktree, `docs/planning/sprint-2/briefs/118_PHASE24AB_walk_and_handover.md` in full: it is the plan, it is approved, do not enter plan mode. Then the last four headings of `docs/planning/sprint-2/verification/109c_PHASE24_VERIFICATION.md` (what was done), the "Freeze amendments" of brief `109_PHASE24_workspace_assistant.md`, memory `phase24-state`, and `C:/Users/stack/projects/PARALLEL-SESSIONS-bb2dash-2026-10-08.md` where it names Session 1 (Phase 22, still building) and the shared Docker, plan, checkouts and SQL login. Of ORCHESTRATOR read sections 0 to 5; of STATUS the first sentences of its header and the sections "Phase 24a" and "Known issues". If the skill's untagged-session check is due, say so and leave it. Give me the triage line and a short report, then follow brief 118's task order: read state, merge `origin/main` into both branches and re-do the list after it, rebuild the three test images under their test tags, then the walk. **You have my word for the walk window** (task 4) once you have checked, at that moment, that no sync, Inbox apply, acceptance run or Phase 22 walk box is open; if one is, wait for it. Spend what the walk needs on my plan. Development workers, if the walk finds anything to fix, are Opus (Phase 24 only; every other phase keeps Sonnet). Phase 24b's data layer runs beside you in its own session on `feat/workspace-page-24b`, cut from `origin/feat/workspace-24`: push after each piece, and touch none of its files (new files under `web/src/lib/`, `use-workspace-stream.ts`, `workspace-labels.ts`). 24ab is done when the PRs holding 24a and 24ab are merged to `main`. The merge (task 7) and the cut-over with `just accept 24` (tasks 8 and 9) each wait for their own word from me. While you wait for them, do tasks 10 and 12: brief 111 (Phase 24b) already holds my four answers; add to its amendments what the walk shows. After a green `just accept 24` you may remove the old transcript volume `workspace-claude-home` by name. Stop at "ready when you say so" for the PRs.
