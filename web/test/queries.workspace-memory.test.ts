/**
 * What is remembered, the About me note, and the index status (Phase 24b,
 * brief 111, task 5).
 *
 * Asserted: the memory list is two reads merged by `document_id` (the catalog
 * row's title and state, the view's summary), newest first; the About me note
 * is measured as `char_length` counts it; a remembered item is forgotten with
 * one delete call; the index status reads 0 for a count the row does not hold
 * and gives one line per kind. The Supabase client is a recording stub.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  target: string;
  op: string;
  args: unknown[];
}

type Answer = { data: unknown; error: unknown };

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  /** Per table or function: what its terminal await resolves to. */
  answers: {} as Record<string, Answer>,
}));

function answerFor(target: string): Answer {
  return stub.answers[target] ?? { data: null, error: null };
}

function builder(table: string) {
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      stub.calls.push({ target: table, op, args });
      return chain;
    };
  const chain: Record<string, unknown> = {
    select: record('select'),
    update: record('update'),
    eq: record('eq'),
    order: record('order'),
    maybeSingle: (...args: unknown[]) => {
      stub.calls.push({ target: table, op: 'maybeSingle', args });
      return Promise.resolve(answerFor(table));
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(answerFor(table)).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      stub.calls.push({ target: fn, op: 'rpc', args: [args] });
      return Promise.resolve(answerFor(fn));
    },
  }),
}));

const memory = await import('@/lib/queries.workspace-memory');
const labels = await import('@/lib/workspace-labels');
const {
  WORKSPACE_ABOUT_ME_MAX,
  WORKSPACE_INDEX_STATUS_REFETCH_MS,
  forgetMemoryItem,
  indexStatusLines,
  indexStatusOptions,
  memoryOptions,
  parseAboutMe,
  profileOptions,
  setAboutMe,
  useWorkspaceIndexStatus,
  useWorkspaceMemory,
  useWorkspaceProfile,
  workspaceMemoryKeys,
} = memory;

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

const STATUS_ROW = {
  course_units_indexed: 120,
  course_units_waiting: 4,
  course_last_embedded: '2026-10-13T22:00:00Z',
  course_files_text_pending: 1,
  uploads_indexed: 2,
  uploads_waiting: 1,
  uploads_failed: 1,
  upload_links_expired: 0,
  uploads_deleting: 0,
  memory_indexed: 3,
  memory_waiting: 0,
  memory_failed: 0,
  ingest_polled_age_seconds: 12,
};

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  stub.calls = [];
  stub.answers = {};
});

describe('the memory list: two reads merged by document_id', () => {
  it('takes the title and state from the catalog row and the summary from the view, newest first', async () => {
    stub.answers.workspace_documents = {
      data: [
        { id: 21, title: 'Membrane transport', state: 'indexed', conversation_id: CONVERSATION, created_at: 'a', updated_at: '2026-10-10T00:00:00Z' },
        { id: 22, title: 'Exam plan', state: 'text_ready', conversation_id: null, created_at: 'b', updated_at: '2026-10-12T00:00:00Z' },
        { id: 23, title: 'No date', state: 'indexed', conversation_id: null, created_at: null, updated_at: null },
        { id: 'x', title: 'bad' },
      ],
      error: null,
    };
    stub.answers.v_workspace_memory = {
      data: [
        { document_id: 21, summary: 'Diffusion and osmosis compared.' },
        { document_id: 99, summary: 'An item with no catalog row is not listed.' },
      ],
      error: null,
    };
    const query = memoryOptions();
    expect(query.queryKey).toEqual(workspaceMemoryKeys.memory());
    const items = await query.queryFn!({} as never);
    expect(items).toEqual([
      { document_id: 22, conversation_id: null, title: 'Exam plan', state: 'text_ready', summary: null, created_at: 'b', updated_at: '2026-10-12T00:00:00Z' },
      { document_id: 21, conversation_id: CONVERSATION, title: 'Membrane transport', state: 'indexed', summary: 'Diffusion and osmosis compared.', created_at: 'a', updated_at: '2026-10-10T00:00:00Z' },
      { document_id: 23, conversation_id: null, title: 'No date', state: 'indexed', summary: null, created_at: null, updated_at: null },
    ]);
    const documents = stub.calls.filter((call) => call.target === 'workspace_documents');
    expect(documents.map((call) => [call.op, ...call.args])).toEqual([
      ['select', 'id, title, state, conversation_id, created_at, updated_at'],
      ['eq', 'kind', 'memory'],
    ]);
    expect(stub.calls.filter((call) => call.target === 'v_workspace_memory').map((call) => call.args)).toEqual([
      ['document_id, summary'],
    ]);
  });

  it('throws when either read fails', async () => {
    stub.answers.v_workspace_memory = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(memoryOptions().queryFn!({} as never)).rejects.toMatchObject({ code: '42501' });
    stub.answers = { workspace_documents: { data: null, error: { code: 'PGRST', message: 'x' } } };
    await expect(memoryOptions().queryFn!({} as never)).rejects.toMatchObject({ code: 'PGRST' });
  });

  it('runs through the hook', async () => {
    stub.answers.workspace_documents = { data: [], error: null };
    stub.answers.v_workspace_memory = { data: [], error: null };
    const { result } = renderHook(() => useWorkspaceMemory(), { wrapper: wrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});

describe('the About me note', () => {
  it('reads the one profile row', async () => {
    stub.answers.workspace_profile = {
      data: { id: 1, about_me: 'Second-year student.', memory_since: null, updated_at: '2026-10-14T00:00:00Z' },
      error: null,
    };
    const query = profileOptions();
    expect(query.queryKey).toEqual(['workspace', 'profile']);
    await expect(query.queryFn!({} as never)).resolves.toEqual({
      id: 1,
      about_me: 'Second-year student.',
      memory_since: null,
      updated_at: '2026-10-14T00:00:00Z',
    });
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      ['select', 'id, about_me, memory_since, updated_at'],
      ['eq', 'id', 1],
      ['maybeSingle'],
    ]);
  });

  it('is null with no row, keeps a missing note as empty, and throws a read error', async () => {
    await expect(profileOptions().queryFn!({} as never)).resolves.toBeNull();
    stub.answers.workspace_profile = { data: { id: 1, about_me: null }, error: null };
    await expect(profileOptions().queryFn!({} as never)).resolves.toMatchObject({ about_me: '' });
    stub.answers.workspace_profile = { data: null, error: { code: 'x', message: 'y' } };
    await expect(profileOptions().queryFn!({} as never)).rejects.toMatchObject({ code: 'x' });
  });

  it('trims the note and refuses one past 2000 characters as char_length counts them', () => {
    expect(WORKSPACE_ABOUT_ME_MAX).toBe(2_000);
    expect(parseAboutMe('  likes short answers  ')).toBe('likes short answers');
    expect(parseAboutMe('')).toBe('');
    expect(parseAboutMe('😀'.repeat(2_000))).toHaveLength(4_000);
    expect(() => parseAboutMe('a'.repeat(2_001))).toThrow(labels.ABOUT_ME_LIMIT_LINE);
    expect(() => parseAboutMe(42)).toThrow();
  });

  it('writes the note by the profile id', async () => {
    await setAboutMe(1, '  new note ');
    expect(stub.calls.map((call) => [call.target, call.op, ...call.args])).toEqual([
      ['workspace_profile', 'update', { about_me: 'new note' }],
      ['workspace_profile', 'eq', 'id', 1],
    ]);
  });

  it('refuses a bad id or note before any write, and throws a write error', async () => {
    await expect(setAboutMe(0, 'x')).rejects.toThrow(/profile id/);
    await expect(setAboutMe(1, 'a'.repeat(2_001))).rejects.toThrow(labels.ABOUT_ME_LIMIT_LINE);
    expect(stub.calls).toEqual([]);
    stub.answers.workspace_profile = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(setAboutMe(1, 'x')).rejects.toMatchObject({ code: '42501' });
  });

  it('runs through the hook', async () => {
    stub.answers.workspace_profile = { data: { id: 1, about_me: 'x', memory_since: null, updated_at: null }, error: null };
    const { result } = renderHook(() => useWorkspaceProfile(), { wrapper: wrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.data?.about_me).toBe('x'));
  });
});

describe('forgetMemoryItem', () => {
  it('is one delete call with the object not removed: a memory item goes whole', async () => {
    stub.answers.workspace_document_delete = {
      data: { id: 21, kind: 'memory', state: 'deleted', storage_key: null },
      error: null,
    };
    await expect(forgetMemoryItem(21)).resolves.toEqual({ id: 21, kind: 'memory', state: 'deleted', storageKey: null });
    expect(stub.calls).toEqual([
      { target: 'workspace_document_delete', op: 'rpc', args: [{ p_document_id: 21, p_object_removed: false }] },
    ]);
  });
});

describe('the index status', () => {
  it('reads the one row every 30 s, naming its columns', async () => {
    stub.answers.v_workspace_index_status = { data: STATUS_ROW, error: null };
    const query = indexStatusOptions();
    expect(query.queryKey).toEqual(['workspace', 'index-status']);
    expect(query.refetchInterval).toBe(WORKSPACE_INDEX_STATUS_REFETCH_MS);
    expect(WORKSPACE_INDEX_STATUS_REFETCH_MS).toBe(30_000);
    await expect(query.queryFn!({} as never)).resolves.toEqual(STATUS_ROW);
    const [select] = stub.calls;
    expect(String(select.args[0]).split(', ').sort()).toEqual(Object.keys(STATUS_ROW).sort());
  });

  it('reads 0 for a count the row does not hold, and keeps a missing age as null', async () => {
    stub.answers.v_workspace_index_status = { data: { uploads_indexed: '7', memory_failed: -1 }, error: null };
    const status = await indexStatusOptions().queryFn!({} as never);
    expect(status).toMatchObject({ uploads_indexed: 7, memory_failed: 0, course_units_indexed: 0 });
    expect(status.course_last_embedded).toBeNull();
    expect(status.ingest_polled_age_seconds).toBeNull();
    stub.answers.v_workspace_index_status = { data: null, error: { code: 'x', message: 'y' } };
    await expect(indexStatusOptions().queryFn!({} as never)).rejects.toMatchObject({ code: 'x' });
  });

  it('gives one line per kind, then when a course file was last indexed', () => {
    expect(indexStatusLines(STATUS_ROW, 'Oct 13, 6:00 PM')).toEqual([
      'Course files: 120 indexed, 4 waiting',
      'Uploads: 2 indexed, 1 waiting, 1 failed',
      'Remembered: 3 indexed, 0 waiting, 0 failed',
      labels.lastIndexedLine('Oct 13, 6:00 PM'),
    ]);
    expect(indexStatusLines(STATUS_ROW, null)[3]).toBe(labels.NEVER_INDEXED_LINE);
  });

  it('runs through the hook', async () => {
    stub.answers.v_workspace_index_status = { data: STATUS_ROW, error: null };
    const { result } = renderHook(() => useWorkspaceIndexStatus(), { wrapper: wrapper(new QueryClient()) });
    await waitFor(() => expect(result.current.data?.uploads_indexed).toBe(2));
  });
});
