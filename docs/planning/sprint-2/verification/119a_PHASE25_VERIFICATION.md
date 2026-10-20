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

## Review round 1 (2026-10-19), on the branch at dbb81b1a

`/code-review`-style review (HIGH effort) and a security review, each by an Opus agent, read-only.

| finding | severity | where | owner, fix |
|---|---|---|---|
| Squid resolves every CONNECT host before the allow-list (`deny private_dst` is a `dst` ACL ahead of the name checks), so a refused `<data>.attacker.tld` still leaves through DNS | HIGH (both reviews) | `docker/egress/squid.conf:56` | W-100: per-port `deny !names` first, then `private_dst`, then the allows; e2e proves no lookup for a refused name |
| `dstdomain` without `-n` matches an IP-literal CONNECT through its reverse DNS, so a server whose PTR says `api.anthropic.com` gets a spliced tunnel | HIGH (both reviews) | `squid.conf:40-45` | W-100: `-n` on every `dstdomain`, IP literals refused outright, an e2e case to a public IP |
| a ClientHello without SNI is spliced on the CONNECT host | LOW | `squid.conf:77-78` | W-100: `ssl::server_name --client-requested` |
| the 5432 pooler is shared by every Supabase tenant; the firewall cannot tell projects apart | MEDIUM (security) | `docker/egress/README.md` | W-100: named under "still open, by decision" |
| a file over 200's caps is refused whole and downloaded again by every sync | LOW | `200:43-44`, `sync/src/files.ts:236-241` | W-101: recorded as failed with a reason |
| the fallback can commit part of a file after a reconnect; no pg timeouts; `sslmode=require` accepted | LOW | `ingest/text_put.mjs` | W-101: one client per file, timeouts, `verify-full` |
| docs still describe the REST insert 201 removes | LOW | `ingest/AGENT_BRIEF.md`, `ingest/PILOT_IST352.md`, bb-course-pull skill | W-101 |
| the doctor row reads a broken image or a slow search as "unknown"; probe timeouts outlast the doctor's kill | LOW | `doctor/lib/checks-search.mjs:126-127`, `207:104-109`, `search-timing.ts:67` | W-102 |
| the egress README's cut-over table leaves 207 out | docs | `docker/egress/README.md` | W-100 |

Checked and sound by both: 200's conflict target, grants and `search_path`; 207 returns numbers only, no table grant for either runner (prod catalog); the three firewalls; the proxy settings reaching every child process with no token added; egress runs as `proxy`, read-only, no capability, no secret.

### Round 1 fixed (2026-10-19), Stack: "fix the high and the mediums"

| finding | fix | proof |
|---|---|---|
| HIGH, DNS through Squid | W-100 b243aa15: `deny CONNECT ip_literal`, then each port's `deny !names_<port>`, all ahead of `deny private_dst`, the first rule that resolves | e2e with a logging CoreDNS as egress's only upstream: no query for a refused canary name, no reverse lookups; a control lookup from egress does appear |
| HIGH, reverse-DNS bypass | b243aa15: `-n` on all five `dstdomain` ACLs; IPv4 and IPv6 literals refused before any allow | e2e: `CONNECT 160.79.104.10:443` and `[2607:6bc0::10]:443` refused from all three clients (`TCP_DENIED … server=-`) |
| LOW, no SNI spliced | b243aa15: `--client-requested` alone still spliced on the CONNECT host, so a small external ACL (`egress-sni-present`) terminates a ClientHello without SNI at step 2 | e2e: `sni=- bump=terminate` |
| MEDIUM, shared pooler | 5824f137: named under "still open, by decision" in `docker/egress/README.md`; 207 added to its cut-over table (log watch now step 8) | docs |
| LOWs, text put | W-101 882d574e (200 raises 54000 for "too large"), 2f1cc626 (the sync stores such a file as `failed`), 3c7dd540 (one client per file, verify-full against the workspace CA, timeouts), 27317576 (docs) | sync 189, ingest 177, PGlite dry run of 200/201 |
| LOWs, doctor row | W-102 67b733c2 (probe: `over_budget` line, one 20 s deadline), bb2dash-stack e660b60 (exact not-deployed match, stderr only, 57014 reads `move`) | workspace 1027, bb2dash-stack 400 |

e2e: 92 of 92 checks in the throwaway project `bb2dash-p25egress`; project, images (CoreDNS and Debian too), networks and volumes removed; live containers untouched. Merged into the phase branch: e66fe18f (W-101), 75a71add (W-102), 917be52f (W-100).

## Merge and cut-over (2026-10-19)

| step | what | result |
|---|---|---|
| order | Phase 26 (#120, #122; 210–213) cut over first on Stack's pick in its own session; its session confirmed, and the PM checked prod and the containers | done 21:34Z |
| merge | main (Phase 26, #122) merged into the phase branch: the pinned units list all eighteen `sync_runner` functions exactly (cb886be5, 7cc05839); bb2dash #121 and bb2dash-stack #9 merged on Stack's "merge the PRs if all tests are green" | `9d6d5dec`, `9dfcd01` |
| 1 | 200 applied | md5 `8c3b6682` = repo file |
| 2 | `sync` rebuilt alone, between syncs | healthy 21:53Z, login alive |
| 3 | sync 6020 | closed done; 0 files pulled, so 200 unused; surfaced Phase 26's string ids (fixed in #124) |
| 5 | 207 applied | md5 `c6bac184` = repo file |
| 6 | `egress` up alone | healthy, three ports listening |
| 7 | `workspace` rebuilt alone | healthy; self-check: `TCP_DENIED … example.com … server=-`, `TCP_TUNNEL … api.anthropic.com … bump=splice` |
| doctor | `workspace search` row | ok, median 21.2 ms |
| 9 | `apply` rebuilt alone (announcement reviews 6040, 6041 done first) | healthy; self-check passed on port 3129 |
| 10 | `workspace-ingest` rebuilt alone (no upload in flight) | healthy; self-check passed on port 3130 to the project host only |
| 4 | 201 applied after a rolled-back probe of 200 as `sync_runner` inside the live `sync` (Stack: "migrate and cut everything over") | md5 `d4fa53f0`; policy gone; units 201, store proof, 198 PASS on prod |
| SQL | units on prod after the cut-over | 200, 201, 207, 091, 093, 095, 164, 180, 213, 142, 143, 196, 199, store proof, 198: PASS |
| 8 | log watch of the first logged-in Workspace turn | **passed** 23:04Z: Stack's ECN 304 question answered with 12 sources; egress shows only spliced tunnels to `api.anthropic.com` and the project host on port 3128; no refusal beyond the three start-up self-checks |

## 25b (2026-10-19, night), branch `feat/phase25b-assistant` from `origin/main` e88a1a74, worktree `bb2dash-wt-25b`

Stack's start prompt: D (W-103) then E (W-104), Opus workers, probe P-4 before D, migrations 202 to 206 (207 is
25a's, so 208 and 209 are the slack), no prod apply or merge before his word.

### Probe P-4: two answers at once on one subscription (PASS)

Run 2026-10-19 from the live image `bb2dash-workspace:local` (CLI 2.1.289) as a throwaway container
`bb2dash-p25-p4`, the subscription token mounted read-only as a file, never printed; live containers untouched. Each
turn: `claude -p --no-session-persistence --output-format json`, one 350-word answer, no tool.

| run | model | wall s | API ms | result |
|---|---|---|---|---|
| alone | Sonnet | 8.7 | 6,279 | success |
| pair 1 | Sonnet + Sonnet | 9.1 / 39.2 | 6,060 / 37,188 | both success |
| pair 2 | Opus + Sonnet | 10.4 / 8.2 | 8,318 / 5,987 | both success |
| pairs 3 to 5 | Sonnet + Sonnet | 8.1 to 9.5 | 5,887 to 7,020 | all six success |

Ten turns in five pairs, no error, no limit message, no rate-limit text on stderr. One slow answer in the first pair
(37 s of API time) did not recur in the next three pairs. The plan did not push back: D is built.

### PM rulings, 25b

| date | ruling | why |
|---|---|---|
| 2026-10-19 | E's names, signatures and columns are frozen in `../briefs/119b_PHASE25B_contract.md` before E's streams are cut | two streams (database and tool; page) build against one contract |
| 2026-10-19 | the brief's `v_inbox_feedback` means every reader of answered Inbox items on the apply side: prod has no view of that name; `v_inbox_queue`, `v_sync_status` and the functions 119b lists leave `assistant_proposal` out | read on prod 2026-10-19 |
| 2026-10-19 | an approval that writes stores `applied`; `approved` stays in the check, unused in v1 | 206 decides and writes in one transaction, so nothing is ever approved and not yet written |
| 2026-10-19 | expiry is also swept hourly (`workspace_proposals_expire()`, a `pg_cron` job), besides the view and the decide call | the Inbox count and Home read `attention_items`, not the view; without the sweep an expired proposal would count as waiting |
| 2026-10-19 | the tool is served by a credential-free MCP server in `workspace/`; the runner makes the call to 204 on its own login over a per-turn socket | 204 is `workspace_runner`'s only (brief: "the runner inserts only through 204"); the materials server holds the service key and must not be the writer |
| 2026-10-19 | E's page stream (web/ only) starts while D builds; E's database and tool stream waits for D's merge into the phase branch | Stack's order exists because D and E both touch `workspace/` and `compose.yaml` and the pinned function lists; `web/` touches neither |

### 25b streams

| stream | branch, worktree | state |
|---|---|---|
| W-103 (D) | `feat/phase25b-w103-runner`, `bb2dash-wt-25b-runner`; bb2dash-stack `feat/phase25b-w103-doctor`, `bb2dash-stack-wt-25b-runner` | done: 4bfa4954, 32bd2298, d335ca0a; bb2dash-stack b0d23d7. 202 `workspace_claim_v3(p_runner, p_max_open default 2)` (v2 with the cap), `workspace_runner_beats` keyed by runner, `v_workspace_status` + `runners_alive`, `alive_runners`; role at thirteen functions, no table grant; runner name from `WORKSPACE_RUNNER_NAME`; `workspace-2` by `extends` with `build: !reset null` (rendered config checked by the PM: `depends_on: egress` kept); doctor rows `workspace-2` and `workspace runners`. workspace 1045, docker 108, acceptance 56, bb2dash-stack 414; 202 dry-run in PGlite (five mutants fail) and rolled back on prod (SHA matched; not-applied run fails as it should); prod unchanged |
| W-104b (E, page) | `feat/phase25b-w104-page`, `bb2dash-wt-25b-page` | done: 539af8d6, 965ea7d3, 52a36e61, 02228d9b; round 2 9686f39e (a view not yet on the database reads as no proposals, no banner, for the window between the merge's deploy and the cut-over). web 3984 tests, typecheck, build; `web/e2e/walk25b.spec.ts` 4/4 in the walk box (run 20261020T002046Z); 32 shots in `walks/walk-25b/` |
| W-104a (E, database and tool) | `feat/phase25b-w104-propose`, `bb2dash-wt-25b-propose` | started after D's merge (7f1cca86) |
| W-105 (pack 25) | `feat/phase25b-pack`, `bb2dash-wt-25b-pack` | started on 119b |

| merge | what |
|---|---|
| 365bf33a | W-104b (9686f39e) |
| 7f1cca86 | W-103 (d335ca0a) |
