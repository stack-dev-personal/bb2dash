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
