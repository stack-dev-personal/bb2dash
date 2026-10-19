# Phase 25b: the frozen contract for E (W-104), written by the PM

Brief `119_PHASE25_after_24b.md` (frozen 2026-10-19) is the plan; this file fixes the names, signatures and
columns E's two streams build against, so the database half and the web half meet without asking. Nothing
here changes the brief's scope. A change to this file is a row in `119a` ("PM rulings, 25b").

Read on prod 2026-10-19: `attention_items.kind` check (031) has five kinds; its states are `open`, `resolved`,
`dismissed`, `archived`; RLS is `*_owner_all` (`auth.uid() = app_owner()`) on `attention_items`,
`assignment_progress`, `reading_progress`. `progress_status` = `not_started, planned, in_progress, submitted,
graded, missed, excused, not_applicable, waived` (both tables). `assignment_progress.assignment_id` is text,
`reading_progress.reading_id` bigint. `workspace_messages.request_id` links an answer to its request. There is
**no view named `v_inbox_feedback`**: the brief's name means everything that reads answered Inbox items for
the apply side (`v_inbox_queue`, `v_sync_status`, and the functions `apply_resolutions`, `attention_answered`,
`archive_attention_item`, `inbox_apply_*`, `inbox_decision*`, `inbox_decisions_unfiled`/`_unlogged`,
`close_cleared_gaps`, `attention_keep_stands`, `raise_attention`, `stage_gaps`, `run_transform` and the
sync's `inbox_feedback` filing). Each must leave `assistant_proposal` out.

## 203 `workspace_proposals`

| column | type | rule |
|---|---|---|
| `id` | bigint identity, pk | |
| `created_at` | timestamptz not null default now() | |
| `expires_at` | timestamptz not null default now() + 7 days | |
| `request_id` | bigint not null → `workspace_requests(id)` | the turn that proposed it |
| `conversation_id` | uuid not null → `workspace_conversations(id)` | |
| `target` | text not null | `assignment_progress` or `reading_progress` |
| `row_id` | text not null | `assignment_id`, or `reading_id` as text |
| `course_id` | text | from the assignment or reading |
| `label` | text not null | the item's title as the planner shows it (204 reads it) |
| `field` | text not null | `status`, `notes` (both); `planned_start`, `planned_finish` (assignment only) |
| `old_value` | jsonb | the value 204 read; JSON null when no progress row exists |
| `new_value` | jsonb not null | a status label, a date `YYYY-MM-DD`, or the whole note (≤ 2,000 chars) |
| `reason` | text not null | ≤ 500 chars |
| `state` | text not null default `proposed` | `proposed`, `approved`, `rejected`, `stale`, `applied`, `expired` (v1 writes `applied` on an approval that wrote; `approved` stays in the check, unused) |
| `decided_at` | timestamptz | |

RLS on; owner select and owner update (as the other planner tables); no insert or delete policy. No grant
to `workspace_runner`, `anon` or `inbox_apply_runner`. Index on `(conversation_id)`, `(request_id)`,
partial on `state = 'proposed'`. Unique `(request_id, target, row_id, field)`.

## 204 `workspace_propose`

`workspace_propose(p_request_id bigint, p_runner text, p_target text, p_row_id text, p_field text,
p_value jsonb, p_reason text) returns table(proposal_id bigint, label text, old_value jsonb, new_value jsonb)`

SECURITY DEFINER, `search_path` pinned, execute to `workspace_runner` only (its fourteenth function after
202). Refuses (22023 unless noted) when: the request is not claimed by `p_runner` (as `workspace_turn_put`
checks); the target or field is not allowed; the assignment or reading does not exist (the fact row, not the
progress row); the value is not valid for the field (an enum label of `progress_status`; an ISO date; a
string of 1 to 2,000 characters for notes); the value equals the one read; the request already holds five
proposals (54000); the same `(request, target, row, field)` exists. In the same transaction it inserts one
`attention_items` row: kind `assistant_proposal`, state `open`, `course_id`, `entity = p_target`,
`ref = 'workspace_proposal/' || id`, `field`, `from_value = old`, `to_value = new`, a plain question built
from the label, field and values, `suggested = {source: 'workspace', proposal_id, conversation_id,
request_id, reason}`, `workspace_proposal_id = id`. Returns the row the tool shows the model.

## 205 the Inbox kind and the view

* `attention_items.kind` check gains `assistant_proposal` (drop and re-add the named check, same names
  otherwise); nullable `workspace_proposal_id bigint` → `workspace_proposals(id)`, unique where not null.
* Every reader listed above leaves the kind out (redefined here where needed; a SQL unit proves each).
* `v_workspace_proposals` (`security_invoker = true`): every column of 203 plus
  `effective_state` = `expired` when `state = 'proposed' and now() >= expires_at`, else `state`;
  `attention_item_id` and `attention_state` from the joined Inbox item.
* `workspace_proposals_expire()` SECURITY DEFINER, granted to no client role: writes `expired` on every
  `proposed` row past `expires_at` and resolves its Inbox item (`resolution = {outcome: 'expired',
  proposal_id}`); called hourly by a `pg_cron` job `bb2dash-proposals-expire` (PM default, so the Inbox
  count and Home never count an expired proposal as waiting).

## 206 `workspace_proposal_decide`

`workspace_proposal_decide(p_id bigint, p_decision text) returns table(state text, applied boolean)`

SECURITY INVOKER (runs as Stack under the RLS he has); execute to `authenticated` only. `p_decision` is
`approve` or `reject` (22023 otherwise). In one transaction: lock the proposal (`for update`); not `proposed`
→ raise `55000` with the state it holds in the message (`proposal <id> is already <state>`); past
`expires_at` → write `expired`, resolve the item, return `('expired', false)`. Reject → `rejected`. Approve →
re-read the planner value `for update`; differs from `old_value` → `stale`, nothing written; equal → write
it (insert the progress row when none exists, otherwise update the one field) → `applied`. Then set
`decided_at`, and resolve the Inbox item: `state = 'resolved'`, `resolved_at = now()`, `resolution =
{outcome: <state>, proposal_id}`. The 181 inbox-apply log trigger must not log this write (it is not an
apply run). The calendar push picks up the change as it does any planner edit (it reads `updated_at`).

## The tool `propose_planner_change` (workspace/)

* A small stdio MCP server in `workspace/` (server name `planner`, tool `mcp__planner__propose_planner_change`)
  that holds **no credential**. The answering turn's MCP config names it beside `bb2dash`, with
  `WORKSPACE_PROPOSE_SOCKET=/run/workspace/propose-<request id>.sock` and the per-turn limit (5).
* The runner listens on that socket (0600, `node`) for the turn's life and calls `workspace_propose` on its
  own connection with its own request id and runner name (never from the model's input), then returns the
  function's row or the refusal's message to the tool. Socket and config are removed after the turn.
* Input: `{target, row_id, field, value, reason}`. `ALLOWED_TOOLS` gains the tool; the gate stays deny-only.
* The prompt tells the model it may propose, never write, and that Stack approves on the answer or in the
  Inbox. `workspace_runner` still holds no table grant (`has_table_privilege` false on every public table).

## The page (web/)

* Under a finished answer, one card per proposal of that request (`v_workspace_proposals` by
  `conversation_id`, matched to the answer by `request_id`), read again when the answer finishes and on focus.
* `effective_state = proposed`: a line ("Mark *ECN 304 Problem Set 4* as submitted"; "Set the planned start
  of … to Oct 21"; "Replace the note on …"), the value read and the value proposed side by side (for a note the
  old and new text), the reason, and Approve / Reject.
* Decided: only the outcome, no old or new value drawn: "Approved: marked submitted" (`applied`),
  "Rejected", "Stale: the row changed", "Expired".
* The Inbox renders kind `assistant_proposal` the same way (open: values + Approve / Reject; decided: the
  outcome and a link back to the answer, `/workspace` with the conversation). Both places call only
  `rpc('workspace_proposal_decide', {p_id, p_decision})`; on success or on 55000 they refetch both the
  proposals query and the Inbox query, so the other place shows the decision.
* Status words come from `web/src/lib/progress-status.ts`; dates as the planner formats them; no colour
  outside the Phase 22 tokens (the token audit is a ratchet at 0).
