/**
 * bb2dash — a question with options, and the options rows (Phase 24b, brief
 * 111, task 5; "The data layer's frozen exports").
 *
 *   `workspace_ask_with(p_conversation_id, p_text, p_options)`  a question, its options and attachments
 *   `workspace_request_options`  one row per request that was asked with options
 *
 * The options are `ask-options.json`'s six keys. The page checks them by the
 * database's own rules first (a depth and a format from the lists, ids that are
 * positive integers, five attachments at most), so the refusals the function
 * can still raise are a fallback, each with its one sentence.
 *
 * Conventions are `queries.workspace.ts`'s: a key object, an `xOptions()`
 * returning `queryOptions`, a `useX()` hook, throw on error, every row through
 * a pure normaliser.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asRecord } from './json-record';
import {
  invalidateWorkspaceConversation,
  parseConversationId,
  parseQuestion,
  refusalFor,
  toRequestId,
  type WorkspaceAskResult,
  type WorkspaceRefusal,
} from './queries.workspace';
import { untypedClient } from './queries.sync';
import { NOT_OWNER_LINE, REFUSAL_OPTIONS_REJECTED, REFUSAL_REFERENCE_GONE } from './workspace-labels';

/* ---------------------------------------------------------------------------
 * The options
 * ------------------------------------------------------------------------ */

export type WorkspaceDepth = 'auto' | 'quick' | 'standard' | 'deep';

/** The depth menu's four entries, in menu order. */
export const WORKSPACE_DEPTHS: readonly WorkspaceDepth[] = Object.freeze(['auto', 'quick', 'standard', 'deep']);

export type WorkspaceFormat = 'plain' | 'rich';

const WORKSPACE_FORMATS: readonly WorkspaceFormat[] = Object.freeze(['plain', 'rich']);

/** The most attachments a question carries, files and uploads together (`workspace_ask_with`). */
export const WORKSPACE_ATTACHMENTS_MAX = 5;

export interface WorkspaceAskOptions {
  /** A `v_course_display.display_id`, or null for all courses. */
  course: string | null;
  depth: WorkspaceDepth;
  /** A `workspace_routines.id`. */
  routine: string | null;
  /** The composer always sends 'rich'. */
  format: WorkspaceFormat;
  /** `bb_files.id`, in chip order. */
  files: readonly number[];
  /** `workspace_documents.id`, in chip order. */
  uploads: readonly number[];
}

/** All courses, auto, no routine, rich, no attachment. */
export const DEFAULT_ASK_OPTIONS: WorkspaceAskOptions = Object.freeze({
  course: null,
  depth: 'auto',
  routine: null,
  format: 'rich',
  files: Object.freeze([]) as readonly number[],
  uploads: Object.freeze([]) as readonly number[],
});

/* ---------------------------------------------------------------------------
 * Refusals
 * ------------------------------------------------------------------------ */

export type WorkspaceOptionsRefusalReason = 'reference_gone' | 'options_rejected' | 'not_owner';

const OPTIONS_REFUSAL_SENTENCE: Readonly<Record<WorkspaceOptionsRefusalReason, string>> = {
  reference_gone: REFUSAL_REFERENCE_GONE,
  options_rejected: REFUSAL_OPTIONS_REJECTED,
  not_owner: NOT_OWNER_LINE,
};

/**
 * A question, or a call on one of the owner's four functions, that the page or
 * the database refused for its options or its owner. `message` is the
 * sentence to show as it is.
 */
export class WorkspaceOptionsRefusal extends Error {
  readonly reason: WorkspaceOptionsRefusalReason;

  constructor(reason: WorkspaceOptionsRefusalReason) {
    super(OPTIONS_REFUSAL_SENTENCE[reason]);
    this.name = 'WorkspaceOptionsRefusal';
    this.reason = reason;
  }
}

const SQLSTATE_FOREIGN_KEY = '23503';
const SQLSTATE_CHECK = '23514';
const SQLSTATE_NOT_OWNER = '42501';
const QUESTION_SQLSTATES: ReadonlySet<string> = new Set(['22023', '23505']);
/** The prefix `workspace_ask_with` puts on the 23503 it raises itself (an unknown routine, file or upload). */
const ASK_WITH_MESSAGE_PREFIX = 'workspace_ask_with:';

/**
 * The refusal a database error from `workspace_ask_with` stands for, or null.
 * A 23503 that the function did not raise itself is the missing conversation,
 * which `isMissingConversation` leaves to the caller.
 */
export function askWithRefusalFor(error: unknown): WorkspaceRefusal | WorkspaceOptionsRefusal | null {
  const raw = asRecord(error);
  const code = raw?.code;
  if (typeof code !== 'string') return null;
  if (QUESTION_SQLSTATES.has(code)) return refusalFor(error);
  if (code === SQLSTATE_CHECK) return new WorkspaceOptionsRefusal('options_rejected');
  if (code === SQLSTATE_NOT_OWNER) return new WorkspaceOptionsRefusal('not_owner');
  const message = raw?.message;
  if (code === SQLSTATE_FOREIGN_KEY && typeof message === 'string' && message.startsWith(ASK_WITH_MESSAGE_PREFIX)) {
    return new WorkspaceOptionsRefusal('reference_gone');
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Validation at the boundary (pure)
 * ------------------------------------------------------------------------ */

function isRowId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptionalId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value !== '');
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * The options as `workspace_ask_with` takes them: the six keys of
 * `ask-options.json`, nulls kept, the arrays copied in the order given. Throws
 * `options_rejected` for anything the database would refuse on its own rules.
 */
export function toAskOptionsJson(options: WorkspaceAskOptions): Record<string, unknown> {
  const { course, depth, routine, format, files, uploads } = options;
  const valid =
    oneOf(WORKSPACE_DEPTHS, depth) !== null &&
    oneOf(WORKSPACE_FORMATS, format) !== null &&
    isOptionalId(course) &&
    isOptionalId(routine) &&
    Array.isArray(files) &&
    Array.isArray(uploads) &&
    files.every(isRowId) &&
    uploads.every(isRowId) &&
    files.length + uploads.length <= WORKSPACE_ATTACHMENTS_MAX;
  if (!valid) throw new WorkspaceOptionsRefusal('options_rejected');
  return { course, depth, routine, format, files: [...files], uploads: [...uploads] };
}

/* ---------------------------------------------------------------------------
 * The question
 * ------------------------------------------------------------------------ */

export interface AskWorkspaceWithInput {
  conversationId: string | null;
  text: string;
  options: WorkspaceAskOptions;
}

/**
 * What `workspace_ask_with` returned, or an error when an id is missing. The
 * message id is a uuid too, so it is read by the same uuid reader.
 */
function normalizeAskResult(data: unknown): WorkspaceAskResult {
  const raw = asRecord(data);
  const conversationId = parseConversationId(raw?.conversation_id);
  const messageId = parseConversationId(raw?.message_id);
  const requestId = toRequestId(raw?.request_id);
  if (conversationId === null || messageId === null || requestId === null) {
    throw new Error('workspace_ask_with did not return the three ids');
  }
  return { conversationId, messageId, requestId };
}

/**
 * Ask a question with its options. The text is measured first (22023's rule),
 * then the options; only then is the call made. A refusal comes back as the
 * error carrying its sentence; any other failure is thrown as it came.
 */
export async function askWorkspaceWith(input: AskWorkspaceWithInput): Promise<WorkspaceAskResult> {
  const text = parseQuestion(input.text);
  const options = toAskOptionsJson(input.options);
  const conversationId = input.conversationId === null ? null : parseConversationId(input.conversationId);
  if (input.conversationId !== null && conversationId === null) {
    throw new Error(`conversation id must be a uuid, got ${String(input.conversationId)}`);
  }
  const { data, error } = await untypedClient().rpc('workspace_ask_with', {
    p_conversation_id: conversationId,
    p_text: text,
    p_options: options,
  });
  if (error) throw askWithRefusalFor(error) ?? error;
  return normalizeAskResult(data);
}

/* ---------------------------------------------------------------------------
 * The options rows
 * ------------------------------------------------------------------------ */

export interface WorkspaceRequestOptions {
  request_id: number;
  depth: WorkspaceDepth;
  format: WorkspaceFormat;
  routine_id: string | null;
  course_display_id: string | null;
  course_ids: string[] | null;
}

const OPTIONS_COLUMNS = 'request_id, depth, format, routine_id, course_display_id, course_ids';

/** The cache-key slot used when no conversation is selected; that query never runs. */
const NO_CONVERSATION = 'none';

export const workspaceAskKeys = {
  options: (conversationId: string) => ['workspace', 'request-options', conversationId] as const,
} as const;

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** One `workspace_request_options` row; null when it has no id or no known depth or format. */
export function normalizeRequestOptions(row: unknown): WorkspaceRequestOptions | null {
  const raw = asRecord(row);
  const requestId = toRequestId(raw?.request_id);
  const depth = oneOf(WORKSPACE_DEPTHS, raw?.depth);
  const format = oneOf(WORKSPACE_FORMATS, raw?.format);
  if (!raw || requestId === null || depth === null || format === null) return null;
  const courseIds = Array.isArray(raw.course_ids)
    ? raw.course_ids.filter((id): id is string => typeof id === 'string' && id !== '')
    : null;
  return {
    request_id: requestId,
    depth,
    format,
    routine_id: textOrNull(raw.routine_id),
    course_display_id: textOrNull(raw.course_display_id),
    course_ids: courseIds,
  };
}

/** Request ids on their way to a filter: each a positive integer, or an error. */
function assertRequestIds(ids: readonly number[]): number[] {
  for (const id of ids) {
    if (!isRowId(id)) throw new Error(`request id must be a positive integer, got ${String(id)}`);
  }
  return [...ids];
}

/**
 * The options rows of a conversation's requests, in request order. `requestIds`
 * is the conversation's requests as the page has them; it is not part of the
 * key (the frozen key is the conversation's), and an ask invalidates the key.
 */
export function requestOptionsOptions(conversationId: string | null, requestIds: readonly number[]) {
  const id = parseConversationId(conversationId);
  return queryOptions({
    queryKey: workspaceAskKeys.options(id ?? NO_CONVERSATION),
    enabled: id !== null && requestIds.length > 0,
    queryFn: async (): Promise<WorkspaceRequestOptions[]> => {
      const ids = assertRequestIds(requestIds);
      const { data, error } = await untypedClient()
        .from('workspace_request_options')
        .select(OPTIONS_COLUMNS)
        .in('request_id', ids)
        .order('request_id', { ascending: true });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row: unknown) => normalizeRequestOptions(row) ?? []);
    },
  });
}

export function useWorkspaceRequestOptions(conversationId: string | null, requestIds: readonly number[]) {
  return useQuery(requestOptionsOptions(conversationId, requestIds));
}

/** The newest request's row: the one the composer restores its routine and course chips from. */
export function lastRequestOptionsOf(rows: readonly WorkspaceRequestOptions[]): WorkspaceRequestOptions | null {
  return rows.reduce<WorkspaceRequestOptions | null>(
    (newest, row) => (newest === null || row.request_id > newest.request_id ? row : newest),
    null,
  );
}

/**
 * Ask with options, then refresh the conversation and its options rows. A
 * refused question refreshes them too: the usual reason is an open request
 * this page had not seen yet.
 */
export function useAskWorkspaceWith() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: askWorkspaceWith,
    onSettled: (data, _error, variables) => {
      const conversationId = data?.conversationId ?? parseConversationId(variables.conversationId);
      invalidateWorkspaceConversation(queryClient, conversationId);
      if (conversationId !== null) {
        void queryClient.invalidateQueries({ queryKey: workspaceAskKeys.options(conversationId) });
      }
    },
  });
}
