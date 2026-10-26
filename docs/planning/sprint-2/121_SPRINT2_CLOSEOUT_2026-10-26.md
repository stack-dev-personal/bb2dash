# 121 · Sprint 2 close-out (2026-10-26)

Sprint 2 was planned on 2026-09-24 (`94_SPRINT2_PHASES.md`, briefs `95_`–`103_`) and grew six phases on Stack's asks
(23, 24a/24ab/24b, 25a/25b, 26). Every phase is merged, live and, where it has an acceptance pack, accepted by a green
`just accept` run from `main`. Sprint 2 closes here, on Stack's word of 2026-10-26 ("go", after the Phase 26 follow-up
merged). The PRs run from #26 to #139 in bb2dash, plus bb2dash-stack #1 to #10 and the harness PRs named below.

What did not close is listed in §3 (Stack's), §4 (the PM's) and §5 (sprint 3 candidates). Nothing in them blocks
the product: each is a sitting, a decision or an improvement.

## 1. What shipped, phase by phase

| Phase | What it is | Merged | Live / accepted |
|---|---|---|---|
| 15 | Database hygiene and the SQL test runner (`db-test`) | #30, 2026-09-29 | runner green on `main`; it now holds 112 units |
| 16 | Grades: V-1 sittings and the reconciliation migration | #44, 2026-09-30 | 105, 106 on prod |
| 17 | Web polish: quick fixes, carried bugs, Inbox and planner leftovers | #43, 2026-09-30 | live; T-24 dropped, T-26 done |
| 18 | Ingest and corpus: in-sync pull, supersession, crawler v5 | #45, 2026-09-30 | settled by the syncs since 10-01 |
| 19 | Content identity, per-crawl history, sync honesty | #60, 2026-10-03 | live; task 27 proven by sync 866 |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction | #39, #48; harness #36, #37 | V-2 closed 2026-09-30 |
| 14 | Containers: the sync runs in Docker | #62, #67; harness #39; stack #1 (2026-10-04) | live since 2026-10-03; A1–A4, A6 ticked, A2 passed, A8 partial; **A5, A7, A9 open** (§3) |
| 21 | Workspace: chat routed by complexity, on the subscription | #78; stack #3 (2026-10-07) | accepted 2026-10-08, run `20261008T041753Z` |
| 22 | Styling: direction D "Charcoal", dark and light, the token audit | #93, 2026-10-14 | closed 2026-10-14; production walk 118 passed |
| 23 | Inbox auto-apply in the `apply` container, and its follow-ups | #79, #81, #88, #90, #91; stack #4, #7 | accepted 2026-10-13, run `20261013T003231Z` |
| 24a | Workspace assistant behind the page: sessions from the database, one pgvector store | #97; stack #8 (2026-10-14) | accepted 2026-10-15, run `20261015T141817Z` |
| 24ab | The 24a walk, the PRs, the cut-over, 24b made ready | (24a's PRs) | done 2026-10-15 |
| 24b | Workspace page: lobby, composer, answers with sources, side panel, memory | #108, #109 (2026-10-15); pack fixes #112–#117 | accepted 2026-10-16, run `20261016T041410Z` |
| 25a | Egress by name, the sync's text insert behind a function, the index watch | #121; stack #9 (2026-10-19) | cut over 2026-10-19 |
| 25b | A second runner; planner changes the assistant proposes and Stack approves | #128; stack #10 (2026-10-20); follow-ups #135 | accepted 2026-10-20, run `20261020T222413Z`; follow-ups accepted 2026-10-21, run `20261021T224728Z` |
| 26 | The announcement reader | #120, #122 (2026-10-19); follow-ups #124, #125, #129, #138 | cut over 2026-10-19; 223 applied 2026-10-26 (no pack; the live record in STATUS) |

Outside the phases, also merged in sprint 2: lecture-number session links (#56), Inbox undo (#74, #72), the desktop
update helper (#71), the acceptance-run machinery (#82; stack #5), the course rail restyle (#110), IST.352 knowledge
checks on class days (#131, migration 220), the feed's weekday (#130), and Stack's own due date (#137, migrations 221
and 222).

## 2. Where the product stands

* The hub is live on Vercel. Supabase `goultdzqcavefcgnifdy` holds migrations through 223, byte-identical to the repo.
* The sync runs in the `sync` container; the `apply` container applies Inbox answers and reads announcements; the
  Workspace runs two runners behind the `egress` proxy. The doctor (`just doctor`) is the health view.
* SQL suite on 2026-10-26: 108 of 112 from `main`. The four red units assert live data, not code (§4).
* Open worktrees: `bb2dash-build` (the desktop's logon build, kept on purpose) and `bb2dash-wt-vm-test` (§3).

## 3. Stack's (sittings, decisions, sign-ins)

Most pressing first.

1. **Re-mint the Google Calendar token.** The push has failed since 2026-10-19 (5,130 runs; last success 2026-10-15
   22:35Z): "refresh token revoked or expired". Google Calendar has not been updated since. Run
   `scripts/google-consent.mjs` (the consent screen is still in Testing, so the token lasts about 7 days; publishing
   the consent screen first would stop the weekly expiry). Proof: the next push run reads `ok`.
2. **One open Inbox item:** IST.466 Major Project 2's group ("Group unassigned still").
3. **R-29's dates (B-9):** Major Case 2's day (presentations the week of Nov 16) and the individual presentation slot,
   each as an Inbox answer before its day.
4. **Phase 14's acceptance:** A5 (a sync without a press after 06:00 New York, and the page opening on a dead login),
   A7 (`just dev`), A9 (the Windows `/bb-sync` with Docker stopped); then a tray Quit so the desktop takes its
   current build, and one press of Update desktop app.
5. **One short Blackboard sitting:** a real per-item Ultra URL (R-69) and whether an IST.352 group attempt lists its
   files (R-60 clause 5).
6. **The redirect allow-list** (`*.prod.files.blackboard.com`, migration 164): allow it, or keep the five files
   flagged.
7. **Grades:** whether ECN.304 Quiz 2 and Attendance count toward the figure (the Grades tab's picker); the two
   grading components the writer set in Phase 23 (30 and 33).
8. **The VM test gate** (note 107 on `docs/vm-test-gate`, three open questions): adopt it for sprint 3, or close the
   branch.
9. **Housekeeping, any time:** the 0-byte session note `b46dd7f8`; inbox-541..544 from the old machine; the walk
   recordings under `C:/Users/stack/.bb2dash-w64-rec-out` and `C:/Users/Public/bb2dash-w64-rec/`; `npm ci` in the
   harness `mcp-server`; the stale `bb-course-*` claude.ai skills; the password rotation from Phase 17's walk.
10. **Standing:** the Nov 30 – Dec 13 code freeze (no merge, no prod apply). Defaults recorded in DECISIONS that Stack
    may still overturn: 24a's items 19–21 and 25, 24b's D-F to D-J and C-1, 25b's R2-1 to R2-6, Phase 23's O-1 to O-5,
    Phase 18's file 62, reading 46 and file 69.

## 4. The PM's (no decision needed)

1. **Four SQL units red on live data.** `grading_invariants` (IST.323/exam-2-fall-2026, a gradebook column row of
   10/22 with points and no component); `phase10b_grade_model` and `phase16_105_pre_sitting_fixes` (rows Stack has
   since confirmed); `phase18_post_embed_checks` (b) (file 4574, an image with no text). Each needs either a data
   answer (the Exam 2 component is Stack's, through the Inbox or the Grades tab) or the unit brought up to date.
2. **Live proofs owed:** Quiz 6's gradebook column under 223 (a question, or the day kept); the "Sync interrupted"
   toast on the next interrupted sync (Phase 19).
3. **Optional refinements from 24b's runs:** a per-file read for the Sources tab's Open; whether an unresolved label
   such as `[M820]` is hidden; the Files tab's empty Index heading while it loads; one 401 in step 17's log.
4. **State docs:** STATUS's "Due-date override" section still says "PR open"; #137 merged on 2026-10-26. Fixed in
   this PR.

## 5. Sprint 3 candidates (nothing decided)

* **Detect Blackboard's placeholder date** ("created + 1 day") for every row, not only announcement rows; 223 covers
  those, and other sources keep the old rule.
* **Publish the Google consent screen**, so the calendar token stops expiring weekly (§3.1).
* **Phase 13's carry-ins** (`parked/81_PHASE13_styling.md`): C-1..C-3, to be re-checked against what Phase 22 built.
* **A Blackboard MCP server in place of the crawler** (PR #41, closed unmerged on 2026-09-30: the research framing is
  there).
* **The VM test gate** as a per-phase step, if Stack adopts note 107.
