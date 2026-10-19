# Phase 25: after 24b. Egress by name, the sync's text insert behind a function, the index watch, a second runner, planner changes the assistant proposes and Stack approves

**Status: FROZEN 2026-10-19 on Stack's answers (see "Answers" at the end). A change needs his word and a row in 119a.**
Asked by Stack on 2026-10-18: "execute the after 24b phase, assume the walk passed." The phase is brief 118's row
"after 24b": five items, each left for later by brief 109's Out of scope and 109a's answers. Branch
`feat/phase25-after-24b`, worktree `C:/Users/stack/projects/bb2dash-wt-25`. Migration block **200–209** (the next
free block of ten; 190–199 is used up, 189 stays Phase 23's).

## Why

Phase 24 left five doors open on purpose, each named where it was left:

| # | item | left by | what is open today |
|---|---|---|---|
| A | a name-checking proxy for the containers' outbound traffic | DECISIONS 2026-10-07 (his "leave for now"); 109 Out of scope; 109a item 20 | the firewalls allow addresses; code inside `workspace` reached `example.com` through Cloudflare's shared address on 443; Docker's resolver answers any name, so DNS is a channel out |
| B | the sync's insert of course text behind a function | 109 "Recorded, not closed here"; 109a item 24 | policy `bb_file_text_anon_insert` (007) lets any holder of the public key insert course text |
| C | the assistant's search onto the HNSW index once its median passes 60 ms | his answer "a" to 109a item 23 | nothing tells anyone when the line is crossed |
| D | a second runner | 109 Out of scope; CLAUDE.md "one runner answers the queue at a time" | one `workspace` container answers |
| E | a write path to the planner with propose-then-approve | DECISIONS B-5 (D:195) "later proposal"; 109 Out of scope | the assistant is read-only for the planner |

## Facts, read 2026-10-18

**A, egress.** `workspace`, `apply` and `workspace-ingest` each run an iptables firewall (`docker/workspace/init-firewall.sh`
is the master; the other two are generated forks). Names are resolved once at start with `dig`, public IPv4 only, into
two `hash:net` ipsets (443 and 5432) and pinned in `/etc/hosts`; DNS goes only to Docker's resolver, which answers any
name. `sync`, `bb2dash-mcp` and `harness-jobs` have no firewall; `workspace-extract` has no network. No container sets
`HTTPS_PROXY`. The Postgres links (`pg` to `*.pooler.supabase.com:5432`) cannot go through an HTTP proxy. `pg_net`'s
`net.http_post` is held by `PUBLIC` and `postgres` cannot revoke it. Node in the images is **22.23.3**; the Claude CLI
is **2.1.289**.

**The point a proxy has to get right.** A proxy that checks only the `CONNECT` host does not close A. The client asks
for `api.anthropic.com`, the proxy connects to Cloudflare's address, and the client sends `example.com` in its TLS
handshake: Cloudflare serves `example.com`. The proxy has to read the TLS server name (SNI) of the client's first
packet and refuse a tunnel whose SNI is not the allowed name it asked for. It needs no decryption to do that
(Squid's peek-and-splice).

**B, the text insert.** Two writers, both with the public key: `sync/src/files.ts:316` (the container) and
`ingest/pull_files.mjs:568` and `:659` (the Windows fallback). Both POST to `/rest/v1/bb_file_text` with no upsert and
treat 409 as "already there". Nothing else relies on the policy. The sync already reaches the database only as
`sync_runner` through SECURITY DEFINER functions over `pg`; the REST insert is inherited from the Windows script, with
no recorded reason. Precedent for a function writer: `workspace_ingest_put_text` (193). The embedder reads by
`file_id, unit_kind, unit_no, text` with the service role and does not care who inserted the row. The 165 triggers fire
for any inserting role. Three SQL units pin the policy today (`phase24_store_proof.sql:285, :306`;
`phase24_198_anon_insert_drop.sql:7-8, :61`), and probably pack 24's proofs.

**C, the index line. Measured on prod today, read-only, with stored vectors standing in for questions:**

| call | vectors | calls | median | slowest |
|---|---|---|---|---|
| `workspace_search`, no course | 2,115 course + 1 upload | 11 | **23.7 ms** | 176.6 ms (one outlier); 481.8 ms on the first, cold call |
| `workspace_search`, one course | same | 11 | **9.1 ms** | 10.9 ms |

That is under his 60 ms line, as it was on 2026-10-08 (30.0 ms). **By his own answer the move does not happen yet.**

**D, the runner.** `workspace_claim_v2` (196) takes one advisory lock and returns nothing while **any** request is
claimed. Two runners are therefore safe, but the second one only answers when the first is idle: it adds failover,
not speed. The heartbeat is one row (`workspace_runner_heartbeat`, `id = 1`), so a second runner would overwrite it.
`just doctor` and the healthcheck know one service named `workspace`. Background jobs lease per conversation (196,
199) and already cope with two runners. Both runners would use the one subscription token.

**E, the planner.** The web app writes `assignment_progress` and `reading_progress` as Stack under row security. The
Inbox apply role writes `assignment_progress` only, logged per item (181). The runner's login holds no table grant;
its tools are two, gated by `ALLOWED_TOOLS` (`workspace/src/hooks/gate-rules.ts:14`), served by the materials server.
The rules a write path touches: D:195 (B-5, "v1 is read-only"), D:442 (the runner holds no table grant), CLAUDE.md's
"Still read-only for the planner", and "Facts ... planner state ... never overwritten by syncs" (not by syncs; the
assistant is a new writer).

## The proposal, item by item

### A. A name-checking egress proxy (W-100)

* One new service, `egress`, in `compose.yaml`: Squid in peek-and-splice mode, no decryption. It joins
  `workspace-net`, `apply-net` and `ingest-net`, and is the only one of the four on the outside network.
* An allow-list per client network, as names: `workspace` gets `api.anthropic.com` and the project host;
  `apply` the same; `workspace-ingest` the project host only. A tunnel is refused unless the `CONNECT` host is on the
  client's list **and** the SNI equals it. The proxy resolves names itself and refuses private addresses.
* The three firewalls change from "443 to the pinned addresses" to "443 to `egress` only"; 5432 to the pooler
  stays as it is. DNS from the client containers is closed: they resolve nothing outside, so `/etc/hosts` pins
  `egress` alone and `dig` is no longer needed for 443 names.
* Clients take `HTTPS_PROXY=http://egress:3128`. Probes before anything is built on them: **P-1** the CLI 2.1.289
  answers a turn through the proxy; **P-2** Node 22.23's `fetch` honours it with `NODE_USE_ENV_PROXY=1` (if not, the
  two `fetch` callers, `mcp-server/src/client.ts:383` and `workspace-ingest/src/embed.ts:62`, take an undici
  `EnvHttpProxyAgent`); **P-3** from inside `workspace`, `example.com` through Anthropic's address is refused, by name
  and by SNI.
* Not closed here, said plainly: `pg_net` (needs Supabase), and `sync` and `harness-jobs`, which have no firewall at
  all (question 2).

### B. The sync's text insert behind a function (W-101)

* **Migration 200** `sync_file_text_put(p_file_id bigint, p_units jsonb) returns table(inserted int, present int)`,
  SECURITY DEFINER, `search_path` pinned, granted to `sync_runner` only; it inserts with `on conflict do nothing` on
  the unique key and answers what it did. The 165 triggers run as before.
* `sync/src/files.ts` calls it over its `pg` connection; the REST insert goes. The anon key stays for Storage.
* The Windows fallback (`ingest/pull_files.mjs`) calls the same function with the `sync_runner` login from
  `SECRETS_DIR` (question 3).
* **Migration 201** drops `bb_file_text_anon_insert`, applied only at the cut-over, after the rebuilt `sync` has
  stored text through 200 once. The three SQL units and pack 24's proofs change with it.

### C. The index watch (W-102)

His rule stands: the search moves when its median passes 60 ms. What is missing is anyone noticing. A row in
bb2dash-stack's `just doctor`: it times `workspace_search` on eleven stored vectors (the method above, read-only) and
reads `ok` under 45 ms, `watch` from 45 to 60, `move` over 60. The move itself (two function bodies and a measured
ranking comparison) stays a later phase, started by that row.

### D. A second runner (W-103)

On one laptop a second runner that only takes over when the first is idle buys almost nothing: Docker's restart
policy already brings a dead container back. What a second runner can buy is **two answers at once, from two
conversations**. The proposal:

* **Migration 202**: `workspace_claim_v3(p_runner, p_max_open int)` holds at most `p_max_open` claims at once (default
  2), still one open request per conversation (140's index), still `skip locked` under the advisory lock;
  `workspace_runner_heartbeat` keyed by runner name; `v_workspace_status` reports the newest beat and the count alive.
* `compose.yaml`: a second service `workspace-2` from the same image, its own tmpfs and name. Doctor and the
  healthcheck learn both. `WORKSPACE_MEMORY_JOBS` stays on both.
* Risk named: two `claude -p` turns at once on one subscription. Probe **P-4** times two answers side by side and
  reads whether the plan's limit pushes back.

### E. Planner changes the assistant proposes and Stack approves (W-104, visual)

The runner never writes the planner. It writes a **proposal**; Stack presses Approve on the page; the web app applies
it as Stack, under the row security it already uses.

* **Migration 203** `workspace_proposals`: request, conversation, target (`assignment_progress` or
  `reading_progress`), row id as text (`assignment_id` is text, `reading_id` a number), field, the value read when proposed, the value proposed, a reason, state (`proposed`,
  `approved`, `rejected`, `stale`, `applied`, `expired`), times. Owner reads and updates under row security; the runner inserts
  only through **204** `workspace_propose(...)`, SECURITY DEFINER, which checks the request is the runner's own and the
  row exists, and refuses more than five proposals a turn.
* A third tool, `propose_planner_change`, in the materials server's gate (`ALLOWED_TOOLS`), with its own per-turn
  limit. It writes nothing but the proposal row.
* The page: a card under the answer for each proposal, "Mark *ECN 304 Problem Set 4* as submitted", with Approve and
  Reject. Approve re-reads the row; if the value is no longer the one the proposal read, the card turns `stale` and
  writes nothing. The write goes through the same queries the planner uses, so Google Calendar's push follows as it
  does today.
* Fields in v1 (question 6, answered "also notes"): `status` and `notes` on both tables, and `planned_start` and
  `planned_finish` on `assignment_progress`. A proposed note is the whole new text, at most 2,000 characters, checked
  in 204. Nothing on a fact table, a grade or `planner_events`.
* The card (Stack, 2026-10-19): while a proposal is `proposed` it shows the value read and the value proposed, side
  by side (for a note, the old text and the new). Once it is decided it shows only the outcome ("Approved: marked
  submitted", "Rejected", "Stale: the row changed", "Expired"), and the old and new values are no longer drawn.
* Approval in two places (question 7, answered "both", with Stack's note: "approving or rejecting on either page will
  also update it on the page that the button wasn't selected for that item"):
  * **Migration 205** adds the Inbox kind `assistant_proposal` to `attention_items` (the check from 031) and a
    nullable `workspace_proposal_id` on it. `workspace_propose` files one Inbox item per proposal in the same
    transaction. `v_inbox_feedback`, the answered queue and the sync's `inbox_feedback` request all leave this kind
    out, so the `apply` container and `/inbox-apply` never see a proposal.
  * **Migration 206** `workspace_proposal_decide(p_id, p_decision)`, SECURITY INVOKER, so it runs as Stack under
    the row security he already has. In one transaction it locks the proposal, re-reads the planner row, writes it
    or marks the proposal `stale`, sets the proposal's state and resolves its Inbox item with the same outcome. A
    proposal already decided is refused with the state it holds. The card's buttons and the Inbox item's buttons
    call this one function and nothing else, so neither place can disagree with the other.
  * Both pages show the outcome on next read: the Workspace card from the proposal's state, the Inbox item from
    its resolved state, which names the outcome and links back to the answer.
* Expiry (question 8): a proposal still `proposed` after 7 days becomes `expired` when either page reads it
  (205's view computes it; the next decide call writes it), and its Inbox item resolves as expired.
* The rule changes: D:195 and D:442 get a successor row; CLAUDE.md's "Still read-only for the planner" becomes
  "proposes, never writes". The runner's login still holds no table grant.

## Order, workers, sub-phases

Two pull requests, like 24a and 24b (question 1):

* **25a, hardening (no page change):** B (W-101), C (W-102), A (W-100). B and C first, small and disjoint
  (`db/200-201`, `sync/`, `ingest/` ; bb2dash-stack `doctor/`); A after P-1 to P-3 pass (`docker/`, `compose.yaml`,
  `mcp-server/src/client.ts`, `workspace-ingest/src/embed.ts`, bb2dash-stack's firewall tests). One cut-over: apply
  200, rebuild `sync` between syncs, one sync, apply 201, then `egress`, `workspace`, `apply`, `workspace-ingest`,
  each alone.
* **25b, the assistant (page change):** D (W-103) then E (W-104), both in `workspace/` and `compose.yaml`, so in that
  order. A preview for Stack before the merge. Pack 25 under `acceptance/25/` for `just accept 25`.

Workers on Opus (his Phase 24 rule), each in `C:/Users/stack/projects/bb2dash-wt-25-<stream>` from the phase branch.
Every migration additive, dry-run first, applied under the file's name, byte-identical. No merge or prod apply
inside the Nov 30 – Dec 13 freeze.

## Definition of done (both halves)

- [ ] Web, workspace, mcp-server, sync, ingest and docker suites green; `node --test acceptance/acceptance.test.mjs`
      green; SQL suite green with the changed expectations.
- [ ] `/code-review main high` and `/security-review` (both halves touch secrets, endpoints or a new write path);
      CRITICAL and HIGH fixed and recorded in `119a`.
- [ ] A: P-3 refused by name and by SNI from each client container; a Workspace turn, an apply run and an ingest
      embed each succeed through `egress`.
- [ ] B: `select count(*) from pg_policies where policyname = 'bb_file_text_anon_insert'` gives 0; one real sync and
      one Windows fallback pull stored text after 201.
- [ ] C: `just doctor` shows the index row with its median.
- [ ] D: two questions from two conversations answered at once; both runners on the status row.
- [ ] E: a proposal approved on the page changes the row once; a stale one changes nothing; the runner's login still
      shows no table grant (`has_table_privilege` over `public` gives false throughout).
- [ ] E: one proposal approved on its card shows approved in the Inbox, one rejected in the Inbox shows rejected on
      its card, and a second decision on either is refused; no `assistant_proposal` item reaches `v_inbox_feedback`.
- [ ] E: a decided card draws no old or new value; an open one draws both.
- [ ] STATUS, DECISIONS, ORCHESTRATOR, root `CLAUDE.md` in each PR; `just accept 25` green after 25b.

## Questions for Stack (each with the default the PM takes if he says "defaults")

1. **Split.** Two PRs, 25a (A, B, C) then 25b (D, E), or one? *Default: two.*
2. **Which containers go behind the proxy?** The three with a firewall today, or `sync` too (it drives Chromium to
   Blackboard and must reach Blackboard, Microsoft's login and Duo, whose names change)? *Default: the three; `sync`
   stays open and named as open.*
3. **The Windows fallback's text insert.** It uses the sync's login from `SECRETS_DIR` (same function), or it keeps
   the public key and 201 waits until the fallback is retired? *Default: the sync's login.*
4. **The index.** Keep your rule (move at 60 ms, today 23.7 ms) and add the doctor row, or move the search onto the
   index now anyway? *Default: keep the rule, add the row.*
5. **The second runner.** Two answers at once (cap 2), or a stand-by that takes over only when the first is idle?
   *Default: two at once.*
6. **What the assistant may propose.** Status on assignments and readings plus an assignment's planned start and finish; or also
   notes; or also new planner events? *Default: status and the planned dates only.*
7. **Where approval happens.** On the answer in the Workspace, or as an Inbox item, or both? *Default: on the
   answer; nothing goes to the Inbox.*
8. **A proposal no one answers.** Left as `proposed` forever, or expired after 7 days? *Default: expired after 7
   days, shown as expired.*

## Answers (Stack, 2026-10-19)

Given on the decision page (artifact `3qgePNhZPGQXjzjLDarkJC`, sent 2026-10-19T17:00Z) and confirmed in the
terminal ("Defaults on brief 119. 6) card should show old and new only until one has been decided on. 7) yes.").

| # | Answer |
|---|---|
| E | Yes, build E: the assistant proposes, Stack approves. D:195 and D:442 get successor rows. |
| 1 | Default: two PRs, 25a then 25b. |
| 2 | Default: the three containers with a firewall today; `sync` stays open and is named as open. |
| 3 | Default: the Windows fallback stores text through the sync's login. |
| 4 | Default: keep the 60 ms rule, add the doctor row. |
| 5 | Default: two answers at once, cap 2. |
| 6 | **Also notes.** The card shows old and new only until the proposal is decided. |
| 7 | **Both**, on the answer and in the Inbox; a decision in either place shows in the other (migrations 205, 206). |
| 8 | Default: expire after 7 days, shown as expired. |
| PR #119 | Merge it. Merged 2026-10-19 as 14f010f. |
