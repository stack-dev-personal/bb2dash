/**
 * Steps 8 and 9 of a pass: pull the files the fold catalogued, then finish the embedding.
 *
 * Per row of `sync_file_worklist()`:
 *   * walk the redirect hops in the runner's logged-in context and download the signed URL, both
 *     with Phase 18's signed-fetch module (this file has no copy of that fetch); take the sha256;
 *   * POST the bytes to Storage `bb-files/<key>` (only characters Storage accepts; W-73) with the
 *     publishable key, never `x-upsert`; a 409 or a Duplicate answer goes on for a course file whose
 *     key is the catalogue's own spelling and is never done for a submission or a sanitised key (R2 item 2);
 *   * move the download from tmpfs into course-files (copy-then-unlink on EXDEV, P-104);
 *   * extract with the locked `extract_text.py` project, and put the units through
 *     `sync_file_text_put(…)` (200) over the runner's own pg connection (Phase 25a: the REST insert
 *     with the publishable key is gone; units already there are kept and counted as present);
 *   * record the row through `sync_file_stored(…)`, which writes the prefixes itself.
 * A 401/403 at the first hop stops the step only when the login check then finds users/me dead
 * (R2 item 3); otherwise that file is `refused`; `gone`, `refused` and a refused
 * Storage 409 go to the report's `not_pulled`. A redirect to another SITE (`offsite`, 164) is not an
 * error: once the login check finds the session alive, the link is saved on the row through
 * `sync_file_outside_link(…)` and counted as `linked`; the target is never requested. A redirect to a Blackboard host off the allow-list stays `refused`. Keys and checks are `ingest/pull_files.mjs`'s
 * exported pure helpers; its `main`, whose update SQL is the owner's, is never run.
 *
 * `ingest/embed_corpus.mjs`'s loop runs once on every pass, in-process, whether or not this pass posted a unit
 * (Phase 24a); `report.ts` decides what a failure on a pass with no new unit means.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { makePost, runEmbedLoop } from '../../ingest/embed_corpus.mjs';
import { downloadTo, resolveSignedUrl } from '../../ingest/fetch_signed.mjs';
import {
  BUCKET,
  anonHeaders,
  bytesLookValid,
  downloadNameFor,
  encodeKey,
  extractUnits,
  isDuplicateAnswer,
  mimeFor,
  occupiedKeyRefusal,
  storageKeyFor,
} from '../../ingest/pull_files.mjs';
import type { FileStoredArgs, SyncRpc, TextUnit, WorklistRow } from './db.js';
import type { Verdict } from './login.js';
import type { FilesStepResult } from './loop.js';
import type { NotPulled } from './report.js';

const HTTP_CONFLICT = 409;
const EXTRACT_TIMEOUT_MS = 300_000;
/** R2 item 5: the most the embed step may take before the pass fails it cleanly. */
export const EMBED_TIMEOUT_MS = 600_000;
const HTTP_REQUEST_TIMEOUT = 408;

export interface ExtractUnit {
  unit_kind: string;
  unit_no: number;
  text: string;
}

export interface HttpAnswer {
  status: number;
  body: string;
}

export interface MoveOps {
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  copyFile(from: string, to: string): Promise<unknown>;
  unlink(file: string): Promise<unknown>;
}

export interface FileOps extends MoveOps {
  readFile(file: string): Promise<Buffer>;
}

export interface FilesPorts {
  rpc: Pick<SyncRpc, 'fileWorklist' | 'fileStored' | 'fileOutsideLink' | 'fileTextPut'>;
  /** One hop, redirects not followed, in the logged-in context (Playwright's request.get). */
  hop(url: string): Promise<{ status: number; headers: Record<string, string> }>;
  /** The signed-URL download; a signed URL carries its own authorisation. */
  fetchSigned(url: string): Promise<Response>;
  storagePost(key: string, bytes: Buffer, mime: string): Promise<HttpAnswer>;
  extract(filePath: string): Promise<ExtractUnit[]>;
  embed(): Promise<{ code: number; tail: string }>;
  fs: FileOps;
  /** tmpfs in the container; downloads land here first. */
  tmpDir: string;
  /** The course-files volume, mounted at `/app/course context`. */
  courseFilesDir: string;
  /** The login watch's check (users/me, with its silent re-login), asked when a file answers 401/403. */
  loginCheck(): Promise<Verdict>;
  /** Called once per file: the files step is progress for the watchdog and the heartbeat (R2 item 5). */
  progress?(): void;
  log(line: string): void;
}

/** 200's SQLSTATE for a file over its size caps (program_limit_exceeded); its other refusals are 22023. */
export const TEXT_TOO_LARGE_SQLSTATE = '54000';

/** True when sync_file_text_put refused a file because its text is too large to store. */
export function isTextTooLarge(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === TEXT_TOO_LARGE_SQLSTATE;
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

/** `base/relpath`, or null when the relpath is empty, absolute or climbs out of base. */
export function safeJoin(base: string, relpath: string): string | null {
  if (!relpath || path.isAbsolute(relpath) || path.win32.isAbsolute(relpath)) return null;
  const root = path.resolve(base);
  const full = path.resolve(root, relpath);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * The units `sync_file_text_put` takes: kind, number and text only. A unit with blank text is not
 * sent: 200 refuses it, and extract_text.py writes one for a .docx with no paragraphs.
 */
export function textUnits(units: readonly ExtractUnit[]): TextUnit[] {
  return units
    .filter((u) => typeof u.text === 'string' && u.text.trim() !== '')
    .map((u) => ({ unit_kind: u.unit_kind, unit_no: u.unit_no, text: u.text }));
}

/** Move a file across devices if it must: rename, and on EXDEV copy then unlink. Never a bare rename. */
export async function moveIntoPlace(from: string, to: string, ops: MoveOps): Promise<void> {
  await ops.mkdir(path.dirname(to), { recursive: true });
  try {
    await ops.rename(from, to);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'EXDEV') throw error;
    await ops.copyFile(from, to);
    await ops.unlink(from);
  }
}

async function removeQuietly(ops: FileOps, file: string): Promise<void> {
  try {
    await ops.unlink(file);
  } catch {
    // Already gone, or never written: a temp file is best-effort.
  }
}

type RowResult =
  | { pulled: true; unitsPosted: number }
  | { pulled: false; linked: true }
  | { pulled: false; linked?: undefined; reason: string; stop?: true };

/** The host of a link, for a log line or a reason: never the path or query, which may carry a signature. */
function hostOnly(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown host';
  }
}

/** 164: a Blackboard file whose link goes to another site. Saved as that link, or left flagged. */
async function saveOutsideLink(row: WorklistRow, target: string, p: FilesPorts): Promise<RowResult> {
  const host = hostOnly(target);
  // A dead Blackboard session can redirect a file URL anywhere, a sign-in page included. The walk keeps
  // the obvious ones out; this is the backstop: nothing is saved while the login is not known to be alive.
  const verdict = await p.loginCheck();
  if (verdict === 'dead') {
    return { pulled: false, reason: `session_expired: the login check found the session dead before saving a link to ${host}`, stop: true };
  }
  if (verdict !== 'alive') {
    return { pulled: false, reason: `offsite: ${host}, but the login check did not answer, so the link was not saved` };
  }
  let saved = false;
  try {
    saved = await p.rpc.fileOutsideLink(row.id, target);
  } catch (error) {
    return { pulled: false, reason: `offsite: ${host}, sync_file_outside_link refused: ${message(error)}` };
  }
  if (!saved) {
    return { pulled: false, reason: `offsite: ${host}, but the database kept the row as it was (stored, superseded or gone)` };
  }
  p.log(`files: ${row.id} is a link to ${host}; saved as an outside link`);
  return { pulled: false, linked: true };
}

async function pullOne(row: WorklistRow, p: FilesPorts): Promise<RowResult> {
  const dest = safeJoin(p.courseFilesDir, row.relpath);
  if (!dest) return { pulled: false, reason: 'unsafe relpath' };

  const chain = await resolveSignedUrl(p.hop, row.source_url);
  if (chain.outcome === 'session_expired') {
    // R2 item 3: one file's 401/403 is not a dead login. Only a dead users/me (after the watch's
    // silent re-login) stops the step; otherwise this one file was refused.
    const verdict = await p.loginCheck();
    if (verdict === 'dead') return { pulled: false, reason: `session_expired: ${chain.reason}`, stop: true };
    const why = verdict === 'alive' ? 'but the login check passed' : 'and the login check did not answer';
    return { pulled: false, reason: `refused: ${chain.reason} at the first hop, ${why}` };
  }
  if (chain.outcome === 'offsite' && 'target' in chain && typeof chain.target === 'string') {
    return saveOutsideLink(row, chain.target, p);
  }
  if (chain.outcome !== 'ok' || !('signedUrl' in chain) || typeof chain.signedUrl !== 'string') {
    return { pulled: false, reason: `${chain.outcome}: ${chain.reason ?? 'no signed URL'}` };
  }

  const tmp = path.join(p.tmpDir, downloadNameFor(row));
  const got = await downloadTo(p.fetchSigned, chain.signedUrl, tmp);
  if (got.outcome !== 'ok') return { pulled: false, reason: `${got.outcome}: ${got.reason}` };

  try {
    const bytes = await p.fs.readFile(tmp);
    const mime: string = mimeFor(row);
    if (!bytesLookValid(bytes, mime)) {
      return { pulled: false, reason: `bad bytes: ${bytes.length} bytes, magic ${bytes.subarray(0, 4).toString('hex')}` };
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key: string = storageKeyFor(row);

    const up = await p.storagePost(key, bytes, mime);
    if (up.status === HTTP_CONFLICT || isDuplicateAnswer(up.status, up.body)) {
      // R2 item 2: a course file's key comes from the catalogue, so the object there is this file
      // (an earlier pass uploaded it and then failed later); go on. A submission's key must never
      // be shared (052), and a sanitised one may be another name's (W-73), so either is a human's call.
      const refusal = occupiedKeyRefusal(row);
      if (refusal) return { pulled: false, reason: `storage 409: ${refusal}` };
      p.log(`files: ${row.id} is already in Storage under its catalogue key; recording it`);
    } else if (up.status < 200 || up.status > 299) {
      return { pulled: false, reason: `storage ${up.status}: ${up.body.slice(0, 200)}` };
    }

    await moveIntoPlace(tmp, dest, p.fs);

    let units: ExtractUnit[] = [];
    try {
      units = await p.extract(dest);
    } catch (error) {
      p.log(`files: extract failed for ${row.id}: ${message(error)}`);
    }

    const put = textUnits(units);
    let unitsPosted = 0;
    let textStored = put.length > 0;
    if (put.length > 0) {
      try {
        const answer = await p.rpc.fileTextPut(row.id, put);
        unitsPosted = answer.inserted;
        // A file whose text an agent extracted before its bytes reached Storage (file 163): those units
        // are kept, and the bytes still land.
        if (answer.present > 0) p.log(`files: ${row.id} already had ${answer.present} of ${put.length} text unit(s); kept`);
      } catch (error) {
        // Too large to store (200's caps): recorded as a failed extraction is, text_status failed, so
        // the next sync does not download the file again. Any other refusal leaves the row unstored.
        if (!isTextTooLarge(error)) return { pulled: false, reason: `sync_file_text_put refused: ${message(error).slice(0, 200)}` };
        p.log(`files: ${row.id} text not stored, too large for sync_file_text_put (${message(error).slice(0, 200)}); stored with text_status failed`);
        textStored = false;
      }
    }

    const args: FileStoredArgs = {
      id: row.id,
      key,
      relpath: row.relpath,
      sha256,
      bytes: bytes.length,
      mime,
      textStatus: textStored ? 'extracted' : 'failed',
    };
    let stored = false;
    try {
      stored = await p.rpc.fileStored(args);
    } catch (error) {
      return { pulled: false, reason: `sync_file_stored refused: ${message(error)}` };
    }
    if (!stored) return { pulled: false, reason: 'already stored by another writer' };
    return { pulled: true, unitsPosted };
  } finally {
    await removeQuietly(p.fs, tmp);
  }
}

/** The files step and the embed step. Throws only when the worklist itself cannot be read. */
export async function runFilesStep(p: FilesPorts): Promise<FilesStepResult> {
  const rows = await p.rpc.fileWorklist();
  const notPulled: NotPulled[] = [];
  let pulled = 0;
  let linked = 0;
  let unitsPosted = 0;
  let stopped: FilesStepResult['stopped'] = null;

  for (const row of rows) {
    p.progress?.();
    let result: RowResult;
    try {
      result = await pullOne(row, p);
    } catch (error) {
      result = { pulled: false, reason: message(error) };
    }
    if (result.pulled) {
      pulled += 1;
      unitsPosted += result.unitsPosted;
      continue;
    }
    if (result.linked) {
      linked += 1;
      continue;
    }
    notPulled.push({ id: row.id, reason: result.reason });
    if (result.stop) {
      stopped = 'session_expired';
      p.log(`files: the Blackboard session expired at file ${row.id}; ${rows.length - pulled - linked - notPulled.length} left for the next sync`);
      break;
    }
  }
  p.log(`files: ${pulled} pulled, ${linked} saved as links, ${notPulled.length} not pulled, ${unitsPosted} units posted`);

  // Phase 24a: the loop runs on every pass, so a unit that could not embed last time is tried again
  // even when this pass posted none. The report decides what a failure with no new unit means.
  let embedError: string | null = null;
  const run = await p.embed();
  if (run.code !== 0) embedError = `embed_corpus.mjs's loop ended ${run.code}: ${run.tail}`;

  return { files: { pulled, not_pulled: notPulled, ...(linked > 0 ? { linked } : {}) }, stopped, embedError, unitsPosted };
}

/**
 * The Storage POST with the publishable key (`SB_ANON_KEY`), as pull_files.mjs does. Text units no
 * longer go over REST (Phase 25a): they are `sync_file_text_put`'s, through the runner's pg login.
 */
export function makeSupabaseFiles(supabaseUrl: string, anonKey: string, fetchImpl: typeof fetch = fetch) {
  return {
    async storagePost(key: string, bytes: Buffer, mime: string): Promise<HttpAnswer> {
      const res = await fetchImpl(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeKey(key)}`, {
        method: 'POST',
        headers: anonHeaders(anonKey, mime),
        body: new Uint8Array(bytes),
      });
      return { status: res.status, body: await res.text() };
    },
  };
}

/** The parts of the environment `uv` needs to find itself, its cache and Python; nothing else. */
const UV_ENV_KEYS = /^(PATH|Path|HOME|USERPROFILE|SYSTEMROOT|SystemRoot|TEMP|TMP|TMPDIR|LANG|LC_ALL|XDG_CACHE_HOME|XDG_DATA_HOME|UV_[A-Z_]+|PYTHON[A-Z_]*)$/;

export function uvEnv(parent: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && UV_ENV_KEYS.test(key)) out[key] = value;
  }
  return out;
}

export type ExecSyncFn = (
  file: string,
  args: string[],
  opts: { cwd: string; encoding: 'utf8'; maxBuffer: number; env: Record<string, string>; timeout: number },
) => string;

/**
 * R2 item 9: pull_files.mjs's `extractUnits` (the locked project: `uv run --locked --project ingest
 * python ingest/extract_text.py <file>`, W-56's task 14), with a child environment of only what uv
 * needs: no secret of the runner's reaches it.
 */
export function makeExtractor(
  ingestDir: string,
  opts: { exec?: ExecSyncFn; parentEnv?: Record<string, string | undefined> } = {},
) {
  const exec = opts.exec ?? (execFileSync as unknown as ExecSyncFn);
  const env = uvEnv(opts.parentEnv ?? process.env);
  // extractUnits' runner is typed from its execFileSync default; this one adds the env and a timeout.
  const runner = (cmd: string, args: string[], o: { cwd: string; encoding: 'utf8'; maxBuffer: number }) =>
    exec(cmd, args, { ...o, env, timeout: EXTRACT_TIMEOUT_MS });
  return async (filePath: string): Promise<ExtractUnit[]> =>
    extractUnits(ingestDir, filePath, runner as unknown as typeof execFileSync) as ExtractUnit[];
}

/** runEmbedLoop as this file calls it (its JS defaults type it too narrowly to call with post). */
export type EmbedLoopFn = (o: {
  post: (body: object) => Promise<{ status: number; body: unknown }>;
  log: (line: string) => void;
}) => Promise<unknown>;

export interface EmbedderOptions {
  supabaseUrl: string;
  /** The legacy anon JWT (`SB_ANON_JWT`): `embed-corpus` has verify_jwt on. */
  jwt: string;
  log: (line: string) => void;
  runLoop?: EmbedLoopFn;
  makePost?: typeof makePost;
  /** Defaults to EMBED_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * R2 item 9: `embed_corpus.mjs`'s own loop, in-process, until `remaining_parts = 0`. No child process.
 * R2 item 5: at most EMBED_TIMEOUT_MS; past it the step fails cleanly, and any later post answers
 * 408 so the loop (which treats a non-retry status as final) ends without another call.
 */
export function makeEmbedder(o: EmbedderOptions) {
  const loop = o.runLoop ?? (runEmbedLoop as unknown as EmbedLoopFn);
  const realPost = (o.makePost ?? makePost)(o.supabaseUrl, o.jwt);
  const timeoutMs = o.timeoutMs ?? EMBED_TIMEOUT_MS;
  return async (): Promise<{ code: number; tail: string }> => {
    let timedOut = false;
    const post = async (body: object) =>
      timedOut ? { status: HTTP_REQUEST_TIMEOUT, body: { error: 'the embed step timed out' } } : realPost(body);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const limit = new Promise<{ exitCode: number; error: string }>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve({ exitCode: 1, error: `embed timed out after ${Math.round(timeoutMs / 1000)} s` });
      }, timeoutMs);
    });
    try {
      const result = (await Promise.race([loop({ post, log: o.log }), limit])) as {
        exitCode: number;
        remainingParts?: number | null;
        error?: string;
      };
      const tail = result.exitCode === 0 ? `remaining_parts=${result.remainingParts ?? 0}` : String(result.error ?? 'embed failed');
      return { code: result.exitCode, tail: tail.slice(0, 300) };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };
}
