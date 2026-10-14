/**
 * bb2dash — what is remembered, the About me note, and the index status (Phase
 * 24b, brief 111, task 5; "The data layer's frozen exports").
 *
 *   `workspace_documents` (kind `memory`)  a remembered item's title, state and conversation
 *   `v_workspace_memory`                   its summary (security invoker; migration 197)
 *   `workspace_profile`                    the one row (id 1): the About me note
 *   `v_workspace_index_status`             one row of counts (migrations 197 and 199)
 *
 * The page reads no unit and no vector by table: a remembered summary comes
 * through the view alone. Forgetting an item is one call of
 * `workspace_document_delete` (it goes whole at once). The About me note is the
 * one column of the profile the owner may write.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { asRecord } from './json-record';
import { parseConversationId, toRequestId } from './queries.workspace';
import {
  WORKSPACE_DOCUMENT_STATES,
  deleteDocument,
  type DeleteDocumentResult,
  type WorkspaceDocumentState,
} from './queries.workspace-files';
import { untypedClient } from './queries.sync';
import { ABOUT_ME_LIMIT_LINE, NEVER_INDEXED_LINE, indexCountsLine, lastIndexedLine } from './workspace-labels';

/* ---------------------------------------------------------------------------
 * Types and constants
 * ------------------------------------------------------------------------ */

export interface WorkspaceMemoryItem {
  document_id: number;
  conversation_id: string | null;
  title: string;
  state: WorkspaceDocumentState;
  summary: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkspaceProfile {
  id: number;
  about_me: string;
  memory_since: string | null;
  updated_at: string | null;
}

/** A count the row does not hold reads 0, and is not invented elsewhere. */
export interface WorkspaceIndexStatus {
  course_units_indexed: number;
  course_units_waiting: number;
  course_last_embedded: string | null;
  course_files_text_pending: number;
  uploads_indexed: number;
  uploads_waiting: number;
  uploads_failed: number;
  upload_links_expired: number;
  uploads_deleting: number;
  memory_indexed: number;
  memory_waiting: number;
  memory_failed: number;
  ingest_polled_age_seconds: number | null;
}

/** `workspace_profile.about_me` is checked at 2000 characters (migration 195). */
export const WORKSPACE_ABOUT_ME_MAX = 2_000;
export const WORKSPACE_INDEX_STATUS_REFETCH_MS = 30_000;

/** The profile is one row, and this is its id. */
const PROFILE_ID = 1;
const MEMORY_KIND = 'memory';

const MEMORY_DOCUMENT_COLUMNS = 'id, title, state, conversation_id, created_at, updated_at';
const MEMORY_SUMMARY_COLUMNS = 'document_id, summary';
const PROFILE_COLUMNS = 'id, about_me, memory_since, updated_at';

/** The view's eleven counts, by the name the row holds each under. */
const INDEX_COUNT_COLUMNS = [
  'course_units_indexed',
  'course_units_waiting',
  'course_files_text_pending',
  'uploads_indexed',
  'uploads_waiting',
  'uploads_failed',
  'upload_links_expired',
  'uploads_deleting',
  'memory_indexed',
  'memory_waiting',
  'memory_failed',
] as const;
const INDEX_STATUS_COLUMNS = [...INDEX_COUNT_COLUMNS, 'course_last_embedded', 'ingest_polled_age_seconds'].join(', ');

export const workspaceMemoryKeys = {
  memory: () => ['workspace', 'memory'] as const,
  profile: () => ['workspace', 'profile'] as const,
  indexStatus: () => ['workspace', 'index-status'] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Normalisers (pure)
 * ------------------------------------------------------------------------ */

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A count as Postgres sends it (a number, or digits for a bigint); anything else reads 0. */
function countOf(value: unknown): number {
  const parsed = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function memoryDocumentOf(row: unknown): Omit<WorkspaceMemoryItem, 'summary'> | null {
  const raw = asRecord(row);
  const id = toRequestId(raw?.id);
  const state = WORKSPACE_DOCUMENT_STATES.find((known) => known === raw?.state);
  if (!raw || id === null || state === undefined || typeof raw.title !== 'string') return null;
  return {
    document_id: id,
    conversation_id: parseConversationId(raw.conversation_id),
    title: raw.title,
    state,
    created_at: textOrNull(raw.created_at),
    updated_at: textOrNull(raw.updated_at),
  };
}

/** The view's summaries by document id; a row with no id or no summary is left out. */
function summariesOf(data: unknown): ReadonlyMap<number, string> {
  const entries = (Array.isArray(data) ? data : []).flatMap((row: unknown) => {
    const raw = asRecord(row);
    const id = toRequestId(raw?.document_id);
    const summary = textOrNull(raw?.summary);
    return id === null || summary === null ? [] : [[id, summary] as const];
  });
  return new Map(entries);
}

/** Newest `updated_at` first; a row with none goes last. ISO stamps compare as text. */
function newestFirst(a: WorkspaceMemoryItem, b: WorkspaceMemoryItem): number {
  if (a.updated_at === b.updated_at) return 0;
  if (a.updated_at === null) return 1;
  if (b.updated_at === null) return -1;
  return a.updated_at < b.updated_at ? 1 : -1;
}

function normalizeProfile(row: unknown): WorkspaceProfile | null {
  const raw = asRecord(row);
  const id = toRequestId(raw?.id);
  if (!raw || id === null) return null;
  return {
    id,
    about_me: typeof raw.about_me === 'string' ? raw.about_me : '',
    memory_since: textOrNull(raw.memory_since),
    updated_at: textOrNull(raw.updated_at),
  };
}

function normalizeIndexStatus(row: unknown): WorkspaceIndexStatus {
  const raw = asRecord(row) ?? {};
  const counts = Object.fromEntries(INDEX_COUNT_COLUMNS.map((column) => [column, countOf(raw[column])])) as Record<
    (typeof INDEX_COUNT_COLUMNS)[number],
    number
  >;
  const age = raw.ingest_polled_age_seconds;
  return {
    ...counts,
    course_last_embedded: textOrNull(raw.course_last_embedded),
    ingest_polled_age_seconds: typeof age === 'number' && Number.isFinite(age) && age >= 0 ? age : null,
  };
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** The remembered items: the catalog rows with the view's summary beside each, newest first. */
export function memoryOptions() {
  return queryOptions({
    queryKey: workspaceMemoryKeys.memory(),
    queryFn: async (): Promise<WorkspaceMemoryItem[]> => {
      const client = untypedClient();
      const [documents, summaries] = await Promise.all([
        client.from('workspace_documents').select(MEMORY_DOCUMENT_COLUMNS).eq('kind', MEMORY_KIND),
        client.from('v_workspace_memory').select(MEMORY_SUMMARY_COLUMNS),
      ]);
      if (documents.error) throw documents.error;
      if (summaries.error) throw summaries.error;
      const byId = summariesOf(summaries.data);
      const rows = (Array.isArray(documents.data) ? documents.data : []).flatMap(
        (row: unknown) => memoryDocumentOf(row) ?? [],
      );
      return rows.map((row) => ({ ...row, summary: byId.get(row.document_id) ?? null })).sort(newestFirst);
    },
  });
}

/** The one profile row, or null before it exists. */
export function profileOptions() {
  return queryOptions({
    queryKey: workspaceMemoryKeys.profile(),
    queryFn: async (): Promise<WorkspaceProfile | null> => {
      const { data, error } = await untypedClient()
        .from('workspace_profile')
        .select(PROFILE_COLUMNS)
        .eq('id', PROFILE_ID)
        .maybeSingle();
      if (error) throw error;
      return normalizeProfile(data);
    },
  });
}

/** `v_workspace_index_status`, re-read every 30 s. */
export function indexStatusOptions() {
  return queryOptions({
    queryKey: workspaceMemoryKeys.indexStatus(),
    queryFn: async (): Promise<WorkspaceIndexStatus> => {
      const { data, error } = await untypedClient()
        .from('v_workspace_index_status')
        .select(INDEX_STATUS_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return normalizeIndexStatus(data);
    },
    refetchInterval: WORKSPACE_INDEX_STATUS_REFETCH_MS,
  });
}

export function useWorkspaceMemory() {
  return useQuery(memoryOptions());
}

export function useWorkspaceProfile() {
  return useQuery(profileOptions());
}

export function useWorkspaceIndexStatus() {
  return useQuery(indexStatusOptions());
}

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

/**
 * The About me note, trimmed. Past 2000 characters (code points, as
 * `char_length` counts them) it throws with the limit's own line.
 */
export function parseAboutMe(text: unknown): string {
  if (typeof text !== 'string') throw new Error('the About me note must be text');
  const trimmed = text.trim();
  if (Array.from(trimmed).length > WORKSPACE_ABOUT_ME_MAX) throw new Error(ABOUT_ME_LIMIT_LINE);
  return trimmed;
}

/** Write the note to the profile row. */
export async function setAboutMe(profileId: number, text: string): Promise<void> {
  if (toRequestId(profileId) !== profileId) throw new Error(`profile id must be a positive integer, got ${profileId}`);
  const aboutMe = parseAboutMe(text);
  const { error } = await untypedClient().from('workspace_profile').update({ about_me: aboutMe }).eq('id', profileId);
  if (error) throw error;
}

/** Forget a remembered item: one call, and the item goes whole (state `deleted`). */
export function forgetMemoryItem(documentId: number): Promise<DeleteDocumentResult> {
  return deleteDocument(documentId, false);
}

/* ---------------------------------------------------------------------------
 * The index status line (pure)
 * ------------------------------------------------------------------------ */

/**
 * The Files tab's lines: course units (no failed count: one that could not be
 * indexed still waits), uploads, remembered items, then when a course file was
 * last indexed, with the date already in words, or that none has been.
 */
export function indexStatusLines(status: WorkspaceIndexStatus, lastIndexedWords: string | null): readonly string[] {
  return [
    indexCountsLine('course', {
      indexed: status.course_units_indexed,
      waiting: status.course_units_waiting,
      failed: null,
    }),
    indexCountsLine('uploads', {
      indexed: status.uploads_indexed,
      waiting: status.uploads_waiting,
      failed: status.uploads_failed,
    }),
    indexCountsLine('memory', {
      indexed: status.memory_indexed,
      waiting: status.memory_waiting,
      failed: status.memory_failed,
    }),
    lastIndexedWords === null ? NEVER_INDEXED_LINE : lastIndexedLine(lastIndexedWords),
  ];
}
