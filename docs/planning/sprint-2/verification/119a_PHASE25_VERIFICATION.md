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
| W-102 (C) | bb2dash-stack `feat/phase25-w102-index-watch`, `bb2dash-stack-wt-25-doctor`; bb2dash `feat/phase25-w102-search-timing`, `bb2dash-wt-25-timing` | done: bb2dash f75ce0c, 6dd3dae, 578741e, acf0cc2 (207 and `workspace/` search-probe; workspace vitest 1020/1020, typecheck clean; PGlite dry run of 207 green); bb2dash-stack 8c8c002, fec3d16 (390/390). The row reads `unknown: not deployed yet` until the cut-over. Units waiting on prod: `phase25_207`, and `phase21_142`, `phase21_143`, `phase24_196`, `phase24_199` (now twelve functions). 207 checks its own 5 s budget between calls (a `statement_timeout` set inside a function does not bind the running call); the probe sets 10 s on its session; the role keeps its 15 s |
| W-100 (A) | `feat/phase25-w100-egress`, `bb2dash-wt-25-egress` | **probes pass** (8d56aa8, 078ae7b; `docker/egress/PROBES.md`), Squid 6.13 on debian:13.7-slim: P-1 the CLI tunnels to `api.anthropic.com:443` spliced, 401 with a made-up token, no other host; P-2 Node fetch with `NODE_USE_ENV_PROXY=1` reaches the project host (fails closed without it); P-3 `example.com` refused by name and by SNI. Probe project and images removed; live containers untouched. Build of A started on the probes: four refinements accepted by the PM (env flag instead of code, one proxy port per client network, refusals read from the log, a log watch on the first logged-in turn at cut-over). Domain fronting stays open, as for any proxy that does not decrypt |

## Merges into the phase branch

| merge | what | result |
|---|---|---|
| fb4fdb6 | W-101 (a2ee746) | no conflict |
| 1ada679 | W-102 bb2dash side (acf0cc2) | no conflict |

## Outside the phase

* `phase18_post_embed_checks` (a) fails on **file 3713**, a GEO.103 reading ("When the Soviet Union Freed the Arctic from Capitalist Slavery", reading 57), `text_status` pending since 2026-10-13, never downloaded, and marked `missing_since_run`: Blackboard no longer lists it, so no sync can pull it. Not caused by Phase 25. Left for Stack: re-post or drop it, or name it in the check's exceptions.
