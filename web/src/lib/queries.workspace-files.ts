/**
 * bb2dash — uploads, the bucket, and the two-step delete (Phase 24b, brief 111,
 * task 5; "Uploading from his device", "Deleting an upload").
 *
 *   `workspace_documents`          the catalog: an upload's title, course, state and hash
 *   `workspace_upload_register()`  a stored object becomes an upload row (or the row that holds its hash)
 *   `workspace_upload_retry()`     a failed upload gets a new link and goes back to `stored`
 *   `workspace_document_delete()`  called twice for an upload, once for a remembered item
 *   the bucket `workspace-uploads` an object per content, keyed `u/<sha256>`
 *
 * THE ORDER 24a FIXES. The rules first (`workspace-upload-rules.ts`), then the
 * hash; a row that already holds the hash means nothing is uploaded and that
 * row is used; otherwise the object goes into the bucket under the hash's key
 * with the rules' content type, a link of 7 days is signed, and the register
 * call carries the hash. A delete is the first call (the file leaves search,
 * the row reads "removing"), the object's removal by the key that call
 * returned, then the second call, which drops the row; a failed removal makes
 * no second call, so the row stays `deleting` with Try again.
 *
 * The flows run through `UploadFlowPorts`, so a test drives them with fakes and
 * the page with `browserUploadPorts()`. WHAT IS NEVER READ: `signed_url` and
 * `signed_url_expires_at`; the select list names its columns. No module here
 * reads a document's units or vectors.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { asRecord } from './json-record';
import { parseConversationId, toRequestId } from './queries.workspace';
import { WorkspaceOptionsRefusal } from './queries.workspace-ask';
import { untypedClient } from './queries.sync';
import { getSupabaseBrowserClient } from './supabase/client';
import {
  WORKSPACE_UPLOAD_MAX_BYTES,
  WORKSPACE_UPLOAD_TITLE_MAX,
  WORKSPACE_UPLOAD_TYPES,
  checkUploadRules,
  storageKeyFor,
} from './workspace-upload-rules';

/* ---------------------------------------------------------------------------
 * Constants and vocabularies
 * ------------------------------------------------------------------------ */

export const WORKSPACE_UPLOADS_BUCKET = 'workspace-uploads';
/** The registered link: 7 days, long enough for the ingest worker's retries. */
export const WORKSPACE_UPLOAD_LINK_SECONDS = 604_800;
/** Open on an upload source row. */
export const WORKSPACE_UPLOAD_OPEN_LINK_SECONDS = 3_600;
export const WORKSPACE_UPLOADS_REFETCH_MS = 5_000;

export type WorkspaceDocumentKind = 'upload' | 'memory';
export type WorkspaceDocumentState = 'stored' | 'reading' | 'text_ready' | 'indexed' | 'failed' | 'deleting';
export type WorkspaceUploadErrorCode =
  | 'too_large'
  | 'bad_type'
  | 'bad_bytes'
  | 'no_text'
  | 'extract_timeout'
  | 'extract_failed'
  | 'too_many_units'
  | 'link_expired'
  | 'download_failed'
  | 'embed_failed';

const DOCUMENT_KINDS: readonly WorkspaceDocumentKind[] = ['upload', 'memory'];

export const WORKSPACE_DOCUMENT_STATES: readonly WorkspaceDocumentState[] = Object.freeze([
  'stored',
  'reading',
  'text_ready',
  'indexed',
  'failed',
  'deleting',
]);

export const WORKSPACE_UPLOAD_ERROR_CODES: readonly WorkspaceUploadErrorCode[] = Object.freeze([
  'too_large',
  'bad_type',
  'bad_bytes',
  'no_text',
  'extract_timeout',
  'extract_failed',
  'too_many_units',
  'link_expired',
  'download_failed',
  'embed_failed',
]);

/** One `workspace_documents` row, without its signed link. */
export interface WorkspaceDocument {
  id: number;
  kind: WorkspaceDocumentKind;
  title: string;
  state: WorkspaceDocumentState;
  error_code: WorkspaceUploadErrorCode | null;
  mime: string | null;
  byte_size: number | null;
  sha256: string | null;
  storage_key: string | null;
  course_id: string | null;
  conversation_id: string | null;
  attempts: number;
  created_at: string | null;
  updated_at: string | null;
}

const DOCUMENT_COLUMNS =
  'id, kind, title, state, error_code, mime, byte_size, sha256, storage_key, course_id, conversation_id, ' +
  'attempts, created_at, updated_at';

const UPLOAD_KIND: WorkspaceDocumentKind = 'upload';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SQLSTATE_NOT_OWNER = '42501';
const HTTP_CONFLICT = 409;
const MS_PER_SECOND = 1_000;

export const workspaceFileKeys = { uploads: () => ['workspace', 'uploads'] as const } as const;

/* ---------------------------------------------------------------------------
 * Normalisers and checks (pure)
 * ------------------------------------------------------------------------ */

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function wholeOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** One `workspace_documents` row; null when it has no id, title, or known kind or state. */
export function normalizeDocument(row: unknown): WorkspaceDocument | null {
  const raw = asRecord(row);
  const id = toRequestId(raw?.id);
  const kind = oneOf(DOCUMENT_KINDS, raw?.kind);
  const state = oneOf(WORKSPACE_DOCUMENT_STATES, raw?.state);
  if (!raw || id === null || kind === null || state === null || typeof raw.title !== 'string') return null;
  const sha256 = typeof raw.sha256 === 'string' && SHA256_HEX.test(raw.sha256) ? raw.sha256 : null;
  return {
    id,
    kind,
    title: raw.title,
    state,
    error_code: oneOf(WORKSPACE_UPLOAD_ERROR_CODES, raw.error_code),
    mime: textOrNull(raw.mime),
    byte_size: wholeOrNull(raw.byte_size),
    sha256,
    storage_key: textOrNull(raw.storage_key),
    course_id: textOrNull(raw.course_id),
    conversation_id: parseConversationId(raw.conversation_id),
    attempts: wholeOrNull(raw.attempts) ?? 0,
    created_at: textOrNull(raw.created_at),
    updated_at: textOrNull(raw.updated_at),
  };
}

function normalizeDocuments(data: unknown): WorkspaceDocument[] {
  return (Array.isArray(data) ? data : []).flatMap((row: unknown) => normalizeDocument(row) ?? []);
}

function assertDocumentId(value: number): number {
  if (toRequestId(value) !== value) throw new Error(`document id must be a positive integer, got ${String(value)}`);
  return value;
}

function assertSha256(value: string): string {
  if (!SHA256_HEX.test(value)) throw new Error('a content hash must be 64 lower-case hex characters');
  return value;
}

/** A title as the database takes it: trimmed, 1 to 200 characters as `char_length` counts them. */
function assertTitle(value: string): string {
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  if (length < 1 || length > WORKSPACE_UPLOAD_TITLE_MAX) {
    throw new Error(`a title must be 1 to ${WORKSPACE_UPLOAD_TITLE_MAX} characters`);
  }
  return trimmed;
}

/** The refusal a call on one of the four owner-only functions stands for: 42501 only. */
export function refusalForDocumentCall(error: unknown): WorkspaceOptionsRefusal | null {
  return asRecord(error)?.code === SQLSTATE_NOT_OWNER ? new WorkspaceOptionsRefusal('not_owner') : null;
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------ */

/** Any row still on its way: neither indexed nor failed. */
export function uploadsSettling(rows: readonly WorkspaceDocument[] | undefined): boolean {
  return rows?.some((row) => row.state !== 'indexed' && row.state !== 'failed') ?? false;
}

/** The uploads, newest first, re-read every 5 s while one is settling. */
export function uploadsOptions() {
  return queryOptions({
    queryKey: workspaceFileKeys.uploads(),
    queryFn: async (): Promise<WorkspaceDocument[]> => {
      const { data, error } = await untypedClient()
        .from('workspace_documents')
        .select(DOCUMENT_COLUMNS)
        .eq('kind', UPLOAD_KIND)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return normalizeDocuments(data);
    },
    refetchInterval: (query) => (uploadsSettling(query.state.data) ? WORKSPACE_UPLOADS_REFETCH_MS : false),
  });
}

export function useWorkspaceUploads() {
  return useQuery(uploadsOptions());
}

/** The rows whose title holds the filter, any case; a blank filter keeps every row. Sends nothing. */
export function filterByTitle<T extends { title: string }>(rows: readonly T[], filter: string): T[] {
  const needle = filter.trim().toLowerCase();
  return needle === '' ? [...rows] : rows.filter((row) => row.title.toLowerCase().includes(needle));
}

/** The upload row that already holds a content hash, in any state, or null. */
export async function findUploadBySha256(sha256: string): Promise<WorkspaceDocument | null> {
  const hash = assertSha256(sha256);
  const { data, error } = await untypedClient()
    .from('workspace_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('kind', UPLOAD_KIND)
    .eq('sha256', hash)
    .limit(1);
  if (error) throw error;
  return normalizeDocuments(data)[0] ?? null;
}

/* ---------------------------------------------------------------------------
 * The four calls and the two column writes
 * ------------------------------------------------------------------------ */

export interface RegisterUploadInput {
  sha256: string;
  title: string;
  mime: string;
  byteSize: number;
  signedUrl: string;
  signedUrlExpiresAt: string;
  courseId: string | null;
}

export interface RegisterUploadResult {
  id: number;
  state: WorkspaceDocumentState;
  existing: boolean;
}

export interface DeleteDocumentResult {
  id: number;
  kind: WorkspaceDocumentKind;
  state: 'deleting' | 'deleted';
  storageKey: string | null;
}

/** Call one of the owner's functions: 42501 is the not-owner refusal, any other error is thrown as it came. */
async function callDocumentFunction(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await untypedClient().rpc(name, args);
  if (error) throw refusalForDocumentCall(error) ?? error;
  const raw = asRecord(data);
  if (raw === null) throw new Error(`${name} returned no object`);
  return raw;
}

function requireText(value: string, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${what} is required`);
  return value;
}

function checkRegisterInput(input: RegisterUploadInput): void {
  assertSha256(input.sha256);
  if (assertTitle(input.title) !== input.title) throw new Error('a title must be given trimmed');
  if (!WORKSPACE_UPLOAD_TYPES.some((type) => type.mime === input.mime)) throw new Error('not one of the six types');
  const size = input.byteSize;
  if (!Number.isSafeInteger(size) || size < 1 || size > WORKSPACE_UPLOAD_MAX_BYTES) {
    throw new Error(`a size must be 1 to ${WORKSPACE_UPLOAD_MAX_BYTES} bytes`);
  }
  requireText(input.signedUrl, 'a signed link');
  requireText(input.signedUrlExpiresAt, 'the link`s expiry');
  if (input.courseId !== null) requireText(input.courseId, 'a course id');
}

/** A stored object becomes an upload row, or the row that already holds its hash (`existing`). */
export async function registerUpload(input: RegisterUploadInput): Promise<RegisterUploadResult> {
  checkRegisterInput(input);
  const raw = await callDocumentFunction('workspace_upload_register', {
    p_sha256: input.sha256,
    p_title: input.title,
    p_mime: input.mime,
    p_byte_size: input.byteSize,
    p_signed_url: input.signedUrl,
    p_signed_url_expires_at: input.signedUrlExpiresAt,
    p_course_id: input.courseId,
  });
  const id = toRequestId(raw.id);
  const state = oneOf(WORKSPACE_DOCUMENT_STATES, raw.state);
  if (id === null || state === null) throw new Error('workspace_upload_register did not return an id and a state');
  return { id, state, existing: raw.existing === true };
}

/** A failed upload with a new link goes back to `stored`. */
export async function retryUpload(input: {
  documentId: number;
  signedUrl: string;
  signedUrlExpiresAt: string;
}): Promise<{ id: number; state: WorkspaceDocumentState }> {
  const raw = await callDocumentFunction('workspace_upload_retry', {
    p_document_id: assertDocumentId(input.documentId),
    p_signed_url: requireText(input.signedUrl, 'a signed link'),
    p_signed_url_expires_at: requireText(input.signedUrlExpiresAt, 'the link`s expiry'),
  });
  const id = toRequestId(raw.id);
  const state = oneOf(WORKSPACE_DOCUMENT_STATES, raw.state);
  if (id === null || state === null) throw new Error('workspace_upload_retry did not return an id and a state');
  return { id, state };
}

const DELETE_STATES: readonly DeleteDocumentResult['state'][] = ['deleting', 'deleted'];

/** One step of a delete: `false` takes the file out of search, `true` drops a row in `deleting`. */
export async function deleteDocument(documentId: number, objectRemoved: boolean): Promise<DeleteDocumentResult> {
  const raw = await callDocumentFunction('workspace_document_delete', {
    p_document_id: assertDocumentId(documentId),
    p_object_removed: objectRemoved === true,
  });
  const id = toRequestId(raw.id);
  const kind = oneOf(DOCUMENT_KINDS, raw.kind);
  const state = oneOf(DELETE_STATES, raw.state);
  if (id === null || kind === null || state === null) {
    throw new Error('workspace_document_delete did not return an id, a kind and a state');
  }
  return { id, kind, state, storageKey: textOrNull(raw.storage_key) };
}

/** Write one of an upload's two editable columns. */
async function updateUpload(documentId: number, patch: { course_id: string | null } | { title: string }): Promise<void> {
  const id = assertDocumentId(documentId);
  const { error } = await untypedClient().from('workspace_documents').update(patch).eq('id', id).eq('kind', UPLOAD_KIND);
  if (error) throw error;
}

/** Tag an upload with a course, or with none. */
export async function setUploadCourse(documentId: number, courseId: string | null): Promise<void> {
  assertDocumentId(documentId);
  const course = courseId === null ? null : requireText(courseId, 'a course id');
  await updateUpload(documentId, { course_id: course });
}

/** Rename an upload: trimmed, 1 to 200 characters. */
export async function setUploadTitle(documentId: number, title: string): Promise<void> {
  assertDocumentId(documentId);
  await updateUpload(documentId, { title: assertTitle(title) });
}

/* ---------------------------------------------------------------------------
 * The hash and the bucket
 * ------------------------------------------------------------------------ */

const HEX_RADIX = 16;
const BYTE_HEX_WIDTH = 2;

/** The blob's SHA-256 as 64 lower-case hex characters. `subtle` is Web Crypto's; tests pass Node's. */
export async function sha256Hex(blob: Blob, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<string> {
  if (subtle === undefined) throw new Error('Web Crypto is not available to hash the file');
  const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(HEX_RADIX).padStart(BYTE_HEX_WIDTH, '0')).join('');
}

/** The three storage steps an upload flow needs. */
export interface UploadStore {
  /** Put an object; one already there under the key is the same bytes and is not an error. */
  putObject(key: string, blob: Blob, contentType: string): Promise<void>;
  signUrl(key: string, seconds: number): Promise<{ url: string; expiresAt: string }>;
  removeObject(key: string): Promise<void>;
}

/** An object already under the key: storage answers 409. */
function isConflict(error: unknown): boolean {
  const raw = asRecord(error);
  return raw?.status === HTTP_CONFLICT || raw?.statusCode === String(HTTP_CONFLICT);
}

function bucket() {
  return getSupabaseBrowserClient().storage.from(WORKSPACE_UPLOADS_BUCKET);
}

async function signedUrlOf(key: string, seconds: number): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(key, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Storage returned no signed URL');
  return data.signedUrl;
}

/** `workspace-uploads` through the owner's session. */
export function browserUploadStore(): UploadStore {
  return {
    putObject: async (key, blob, contentType) => {
      const { error } = await bucket().upload(key, blob, { contentType, upsert: false });
      if (error && !isConflict(error)) throw error;
    },
    signUrl: async (key, seconds) => {
      const url = await signedUrlOf(key, seconds);
      return { url, expiresAt: new Date(Date.now() + seconds * MS_PER_SECOND).toISOString() };
    },
    removeObject: async (key) => {
      const { error } = await bucket().remove([key]);
      if (error) throw error;
    },
  };
}

/** The short link Open uses on an upload source row. */
export async function createSignedUploadUrl(
  storageKey: string,
  expiresInSeconds: number = WORKSPACE_UPLOAD_OPEN_LINK_SECONDS,
): Promise<string> {
  return signedUrlOf(storageKey, expiresInSeconds);
}

/* ---------------------------------------------------------------------------
 * The flows
 * ------------------------------------------------------------------------ */

export interface UploadFlowPorts {
  store: UploadStore;
  digest: (blob: Blob) => Promise<string>;
  findBySha256: typeof findUploadBySha256;
  register: typeof registerUpload;
  retry: typeof retryUpload;
  remove: typeof deleteDocument;
}

export function browserUploadPorts(): UploadFlowPorts {
  return {
    store: browserUploadStore(),
    digest: (blob) => sha256Hex(blob),
    findBySha256: findUploadBySha256,
    register: registerUpload,
    retry: retryUpload,
    remove: deleteDocument,
  };
}

export type UploadOutcome =
  | { kind: 'refused'; reason: 'too_large' | 'bad_type'; sentence: string }
  | { kind: 'existing'; document: WorkspaceDocument }
  | { kind: 'registered'; id: number; state: WorkspaceDocumentState };

/**
 * Upload one file in 24a's order. Refused by the rules: nothing is sent. A row
 * that already holds the hash: nothing is uploaded, and that row comes back in
 * whatever state it is in. The key is the hash's and the content type is the
 * rules', never the file's name or the browser's type.
 */
export async function uploadFile(
  file: File,
  courseId: string | null,
  ports: UploadFlowPorts = browserUploadPorts(),
): Promise<UploadOutcome> {
  const rules = checkUploadRules(file);
  if (!rules.ok) return { kind: 'refused', reason: rules.reason, sentence: rules.sentence };
  const sha256 = await ports.digest(file);
  const existing = await ports.findBySha256(sha256);
  if (existing !== null) return { kind: 'existing', document: existing };
  const key = storageKeyFor(sha256);
  await ports.store.putObject(key, file, rules.mime);
  const link = await ports.store.signUrl(key, WORKSPACE_UPLOAD_LINK_SECONDS);
  const registered = await ports.register({
    sha256,
    title: rules.title,
    mime: rules.mime,
    byteSize: file.size,
    signedUrl: link.url,
    signedUrlExpiresAt: link.expiresAt,
    courseId,
  });
  return { kind: 'registered', id: registered.id, state: registered.state };
}

/** Try again on a failed upload: a new 7-day link, then the retry call. */
export async function retryUploadLink(
  document: WorkspaceDocument,
  ports: UploadFlowPorts = browserUploadPorts(),
): Promise<{ id: number; state: WorkspaceDocumentState }> {
  if (document.state !== 'failed') throw new Error('only a failed upload can be tried again');
  if (document.storage_key === null) throw new Error('the upload has no storage key');
  const link = await ports.store.signUrl(document.storage_key, WORKSPACE_UPLOAD_LINK_SECONDS);
  return ports.retry({ documentId: document.id, signedUrl: link.url, signedUrlExpiresAt: link.expiresAt });
}

/**
 * Delete an upload in 24a's two steps: out of search, the object removed by the
 * key the first call returned, then the row dropped. A failed removal throws
 * and makes no second call; Try again runs the same steps (the first is safe
 * to repeat).
 */
export async function removeUpload(
  document: WorkspaceDocument,
  ports: UploadFlowPorts = browserUploadPorts(),
): Promise<DeleteDocumentResult> {
  const first = await ports.remove(document.id, false);
  if (first.state === 'deleted') return first;
  if (first.storageKey === null) throw new Error('the delete returned no storage key to remove');
  await ports.store.removeObject(first.storageKey);
  return ports.remove(document.id, true);
}
