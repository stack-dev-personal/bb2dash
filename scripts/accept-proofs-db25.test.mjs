// bb2dash :: scripts/accept-proofs-db25.test.mjs
// Phase 25b's proofs (acceptance/25/proofs.json) against a real Postgres that lives in this process
// (PGlite, a dev dependency of scripts/). Nothing here reaches a network or the real database. Run,
// after `npm ci` in scripts/:
//   node --test scripts/accept-proofs-db25.test.mjs
//
// The tables are the ones the statements read, with the columns they name. Those of item E
// (workspace_proposals, attention_items.workspace_proposal_id) are the frozen contract's
// (docs/planning/sprint-2/briefs/119b_PHASE25B_contract.md, 203 and 205): the PM holds them to the
// migrations at integration. The views the proofs read stand in as tables or as plain views here:
// v_workspace_status (202), v_sync_status (137), v_inbox_queue (090, as 205 narrows it) and
// v_workspace_runner_proof (the catalog view the pack asks for; see acceptance/25/playbook.md).
//
// One case walks a whole run as its rows would stand, step by step, and holds every proof to it;
// the others break one thing each. Every row is synthetic.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { EXIT, run, validatePack } from './accept-proofs.mjs';
import { REPO, argvForPhase, clientOn, columnsOf } from './accept-proofs-kit.mjs';

const PACK_25 = JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', '25', 'proofs.json'), 'utf8'));

/** Tables the migrations already hold, with the columns these cases use (held against the migrations below). */
const KNOWN = {
  assignments: { id: 'text primary key', course_id: 'text not null' },
  assignment_progress: {
    assignment_id: 'text primary key',
    status: "text not null default 'not_started'",
    priority: "text not null default 'normal'",
    planned_start: 'date',
    planned_finish: 'date',
    notes: 'text',
    updated_at: 'timestamptz not null default now()',
  },
  reading_progress: { reading_id: 'bigint primary key', status: "text not null default 'not_started'", notes: 'text', updated_at: 'timestamptz not null default now()' },
  agent_requests: {
    id: 'bigint generated always as identity primary key',
    kind: 'text not null',
    state: 'text not null',
    created_at: 'timestamptz not null default now()',
    claimed_at: 'timestamptz',
    finished_at: 'timestamptz',
  },
  workspace_conversations: { id: 'uuid primary key default gen_random_uuid()', created_at: 'timestamptz not null default now()', archived: 'boolean not null default false' },
  workspace_messages: {
    id: 'uuid primary key default gen_random_uuid()',
    conversation_id: 'uuid',
    role: 'text not null',
    request_id: 'bigint',
    content: "text not null default ''",
    finished: 'boolean not null default false',
    error_code: 'text',
  },
  workspace_requests: {
    id: 'bigint generated always as identity primary key',
    created_at: 'timestamptz not null default now()',
    conversation_id: 'uuid not null',
    user_message_id: 'uuid not null',
    state: "text not null default 'queued'",
    claimed_at: 'timestamptz',
    claimed_by: 'text',
    finished_at: 'timestamptz',
    error_code: 'text',
  },
  attention_items: {
    id: 'bigint generated always as identity primary key',
    kind: 'text not null',
    course_id: 'text',
    entity: 'text',
    ref: 'text',
    field: 'text',
    state: "text not null default 'open'",
    resolution: 'jsonb',
    resolved_at: 'timestamptz',
  },
};

/** The contract's (119b): 203's table, and the column 205 adds to attention_items. */
const CONTRACT = {
  workspace_proposals: {
    id: 'bigint generated always as identity primary key',
    created_at: 'timestamptz not null default now()',
    expires_at: "timestamptz not null default now() + interval '7 days'",
    request_id: 'bigint not null',
    conversation_id: 'uuid not null',
    target: 'text not null',
    row_id: 'text not null',
    course_id: 'text',
    label: 'text not null',
    field: 'text not null',
    old_value: 'jsonb',
    new_value: 'jsonb not null',
    reason: 'text not null',
    state: "text not null default 'proposed'",
    decided_at: 'timestamptz',
  },
};

const STAND_INS = `
create table public.v_workspace_status (runners_alive integer, alive_runners text[], polled_age_seconds integer);
create table public.v_sync_status (id bigint, open_attention jsonb not null default '{}');
create table public.v_workspace_runner_proof (definer_functions integer, executes_propose boolean, relations_granted integer, relations_checked integer);
alter table public.attention_items add column workspace_proposal_id bigint;`;

/** 090's queue as 205 narrows it: a closed item that is not a proposal. */
const QUEUE_NARROWED = `create or replace view public.v_inbox_queue as
  select ai.id, ai.kind from public.attention_items ai where ai.state in ('resolved', 'dismissed') and ai.kind <> 'assistant_proposal';`;
/** The same queue had 205 left it alone. */
const QUEUE_AS_090 = `create or replace view public.v_inbox_queue as
  select ai.id, ai.kind from public.attention_items ai where ai.state in ('resolved', 'dismissed');`;

const ddlOf = ([table, columns]) => `create table public.${table} (${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(', ')});`;

let db;

before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec([...Object.entries(KNOWN), ...Object.entries(CONTRACT)].map(ddlOf).join('\n'));
  await db.exec(STAND_INS);
  await db.exec(QUEUE_NARROWED);
});

beforeEach(async () => {
  const tables = [...Object.keys(KNOWN), ...Object.keys(CONTRACT), 'v_workspace_status', 'v_sync_status', 'v_workspace_runner_proof'];
  await db.exec(`truncate ${tables.map((table) => `public.${table}`).join(', ')} restart identity;`);
  await db.exec(QUEUE_NARROWED);
});

after(async () => {
  await db?.close();
});

/* ---------------------------------------------------------------------------------------------
 * What the cases are made of
 * ------------------------------------------------------------------------------------------ */

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');
const spec = fs.readFileSync(path.join(REPO, 'web', 'e2e', 'accept25.spec.ts'), 'utf8');
const constant = (name) => new RegExp(`const ${name} = '([^']+)';`).exec(spec)[1];
const QUESTION_FIRST = constant('QUESTION_FIRST');
const QUESTION_SECOND = constant('QUESTION_SECOND');
/** The proposal question as `accept25.spec.ts` types it. */
const proposeQuestion = (id, word) => `${constant('PROPOSE_HEAD')}${id}${constant('PROPOSE_MIDDLE')}${word}${constant('PROPOSE_TAIL')}`;

const TARGET = 'IST.323/a1-old-lab';
const OTHER = 'IST.323/a2-later-lab';
const RUNNERS = ['workspace@workspace', 'workspace@workspace-2'];

/** Runs one proof of the working tree's Phase 25 pack against the in-process database. */
async function prove(name, params = {}) {
  const out = [];
  const err = [];
  const code = await run(argvForPhase('25', name, params), {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    readPack: () => PACK_25,
    clientFactory: async () => clientOn(db),
  });
  assert.equal(out.length, 1, 'one line is printed');
  const line = JSON.parse(out[0]);
  return { code, detail: line.detail, why: err.join('\n') };
}

async function passes(name, params) {
  const result = await prove(name, params);
  assert.equal(result.code, EXIT.pass, `${name} passes: ${JSON.stringify(result.detail)} ${result.why}`);
  return result;
}

async function fails(name, params) {
  const result = await prove(name, params);
  assert.equal(result.code, EXIT.fail, `${name} does not pass: ${JSON.stringify(result.detail)}`);
  return result;
}

const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
/** A time `minutes` after the run's start, which is 30 minutes before now: every row stands in the past. */
const at = async (minutes) => (await one(`select (now() - interval '30 minutes' + $1::numeric * interval '1 minute') as t`, [minutes])).t.toISOString();

/** The planner before the run: the run's row (graded, no note), a later one with a note, and a reading. */
async function seedPlanner() {
  await db.query("insert into public.assignments (id, course_id) values ($1, 'IST.323'), ($2, 'IST.323')", [TARGET, OTHER]);
  await db.query(
    `insert into public.assignment_progress (assignment_id, status, notes, updated_at) values
       ($1, 'graded', null, now() - interval '20 days'), ($2, 'in_progress', 'a synthetic note', now() - interval '2 days')`,
    [TARGET, OTHER],
  );
  await db.query("insert into public.reading_progress (reading_id, status, updated_at) values (7, 'planned', now() - interval '3 days')");
}

/** One question of the run, answered by a runner: its conversation (or the one given), its messages and its request. */
async function addRequest({ conversation = null, question, start, runner = RUNNERS[0], seconds = 30 }) {
  const conversationId = conversation ?? (await one('insert into public.workspace_conversations (created_at) values ($1::timestamptz) returning id', [start])).id;
  const user = (await one("insert into public.workspace_messages (conversation_id, role, content, finished) values ($1, 'user', $2, true) returning id", [conversationId, question])).id;
  const request = (await one(
    `insert into public.workspace_requests (created_at, conversation_id, user_message_id, state, claimed_at, claimed_by, finished_at)
     values ($1::timestamptz, $2, $3, 'done', $1::timestamptz + interval '1 second', $4, $1::timestamptz + $5::integer * interval '1 second') returning id`,
    [start, conversationId, user, runner, seconds],
  )).id;
  await db.query("insert into public.workspace_messages (conversation_id, role, request_id, content, finished) values ($1, 'assistant', $2, 'a synthetic reply', true)", [conversationId, request]);
  return { conversation: conversationId, request: Number(request) };
}

/** What 204 writes: the proposal and its open Inbox item. */
async function addProposal({ request, conversation, start, oldValue, newValue }) {
  const proposal = Number((await one(
    `insert into public.workspace_proposals (created_at, request_id, conversation_id, target, row_id, course_id, label, field, old_value, new_value, reason)
     values ($1::timestamptz + interval '20 seconds', $2, $3, 'assignment_progress', $4, 'IST.323', 'A1 old lab', 'notes', $5::jsonb, $6::jsonb, 'a synthetic reason') returning id`,
    [start, request, conversation, TARGET, oldValue === null ? null : JSON.stringify(oldValue), JSON.stringify(newValue)],
  )).id);
  await db.query(
    "insert into public.attention_items (kind, course_id, entity, ref, field, workspace_proposal_id) values ('assistant_proposal', 'IST.323', 'assignment_progress', $1, 'notes', $2)",
    [`workspace_proposal/${proposal}`, proposal],
  );
  return proposal;
}

/** What 206 does with a decision: the state, decided_at, the Inbox item resolved; an approval that writes, the row's note too. */
async function decide(proposal, state, when, write = null) {
  await db.query('update public.workspace_proposals set state = $2, decided_at = $3::timestamptz where id = $1', [proposal, state, when]);
  await db.query(
    "update public.attention_items set state = 'resolved', resolved_at = $2::timestamptz, resolution = jsonb_build_object('outcome', $3::text, 'proposal_id', $1::bigint) where workspace_proposal_id = $1",
    [proposal, when, state],
  );
  if (write !== null) await setNote(write, when);
}

/** A write of the run's row's note, at a time: by 206's approval, by the planner's own field, or the restore. */
async function setNote(value, when) {
  await db.query('update public.assignment_progress set notes = $2, updated_at = $3::timestamptz where assignment_id = $1', [TARGET, value, when]);
}

const NOTE_ONE = 'Acceptance run 25 proposal one';
const NOTE_TWO = 'Acceptance run 25 proposal two';
const NOTE_THREE = 'Acceptance run 25 proposal three';
const PLANNER_EDIT = 'Acceptance run 25 edit made in the planner';

/**
 * A whole run, as its rows stand at each step's proof. `upTo` stops it after a step, so a case can
 * read a proof at the moment the host reads it; `change` breaks one thing.
 */
async function walkRun(change = {}) {
  await seedPlanner();
  await db.query("insert into public.v_workspace_status values (2, $1::text[], 4)", [RUNNERS]);
  await db.query("insert into public.v_sync_status values (1, '{\"data_gap\": 2}')");
  await db.query('insert into public.v_workspace_runner_proof values (14, true, 0, 180)');
  const since = await at(0);
  const goLive = (await passes('target-before', {})).detail;

  const first = await addRequest({ question: QUESTION_FIRST, start: await at(1), runner: RUNNERS[0], seconds: 30 });
  const second = await addRequest({ question: QUESTION_SECOND, start: await at(1), runner: change.oneRunner ? RUNNERS[0] : RUNNERS[1], seconds: 25 });

  const a = await addRequest({ question: proposeQuestion(TARGET, 'one'), start: await at(3) });
  const proposalA = await addProposal({ request: a.request, conversation: a.conversation, start: await at(3), oldValue: null, newValue: NOTE_ONE });
  await decide(proposalA, 'applied', await at(4), NOTE_ONE);
  const b = await addRequest({ conversation: a.conversation, question: proposeQuestion(TARGET, 'two'), start: await at(5) });
  const proposalB = await addProposal({ request: b.request, conversation: a.conversation, start: await at(5), oldValue: NOTE_ONE, newValue: NOTE_TWO });
  await decide(proposalB, 'rejected', await at(6));
  const afterDecide = {
    made: [
      { proposal: proposalA, request: a.request, which: 'one' },
      { proposal: proposalB, request: b.request, which: 'two' },
    ],
  };
  if (change.upTo === 'decide') return { since, goLive, first, second, proposalA, proposalB, ...afterDecide };

  const c = await addRequest({ conversation: a.conversation, question: proposeQuestion(TARGET, 'three'), start: await at(8) });
  const proposalC = await addProposal({ request: c.request, conversation: a.conversation, start: await at(8), oldValue: NOTE_ONE, newValue: NOTE_THREE });
  await setNote(PLANNER_EDIT, await at(9));
  await decide(proposalC, 'stale', await at(10));
  await db.query('update public.workspace_conversations set archived = true');
  if (change.upTo === 'stale') return { since, goLive, first, second, proposalA, proposalB, proposalC, c };

  await setNote(change.restoreTo ?? null, await at(12));
  return { since, goLive, first, second, proposalA, proposalB, proposalC, c };
}

/* ---------------------------------------------------------------------------------------------
 * The pack and its tables
 * ------------------------------------------------------------------------------------------ */

test('every known table and column these cases are made of is in the migrations', () => {
  for (const [table, columns] of Object.entries(KNOWN)) {
    for (const column of Object.keys(columns)) assert.ok(columnsOf(table).has(column), `${table}.${column}`);
  }
});

test('pack 25 holds its thirteen proofs, every statement is one plain read, and the proposal question is the spec\'s', () => {
  assert.equal(Object.keys(PACK_25).length, 13);
  assert.doesNotThrow(() => validatePack(PACK_25));
  for (const name of ['proposal-made']) {
    for (const part of ['PROPOSE_HEAD', 'PROPOSE_MIDDLE', 'PROPOSE_TAIL']) assert.ok(PACK_25[name].sql.includes(constant(part).replace(/'/g, "''")), `${name} rebuilds ${part}`);
  }
});

/* ---------------------------------------------------------------------------------------------
 * A whole run
 * ------------------------------------------------------------------------------------------ */

test('a whole run: every proof passes where the host reads it, and the planner reads as it was found', async () => {
  const run1 = await walkRun({ upTo: 'decide' });
  const { goLive, since } = run1;
  assert.equal(goLive.candidates, 1);
  await passes('planner-fingerprint', {});
  await passes('runners-alive', {});
  await passes('two-at-once', { first: run1.first.request, second: run1.second.request, since, first_md5: md5(QUESTION_FIRST), second_md5: md5(QUESTION_SECOND) });
  for (const made of run1.made) await passes('proposal-made', { proposal: made.proposal, request: made.request, since, target: goLive.target_md5, which: made.which });
  await passes('proposal-applied', { proposal: run1.proposalA, since, target: goLive.target_md5, rest: goLive.rest_md5 });
  await passes('proposal-rejected', { proposal: run1.proposalB, first: run1.proposalA, since });
  await passes('decisions-held', { first: run1.proposalA, second: run1.proposalB, since });

  // The stale stage, then the restore: carried on from the same rows.
  const c = await addRequest({ conversation: (await one('select conversation_id from public.workspace_proposals where id = $1', [run1.proposalA])).conversation_id, question: proposeQuestion(TARGET, 'three'), start: await at(8) });
  const proposalC = await addProposal({ request: c.request, conversation: (await one('select conversation_id from public.workspace_proposals where id = $1', [run1.proposalA])).conversation_id, start: await at(8), oldValue: NOTE_ONE, newValue: NOTE_THREE });
  await setNote(PLANNER_EDIT, await at(9));
  await decide(proposalC, 'stale', await at(10));
  await db.query('update public.workspace_conversations set archived = true');
  await passes('proposal-made', { proposal: proposalC, request: c.request, since, target: goLive.target_md5, which: 'three' });
  await passes('proposal-stale', { proposal: proposalC, first: run1.proposalA, since });
  await passes('conversations-unarchived', { since, min_conversations: 3 });
  // Before the restore the planner is not as it was.
  await fails('planner-restored', { before: goLive.fingerprint, target: goLive.target_md5, row: goLive.row_md5 });

  await setNote(null, await at(12));
  const restored = await passes('planner-restored', { before: goLive.fingerprint, target: goLive.target_md5, row: goLive.row_md5 });
  assert.equal(restored.detail.row_restored, true);
  await passes('proposals-not-queued', { first: run1.proposalA, second: run1.proposalB, third: proposalC, since });
  await passes('runner-grants', {});
});

/* ---------------------------------------------------------------------------------------------
 * One thing broken at a time
 * ------------------------------------------------------------------------------------------ */

test('target-before: no graded row without a note fails; the fingerprint has planner-fingerprint\'s shape', async () => {
  await seedPlanner();
  const reading = await passes('target-before', {});
  assert.match(reading.detail.fingerprint, /^ap=[^,]+,rp=[^,]+,n=2,apn=2,rpn=1,at=/);
  assert.equal(reading.detail.target_md5, md5(TARGET));
  await setNote('now it has one', await at(1));
  await fails('target-before', {});
});

test('runners-alive: one runner, or a third name, fails', async () => {
  await db.query("insert into public.v_workspace_status values (1, '{workspace@workspace}', 4)");
  await fails('runners-alive', {});
  await db.query('truncate public.v_workspace_status');
  await db.query("insert into public.v_workspace_status values (2, '{workspace@workspace,workspace@test-1}', 4)");
  await fails('runners-alive', {});
});

test('two-at-once: one runner for both, claims that do not overlap, or another question fails', async () => {
  const run1 = await walkRun({ upTo: 'decide', oneRunner: true });
  const params = { first: run1.first.request, second: run1.second.request, since: run1.since, first_md5: md5(QUESTION_FIRST), second_md5: md5(QUESTION_SECOND) };
  const result = await fails('two-at-once', params);
  assert.equal(result.detail.two_runners, false);
  await db.query('update public.workspace_requests set claimed_by = $2 where id = $1', [run1.second.request, RUNNERS[1]]);
  await passes('two-at-once', params);
  // The second is taken only once the first has finished: one after the other, not at once.
  await db.query(
    `update public.workspace_requests r
        set claimed_at = f.finished_at + interval '1 second', finished_at = f.finished_at + interval '40 seconds'
       from public.workspace_requests f
      where r.id = $1 and f.id = $2`,
    [run1.second.request, run1.first.request],
  );
  assert.equal((await fails('two-at-once', params)).detail.claims_overlap, false);
  await fails('two-at-once', { ...params, second_md5: md5('another question') });
});

test('proposal-made: another row, another word, a second proposal in the request or no Inbox item fails', async () => {
  const run1 = await walkRun({ upTo: 'decide' });
  const [made] = run1.made;
  const params = { proposal: made.proposal, request: made.request, since: run1.since, target: run1.goLive.target_md5, which: made.which };
  await passes('proposal-made', params);
  await fails('proposal-made', { ...params, target: md5(OTHER) });
  await fails('proposal-made', { ...params, which: 'two' });
  await fails('proposal-made', { ...params, request: run1.made[1].request });
  await db.query('delete from public.attention_items where workspace_proposal_id = $1', [made.proposal]);
  await fails('proposal-made', params);
});

test('proposal-applied: a later write of the row, another column moved, or an Inbox item that says otherwise fails', async () => {
  const run1 = await walkRun({ upTo: 'decide' });
  const params = { proposal: run1.proposalA, since: run1.since, target: run1.goLive.target_md5, rest: run1.goLive.rest_md5 };
  await passes('proposal-applied', params);
  await db.query("update public.attention_items set resolution = jsonb_set(resolution, '{outcome}', '\"rejected\"') where workspace_proposal_id = $1", [run1.proposalA]);
  await fails('proposal-applied', params);
  await db.query("update public.attention_items set resolution = jsonb_set(resolution, '{outcome}', '\"applied\"') where workspace_proposal_id = $1", [run1.proposalA]);
  await db.query("update public.assignment_progress set priority = 'high' where assignment_id = $1", [TARGET]);
  await fails('proposal-applied', params);
  await db.query("update public.assignment_progress set priority = 'normal', updated_at = updated_at + interval '1 minute' where assignment_id = $1", [TARGET]);
  await fails('proposal-applied', params);
});

test('proposal-rejected and decisions-held: a rejection that wrote, or a second decision that went through, fails', async () => {
  const run1 = await walkRun({ upTo: 'decide' });
  await passes('proposal-rejected', { proposal: run1.proposalB, first: run1.proposalA, since: run1.since });
  await passes('decisions-held', { first: run1.proposalA, second: run1.proposalB, since: run1.since });
  await setNote(NOTE_TWO, await at(6));
  await fails('proposal-rejected', { proposal: run1.proposalB, first: run1.proposalA, since: run1.since });
  await fails('decisions-held', { first: run1.proposalA, second: run1.proposalB, since: run1.since });
  await setNote(NOTE_ONE, await at(4));
  await db.query("update public.workspace_proposals set state = 'applied' where id = $1", [run1.proposalB]);
  await fails('decisions-held', { first: run1.proposalA, second: run1.proposalB, since: run1.since });
});

test('proposal-stale: an approval that wrote after all fails', async () => {
  const run1 = await walkRun({ upTo: 'stale' });
  const params = { proposal: run1.proposalC, first: run1.proposalA, since: run1.since };
  await passes('proposal-stale', params);
  await setNote(NOTE_THREE, await at(10));
  await fails('proposal-stale', params);
});

test('planner-restored: a note left behind fails, another row changed fails, and a sync in the window makes it blocked', async () => {
  const left = await walkRun({ restoreTo: PLANNER_EDIT });
  const params = { before: left.goLive.fingerprint, target: left.goLive.target_md5, row: left.goLive.row_md5 };
  assert.equal((await fails('planner-restored', params)).detail.row_restored, false);
  await setNote(null, await at(12));
  await passes('planner-restored', params);
  await db.query("update public.assignment_progress set updated_at = now() where assignment_id = $1", [OTHER]);
  await fails('planner-restored', params);
  await db.query("insert into public.agent_requests (kind, state, created_at) values ('sync', 'done', now())");
  assert.equal((await prove('planner-restored', params)).code, EXIT.blocked);
});

test('proposals-not-queued: a queue that still lists the kind fails', async () => {
  const run1 = await walkRun();
  const params = { first: run1.proposalA, second: run1.proposalB, third: run1.proposalC, since: run1.since };
  await passes('proposals-not-queued', params);
  await db.exec(QUEUE_AS_090);
  assert.equal((await fails('proposals-not-queued', params)).detail.run_items_in_queue, 3);
});

test('runner-grants: a fifteenth function, a missing propose or one table grant fails', async () => {
  for (const row of ['(15, true, 0, 180)', '(14, false, 0, 180)', '(14, true, 1, 180)']) {
    await db.exec(`truncate public.v_workspace_runner_proof; insert into public.v_workspace_runner_proof values ${row};`);
    await fails('runner-grants', {});
  }
});
