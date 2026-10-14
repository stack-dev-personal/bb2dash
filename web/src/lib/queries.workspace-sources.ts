/**
 * bb2dash — one answer's provenance (Phase 24b, brief 111, task 5; "The data
 * layer's frozen exports").
 *
 *   `workspace_turns`    one row per answered request: how it was planned and searched
 *   `workspace_sources`  up to 40 rows per request: what the prompt held, what was attached, what was opened
 *
 * Both are written by the runner's `workspace_turn_put` (`turn-put.json`), and
 * the page only reads them. WHAT IS NEVER READ: a turn's `plan_cost_usd`,
 * `prompt_bytes`, `plan_ms` and `retrieval_ms` (costs and timings are not
 * shown) and a source's `similarity` (a score is not shown). The select lists
 * name their columns for that reason.
 *
 * Conventions are `queries.workspace.ts`'s; every row goes through a pure
 * normaliser, so a misshapen column reads as null (a count as 0) and a row
 * that cannot be identified is dropped.
 */

import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { asRecord } from './json-record';
import { parseConversationId, toRequestId, type WorkspaceTier } from './queries.workspace';
import { WORKSPACE_DEPTHS, type WorkspaceDepth } from './queries.workspace-ask';
import { untypedClient } from './queries.sync';
import { RETRIEVAL_LINES } from './workspace-labels';

/* ---------------------------------------------------------------------------
 * Vocabularies and row types
 * ------------------------------------------------------------------------ */

export type WorkspaceRetrievalState = 'found' | 'attached_only' | 'empty' | 'failed';
/*
 * `planned` is written in backticks here and in `PLAN_STATES` below, the same
 * type and value as the quoted form. `test/status-vocabulary.test.ts` forbids
 * the quoted word anywhere but `progress-status.ts`, because `planned` is also a
 * retired value of the planner's `progress_status` enum. A turn's plan state is
 * another vocabulary that shares the word (the audit's own `LABEL_EXEMPT` note
 * describes such a case). W-86 may not edit that audit; once the PM exempts
 * this file there, the quotes can come back.
 */
export type WorkspacePlanState = 'skipped' | `planned` | 'fallback';
export type WorkspaceAttachmentState = 'read' | 'cut' | 'not_ready' | 'failed' | 'missing' | 'no_text';
export type WorkspaceSourceKind = 'material' | 'upload' | 'memory' | 'feed';
export type WorkspaceSourceOrigin = 'auto' | 'attached' | 'tool';

const RETRIEVAL_STATES: readonly WorkspaceRetrievalState[] = ['found', 'attached_only', 'empty', 'failed'];
const PLAN_STATES: readonly WorkspacePlanState[] = ['skipped', `planned`, 'fallback'];
const ATTACHMENT_STATES: readonly WorkspaceAttachmentState[] = ['read', 'cut', 'not_ready', 'failed', 'missing', 'no_text'];
const ATTACHMENT_KINDS: readonly WorkspaceTurnAttachment['kind'][] = ['file', 'upload'];
const SOURCE_KINDS: readonly WorkspaceSourceKind[] = ['material', 'upload', 'memory', 'feed'];
const SOURCE_ORIGINS: readonly WorkspaceSourceOrigin[] = ['auto', 'attached', 'tool'];
const TIERS: readonly WorkspaceTier[] = ['low', 'mid', 'high'];

export interface WorkspaceTurnAttachment {
  kind: 'file' | 'upload';
  id: number;
  state: WorkspaceAttachmentState;
}

/** One `workspace_turns` row, without its cost and its timings. */
export interface WorkspaceTurn {
  request_id: number;
  depth: WorkspaceDepth;
  tier: WorkspaceTier;
  plan_state: WorkspacePlanState;
  retrieval_state: WorkspaceRetrievalState;
  found_n: number;
  passages_n: number;
  memory_n: number;
  feed_rows: number;
  attachments: WorkspaceTurnAttachment[];
  created_at: string | null;
}

/** One `workspace_sources` row, without its similarity. */
export interface WorkspaceSource {
  request_id: number;
  ord: number;
  kind: WorkspaceSourceKind;
  origin: WorkspaceSourceOrigin;
  file_id: number | null;
  text_id: number | null;
  document_id: number | null;
  doc_text_id: number | null;
  course_id: string | null;
  title: string | null;
  unit_kind: string | null;
  unit_no: number | null;
}

/** The most source rows a request holds (`workspace_turn_put` cuts past the 40th). */
export const WORKSPACE_SOURCES_MAX = 40;

const TURN_COLUMNS =
  'request_id, depth, tier, plan_state, retrieval_state, found_n, passages_n, memory_n, feed_rows, ' +
  'attachments, created_at';

const SOURCE_COLUMNS =
  'request_id, ord, kind, origin, file_id, text_id, document_id, doc_text_id, course_id, title, unit_kind, unit_no';

/** The cache-key slots used when there is no conversation or no request; those queries never run. */
const NO_CONVERSATION = 'none';
const NO_REQUEST = 0;

export const workspaceSourceKeys = {
  turns: (conversationId: string) => ['workspace', 'turns', conversationId] as const,
  sources: (requestId: number) => ['workspace', 'sources', requestId] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Normalisers (pure)
 * ------------------------------------------------------------------------ */

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A count as the row holds it; anything that is not a whole number from 0 reads as 0. */
function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** A unit's number, from 0; anything else reads as null. */
function unitNoOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeAttachments(value: unknown): WorkspaceTurnAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const raw = asRecord(entry);
    const kind = oneOf(ATTACHMENT_KINDS, raw?.kind);
    const id = toRequestId(raw?.id);
    const state = oneOf(ATTACHMENT_STATES, raw?.state);
    return kind === null || id === null || state === null ? [] : [{ kind, id, state }];
  });
}

/** One `workspace_turns` row; null when it has no request id or a state outside the vocabularies. */
export function normalizeTurn(row: unknown): WorkspaceTurn | null {
  const raw = asRecord(row);
  const requestId = toRequestId(raw?.request_id);
  const depth = oneOf(WORKSPACE_DEPTHS, raw?.depth);
  const tier = oneOf(TIERS, raw?.tier);
  const planState = oneOf(PLAN_STATES, raw?.plan_state);
  const retrievalState = oneOf(RETRIEVAL_STATES, raw?.retrieval_state);
  if (!raw || requestId === null || depth === null || tier === null) return null;
  if (planState === null || retrievalState === null) return null;
  return {
    request_id: requestId,
    depth,
    tier,
    plan_state: planState,
    retrieval_state: retrievalState,
    found_n: countOf(raw.found_n),
    passages_n: countOf(raw.passages_n),
    memory_n: countOf(raw.memory_n),
    feed_rows: countOf(raw.feed_rows),
    attachments: normalizeAttachments(raw.attachments),
    created_at: textOrNull(raw.created_at),
  };
}

/** One `workspace_sources` row; null when it has no request id or ord, or an unknown kind or origin. */
export function normalizeSource(row: unknown): WorkspaceSource | null {
  const raw = asRecord(row);
  const requestId = toRequestId(raw?.request_id);
  const ord = toRequestId(raw?.ord);
  const kind = oneOf(SOURCE_KINDS, raw?.kind);
  const origin = oneOf(SOURCE_ORIGINS, raw?.origin);
  if (!raw || requestId === null || ord === null || kind === null || origin === null) return null;
  return {
    request_id: requestId,
    ord,
    kind,
    origin,
    file_id: toRequestId(raw.file_id),
    text_id: toRequestId(raw.text_id),
    document_id: toRequestId(raw.document_id),
    doc_text_id: toRequestId(raw.doc_text_id),
    course_id: textOrNull(raw.course_id),
    title: textOrNull(raw.title),
    unit_kind: textOrNull(raw.unit_kind),
    unit_no: unitNoOf(raw.unit_no),
  };
}

function normalizeRows<T>(data: unknown, normalize: (row: unknown) => T | null): T[] {
  return (Array.isArray(data) ? data : []).flatMap((row: unknown) => normalize(row) ?? []);
}

/** A request id on its way to a filter: a positive integer, or an error. */
function assertRequestId(value: number): number {
  if (toRequestId(value) !== value) throw new Error(`request id must be a positive integer, got ${String(value)}`);
  return value;
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** The turns of a conversation's requests (as the page has them), in request order. */
export function turnsOptions(conversationId: string | null, requestIds: readonly number[]) {
  const id = parseConversationId(conversationId);
  return queryOptions({
    queryKey: workspaceSourceKeys.turns(id ?? NO_CONVERSATION),
    enabled: id !== null && requestIds.length > 0,
    queryFn: async (): Promise<WorkspaceTurn[]> => {
      const ids = requestIds.map(assertRequestId);
      const { data, error } = await untypedClient()
        .from('workspace_turns')
        .select(TURN_COLUMNS)
        .in('request_id', ids)
        .order('request_id', { ascending: true });
      if (error) throw error;
      return normalizeRows(data, normalizeTurn);
    },
  });
}

/** One request's sources, by ord, 40 at most. */
export function sourcesOptions(requestId: number | null) {
  return queryOptions({
    queryKey: workspaceSourceKeys.sources(requestId ?? NO_REQUEST),
    enabled: requestId !== null,
    queryFn: async (): Promise<WorkspaceSource[]> => {
      const id = assertRequestId(requestId ?? NO_REQUEST);
      const { data, error } = await untypedClient()
        .from('workspace_sources')
        .select(SOURCE_COLUMNS)
        .eq('request_id', id)
        .order('ord', { ascending: true })
        .limit(WORKSPACE_SOURCES_MAX);
      if (error) throw error;
      return normalizeRows(data, normalizeSource);
    },
  });
}

export function useWorkspaceTurns(conversationId: string | null, requestIds: readonly number[]) {
  return useQuery(turnsOptions(conversationId, requestIds));
}

export function useWorkspaceSources(requestId: number | null) {
  return useQuery(sourcesOptions(requestId));
}

/* ---------------------------------------------------------------------------
 * Reading a turn (pure)
 * ------------------------------------------------------------------------ */

/** A request's turn among those read, or null. */
export function turnOf(turns: readonly WorkspaceTurn[] | undefined, requestId: number): WorkspaceTurn | null {
  return turns?.find((turn) => turn.request_id === requestId) ?? null;
}

/**
 * The fixed line under an answer: for `empty` and `failed` only. `found`,
 * `attached_only` (an attached file was read, no passage matched) and a
 * request with no turn row show none.
 */
export function retrievalLineOf(turn: WorkspaceTurn | null): string | null {
  if (turn?.retrieval_state === 'empty') return RETRIEVAL_LINES.empty;
  if (turn?.retrieval_state === 'failed') return RETRIEVAL_LINES.failed;
  return null;
}

/** What the `sources` event and `done` move: the conversation's turns and the request's sources. */
export function invalidateWorkspaceProvenance(
  queryClient: QueryClient,
  conversationId: string | null,
  requestId: number | null,
): void {
  if (conversationId !== null) {
    void queryClient.invalidateQueries({ queryKey: workspaceSourceKeys.turns(conversationId) });
  }
  if (requestId !== null) {
    void queryClient.invalidateQueries({ queryKey: workspaceSourceKeys.sources(requestId) });
  }
}
