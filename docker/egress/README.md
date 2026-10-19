# egress: the name-checking egress proxy (Phase 25a, W-100)

Brief 119, item A. The probes are in `PROBES.md`. This file covers what was built, how it is tested and the cut-over.

## What it is

* **`egress`** (compose.yaml) runs Squid 6.13 (Debian `squid-openssl=6.13-2+deb13u3` on `debian:13.7-slim`) in
  peek-and-splice mode. It never decrypts anything.
* Each client has its own port and its own list of names (`squid.conf`):

  | port | client | names |
  |---|---|---|
  | 3128 | `workspace` | `api.anthropic.com`, `goultdzqcavefcgnifdy.supabase.co` |
  | 3129 | `apply` | `api.anthropic.com`, `goultdzqcavefcgnifdy.supabase.co` |
  | 3130 | `workspace-ingest` | `goultdzqcavefcgnifdy.supabase.co` |

* A tunnel is spliced only when all of these hold:
  * the CONNECT host is a name, never an address literal (IPv4, or IPv6 bracketed or not);
  * the CONNECT host is on the port's own list. Every `dstdomain` acl carries `-n`, so an address is never
    matched through its reverse (PTR) record;
  * the name does not resolve to a private address;
  * the ClientHello names a server (SNI), and it is that same name. A hello with no SNI is terminated. The
    helper `sni-present.sh` makes that check, because `ssl::server_name`, even with `--client-requested`,
    falls back to the CONNECT host when there is no SNI.

  Anything else is refused before the far server is contacted.
* **No DNS for a refused name** (25a review). A name off the port's list is refused before the first acl that
  resolves anything (`private_dst`). So a CONNECT to `<data>.attacker.example` puts no query on the wire, and
  egress cannot be used as a DNS channel. The e2e run proves it with a logging resolver.
* The container runs as `proxy`, with a read-only root, every capability dropped and no secret. A tmpfs holds the
  certificate that an ssl-bump port needs; it is made at each start and no client trusts it. The healthcheck reads
  the socket tables and opens no connection.
* The access log goes to the container's stdout (`docker compose logs egress`). Each tunnel gets one line:

  ```
  <time> <client address> port=<3128|3129|3130> <result>/<status> CONNECT <host>:443 sni=<SNI> bump=<splice|terminate|bump> server=<address or ->
  ```

  * Allowed: `TCP_TUNNEL/200 ... bump=splice server=<address>`.
  * Refused by name (or as a private address, or a port other than 443): `TCP_DENIED/200 ... server=-`.
    Squid answers 200 on an ssl-bump port and then resets the connection; that is not a pass.
  * Refused by SNI: `... sni=<other name> bump=terminate server=-`.

  **Read a refusal from these lines, never from an HTTP 403** (PROBES.md, finding 1).

## The clients

`workspace`, `apply` and `workspace-ingest` each set three variables:
* `HTTPS_PROXY=http://egress:<its port>`;
* `NODE_USE_ENV_PROXY=1`, so Node 22's `fetch` reads `HTTPS_PROXY`. `mcp-server/` and `workspace-ingest/` need
  no code change for it;
* `NO_PROXY=localhost,127.0.0.1`. Nothing else is direct: the pooler link is Postgres, not HTTP.

Each also waits for `egress` to be healthy (`depends_on`, `restart: true`).

Two places start a child with an environment of their own, so the proxy settings are now copied into them
(`proxyEnv` in `workspace/src/config.ts`):
* the runner's search batch (`workspace/src/retrieve.ts`, `batchSpec`);
* the materials MCP server's entry in both MCP configs (`workspace/src/mcp-config.ts`, `apply/src/mcp-config.ts`).

Without these copies, their `fetch` would go direct and the firewall would refuse it.

The firewall is `docker/workspace/init-firewall.sh`. The two forks are regenerated with
`node docker/apply/fork-firewall.mjs --write` and `node docker/workspace-ingest/fork-firewall.mjs --write`.
* It allows TCP to the `egress` address on the client's own port, and to the pooler on 5432. Nothing goes out on
  443 to any address.
* It looks up `egress`, the pooler and `example.com` once, while nothing is closed yet. It pins `egress` and the
  pooler in `/etc/hosts`, then **closes DNS**:
  * Every resolver in `/etc/resolv.conf` is refused, Docker's `127.0.0.11` included. That resolver sits on
    loopback, so it is refused before loopback is allowed.
  * Nothing inside the container resolves a name after start. A proxy client sends the name it wants to the
    proxy.
  * Docker's resolver did not have to stay open for `egress`: the pin covers it.
* The trade-off: if `egress` came back on another address, the pin would be stale.
  * `docker compose restart egress` restarts the three clients too (`restart: true`).
  * A recreated `egress` kept its addresses in the e2e run.
  * If it ever does not, restarting a client heals its pin.
* The firewall's end check now runs four checks:
  1. DNS answers nothing.
  2. `example.com` is refused through `egress`.
  3. `example.com` is refused directly, by the address looked up before DNS closed.
  4. The allowed name answers through `egress`.

**Still open, by decision (brief 119 question 2):**
* `sync`: Blackboard, Microsoft's login and Duo.
* `bb2dash-mcp`: a host session's stdio server.
* bb2dash-stack's `harness-jobs`.
* `pg_net` in the database: it needs Supabase.
* The HTTP `Host` header inside TLS (domain fronting): no proxy that does not decrypt can see it. Cloudflare
  refused it in the probes.
* The pooler on 5432. Its addresses are shared by every Supabase tenant. The firewall allows them by address,
  and the Postgres startup packet, which names the project, travels inside TLS. So the firewall cannot tell a
  connection to the bb2dash project from one to another project on the same pooler.

## Tests

* `node --test docker/egress/egress.test.mjs`: the files. It fails when any of these happen:
  * a firewalled client lacks `HTTPS_PROXY` or points at another client's port;
  * a firewall opens 443 or DNS;
  * a Squid port reaches a name off its list;
  * a splice does not pair the CONNECT host with the same SNI;
  * a Squid rule bumps;
  * the egress service gains a capability, a secret, a volume or a writable root.
* `node --test docker/workspace/init-firewall.test.mjs`: the firewall's logic against fake tools, including DNS
  closing and the four-part end check.
* `bash docker/egress/e2e/run-e2e.sh`: the real images and the real compose.yaml.
  * It runs in a throwaway project `bb2dash-p25egress`, with tags `:p25-egress` and its own copies of the three
    networks. Secrets are fake files, the clients run `sleep infinity`, and the CLI gets a made-up token.
  * The proof that no DNS query is made for a refused name: in the e2e run, egress's only upstream resolver is
    `dnslog` (CoreDNS 1.11.3 with `log`, on a network of the test's own). Its log must hold:
    * the listed names egress resolved;
    * a control name looked up from inside egress, which shows that any lookup would be seen;
    * never the canary name that each client asked egress to CONNECT to, and no `in-addr.arpa` or
      `ip6.arpa` query.
  * It tears everything down and removes the four images and the CoreDNS image by name. It never uses `--rmi all`, which would reach
    the live tags compose.yaml names for other services.
  * It needs `HARNESS_DIR` (the pinned CA's folder) and the network.

## Cut-over (brief 119, "Order"): each step alone, by name, from bb2dash-stack, after the merge

Every step runs only after the previous one is checked. Every compose command names its service. Never run a bare
`up`, and never touch `sync` or `bb-profile` outside step 2.

| # | Step | Check | Rollback |
|---|---|---|---|
| 1 | Apply migration 200 (W-101's `sync_file_text_put`) under its file's name. | The function exists, granted to `sync_runner` only. | None needed: it is additive, and the old REST insert still works until 201. |
| 2 | Between syncs, rebuild `sync` alone: `docker compose up -d --build sync`. | `docker compose ps sync` is healthy. | Rebuild `sync` from the previous `main` commit, between syncs. |
| 3 | Run one real sync. | It stored text through 200: rows in `bb_file_text` from that sync. | As step 2. Do not go on to 201. |
| 4 | Apply migration 201 (drops `bb_file_text_anon_insert`). | `select count(*) from pg_policies where policyname = 'bb_file_text_anon_insert'` gives 0. | A new migration that recreates the policy as 007 defined it. |
| 5 | Apply migration 207 (W-102's `207_workspace_search_timing.sql`) under its file's name. It must go on before `workspace` is rebuilt (step 7). | It is listed as applied under its file's name, byte-identical to the repo file (W-102's own check). | A new migration that undoes 207, on W-102's line. |
| 6 | `docker compose up -d --build egress` | It is healthy. Its log shows three "listening port" lines (workspace, apply, ingest). The live clients are untouched: they still go direct until they are rebuilt. | `docker compose stop egress`, then `docker compose rm -f egress`. Nothing uses it yet. |
| 7 | `docker compose up -d --build workspace`, never during a turn. | Its log ends `Firewall raised: 2 name(s) allowed, DNS closed`. The egress log shows the end check: `port=3128 TCP_DENIED ... example.com ... server=-` and `port=3128 TCP_TUNNEL ... api.anthropic.com ... bump=splice`. | Check out the pre-merge `main` and run `docker compose up -d --build workspace`. That firewall goes direct again; `egress` may stay up unused. |
| 8 | **Log watch, the first real logged-in turn** (do not script it; Stack asks one Workspace question that uses his course materials). While it runs, keep `docker compose logs -f --since 1m egress` open. | Pass: the answer arrives with its sources, and the egress lines for the turn are only `port=3128 ... TCP_TUNNEL ... bump=splice` to `api.anthropic.com` and `goultdzqcavefcgnifdy.supabase.co`. Any `port=3128 TCP_DENIED` or `bump=terminate` line names a host the logged-in CLI or the materials server needs that the probes could not see (PROBES.md, P-1 limit). Record it in 119a; adding a name to the list needs Stack's word. | If the turn fails on a denied host: step 7's rollback, then record the host. |
| 9 | `docker compose up -d --build apply`, never during an apply run. | Its firewall line as in step 7. On the next "Apply answers" run, the egress lines are only `port=3129 ... bump=splice`. | Step 7's rollback, with `apply`. |
| 10 | `docker compose up -d --build workspace-ingest`. `workspace-extract` is not touched: it has no network. | Its firewall line as in step 7. On the next upload, the egress lines are only `port=3130 ... bump=splice` to the project host, and the upload is embedded. | Step 7's rollback, with `workspace-ingest`. |

**Rolling back the whole of item A:** roll back the clients first (steps 10, 9, 7, in that order), each from the
pre-merge `main`, then stop and remove `egress` (step 6's rollback). Migrations 200 and 201 are W-101's, and 207 is W-102's; they roll
back on their own lines.

**Later:**
* `docker compose restart egress` restarts `workspace`, `apply` and `workspace-ingest` with it. Never run it during
  a turn, an apply run or an upload.
* `docker compose up -d --build egress` alone leaves the clients running, and in the e2e run they kept working.

**Follow-up not built here:** bb2dash-stack's `just doctor` has no `egress` row yet (healthy, and the three ports).
That belongs to bb2dash-stack and is out of this branch.
