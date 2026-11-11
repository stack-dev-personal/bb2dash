// bb2dash :: scripts/accept-proofs-db24.test.mjs
// Phase 24a's twenty proofs (acceptance/24/proofs.json) against a real Postgres that lives in this
// process (PGlite, a dev dependency of scripts/). Nothing here reaches a network or the real
// database. Run, after `npm ci` in scripts/:
//   node --test scripts/accept-proofs-db24.test.mjs
//
// The tables are the ones the statements read, with the columns they name and no others, held
// against the migrations. v_workspace_index_status is migration 197's own text, cut out of the file
// and run here: a proof is held to the view as built. The two vector columns are plain arrays here
// (PGlite has no pgvector in this test), which is all `embedding is null` needs; the type itself is
// the extension's. The four catalog proofs (1, 2, 3, 7) read v_workspace_store_proof, a stand-in table here.
//
// Every row is synthetic. Pack 24's cases make their own rows and share nothing with the other packs'.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { EXIT, run, validatePack } from './accept-proofs.mjs';
import { PACK_24, REPO, argvForPhase, clientOn, columnsOf } from './accept-proofs-kit.mjs';

/** table -> its columns here. The names are the migrations'; the types are the plain ones a statement needs. */
const TABLES = {
  workspace_conversations: {
    id: 'uuid primary key default gen_random_uuid()',
    created_at: 'timestamptz not null default now()',
    claude_session_id: 'text',
    archived: 'boolean not null default false',
  },
  workspace_messages: {
    id: 'uuid primary key default gen_random_uuid()',
    conversation_id: 'uuid',
    role: 'text not null',
    request_id: 'bigint',
    tier: 'text',
    provider: 'text',
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
    finished_at: 'timestamptz',
    error_code: 'text',
  },
  workspace_turns: {
    request_id: 'bigint primary key',
    depth: "text not null default 'auto'",
    tier: 'text not null',
    plan_state: 'text not null',
    retrieval_state: 'text not null',
    found_n: 'integer not null default 0',
    passages_n: 'integer not null default 0',
    memory_n: 'integer not null default 0',
    feed_rows: 'integer not null default 0',
    plan_ms: 'integer',
    retrieval_ms: 'integer',
  },
  workspace_sources: {
    request_id: 'bigint not null',
    ord: 'smallint not null',
    kind: 'text not null',
    origin: 'text not null',
    document_id: 'bigint',
  },
  workspace_documents: {
    id: 'bigint generated always as identity primary key',
    kind: 'text not null',
    state: "text not null default 'stored'",
    sha256: 'text',
    error_code: 'text',
    attempts: 'integer not null default 0',
    signed_url_expires_at: 'timestamptz',
    conversation_id: 'uuid',
    created_at: 'timestamptz not null default now()',
  },
  // Phase 24b's proofs (the page): the options and attachments of a request (194) and a conversation's memory state (195).
  workspace_request_options: {
    request_id: 'bigint primary key',
    course_display_id: 'text',
    depth: "text not null default 'auto'",
    routine_id: 'text',
    format: "text not null default 'plain'",
  },
  workspace_request_attachments: { request_id: 'bigint not null', ord: 'smallint not null', kind: 'text not null', document_id: 'bigint' },
  workspace_conversation_state: { conversation_id: 'uuid primary key', memory_opt_out: 'boolean not null default false', memory_written_at: 'timestamptz' },
  workspace_document_text: { id: 'bigint generated always as identity primary key', document_id: 'bigint not null' },
  workspace_text_embeddings: { text_id: 'bigint not null', embedding: 'real[]' },
  workspace_ingest_heartbeat: { id: 'smallint primary key', polled_at: 'timestamptz', runner: 'text' },
  bb_file_text: { id: 'bigint primary key' },
  bb_text_embeddings: { text_id: 'bigint not null', embedding: 'real[]' },
  bb_files: { id: 'bigint primary key', text_status: 'text' },
};
/** The course embedding view (010) stands in as a table with the columns migration 197 sums. */
const EMBEDDING_STATUS = { units_embedded: 'bigint', text_units: 'bigint', last_embedded: 'timestamptz' };

const ddlOf = ([table, columns]) => `create table public.${table} (${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(', ')});`;

/** The text of a migration between two marks, cut out to run here. A migration that moved a mark fails loudly. */
function cutOut(file, pattern) {
  const found = pattern.exec(fs.readFileSync(path.join(REPO, 'db', 'migrations', file), 'utf8'));
  assert.ok(found, `${file} holds the text this test runs`);
  return found[0];
}

const VIEW_STATUS = cutOut('197_workspace_index_status.sql', /create view public\.v_workspace_index_status[\s\S]*?\) h;/);
const STATUS_COLUMNS = [
  'course_units_indexed', 'course_units_waiting', 'course_last_embedded', 'course_files_text_pending', 'uploads_indexed', 'uploads_waiting',
  'uploads_failed', 'upload_links_expired', 'uploads_deleting', 'memory_indexed', 'memory_waiting', 'memory_failed', 'ingest_polled_age_seconds',
];

/** The columns of migration 199's v_workspace_store_proof, in order (the unit's section 5 holds the same string). */
const STORE_PROOF_COLUMNS = [
  'extension_version', 'extension_schema', 'extension_ok', 'vector_columns', 'vector_columns_ok', 'vector_indexes', 'vector_indexes_ok',
  'foreign_servers', 'foreign_tables', 'link_extensions', 'store_functions_that_call_out', 'no_links_ok',
];
/**
 * A STAND-IN, a table with the view's columns and one row the case sets. The view itself reads pg_*
 * and the type extensions.vector, which an in-process Postgres without pgvector cannot run: its
 * answers are the unit's (db/tests/phase24_199_review_round.sql, section 5), so this file holds the
 * proofs' statements to the columns and to what each says, not the catalog.
 */
const STORE_PROOF_STAND_IN = `create table public.v_workspace_store_proof (
  extension_version text, extension_schema text, extension_ok boolean, vector_columns text, vector_columns_ok boolean,
  vector_indexes text, vector_indexes_ok boolean, foreign_servers integer, foreign_tables integer, link_extensions integer,
  store_functions_that_call_out integer, no_links_ok boolean);`;

let db;

before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(Object.entries(TABLES).map(ddlOf).join('\n'));
  await db.exec(`create table public.v_embedding_status (${Object.entries(EMBEDDING_STATUS).map(([name, type]) => `${name} ${type}`).join(', ')});`);
  await db.exec(VIEW_STATUS);
  await db.exec(STORE_PROOF_STAND_IN);
});

beforeEach(async () => {
  await db.exec(`truncate ${Object.keys(TABLES).map((table) => `public.${table}`).join(', ')}, public.v_embedding_status restart identity;`);
});

after(async () => {
  await db?.close();
});

/* ---------------------------------------------------------------------------------------------
 * What the cases are made of
 * ------------------------------------------------------------------------------------------ */

const SINCE = '2026-10-09T14:00:00.000Z';
const IN_RUN = '2026-10-09T14:05:00Z';
const BEFORE_RUN = '2026-10-09T13:50:00Z';
const QUESTION = 'a synthetic question';
const OTHER_QUESTION = 'another synthetic question';
const NONCE = '3f2b8c1e-5d4a-4f6b-9a7c-0e1d2c3b4a59';
const OTHER_NONCE = '9b1d7e22-0c3a-4d58-8e6f-1a2b3c4d5e6f';
const COURSE_TEXT = /syllabus|lecture|midterm/;

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');
const FILE_PREFIX = /export const FILE_PREFIX = '([^']+)';/.exec(fs.readFileSync(path.join(REPO, 'web', 'e2e', 'accept24.lib.ts'), 'utf8'))[1];
/** The hash the browser tests make of the run's file: the fixed words and the nonce. */
const hashOf = (nonce) => createHash('sha256').update(`${FILE_PREFIX}${nonce}`, 'utf8').digest('hex');

/** Runs one proof of the working tree's Phase 24 pack against the in-process database: its exit code and its one line. */
async function prove(name, params = {}) {
  const out = [];
  const err = [];
  const code = await run(argvForPhase('24', name, params), {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    readPack: () => PACK_24,
    clientFactory: async () => clientOn(db),
  });
  assert.equal(out.length, 1, 'one line is printed');
  assert.doesNotMatch(out[0], COURSE_TEXT);
  const line = JSON.parse(out[0]);
  return { code, line, detail: line.detail, why: err.join('\n') };
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

/**
 * One answered request with the rows a turn leaves: a conversation (or the one given), the question,
 * the request, the answer, the turn row and the sources. The defaults are a lookup that found a
 * passage of a course file, answered in this run; each override is the case's.
 */
async function addTurn({
  conversation = null, question = QUESTION, createdAt = IN_RUN, state = 'done', errorCode = null, claimed = true,
  answer = {}, turn = {}, sources = [{ kind: 'material', origin: 'auto' }], session = null,
} = {}) {
  const conversationId = conversation ?? (await one("insert into public.workspace_conversations (created_at, claude_session_id) values ($1::timestamptz, $2) returning id", [createdAt, session])).id;
  const userMessage = (await one("insert into public.workspace_messages (conversation_id, role, content, finished) values ($1, 'user', $2, true) returning id", [conversationId, question])).id;
  const request = await one(
    `insert into public.workspace_requests (created_at, conversation_id, user_message_id, state, claimed_at, finished_at, error_code)
     values ($1::timestamptz, $2, $3, $4, case when $5::boolean then $1::timestamptz + interval '5 seconds' end, $1::timestamptz + interval '30 seconds', $6) returning id`,
    [createdAt, conversationId, userMessage, state, claimed, errorCode],
  );
  const a = { tier: 'low', provider: 'claude-cli', finished: true, errorCode: null, ...answer };
  await db.query(
    "insert into public.workspace_messages (conversation_id, role, request_id, tier, provider, finished, error_code) values ($1, 'assistant', $2, $3, $4, $5, $6)",
    [conversationId, request.id, a.tier, a.provider, a.finished, a.errorCode],
  );
  const t = { tier: 'low', planState: 'skipped', retrievalState: 'found', foundN: 3, passagesN: 3, memoryN: 0, feedRows: 40, planMs: null, ...turn };
  if (turn.none !== true) {
    await db.query(
      `insert into public.workspace_turns (request_id, tier, plan_state, retrieval_state, found_n, passages_n, memory_n, feed_rows, plan_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [request.id, t.tier, t.planState, t.retrievalState, t.foundN, t.passagesN, t.memoryN, t.feedRows, t.planMs],
    );
  }
  for (const [index, source] of sources.entries()) {
    await db.query('insert into public.workspace_sources (request_id, ord, kind, origin, document_id) values ($1, $2, $3, $4, $5)', [request.id, index + 1, source.kind, source.origin, source.document ?? null]);
  }
  return { conversation: conversationId, request: request.id };
}

const asked = (turn, more = {}) => ({ request: turn.request, since: SINCE, question_md5: md5(QUESTION), ...more });

async function addDocument({ nonce = NONCE, state = 'indexed', kind = 'upload', createdAt = IN_RUN, sha = null } = {}) {
  return (await one('insert into public.workspace_documents (kind, state, sha256, created_at) values ($1, $2, $3, $4::timestamptz) returning id', [kind, state, sha ?? hashOf(nonce), createdAt])).id;
}

/* ---------------------------------------------------------------------------------------------
 * The pack, its tables and its view
 * ------------------------------------------------------------------------------------------ */

test('every table and column these cases are made of is in the migrations, and the view the proofs read has the columns they name', () => {
  for (const [table, columns] of Object.entries(TABLES)) {
    for (const column of Object.keys(columns)) assert.ok(columnsOf(table).has(column), `${table}.${column}`);
  }
  assert.deepEqual([...columnsOf('v_workspace_index_status')], STATUS_COLUMNS);
});

test('pack 24 holds the twenty-five proofs (24a\'s twenty and 24b\'s five), every statement is one plain read, and every proof is declared with typed parameters', () => {
  assert.equal(Object.keys(PACK_24).length, 25);
  assert.doesNotThrow(() => validatePack(PACK_24));
  for (const [name, proof] of Object.entries(PACK_24)) {
    assert.ok(proof.sql.startsWith('select') || proof.sql.startsWith('with'), name);
    assert.ok(proof.expect.length > 80, `${name} says in words what the row must show`);
  }
});

/* ---------------------------------------------------------------------------------------------
 * Steps 3 to 8: a turn
 * ------------------------------------------------------------------------------------------ */

test('turn-found: a done request of this run, its question, a found retrieval and an auto source of a course file passes; each missing piece fails', async () => {
  const good = await addTurn();
  const result = await passes('turn-found', asked(good));
  assert.equal(result.detail.retrieval_state, 'found');
  assert.equal(result.detail.auto_materials, 1);
  assert.ok(!('content' in result.detail));

  await fails('turn-found', { ...asked(good), question_md5: md5(OTHER_QUESTION) });
  await fails('turn-found', { ...asked(good), since: '2026-10-09T15:00:00.000Z' });
  await fails('turn-found', asked(await addTurn({ createdAt: BEFORE_RUN })));
  await fails('turn-found', asked(await addTurn({ turn: { retrievalState: 'empty', foundN: 0, passagesN: 0 }, sources: [] })));
  await fails('turn-found', asked(await addTurn({ sources: [{ kind: 'material', origin: 'tool' }] })));
  await fails('turn-found', asked(await addTurn({ sources: [{ kind: 'feed', origin: 'auto' }] })));
  await fails('turn-found', asked(await addTurn({ turn: { none: true } })));
  await fails('turn-found', asked(await addTurn({ state: 'failed', errorCode: 'timeout' })));
  await fails('turn-found', asked(await addTurn({ answer: { finished: false } })));
  await fails('turn-found', asked(await addTurn({ answer: { provider: 'ollama' } })));
  // The request after the one before it: one request cannot stand for two steps.
  await passes('turn-found', { ...asked(good), after: good.request - 1 });
  await fails('turn-found', { ...asked(good), after: good.request });
});

test('turn-lookup: plan skipped on the low tier passes; a planned turn or another tier fails', async () => {
  await passes('turn-lookup', asked(await addTurn()));
  await fails('turn-lookup', asked(await addTurn({ turn: { planState: 'planned', planMs: 900 } })));
  await fails('turn-lookup', asked(await addTurn({ turn: { tier: 'mid' }, answer: { tier: 'mid' } })));
  await fails('turn-lookup', asked(await addTurn({ answer: { tier: 'mid' } })));
});

test('turn-planned: the middle or high tier with a planned or fallback plan and a plan time passes; no plan time, a skipped plan or the low tier fails', async () => {
  const mid = { turn: { tier: 'mid', planState: 'planned', planMs: 1470 }, answer: { tier: 'mid' } };
  await passes('turn-planned', asked(await addTurn(mid)));
  await passes('turn-planned', asked(await addTurn({ turn: { tier: 'high', planState: 'fallback', planMs: 10000 }, answer: { tier: 'high' } })));
  await fails('turn-planned', asked(await addTurn({ ...mid, turn: { ...mid.turn, planMs: null } })));
  await fails('turn-planned', asked(await addTurn({ ...mid, turn: { ...mid.turn, planState: 'skipped' } })));
  await fails('turn-planned', asked(await addTurn()));
  await fails('turn-planned', asked(await addTurn({ ...mid, answer: { tier: 'low' } })));
});

test('turn-feed: the feed rows were counted and exactly one source is of kind feed passes; none or two fails', async () => {
  await passes('turn-feed', asked(await addTurn({ sources: [{ kind: 'feed', origin: 'auto' }] })));
  await fails('turn-feed', asked(await addTurn({ sources: [{ kind: 'material', origin: 'auto' }] })));
  await fails('turn-feed', asked(await addTurn({ sources: [{ kind: 'feed', origin: 'auto' }], turn: { feedRows: 0 } })));
  await fails('turn-feed', asked(await addTurn({ sources: [{ kind: 'feed', origin: 'auto' }, { kind: 'feed', origin: 'auto' }] })));
});

test('turn-followup: a later request of the first one\'s conversation, done, in a conversation with no session id passes; a session id, another conversation or an earlier request fails', async () => {
  const first = await addTurn({ question: OTHER_QUESTION });
  const follow = await addTurn({ conversation: first.conversation });
  const params = { request: follow.request, since: SINCE, question_md5: md5(QUESTION), first_request: first.request };
  const result = await passes('turn-followup', params);
  assert.equal(result.detail.session_id_is_null, true);
  await fails('turn-followup', { ...params, first_request: follow.request });
  await fails('turn-followup', { ...params, first_request: (await addTurn({ question: OTHER_QUESTION })).request });
  await db.query('update public.workspace_conversations set claude_session_id = $1 where id = $2', ['0b8f0f3e-6c3c-4d3f-8f1e-5a1b2c3d4e5f', first.conversation]);
  await fails('turn-followup', params);
});

test('turn-empty: an empty retrieval with no passage, no remembered item and no content source passes (a feed row may stand); any hit fails', async () => {
  const empty = { turn: { retrievalState: 'empty', foundN: 0, passagesN: 0 } };
  await passes('turn-empty', asked(await addTurn({ ...empty, sources: [{ kind: 'feed', origin: 'auto' }] })));
  await passes('turn-empty', asked(await addTurn({ ...empty, sources: [] })));
  await fails('turn-empty', asked(await addTurn({ ...empty, sources: [{ kind: 'upload', origin: 'auto' }] })));
  await fails('turn-empty', asked(await addTurn({ turn: { ...empty.turn, memoryN: 1 }, sources: [] })));
  await fails('turn-empty', asked(await addTurn()));
});

/* ---------------------------------------------------------------------------------------------
 * Step 9: a Stop, and the answer after it
 * ------------------------------------------------------------------------------------------ */

const STOPPED = { state: 'cancelled', errorCode: 'cancelled', answer: { errorCode: 'cancelled' } };

test('turn-stopped: cancelled with the code, taken by the runner, with a stored turn row and an answer that ended cancelled passes; a question cancelled while it waited does not', async () => {
  await passes('turn-stopped', asked(await addTurn({ ...STOPPED, sources: [] })));
  await fails('turn-stopped', asked(await addTurn({ ...STOPPED, claimed: false, sources: [] })));
  await fails('turn-stopped', asked(await addTurn({ ...STOPPED, turn: { none: true }, sources: [] })));
  await fails('turn-stopped', asked(await addTurn({ ...STOPPED, answer: { errorCode: null }, sources: [] })));
  await fails('turn-stopped', asked(await addTurn()));
});

test('turn-done-after-stop: a done answer after a cancelled request of its conversation passes; another conversation, an earlier request or a stop that did not end cancelled fails', async () => {
  const stopped = await addTurn({ ...STOPPED, question: OTHER_QUESTION, sources: [] });
  const next = await addTurn({ conversation: stopped.conversation });
  const params = { request: next.request, since: SINCE, question_md5: md5(QUESTION), stopped: stopped.request };
  await passes('turn-done-after-stop', params);
  await fails('turn-done-after-stop', { ...params, stopped: (await addTurn({ ...STOPPED, question: OTHER_QUESTION, sources: [] })).request });
  await fails('turn-done-after-stop', { ...params, stopped: next.request });
  await fails('turn-done-after-stop', { ...params, stopped: (await addTurn({ conversation: stopped.conversation, question: OTHER_QUESTION })).request });
});

/* ---------------------------------------------------------------------------------------------
 * The file: found, indexed, sent twice, deleted
 * ------------------------------------------------------------------------------------------ */

test('turn-upload-found: an answer whose sources name the run\'s indexed upload passes; another document, a document not indexed or a source of another kind fails', async () => {
  const document = await addDocument();
  const other = await addDocument({ nonce: OTHER_NONCE });
  const params = (turn) => asked(turn, { document });
  await passes('turn-upload-found', params(await addTurn({ sources: [{ kind: 'upload', origin: 'auto', document }] })));
  await fails('turn-upload-found', params(await addTurn({ sources: [{ kind: 'upload', origin: 'auto', document: other }] })));
  await fails('turn-upload-found', params(await addTurn({ sources: [{ kind: 'material', origin: 'auto', document }] })));
  await fails('turn-upload-found', params(await addTurn({ sources: [{ kind: 'upload', origin: 'tool', document }] })));
  const waiting = await addDocument({ nonce: '11111111-2222-4333-8444-555555555555', state: 'text_ready' });
  await fails('turn-upload-found', asked(await addTurn({ sources: [{ kind: 'upload', origin: 'auto', document: waiting }] }), { document: waiting }));
});

test('upload-indexed: one upload row with the hash made from the nonce, the document noted, in state indexed and made in this run passes; each other case fails', async () => {
  const document = await addDocument();
  const params = { nonce: NONCE, since: SINCE, document };
  const result = await passes('upload-indexed', params);
  assert.equal(result.detail.sha256, hashOf(NONCE));
  assert.equal(result.detail.rows_holding_it, 1);
  // Another run's nonce makes another hash: no row holds it.
  await fails('upload-indexed', { ...params, nonce: OTHER_NONCE });
  await fails('upload-indexed', { ...params, document: document + 1 });
  await fails('upload-indexed', { ...params, since: '2026-10-09T15:00:00.000Z' });
  await db.query("update public.workspace_documents set state = 'text_ready'");
  const waiting = await fails('upload-indexed', params);
  assert.equal(waiting.detail.document_state, 'text_ready');
  await db.query("update public.workspace_documents set state = 'failed', error_code = 'embed_failed'");
  assert.equal((await fails('upload-indexed', params)).detail.document_error_code, 'embed_failed');
});

test('upload-indexed: a row from a run before this one with the same hash cannot pass for this run, and a memory item of that hash is not an upload', async () => {
  const document = await addDocument({ createdAt: BEFORE_RUN });
  const result = await fails('upload-indexed', { nonce: NONCE, since: SINCE, document });
  assert.equal(result.detail.made_in_this_run, false);
  await db.query('delete from public.workspace_documents');
  const memory = await addDocument({ kind: 'memory' });
  await fails('upload-indexed', { nonce: NONCE, since: SINCE, document: memory });
});

test('upload-one-row: one row holds the hash and it is the first send\'s document passes; none, or a document other than the noted one, fails', async () => {
  const document = await addDocument();
  const params = { nonce: NONCE, document, since: SINCE };
  await passes('upload-one-row', params);
  await fails('upload-one-row', { ...params, document: document + 1 });
  await fails('upload-one-row', { ...params, nonce: OTHER_NONCE });
  await fails('upload-one-row', { ...params, since: '2026-10-09T15:00:00.000Z' });
  // The unique index of the real table keeps a second upload row out; a second row of any hash is another file's.
  await addDocument({ nonce: OTHER_NONCE });
  await passes('upload-one-row', params);
});

test('upload-gone: no row holds the hash and none has the id passes; a row left in deleting, or any row of the hash, fails; other uploads in deleting are only reported', async () => {
  const document = await addDocument({ state: 'deleting' });
  const params = { nonce: NONCE, document };
  const left = await fails('upload-gone', params);
  assert.equal(left.detail.rows_holding_it, 1);
  assert.equal(left.detail.uploads_deleting_now, 1);
  await db.query('delete from public.workspace_documents');
  await passes('upload-gone', params);
  // A row of another, stopped run that is still deleting is not this run's: it is counted and does not fail the proof.
  await addDocument({ nonce: OTHER_NONCE, state: 'deleting' });
  const other = await passes('upload-gone', params);
  assert.equal(other.detail.uploads_deleting_now, 1);
});

/* ---------------------------------------------------------------------------------------------
 * The conversations
 * ------------------------------------------------------------------------------------------ */

test('conversations-unarchived: at least the expected number made in this run and none still listed passes; one listed, or too few, fails', async () => {
  const params = { since: SINCE, min_conversations: 3 };
  await fails('conversations-unarchived', params);
  const made = [];
  for (let i = 0; i < 3; i += 1) made.push(await addTurn());
  await db.query('update public.workspace_conversations set archived = true');
  const result = await passes('conversations-unarchived', params);
  assert.equal(result.detail.made_in_this_run, 3);
  await fails('conversations-unarchived', { ...params, min_conversations: 4 });
  await db.query('update public.workspace_conversations set archived = false where id = $1', [made[1].conversation]);
  const listed = await fails('conversations-unarchived', params);
  assert.deepEqual(listed.detail.not_archived, [made[1].conversation]);
  // A conversation of an earlier day is not the run's, listed or not.
  await db.query('update public.workspace_conversations set archived = true');
  await addTurn({ createdAt: BEFORE_RUN });
  await passes('conversations-unarchived', params);
});

/* ---------------------------------------------------------------------------------------------
 * Phase 24b, the page: the chips, the attached file, the page's delete, the remembered item
 * ------------------------------------------------------------------------------------------ */

const COURSE = 'IST.323';
const CONVERSATION_A = '7a1e0c42-3b5d-4e6f-8a9b-0c1d2e3f4a5b';

async function addOptions(request, { depth = 'standard', format = 'rich', course = COURSE, routine = null } = {}) {
  await db.query('insert into public.workspace_request_options (request_id, course_display_id, depth, routine_id, format) values ($1, $2, $3, $4, $5)', [request, course, depth, routine, format]);
}

async function addAttachment(request, { ord = 1, kind = 'upload', document = null } = {}) {
  await db.query('insert into public.workspace_request_attachments (request_id, ord, kind, document_id) values ($1, $2, $3, $4)', [request, ord, kind, document]);
}

/** A remembered item of a conversation: the document of kind memory, its one unit and, unless told otherwise, the unit's vector. */
async function addMemory(conversation, { state = 'indexed', createdAt = IN_RUN, vector = true } = {}) {
  const document = (await one("insert into public.workspace_documents (kind, state, conversation_id, created_at) values ('memory', $1, $2, $3::timestamptz) returning id", [state, conversation, createdAt])).id;
  const unit = (await one('insert into public.workspace_document_text (document_id) values ($1) returning id', [document])).id;
  if (vector) await db.query('insert into public.workspace_text_embeddings (text_id, embedding) values ($1, $2)', [unit, [0.1, 0.2]]);
  return document;
}

async function setConversationState(conversation, { optOut = true, writtenAt = IN_RUN } = {}) {
  await db.query(
    'insert into public.workspace_conversation_state (conversation_id, memory_opt_out, memory_written_at) values ($1, $2, $3::timestamptz) on conflict (conversation_id) do update set memory_opt_out = $2, memory_written_at = $3::timestamptz',
    [conversation, optOut, writtenAt],
  );
}

/** A turn asked at the Standard depth with a course chip: the middle tier, a planned turn whose depth is standard. */
async function addStandardTurn(options = {}) {
  const turn = await addTurn({ answer: { tier: 'mid' }, turn: { tier: 'mid', planState: 'planned', planMs: 1800 } });
  await db.query("update public.workspace_turns set depth = 'standard' where request_id = $1", [turn.request]);
  await addOptions(turn.request, options);
  return turn;
}

test('options-stored: a done request whose options row holds depth standard, format rich and the picked course, with a planned turn on the middle tier, passes; each other option, a skipped plan or the low tier fails', async () => {
  const good = await addStandardTurn();
  const result = await passes('options-stored', asked(good, { course: COURSE }));
  assert.equal(result.detail.options_depth, 'standard');
  assert.equal(result.detail.options_format, 'rich');
  assert.equal(result.detail.course_matches, true);
  await fails('options-stored', asked(good, { course: 'IST.352' }));
  await fails('options-stored', asked(await addStandardTurn({ depth: 'quick' }), { course: COURSE }));
  await fails('options-stored', asked(await addStandardTurn({ format: 'plain' }), { course: COURSE }));
  await fails('options-stored', asked(await addStandardTurn({ routine: 'quiz' }), { course: COURSE }));
  await fails('options-stored', asked(await addStandardTurn({ course: null }), { course: COURSE }));
  // No options row at all: a question the old page sent.
  await fails('options-stored', asked(await addTurn({ answer: { tier: 'mid' }, turn: { tier: 'mid', planState: 'planned' } }), { course: COURSE }));
  // The plan was skipped, or the answer came from the low tier: the depth did not reach the runner.
  const skipped = await addTurn({ answer: { tier: 'mid' }, turn: { tier: 'mid', planState: 'skipped' } });
  await db.query("update public.workspace_turns set depth = 'standard' where request_id = $1", [skipped.request]);
  await addOptions(skipped.request);
  await fails('options-stored', asked(skipped, { course: COURSE }));
  const low = await addTurn({ turn: { tier: 'low', planState: 'skipped' } });
  await db.query("update public.workspace_turns set depth = 'standard' where request_id = $1", [low.request]);
  await addOptions(low.request);
  await fails('options-stored', asked(low, { course: COURSE }));
  await fails('options-stored', asked(good, { course: COURSE, question_md5: md5(OTHER_QUESTION) }));
});

test('turn-attached: one indexed upload of the nonce, attached to the request and stored as a source of origin attached, passes; no attachment, another document, an auto source, a second row of the hash or a document not indexed fails', async () => {
  const document = await addDocument();
  const good = await addTurn({ sources: [{ kind: 'upload', origin: 'attached', document }] });
  await addAttachment(good.request, { document });
  const result = await passes('turn-attached', asked(good, { nonce: NONCE }));
  assert.equal(result.detail.rows_holding_it, 1);
  assert.equal(result.detail.attached_this_document, 1);
  assert.equal(result.detail.attached_upload_sources, 1);
  await fails('turn-attached', asked(good, { nonce: OTHER_NONCE }));
  await fails('turn-attached', asked(await addTurn({ sources: [{ kind: 'upload', origin: 'attached', document }] }), { nonce: NONCE }));
  const other = await addDocument({ nonce: OTHER_NONCE });
  const wrongFile = await addTurn({ sources: [{ kind: 'upload', origin: 'attached', document }] });
  await addAttachment(wrongFile.request, { document: other });
  await fails('turn-attached', asked(wrongFile, { nonce: NONCE }));
  const auto = await addTurn({ sources: [{ kind: 'upload', origin: 'auto', document }] });
  await addAttachment(auto.request, { document });
  await fails('turn-attached', asked(auto, { nonce: NONCE }));
  // A second send that made a second row would be the page's fault: the hash is one row.
  await db.query("insert into public.workspace_documents (kind, state, sha256, created_at) values ('upload', 'indexed', $1, $2::timestamptz)", [hashOf(NONCE), IN_RUN]);
  await fails('turn-attached', asked(good, { nonce: NONCE }));
  await db.query('delete from public.workspace_documents where id <> $1 and id <> $2', [document, other]);
  await db.query("update public.workspace_documents set state = 'text_ready' where id = $1", [document]);
  await fails('turn-attached', asked(good, { nonce: NONCE }));
});

test('page-upload-gone: no row holds the hash passes; a row of the hash in any state fails; other uploads in deleting are only reported', async () => {
  await passes('page-upload-gone', { nonce: NONCE });
  const document = await addDocument({ state: 'deleting' });
  const left = await fails('page-upload-gone', { nonce: NONCE });
  assert.equal(left.detail.rows_holding_it, 1);
  await db.query("update public.workspace_documents set state = 'indexed' where id = $1", [document]);
  await fails('page-upload-gone', { nonce: NONCE });
  await db.query('delete from public.workspace_documents');
  await addDocument({ nonce: OTHER_NONCE, state: 'deleting' });
  const other = await passes('page-upload-gone', { nonce: NONCE });
  assert.equal(other.detail.uploads_deleting_now, 1);
});

test('memory-item: one indexed memory document of the conversation, made in this run, with a vector behind its unit passes; none, no vector, not indexed, before the run, two items or another conversation fails', async () => {
  const params = { conversation: CONVERSATION_A, since: SINCE };
  await fails('memory-item', params);
  const document = await addMemory(CONVERSATION_A);
  const result = await passes('memory-item', params);
  assert.equal(result.detail.document_id, document);
  assert.equal(result.detail.has_vector, true);
  assert.equal(result.detail.made_in_this_run, true);
  await fails('memory-item', { ...params, conversation: '00000000-0000-4000-8000-000000000099' });
  await fails('memory-item', { ...params, since: '2026-10-09T15:00:00.000Z' });
  await db.query('delete from public.workspace_text_embeddings');
  assert.equal((await fails('memory-item', params)).detail.has_vector, false);
  await db.exec('delete from public.workspace_documents; delete from public.workspace_document_text;');
  await addMemory(CONVERSATION_A, { state: 'text_ready' });
  assert.equal((await fails('memory-item', params)).detail.document_state, 'text_ready');
  await db.exec('delete from public.workspace_documents; delete from public.workspace_document_text; delete from public.workspace_text_embeddings;');
  await addMemory(CONVERSATION_A, { createdAt: BEFORE_RUN });
  assert.equal((await fails('memory-item', params)).detail.made_in_this_run, false);
  await addMemory(CONVERSATION_A);
  assert.equal((await fails('memory-item', params)).detail.remembered_items, 2);
});

test('memory-gone: no memory document of the conversation, its state row opted out with a written time, and no orphan vector passes; an item left, no state row, not opted out, never written or an orphan vector fails', async () => {
  const params = { conversation: CONVERSATION_A };
  await fails('memory-gone', params);
  await setConversationState(CONVERSATION_A);
  const result = await passes('memory-gone', params);
  assert.equal(result.detail.memory_opt_out, true);
  assert.equal(result.detail.orphan_vectors, 0);
  await setConversationState(CONVERSATION_A, { optOut: false });
  await fails('memory-gone', params);
  await setConversationState(CONVERSATION_A, { optOut: true, writtenAt: null });
  await fails('memory-gone', params);
  await setConversationState(CONVERSATION_A);
  const document = await addMemory(CONVERSATION_A);
  assert.equal((await fails('memory-gone', params)).detail.remembered_items, 1);
  // The delete that leaves a unit's vector behind, with its document gone, is not a clean delete.
  await db.query('delete from public.workspace_documents where id = $1', [document]);
  assert.equal((await fails('memory-gone', params)).detail.orphan_vectors, 1);
  await db.exec('delete from public.workspace_text_embeddings; delete from public.workspace_document_text;');
  await passes('memory-gone', params);
});

/* ---------------------------------------------------------------------------------------------
 * The store
 * ------------------------------------------------------------------------------------------ */

test('store-counts: the status view agrees with the direct counts passes, on an empty store too; a course vector the view does not count fails', async () => {
  await passes('store-counts');
  await db.exec('insert into public.bb_file_text (id) values (1), (2), (3)');
  await db.exec("insert into public.bb_text_embeddings (text_id, embedding) values (1, '{0.1}'), (1, '{0.2}'), (2, '{0.1}')");
  await db.exec('insert into public.v_embedding_status (units_embedded, text_units) values (2, 3)');
  const result = await passes('store-counts');
  assert.equal(Number(result.detail.course_units_indexed), 2);
  assert.equal(Number(result.detail.course_units_waiting), 1);
  const document = await addDocument();
  await db.query('insert into public.workspace_document_text (document_id) values ($1)', [document]);
  const noVector = await fails('store-counts');
  assert.equal(noVector.detail.none_indexed_without_a_vector, false);
  await db.exec('insert into public.workspace_text_embeddings (text_id, embedding) select id, \'{0.5}\' from public.workspace_document_text');
  await passes('store-counts');
  await db.exec('update public.v_embedding_status set units_embedded = 3');
  assert.equal((await fails('store-counts')).detail.course_vectors_ok, false);
});

test('store-counts: it compares a count only with a direct count of the same statement, never with a moment of the run', async () => {
  const { sql } = PACK_24['store-counts'];
  assert.ok(sql.includes('from public.v_workspace_index_status s'));
  for (const direct of ['select count(*) from public.bb_file_text', 'select count(distinct e.text_id) from public.bb_text_embeddings e']) assert.ok(sql.includes(direct), direct);
  assert.deepEqual(PACK_24['store-counts'].params, {});
});

const VIEW_ROW = {
  extension_version: '0.8.2', extension_schema: 'extensions', extension_ok: true,
  vector_columns: 'public.bb_text_embeddings.embedding:384:t, public.workspace_text_embeddings.embedding:384:t', vector_columns_ok: true,
  vector_indexes: 'public.bb_text_embeddings.bb_text_embeddings_hnsw:hnsw:vector_cosine_ops:t, public.workspace_text_embeddings.workspace_text_embeddings_hnsw:hnsw:vector_cosine_ops:t', vector_indexes_ok: true,
  foreign_servers: 0, foreign_tables: 0, link_extensions: 0, store_functions_that_call_out: 0, no_links_ok: true,
};

/** Sets the stand-in view's one row: the expected row of the unit (section 5), with the changes the case makes. */
async function setViewRow(change = {}) {
  const row = { ...VIEW_ROW, ...change };
  await db.exec('truncate public.v_workspace_store_proof');
  await db.query(`insert into public.v_workspace_store_proof values (${STORE_PROOF_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})`, STORE_PROOF_COLUMNS.map((name) => row[name]));
}

test('the stand-in for v_workspace_store_proof has the columns of the migration 199 view, in its order', () => {
  assert.deepEqual([...columnsOf('v_workspace_store_proof')], STORE_PROOF_COLUMNS);
});

test('store-extension: ok is extension_ok, and the version and the schema are in the detail', async () => {
  await setViewRow();
  const result = await passes('store-extension');
  assert.equal(result.detail.extension_version, '0.8.2');
  assert.equal(result.detail.extension_schema, 'extensions');
  await setViewRow({ extension_ok: false, extension_schema: 'public' });
  assert.equal((await fails('store-extension')).detail.extension_schema, 'public');
  await db.exec('truncate public.v_workspace_store_proof');
  assert.equal((await fails('store-extension')).detail.error, 'expected_one_row');
});

test('store-vector-columns: ok is vector_columns_ok; the list and its count are in the detail', async () => {
  await setViewRow();
  const result = await passes('store-vector-columns');
  assert.equal(result.detail.vector_columns_n, 2);
  assert.deepEqual(result.detail.vector_columns_list, ['public.bb_text_embeddings.embedding:384:t', 'public.workspace_text_embeddings.embedding:384:t']);
  await setViewRow({ vector_columns: 'public.bb_text_embeddings.embedding:384:t', vector_columns_ok: false });
  assert.equal((await fails('store-vector-columns')).detail.vector_columns_n, 1);
});

test('store-vector-indexes: ok is vector_indexes_ok; the count is in the detail (a long element is withheld)', async () => {
  await setViewRow();
  const result = await passes('store-vector-indexes');
  assert.equal(result.detail.vector_indexes_n, 2);
  assert.equal(result.detail.vector_indexes_list.length, 2);
  await setViewRow({ vector_indexes: '', vector_indexes_ok: false });
  await fails('store-vector-indexes');
});

test('store-no-links: ok is no_links_ok; the four counts are in the detail', async () => {
  await setViewRow();
  await passes('store-no-links');
  await setViewRow({ link_extensions: 1, no_links_ok: false });
  const result = await fails('store-no-links');
  assert.deepEqual([result.detail.foreign_servers, result.detail.foreign_tables, result.detail.link_extensions, result.detail.store_functions_that_call_out], [0, 0, 1, 0]);
});
