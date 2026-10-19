// bb2dash :: ingest/text_put.mjs
//
// Phase 25a item B (docs/planning/sprint-2/briefs/119_PHASE25_after_24b.md), worker W-101.
//
// The Windows fallback's way into `bb_file_text`: migration 200's `sync_file_text_put`, called as
// `sync_runner` with the login the sync container uses (the compose secret `sync_runner_db_url`,
// read from SECRETS_DIR, `C:/Users/stack/.bb2dash-secrets/` by default). It replaced the REST insert
// with the publishable key, whose policy (`bb_file_text_anon_insert`, 007) migration 201 drops.
//
// `ingest/pull_files.mjs` loads this module only when it is about to store text, with a dynamic
// import: the sync image copies pull_files.mjs (for its pure helpers) but not this file, and the
// container's runner calls the same function through its own `pg` connection (`sync/src/db.ts`).
//
// The `pg` client is the one `scripts/` already pins (the SQL runner's single dependency); this
// directory has no package.json of its own. No message here ever carries the DSN, its password or
// its host: every error is passed through `redactDsn`.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const TEXT_PUT_SQL = 'select inserted, present from public.sync_file_text_put($1::bigint, $2::jsonb)';
/** The compose secret the sync container mounts; the same file serves the Windows fallback. */
export const SYNC_RUNNER_DSN_FILE = 'sync_runner_db_url';
export const DEFAULT_SECRETS_DIR = 'C:/Users/stack/.bb2dash-secrets';
export const APPLICATION_NAME = 'bb2dash-pull-files';

const TRANSACTION_POOLER_PORT = '6543';
const SSLMODE_ALLOWED = new Set(['require', 'verify-ca', 'verify-full', 'no-verify']);
const ID_RE = /^\d+$/;
const MIN_SECRET_LENGTH = 4;

/** A secret file's text without a UTF-8 BOM, CR or LF (files written by PowerShell carry them). */
export function cleanSecret(raw) {
  return String(raw ?? '').replace(/^\uFEFF/, '').replace(/[\r\n]/g, '').trim();
}

/** Remove the DSN, its password and its host from any text this module prints or throws. */
export function redactDsn(text, dsn) {
  let out = String(text ?? '');
  if (!dsn) return out;
  const secrets = [dsn];
  try {
    const url = new URL(dsn);
    if (url.password) secrets.push(url.password, decodeURIComponent(url.password));
    if (url.host) secrets.push(url.host);
    if (url.hostname) secrets.push(url.hostname);
  } catch {
    // Not a URL: the whole string is the only secret known.
  }
  for (const secret of secrets) {
    if (secret && secret.length >= MIN_SECRET_LENGTH) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/** A session-pooler or direct DSN with an encrypted sslmode, the rule the sync runner applies. */
export function assertSessionDsn(dsn) {
  let url;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error('the sync_runner DSN is not a postgresql:// URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('the sync_runner DSN is not a postgresql:// URL');
  }
  if (url.port === TRANSACTION_POOLER_PORT) {
    throw new Error('the sync_runner DSN points at port 6543, the transaction pooler; use the session pooler on 5432');
  }
  const sslmode = url.searchParams.get('sslmode')?.trim().toLowerCase() ?? null;
  if (sslmode === null) {
    throw new Error('the sync_runner DSN names no sslmode; append ?uselibpqcompat=true&sslmode=require');
  }
  if (!SSLMODE_ALLOWED.has(sslmode)) {
    throw new Error(`the sync_runner DSN sets sslmode=${sslmode}, which permits an unencrypted connection`);
  }
  return dsn;
}

/**
 * The `sync_runner` DSN: SYNC_RUNNER_DB_URL, else the file SYNC_RUNNER_DB_URL_FILE names, else
 * `<SECRETS_DIR>/sync_runner_db_url`, SECRETS_DIR defaulting to C:/Users/stack/.bb2dash-secrets.
 * An unreadable or empty file is named in the error; its contents never are.
 */
export function readSyncRunnerDsn(env, readFile = (file) => fs.readFileSync(file, 'utf8')) {
  const direct = cleanSecret(env.SYNC_RUNNER_DB_URL);
  if (direct) return assertSessionDsn(direct);
  const file = env.SYNC_RUNNER_DB_URL_FILE?.trim()
    || path.join(env.SECRETS_DIR?.trim() || DEFAULT_SECRETS_DIR, SYNC_RUNNER_DSN_FILE);
  let text;
  try {
    text = readFile(file);
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'unreadable';
    throw new Error(`the sync_runner DSN file ${file} cannot be read (${code}); set SECRETS_DIR or SYNC_RUNNER_DB_URL_FILE`);
  }
  const dsn = cleanSecret(text);
  if (!dsn) throw new Error(`the sync_runner DSN file ${file} is empty`);
  return assertSessionDsn(dsn);
}

/** sync_file_text_put's one row, checked: two whole numbers that add up to the units sent. */
export function parseTextPut(rows, sent) {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) throw new Error('sync_file_text_put gave no answer');
  const inserted = row.inserted === null || row.inserted === undefined ? NaN : Number(row.inserted);
  const present = row.present === null || row.present === undefined ? NaN : Number(row.present);
  if (!Number.isInteger(inserted) || !Number.isInteger(present) || inserted < 0 || present < 0) {
    throw new Error(`sync_file_text_put answered ${JSON.stringify(row)}: not whole numbers`);
  }
  if (inserted + present !== sent) {
    throw new Error(`sync_file_text_put answered ${inserted} + ${present} is not the ${sent} units sent`);
  }
  return { inserted, present };
}

function firstLine(error) {
  return String(error instanceof Error ? error.message : error).split('\n')[0];
}

/**
 * The two calls over a query function `(sql, params) => { rows }` on one connection:
 *   put              one statement; units already there are kept and counted as present
 *   putAllOrNothing  the same inside begin/commit, rolled back when any unit was already there
 */
export function makeTextPutter(query) {
  const put = async (fileId, units) => {
    if (!ID_RE.test(String(fileId))) throw new Error(`sync_file_text_put: refusing ${JSON.stringify(fileId)}, not a numeric file id`);
    const result = await query(TEXT_PUT_SQL, [String(fileId), JSON.stringify(units)]);
    return parseTextPut(result?.rows, units.length);
  };
  const putAllOrNothing = async (fileId, units) => {
    await query('begin');
    let answer;
    try {
      answer = await put(fileId, units);
    } catch (error) {
      try {
        await query('rollback');
      } catch (rollbackError) {
        throw new Error(`${firstLine(error)}; the rollback failed too: ${firstLine(rollbackError)}`);
      }
      throw error;
    }
    if (answer.present > 0) {
      await query('rollback');
      return { ...answer, committed: false };
    }
    await query('commit');
    return { ...answer, committed: true };
  };
  return { put, putAllOrNothing };
}

/**
 * The units sync_file_text_put (200) takes for one file: kind, number and text, nothing else (the
 * file id is the call's own argument; `char_count` is generated). A unit with blank text is dropped:
 * 200 refuses it, and extract_text.py writes one for a .docx with no paragraphs.
 */
export function putUnits(units) {
  return units
    .filter((u) => typeof u.text === 'string' && u.text.trim() !== '')
    .map((u) => ({ unit_kind: u.unit_kind, unit_no: u.unit_no, text: u.text }));
}


/**
 * A first pull's units, through `store.put(fileId, units)` → { inserted, present }. Units already
 * there are kept — text an agent extracted from the same file before its bytes reached Storage (file
 * 163, 2026-10-01) — and the bytes still land, so the row is not stuck behind its own text forever.
 * A refusal is an error for this row; it is never read as "nothing to insert".
 */
export async function putFileText(store, fileId, units) {
  const put = putUnits(units);
  if (put.length === 0) return { unitsPosted: 0, textKept: false, unitCount: 0 };
  let answer;
  try {
    answer = await store.put(fileId, put);
  } catch (error) {
    return { error: `sync_file_text_put refused: ${firstLine(error).slice(0, 200)}` };
  }
  return { unitsPosted: answer.inserted, textKept: answer.present > 0, unitCount: put.length };
}

/**
 * --restale-post, one staged file, through `store.putAllOrNothing(fileId, units)`: posted when
 * every unit was new; owner_sql_pending when any was already there (the old units are still in
 * place, and the put was rolled back so old and new text never mix); error otherwise.
 */
export async function restalePostOne(staged, id, store) {
  if (staged?.id !== id || !Array.isArray(staged.rows) || staged.rows.some((r) => r.file_id !== id)) {
    return { id, outcome: 'error', unitsPosted: 0, error: 'staged file does not match its name; not posted' };
  }
  const units = putUnits(staged.rows);
  if (units.length === 0) return { id, outcome: 'error', unitsPosted: 0, error: 'staged file holds no text; not posted' };
  let answer;
  try {
    answer = await store.putAllOrNothing(id, units);
  } catch (error) {
    return { id, outcome: 'error', unitsPosted: 0, error: `sync_file_text_put refused: ${firstLine(error).slice(0, 200)}` };
  }
  if (!answer.committed) return { id, outcome: 'owner_sql_pending', unitsPosted: 0 };
  return { id, outcome: 'posted', unitsPosted: answer.inserted };
}

/** The `pg` module scripts/ pins, resolved from scripts/package.json. */
export async function loadPg(repoRoot) {
  let resolved;
  try {
    resolved = createRequire(path.join(repoRoot, 'scripts', 'package.json')).resolve('pg');
  } catch {
    throw new Error('the pg client is not installed: run `npm --prefix scripts ci` (the SQL runner\'s one dependency, pinned)');
  }
  const mod = await import(pathToFileURL(resolved).href);
  return mod.default ?? mod;
}

/**
 * `put`, `putAllOrNothing` and `end` over one `sync_runner` connection, opened on the first call.
 * A failed connect or statement is rethrown with the DSN taken out; a failed connect leaves no client.
 */
export function openTextPut({ dsn, pg }) {
  let client = null;
  const connected = async () => {
    if (client) return client;
    const fresh = new pg.Client({ connectionString: dsn, application_name: APPLICATION_NAME });
    fresh.on('error', () => {
      // A dropped socket surfaces on the next query as its own error; nothing is lost here.
      if (client === fresh) client = null;
    });
    try {
      await fresh.connect();
    } catch (error) {
      try {
        await fresh.end();
      } catch {
        // Half-open; nothing to close.
      }
      throw error;
    }
    client = fresh;
    return fresh;
  };
  const query = async (sql, params) => {
    try {
      const c = await connected();
      return await c.query(sql, params);
    } catch (error) {
      const wrapped = new Error(redactDsn(error instanceof Error ? error.message : String(error), dsn));
      wrapped.code = error?.code;
      throw wrapped;
    }
  };
  const putter = makeTextPutter(query);
  return {
    ...putter,
    async end() {
      const old = client;
      client = null;
      if (old) await old.end();
    },
  };
}
