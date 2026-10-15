/**
 * One answer's provenance (Phase 24b, brief 111, task 5): `workspace_turns`
 * and `workspace_sources`, as `turn-put.json` shapes them.
 *
 * Asserted: a turn and a source row are normalised field by field and never
 * carry a cost, a timing or a similarity; the reads name their columns and
 * filter by the request ids; the fixed line shows for `empty` and `failed`
 * only; one call invalidates both keys. The Supabase client is a recording stub.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import turnPutFixture from '../../workspace/test/fixtures/contract24/turn-put.json';

interface Call {
  target: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  result: { data: null as unknown, error: null as unknown },
}));

function builder(table: string) {
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      stub.calls.push({ target: table, op, args });
      return chain;
    };
  const chain: Record<string, unknown> = {
    select: record('select'),
    eq: record('eq'),
    in: record('in'),
    order: record('order'),
    limit: record('limit'),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(stub.result).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => builder(table) }),
}));

const {
  WORKSPACE_SOURCES_MAX,
  invalidateWorkspaceProvenance,
  normalizeSource,
  normalizeTurn,
  retrievalLineOf,
  sourcesOptions,
  turnOf,
  turnsOptions,
  useWorkspaceSources,
  useWorkspaceTurns,
  workspaceSourceKeys,
} = await import('@/lib/queries.workspace-sources');
const { RETRIEVAL_LINES, SOURCE_KIND_LABELS } = await import('@/lib/workspace-labels');
type WorkspaceSourceKind = import('@/lib/queries.workspace-sources').WorkspaceSourceKind;
type WorkspaceRetrievalState = import('@/lib/queries.workspace-sources').WorkspaceRetrievalState;

/** The two records keyed by this module's vocabularies, pinned to their types. */
const _kindLabels: Record<WorkspaceSourceKind, string> = SOURCE_KIND_LABELS;
const _retrievalLines: Record<Extract<WorkspaceRetrievalState, 'empty' | 'failed'>, string> = RETRIEVAL_LINES;

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const turnPut = turnPutFixture as {
  p_facts: Record<string, unknown>;
  p_sources: Record<string, unknown>[];
};

/** The fixture's facts as a stored row: the request id and the stamp the table adds. */
const turnRow = { ...turnPut.p_facts, request_id: 4812, created_at: '2026-10-08T14:00:03Z' };

beforeEach(() => {
  stub.calls = [];
  stub.result = { data: null, error: null };
});

describe('normalizeTurn', () => {
  it('reads the fixture`s facts, and never a cost or a timing', () => {
    const turn = normalizeTurn(turnRow);
    expect(turn).toEqual({
      request_id: 4812,
      depth: 'standard',
      tier: 'mid',
      plan_state: 'planned',
      retrieval_state: 'found',
      found_n: 3,
      passages_n: 2,
      memory_n: 1,
      feed_rows: 5,
      attachments: [
        { kind: 'file', id: 412, state: 'cut' },
        { kind: 'upload', id: 17, state: 'read' },
      ],
      created_at: '2026-10-08T14:00:03Z',
    });
    expect(Object.keys(turn ?? {})).not.toContain('plan_cost_usd');
    expect(Object.keys(turn ?? {})).not.toContain('prompt_bytes');
  });

  it('drops an attachment it cannot read, and reads a missing count as 0', () => {
    const turn = normalizeTurn({
      ...turnRow,
      found_n: null,
      memory_n: -1,
      attachments: [{ kind: 'file', id: 1, state: 'read' }, { kind: 'disk', id: 2, state: 'read' }, 'x'],
    });
    expect(turn?.found_n).toBe(0);
    expect(turn?.memory_n).toBe(0);
    expect(turn?.attachments).toEqual([{ kind: 'file', id: 1, state: 'read' }]);
    expect(normalizeTurn({ ...turnRow, attachments: null })?.attachments).toEqual([]);
  });

  it('drops a row with no request id or an unknown state', () => {
    expect(normalizeTurn({ ...turnRow, request_id: null })).toBeNull();
    expect(normalizeTurn({ ...turnRow, retrieval_state: 'maybe' })).toBeNull();
    expect(normalizeTurn({ ...turnRow, plan_state: 'x' })).toBeNull();
    expect(normalizeTurn({ ...turnRow, depth: 'x' })).toBeNull();
    expect(normalizeTurn({ ...turnRow, tier: 'x' })).toBeNull();
    expect(normalizeTurn([])).toBeNull();
  });
});

describe('normalizeSource', () => {
  it('reads each of the fixture`s seven rows, and never the similarity', () => {
    const rows = turnPut.p_sources.map((row, index) =>
      normalizeSource({ ...row, request_id: 4812, ord: index + 1 }),
    );
    expect(rows.every((row) => row !== null)).toBe(true);
    expect(rows[0]).toEqual({
      request_id: 4812,
      ord: 1,
      kind: 'material',
      origin: 'auto',
      file_id: 412,
      text_id: 9001,
      document_id: null,
      doc_text_id: null,
      course_id: 'BIO.110',
      title: 'Week 5 slides.pptx',
      unit_kind: 'slide',
      unit_no: 7,
    });
    expect(rows[3]).toMatchObject({ kind: 'feed', file_id: null, title: 'Planner and grades', unit_no: null });
    expect(rows[6]).toMatchObject({ kind: 'material', origin: 'tool', text_id: 9003, title: null });
    expect(rows.some((row) => row !== null && 'similarity' in row)).toBe(false);
  });

  it('drops a row with no ord or an unknown kind or origin', () => {
    const row = { ...turnPut.p_sources[0], request_id: 1, ord: 1 };
    expect(normalizeSource({ ...row, ord: 0 })).toBeNull();
    expect(normalizeSource({ ...row, kind: 'web' })).toBeNull();
    expect(normalizeSource({ ...row, origin: 'guess' })).toBeNull();
    expect(normalizeSource({ ...row, request_id: 'x' })).toBeNull();
    expect(normalizeSource({ ...row, file_id: 'x', unit_no: -2 })).toMatchObject({ file_id: null, unit_no: null });
  });
});

describe('the reads', () => {
  it('reads the turns of the conversation`s requests, only with a uuid and ids', async () => {
    expect(turnsOptions(null, [1]).enabled).toBe(false);
    expect(turnsOptions(CONVERSATION, []).enabled).toBe(false);
    const query = turnsOptions(CONVERSATION, [4812]);
    expect(query.queryKey).toEqual(['workspace', 'turns', CONVERSATION, [4812]]);
    expect(query.enabled).toBe(true);
    stub.result = { data: [turnRow, { request_id: 'bad' }], error: null };
    await expect(query.queryFn!({} as never)).resolves.toHaveLength(1);
    expect(stub.calls).toEqual([
      {
        target: 'workspace_turns',
        op: 'select',
        args: [
          'request_id, depth, tier, plan_state, retrieval_state, found_n, passages_n, memory_n, feed_rows, ' +
            'attachments, created_at',
        ],
      },
      { target: 'workspace_turns', op: 'in', args: ['request_id', [4812]] },
      { target: 'workspace_turns', op: 'order', args: ['request_id', { ascending: true }] },
    ]);
  });

  it('keys the turns by the request ids as well (R2-1): a new id list is a new key, the order is not', () => {
    const one = turnsOptions(CONVERSATION, [10]).queryKey;
    const two = turnsOptions(CONVERSATION, [10, 11]).queryKey;
    expect(two).not.toEqual(one);
    expect(turnsOptions(CONVERSATION, [11, 10]).queryKey).toEqual(two);
    expect(two.slice(0, 3)).toEqual(workspaceSourceKeys.turns(CONVERSATION));
  });

  it('is still matched by the frozen prefix key the provenance invalidation uses (R2-1)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = turnsOptions(CONVERSATION, [10, 11]).queryKey;
    client.setQueryData(key, []);
    // `find` matches exactly; `findAll` matches by prefix, as `invalidateQueries` does.
    expect(client.getQueryCache().findAll({ queryKey: workspaceSourceKeys.turns(CONVERSATION) }).map((query) => query.queryKey)).toEqual([key]);
    invalidateWorkspaceProvenance(client, CONVERSATION, null);
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });

  it('reads one request`s sources by ord, 40 at most', async () => {
    expect(sourcesOptions(null).enabled).toBe(false);
    const query = sourcesOptions(4812);
    expect(query.queryKey).toEqual(workspaceSourceKeys.sources(4812));
    expect(query.queryKey).toEqual(['workspace', 'sources', 4812]);
    stub.result = { data: [{ ...turnPut.p_sources[3], request_id: 4812, ord: 1 }], error: null };
    await expect(query.queryFn!({} as never)).resolves.toMatchObject([{ kind: 'feed' }]);
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      [
        'select',
        'request_id, ord, kind, origin, file_id, text_id, document_id, doc_text_id, course_id, title, unit_kind, unit_no',
      ],
      ['eq', 'request_id', 4812],
      ['order', 'ord', { ascending: true }],
      ['limit', WORKSPACE_SOURCES_MAX],
    ]);
    expect(WORKSPACE_SOURCES_MAX).toBe(40);
  });

  it('throws a read error, and refuses a bad id before reading', async () => {
    stub.result = { data: null, error: { code: 'PGRST', message: 'x' } };
    await expect(sourcesOptions(4812).queryFn!({} as never)).rejects.toMatchObject({ code: 'PGRST' });
    await expect(turnsOptions(CONVERSATION, [4812]).queryFn!({} as never)).rejects.toMatchObject({ code: 'PGRST' });
    await expect(turnsOptions(CONVERSATION, [-1]).queryFn!({} as never)).rejects.toThrow(/request id/);
    await expect(sourcesOptions(0).queryFn!({} as never)).rejects.toThrow(/request id/);
  });

  it('runs the reads through the hooks', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    stub.result = { data: [turnRow], error: null };
    const turns = renderHook(() => useWorkspaceTurns(CONVERSATION, [4812]), { wrapper });
    await waitFor(() => expect(turns.result.current.isSuccess).toBe(true));
    stub.result = { data: [], error: null };
    const sources = renderHook(() => useWorkspaceSources(4812), { wrapper });
    await waitFor(() => expect(sources.result.current.data).toEqual([]));
  });
});

describe('reading a turn', () => {
  const found = normalizeTurn(turnRow)!;

  it('finds a request`s turn, or null', () => {
    expect(turnOf([found], 4812)).toBe(found);
    expect(turnOf([found], 1)).toBeNull();
    expect(turnOf(undefined, 4812)).toBeNull();
  });

  it('shows the fixed line for empty and failed only', () => {
    expect(retrievalLineOf({ ...found, retrieval_state: 'empty' })).toBe(RETRIEVAL_LINES.empty);
    expect(retrievalLineOf({ ...found, retrieval_state: 'failed' })).toBe(RETRIEVAL_LINES.failed);
    expect(retrievalLineOf({ ...found, retrieval_state: 'attached_only' })).toBeNull();
    expect(retrievalLineOf(found)).toBeNull();
    expect(retrievalLineOf(null)).toBeNull();
    expect(Object.keys(_retrievalLines).sort()).toEqual(['empty', 'failed']);
    expect(Object.keys(_kindLabels).sort()).toEqual(['feed', 'material', 'memory', 'upload']);
  });
});

describe('invalidateWorkspaceProvenance', () => {
  it('invalidates the conversation`s turns and the request`s sources', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    invalidateWorkspaceProvenance(client, CONVERSATION, 4812);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      workspaceSourceKeys.turns(CONVERSATION),
      workspaceSourceKeys.sources(4812),
    ]);
  });

  it('invalidates only what it has an id for', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    invalidateWorkspaceProvenance(client, null, null);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
