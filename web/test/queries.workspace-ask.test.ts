/**
 * `workspace_ask_with` and the options rows (Phase 24b, brief 111, task 5).
 *
 * Asserted: the options go out as the six keys of `ask-options.json`, checked
 * first by the database's own rules (depth, format, ids, five attachments); the
 * question is measured before them; each SQLSTATE the function raises maps to
 * its one sentence and an unrelated 23503 to none; the options rows are read by
 * the conversation's request ids and the newest is the one the composer
 * restores. The Supabase client is a recording stub, so nothing touches the
 * network.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import askOptionsFixture from '../../workspace/test/fixtures/contract24/ask-options.json';

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
  const settle = async () => stub.result;
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
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      stub.calls.push({ target: fn, op: 'rpc', args: [args] });
      return Promise.resolve(stub.result);
    },
  }),
}));

const ask = await import('@/lib/queries.workspace-ask');
const labels = await import('@/lib/workspace-labels');
const { WorkspaceRefusal, workspaceKeys } = await import('@/lib/queries.workspace');
const {
  DEFAULT_ASK_OPTIONS,
  WORKSPACE_ATTACHMENTS_MAX,
  WORKSPACE_DEPTHS,
  WorkspaceOptionsRefusal,
  askWithRefusalFor,
  askWorkspaceWith,
  lastRequestOptionsOf,
  normalizeRequestOptions,
  requestOptionsOptions,
  toAskOptionsJson,
  useAskWorkspaceWith,
  useWorkspaceRequestOptions,
  workspaceAskKeys,
} = ask;
type WorkspaceDepth = import('@/lib/queries.workspace-ask').WorkspaceDepth;
type WorkspaceAskOptions = import('@/lib/queries.workspace-ask').WorkspaceAskOptions;

/** The depth menu's words are keyed by this module's depths: the two are pinned equal. */
const _depthLabels: Record<WorkspaceDepth, string> = labels.DEPTH_LABELS;
const _depthNotes: Record<WorkspaceDepth, string> = labels.DEPTH_NOTES;

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const MESSAGE = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';

function rpcCalls(): Call[] {
  return stub.calls.filter((call) => call.op === 'rpc');
}

function options(overrides: Partial<WorkspaceAskOptions> = {}): WorkspaceAskOptions {
  return { ...DEFAULT_ASK_OPTIONS, ...overrides };
}

beforeEach(() => {
  stub.calls = [];
  stub.result = { data: null, error: null };
});

describe('the vocabularies', () => {
  it('lists the four depths in menu order, pinned to the depth labels', () => {
    expect(WORKSPACE_DEPTHS).toEqual(['auto', 'quick', 'standard', 'deep']);
    expect(Object.keys(_depthLabels)).toEqual([...WORKSPACE_DEPTHS]);
    expect(Object.keys(_depthNotes)).toEqual([...WORKSPACE_DEPTHS]);
    expect(WORKSPACE_ATTACHMENTS_MAX).toBe(5);
  });

  it('starts on all courses, auto, no routine, rich, no attachment', () => {
    expect(DEFAULT_ASK_OPTIONS).toEqual({
      course: null,
      depth: 'auto',
      routine: null,
      format: 'rich',
      files: [],
      uploads: [],
    });
  });
});

describe('toAskOptionsJson: the six keys, the database`s rules first', () => {
  it('has exactly the keys of ask-options.json, nulls kept', () => {
    const fixture: Record<string, unknown> = askOptionsFixture;
    const json = toAskOptionsJson(options());
    expect(Object.keys(json).sort()).toEqual(Object.keys(fixture).sort());
    expect(json).toEqual({ course: null, depth: 'auto', routine: null, format: 'rich', files: [], uploads: [] });
  });

  it('round-trips the fixture`s values, arrays in the order given', () => {
    const fixture = askOptionsFixture as WorkspaceAskOptions;
    expect(toAskOptionsJson(fixture)).toEqual(fixture);
    expect(toAskOptionsJson(options({ files: [3, 1, 2] })).files).toEqual([3, 1, 2]);
  });

  it('returns a new object: the caller`s arrays are not shared', () => {
    const files = [1, 2];
    const json = toAskOptionsJson(options({ files }));
    expect(json.files).not.toBe(files);
  });

  it.each([
    ['a depth outside the list', { depth: 'max' as WorkspaceDepth }],
    ['a format outside the list', { format: 'html' as 'rich' }],
    ['a file id that is not a positive integer', { files: [0] }],
    ['an upload id that is fractional', { uploads: [1.5] }],
    ['an id past 2^53', { files: [2 ** 53] }],
    ['six attachments in all', { files: [1, 2, 3], uploads: [4, 5, 6] }],
    ['an empty course id', { course: '' }],
    ['an empty routine id', { routine: '' }],
  ])('refuses %s with options_rejected', (_label, overrides) => {
    expect(() => toAskOptionsJson(options(overrides))).toThrow(WorkspaceOptionsRefusal);
    try {
      toAskOptionsJson(options(overrides));
    } catch (error) {
      expect((error as InstanceType<typeof WorkspaceOptionsRefusal>).reason).toBe('options_rejected');
      expect((error as Error).message).toBe(labels.REFUSAL_OPTIONS_REJECTED);
    }
  });

  it('takes five attachments', () => {
    expect(toAskOptionsJson(options({ files: [1, 2], uploads: [3, 4, 5] })).uploads).toEqual([3, 4, 5]);
  });
});

describe('askWithRefusalFor: one sentence per SQLSTATE', () => {
  it('keeps 22023 and 23505 as today`s two refusals', () => {
    const length = askWithRefusalFor({ code: '22023', message: 'x' });
    const open = askWithRefusalFor({ code: '23505', message: 'x' });
    expect(length).toBeInstanceOf(WorkspaceRefusal);
    expect(length?.message).toBe(labels.REFUSAL_QUESTION_LENGTH);
    expect(open?.message).toBe(labels.REFUSAL_STILL_ANSWERING);
  });

  it('maps 23514 to options_rejected and 42501 to not_owner', () => {
    expect(askWithRefusalFor({ code: '23514' })).toMatchObject({
      reason: 'options_rejected',
      message: labels.REFUSAL_OPTIONS_REJECTED,
    });
    expect(askWithRefusalFor({ code: '42501' })).toMatchObject({ reason: 'not_owner', message: labels.NOT_OWNER_LINE });
  });

  it('maps a 23503 raised by workspace_ask_with to reference_gone, and any other 23503 to null', () => {
    expect(
      askWithRefusalFor({ code: '23503', message: 'workspace_ask_with: unknown routine quiz' }),
    ).toMatchObject({ reason: 'reference_gone', message: labels.REFUSAL_REFERENCE_GONE });
    expect(askWithRefusalFor({ code: '23503', message: 'insert or update violates foreign key' })).toBeNull();
    expect(askWithRefusalFor({ code: '23503' })).toBeNull();
  });

  it('is null for any other error', () => {
    expect(askWithRefusalFor(new Error('network'))).toBeNull();
    expect(askWithRefusalFor(null)).toBeNull();
    expect(askWithRefusalFor({ code: '57014' })).toBeNull();
  });
});

describe('askWorkspaceWith: the question first, then the call', () => {
  it('sends the trimmed text and the six keys to workspace_ask_with', async () => {
    stub.result = { data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: 42 }, error: null };
    const result = await askWorkspaceWith({
      conversationId: CONVERSATION.toUpperCase(),
      text: '  What is on the exam?  ',
      options: options({ depth: 'deep', files: [412] }),
    });
    expect(result).toEqual({ conversationId: CONVERSATION, messageId: MESSAGE, requestId: 42 });
    expect(rpcCalls()).toEqual([
      {
        target: 'workspace_ask_with',
        op: 'rpc',
        args: [
          {
            p_conversation_id: CONVERSATION,
            p_text: 'What is on the exam?',
            p_options: { course: null, depth: 'deep', routine: null, format: 'rich', files: [412], uploads: [] },
          },
        ],
      },
    ]);
  });

  it('starts a conversation with a null id', async () => {
    stub.result = { data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: '7' }, error: null };
    await expect(askWorkspaceWith({ conversationId: null, text: 'Hi', options: options() })).resolves.toMatchObject({
      requestId: 7,
    });
    expect((rpcCalls()[0].args[0] as Record<string, unknown>).p_conversation_id).toBeNull();
  });

  it('refuses an empty question before the options are read, and calls nothing', async () => {
    await expect(
      askWorkspaceWith({ conversationId: null, text: '   ', options: options({ depth: 'bad' as WorkspaceDepth }) }),
    ).rejects.toBeInstanceOf(WorkspaceRefusal);
    expect(rpcCalls()).toEqual([]);
  });

  it('refuses bad options before any call', async () => {
    await expect(
      askWorkspaceWith({ conversationId: null, text: 'ok', options: options({ files: [1, 2, 3, 4, 5, 6] }) }),
    ).rejects.toBeInstanceOf(WorkspaceOptionsRefusal);
    expect(rpcCalls()).toEqual([]);
  });

  it('throws for a conversation id that is not a uuid', async () => {
    await expect(askWorkspaceWith({ conversationId: 'abc', text: 'ok', options: options() })).rejects.toThrow(
      /uuid/,
    );
  });

  it('throws the refusal a database error stands for, else the error itself', async () => {
    stub.result = { data: null, error: { code: '23514', message: 'check' } };
    await expect(askWorkspaceWith({ conversationId: null, text: 'ok', options: options() })).rejects.toMatchObject({
      reason: 'options_rejected',
    });
    const missing = { code: '23503', message: 'fk' };
    stub.result = { data: null, error: missing };
    await expect(askWorkspaceWith({ conversationId: null, text: 'ok', options: options() })).rejects.toBe(missing);
  });

  it('throws when the answer lacks one of the three ids', async () => {
    stub.result = { data: { conversation_id: CONVERSATION, request_id: 1 }, error: null };
    await expect(askWorkspaceWith({ conversationId: null, text: 'ok', options: options() })).rejects.toThrow(
      /three ids/,
    );
  });
});

describe('the options rows', () => {
  const row = {
    request_id: 41,
    depth: 'standard',
    format: 'rich',
    routine_id: 'quiz',
    course_display_id: 'BIO.110',
    course_ids: ['BIO.110', 'BIO.110.lab'],
  };

  it('normalises a row, and drops one with no id, depth or format', () => {
    expect(normalizeRequestOptions(row)).toEqual(row);
    expect(normalizeRequestOptions({ ...row, routine_id: null, course_ids: null, course_display_id: '' })).toEqual({
      ...row,
      routine_id: null,
      course_ids: null,
      course_display_id: null,
    });
    expect(normalizeRequestOptions({ ...row, course_ids: ['a', 3] })?.course_ids).toEqual(['a']);
    expect(normalizeRequestOptions({ ...row, request_id: null })).toBeNull();
    expect(normalizeRequestOptions({ ...row, depth: 'max' })).toBeNull();
    expect(normalizeRequestOptions({ ...row, format: 'html' })).toBeNull();
    expect(normalizeRequestOptions('row')).toBeNull();
  });

  it('reads the rows of the conversation`s requests, and only with a uuid and ids', async () => {
    expect(requestOptionsOptions(null, [1]).enabled).toBe(false);
    expect(requestOptionsOptions(CONVERSATION, []).enabled).toBe(false);
    const query = requestOptionsOptions(CONVERSATION, [41, 42]);
    expect(query.enabled).toBe(true);
    expect(query.queryKey).toEqual(workspaceAskKeys.options(CONVERSATION));
    expect(workspaceAskKeys.options(CONVERSATION)).toEqual(['workspace', 'request-options', CONVERSATION]);

    stub.result = { data: [row, { request_id: 'x' }], error: null };
    const rows = await query.queryFn!({} as never);
    expect(rows).toEqual([row]);
    expect(stub.calls).toEqual([
      {
        target: 'workspace_request_options',
        op: 'select',
        args: ['request_id, depth, format, routine_id, course_display_id, course_ids'],
      },
      { target: 'workspace_request_options', op: 'in', args: ['request_id', [41, 42]] },
      { target: 'workspace_request_options', op: 'order', args: ['request_id', { ascending: true }] },
    ]);
  });

  it('throws a read error, and refuses a bad request id before reading', async () => {
    stub.result = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(requestOptionsOptions(CONVERSATION, [1]).queryFn!({} as never)).rejects.toMatchObject({
      code: '42501',
    });
    await expect(requestOptionsOptions(CONVERSATION, [0]).queryFn!({} as never)).rejects.toThrow(/request id/);
  });

  it('restores from the newest request`s row', () => {
    const older = normalizeRequestOptions({ ...row, request_id: 40 })!;
    const newer = normalizeRequestOptions({ ...row, request_id: 44, routine_id: null })!;
    expect(lastRequestOptionsOf([newer, older])).toBe(newer);
    expect(lastRequestOptionsOf([])).toBeNull();
  });
});

describe('the hooks', () => {
  function wrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children);
    };
  }

  it('asks, then refreshes the conversation and its options rows', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stub.result = { data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: 42 }, error: null };
    const { result } = renderHook(() => useAskWorkspaceWith(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: null, text: 'Hi', options: options() });
    });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(workspaceKeys.messages(CONVERSATION));
    expect(keys).toContainEqual(workspaceAskKeys.options(CONVERSATION));
  });

  it('refreshes the conversation it was given when the ask is refused', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    stub.result = { data: null, error: { code: '23505' } };
    const { result } = renderHook(() => useAskWorkspaceWith(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current
        .mutateAsync({ conversationId: CONVERSATION, text: 'Hi', options: options() })
        .catch(() => undefined);
    });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(
      workspaceKeys.requests(CONVERSATION),
    );
  });

  it('reads the options rows through the hook', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    stub.result = { data: [{ request_id: 5, depth: 'auto', format: 'plain' }], error: null };
    const { result } = renderHook(() => useWorkspaceRequestOptions(CONVERSATION, [5]), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ request_id: 5, routine_id: null, course_ids: null });
  });
});
