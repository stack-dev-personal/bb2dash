/**
 * What Phase 24a's acceptance tests share (`accept24.spec.ts`; the pack is `acceptance/24/` at the
 * root, brief 109, task 45). It stands beside `accept.lib.ts`, which it does not change, and like it
 * imports nothing from `src/`.
 *
 * Here, in this order: the synthetic file and its hash; an answered question, recorded; the
 * conversations a step opened, archived through the list's own button; the owner's session, taken
 * from a read the page itself makes; and the browser's side of an upload, which has no control
 * before 24b, so the test makes the calls the page will make, with the same session.
 *
 * THE FILE IS NEW IN EVERY RUN. An upload's key is the hash of its bytes, over all uploads, so a
 * file with fixed bytes would be found already stored by the run after a stopped one. The bytes are
 * `FILE_PREFIX` and a nonce drawn for the run. The nonce is noted as `nonce_id` (a uuid: the
 * carry-over crosses ids and times, and no 64-character hash), and the host's proofs make the same
 * hash from it with the same words (`acceptance/24/proofs.json`, `upload-*`).
 */

import { createHash, randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Locator, type Page, type Request } from '@playwright/test';
import {
  allowArchive,
  askInto,
  expectShotsShowTheTurn,
  readTurn,
  rowOfConversation,
  shootTurn,
  turnFacts,
  waitClosed,
  type Recorder,
  type TurnReading,
} from './accept.lib';
import { STORED_SETTLE_MS, conversationOf, conversationPath, openSettled, utcNow, workspaceReady } from './walk21.lib';

/* ---------------------------------------------------------------------------
 * The synthetic file
 * ------------------------------------------------------------------------ */

/**
 * The words every run's file starts with. All synthetic: no course text. The host's proofs hold the
 * same words (a test of the pack compares them), so keep this one line, plain ASCII, no quote mark.
 */
export const FILE_PREFIX = 'Marrowbrook archive lamp memo for an acceptance run. The quillfern lamp of the Marrowbrook archive has seven brass hinges and one green shade. Run mark: ';
export const FILE_MIME = 'text/plain';
const UPLOAD_BUCKET = 'workspace-uploads';
/** A signed link is made for seven days (brief 109, Uploads and extraction, The order). */
const SIGNED_URL_SECONDS = 604_800;
const MS_PER_SECOND = 1000;
const TITLE_NONCE_CHARS = 8;
const HTTP_OK = 200;

export interface SyntheticFile {
  nonce: string;
  text: string;
  byteSize: number;
  sha256: string;
  /** The object's key in the bucket: `u/` and the hash. */
  key: string;
}

/** The file of one nonce: its bytes, size, hash and key. The same nonce always gives the same file. */
export function syntheticFile(nonce: string): SyntheticFile {
  const text = `${FILE_PREFIX}${nonce}`;
  const bytes = Buffer.from(text, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { nonce, text, byteSize: bytes.length, sha256, key: `u/${sha256}` };
}

/** A nonce for a run: a fresh lower-case uuid. */
export const newNonce = (): string => randomUUID();

/* ---------------------------------------------------------------------------
 * A question answered, and recorded
 * ------------------------------------------------------------------------ */

export interface AnswerSpec {
  /** The conversation to ask into; null starts one. */
  conversation: string | null;
  question: string;
  /** The badge the answer must carry. */
  badge: string;
}

export interface Answered {
  turn: Locator;
  conversation: string;
  reading: TurnReading;
}

/**
 * Asks one question, waits for the stored answer, records it (facts and the two shots) and asserts
 * it is done, under its badge, with text and no line. The conversation is added to `opened` as soon
 * as it exists, so a step that fails is still archived.
 */
export async function askAndSettle(page: Page, rec: Recorder, spec: AnswerSpec, opened: string[]): Promise<Answered> {
  const turn = await askInto(page, rec, spec.conversation, spec.question);
  return settleAsked(page, rec, turn, spec, opened);
}

/**
 * The second half of `askAndSettle`, for a step that asked on the page as it stood (`askHere`), after
 * setting the composer up: waits for the stored answer, records it and asserts it.
 */
export async function settleAsked(page: Page, rec: Recorder, turn: Locator, spec: AnswerSpec, opened: string[]): Promise<Answered> {
  const conversation = conversationOf(page);
  opened.push(conversation);
  rec.note({ closed_at: await waitClosed(turn) });
  // One messages poll: the stored row has replaced the live text.
  await page.waitForTimeout(STORED_SETTLE_MS);
  const reading = await readTurn(turn);
  rec.note(turnFacts(reading));
  const shots = await shootTurn(page, rec, turn, spec.question);
  await expect(turn).toHaveAttribute('data-turn', 'done');
  await expect(turn.locator('[data-tier]')).toHaveText(spec.badge);
  await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
  await expect(turn.locator('[data-turn-line]')).toHaveCount(0);
  await expectShotsShowTheTurn(turn, spec.question, shots);
  return { turn, conversation, reading };
}

/** The turn's request id as the page carries it. */
export async function requestIdOf(turn: Locator): Promise<number> {
  const id = await turn.getAttribute('data-request-id');
  if (id === null || !/^\d+$/.test(id)) throw new Error('the turn carries no request id');
  return Number(id);
}

/* ---------------------------------------------------------------------------
 * The conversations a step opened
 * ------------------------------------------------------------------------ */

/**
 * Archives conversations through the list's own Archive button, the one table write the shared
 * hooks let through (`allowArchive`). It deletes nothing. Notes `archived_ids` and `archive_writes`.
 */
export async function archiveConversations(page: Page, context: BrowserContext, rec: Recorder, ids: readonly string[]): Promise<void> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return;
  const allowed = await allowArchive(context);
  await openSettled(page, '/workspace');
  await workspaceReady(page);
  for (const id of wanted) {
    const row = rowOfConversation(page, id);
    await expect(row, `conversation ${id} is listed`).toHaveCount(1);
    await row.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(row, `conversation ${id} left the list`).toHaveCount(0);
    rec.note({ archived_ids: wanted.slice(0, wanted.indexOf(id) + 1) });
  }
  rec.note({ archive_writes: allowed.length });
  expect(allowed.length, 'one Archive write for each conversation').toBe(wanted.length);
}

/**
 * Runs a step's body, and then archives every conversation `opened` holds, whether the body passed
 * or not: the pack leaves nothing in his list or his memory. The body's own failure is thrown first.
 */
export async function archiveAfter(
  page: Page,
  context: BrowserContext,
  rec: Recorder,
  opened: readonly string[],
  body: () => Promise<void>,
): Promise<void> {
  let failure: unknown = null;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  try {
    await archiveConversations(page, context, rec, opened);
  } catch (error) {
    if (failure === null) failure = error;
    else console.log(`[accept] the conversations could not be archived: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  if (failure !== null) throw failure;
}

/* ---------------------------------------------------------------------------
 * The owner's session
 * ------------------------------------------------------------------------ */

/** The owner's request headers, taken from a read the page itself makes: used for the calls below, never written down. */
export interface OwnerSession {
  origin: string;
  apikey: string;
  authorization: string;
}

/** A read of the project's REST path whose bearer is the signed-in owner's token and not the public key. */
async function isOwnerRead(request: Request): Promise<boolean> {
  if (request.method() !== 'GET' || !request.url().includes('/rest/v1/')) return false;
  const headers = await request.allHeaders();
  return Boolean(headers['authorization']) && headers['authorization'] !== `Bearer ${headers['apikey']}`;
}

/** Opens the Workspace and takes the owner's session from the first read the page makes with it. */
export async function openWithSession(page: Page): Promise<OwnerSession> {
  const firstRead = page.waitForRequest(isOwnerRead);
  await openSettled(page, '/workspace');
  const request = await firstRead;
  const headers = await request.allHeaders();
  const apikey = headers['apikey'];
  const authorization = headers['authorization'];
  if (!apikey || !authorization) throw new Error('the page sent no signed-in read to take the session from');
  return { origin: new URL(request.url()).origin, apikey, authorization };
}

/* ---------------------------------------------------------------------------
 * The browser's side of an upload
 * ------------------------------------------------------------------------ */

interface ApiCall {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  contentType?: string;
  body?: string;
}

interface ApiReply {
  status: number;
  text: string;
}

async function callApi(page: Page, session: OwnerSession, call: ApiCall): Promise<ApiReply> {
  const headers: Record<string, string> = { apikey: session.apikey, authorization: session.authorization };
  if (call.contentType !== undefined) headers['content-type'] = call.contentType;
  return page.evaluate(
    async ({ url, method, sent, body }) => {
      const response = await fetch(url, { method, headers: sent, body });
      return { status: response.status, text: await response.text() };
    },
    { url: `${session.origin}${call.path}`, method: call.method, sent: headers, body: call.body },
  );
}

function objectOf(text: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${what} answered something that is not JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${what} answered something that is not an object`);
  return parsed as Record<string, unknown>;
}

function expectStatus(reply: ApiReply, what: string): void {
  if (reply.status !== HTTP_OK) throw new Error(`${what} answered ${reply.status}`);
}

/** The ids and states of the upload rows that hold a hash. A read of the table, as the page's list makes. */
export async function uploadRows(page: Page, session: OwnerSession, sha256: string): Promise<Array<{ id: number; state: string }>> {
  const path = `/rest/v1/workspace_documents?select=id,state&kind=eq.upload&sha256=eq.${sha256}`;
  const reply = await callApi(page, session, { method: 'GET', path });
  expectStatus(reply, 'the read of workspace_documents');
  const rows: unknown = JSON.parse(reply.text);
  if (!Array.isArray(rows)) throw new Error('the read of workspace_documents answered no list');
  return rows.map((row: unknown) => {
    const { id, state } = row as { id?: unknown; state?: unknown };
    if (typeof id !== 'number' || typeof state !== 'string') throw new Error('a row of workspace_documents has no id or state');
    return { id, state };
  });
}

async function putObject(page: Page, session: OwnerSession, file: SyntheticFile): Promise<void> {
  const path = `/storage/v1/object/${UPLOAD_BUCKET}/${file.key}`;
  expectStatus(await callApi(page, session, { method: 'POST', path, contentType: FILE_MIME, body: file.text }), 'the upload of the object');
}

/** A signed link for the object, valid seven days, as the browser's client makes it. */
async function signObject(page: Page, session: OwnerSession, file: SyntheticFile): Promise<{ url: string; expiresAt: string }> {
  const path = `/storage/v1/object/sign/${UPLOAD_BUCKET}/${file.key}`;
  const reply = await callApi(page, session, { method: 'POST', path, contentType: 'application/json', body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }) });
  expectStatus(reply, 'the signing of the link');
  const signed = objectOf(reply.text, 'the signing of the link')['signedURL'];
  if (typeof signed !== 'string') throw new Error('the signing of the link answered no signedURL');
  const tail = signed.startsWith('/storage/v1') ? signed : `/storage/v1${signed}`;
  return { url: `${session.origin}${tail}`, expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * MS_PER_SECOND).toISOString() };
}

export interface Registered {
  id: number;
  state: string;
  existing: boolean;
}

async function registerUpload(page: Page, session: OwnerSession, file: SyntheticFile, link: { url: string; expiresAt: string }): Promise<Registered> {
  const body = {
    p_sha256: file.sha256,
    p_title: `Acceptance run memo ${file.nonce.slice(0, TITLE_NONCE_CHARS)}`,
    p_mime: FILE_MIME,
    p_byte_size: file.byteSize,
    p_signed_url: link.url,
    p_signed_url_expires_at: link.expiresAt,
    p_course_id: null,
  };
  const reply = await callApi(page, session, { method: 'POST', path: '/rest/v1/rpc/workspace_upload_register', contentType: 'application/json', body: JSON.stringify(body) });
  expectStatus(reply, 'workspace_upload_register');
  const { id, state, existing } = objectOf(reply.text, 'workspace_upload_register');
  if (typeof id !== 'number' || typeof state !== 'string' || typeof existing !== 'boolean') throw new Error('workspace_upload_register answered without id, state and existing');
  return { id, state, existing };
}

export interface Sent extends Registered {
  /** Whether this send put the object in the bucket. A file whose hash a row already holds uploads nothing. */
  uploaded: boolean;
}

/**
 * The browser's order (brief 109, Uploads and extraction, The order): the hash is known; when a row
 * already holds it nothing is uploaded; otherwise the object goes in under `u/<hash>`. A signed link
 * of 7 days is made and `workspace_upload_register` is called either way, so the answer says
 * `existing`.
 */
export async function sendFile(page: Page, session: OwnerSession, file: SyntheticFile): Promise<Sent> {
  const held = await uploadRows(page, session, file.sha256);
  const uploaded = held.length === 0;
  if (uploaded) await putObject(page, session, file);
  const registered = await registerUpload(page, session, file, await signObject(page, session, file));
  return { ...registered, uploaded };
}

export interface Deleting {
  id: number;
  kind: string;
  state: string;
  storageKey: string | null;
}

/** `workspace_document_delete(id, removed)`: false cuts retrieval and leaves the row in `deleting`; true drops it. */
export async function deleteDocument(page: Page, session: OwnerSession, id: number, objectRemoved: boolean): Promise<Deleting> {
  const body = JSON.stringify({ p_document_id: id, p_object_removed: objectRemoved });
  const reply = await callApi(page, session, { method: 'POST', path: '/rest/v1/rpc/workspace_document_delete', contentType: 'application/json', body });
  expectStatus(reply, `workspace_document_delete(${objectRemoved})`);
  const row = objectOf(reply.text, 'workspace_document_delete');
  const { kind, state } = row;
  const storageKey = row['storage_key'];
  if (typeof kind !== 'string' || typeof state !== 'string' || (storageKey !== null && typeof storageKey !== 'string')) {
    throw new Error('workspace_document_delete answered without kind, state and storage_key');
  }
  return { id, kind, state, storageKey };
}

/** The browser removes the object, because SQL cannot: the bucket's remove call, for one key. */
export async function removeObject(page: Page, session: OwnerSession, key: string): Promise<number> {
  const path = `/storage/v1/object/${UPLOAD_BUCKET}`;
  const reply = await callApi(page, session, { method: 'DELETE', path, contentType: 'application/json', body: JSON.stringify({ prefixes: [key] }) });
  expectStatus(reply, 'the removal of the object');
  const removed: unknown = JSON.parse(reply.text);
  return Array.isArray(removed) ? removed.length : 0;
}

/* ---------------------------------------------------------------------------
 * Phase 24b: the page's own controls (brief 111, task 14)
 * ------------------------------------------------------------------------ */

/*
 * The page's own strings (`src/lib/workspace-labels.ts`). Copied, not imported, as `accept.lib.ts`
 * copies `LATE_STREAM_LINE`: a browser test imports nothing from `src/`. The pack check holds every
 * text the playbook gives as the page's own to the labels file, so a string that drifts fails there.
 */
export const GREETING_LINE = 'What are you working on?';
export const ROUTINES_HEADING = 'Routines';
export const ADD_MENU_LABEL = 'Add';
export const UPLOAD_FROM_DEVICE_LABEL = 'Upload from this device';
export const COURSE_MENU_LABEL = 'Course';
export const DEPTH_MENU_LABEL = 'Depth';
export const DEPTH_STANDARD_LABEL = 'Standard';
export const SHOW_PANEL_LABEL = 'Show panel';
export const HIDE_PANEL_LABEL = 'Hide panel';
export const PANEL_REGION_LABEL = 'Details';
export const FILES_TAB_LABEL = 'Files';
export const MEMORY_TAB_LABEL = 'Memory';
export const FILTER_PLACEHOLDER = 'Filter by title';
export const DELETE_LABEL = 'Delete';
export const CONFIRM_DELETE_LABEL = 'Press again to delete';
export const OPEN_SOURCE_LABEL = 'Open';

/** The course step 17 picks: its display code as the menu shows it, and its id as the options row stores it (`v_course_display`, 2026-10-15). */
export const COURSE_CODE = 'IST 323';
export const COURSE_DISPLAY_ID = 'IST.323';

/** The indexing of a small plain-text file took 2.4 s at the walk (109c, P-7); two minutes is the most a step waits for a chip. */
export const UPLOAD_INDEXED_WAIT_MS = 120_000;
const UPLOAD_LOOK_EVERY_MS = 500;
/** A conversation is quiet after 15 minutes and the runner's idle poll then writes the item: a step reloads the Memory tab until it shows, within the test's own time. */
export const MEMORY_WAIT_MS = 8.5 * 60_000;
export const MEMORY_LOOK_EVERY_MS = 30_000;
/** The word of step 17's question the Memory tab's filter narrows by: the item's title is the conversation's, which is the first question. */
export const MEMORY_FILTER_WORD = 'participation';

/** Today's date in New York, `YYYY-MM-DD`, as the page's date line carries it (`data-today`). */
export function todayNewYork(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** The lobby is up: its root, the greeting, today's date with its weekday, the routines. */
export async function expectLobby(page: Page): Promise<void> {
  await expect(page.locator('[data-lobby]')).toBeVisible();
  await expect(page.getByText(GREETING_LINE, { exact: true })).toBeVisible();
  await expect(page.locator('[data-today]')).toHaveAttribute('data-today', todayNewYork());
  await expect(page.getByText(ROUTINES_HEADING, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
}

/** Opens a menu by its button and picks the entry with exactly this text. */
async function pickFromMenu(page: Page, button: RegExp | string, entry: string): Promise<void> {
  await page.getByRole('button', { name: button }).first().click();
  await page.getByText(entry, { exact: true }).last().click();
}

/** The dashed course chip: its accessible name is "Course: All courses", or "Course: <code>" once a course is picked. */
export async function pickCourse(page: Page, code: string): Promise<void> {
  await pickFromMenu(page, new RegExp(`^${COURSE_MENU_LABEL}: `), code);
  await expect(page.locator('[data-chip="course"]')).toContainText(code);
}

export async function pickDepth(page: Page, label: string): Promise<void> {
  // The button's accessible name is its screen-reader label and its shown value ("Depth Auto").
  await pickFromMenu(page, new RegExp(`^${DEPTH_MENU_LABEL}\\b`), label);
  await expect(page.locator('[data-depth]')).toHaveAttribute('data-depth', label.toLowerCase());
}

/** The file name the page keeps as the upload's title: the nonce's first eight characters make it the run's own. */
export function pageFileName(file: SyntheticFile): string {
  return `acceptance-memo-${file.nonce.slice(0, TITLE_NONCE_CHARS)}.txt`;
}

/**
 * Uploads through the page's own control: the plus menu's entry opens the file dialog, the file is
 * handed to it, and the composer shows the upload as a chip. Returns the chip.
 */
export async function uploadThroughPage(page: Page, file: SyntheticFile): Promise<Locator> {
  await page.getByRole('button', { name: ADD_MENU_LABEL, exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText(UPLOAD_FROM_DEVICE_LABEL, { exact: true }).click();
  await (await chooser).setFiles({ name: pageFileName(file), mimeType: FILE_MIME, buffer: Buffer.from(file.text, 'utf8') });
  const chip = page.locator('[data-chip="upload"]');
  await expect(chip).toHaveCount(1);
  return chip;
}

export interface ChipStates {
  /** Every distinct state the chip showed, in order. */
  seen: string[];
  /** The state the wait ended on: `indexed`, `failed`, or the last seen when time ran out. */
  last: string | null;
  waitedMs: number;
}

/** Watches an upload chip's `data-upload-state` until it reads `indexed` or `failed`, or the wait is over. */
export async function watchUploadStates(page: Page, chip: Locator, waitMs = UPLOAD_INDEXED_WAIT_MS): Promise<ChipStates> {
  const started = Date.now();
  const seen: string[] = [];
  let last: string | null = null;
  while (Date.now() - started < waitMs) {
    last = await chip.getAttribute('data-upload-state');
    if (last !== null && seen.at(-1) !== last) seen.push(last);
    if (last === 'indexed' || last === 'failed') break;
    await page.waitForTimeout(UPLOAD_LOOK_EVERY_MS);
  }
  return { seen, last, waitedMs: Date.now() - started };
}

/** The side panel's region. */
export function panel(page: Page): Locator {
  return page.getByRole('region', { name: PANEL_REGION_LABEL });
}

/** Opens the panel on a tab, through the Show panel button when it is folded, and the tab's own control. */
export async function openPanelTab(page: Page, tab: string): Promise<Locator> {
  if ((await page.locator('[data-panel]').count()) === 0) {
    await page.getByRole('button', { name: SHOW_PANEL_LABEL, exact: true }).click();
  }
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await expect(page.locator('[data-panel]')).toHaveAttribute('data-panel', tab.toLowerCase());
  return panel(page);
}

export async function hidePanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: HIDE_PANEL_LABEL, exact: true }).click();
  await expect(page.locator('[data-panel]')).toHaveCount(0);
}

/** Types into the open tab's filter field, which narrows the rows on the page and sends nothing. */
export async function filterPanel(page: Page, text: string): Promise<void> {
  await panel(page).getByPlaceholder(FILTER_PLACEHOLDER).fill(text);
}

/** The Files tab's rows that carry an upload state and this title. */
export function fileRows(page: Page, title: string): Locator {
  return panel(page).locator('[data-upload-state]').filter({ hasText: title });
}

/** Delete, then its second press. The row that carried the button leaves the page. */
export async function deleteTwice(page: Page, scope: Locator): Promise<void> {
  await scope.getByRole('button', { name: DELETE_LABEL, exact: true }).first().click();
  await panel(page).getByRole('button', { name: CONFIRM_DELETE_LABEL, exact: true }).first().click();
}

/** The address of a conversation with the panel open on a tab. */
export function panelPath(conversation: string | null, tab: string): string {
  const base = conversationPath(conversation);
  return `${base}${base.includes('?') ? '&' : '?'}panel=${tab.toLowerCase()}`;
}

export interface MemoryWait {
  shown: boolean;
  waitedMs: number;
  reloads: number;
  firstSeenAt: string | null;
}

/**
 * Reloads the Memory tab of a conversation until one remembered item matches the filter, or the wait
 * is over. The runner writes the item once the conversation has been quiet for 15 minutes; the page
 * reads the list on load, so the test reloads rather than waits on one page.
 */
export async function waitForMemoryItem(page: Page, conversation: string, filter: string, waitMs = MEMORY_WAIT_MS): Promise<MemoryWait> {
  const started = Date.now();
  let reloads = 0;
  for (;;) {
    await openSettled(page, panelPath(conversation, MEMORY_TAB_LABEL));
    await workspaceReady(page);
    await expect(page.locator('[data-panel]')).toHaveAttribute('data-panel', MEMORY_TAB_LABEL.toLowerCase());
    await filterPanel(page, filter);
    reloads += 1;
    if ((await panel(page).getByRole('button', { name: DELETE_LABEL, exact: true }).count()) >= 1) {
      return { shown: true, waitedMs: Date.now() - started, reloads, firstSeenAt: utcNow() };
    }
    if (Date.now() - started >= waitMs) return { shown: false, waitedMs: Date.now() - started, reloads, firstSeenAt: null };
    await page.waitForTimeout(MEMORY_LOOK_EVERY_MS);
  }
}
