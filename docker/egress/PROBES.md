# Egress proxy probes P-1 to P-3 (Phase 25a, W-100)

Brief 119, item A. Run on 2026-10-19, on Stack's word ("run the egress probes"). Probes only: no
real service was built, no firewall script, `mcp-server/` or `workspace-ingest/` file changed.

**The question:** can Squid, with peek-and-splice and no decryption, carry the three containers'
outbound HTTPS and refuse everything else? It allows a tunnel only when both the `CONNECT` host
and the TLS SNI are on the list. **Answer: yes. Every probe passed.**

## How it ran

The probe kit (`compose.probe.yaml`, `Dockerfile.client`, `probe/run-probes.sh`, `probe/fetch-probe.mjs` and the
single-port `squid.conf` and `Dockerfile` named below) is in commit `8d56aa8`. The build replaced it; see `README.md`.

* Compose project `bb2dash-p25probe` (`compose.probe.yaml`), with two networks of its own:
  `probe-inside` (internal, no route out) and `probe-outside`. The proxy sits on both and the
  client on `probe-inside` only. Images `bb2dash-egress:p25-probe` and
  `bb2dash-egress-client:p25-probe`. No secret, no volume, no live tag, no live network.
* **Squid 6.13**: Debian's `squid-openssl=6.13-2+deb13u3` on `debian:13.7-slim` (`Dockerfile`).
  Debian's plain `squid` package has no TLS support and cannot peek.
* The client (`Dockerfile.client`) carries the live pins: Node **22.23.3**
  (`node:22.23.3-bookworm-slim`, with undici 6.28.1 bundled) and `@anthropic-ai/claude-code@2.1.289`.
  It also has undici 6.28.1 from npm, for the fallback.
* `squid.conf` holds the allow-list `api.anthropic.com` and `goultdzqcavefcgnifdy.supabase.co`.
  The CLI asked for no other host (see below). SNI must equal the `CONNECT` host: each name has
  one splice line that pairs its `dstdomain` acl with its `ssl::server_name` acl.
* `probe/run-probes.sh` builds the project, runs every probe, prints the table and tears down
  (`down -v --rmi all`). P-1 uses a made-up OAuth token, so a 401 from Anthropic proves the request
  went out through the proxy. No credential was used.

## Results

| id | result | probe | evidence (from Squid's access log unless noted) |
|---|---|---|---|
| P-0 | PASS | without the proxy, the client cannot get out | `curl: (6) Could not resolve host: example.com` |
| **P-1** | **PASS** | CLI 2.1.289 with `HTTPS_PROXY`, made-up OAuth token | CLI: `"api_error_status":401` ("OAuth access token is invalid"); log: 3× `TCP_TUNNEL/200 CONNECT api.anthropic.com:443 sni=api.anthropic.com bump=splice`; denied: none |
| P-2x | PASS (expected no) | `fetch` with `HTTPS_PROXY` only | `"reached":false "error":"EAI_AGAIN"`: without the flag, fetch ignores the proxy and fails closed |
| **P-2a** | **PASS** | `fetch` with `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` | `"reached":true "status":401`; `TCP_TUNNEL/200 CONNECT goultdzqcavefcgnifdy.supabase.co:443 sni=goultdzqcavefcgnifdy.supabase.co bump=splice` |
| P-2b | PASS | `fetch` + undici `EnvHttpProxyAgent` as dispatcher (fallback) | `"reached":true "status":401`; 1 spliced tunnel |
| **P-3a** | **PASS** | `CONNECT example.com`, refused by name | `TCP_DENIED/200 CONNECT example.com:443 sni=example.com bump=bump server=-` |
| **P-3b** | **PASS** | `CONNECT api.anthropic.com` with SNI `example.com`, refused by SNI | openssl: no handshake; `NONE_NONE/200 CONNECT api.anthropic.com:443 sni=example.com bump=terminate server=-` |
| P-3b+ | PASS | control: the same, with SNI `api.anthropic.com` | `CONNECTION ESTABLISHED`, `CN = api.anthropic.com`; `bump=splice server=160.79.104.10` |
| P-3c | PASS | `CONNECT api.anthropic.com` with SNI of the *other* listed name | `sni=goultdzqcavefcgnifdy.supabase.co bump=terminate server=-` |
| P-3d | PASS | private destinations `10.250.26.1`, `localhost` | `TCP_DENIED/200 CONNECT 10.250.26.1:443 ... server=-`, the same for `localhost` |
| P-3e | PASS | plain HTTP (no CONNECT) | `TCP_DENIED/000 GET http://api.anthropic.com/` |
| info | - | SNI `api.anthropic.com`, `Host: example.com` inside TLS (domain fronting) | Cloudflare answered HTTP 403 |

**What the CLI contacted:** `api.anthropic.com:443` and nothing else, over 3 tunnels per run. This
held on both the OAuth path (`CLAUDE_CODE_OAUTH_TOKEN`, what the live runner uses) and the API-key
path, and with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set (as live) or unset. Nothing was
denied. Limit: the token was invalid, so the CLI stopped at the 401. A logged-in turn may ask for
more hosts, and none of those has been seen.

## Findings the build must carry

1. **A refused CONNECT is not an HTTP 403.** On an ssl-bump port, Squid 6.13 delivers every denial
   the same way, whatever `ssl_bump` says. It answers `200 Connection established`, then starts TLS
   with the client on its own certificate (`cache.log`: "Force bump action on error").
   * The refused server is never contacted (`server=-`), and the client rejects the certificate.
   * `deny_info TCP_RESET` makes the error a reset rather than a page, so nothing is ever served
     inside that TLS.
   * Keep the certificate throwaway and out of every trust store.
   * Acceptance checks must read refusals from Squid's log (`TCP_DENIED`, `server=-`,
     `bump=terminate`) or from a failed handshake, never from a 403 status.
2. **`deny_info` keys on the last acl checked.**
   * An `any-of` acl reports its last member, not itself.
   * The built-in `all` takes no `deny_info`.
   * Hence one `dstdomain` acl lists the names for the deny line, and the last line names an acl
     of its own (`refused_by_default`).
3. **SNI must equal the CONNECT host, not just be listed.** Each listed name gets one splice line
   that pairs its `CONNECT` acl with its SNI acl. P-3c shows that a tunnel to one listed name
   carrying the other listed name's SNI is terminated.
4. **No code change at the two `fetch` callers.**
   * Set `HTTPS_PROXY=http://egress:3128` and `NODE_USE_ENV_PROXY=1` in compose, and
     `mcp-server/src/client.ts:383` and `workspace-ingest/src/embed.ts:62` go through the proxy
     as they are.
   * The undici fallback works but is not needed.
   * Without the flag, fetch fails closed (P-2x), so a missing variable cannot leak around the
     proxy.
   * Node prints `[UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental` once per process, on
     stderr. The materials server's stdio protocol is on stdout, but check that no test or log check
     treats that stderr line as a failure.
5. **Per-client allow-lists need a way to tell clients apart.** Today the three networks get their
   subnets from Docker (`workspace-net` 172.25/16, `apply-net` 172.23/16, `ingest-net` 172.20/16).
   Two options:
   * Recommended: one `http_port` per client (3128 workspace, 3129 apply, 3130 ingest), matched
     with `myportname`, and each firewall allows only its own port. This needs no network
     recreated.
   * Fixed `ipam` subnets in `compose.yaml`, with a `src` acl for each.
6. **Not closed by any proxy that does not decrypt:** the HTTP `Host` header inside TLS (domain
   fronting). Today Cloudflare refused it (403). Record it as residual, next to `pg_net` and the
   open `sync` / `harness-jobs`.
7. **The 5432 link keeps the firewalls.** The pooler link cannot go through the proxy, so the client
   networks cannot simply be made `internal` the way the probe's was. The brief's firewall change
   ("443 to `egress` only, 5432 as today, DNS closed") stands.

## Recommendation

Item A can be built as the brief says, with four adjustments:

1. Use the environment route for P-2 (`NODE_USE_ENV_PROXY=1`), not the undici code change.
2. Give each client its own proxy port (finding 5).
3. Write the acceptance checks against Squid's log, not against HTTP status (finding 1).
4. Watch the proxy's log for `TCP_DENIED` from `workspace` during the first real, logged-in turn
   at the cut-over. That turn closes the brief's full P-1 ("answers a turn"); this run showed the
   routing only.

**Outcome (2026-10-19):** the PM accepted all four adjustments, and item A is built on this branch (`README.md`):

* the environment route is used for P-2;
* each client has its own proxy port and list;
* checks read Squid's log;
* the log watch is cut-over step 7.

The end-to-end run (`e2e/run-e2e.sh`) passed 64 of 64 checks with the real images.
