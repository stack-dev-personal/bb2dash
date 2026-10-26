# bb2dash — Orchestrator context

> The document a PM session loads at the start of every sitting. Call it with `/bb2dash-pm`.
> Updated with each phase PR, like STATUS and DECISIONS. Last update: **2026-10-26** (**Phase 26 follow-up, migration 223, PR open; Phase 25b and 26 are on `main`, accepted and cut over; STATUS is the newer fact for §1 rows 25 and 26**). Before that, **2026-10-20** (**Phase 25b built and reviewed on `feat/phase25b-assistant`, PR open: D (two runners, 202) and E (proposals Stack approves, 203 to 206), pack 25; not merged, not cut over; §1 row 25, §4**). Before that, **2026-10-19, night** (**Phase 25a merged (#121) and cut over: 200, 207, 201 live, egress in front of three clients; §1 row 25**). Before that, **2026-10-19** (**Phase 25a built and reviewed, PR open, not merged: brief 119 frozen on Stack's answers; §1 row 25**). Before that, **2026-10-18** (**the desktop half of Phase 24b's walk closed on Stack's word, "assume the walk passed": Q-3 and Q-2's shell half recorded as passed, not seen by the PM; §1 row 24b, §4**). Before that, **2026-10-16** (**Phase 24b ACCEPTED by acceptance run `20261016T041410Z`, green from `main` at `7590d54`, the seventh counting run; the page MERGED 2026-10-15 as #109 and cut over the same day, the search budget raised (#115) with `workspace` rebuilt, the pack corrected five times on its own words; §1 row 24b, §4, §6 F**). Before that, **2026-10-15, evening** (**Phase 24b part 2, the page: built by W-87 and W-88 on Opus in three rounds, both reviews run and their findings fixed, walked by the PM on the branch preview in Chromium (the desktop half is Stack's sign-in), Phase 22's walk box repaired and green, pack 24 extended, memory `on` in `compose.yaml` for the cut-over; PR #109 open on Stack's merge word, then the cut-over (`workspace` rebuilt alone) and `just accept 24`; §1 row 24b, §4, §6 F**). Before that, **2026-10-15, later** (**Phase 24b part 1: the data layer MERGED 2026-10-15 as PR #108 (`022812c`, 16:50Z) on Stack's words "merge to main" and "merge 108", the one exception to one PR per phase (DECISIONS 2026-10-15); the phase branch merged `origin/main` (7e71eb7) and its gates are green; Phase 24a's worktrees and `feat/workspace-24` removed on his word "remove 24."; §1 rows 24ab and 24b, §4, §6 F**). Before that, **2026-10-15** (**Phase 24a merged 2026-10-14 on Stack's word (bb2dash #97 `2b7c388`, bb2dash-stack #8 `22f35a3`), cut over 2026-10-15 on his word, one service at a time, and ACCEPTED 2026-10-15 by acceptance run `20261015T141817Z`, green from `main`; the old transcript volume removed; Phase 24ab done; §1 rows 24a, 24ab and 24b, §4, §6 F**). Before that, **2026-10-14, later** (**Phase 24ab: 24a walked by the PM on the real site, every step of pack 24 and every host proof passed, P-7 passed, D-1 fixed (the runner's floor 0.81); the two PRs open on Stack's merge word; the cut-over and `just accept 24` wait for his word; §1 rows 24a and 24ab, §4, §6 F**). Before that, **2026-10-14, Phase 23 closed out** (an apply of Stack's own answers worked; its worktrees, branches and test image removed); before it, **2026-10-13, Phase 23 and its follow-ups are accepted** by acceptance run `20261013T003231Z` (green, from `main`); before it, **2026-10-09, 18:30Z, a pause on Stack's word** (**Phase 23's follow-ups are merged and cut over and NOT ACCEPTED: the acceptance pack had three defects and the product one, fixed in PR #91 and not on `main`; development is paused; section 4 has what is Stack's and STATUS has what is still owed**; earlier that day: **2026-10-09** (**Phase 24a, the Workspace assistant behind the page, is built and reviewed on `feat/workspace-24`**: migrations 190 to 199 on prod, two edge functions deployed, both reviews run and their findings fixed; the walk, the merge and the cut-over are not done; §1 rows 24a and 24b, §2 rule 6, §4, §6 F). Before that, **2026-10-09** (**Phase 23's follow-ups are built and reviewed and migration 187 is on prod**: brief `briefs/110_PHASE23_followups.md`, record `verification/110a_PHASE23_FOLLOWUPS_VERIFICATION.md`; two PRs on Stack's merge word of 2026-10-09; the cut-over and `just accept 23` wait for his word; §1 row 23, §3 "Learned in the Phase 23 follow-ups", §4). Before that, **2026-10-08** (**Phase 21 is accepted**: the acceptance run, `just accept 21`, merged on Stack's word as bb2dash #82 and bb2dash-stack #5 and came back green from `main` against production, run `20261008T041753Z`; the Workspace now runs from bb2dash-stack; step 1, Usage credits and `/usage`, stays Stack's; §1 row 21, §2 rule 5, §3 step 9, §4, §6). Before that, **2026-10-07** (Phase 21, the Workspace, was built on `feat/workspace-21` in bb2dash and bb2dash-stack, walked by the PM and merged on Stack's word on 2026-10-07, bb2dash #78 then bb2dash-stack #3, before his acceptance walk: migrations 140–143 live and byte-identical, the image built, proven and running as test project `bb2dash-wt21`, every review run with no HIGH or MEDIUM finding left open (runner fix round Z merged, ruling Z1 in 102a; bb2dash-stack's S-1 fixed), the PM's walk done in two sittings on 2026-10-07 with two layout defects found on the real screen and fixed; next Stack's 15-step acceptance after Phase 14's own, with six things put to him; §1 row 21, §2 rules 5 and 6, §3 "Learned in Phase 21", §4, §6 D2). Before that, **2026-10-04** (Phase 14 merged 2026-10-04 on Stack's word, all four PRs, before acceptance; the sync container is live with his login; A1–A9 is his, in one sitting; §1 row 14, §4). Before that, **2026-10-03, evening** (sprint 2 audit `docs/planning/sprint-2/108_SPRINT2_AUDIT_2026-10-03.md`: §1 and §4 corrected to what `main` and prod show; Phase 14 is in flight in its own session with the container runner live against prod; Phase 18's owed list re-read against the syncs since 10-01; Stack's queue consolidated in 108 §5). Before that, **2026-10-03** (Phase 19 **merged 2026-10-03** on Stack's word as PR #60, 206ee3a, production deployed; worktrees and branches removed: migrations 130–139 and 170–172 live and md5-identical (138–139 round 2; 170–171 round 3 and 172 round 4 in the overflow block 170–179, DECISIONS); the PM drove it to the end with a self-paced loop over the task ledger `verification/99_PHASE19_LEDGER.md`, on Stack's 2026-10-03 word; task 27, the first register-first sync, is his next Sync). Before that, **2026-09-30** (Phase 20: PR-A #39 and harness PR-B #36 (+ #37) merged, PR-C open; V-2 walked in `101a_V2_VERIFICATION.md`, closed closed on Stack's word 2026-09-30; Session A's status in §6). Before that, **2026-09-30** (Phase 18 merged on Stack's word "merge this phase" **before its gate sync**: migrations 120–129 live, 160 opening Phase 18's overflow block 160–169 for the review fix; tasks 16–19, 26, 28 and task 14's 48 h re-read owed to the first `/bb-sync` on `main`, which is now the gate; Phase 17 merged as PR #43). Before that, **2026-09-30** (Phase 17 built on `feat/web-polish-17`, PR open, not merged: migrations 110–119 and 150 live and md5-identical, 150 opening Phase 17's overflow block 150–159; round-3 walk 24/24 on the preview; waiting on Stack's T-24 and T-26 sittings and his look at round 3). Before that, **2026-09-29** (PRs #30 Phase 15, #31 logon build + the `estac` → `stack` path pass, and #32 sync file pull merged on Stack's word; R1 done and its gate-out green on `main`, so R3 and R4 are open; every live path reads `C:/Users/stack/...`; Task 0 started 15:25Z). Before that, **2026-09-27** (PR #28 merged as 67269b5; the briefs verified in three
> rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; §6's prompts rewritten to them). Before that, **2026-09-24** (**sprint 2 planned**:
> requirements `91_REQUIREMENTS_v3.md`, research `92_*` + `93_SPRINT2_RESEARCH_SYNTHESIS.md`, phases
> `94_SPRINT2_PHASES.md`, briefs `95_`–`103_`; planning PR open on `docs/sprint2-planning`; every
> product call provisional until Stack answers the batch in `93_` §5 and approves `94_`. Before that,
> 2026-09-22: sprint 1 closed, PR #25; planning docs by sprint under `docs/planning/`, index
> `docs/planning/README.md`.)
> If STATUS and this file disagree, STATUS is the newer fact; fix this file in the same PR.

## 0. Roles and the working arrangement

* **Stack** is the product manager. He makes product calls, merges PRs, and reviews anything
  visual. He does not want to be asked mid-phase for routine decisions.
* **The PM session** (this Claude Code session, Fable) is the project manager: it reads state,
  defines the phase, writes the brief and frozen contract, spawns Opus execution subagents, and
  integrates. It never merges to `main`.
* **Opus workers** build. One per work stream, each on its own branch in its own git worktree
  (`C:/Users/stack/projects/bb2dash-wt-<name>`), cut from the phase branch. They commit and
  push to their branch; the PM merges into the phase branch.
* Other Claude sessions may be active on the repo and on prod at the same time. Fetch before
  acting, never force-push, and treat any worktree or branch you did not create as someone
  else's until proven otherwise.
* **The shared checkout `C:/Users/stack/projects/bb2dash` stays on `main` and is never branched
  or committed in.** A PM session creates its phase branch as its own worktree
  (`git worktree add C:/Users/stack/projects/bb2dash-wt-<phase> -b feat/<phase> origin/main`)
  and edits the brief there. On 2026-09-15 two PM sessions edited two briefs in that one
  working tree inside 25 seconds; nothing was lost only because one of them checked
  `git status` first.

## 1. Where the product is (one screen)

Sprint 1 closed 2026-09-22 (PRs #7–#25; migrations 026–090 live; 059 and 070–072 unused). The hub is live
on Vercel with the Blackboard → Supabase pipeline, the Classroom-style course page, the sync loop and
Inbox, the gradebook mirror and one "graded so far" figure, the planner with Google Calendar push and
recurring events, the Electron shell, and the `/inbox-apply` worker. Prod is Supabase `goultdzqcavefcgnifdy`.
The materials MCP server (`mcp-server/`) is registered on `stack-laptop` at user scope from `~/.claude.json` as
`C:/Users/stack/projects/bb2dash/mcp-server/dist/index.js` with the service key inline in that entry, read from the
gitignored `.env` at registration (2026-09-29: `dist` built, 88 unit tests, `npm run smoke` all checks passed,
`claude mcp list` → Connected; Phase 14 moves the key to a file). The harness
(`~/agentic-harness`) holds V-2 (built 2026-09-16) and the vault as git realms at `C:/Users/stack/vault`
(2026-09-23/24). Sprint 1's phase table is STATUS's "Sprint 1 record"; the record behind every phase is
`docs/planning/sprint-1-hub/`.

**Sprint 2** (planned 2026-09-24; `docs/planning/sprint-2/94_SPRINT2_PHASES.md` is the plan; requirements
`91_REQUIREMENTS_v3.md`; research `93_SPRINT2_RESEARCH_SYNTHESIS.md`, whose §5 is the question batch):

| Phase | Name | Brief | Requirements | Migrations | State |
|---|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `briefs/95_PHASE15_db_hygiene.md` | R-78..R-80, R-54 | 100–102 live | **merged 2026-09-29** ([PR #30](https://github.com/emstacho-su/bb2dash/pull/30), 6ef3933); runner green 21/21 on `main`, advisor's search_path list empty; R3 and R4 open |
| 16 | Grades: V-1 sittings and the reconciliation migration | `briefs/96_PHASE16_grades_v1.md` | R-29..R-36 | 105–109 | **merged 2026-09-30** (PR #44, 4c310ff): sittings done 2026-09-29; 105 and 106 on prod |
| 17 | Web polish: quick fixes, carried bugs, Inbox/planner leftovers, live proofs | `briefs/97_PHASE17_web_polish.md` | R-37, R-39 (interim), R-40, R-42..R-45, R-47..R-52, R-55..R-59, R-108; S2-home-1/2, S2-materials-1, S2-bugs-1 | 110–119, 150 (overflow block 150–159) | **merged** (PR #43, d9d5ee9); T-24 dropped and T-26 done on 2026-09-30 (108 §4); R-52's live clause waits on the next token expiry |
| 18 | Ingest and corpus | `briefs/98_PHASE18_ingest_corpus.md` | R-60..R-63, R-66..R-70, R-72..R-75, R-77; S2-rag-1 | 120–129 live, 160 (overflow block 160–169) | **merged 2026-09-30 before its gate sync**; re-read 2026-10-03: the syncs since 10-01 settled tasks 14, 17 and 18; `98a` §2/§5 and task 28's screenshots still owed; task 19's code half landed 2026-10-04 (the crawler PR) and task 26 (R-73) closed 2026-10-04 on Stack's word (108 §3) |
| 19 | Content identity, per-crawl history, sync honesty | `briefs/99_PHASE19_content_history.md` | R-38, R-41, R-64, R-65, R-71, R-76 | 130–139, 170–172 live (overflow block 170–179) | **merged 2026-10-03** (PR #60, 206ee3a); with 15 and 18 also on `main`, Phase 14's W-55 and W-56 now wait only on the spike PASS |
| 14 | Containers (R-28) | `briefs/100_PHASE14_containers.md` (supersedes `82_`'s Contract) | R-81..R-96; S2-containers-1 | 091, 093, 094 live; 092 struck | **merged 2026-10-04** on Stack's word before acceptance (#62, #67, harness #39, bb2dash-stack #1); the `sync` container runs live since 2026-10-03 22:52Z; Stack's acceptance sitting A1–A9 is owed (§4) |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction | `briefs/101_PHASE20_harness_closure.md` | R-97..R-104, R-106 | none here | **PR-A (#39, 2904b20) and PR-B (harness #36, ea0e199; + harness #37, 00539be) and PR-C (#48, cb1d7e7) merged 2026-09-30**; live steps done; V-2 walked in `verification/101a_V2_VERIFICATION.md`, closed on Stack's word 2026-09-30; tasks 2 (request 458, 2026-10-01) and 29 done; two harness follow-ups still unfiled (108 §2) |
| 21 | Workspace: chat routed by complexity, on the subscription | `briefs/102_PHASE21_workspace.md` (frozen 2026-10-05) | S2-workspace-1; P-83..P-88 | 140–143 live (144–149 its slack) | **merged 2026-10-07 on Stack's word (bb2dash #78, then bb2dash-stack #3), walked by the PM, accepted 2026-10-08 by the acceptance run `20261008T041753Z`** (green from `main`; step 1 answered by Stack the same day): the Workspace runs from bb2dash-stack as `bb2dash-workspace-1` since that run's go-live; the old test project `bb2dash-wt21` is removed (§4, §6 D2; record `verification/102a_PHASE21_VERIFICATION.md`, last section) |
| 22 | Styling: direction D (Charcoal) on every screen, dark and light, the theme control, the Menu at 720 px, the frame with scrolling panes, the desktop shell with the app's bar as its title bar, the app icon, the token audit's ratchet | `briefs/103_PHASE22_styling.md` (frozen 2026-10-08, three amendments the same day) | R-53, R-46; P-76, P-79; S2-styling-1 | none | **built, reviewed and walked by the PM on 2026-10-14: in the walk box (runs `20261014T182418Z` 54 passed, `20261014T183839Z` 64 passed, 62 shots judged by two checkers) and on the packed desktop build; merged 2026-10-14 as PR #93 `dff1e05` on Stack's word of 2026-10-12 ("go. merge as well."), repeated 2026-10-14**; record `walks/walk-22/WALK.md` (77 ticked lines, taste calls T-1 to T-18) and `verification/103_PHASE22_REVIEW.md`; **closed 2026-10-14 on his word** ("call everything good"): both specs once against production (run 20261014T191444Z: 118 passed, 0 failed, 8.1 minutes: the 54 phone-width cases with their 24 pane measures and the 64 theme cases, against production at dff1e05), the worktrees and the five worker branches removed, T-1 to T-18 ruled good |
| 23 | Inbox auto-apply: a sync files the request, the `apply` container runs `/inbox-apply` | none for the phase (Stack's ask and three choices, 2026-10-07; STATUS "Phase 23", DECISIONS six rows); the follow-ups: `briefs/110_PHASE23_followups.md` (frozen 2026-10-08) | amends B-44; builds R-96's release | 180–186 live (183 at the cut-over, 185 and 186 the session-answer fix, 187 the follow-ups' apply side on 2026-10-09; 188 is written and reviewed and goes on at the follow-ups' cut-over; 189 is free; block 180–189) | **merged 2026-10-07 on Stack's word (PR #79 `d454f6f`; bb2dash-stack #4 `ec0e304`) and cut over: `sync` rebuilt, `apply` running**; first live run archived 13 of 16 answers; the session-answer fix merged 2026-10-07 (PR #81 `b8d3b13`) and has run live since; **the follow-ups are built, reviewed and in two PRs on Stack's merge word of 2026-10-09** (a skipped answer is held, the transform reads archived answers and stamps session links, the exporter is scheduled for notes only, `just up` knows `apply`, pack 23 is written; 187 on prod); the cut-over done 2026-10-09 (188 on prod; 180–188 frozen, 189 free); **ACCEPTED 2026-10-13 by acceptance run `20261013T003231Z`, green from `main`** (STATUS "Phase 23 follow-ups") |
| 24a | Workspace assistant, behind the page: sessions from the database, a planning turn and an answering turn, one pgvector store in bb2dash, uploads, the planner and grades feed, memory | `briefs/109_PHASE24_workspace_assistant.md` (frozen 2026-10-08; answers in `109a`) | Stack's ask of 2026-10-08, S2-workspace-2 | 190–199 live, the block used up | **built and reviewed 2026-10-09 on `feat/workspace-24` (bb2dash and bb2dash-stack)**: the ten migrations on prod and byte-identical, `workspace-search` and `workspace-embed` deployed, the store's proof green on prod, both reviews run and fixed; **walked by the PM on 2026-10-14 (Phase 24ab): every step of pack 24 and every host proof passed on the real site, P-7 passed, D-1 fixed (the runner's floor 0.81, W-96)**; **merged 2026-10-14 on Stack's word (bb2dash #97 `2b7c388`, bb2dash-stack #8 `22f35a3`); cut over 2026-10-15 on his word (`workspace`, the ingest image, `workspace-extract`, `workspace-ingest`, `apply`, `sync`, each alone); ACCEPTED 2026-10-15 by acceptance run `20261015T141817Z`, green from `main`** (STATUS "Phase 24a"; record `verification/109c_PHASE24_VERIFICATION.md`). Open: nothing of its own; memory and the page's controls are 24b's |
| 24ab | Finish 24a and make 24b ready: the walk, the two PRs, the cut-over, `just accept 24`, brief 111 brought up to date | `briefs/118_PHASE24AB_walk_and_handover.md` (Stack named it 2026-10-14) | none new | none | **done 2026-10-15**: `main` merged into both branches five times, the list after it re-done, the test images rebuilt, the walk done with its one defect fixed and walked again, brief 111 brought up to date with the walk and the page's final start prompt, the two PRs merged 2026-10-14 (task 7), the cut-over and `just accept 24` green on 2026-10-15 (tasks 8 and 9), the old volume and the worker worktrees removed (task 11); the phase worktrees `bb2dash-wt-24` and `bb2dash-stack-wt-24` and the branch `feat/workspace-24` removed 2026-10-15 on his word "remove 24.", after 24b's branch had merged `origin/main` (7e71eb7); nothing of 24a or 24ab remains anywhere but `main` |
| 24b | Workspace assistant, the page | `briefs/111_PHASE24B_workspace_page.md` | the same ask; his answers 3, 9, 11, 12, 13; his word "merge to main" (2026-10-15) | none | **part 1, the data layer, MERGED 2026-10-15 as PR #108 (`022812c`) on Stack's word**, the one exception to one PR per phase (DECISIONS 2026-10-15): nine new `web/src/lib/` modules, the page's wording, the stream hook's `sources` and `markStopped`, 14 test files, built by W-86 (Opus) on `feat/workspace-page-24b` (cut 2026-10-14 from `origin/feat/workspace-24`), both reviews run and fixed, gates green at 7e71eb7 after the branch merged `origin/main`; nothing visible on the live page (STATUS "Phase 24b, part 1"; records `111a`, `111_W86`). **Part 2, the page**: its gate is open since 2026-10-15 (Phase 22, 24a and 24ab on `main`, `just accept 24` green, `origin/main` merged), so the page's streams started from brief 111's final prompt on the same branch. **Part 2 built, reviewed and walked 2026-10-15**: W-87 (composer, menus, chips, picker, uploads, lobby) and W-88 (thread, `AnswerBody`, side panel, both layout checks) on Opus; round 2 from the reviews (`/code-review main high` thirteen findings, two HIGH; `/security-review` S-1) and round 3 from the walk (W-5, W-6), round 4 from Stack's look at the preview (the screen fills the pane's height, the column centred, the side bars edged; the PM in place, b8b6866); the PM's walk on the preview in Chromium, both themes, 390, 1280 and 1440 px, the live pack steps 17 to 21 passed with the live runner, Q-1 and Q-2 PASS in the browser; pack 24 extended (steps 17 to 24, five proofs; pack 21 kept, not run); Phase 22's walk box repaired (a part 1 regression) and green; `compose.yaml` memory `on` (task 13). **MERGED 2026-10-15 21:46Z as PR #109 (`aa4f702`) on his "merge 109, push to main"; CUT OVER 21:52Z on his "cut over" (`workspace` alone, the memory jobs on); the first counting `just accept 24` (run `20261015T222036Z`) red at stage `page` on the pack's own step 18 fact (the Open buttons counted before the rows rendered), fixed as #112; the second run (`20261015T223433Z`) red at `walk` on 24a's steps read against the new page, the product right, the pack's walk stage corrected as #113; the third run red at `page` on step 18's count once more (#114 waits for a course file's Open); the fourth (`20261015T233524Z`) red at `find` on the runner's 8 s search budget against a cold search function (10.4 s), raised to 20 s a call and 30 s a batch as #115 (`workspace` rebuilt 2026-10-16); the fifth (`20261016T033116Z`) red at `page` on the operator's doubt of step 18's count (the planner row's Open is a link; #116 counts it); the sixth (`20261016T034110Z`) reached step 20, red on the playbook's words for its picture (#117); **ACCEPTED 2026-10-16 by the seventh, run `20261016T041410Z`, green from `main` at `7590d54`: every stage, every host proof, the remembered item seen and deleted** (STATUS "Phase 24b, part 2"; records `111a`, `111_W87`, `111_W88`). The desktop half of the walk closed 2026-10-18 on his word ("assume the walk passed"; 111a). Open: the feed-weekday follow-up (his word), W-86's worktree (his "remove") |
| 25 | After 24b: egress by name, the sync's text insert behind a function, the index watch, a second runner, planner changes the assistant proposes and Stack approves | `briefs/119_PHASE25_after_24b.md` (frozen 2026-10-19); record `verification/119a_PHASE25_VERIFICATION.md` | brief 118's "after 24b" row; his answers on the decision page and in the terminal (2026-10-19) | 200, 201, 207 live (25a); 202 to 206 written and dry-run (25b; 208, 209 slack) | **25a MERGED 2026-10-19 (#121 `9d6d5dec`, bb2dash-stack #9) and CUT OVER the same night, the first logged-in turn's log watch passed**; **25b built and reviewed 2026-10-20 on `feat/phase25b-assistant` (contract `119b`): P-4 passed, W-103 (D), W-104a and W-104b (E), W-105 (pack 25) on Opus; both reviews run, round 3 fixed and looked at twice; PR open, waits for Stack's look at the walk-25b shots, his merge word, the cut-over and `just accept 25`** |

Outside the phases: R-109 and the state-doc refresh landed on the planning branch (Stage D); R-105 and
R-107 are harness-owned; R-96 is Phase 14's deferred list; R-87 (a scheduled sync) stays declined until
Stack adopts the reversal.

## 2. Execution order and what each phase hands to the next

```
 15 (db hygiene, runner) ──┬──► 16 (grades / V-1: Stack's sittings, own calendar)
                           ├──► 17 (web polish) ──────────────► 19 (content identity + history) ──┐
                           ├──► 18 (ingest + corpus) ─────────► 19                                │
                           └──► 14 (containers; spike gate first) ──► 21 (workspace) ──► 22 (styling, last)
 20 (harness closure) runs beside everything, in the harness repo plus two bb2dash PRs; R-97 lands first.
```

Rules that fall out of the graph:

1. **15 first and short.** Its runner, test role and `search_path` pin are what every later SQL check
   runs through; its trigger (R-54) is one migration.
2. **16, 17, 18 run in parallel** on disjoint files, except the named hunks 17 and 18 share (`CourseScreen.tsx`;
   §6 Session B notes where briefs 97 and 98 differ): 16 is Stack's sittings plus `db/`, `scripts/`,
   `skills/inbox-apply/SKILL.md` and the grades files in `web/` (R-36's rule line; `manual.ts` only if Stack
   asks for a rule, brief 96 open item 1); 17 is `web/` screens, the 027/063-shaped view migrations and the
   Inbox; 18 is `ingest/`, `skills/bb-sync`, `stage_files`, the search RPCs and `db/tests`. Frozen seams:
   17 owns the `v_course_stream` / `v_content_tree` migrations; 18 owns `stage_files` and the search
   functions; neither touches `stage_content` (19's, DECISIONS 2026-09-17).
3. **19 after 17 and 18** because it re-creates `stage_content`, adds the history table the Stream reads
   and redefines the transform driver (R-65); its register-first semantics are frozen before 14's
   `sync_register_run` is written.
4. **14 is the long pole** and can start with 15: task 1's freeze and Task 0's probes (B-47: start now)
   come first, the spike (R-82, task 4) gates its sync half, and W-57 (harness jobs) and W-58 (umbrella,
   dev container) may be cut after task 1. W-55 (sync runner and database) and W-56 (images, MCP, desktop,
   repo hygiene) are cut only after the spike's PASS, with 15, 18 and 19 on `main` (brief 100). It
   inherits 18's scripted fetch and embed step (P-36) and 19's register-first driver.
5. **21 after 14**, **22 last** (Stack's "cleaning" placement; the Workspace page is in 22's inventory). Phase 21
   started on 2026-10-05, the day after Phase 14 merged, and was built, walked by the PM and merged on Stack's word on 2026-10-07; it was
   accepted on 2026-10-08 by the acceptance run (`just accept 21`, green), which did not wait for Phase 14's
   A5, A7 and A9 (still open there). Phase 22 waited for Phase 21's merge (done 2026-10-07).
6. **Migration ranges with slack**: 190–199 (24a; all ten on prod and frozen, nothing left in the block), 091–099 (14), 100–104 (15), 105–109 (16), 110–119 (17), 120–129 (18),
   130–139 (19), 140–149 (21; 140–143 are on prod and frozen, 144–149 are its slack), 170–179 (19's overflow, taken 2026-10-03 for 170–172; DECISIONS), 150–159 (17's overflow, taken 2026-09-29 for migration 150; DECISIONS), 160–169 (18's
   overflow, taken 2026-09-30 for migration 160; DECISIONS). A phase that runs out takes the next free block of ten and records it in
   DECISIONS, never a number inside another phase's block. Every migration is additive, applied under the
   file's name, byte-identical.
7. **What each phase hands on** is the seam table in `94_SPRINT2_PHASES.md` §3.
8. ~~**Phase 19 (B3) is unblocked since 2026-09-30**~~ Built 2026-10-02/03 (PR open; STATUS row 21). Kept for the record: (17 and 18 on `main`), but the PM recommends it wait for Stack's
   first `/bb-sync` on `main`: Phase 18 merged before its gate sync, so its crawler v5, in-sync pull and author
   resolution are unproven live, and 19 re-creates `stage_content` on top of that crawl. That sync is Phase 18's gate
   (DECISIONS 2026-09-30, "Phase 18 · merge"): refresh the installed skill from `main` first, run from the main
   checkout, then the PM holds the probe sitting and records `98a`, tasks 17–19 and 26, and walk-18's 05/08.

~~Term calendar: week 1 = Aug 24. Weeks 9 (Oct 19–25) and 11 (Nov 2–8) are exam-heavy; week 14
is Thanksgiving;~~ nothing is paced by week (2026-09-27: no date-paced tasks, DECISIONS). Two term-calendar bounds stand:
Nov 30 – Dec 13 is a code freeze (no merge and no prod apply inside it; it stands, DECISIONS 2026-09-27), and
Phase 16's migration 106 is on prod before the IST.323 column is graded (2026-12-03), which the freeze makes
before Nov 30. `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md`'s header lists every outside bound.

## 3. The per-phase cycle (what a PM session actually does)

1. **Read state.** STATUS, DECISIONS, the open PRs (`gh pr list`), `git worktree list`,
   `git fetch` — and compare `origin/main` with the local checkout. Assume another session may
   have moved things.
2. **Define the phase.** Pick from §1 in order unless Stack says otherwise. Write
   `docs/planning/sprint-<N>-<sprint>/briefs/NN_PHASE<n>_<name>.md`: why, a **frozen contract** (routes, views, RPC
   signatures, return columns, request fields, file names), the worker list with branch and
   worktree names, seams with any parallel phase, out-of-scope, integration steps, and the
   reserved migration range. Cite R-numbers from the sprint's requirements file (sprint 2:
   `docs/planning/sprint-2/91_REQUIREMENTS_v3.md`).
3. **Branch and worktrees.** `feat/<phase>` off `origin/main` **as its own worktree**
   (`bb2dash-wt-<phase>`), pushed; the brief is committed there, never in the shared checkout.
   One `feat/<phase>-<stream>` branch + worktree per worker, cut from the phase branch after
   the brief is committed. Park any brief draft in the session scratchpad until the worktree
   exists.
4. **Spawn Opus workers** (`Agent`, `model: "opus"`, one per stream) with the brief path, the
   rules below, and a report format capped at ~300 words. Workers (or the PM, where the brief's
   §Workers says so: Phases 16 and 17) apply additive migrations to prod via `apply_migration`
   under the file's name, dry-run first in `begin; … rollback;`,
   keep the repo file byte-identical, and never touch earlier migrations. Workers never touch
   `project-state/`.
5. **Integrate.** Merge worker branches into the phase branch; regenerate
   `web/src/lib/supabase/database.types.ts` when an RPC signature changed; `npm ci` if deps
   changed; run typecheck + build + tests in `web/` and `mcp-server/`; live smoke against prod
   (curl to the edge function, the `bb2dash` MCP tools).
6. **Gates.** `/code-review main high` and `/security-review`. Confirmed findings go back to
   the same workers as a numbered "round 2" section appended to the brief; re-integrate.
7. **Docs + PR.** Update STATUS, DECISIONS and this file in the same PR; open it with `gh pr
   create`; anything visual gets a Vercel preview for Stack. **Stop at "ready when you say so."**
8. **After the merge** (only on Stack's word): switch the checkout to `main`, remove the phase's
   worktrees and branches, update memory.
9. **Acceptance run** (after the merge, for a phase with a pack under `acceptance/<NN>/`): from
   bb2dash-stack's `main`, `just accept <NN>`. A throwaway container with a Claude session walks the
   phase's acceptance script on the live site, and the laptop reads the hard facts itself, read-only
   (`acceptance/README.md`). **Green counts as acceptance** (Stack's answer, 2026-10-07): write the
   "accepted" record and the `**Phase <n> accepted` DECISIONS row, merge that docs-only PR and clean
   up, without asking again; every other merge still waits for his word. In practice (learned 2026-10-08): the
   session's safety check refuses that merge and the removal of an old container on the standing answer alone,
   so open the record PR, then ask him for those two words in the session. **Red:** nothing is
   accepted; bring the run's `REPORT.md` (`C:/Users/stack/.bb2dash-accept/<NN>/<run>/`) to Stack.
   **Blocked** (the Claude plan's limit, or a sync ran while the planner was being compared): repeat
   the run. A step the manifest marks `human` stays Stack's, and the record names it. The pack is
   written with the phase, in the phase's own PR: three files and one browser-test file.

**Two PM sessions at once (learned 2026-09-15):** when another phase's PM session owns the main
checkout (`C:/Users/stack/projects/bb2dash`), cut the phase branch as its own worktree
(`bb2dash-wt-<phase>`) straight from `origin/main` and never commit in the shared checkout. Each
session regenerates `database.types.ts` for its own PR; the second to merge regenerates again.
Vercel is GitHub-linked, so every pushed branch already has a preview at
`web-git-<branch>-emstacho-sus-projects.vercel.app` (behind Vercel SSO: Stack opens it signed in).

**Learned in Phase 10b (2026-09-16):** a worker stream can stall (watchdog, 600 s) with hours of
uncommitted work — tell workers to commit and push per task, and on a stall make a PM checkpoint
commit on the worker's branch, then resume the same agent with `SendMessage` (its context
survives). When another phase's migrations are live but unmerged, a regenerated
`database.types.ts` carries their objects; scope the file to your own phase's objects (main's file
plus your hunks) and let the second PR to merge regenerate. Freeze shared engine types as a
PM-owned file before cutting worker branches, and give screens an engine export for any rule
they need rather than letting the web layer copy it — the copy drifted within one round.

Environment facts that bite: this machine is Stack's Windows laptop, not a sandbox — curl to
`*.supabase.co` works here (cloud sessions must use `pg_net`). Native binaries need `C:/…`
paths, not `/c/…`. Repo files are CRLF on checkout; edit with tools that preserve endings.
The `bb2dash` MCP server runs with the service key from `~/.claude.json`; never copy it into
the repo.

Learned in Phase 11b (2026-09-16):
* `generate_typescript_types` returns ~140 KB, more than a tool result can carry; the harness saves
  it as a one-line JSON file (`{"types": "…"}`). Write it out with
  `node -e` + `JSON.parse(...).types` rather than transcribing it by hand.
* A contract that renames a column a live edge function reads needs a **cut-over**: switch the
  consumer off (`gcal_enabled = false`), apply, deploy, prove one run makes zero writes to existing
  rows, switch on. Run a pre-flight first that feeds prod rows to the new code and compares hashes.
* The push has no staging calendar: web workers mock `planner_events`; a live proof inserts
  labelled test rows by SQL and deletes them in the same sitting.
* Git Bash `sed -i` strips CRLF from working-tree files. Git normalises on commit, so the diff stays
  clean, but prefer the Edit tool for docs.
* `node --test <folder>` treats the folder as one failing test; pass the `*_test.ts` files.

Learned in Phase 12b (2026-09-17):
* A list-driven phase works: ids → triage → one researcher per page → ONE batch of questions with a default each → brief → workers. Stack answered 18 questions in one message.
* Freeze a shared vocabulary file (`progress-status.ts`) on the phase branch before cutting worker branches; four workers then never touched the same constant.
* A probe that returns 200 with empty results is not proof of no data: v3's attempts endpoint was the wrong one for a student. Discover endpoints from the UI's own network log, keep key names only, delete captured bodies in the same sitting.
* When Stack wants a subsystem deleted on principle, build the comparison first: the numbers kept the engine's arithmetic and removed only the layer around it.
* Laptop sleep does not kill workers, but the watchdog can (600 s): tell workers to keep tool calls short and push per step; checkpoint-commit and `SendMessage` to resume.
* Playwright may only write screenshots under the shared checkout's `.playwright-mcp/`; copy them into the phase worktree, never leave files in the shared checkout root.
* Run the code-review gate before the last workers land, not after: its findings become a round for workers that are still warm.

Learned in Phase 12 (2026-09-17):
* A worker agent dies with its PM session. On resume: check mtimes and `ListAgents` to be sure nothing is live, make a PM checkpoint commit of the orphaned work on the worker's branch, then spawn a finisher with the commit list.
* One worker that finishes a stream can be resumed with `SendMessage` as the integrator and again for round 2; its context made the merge map and the fixes cheap.
* A JS `String.replace` with a replacement containing `$` followed by a backtick pastes the text before the match: it duplicated half the brief. Use a function replacement when writing docs from a script.
* A search-and-replace patch whose search text is LF silently matches nothing in a CRLF file; verify every scripted patch applied. That is how a test run put a real error dialog on Stack's screen.
* e2e for a desktop app must never open a modal: under the test env var, fatal paths log, record and exit non-zero.
* The packed-exe smoke caught a defect no test did (the launch tick reloading a window still on its first load). Keep the smoke in the round-2 checklist.


Learned at the sprint 1 close (2026-09-22) and in sprint 2 planning (2026-09-24):
* **Walk direct loads, not only click-throughs.** The assignment page returned 404 on a direct URL while
  every in-app click worked (S2-carry-10); an acceptance walk loads each route cold from the address bar,
  with the query cache cleared, and reads the console.
* **A skill step written as prose gets skipped — script it.** bb-sync's step 4b stayed prose for a week
  and never ran inside a sync; `/inbox-apply`'s vault path stayed an OneDrive literal after the cutover.
  A step is a script with a test, or a check the runner executes, never a paragraph.
* A planning stage stops only where Stack's input is required; everything else proceeds on stated
  defaults and is written to DECISIONS when he answers (2026-09-23).
* Fan-out subagents run on Opus (verifiers, reviewers, builders) or Sonnet (researchers); the PM session
  is Fable (2026-09-23).
* One agent cannot merge 254 items in one prompt; per-area merges with compact JSON did. Verify every
  extracted claim against the repo and prod before it becomes a requirement: 28 of 201 were refuted.

Learned in Phase 21 (2026-10-07; each from `verification/102a_PHASE21_VERIFICATION.md`):
* **Look at the real screen; green suites are not a look.** The web suite was green and the walk still found two
  layout defects on the real page: W-1, a long conversation made the page grow far below its window, and W-2, a
  finished answer's "Used:" line landed below the visible column. The unit tests lay nothing out, so neither could
  show there. A new screen is opened in a real browser before the walk is called done, and a layout fact gets a
  browser test beside its unit test (`web/e2e/workspace-layout.spec.ts`).
* **A walk agent that is still running is not answered by message.** In the second sitting the PM's reply to the
  walker's question did not reach the running walker. It started a second copy of the same agent in the same
  worktree, which edited the spec and ran one test before the PM stopped it. Two agents shared the worktree for two
  minutes; nothing was doubled. The rule (ruling W-S): the agent states its default and takes it, and the PM rules
  afterwards.
* **A pinned library can still break when the host it downloads from changes.** The harness's `rag` server was on
  fastembed 2.1.0, which fetched its embedding model from a Google storage address that had begun to answer 403.
  The first image build failed there, outside the phase's code; fastembed 2.1.1 fetches from Hugging Face (harness
  PR #40). A download at build time is a dependency that no lock file pins.

Learned in the Phase 23 follow-ups (2026-10-09; each from `verification/110a_PHASE23_FOLLOWUPS_VERIFICATION.md`):
* **A file a worker writes can lose its backslashes, and a syntax check does not see a wrong string.** The
  registration script's PowerShell path came out as `System32WindowsPowerShell<VT>1.0powershell.exe` and one
  regex in a browser test as `d+`. Both parsed. A script that cannot be run before the cut-over gets a test
  that reads its bytes, and a worker checks a written file with `grep -F`, not by reading it back.
* **Review a migration before it is applied, and look twice at the fix round.** 187 was reviewed on its own
  branch first, so every finding was an edit and cost no number. The second look at the fix round found a gap
  in the PM's own ruling. Five small rounds went into the file before it was frozen; one comment was still
  found stale an hour after the apply.
* **A rolled-back dry run does not need the text retyped.** With the branch pushed to a public repository,
  `net.http_get` fetches the file at its commit, the run compares its SHA-256 with the local file and executes
  it, and each unit runs as the test login in a sub-transaction that is rolled back. Only the real
  `apply_migration` call needs the text itself, and its recorded text is compared with the file afterwards.
* **Run the unit without the migration too.** A dry run that passes proves something only if the same unit
  stops at "not applied" when the migration is left out.

## 4. Open items that are Stack's, not the PM's

* **Phase 25b, the assistant (built and reviewed 2026-10-20; PR open, base `main`).** Yours, in order:
  1. ~~**The look**~~ Done 2026-10-20 on two review pages: round 1 asked for the edit (W-106), round 2 "looks good. merge." (119a).
  2. ~~**The merge words**~~ Given 2026-10-20 ("merge."): #128, then bb2dash-stack #10.
  3. **The cut-over word**: 202 to 206 applied in order, byte-identical; `workspace` rebuilt alone, then `workspace-2` started alone, never during a turn or a sync; `just doctor` shows two runners (STATUS "Phase 25b").
  4. `just accept 25` from `main` after it; step 1 (usage) is yours. The run proposes on one graded assignment with no note, approves, rejects, makes one stale and clears the note again, proving the planner is as go-live read it.
  5. **Defaults you may overturn** (119a, "PM rulings, 25b" and "Review round 2"): E's page built while D was built; expiry also swept every five minutes; `applied` for an approval that wrote; the feed carries item ids; the tool offers the six statuses the app's menus offer; the owner may PATCH his own proposal's state (R2-6); a proposal filed during a sync fold counts in that fold's raised items (R2-1).
  6. **Removal words** after the merge: worktrees `bb2dash-wt-25b`, `-runner`, `-page`, `-propose`, `-pack`, `bb2dash-stack-wt-25b-runner` and their branches; 25a's `bb2dash-wt-25`, `-text`, `-egress`, `-timing`.
  7. **Three PRs built overnight 2026-10-20, none merged:** #129 (two SQL units that drifted with Phase 26; test only), #130
     (the feed-weekday follow-up of 24b, stacked on #128; goes live with the `workspace` rebuild), #131 (migration 220: IST.352
     knowledge checks expected on class days, your ask on item 6336; dry-run only, two open questions in the PR). Worktrees
     `bb2dash-wt-fix19`, `bb2dash-wt-25b-weekday`, `bb2dash-wt-kc352`.

* **Phase 24b, the Workspace page (part 1 merged 2026-10-15 as #108; part 2 built, reviewed and walked by the PM 2026-10-15; PR #109 open, base `main`).** Yours, in order:
  1. ~~**The look at the page**~~ Done 2026-10-15: you looked and asked for round 4 (the screen fills the pane, the column centred, the side bars edged), built and merged in #109. The branch preview is gone with the merge; the page is production's. ~~on the branch preview, `https://web-git-feat-workspace-page-24b-emstacho-sus-projects.vercel.app` (Vercel SSO: your Vercel sign-in, or the share link in the PM's report, good until 2026-10-16 18:33Z): the lobby and its menus, a question with a course and a depth, the formatted answer and its chips, the panel's three tabs, the phone width (390 px) and the light theme; STATUS "Phase 24b, part 2" names what to look at.~~
  2. ~~**The desktop half of the walk.**~~ **Closed 2026-10-18 on your word ("assume the walk passed"): Q-3 and Q-2's shell half are recorded as passed on your word; the PM did not see them (111a).** As it was: the PM launched a second shell window under its own profile (`%TEMP%\bb2dash-look24b`, the preview's share link as its app URL, sync dry-run); its sign-in is yours. After it: **Q-3** (Add → Upload from this device opens the shell's file dialog; a file dropped on the composer attaches) and **Q-2's shell half** (Open on a PDF source lands on the cited page). Say what you saw; the PM records it in 111a.
  3. ~~**The merge word** for the PR.~~ Given 2026-10-15 21:46Z ("merge 109, push to main"): `aa4f702`.
  4. ~~**The cut-over word**~~ Given 21:52Z ("cut over"): `workspace` rebuilt alone, healthy, the memory jobs on. **The first counting `just accept 24` was red** (run `20261015T222036Z`, stage `page`): the product passed, the pack's own step 18 fact raced the page (111a). That fix merged as #112; the second run (`20261015T223433Z`) was red at `walk`, again on the pack's words (24a's steps read against the new page: the fixed sentence as the turn's line, labels no row resolves as text, the stored answer after a Stop; 111a), the product right in each. That merged as #113; the third run (`20261015T230406Z`) was red at `page` on step 18's count once more (a course file's Open renders after the files list loads; with memory on, a remembered row's Open came first; 111a). That merged as #114; the fourth run (`20261015T233524Z`) was red at `find`, on the product's side: the search function's cold start (10.4 s) outran the runner's 8 s budget a call (111a). That merged as #115 and `workspace` was rebuilt (2026-10-16 03:30Z); the fifth run (`20261016T033116Z`) was red at `page` on the operator's doubt of step 18's count: eleven Open buttons for twelve rows, the planner row's Open being a link (111a). That merged as #116; the sixth run (`20261016T034110Z`) passed every stage to step 19 and was red at step 20 on the playbook's own words for its picture (the chip the page clears once the question is sent; 111a). That merged as #117; **the seventh run, `20261016T041410Z`, was GREEN and counts: Phase 24b is accepted** (STATUS "Phase 24b, part 2"; 111a).
  5. **The feed-weekday follow-up** (amendment (g)): the runner's planner feed carries dates and no weekday, and its prompt does not state today's date (`workspace/`, 24a's ground, out of this phase); the page shows the true date instead. A fix PR or a phase, on your word.
  6. **Defaults you were not asked about and may overturn:** D-F to D-J (brief 111, "Frozen at the gate"), rulings C-1, P-1 to P-3 and the R2-6 amendment (DECISIONS 2026-10-15), R2-a to R2-c and the workers' own defaults (`111_W87`, `111_W88`).
  7. **Removal words:** the worktrees `bb2dash-wt-24b-data` (W-86), `bb2dash-wt-24b` (the phase), `bb2dash-wt-24b-composer`, `bb2dash-wt-24b-thread` (the workers) and `bb2dash-wt-accept18` (the PM's fix worktree), with their branches, all merged, wait for your "remove".
  8. **Refinements the acceptance runs surfaced, each yours to want or not:** a per-file read for the Sources tab's Open (today it waits on the whole current-files list); whether a label no source row resolves is hidden rather than shown as `[M820]`; the Files tab's Index heading, which reads empty while its view loads; one 401 on a read of `workspace_conversations` in step 17's browser log of the green run (the page recovered; 111a).

* **Phase 24a, the Workspace assistant behind the page (built and reviewed 2026-10-09, walked 2026-10-14 by Phase 24ab, merged 2026-10-14, cut over and accepted 2026-10-15 by acceptance run `20261015T141817Z`).** Yours, in order:
  1. ~~**A walk window.**~~ Done 2026-10-14 on your word in the start prompt: two windows (20:01Z to 20:22Z, 20:33Z to 20:36Z), every step of pack 24 and every host proof passed, D-1 (the floor) fixed and walked again (STATUS "Phase 24a"; 109c).
  2. ~~**A network on which the ingest image builds.**~~ Done: the image was built on 2026-10-09 (the network no longer intercepted), P-11 passed then and P-7 at the walk.
  3. ~~**The merge words** for the two PRs (bb2dash first, then bb2dash-stack), then, separately, **the cut-over word** (`workspace`, `workspace-extract`, `workspace-ingest`, `apply`, then `sync`, each alone, nothing open) and `just accept 24`.~~ Given: "merge." on 2026-10-14 (#97 `2b7c388`, then bb2dash-stack #8 `22f35a3`) and "cut over" on 2026-10-15 (the five services, each alone, 14:12Z to 14:16Z; `just accept 24` green at 14:25Z, run `20261015T141817Z`). Step 1 of pack 24 (Usage credits, `/usage`) answered 2026-10-15: "usage credits are off." Nothing of this phase is yours.
  4. **Defaults you were not asked about and may still overturn** (`109a`, "Still open, with the default taken"): on a lookup no model plans the search (item 19); what a hostile uploaded file could do to the service that reads it, now narrower because the parser has its own container (item 20); no name in the greeting (item 21); the same file sent twice is one file (item 25). The old transcript volume `workspace-claude-home` was removed on 2026-10-15 at 14:27Z, after the green run, on your answer 4 of 2026-10-14.
  5. **Not this phase's, found on the way:** `phase15_101_search_path_pin.sql` is red on `main` for the follow-ups' `inbox_accept_question()`; case 7 of the retrieval eval's golden set names two replaced files; the repository now answers at `stack-dev-personal/bb2dash` and the checkouts' remotes still name the old address (pushes go through by redirect).

* **Phase 23 follow-ups (merged and cut over 2026-10-09 on your word; 187 and 188 on prod; NOT ACCEPTED;
  paused on your word at 18:30Z).** STATUS, "Phase 23 follow-ups", opens with where it stands. Yours, in order:
  1. ~~Your word to resume.~~ **Given 2026-10-12 ("continue, merge").** What was waiting: the findings of #91's review, one MEDIUM
     on #90 (the export's retry has no overall deadline), and one more trial run to reach the two stages of
     pack 23 that no run has reached.
  1a. **Your look at the Apply answers toast on #91's preview.** It opened below the window, so the fallback
     command could not be read; it opens above the button now. Then your "merge" for bb2dash #88 (docs),
     #91, #90 and bb2dash-stack #7. The cut-over itself is done, your `.env` line included.
  1b. ~~After those merges the PM runs `just accept 23` from `main`.~~ **Done 2026-10-13: run `20261013T003231Z` is
     green, and Phase 23 with its follow-ups is accepted.** #88, #90, #91 and bb2dash-stack #7 merged on your
     word of 2026-10-12. What is left of this phase is yours: the three rows under 3, the follow-ups STATUS
     names (none blocking), and your word to remove the phase's worktrees, test image and two `tmp/` branches.
  2. **`just doctor`, now and then.** It is the only place a failed scheduled export shows.
  3. **Three rows of pack 23 that a run cannot do for you:** ~~one real answer of yours applied after a sync and
     read in the app~~ (done 2026-10-14, request 5089); one decision note in the vault read; and
     `just file-decisions` when you want the day files and their pull request.
  3a. **Two code changes your answers of 2026-10-14 asked for, not built:** the sync's downloader refuses files
     whose link redirects to another origin (not a login problem; Phase 24a's ground); and IST.352 knowledge
     checks expected on class days, so the transform stops asking (STATUS "Phase 23 follow-ups", "Closed out").
  4. **To overrule if you disagree:** the five defaults O-1 to O-5 (a press retries held answers; the fold does
     not apply a superseded-file pick; the acceptance run presses Sync; the verb `file-decisions`; 187 during the
     build and 188 at the cut-over); migration 187 as one file of 940 lines, over your 800 limit (a split would
     have spent 189); and rulings R1 to R7 (DECISIONS 2026-10-08 and 2026-10-09).
  5. **The failing SQL units are audited and corrected** (2026-10-09, on your word; record
     `verification/115_SQL_UNITS_AUDIT_2026-10-09.md`; the suite went from 70 of 81 to 79 of 81 with Phase 24a's
     port merged in, and the two left are true: file 2851 and 188 before the cut-over). That also answers item 7 under Phase 21 below. Two things the audit found
     are yours:
     * ~~A number for a small grades fix, and your look at it.~~ **Fixed on your word, 2026-10-09: migration 107
       is on prod.** The Grades table's "counts toward" flag now follows the picker. ~~Look at GEO.103's Grades tab once.~~ **Checked by the PM on your word, 2026-10-09, without the
       browser** (the PM's Chrome is not signed in to the hub): prod's view gives Exam 1 `true` and both
       attendance columns `false`, and the Grades table drawn from those three rows puts Exam 1 among the items
       and both attendance columns in the collapsed group "Attendance and bookkeeping columns (2)". Your own
       eyes on the page are still worth one look. Say if you want them back.
     * ~~File 2851 needs one command from you.~~ **Done on your word, 2026-10-09:** the embed ran (19 parts),
       the check reads 0 missing, and the SQL suite is 82 of 82.
     * The search eval's Q7 is replaced (your "Fix phase 18 as well"): it asked for a date in a schedule the
       course re-posts weekly; it now asks a question answered in two single-version documents. The eval itself
       (`ingest/eval_search.mjs`) has not been run with the new question; the materials search returns its
       answer at rank 1 in hybrid and vector mode.
  6. Still yours from Phase 23 itself: the two grading components the writer set (30 and 33), the question in
     archived item 3425's record, and the note on item 3435.

* ~~**Phase 19 (PR open, 2026-10-03), in this order:**~~ Merged 2026-10-03 on your word (PR #60). ~~Still yours: dismiss Inbox item 2636 (the PM's proof run)~~ (archived 2026-10-03 22:43Z, "testing item, irrelevant"). Still yours: say if the Stream's "New and changed materials" block should move, and the one live proof left, step 5's "Sync interrupted" toast (the desktop runs the Phase 19 build since 2026-10-03 22:41Z; the next interrupted sync shows it). The original item: (1) ~~task 27, the first register-first sync~~ done with your sync 866
  (2026-10-03; task 27 true, every stream `fresh`); videos now post as links (your answer; migration 172), never downloaded. (2) Walk brief 99's acceptance script on the preview
  (`web-git-feat-content-history-19-emstacho-sus-projects.vercel.app`), step 5 included (one sync interrupted on
  purpose; the PM already proved the rule live with request 580, and Inbox item 2636 is that proof, answer or dismiss
  it). (3) Read the nine DECISIONS rows dated 2026-10-02/03. (4) Say whether the Stream's "New and changed
  materials" block (above the timeline, newest 8) is where you want material posts. Then "merge this phase" or
  changes.
* ~~Answer the sprint 2 question batch (`docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §5, 59
  items, each with the default the PM took) and approve the phase plan (`94_`); say where Phase 14 sits
  (default: it starts with Phase 15).~~ Done by delegation 2026-09-27 (DECISIONS rows of that date; Phase 14 starts
  with Phase 15). Stack may still overturn any row by saying so; the phase's PM then rewrites the B-table row.
* ~~**Hold the Inbox "Apply answers" button and `/bb-sync` until Phase 20's PR-A (R-97) merges.**~~ Lifted 2026-09-30:
  PR-A merged (#39, 2904b20) and the installed `/inbox-apply` prints `realm=projects ok` before anything else (101a).
  The original item: `/inbox-apply` still
  writes its decision notes to the OneDrive stub, not the realm vault (inbox-541..544.md landed there on 2026-09-27);
  the PM copies those four notes into the realm when PR-A lands (brief 101 §Seams). Found by the 2026-09-27 decision panel.
  On `stack-laptop` there is no OneDrive stub: the 2026-09-29 run (request 186) wrote inbox-752..756 straight into the
  realm `C:/Users/stack/vault/projects/bb2dash/decisions/`, so PR-A's copy covers only the four notes from the old machine.
* Task 0's Blackboard session probes **started 2026-09-29 15:25Z** (baseline `200`): the record `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` holds
  the baseline row; once a login is confirmed the PM spawns idle probes periodically, self-paced, for as long as the login lives (your call 2026-09-29: not an hourly clock), each read-only through Claude in Chrome and written as a row (batch item 47; brief 100
  Task 0). Your part: keep the Chrome extension connected, the Blackboard tab open and the laptop awake while the idle series runs,
  and let the reopen probes happen on their days. "Stay signed in?" is **yes**, always (your standing rule, 2026-09-29).
* **B-9, three dates (R-29 stays PARTLY until they land):** the individual presentation slot, the Major Case 1 day (10/20, 10/21 or 10/22; before 2026-10-20) and the Major Case 2 day (11/17 or 11/19; before 2026-11-17). Name the presentation slot whenever you know it; each B-9 answer must land before the day it names (9/30, the
  earliest candidate slot, has passed with nothing recorded), a bound, not pacing (batch item 9): whether 11/4 was the SITN pick or the individual slot,
  and which individual slot is yours (9/30, 10/14, 10/26, 11/4 or 11/16); each answer goes in as an Inbox value resolution.
* The Google OAuth consent screen **stays in Testing for now** (your call, 2026-09-29; you know how to publish it):
  the calendar token died 2026-10-01 18:45Z (308 failed runs) and you re-minted it about 2026-10-02 05:00Z; it died again 2026-10-09 12:23Z (174 failed runs) and you re-minted it 18:10Z on a new OAuth client, still in Testing (your word, 2026-10-09); **the next expiry is about 2026-10-16 18:10Z**; look at Home's push-failure line while it is red (that closes R-52's live clause; not sighted in either outage). You re-mint with `scripts/google-consent.mjs` when the
  push starts failing, or publish first and then re-mint (batch item 28; DECISIONS 2026-09-29).
* ~~Phase 16's six sittings as fast as you can sit them, in the order IST.323, IST.466, IST.352, ECN.304, GEO.103,
  IST.471; migration 106 on prod before the Nov 30 – Dec 13 code freeze (the IST.323 column is graded inside it, 2026-12-03)
  is the one bound (brief 96 open item 4; batch item 11; no date-paced tasks, the freeze stands, DECISIONS 2026-09-27).~~ Done 2026-09-29: all six sat; migration 106 is written and proven, applied once PR #40 merges.
* ~~**Merge PR #40**~~ Merged 2026-09-30; 105 and 106 are on prod.
* Say whether the Nov 30 – Dec 13 code freeze still stands. Default: it stands, as a window, not pacing (DECISIONS
  2026-09-27, no-date-paced-tasks row). If you strike it, migration 106's bound becomes 2026-12-03 and B-6's window goes.
* ~~Phase 12 proofs still his: see the three toasts and click one from a banner and one from the Action
  Center; press Sync inside the shell and confirm "command copied" (batch items 57–58). This is Phase 17's **T-24
  desktop sitting** (brief 97 acceptance step 10); the R-108 DECISIONS row stays PENDING until it happens.~~ Dropped 2026-09-30 ("Forget about the toasts", DECISIONS); R-108 is closed by decision, unproven by a sitting (108 §4).
* ~~Phase 17 **T-26 production sitting** with the PM (brief 97 acceptance steps 8–9): the planner recurrence and
  popover walk, the staging proof, and shots 11, 14, 15, 19–21 plus the `staged link` spec.~~ Done 2026-09-30 before the merge (97w §T-26; the staging case narrowed to row 810, DECISIONS 2026-09-30).
* ~~Phase 17 **round 3 on the preview**: look at the nine round-3 changes (shots 22–27 in `walk-17/`) and say whether
  they are right before the PR merges.~~ Moot: PR #43 merged on your word 2026-09-30.
* Rotate the password you were asked to rotate during Phase 17's walk.
* ~~**Your first `/bb-sync` on `main` is Phase 18's gate** (you merged 18 before it on 2026-09-30). Before it the PM
  refreshes `~/.claude/skills/bb-sync/SKILL.md` from `main`; run it from the main checkout (the desktop Sync button is
  fine now), log in to Blackboard when asked and stay about 15 minutes for the probe sitting (announcement shape,
  per-item URL, meeting times, `feedbackToUser`, group-attempt files). Owed from it: tasks 16–19, 26, walk-18's shots
  05 and 08, and after 2026-10-01 17:51Z task 14's iCal re-read (task 18's author resolution is on `main`, so that one sync also serves the author read).~~ Done: sync 443 (2026-10-01) was the gate, and the syncs since settled tasks 14, 17 and 18 (108 §3). **Still yours from it, one short sitting in your logged-in Blackboard tab:** one real per-item Ultra URL (R-69), ~~whether any student view shows meeting times (R-73)~~ (closed 2026-10-04: you accepted the crawl evidence; DECISIONS row), and whether an IST.352 group attempt lists files (R-60 clause 5).
* Place ECN.304 Quiz 2 and Attendance with "Counts toward…" on the course Grades tab if the figure
  should include them.
* ~~**Request 456** (`inbox_feedback`, `queued` since 2026-10-01 18:02Z) keeps "Apply answers" reading queued: cancel it, or say so and the PM cancels it (the same state as request 183, cleared under the two-asks rule on 2026-09-30).~~ Cancelled 2026-10-04 01:21Z on your word ("cancel request 456"), superseded by request 458 (DECISIONS 2026-10-04).
* **Phase 14, its session's items, listed here so one list holds them all (2026-10-03):** ~~sign in again through noVNC (Inbox item 3074 `sync-login-required`, open since 23:00Z)~~ done: item 3074 closed itself at 23:17:38Z (`sync_login_ok`, R-83's self-close seen live) and you signed in again afterwards (while the container's login is dead the runner closes any queued sync as `login_required` in about 25 s, so a desktop Sync press fails; look for a `sync-login-required` item in the Inbox before any sync); decide whether `feat/containers-14` is rewritten or squashed before it merges (commit b2b42c4 holds the unblurred walk-14 shots on a public repo); the merge word on PR #62 after its `/security-review`, before A1; Docker Desktop AutoStart on and the vault `projects` realm clean so `just doctor` exits 0; then walk-14, A1–A9 and the three repo PRs.
* ~~**Merge words waiting:** PR #63 (`docs/inbox-decisions/2026-10-03.md`, the sync session's orphaned log) and the audit PR (108 and these state docs).~~ Merged 2026-10-03 on your word: #63 (57bf75d), #65 (8bdfe4d), #64 (9d1e8ac). Waiting now: the record PR for R-73 and request 456.
* **Say the word to remove the four merged worktrees** (`bb2dash-wt-harness-closure-20`, `-skills`, `bb2dash-wt-inbox-vault-20`, `bb2dash-wt-paths`) and the branches `docs/harness-closure-20` and `-skills`; every head is an ancestor of `main`.
* **Phase 18 defaults to confirm or overturn:** file 62 stays current with its missing note; reading 46 stays tagged; file 69 is not re-OCR'd and `.doc`/OCR automation stays out.
* The 0-byte session note `b46dd7f8` (delete or keep) and inbox-541..544, which exist in the RAG store from the old machine but not in the realm on disk (rebuild from the store, or leave).

* **Phase 14 acceptance sitting (A1–A9)** (brief 100 §Definition of done; ticks in
  `docs/planning/sprint-2/verification/82a_PHASE14_PARITY_AND_IMAGES.md`, section "Acceptance A1–A9"). Walked
  2026-10-04/05 on `main` with the existing checkouts: **A1–A4 and A6 ticked, A2 passed on Stack's word with the doctor's
  two reporting artefacts named (W-74), A8 partial** (the nightly task gone, the checkpoint task kept until the container
  collects). Still open: **A5** (the first morning after 06:00 New York proves the sync without a press, PR #73; the
  next dead login proves the page opening), **A7** `just dev`, **A9** the Windows `/bb-sync` with Docker stopped.
  Stack's remaining steps: a tray Quit so the logon-build task activates desktop build `f37723a` (PR #71), then one
  press of **Update desktop app** on a later desktop change as the end-to-end proof; removing the stale `bb-course-*`
  claude.ai skills (task 19). Done: the Duo login, secrets 11/11, the MCP key move, `.wslconfig`, Docker autostart,
  `node scripts/install-skills.mjs` (2026-10-05 22:0xZ), the sync image rebuilt from `main` 2e39199 (22:06Z).

* **Phase 21, the Workspace (built, walked by the PM and merged on your word 2026-10-07: bb2dash #78, then
  bb2dash-stack #3).** The PM's own walk is done (twelve live turns on your plan, nine screenshots, two layout
  defects found and fixed). **Accepted on 2026-10-08** by the acceptance run (`just accept 21`, green, run
  `20261008T041753Z`; your answer of 2026-10-07 that a green run accepts). What is left:
  1. ~~Step 1 of the acceptance script, and the removal of the stopped test project.~~ Both closed on 2026-10-08:
     you answered step 1 ("usage credits are off."; no `/usage` percentages were given, and nothing waits on
     them), and the test project's container, network and volume were removed on your word. Steps 2 to 15 were
     walked by the run; step 13's cut-over (the profile line in bb2dash-stack's `.env`, the Workspace started
     alone) was done by its host script. Only the walk's raw recordings are left on the laptop
     (`C:/Users/stack/.bb2dash-w64-rec-out`, `C:/Users/Public/bb2dash-w64-rec/`): say the word to delete them.

  Six things were put to you with the walk. You answered items 2, 3 and 4 on 2026-10-07 (leave the firewall for
  now, keep the screenshots, strip the bold markers; DECISIONS 2026-10-07), and they stay below as the record of
  what was asked. Item 5 closed on 2026-10-08 with step 1, without numbers. Items 6 and 7 are open:
  2. **The firewall question, whenever you like.** The Workspace container's firewall allows addresses, not names,
     and code running inside it could reach other Cloudflare-hosted sites through the Supabase project's shared
     addresses. The assistant itself cannot. Live with it in v1, or have a name-checking proxy built? (DECISIONS
     2026-10-07; STATUS, section "Phase 14 deferred (R-96)", bullet "Hardening noted by the security reviews, below
     the bar".)
  3. **The walk's screenshots are in a public repository, and they are already public.** The nine shots in
     `docs/planning/sprint-2/walks/walk-21/` show real answers. As they stand after the retakes: a sentence quoted
     from the IST.323 syllabus (03, 04) and that syllabus's section headings (10); three of your Inbox decisions on
     ECN.304 Quiz 2, with the score (04, 10); slide summaries of two IST.352 decks (11); and two ECN.304 study
     plans (05 to 08) with the course's dates ("Exam 2 is Thu Nov 5"), slide-by-slide content, what the Exam 1
     study guide says Exam 1 covers, two self-quiz questions with the line "Several quiz questions above are
     adapted from it", and a line from your decision notes 538 and 545. STATUS, section "Phase 21", lists them
     shot by shot. They have been on pushed branches since 2026-10-07 (`feat/workspace-21`,
     `feat/workspace-21-web` and `feat/workspace-21-docs`), with the first sitting's fuller takes of five of them
     in the history. A rewrite takes them off the branches and keeps them out of `main`'s history. It does not
     take them off GitHub: a commit that a rewrite drops stays reachable by its id, and through any pull request
     that referenced it, until GitHub Support purges it. So a rewrite is cleanest before the bb2dash PR exists,
     and the PM either asks you this before opening that PR or opens it and says so in STATUS. Keep them, or have
     them replaced with cropped ones and the branches rewritten? (DECISIONS 2026-10-07.)
  4. **One answer showed Markdown asterisks (W-3).** The page shows text as typed, and one answer in the PM's walk
     (the decision question, your step 4) came back with `**` around three lines. Strip the markers on the page,
     press the prompt harder, or leave it? (DECISIONS 2026-10-07; STATUS, Known issues.)
  5. **`/usage`.** Only you can type it. At step 1, read your plan's session and weekly percentages and tell the
     PM; the runner keeps no figure of them.
  6. **`npm ci` in `C:/Users/stack/agentic-harness/mcp-server`**, yours to run or to ask for: its installed
     `node_modules` still holds fastembed 2.1.0 under a lock that says 2.1.1.
  7. ~~**Three SQL units fail on prod's course data**~~ Audited and corrected 2026-10-09 (the Phase 23
     follow-ups item above, point 5; `verification/115_SQL_UNITS_AUDIT_2026-10-09.md`). As it was asked:
     from any checkout (`grading_invariants.sql`,
     `phase18_122_supersede_rule.sql`, `phase18_golden_truth.sql`; STATUS, Known issues). They are not Phase 21's;
     say which session takes them.

## 5. Context the orchestrator reviews at session start

Read in this order. Each line says what the file is for and what to look for.

| # | File | Why it matters now |
|---|---|---|
| 1 | `project-state/STATUS.md` | Where the product is, what shipped last, "What's next — Sprint 2". Diff its header date against `git log -1 origin/main` to see if another session moved `main`. |
| 2 | `project-state/DECISIONS.md` (tail ~20 rows) | The newest decisions, including the 2026-09-23/24 planning rows; do not relitigate silently. |
| 3 | `docs/planning/README.md` + `docs/planning/sprint-2/90_SPRINT2_INTAKE.md` | Where every planning doc lives (numbers never restart) and the sprint's carried-in list. |
| 4 | `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` §1–§4 | The R-numbers every sprint 2 brief cites; §2 the PM- and research-added steps; §3 Stack's items; §4 what stays declined. |
| 5 | `docs/planning/sprint-2/94_SPRINT2_PHASES.md` + `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` + the brief of the phase at hand (`briefs/95_`–`103_`) + `docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md` §3 | The plan, the graph, the seams; the run sheet (which run is next, its gate, concurrency, checklists, fallbacks; no calendar); the frozen Contract, MVP, DoD and task list with a deterministic check per task; that brief's residual round-3 notes, fixed or struck in the phase's own PR before workers are cut. |
| 6 | `docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §1 and §6; `research/92_*` for the area | What the research changed about each requirement, and the defaults taken; for Phase 14 also `82_` and `research/82_*`. |
| 7 | `CLAUDE.md` (repo root) | The SOP and the project facts, corrected 2026-09-24. |
| 8 | `DATA_SYNTAX.md` §search layer · `web/README.md` · `mcp-server/README.md` | The retrieval contract; the web scripts and type-regeneration step; the materials server's registration. |
| 9 | `gh pr list --state open` · `git worktree list` · `git branch -r` | Live state that no document captures; foreign worktrees stay untouched. |
| 10 | Auto-memory `MEMORY.md` | Session-scoped facts; verify any path or flag it names still exists. |
| 11 | For a harness phase: `~/agentic-harness/README.md`, `hooks/README.md`, `docs/portable.md`, `docs/vault-migration-requirements.md` | V-2 is built there; the vault is realms; Phase 14's C-4 is superseded by it. |

Not to read at start: `docs/planning/sprint-0-foundation/superseded/*`, the eval/POC docs unless retrieval
quality is the topic, and `docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md` (history).

## 6. Session prompts, one per phase in six sessions, lettered in chronological order (copy-paste; sprint 2, rewritten 2026-09-27 to the verified briefs; re-lettered 2026-09-29)

One prompt per phase, grouped into the five sessions below; a session pastes its prompts in the order shown, when
its heading says. The order to run them, concurrency, checklists and fallbacks are in
`docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` (no calendar). The bb2dash prompts (B1, B2, B3, C, D1, D2, E, F) start with `/bb2dash-pm` so the session loads
this file and runs the live-state checks before acting; Session A runs in the harness repo, so its prompt starts by
naming `C:/Users/stack/agentic-harness`. Every brief was PROVISIONAL until Stack answered `93_` §5 and approved `94_`, which he did by delegation on 2026-09-27 (DECISIONS rows of that date);
the prompts carry the PROVISIONAL line, and each phase's PM first records whatever answers he has given against its
brief's B-table. Before cutting workers, the phase's PM reads that brief's residual notes in
`docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md`
§3 and fixes or strikes each one in the phase's own PR. The used sprint 1 prompts are history in
`docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md`.

**Position on 2026-10-16 (Phase 24b accepted):** the page merged 2026-10-15 at 21:46Z as #109 (`aa4f702`) on Stack's "merge 109, push to main", production deployed; cut over at 21:52Z on his "cut over" (`workspace` rebuilt alone, the memory jobs on); then seven counting runs of `just accept 24` on his word: five red on the pack's own words (step 18's count read before the rows, #112; the walk stage's 24a wording against the 24b page, #113; step 18's count read before the files list, #114; the planner row's Open a link, #116; step 20's chip picture, #117), one red on the product's side (the runner's 8 s search budget against a cold search function, #115: 20 s a call, 30 s a batch, `workspace` rebuilt 2026-10-16 03:30Z), and the seventh, `20261016T041410Z`, GREEN from `main` at `7590d54` (04:14Z to 04:31Z; fifteen stages, nineteen automated steps, fifteen with a host proof; the remembered item seen, read and deleted). Between the runs, on his "merge 111, 84, and 59 one at a time", the three docs PRs merged with their conflicts resolved on their branches. Records: STATUS "Phase 24b, part 2", DECISIONS 2026-10-15 and 2026-10-16, 111a. Stack's (§4): the desktop half of the walk, the feed-weekday follow-up, the refinements, the removal words.

**Position on 2026-10-15, evening (Phase 24b part 2 built, reviewed and walked; PR #109 open):** from brief 111's final prompt on `feat/workspace-page-24b` (worktree `bb2dash-wt-24b`): the gate checked open, Phase 22 re-read and the brief frozen (43830a5; Q-5 PASS; amendments (f) to (h) binding; D-F to D-J), ruling C-1's seam (`composer-contract.ts`), W-87 and W-88 cut on Opus and merged (8a02fb2), the pack extended and Phase 22's fixture widened (tasks 12 and 14), the SOP gates green, `/security-review` (S-1) and `/code-review main high` (thirteen findings) sent back as round 2 and the walk's W-5 and W-6 as round 3, each merged (05e942b, aa16c0e, 27b099e); the PM's walk on the preview in Chromium (three passes, both themes, 390 to 1440 px; the live pack steps 17 to 21 passed twice with the live runner; Q-1 PASS; Q-2 PASS in the browser; W-5 seen); Phase 22's walk box repaired after a part 1 regression and green (5 passed); the walk's conversations archived and its uploads gone; task 13 (`WORKSPACE_MEMORY_JOBS: "on"`, dd05dda). Gates at the head: typecheck, eslint and build clean, 209 files / 3,885 tests, the audits, the acceptance suite 103 and the PGlite proofs 28, eleven red files, no Workspace file over 400 lines. Records: STATUS "Phase 24b, part 2", DECISIONS 2026-10-15 (seven rows), `111a` "Part 2", `111_W87`, `111_W88`. Stack's: the look, the desktop half of the walk (his sign-in; Q-3, Q-2's shell half), the merge word, the cut-over word and `just accept 24`, the feed-weekday follow-up, the removal words (§4).

**Position on 2026-10-15, later (Phase 24b part 1 merged):** on Stack's words "merge to main" and "merge 108" the data layer of Phase 24b went to `main` ahead of the page as PR #108 (`022812c`, 16:50Z; the phase branch fast-forwarded to it), the one exception to one PR per phase (DECISIONS 2026-10-15). On `feat/workspace-page-24b` (worktree `bb2dash-wt-24b`): the page's wording (task 3), the frozen-exports section of brief 111, W-86's nine modules, stream changes and 14 test files (Opus; Q-4 PASS 8.55 ms), the PM's audit exemption, W-86's round 2 after the focused review (R2-1, R2-2), four merges of `origin/feat/workspace-24` and one of `origin/main` (7e71eb7, 39937fd); gates green there (typecheck, lint, 202 files / 3,734 tests, the greps); `/security-review` no findings; the broad `/code-review`'s twelve findings are in 24a's code and are listed for the 24ab session outside the repo. Nothing on the live page changes. Records: STATUS "Phase 24b, part 1", `111a`, `111_W86`. Open: part 2 (the Phase 22 re-read, Q-5 and the freeze, then W-87 and W-88 on Opus from the same branch, brief 111's final prompt); W-86's worktree `bb2dash-wt-24b-data` and branch `feat/workspace-page-24b-data` (merged) await his removal word.

**Position on 2026-10-15 (Phase 24a accepted; Phase 24ab done):** the two PRs of `feat/workspace-24` merged on Stack's word "merge." on 2026-10-14 (bb2dash #97 `2b7c388`, bb2dash-stack #8 `22f35a3`); on his word "cut over" the five services were rebuilt from `main` one at a time on 2026-10-15 (14:12Z to 14:16Z, nothing open; the ingest image built once by the worker's name before the parser's first start, DECISIONS 2026-10-15); `just accept 24` from `main` was green and counts (run `20261015T141817Z`, 14:18Z to 14:25Z: nine stages, twelve automated steps, ten with a host proof, the planner and the sync container unchanged); the old transcript volume was removed on his answer of 2026-10-14. Records: 109c's last four sections, STATUS "Phase 24a", DECISIONS 2026-10-15. Open from it: nothing of Stack's (step 1 answered 2026-10-15: "usage credits are off."); the phase worktrees and `feat/workspace-24`, removed once 24b's branch has merged `origin/main`. Phase 24b's gate is open: its data layer runs on `feat/workspace-page-24b`, and the page's streams (W-87, W-88) start from brief 111's final prompt.

**Position on 2026-10-14 (Phase 22 merged):** the last phase of sprint 2 is on `main` (PR #93, `dff1e05`, 19:00Z; production deployed the same hour), on Stack's standing merge word of 2026-10-12 ("go. merge as well."), repeated on 2026-10-14 ("continue merging phase 22 to main"). The close-out ran as the brief's acceptance script in the walk box on the final tree: `main` merged a fourth time (e820b29; one stylesheet conflict, the Inbox's Apply answers toast, resolved by keeping both phases' intent), the web and desktop gates and every named check of task 20 green, the phone-width walk (`20261014T182418Z`, 54 passed, 24 pane measures, six phone shots) and the theme walk (`20261014T183839Z`, 64 passed, 62 shots judged by two checkers) with the fingerprint unchanged around each counted run, the two layout specs (`20261014T183637Z`, 9 passed), and the desktop look on the packed build (the window dark at open, the bar clearing the three buttons at the 960 px minimum, real clicks on the five icons and the popout's close button, Light by the real mouse, the menus, the failed-load page, the update prompt, the icon, the scrollbars and motion). The record is `walks/walk-22/WALK.md`. Closed the same day on his word ("call everything good. merge everything to main and close out this phase."): the two specs ran once against production (run 20261014T191444Z: 118 passed, 0 failed, 8.1 minutes: the 54 phone-width cases with their 24 pane measures and the 64 theme cases, against production at dff1e05), `bb2dash-wt-22*` and the five worker branches are removed, and taste calls T-1 to T-18 stand as built. With it every phase of sprint 2 is merged; what is left of the sprint is §4's items and the acceptance follow-ups the phases' own sections name.

**Position on 2026-10-08 (Phase 21 accepted):** the acceptance run (`just accept <phase>`, §3 step 9) merged on Stack's word (bb2dash #82 `8269fac`, bb2dash-stack #5 `c4a54f8`) and its first run from `main`, `20261008T041753Z`, was green and counts: Phase 21 is accepted, the Workspace runs from bb2dash-stack, and the record is 102a's last section. Closed the same day: Stack's step 1 ("usage credits are off."), the removal of the test project `bb2dash-wt21` on his word, and the phase's worktrees and branches; only the walk's raw recordings are left on the laptop, his to have deleted. A later phase with a pack under `acceptance/<NN>/` is accepted the same way.

**Position on 2026-10-07 (Phase 21):** D2 has run since 2026-10-05, and Phase 21 is built on `feat/workspace-21` in bb2dash and in bb2dash-stack and walked by the PM; both PRs (bb2dash #78, bb2dash-stack #3) merged on Stack's word on 2026-10-07, before his acceptance walk. Done: the freeze with Stack's answers, four worker streams each with an independent check, migrations 140–143 on prod (frozen), the image built from harness `main` 57ee51f and proven as test project `bb2dash-wt21` (tasks 12 and 13), both reviews on the branch and both on the delta (the `/code-review` run on the range `d4b1b8d..ac41858` is in 102a: eleven findings, R2-1 to R2-11, none CRITICAL or HIGH), runner fix round Z for its three MEDIUM findings (ruling Z1: R2-1, R2-2 and R2-5, and a secret file holding a NUL refused; merged as `134ee64`, runner 810 tests; the eight LOW ones recorded under ruling Z2), `/code-review main high` on bb2dash-stack with its fix round (fifteen findings; S-1, the one HIGH, fixed: the Workspace is started alone, never through a whole-project `just up` while a sync is open; 70 of 70 tests at `190fa43`), and the PM's walk in two sittings on the preview and in a second desktop window (tasks 19 second half, 20, 21 and 22: twelve live turns on Stack's plan, nine shots; W-1 and W-2 found on the real screen, fixed by W-66, merged as `25979bb` and shown fixed in the second sitting; W-3 put to Stack; task 21 (d) and the plan's usage percentages not shown live). Next, the PM's: both PRs (task 25), then "ready when you say so". Then Stack's: the 15-step acceptance, after Phase 14's own, and the six things put to him (§4). F (Phase 22) waits for this merge. The worktrees, the test project and the cleanup owed are under D2 below.

**Position on 2026-10-04:** Phase 14 merged on 2026-10-04 before its acceptance sitting (#62 and #67 in bb2dash, with the harness and stack PRs; DECISIONS 2026-10-04), so Phases 14–20 are all on `main`; what is open from 14 is Stack's A1–A9 sitting and the cut-over, listed in §4 by its session. D2 (Phase 21) has its gate (14 and 15 on `main`) and starts by putting O-1..O-5 to Stack; F (Phase 22) after 21; E (Stack's open items, §4) any sitting. Phase 18's last code item, task 19, landed in the crawler PR of 2026-10-04; what Phase 18 still owes is `98a` §2/§5 (two reads in Stack's tab) and the walk-18 screenshots on prod.

**Position on 2026-10-05 (storage keys):** the acceptance sitting's syncs found file 2489 refused by Storage (`InvalidKey`, a curly apostrophe); PR #75 (`fix/storage-key-safe-chars`, outside any phase) sanitises keys to Storage's allowed set in JS and in SQL through migration 095 (applied 2026-10-05), and refuses an occupied sanitised key. The container takes the JS half at its next `just up` image rebuild, after which the next sync should pull 2489 and close item 3441. Three follow-ups went to Phase 14's deferred list (DECISIONS 2026-10-05).
**Position on 2026-10-05 (daily sync):** Phase 14's acceptance found that the container queued the day's sync only on a login transition, so a kept-alive login queued nothing on 2026-10-05; PR #73 (`fix/sync-daily-enqueue`, outside any phase) makes the first alive check at or after 06:00 New York ask for it (DECISIONS 2026-10-05). The container runs it after the next `just up` image rebuild. A5's "a sync runs without pressing Sync" half is proven by that rebuild's first morning.
**Position on 2026-10-04, late:** the desktop's two update buttons were found never to have swapped a build (the detached PowerShell never ran) and were fixed outside any phase on `fix/desktop-update-helper` (PR #71; STATUS section "Desktop update helper"; DECISIONS 2026-10-04). Stack's Phase 14 acceptance sitting began the same evening: A1–A4 walked (STATUS "Phase 14", "Where the product is"), build 4987385 activated by a tray Quit plus the logon-build task, the desktop on `queue-only` since 21:18, the first login-triggered sync (request 1854) and the first queue-only press (request 1855) both `done`; A5–A9 and the cut-over's remaining steps open (§4). The fixed build reaches the laptop through the same Quit-plus-task step once PR #71 merges; the first real press on it is the end-to-end proof.

**Position on 2026-10-03 (audit 108):** Phases 15, 16, 17, 18, 19 and 20 are on `main`; D1 (Phase 14) is running in its own session (launcher PR #62 open; the runner live against prod); open next: D2 (Phase 21) after 14 merges, F (Phase 22) last, E (Stack's open items, §4) any sitting. The PM's own next PRs, outside any phase: PR #65 (the `sync_runner` membership line ported from Phase 14's branch so `main`'s suite reads 59/59; the typecheck gap was the main checkout's stale `web/node_modules`, fixed by `npm ci`), the crawler PR that finishes Phase 18's task 19 (key lists, header, R-66/R-75 rows; slide 13 of `bb_file:8` turned out to be 119's deletion, not a gap), and the walk-18 screenshots on prod.

**Position on 2026-09-29 (after PRs #30–#37):** the letters follow the chronology since 2026-09-29 (DECISIONS of that
" . "date): A = Phase 20, B = 17 + 18 then 19, C = 16, D = 14 then 21, E = Stack's open items, F = 22; Phase 15 is done and
" . "its prompt is kept below as Done. Open now: A (first, R-97 is a live bug), B1 + B2 (parallel, then B3), C (its own
" . "session; the materials MCP server is registered on `stack-laptop`, see §1), D1 (Task 0 is running, the spike is next),
" . "E (any sitting), then D2 and F last. Every prompt's "PROVISIONAL until I answer 93 §5 and approve 94" line is satisfied since
2026-09-27; the phase's PM still strikes PROVISIONAL in the brief's B-table at its start.

**Done — Phase 15** (merged 2026-09-29 as PR #30; the prompt is kept for the record; it was Session A1)

Phase 15 (done)

> `/bb2dash-pm` Start Phase 15: `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md`, R-78, R-79, R-80, R-54.
> PROVISIONAL until I answer 93 §5 (B-41, B-42, B-16) and approve 94: rewrite §Stack's calls to my answers and show me
> any task whose check changed. Nothing gates it; it runs first. Create worktree `bb2dash-wt-15` on
> `feat/db-hygiene-15` from `origin/main`, cut the three worker worktrees and spawn W-38, W-39, W-40 (Opus) on their
> disjoint files, every check failing first where its row says so. Migrations 100–104 only; one PR, no exception taken;
> nothing visual, so no Vercel preview walk. Stop when 100 is on prod and put acceptance step 1's snippet on my
> clipboard (task 5): I set the `db_test_runner` password and write `.env.local`. After my `--ping` passes, finish
> tasks 6–19 and 21–24 and open the PR. I then run steps 2–4, read the advisors (step 5), open the signups setting for
> your screenshot (step 6, task 20) and read the six DECISIONS rows (step 7). Change no Auth setting.
> Stop at "ready when you say so".

**Session A — Phase 20** (the harness repo plus two bb2dash PRs; can run first of all: R-97 is a live bug)

*Status 2026-09-30:* run. PR-A (bb2dash #39) and PR-B (agentic-harness #36, plus #37) merged on Stack's word; PR-C
(`docs/harness-closure-20`) open. Acceptance steps done: 3 (L20-a), 4 (L20-b), 5 (credential test, run by the PM
without removing the credential), 6 (resume chain), 8 (the untagged line in `/bb2dash-pm`); step 7 struck by Stack;
step 1's first real Apply run waits for an Inbox item; step 9 (his word on `101a`) is open. After PR-C merges: task 29.
The prompt below is kept for the record.

> You are the PM for Phase 20 of bb2dash, working in `C:/Users/stack/agentic-harness` with bb2dash beside it. Read
> `C:/Users/stack/projects/bb2dash/docs/planning/sprint-2/briefs/101_PHASE20_harness_closure.md` in full: R-97, R-98,
> R-99, R-100 (the home-pc half), R-101, R-102, R-103, R-104, R-106. PROVISIONAL until I answer 93 §5 (B-52, B-53,
> B-54, B-55, B-56) and approve 94. First record my 93 §5 answers against the brief's B-table; before cutting workers,
> read its residual notes in `C:/Users/stack/projects/bb2dash/docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md`
> §3, then fix or strike each in PR-C, cut after `docs/sprint2-planning` merges. Nothing gates the start; until that
> merge, read both files in `C:/Users/stack/projects/bb2dash-wt-sprint2-plan`. First: R-97 on bb2dash
> `fix/inbox-apply-vault-20` in `bb2dash-wt-inbox-vault-20`, PR-A opened before anything else; until it merges I hold Apply
> answers and `/bb-sync`. Then
> agentic-harness `feat/v2-closure` in `C:/Users/stack/agentic-harness-wt-v2-closure` (PR-B) and bb2dash
> `docs/harness-closure-20` in `bb2dash-wt-harness-closure-20` (PR-C); W-59, W-60, W-61, W-62 (Opus). Migrations: none
> in bb2dash. Three PRs, an exception to one PR per phase that needs its own DECISIONS row at the freeze.
> Tasks 17–19, 21–26 wait for PR-B's merge and three consecutive nightly runs logging `committed -> pulled -> pushed`
> (or up-to-date) for both realms. My stops: `gitleaks` installed (task 20), then acceptance steps 1–9: Apply
> answers after PR-A merges, the hook reinstall (L20-a), "go L20-b" after the dry run, the credential test, the
> resume chain, a cloud `/checkpoint`, and my word on `101a`.
> Stop at "ready when you say so".

(brief 96 §Seams and brief 101 §Seams agree: whichever of Phases 16 and 20 lands second merges `main` into its branch and re-applies its `skills/inbox-apply/SKILL.md` lines, never rebasing a pushed branch.)

**Session B — Phases 17 and 18 in parallel, then 19** (paste B1 and B2 one after the other: each phase in its own worktrees, seams frozen in `94_` §2 rule 2 and §3; paste B3 once both are merged, because 19 builds on both)

B1 — Phase 17

> `/bb2dash-pm` Start Phase 17 beside Phase 18 (B2, this session): `docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md`,
> R-37, R-39 (the interim hide only), R-40, R-42, R-43, R-44, R-45, R-47, R-48, R-49, R-50, R-51, R-52, R-55, R-56,
> R-57, R-58, R-59, R-108; S2-home-1, S2-home-2, S2-materials-1, S2-bugs-1. PROVISIONAL until I answer 93 §5 (B-1,
> B-2, B-3, B-7, B-17, B-19, B-20, B-21, B-22, B-23, B-25, B-26, B-27, B-28, B-29, B-30, B-31, B-57, B-58; and B-42
> through Phase 15) and approve 94. Gate: Phase 15's runner on `main`. Ask me B-7's "anything else?" once. Worktree
> `bb2dash-wt-17` on `feat/web-polish-17`; W-44..W-47 (Opus); migrations 110–119 (110–117 used). One PR, no
> exception of its own; Phase 22's test-only tasks 1–2 may ride it as 22's commits under brief 103's B-6 exception,
> whose DECISIONS row is written the day I answer B-6. My sittings (acceptance steps 8–11): the desktop shell (T-24),
> the production planner and staging walk (T-26), and the consent-screen read before 2026-10-01 17:03Z (T-27; a bound, not pacing); then
> acceptance steps 1–7 and 12 on the preview. Stop at "ready when you say so".

B2 — Phase 18

> `/bb2dash-pm` Start Phase 18 beside Phase 17 (B1): `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md`,
> R-60, R-61, R-62, R-63, R-66, R-67, R-68, R-69, R-70, R-72, R-73, R-74, R-75, R-77; S2-rag-1. PROVISIONAL until I
> answer 93 §5 (B-8, B-32, B-33, B-34, B-35, B-36, B-37, B-38, B-40; and B-42 through Phase 15) and approve 94. Gate:
> Phase 15 merged and `node scripts/db-test.mjs` exits 0 on `main`. Worktree `bb2dash-wt-18` on `feat/ingest-corpus-18`;
> W-48, W-49, W-50, W-51 (Opus), with `.env.local` copied into each worktree, `npm --prefix scripts ci` run there and
> `--ping` passing (L3); migrations 120–129; one PR, no exception taken. Stop when tasks 2–5 and 15 are on the phase
> branch: I run the sync gate (task 16) by
> hand from `bb2dash-wt-18`, never with the desktop Sync button, and stay for the probe sitting. Stop again when task
> 18 is on the branch (unless B-36's fallback ran): I run the second sync (L7). Then finish tasks 17–29, walk the
> preview into `walks/walk-18/` and open the PR; I walk the acceptance script on the preview. Merge and the `search`
> redeploy only on my word. Stop at "ready when you say so".

(brief 97 §Seams says Phase 17 edits neither `AssignmentDetailBody.tsx` nor `PlannerItemPopover.tsx` and shares `CourseScreen.tsx` with 18 in named hunks; brief 98 §Seams says both phases touch all three, named hunks only. Brief 97 also shares W-47's `queries.announcements.ts`, `Bell.tsx` and the not-recorded cases of `Bell.test.tsx` under B-36's fallback, and `DATA_SYNTAX.md` in separate sections.)

B3 — Phase 19

> `/bb2dash-pm` Start Phase 19: `docs/planning/sprint-2/briefs/99_PHASE19_content_history.md`, R-38, R-41 (run
> states and the per-stream read), R-64, R-65, R-71, R-76. PROVISIONAL until I answer 93 §5 (B-18, B-19, B-20, B-39,
> and B-42 through Phase 15's test role) and approve 94. Gate: Phases 17 and 18 merged to `main`, with Phase 15's
> runner. B-19's ghost merge and B-20's terminal rule are PM picks: build them only on my explicit yes. Re-measure S₀,
> D₀ and N₀ (task 3) and files 17 and 19 (task 4) on prod. Worktree `bb2dash-wt-content-history-19` on
> `feat/content-history-19`; W-52, W-53, W-54 (Opus); migrations 130–139; one PR, no exception. I run the first
> register-first sync (task 27). Open the PR with its Vercel preview; I walk the acceptance script there, one sync
> interrupted on purpose (step 5) included, and read the nine DECISIONS rows. Stop at "ready when you say so".

(brief 95 §Out of scope says R-41's run-state UI is Phase 17's; briefs 97 §Out of scope and 99 give R-41's run states, UI included, to Phase 19.)

**Session C — Phase 16** (its own session; paste C once and park it between sittings; runs beside Session B)

C — Phase 16

> `/bb2dash-pm` Start Phase 16 (Phase 15 merged 2026-09-29; the materials MCP server is registered on stack-laptop): `docs/planning/sprint-2/briefs/96_PHASE16_grades_v1.md`,
> R-29, R-30, R-31, R-32, R-33, R-34, R-35, R-36. PROVISIONAL until I answer 93 §5 (B-9, B-10, B-11, B-12, B-13,
> B-14, B-15, B-16, plus B-23 and B-42) and approve 94. Worktree `bb2dash-wt-16` on `feat/grades-v1-16` from
> `origin/main`; W-41, W-42, W-43 (Opus); migrations 105–109; one PR, no exception taken (open item 4 names the one
> contingency). Gate: every SQL check runs through Phase 15's runner, from 15's branch until it merges; apply 105
> only after 100–104 are on prod and task 10a's commit is on `feat/db-hygiene-15` (if 15 has merged without 10a, ask
> me before task 10). Run tasks 1–15, then stop with `.\scripts\validate-grading.ps1 IST.323` on my clipboard. I
> launch it (step 2) and sit six courses as fast as I can, in the order IST.323, IST.466, IST.352, ECN.304,
> GEO.103, IST.471; migration 106 on prod before the Nov 30 – Dec 13 code freeze (the IST.323 column is graded inside it,
> 2026-12-03) is the one bound. You spot-check three citations after each. After
> sitting 6, write 106, rerun the invariants and open the PR with a preview. I walk step 1 and steps 5–10 (step 9
> after ECN.304 Exam 1 posts).
> Stop at "ready when you say so".

**Session D — Phase 14, then Phase 21** (three repos; paste D1 now: Phase 15 has merged and Task 0 is running, per `94_` §2 rule 4; paste D2 after Phase 14 merges: 21 reuses 14's container, token and MCP image)

D1 — Phase 14

> `/bb2dash-pm` Start Phase 14: `docs/planning/sprint-2/briefs/100_PHASE14_containers.md` (it supersedes `82_`'s
> Contract), R-81, R-82, R-83, R-84, R-85, R-86, R-87 (conditional on B-45), R-88, R-89, R-90, R-91, R-92, R-93,
> R-94, R-95, R-96 (the deferred list); S2-containers-1. PROVISIONAL until I answer 93 §5 (B-4, B-43, B-44, B-45,
> B-46, B-47, B-48, B-49, B-50, B-51; its live SQL on Phase 15's B-42) and approve 94. Put open items 1–6 to me;
> task 1 then freezes it in eleven DECISIONS rows (ten if open item 6 or B-42 drops 094), row (5) the exception: one
> PR per repo, plus the early `syncLauncher` PR. Branches `feat/containers-14` (bb2dash), `feat/containers` (agentic-harness),
> `feat/containers-14-stack` (bb2dash-stack, which I create first); worktree `bb2dash-wt-containers-14`;
> W-55..W-58 (Opus); migrations 091–099. W-57 and W-58 may be cut after task 1; the noVNC spike (task 4) gates every
> sync-side task, and W-55 and W-56 wait for its PASS with Phases 15, 18 and 19 on `main`. My stops: Task 0 probes
> (task 3), the spike's Duo login, open item 4's machine steps, the MCP key move (task 17), the stale `bb-course-*`
> copies (task 19), the live proofs (task 28), the launcher PR merged before A1, then A1–A9 across at least one night.
> The Windows path keeps working until then. Nothing in `web/`, so no Vercel preview: show me `walks/walk-14/` before
> merging. Stop at "ready when you say so".

D2 — Phase 21

*Status 2026-10-07:* run on 2026-10-05. Built, walked by the PM and merged on Stack's word on 2026-10-07 (bb2dash #78, then bb2dash-stack #3); Stack's
acceptance pending (STATUS, section "Phase 21"; record
`docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md`). The prompt below is kept for the record. Where the
frozen brief says something else, the brief wins: both PRs open together and bb2dash merges first; the password was
handed over as task 19 describes; the walk is 15 steps in two parts, with "merge" after step 12 and "accepted" after
step 15.

* **Worktrees and branches that exist (2026-10-07), all under `C:/Users/stack/projects/`.** In bb2dash, six beside
  the main checkout: `bb2dash-wt-21` (`feat/workspace-21`, the phase branch, the PM's), `bb2dash-wt-21-db`
  (`feat/workspace-21-db`, W-63), `bb2dash-wt-21-runner` (`feat/workspace-21-runner`, W-64),
  `bb2dash-wt-21-container` (`feat/workspace-21-container`, W-65), `bb2dash-wt-21-web` (`feat/workspace-21-web`,
  W-66) and `bb2dash-wt-21-docs` (`feat/workspace-21-docs`, task 24's docs). In bb2dash-stack, one:
  `bb2dash-stack-wt-21` (`feat/workspace-21`).
* **The test project.** Until the merge the Workspace container runs only as compose project `bb2dash-wt21`
  (container `bb2dash-wt21-workspace-1`, network `bb2dash-wt21_workspace-net`, volume
  `bb2dash-wt21_workspace-claude-home`), started from a phase worktree with the service named in every command:
  never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR` (DECISIONS 2026-10-05). One
  tree at a time runs it: it was built in `bb2dash-wt-21-container`, stopped and removed there on 2026-10-07, and
  rebuilt for the walk in `bb2dash-wt-21`. **It runs from `bb2dash-wt-21` now**: image `sha256:a2ef9b28…`, healthy,
  the $1.00 cap, connected to prod's queue, no question waiting. Before and after every docker step, read the live
  sync container's guard value (102a, "The live sync container: the guard value"); a changed id or start time made
  by this phase is a stop.
* **What the walk left in `bb2dash-wt-21`**, gitignored and untracked: `.env.testing`, `web/.env.local`,
  `web/.next/`, the saved sign-in `web/e2e/.auth/state.json`, `web/e2e/.results/`, `desktop/node_modules/` and
  `desktop/dist/`. In the database: four archived walk conversations beside 'spike', which is listed until
  acceptance step 15.
* **Cleanup owed after the merge** (the merge only on Stack's word, bb2dash first; if he asks for the walk's shots
  to be replaced, that and the branch rewrite come before the merge, §4):
  1. Before acceptance step 13: stop the test container, so only the live project answers.
  2. After acceptance step 15: remove the test project's leftovers by name: the container
     (`docker compose -p bb2dash-wt21 --profile workspace rm -sf workspace`), the network
     `bb2dash-wt21_workspace-net` and the volume `bb2dash-wt21_workspace-claude-home`. Never a project-wide `down`
     against `bb2dash`.
  3. Delete task 9's raw recordings, which hold syllabus text: `C:/Users/stack/.bb2dash-w64-rec-out`,
     `C:/Users/Public/bb2dash-w64-rec/` and the three transcripts under
     `~/.claude/projects/C--Users-Public-bb2dash-w64-rec-cwd/`.
  4. Remove the seven worktrees and their branches, local and remote, in both repos (the walk's gitignored files
     in `bb2dash-wt-21`, the saved sign-in among them, go with that worktree); pull both main checkouts; update
     memory.
  5. The acceptance record as a docs-only PR (PR #76's precedent), with its DECISIONS row.

> `/bb2dash-pm` Start Phase 21: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`, S2-workspace-1.
> PROVISIONAL until I answer 93 §5 (B-5; and B-42, B-48, B-51 through Phases 15 and 14) and approve 94. Gate: task
> 1's seam gate, Phases 14 and 15 merged to `main`; then put open items O-1..O-5 to me, with B-5 if unanswered, and
> wait. Worktree `bb2dash-wt-21` on `feat/workspace-21`, and `feat/workspace-21` in bb2dash-stack; W-63..W-66 (Opus);
> migrations 140–149. One PR per repo, the same exception Phase 14 takes under B-51 (its row, written at 14's freeze;
> task 24 records this phase's); until that row exists, the bb2dash-stack change is a second PR opened after this
> one, not beside it. The Realtime spike (task 5) gates the transport, in my logged-in preview. Hand me the one
> `workspace_runner` password line before task 12's health check (task 19); never put it in a file. Walk the preview
> and the desktop shell and open both PRs with the preview link; after Phase 14's acceptance I walk the acceptance
> script, read the D-1 reversal and acceptance rows and say "accepted". Stop at "ready when you say so".

**Session E — Stack's open items, one sitting, no phase** (any time; repeat whenever §4 has items; docs only, no migration; the PM records, Stack decides)

E — Open items

> `/bb2dash-pm` Session E: take ORCHESTRATOR §4's open items in one sitting, in this order, and record each outcome
> where it belongs (a DECISIONS row, a STATUS "Known issues" line, an Inbox value resolution, a struck §4 bullet) in
> one docs PR on `docs/open-items-<date>`; skip an item I say I cannot answer today and leave its bullet standing.
> (1) The calendar token: read `select id, status, left(error, 60) from calendar_push_runs order by id desc limit 1`;
> if it is red with "refresh token", put the four env lines from the header of `scripts/google-consent.mjs` and the
> command on my clipboard (client id and secret from the Cloud project on my personal Gmail, `GCAL_CALENDAR_ID` from
> `app_settings`, the service key from the dashboard); I run it as `emstacho@g.syr.edu` and say `stored 4 secrets`;
> you `select calendar_push_now()` and confirm the next run `ok`; T-27's second reading goes in DECISIONS, and if I
> say I published the screen first, that row says so and the §4 bullet is struck. (2) Task 0: run any reopen probe
> due today from `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` (Claude in Chrome, the extension's own tab
> on `https://blackboard.syracuse.edu/ultra/`, read-only, no clicks); if the idle series has ended, write its
> `Idle lifetime:` line and the closing DECISIONS row that names `KEEPALIVE_MINUTES` and B-45's hour for brief 100.
> (3) B-9: ask me the three dates once (the presentation slot: SITN pick or individual slot, and which; the Major
> Case 1 day; the Major Case 2 day); each answer goes in as an Inbox value resolution and a DECISIONS line.
> (4) Phase 12 proofs (batch items 57–58): with the shell open I watch for the three toasts, click one from a banner
> and one from the Action Center, press Sync inside the shell and read "command copied"; you record R-108 as proven
> or name what failed. (5) ECN.304 Quiz 2 and Attendance: I say whether each counts; you place it with "Counts
> toward…" on the course Grades tab or record "left out" under the figure. (6) The Nov 30 – Dec 13 code freeze: I say
> whether it stands (default: it stands). (7) The R-97 hold: if Phase 20 PR-A has merged, copy inbox-541..544 from the
> old machine's OneDrive stub into `C:/Users/stack/vault/projects/bb2dash/decisions/` and strike the hold; if not, say
> so and leave it. Stop at "ready when you say so".

(Session E never opens a phase branch or a migration; a finding that needs code goes to the phase that owns the file, named in the PR body.)
**Done — Phase 22** (merged 2026-10-14 as PR #93, `dff1e05`, on Stack's word of 2026-10-12; the prompt is kept for the record, rewritten to brief 103 as frozen on 2026-10-08; it was Session F)

Phase 22 (done)

> `/bb2dash-pm` Start Phase 22: `docs/planning/sprint-2/briefs/103_PHASE22_styling.md` (frozen 2026-10-08 with
> Stack's answer to its nine open items; amendments 2 and 3 the same day), R-53, R-46; P-76, P-79; S2-styling-1.
> Gate: every screen exists (Phases 16, 17, 18, 19, 14, 21 and 23 merged). Worktree `bb2dash-wt-22` on
> `feat/styling-22`; task 0 first (the walk box, `scripts/walk-box.mjs`, run by W-75 with the checker's findings);
> tasks 1–2 (the token audit, its baselines and the frozen allowlist) are this branch's first code commits, no
> exception; migrations: none. Workers W-67 (foundation), W-68 (shell and phone width), W-69 (screens A) and W-70
> (screens B) on Sonnet 5.5 (Stack's word), each in its own worktree, each with a verification file; the PM keeps
> the reviews, the checkers and the walks. Publish the three style tiles (task 6) and take his pick (task 7, tile D
> "Charcoal", from B plus C's bar and Upcoming block, his accent rule grey / white / #ff0000, dark by default);
> run the `/ui-ux-pro-max` refinement pass on the tile (amendment 3; `103b_PHASE22_REFINEMENT.md`, the design
> system under `design-system/bb2dash/`) and put rows 17 to 35 to him (D-1 to D-5); task 8 writes direction D
> into `globals.css` and gates the four sweeps (tasks 16–19) and tasks 26 to 38 (the frame, the desktop shell,
> type, panels leaving, marks, keyboard polish, the icon, captions, the week strip, targets, busy, the tracker's
> scrollbar). `/code-review main high` twice (the sweeps on a scratch merge, then the integrated branch) and
> `/security-review`, every CRITICAL and HIGH fixed, in `103_PHASE22_REVIEW.md`. Then the PM's close-out, no
> check-in: merge `main`, the task-20 gates and named checks, the two counted walks in the walk box with shots and
> the fingerprint (`WALK_SHOTS=1 node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → 54 passed and 24 pane
> lines; `… web/e2e/theme-walk.spec.ts` → 64 passed, 62 shots opened and judged), the desktop look on the packed
> build (`npm run pack`; a second instance under its own profile at a local `next start`; his running app never
> touched), `walks/walk-22/WALK.md` with 77 ticked lines and "Taste calls for Stack", STATUS / DECISIONS /
> ORCHESTRATOR, the PR with its Vercel preview. Merge on his word only (given 2026-10-12: "go. merge as well.").
> After the merge: both specs once with `--url` against production, the counts into STATUS; the worktrees and
> worker branches removed on his word.




### F. Phase 24ab: the walk, the PRs, the cut-over and 24b made ready

The prompt is the last section of `docs/planning/sprint-2/briefs/118_PHASE24AB_walk_and_handover.md` on `feat/workspace-24` (Stack named the phase on 2026-10-14). Phase 24b's data layer, started early beside 24ab (Stack, 2026-10-14), has its own prompt in brief 111 ("Session prompt for the data layer, started early"); the page's draft prompt is brief 111's last section, and 24ab's task 12 finalises it. Phase 24's workers are Opus; every other phase keeps Sonnet. **Task 12 done 2026-10-14:** the page's start prompt is final in brief 111's last section ("Session prompt for the page"); it names the gate (Phase 22 on `main` at `dff1e05`, 24a and 24ab on `main`, `just accept 24` green) and the first three things (the gate check, the merge of `origin/main` into the data layer's branch with its gates re-run, the re-read of Phase 22 and the freeze, then W-87 and W-88 on Opus). bb2dash-stack's suite, stopped once by the harness, read 359 of 359 on his word at 21:12Z. **Tasks 7 to 9 and 11 done (2026-10-14 and 2026-10-15):** the two PRs merged on his word "merge." (bb2dash #97 `2b7c388` at 22:04Z, then bb2dash-stack #8 `22f35a3`); the cut-over on his word "cut over" (2026-10-15, 14:12Z to 14:16Z, each service alone, nothing open; the ingest image built once by the worker's name before the parser's first start, DECISIONS 2026-10-15); `just accept 24` green from `main` (run `20261015T141817Z`, 14:18Z to 14:25Z); the old transcript volume removed at 14:27Z; the worker worktrees, branches and `:wt24` images removed after the merge. **Phase 24ab is done.** Task 11's last part done 2026-10-15 on his word "remove 24.": the phase worktrees `bb2dash-wt-24` and `bb2dash-stack-wt-24` and the branch `feat/workspace-24` removed after 24b's branch had merged `origin/main` (7e71eb7). The same day, on his word "merge to main", 24b's data layer went to `main` on its own as PR #108 (`022812c`, merged on his "merge 108"), ahead of the page (§1 row 24b, §4, DECISIONS 2026-10-15).
