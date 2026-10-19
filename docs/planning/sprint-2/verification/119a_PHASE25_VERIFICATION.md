# Phase 25 verification record (119a)

Brief `../briefs/119_PHASE25_after_24b.md`. PM: the Opus 5.5 session. Branch `feat/phase25-after-24b`, worktree
`C:/Users/stack/projects/bb2dash-wt-25`. Brief frozen 2026-10-19 (05a86ff) on Stack's answers; `main` (14f010f,
PR #119) merged in as d7c2c55.

## Rulings after the freeze

| date | ruling | where it came from | what it changes |
|---|---|---|---|
| 2026-10-19 | `workspace_runner` gets a twelfth function, `workspace_search_timing()` (migration **207**): SECURITY DEFINER, returns eleven timings in ms and nothing else, so the doctor's index row (item C) can measure from inside the database | W-102 found no credential the doctor holds can execute `workspace_search` (192 grants it to `service_role` and `postgres` only); Stack: "w-102) yes it may run" | item C gains migration 207 and a probe in `workspace/`; CLAUDE.md's "eleven SECURITY DEFINER functions" becomes twelve in 25a's PR; the 25a cut-over adds 207 before `workspace` is rebuilt |
| 2026-10-19 | the egress probes P-1 to P-3 run (W-100) | the auto-mode classifier refused the first launch as "Self-Modification"; Stack: "w-100) run the egress probes" | none to the brief; the probes run as the throwaway compose project `bb2dash-p25probe`, no secret mounted |

## 25a streams

| stream | branch, worktree | state |
|---|---|---|
| W-101 (B) | `feat/phase25-w101-text-put`, `bb2dash-wt-25-text` | done, HEAD a2ee746: 200 and 201 written; sync vitest 188/188, ingest 170/170, scripts 378/378, acceptance 56/56, docker 25/25; SQL suite 88 passed, 10 failed: nine wait on 200/201 being on prod, one (`phase18_post_embed_checks` (a), file 3713 has no text unit) is live data the stream did not touch, to be read before the PR |
| W-102 (C) | bb2dash-stack `feat/phase25-w102-index-watch`, `bb2dash-stack-wt-25-doctor`; bb2dash `feat/phase25-w102-search-timing`, `bb2dash-wt-25-timing` | judging half done (bb2dash-stack 8c8c002, 375/375); 207, the probe and the wiring in progress |
| W-100 (A) | `feat/phase25-w100-egress`, `bb2dash-wt-25-egress` | probes P-1 to P-3 in progress |
