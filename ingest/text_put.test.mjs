// bb2dash :: ingest/text_put.test.mjs
//
//   node --test ingest/text_put.test.mjs
//
// Phase 25a item B (W-101): the Windows fallback stores course text through migration 200's
// `sync_file_text_put`, as `sync_runner`, with the login the sync container uses. Covers the call
// (one statement, the units as a parameter, the answer checked), the all-or-nothing form
// `--restale-post` needs, where the DSN comes from and what it must look like, that no message
// carries the DSN or its password, and loading the `pg` client the repo already pins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as tp from './text_put.mjs';

const DSN = 'postgresql://sync_runner.goultdzqcavefcgnifdy:s3cret-pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require';
const UNITS = [{ unit_kind: 'page', unit_no: 1, text: 'one' }, { unit_kind: 'page', unit_no: 2, text: 'two' }];

function fakeQuery(answers) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next ?? { rows: [] };
  };
  return { query, calls };
}

test('the call is one select of sync_file_text_put, the id as a bigint and the units as a jsonb parameter', async () => {
  assert.equal(tp.TEXT_PUT_SQL, 'select inserted, present from public.sync_file_text_put($1::bigint, $2::jsonb)');
  const { query, calls } = fakeQuery([{ rows: [{ inserted: 2, present: 0 }] }]);
  const put = tp.makeTextPutter(query);
  assert.deepEqual(await put.put(3736, UNITS), { inserted: 2, present: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, tp.TEXT_PUT_SQL);
  assert.deepEqual(calls[0].params, ['3736', JSON.stringify(UNITS)]);
  assert.equal(calls[0].sql.includes('one'), false, 'no text is spliced into the SQL');
});

test('an id that is not numeric is refused before the database is asked', async () => {
  const { query, calls } = fakeQuery([]);
  const put = tp.makeTextPutter(query);
  await assert.rejects(put.put('72; drop table bb_files', UNITS), /numeric file id/);
  await assert.rejects(put.put(-1, UNITS), /numeric file id/);
  assert.equal(calls.length, 0);
});

test('the answer is checked: one row, two whole numbers, adding up to the units sent', () => {
  assert.deepEqual(tp.parseTextPut([{ inserted: 1, present: 1 }], 2), { inserted: 1, present: 1 });
  assert.deepEqual(tp.parseTextPut([{ inserted: '2', present: '0' }], 2), { inserted: 2, present: 0 }, 'pg may answer int as text');
  assert.throws(() => tp.parseTextPut([], 2), /no answer/);
  assert.throws(() => tp.parseTextPut([{ inserted: 1.5, present: 0 }], 2), /not whole numbers/);
  assert.throws(() => tp.parseTextPut([{ inserted: null, present: 0 }], 2), /not whole numbers/);
  assert.throws(() => tp.parseTextPut([{ inserted: 1, present: 0 }], 2), /1 \+ 0 is not the 2 units sent/);
});

test('a database refusal comes through as an error, never as "nothing inserted"', async () => {
  const { query } = fakeQuery([Object.assign(new Error('sync_file_text_put: a (unit_kind, unit_no) appears twice'), { code: '22023' })]);
  await assert.rejects(tp.makeTextPutter(query).put(1, UNITS), /appears twice/);
});

test('all or nothing: a put that finds every unit new is committed', async () => {
  const { query, calls } = fakeQuery([{ rows: [] }, { rows: [{ inserted: 2, present: 0 }] }, { rows: [] }]);
  const r = await tp.makeTextPutter(query).putAllOrNothing(72, UNITS);
  assert.deepEqual(r, { inserted: 2, present: 0, committed: true });
  assert.deepEqual(calls.map((c) => c.sql), ['begin', tp.TEXT_PUT_SQL, 'commit']);
});

test('all or nothing: a put that finds any unit already there is rolled back, so old and new text never mix', async () => {
  const { query, calls } = fakeQuery([{ rows: [] }, { rows: [{ inserted: 3, present: 2 }] }, { rows: [] }]);
  const r = await tp.makeTextPutter(query).putAllOrNothing(72, [...UNITS, ...UNITS.map((u) => ({ ...u, unit_no: u.unit_no + 2 })), { unit_kind: 'page', unit_no: 5, text: 'x' }]);
  assert.deepEqual(r, { inserted: 3, present: 2, committed: false });
  assert.deepEqual(calls.map((c) => c.sql), ['begin', tp.TEXT_PUT_SQL, 'rollback']);
});

test('all or nothing: an error rolls back and is rethrown', async () => {
  const { query, calls } = fakeQuery([{ rows: [] }, new Error('boom'), { rows: [] }]);
  await assert.rejects(tp.makeTextPutter(query).putAllOrNothing(72, UNITS), /boom/);
  assert.deepEqual(calls.map((c) => c.sql), ['begin', tp.TEXT_PUT_SQL, 'rollback']);
});

test('all or nothing: when the rollback fails too, the first error is the one thrown and names both', async () => {
  const { query } = fakeQuery([{ rows: [] }, new Error('boom'), new Error('socket gone')]);
  await assert.rejects(tp.makeTextPutter(query).putAllOrNothing(72, UNITS), /boom; the rollback failed too: socket gone/);
});

test('the DSN: SYNC_RUNNER_DB_URL wins, then SYNC_RUNNER_DB_URL_FILE, then SECRETS_DIR, then the default folder', () => {
  const seen = [];
  const readFile = (file) => { seen.push(file.replace(/\\/g, '/')); return `\uFEFF${DSN}\r\n`; };
  assert.equal(tp.readSyncRunnerDsn({ SYNC_RUNNER_DB_URL: ` ${DSN} ` }, readFile), DSN);
  assert.deepEqual(seen, []);
  assert.equal(tp.readSyncRunnerDsn({ SYNC_RUNNER_DB_URL_FILE: 'D:/x/dsn' }, readFile), DSN, 'BOM, CR and LF are stripped');
  assert.equal(tp.readSyncRunnerDsn({ SECRETS_DIR: 'E:/s' }, readFile), DSN);
  assert.equal(tp.readSyncRunnerDsn({}, readFile), DSN);
  assert.deepEqual(seen, ['D:/x/dsn', 'E:/s/sync_runner_db_url', 'C:/Users/stack/.bb2dash-secrets/sync_runner_db_url']);
  assert.equal(tp.SYNC_RUNNER_DSN_FILE, 'sync_runner_db_url', 'the compose secret the sync container mounts');
});

test('the DSN: a file that cannot be read, or is empty, is named; its contents never are', () => {
  const missing = () => { throw Object.assign(new Error(`ENOENT ${DSN}`), { code: 'ENOENT' }); };
  assert.throws(() => tp.readSyncRunnerDsn({ SECRETS_DIR: 'E:/s' }, missing), (e) => {
    assert.match(e.message, /sync_runner_db_url cannot be read \(ENOENT\)/);
    assert.equal(e.message.includes('s3cret'), false);
    return true;
  });
  assert.throws(() => tp.readSyncRunnerDsn({}, () => '\r\n'), /is empty/);
});

test('the DSN must be the session pooler or direct, with an encrypted sslmode; refusals never print it', () => {
  assert.equal(tp.assertSessionDsn(DSN), DSN);
  assert.equal(tp.assertSessionDsn(DSN.replace('sslmode=require', 'sslmode=verify-full')), DSN.replace('sslmode=require', 'sslmode=verify-full'));
  const cases = [
    [DSN.replace(':5432/', ':6543/'), /6543, the transaction pooler/],
    [DSN.replace('?uselibpqcompat=true&sslmode=require', ''), /no sslmode/],
    [DSN.replace('sslmode=require', 'sslmode=disable'), /sslmode=disable/],
    [DSN.replace('sslmode=require', 'sslmode=no-verify'), /sslmode=no-verify, which asks for less/],
    ['not a url s3cret-pass', /not a postgresql:\/\/ URL/],
    [DSN.replace('postgresql:', 'https:'), /not a postgresql:\/\/ URL/],
  ];
  for (const [dsn, re] of cases) {
    assert.throws(() => tp.assertSessionDsn(dsn), (e) => {
      assert.match(e.message, re);
      assert.equal(e.message.includes('s3cret'), false, e.message);
      return true;
    });
  }
});

test('redactDsn takes out the DSN, its password and its host', () => {
  const text = `connect to ${DSN} failed; password s3cret-pass; getaddrinfo ENOTFOUND aws-0-us-east-1.pooler.supabase.com`;
  const out = tp.redactDsn(text, DSN);
  assert.equal(out.includes('s3cret'), false);
  assert.equal(out.includes('pooler.supabase.com'), false);
  assert.match(out, /<redacted>/);
  assert.equal(tp.redactDsn('plain', null), 'plain');
});

const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n';

test('the pinned CA: SYNC_RUNNER_DB_CA_FILE, else <HARNESS_DIR>/certs/prod-ca.crt, else the harness checkout', () => {
  const seen = [];
  const readFile = (file) => { seen.push(file.replace(/\\/g, '/')); return `\uFEFF${CA}`; };
  assert.equal(tp.readPinnedCa({ SYNC_RUNNER_DB_CA_FILE: 'D:/ca.pem' }, readFile), CA, 'a BOM is stripped');
  assert.equal(tp.readPinnedCa({ HARNESS_DIR: 'E:/harness' }, readFile), CA);
  assert.equal(tp.readPinnedCa({}, readFile), CA);
  assert.deepEqual(seen, ['D:/ca.pem', 'E:/harness/certs/prod-ca.crt', 'C:/Users/stack/agentic-harness/certs/prod-ca.crt']);
});

test('the pinned CA: missing or not a certificate stops the run with how to get it, before anything connects', () => {
  const missing = () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); };
  assert.throws(() => tp.readPinnedCa({ HARNESS_DIR: 'E:/h' }, missing),
    /prod-ca\.crt cannot be read \(ENOENT\): the database connection is not made without it\. The Workspace takes this CA from the harness checkout's certs\/prod-ca\.crt; set HARNESS_DIR/);
  assert.throws(() => tp.readPinnedCa({}, () => 'not a pem'), /holds no PEM certificate/);
  assert.throws(() => tp.readPinnedCa({}, () => ''), /holds no PEM certificate/);
});

test('the connection: built from the DSN\'s parts, verify-full against the pinned CA, with both timeouts', () => {
  const o = tp.pgClientOptions(DSN, CA);
  assert.deepEqual(o, {
    host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, user: 'sync_runner.goultdzqcavefcgnifdy', password: 's3cret-pass', database: 'postgres',
    ssl: { ca: CA, rejectUnauthorized: true, servername: 'aws-0-us-east-1.pooler.supabase.com' },
    application_name: 'bb2dash-pull-files', connectionTimeoutMillis: 10_000, query_timeout: 60_000, keepAlive: true,
  });
  assert.equal('connectionString' in o, false, 'the DSN\'s sslmode=require never reaches the driver');
  assert.equal(tp.DB_CONNECT_TIMEOUT_MS, 10_000);
  assert.equal(tp.DB_QUERY_TIMEOUT_MS, 60_000);
  assert.throws(() => tp.pgClientOptions('postgresql://u@h:5432/postgres?sslmode=require', CA), /names no password/);
});

/**
 * A fake pg: each Client records its queries. `script(client, sql)` may return a result, throw, or
 * call `client.fireError()` (the socket dropping, as pg's 'error' event).
 */
function fakePg({ failConnect = false, script = null } = {}) {
  const made = [];
  class Client {
    constructor(opts) { this.opts = opts; this.ended = false; this.queries = []; this.handlers = []; made.push(this); }
    on(event, fn) { if (event === 'error') this.handlers.push(fn); return this; }
    fireError() { for (const fn of this.handlers) fn(new Error('Connection terminated unexpectedly')); }
    async connect() { if (failConnect) throw new Error(`connect ECONNREFUSED ${DSN}`); }
    async query(sql, params) {
      if (this.ended) throw new Error('Client was closed and is not queryable');
      this.queries.push(sql);
      const scripted = script ? await script(this, sql, made.indexOf(this)) : undefined;
      if (scripted !== undefined) return scripted;
      return { rows: sql === tp.TEXT_PUT_SQL ? [{ inserted: JSON.parse(params[1]).length, present: 0 }] : [] };
    }
    async end() { this.ended = true; }
  }
  return { pg: { Client }, made };
}

test('openTextPut connects once, lazily, with the pinned options; end closes it', async () => {
  const { pg, made } = fakePg();
  const store = tp.openTextPut({ dsn: DSN, ca: CA, pg });
  assert.equal(made.length, 0, 'nothing connects before the first put');
  assert.deepEqual(await store.put(1, UNITS), { inserted: 2, present: 0 });
  await store.put(2, UNITS);
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].opts, tp.pgClientOptions(DSN, CA));
  await store.end();
  assert.equal(made[0].ended, true);
  await tp.openTextPut({ dsn: DSN, ca: CA, pg }).end();
});

test('openTextPut: a connect or query failure is rethrown with the DSN and password taken out', async () => {
  const a = fakePg({ failConnect: true });
  await assert.rejects(tp.openTextPut({ dsn: DSN, ca: CA, pg: a.pg }).put(1, UNITS), (e) => {
    assert.match(e.message, /ECONNREFUSED/);
    assert.equal(e.message.includes('s3cret'), false);
    return true;
  });
  const b = fakePg({ script: () => { throw Object.assign(new Error('sync_file_text_put: file 9 is not in bb_files s3cret-pass'), { code: '22023' }); } });
  await assert.rejects(tp.openTextPut({ dsn: DSN, ca: CA, pg: b.pg }).put(9, UNITS), (e) => {
    assert.match(e.message, /file 9 is not in bb_files/);
    assert.equal(e.message.includes('s3cret'), false);
    assert.equal(e.code, '22023');
    return true;
  });
});

test('all or nothing, pinned: a socket lost after begin aborts the file; nothing runs on a new client inside it', async () => {
  const { pg, made } = fakePg({
    script: (client, sql, index) => {
      if (index === 0 && sql === tp.TEXT_PUT_SQL) {
        client.fireError();
        throw new Error('Connection terminated unexpectedly');
      }
      return undefined;
    },
  });
  const store = tp.openTextPut({ dsn: DSN, ca: CA, pg });
  await assert.rejects(store.putAllOrNothing(72, UNITS), /^Error: file 72 aborted, nothing stored: Connection terminated unexpectedly; the rollback failed too: the connection was lost inside the transaction$/);
  assert.equal(made.length, 1, 'no client was opened inside the transaction');
  assert.deepEqual(made[0].queries, ['begin', tp.TEXT_PUT_SQL], 'no commit, and no rollback sent to another connection');
  assert.equal(made[0].ended, true, 'the connection the transaction failed on is closed');

  // The next file starts on a fresh connection, with its own begin.
  assert.deepEqual(await store.putAllOrNothing(73, UNITS), { inserted: 2, present: 0, committed: true });
  assert.equal(made.length, 2);
  assert.deepEqual(made[1].queries, ['begin', tp.TEXT_PUT_SQL, 'commit']);
});

test('all or nothing, pinned: a put that fails with no error event is rolled back on the same client, which is then closed', async () => {
  const { pg, made } = fakePg({
    script: (client, sql) => {
      if (sql === tp.TEXT_PUT_SQL) throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      return undefined;
    },
  });
  const store = tp.openTextPut({ dsn: DSN, ca: CA, pg });
  await assert.rejects(store.putAllOrNothing(72, UNITS), (e) => {
    assert.match(e.message, /^file 72 aborted, nothing stored: canceling statement/);
    assert.equal(e.code, '57014');
    return true;
  });
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].queries, ['begin', tp.TEXT_PUT_SQL, 'rollback']);
  assert.equal(made[0].ended, true);
});

test('all or nothing, pinned: a lost connection before the transaction begins is a failed file too, never a half put', async () => {
  const { pg, made } = fakePg({ script: (client, sql) => { if (sql === 'begin') { client.fireError(); throw new Error('Connection terminated'); } return undefined; } });
  const store = tp.openTextPut({ dsn: DSN, ca: CA, pg });
  await assert.rejects(store.putAllOrNothing(72, UNITS), /file 72 aborted, nothing stored: Connection terminated/);
  assert.deepEqual(made[0].queries, ['begin']);
  assert.equal(made.length, 1);
});

test('loadPg: a missing client names the install command', async () => {
  await assert.rejects(tp.loadPg('C:/nowhere-at-all'), /npm --prefix scripts ci/);
});

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
test('loadPg: the client is the one scripts/ pins (pg), when it is installed', { skip: !fs.existsSync(path.join(REPO, 'scripts', 'node_modules', 'pg')) }, async () => {
  const pg = await tp.loadPg(REPO);
  assert.equal(typeof pg.Client, 'function');
});

// Phase 25a (W-101): --restale-post stores the staged units through sync_file_text_put (200) as
// sync_runner, all or nothing: a unit already there means the owner SQL has not removed the old
// units yet, and the put is rolled back so old and new text never mix.
test('restale-post: every unit new is posted; any unit already there means the owner SQL has not run yet', async () => {
  const staged = { id: 72, rows: [{ file_id: 72, unit_kind: 'slide', unit_no: 1, text: 'a' }, { file_id: 72, unit_kind: 'slide', unit_no: 2, text: 'b' }] };
  const calls = [];
  const ctx = (answer) => ({ putAllOrNothing: async (id, units) => { calls.push({ id, units }); if (answer instanceof Error) throw answer; return answer; } });
  assert.deepEqual(await tp.restalePostOne(staged, 72, ctx({ inserted: 2, present: 0, committed: true })), { id: 72, outcome: 'posted', unitsPosted: 2 });
  assert.deepEqual(calls[0], { id: 72, units: [{ unit_kind: 'slide', unit_no: 1, text: 'a' }, { unit_kind: 'slide', unit_no: 2, text: 'b' }] }, 'the file id is the call argument, not a unit field');
  assert.deepEqual(await tp.restalePostOne(staged, 72, ctx({ inserted: 1, present: 1, committed: false })), { id: 72, outcome: 'owner_sql_pending', unitsPosted: 0 });
  assert.deepEqual(await tp.restalePostOne(staged, 72, ctx(new Error('sync_file_text_put: file 72 is not in bb_files'))),
    { id: 72, outcome: 'error', unitsPosted: 0, error: 'sync_file_text_put refused: sync_file_text_put: file 72 is not in bb_files' });
});

test('restale-post: a staged file that does not match its name, or holds no text, is not put', async () => {
  const ctx = { putAllOrNothing: async () => { throw new Error('must not be called'); } };
  const r1 = await tp.restalePostOne({ id: 73, rows: [{ file_id: 73, unit_kind: 'slide', unit_no: 1, text: 'a' }] }, 72, ctx);
  assert.deepEqual(r1, { id: 72, outcome: 'error', unitsPosted: 0, error: 'staged file does not match its name; not posted' });
  const r2 = await tp.restalePostOne({ id: 72, rows: [{ file_id: 72, unit_kind: 'slide', unit_no: 1, text: '  ' }] }, 72, ctx);
  assert.deepEqual(r2, { id: 72, outcome: 'error', unitsPosted: 0, error: 'staged file holds no text; not posted' });
});

// Phase 25a (W-101): the units go through sync_file_text_put (200), which answers (inserted, present).
test('putUnits: kind, number and text only, and a blank unit is dropped (200 refuses blank text)', () => {
  assert.deepEqual(tp.putUnits([
    { file_id: 9, unit_kind: 'doc', unit_no: 1, text: 'abc', file: 'x.docx' },
    { unit_kind: 'page', unit_no: 2, text: ' \n ' },
    { unit_kind: 'page', unit_no: 3, text: null },
  ]), [{ unit_kind: 'doc', unit_no: 1, text: 'abc' }]);
  assert.deepEqual(tp.putUnits([]), []);
});

test('putFileText: a first pull puts the units once and counts what was inserted; present units are kept', async () => {
  const calls = [];
  const ctx = (answer) => ({ put: async (id, units) => { calls.push({ id, units }); if (answer instanceof Error) throw answer; return answer; } });
  const units = [{ unit_kind: 'page', unit_no: 1, text: 'a' }, { unit_kind: 'page', unit_no: 2, text: 'b' }];
  assert.deepEqual(await tp.putFileText(ctx({ inserted: 2, present: 0 }), 163, units), { unitsPosted: 2, textKept: false, unitCount: 2 });
  assert.deepEqual(calls[0], { id: 163, units });
  // File 163 (sync 443, 2026-10-01): text extracted by hand before the bytes reached Storage is kept,
  // and the bytes still land, so the row is not stuck behind its own text.
  assert.deepEqual(await tp.putFileText(ctx({ inserted: 0, present: 2 }), 163, units), { unitsPosted: 0, textKept: true, unitCount: 2 });
  assert.deepEqual(await tp.putFileText(ctx({ inserted: 1, present: 1 }), 163, units), { unitsPosted: 1, textKept: true, unitCount: 2 });
  assert.deepEqual(await tp.putFileText(ctx(new Error('sync_file_text_put: a (unit_kind, unit_no) appears twice\nDETAIL: x')), 163, units),
    { error: 'sync_file_text_put refused: sync_file_text_put: a (unit_kind, unit_no) appears twice' });
});

test('putFileText: no unit with text means no call and no units (text_status failed)', async () => {
  const ctx = { put: async () => { throw new Error('must not be called'); } };
  assert.deepEqual(await tp.putFileText(ctx, 1, []), { unitsPosted: 0, textKept: false, unitCount: 0 });
  assert.deepEqual(await tp.putFileText(ctx, 1, [{ unit_kind: 'doc', unit_no: 1, text: '' }]), { unitsPosted: 0, textKept: false, unitCount: 0 });
});

test('putFileText: a file too large for 200 (54000) gets no text and says why; the owner SQL records it failed', async () => {
  const store = { put: async () => { throw Object.assign(new Error('sync_file_text_put: too large: a file puts at most 1000 units, not 1200'), { code: '54000' }); } };
  assert.deepEqual(await tp.putFileText(store, 3713, [{ unit_kind: 'page', unit_no: 1, text: 'a' }]), {
    unitsPosted: 0, textKept: false, unitCount: 0,
    textRefused: 'too large for sync_file_text_put: sync_file_text_put: too large: a file puts at most 1000 units, not 1200',
  });
  assert.equal(tp.TEXT_TOO_LARGE_SQLSTATE, '54000');
  assert.equal(tp.isTextTooLarge({ code: '22023' }), false);
});
