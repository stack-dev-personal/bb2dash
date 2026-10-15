/**
 * The Workspace test scaffold (Phase 21), shared by every suite that mounts the
 * stream hook or the screen.
 *
 * It is a fake Supabase browser client that records every call in order and
 * stands in for the four things the Workspace talks to:
 *
 *   * the tables and the view: `from(table)` reads `fake.state.rows[table]`,
 *     applies `.eq()` filters, and `.update()` writes back, so a list can lose
 *     a row a test archived; `fake.state.readGate` holds every read of a table
 *     open, for the moment in which the rows are still being read;
 *   * the two RPCs: `workspace_ask` and `workspace_cancel` change the seeded
 *     rows the way migration 140's functions do (a question, its queued
 *     request, the 23505 refusal; an open request turned `cancelled`). A test
 *     can replace either through `fake.state.rpc`;
 *   * Realtime: `realtime.setAuth()`, `channel()` and `removeChannel()`, with a
 *     `FakeChannel` a test drives by hand (`emit`, `status`);
 *   * the router: `?c=` (and Phase 24b's `?panel=`) is `fake.state.search`, and
 *     `replace` / `push` set it. The screen re-renders when they do, as Next's
 *     router does, so a test can follow a navigation the page makes itself.
 *
 * PHASE 24b (W-88) adds what the new page reads and writes: `.in()` and
 * `.limit()` on a read; `storage.from(bucket)` with `createSignedUrl`,
 * `remove` and `upload`, recorded in `fake.state.storage`; the functions
 * `workspace_ask_with` (as `workspace_ask`, with an options row),
 * `workspace_document_delete` (its two steps, or one for a remembered item)
 * and `workspace_upload_retry`; and a stand-in for the composer and the lobby
 * (`composerMock`, `lobbyMock`), built to `composer-contract.ts`, which records
 * the props it was last given in `fake.state.composer`. The stand-in asks
 * through the frozen `askWorkspaceWith`, so a question really reaches the fake
 * database; W-87's own tests hold the real composer.
 *
 * `vi.mock` calls stay in each test file (vitest hoists them per file). Each
 * one imports this module inside its factory, so the file and its mocks share
 * the one `fake`:
 *
 *   vi.mock('@/lib/supabase/client', async () =>
 *     (await import('./workspace-harness')).supabaseClientMock());
 *   vi.mock('next/navigation', async () =>
 *     (await import('./workspace-harness')).navigationMock());
 */

import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { expect, vi } from 'vitest';
import type { ComposerProps, LobbyProps } from '@/components/workspace/composer-contract';

type Handler = (message: unknown) => void;
type StatusCallback = (status: string, error?: Error) => void;
export type Row = Record<string, unknown>;

/** What a PostgREST call resolves to. */
export interface Answer {
  data: unknown;
  error: unknown;
}

export class FakeChannel {
  readonly handlers = new Map<string, Handler>();
  statusCallback: StatusCallback | null = null;

  constructor(
    readonly topic: string,
    readonly params: unknown,
  ) {}

  on(type: string, filter: { event: string }, handler: Handler): this {
    this.handlers.set(`${type}:${filter.event}`, handler);
    return this;
  }

  subscribe(callback: StatusCallback): this {
    state.log.push(`subscribe:${this.topic}`);
    this.statusCallback = callback;
    return this;
  }

  /** Deliver one broadcast the way supabase-js hands it to a handler. */
  emit(event: string, payload: unknown): void {
    this.handlers.get(`broadcast:${event}`)?.({ type: 'broadcast', event, payload });
  }

  status(status: string, error?: Error): void {
    this.statusCallback?.(status, error);
  }
}

/** The ids `workspace_ask` hands out, in order, when a test does not replace it. */
export const NEW_CONVERSATION = '9d3b1c70-4a2e-4f6b-8c1d-5e7f90a1b2c3';
const NEW_MESSAGES = [
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
];
/** The first request id `workspace_ask` hands out. */
export const NEW_REQUEST = 900;

const OPEN_STATES = ['queued', 'claimed'];

function freshState() {
  return {
    /** Every client call, in order. */
    log: [] as string[],
    channels: [] as FakeChannel[],
    /** Channels opened and not yet left. */
    open: new Set<FakeChannel>(),
    /** The most channels ever open at once. */
    maxOpen: 0,
    authError: null as Error | null,
    /** When set, `setAuth` waits on it: the socket is still being signed in. */
    authGate: null as Promise<void> | null,
    /** When set, a leave waits on it: the old channel is still leaving. */
    leaveGate: null as Promise<void> | null,
    /** When set, a leave fails with it. */
    leaveError: null as Error | null,
    /** What a leave answers with: supabase-js resolves to 'ok', 'timed out' or 'error'. */
    leaveAnswer: 'ok',
    /** The page's query string. */
    search: '',
    rows: {} as Record<string, Row[]>,
    /** When set, every read of a table waits on it before it answers: the rows are still being read. */
    readGate: null as Promise<void> | null,
    /** Per table: every read of it answers with this error. */
    readErrors: {} as Record<string, { code: string; message: string }>,
    /** Per table: every `.update()` of it answers with this error; its reads still work. */
    writeErrors: {} as Record<string, { code: string; message: string }>,
    /** Per function: what replaces the built-in answer. */
    rpc: {} as Record<string, (args: Row) => Answer | Promise<Answer>>,
    /** When set, every RPC waits on it before it answers. */
    rpcGate: null as Promise<void> | null,
    rpcCalls: [] as { fn: string; args: Row }[],
    asked: 0,
    router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
    /** Storage: every object signed and removed, and an error for either to answer with. */
    storage: {
      signed: [] as string[],
      removed: [] as string[],
      uploaded: [] as string[],
      signError: null as { message: string } | null,
      removeError: null as { message: string } | null,
    },
    /** The props the stand-in composer was last rendered with; null before it was. */
    composer: null as ComposerProps | null,
  };
}

let state = freshState();

/** Who re-renders when the route changes: the stand-in `useSearchParams`. */
const routeListeners = new Set<() => void>();

function setSearch(search: string): void {
  state.search = search;
  for (const listener of routeListeners) listener();
}

/** One object for the whole file: `fake.state` is replaced by `resetFake()`. */
export const fake = {
  get state() {
    return state;
  },
  FakeChannel,
};

/** The query string of a path the screen navigated to. */
function searchOf(path: string): string {
  const mark = path.indexOf('?');
  return mark === -1 ? '' : path.slice(mark + 1);
}

/** A clean fake: call it in `beforeEach`. */
export function resetFake(): void {
  state = freshState();
  state.router.replace.mockImplementation((path: string) => {
    setSearch(searchOf(path));
  });
  state.router.push.mockImplementation((path: string) => {
    setSearch(searchOf(path));
  });
}

resetFake();

/* ---------------------------------------------------------------------------
 * Tables
 * ------------------------------------------------------------------------ */

function tableChain(table: string): Record<string, unknown> {
  const filters: [string, unknown][] = [];
  const inFilters: [string, readonly unknown[]][] = [];
  let limit: number | null = null;
  let patch: Row | null = null;
  const matches = (row: Row) =>
    filters.every(([column, value]) => row[column] === value) &&
    inFilters.every(([column, values]) => values.includes(row[column]));

  const settle = (): Answer => {
    const error = state.readErrors[table];
    if (error) return { data: null, error };
    const rows = state.rows[table] ?? [];
    if (patch === null) {
      const read = rows.filter(matches).map((row) => ({ ...row }));
      return { data: limit === null ? read : read.slice(0, limit), error: null };
    }
    const refused = state.writeErrors[table];
    if (refused) return { data: null, error: refused };
    const change = patch;
    state.rows = { ...state.rows, [table]: rows.map((row) => (matches(row) ? { ...row, ...change } : row)) };
    return { data: null, error: null };
  };

  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    order: self,
    update: (values: Row) => {
      state.log.push(`update:${table}`);
      patch = values;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    },
    in: (column: string, values: readonly unknown[]) => {
      inFilters.push([column, values]);
      return chain;
    },
    limit: (count: number) => {
      limit = count;
      return chain;
    },
    maybeSingle: async (): Promise<Answer> => {
      // The one-row read (the status) is held like any other read.
      if (state.readGate) await state.readGate;
      const answer = settle();
      if (answer.error) return answer;
      return { data: (answer.data as Row[])[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: Answer) => unknown, onRejected?: (reason: unknown) => unknown) => {
      // A write is never held. With no gate the answer is as immediate as it always was.
      const held = patch === null ? state.readGate : null;
      const answered = held === null ? Promise.resolve(settle()) : held.then(settle);
      return answered.then(onFulfilled, onRejected);
    },
  });
  return chain;
}

/* ---------------------------------------------------------------------------
 * The two RPCs, as migration 140 writes them
 * ------------------------------------------------------------------------ */

function rowsOf(table: string): Row[] {
  return state.rows[table] ?? [];
}

function askAnswer(args: Row): Answer {
  const given = args.p_conversation_id;
  const conversationId = typeof given === 'string' ? given : NEW_CONVERSATION;
  const open = rowsOf('workspace_requests').some(
    (row) => row.conversation_id === conversationId && OPEN_STATES.includes(String(row.state)),
  );
  if (open) return { data: null, error: { code: '23505', message: 'duplicate key value' } };

  const messageId = NEW_MESSAGES[state.asked % NEW_MESSAGES.length];
  const requestId = NEW_REQUEST + state.asked;
  state.asked += 1;
  const conversations =
    given === null
      ? [
          ...rowsOf('workspace_conversations'),
          { id: conversationId, title: String(args.p_text), archived: false, updated_at: null },
        ]
      : rowsOf('workspace_conversations');
  state.rows = {
    ...state.rows,
    workspace_conversations: conversations,
    workspace_messages: [
      ...rowsOf('workspace_messages'),
      { id: messageId, conversation_id: conversationId, role: 'user', content: args.p_text, finished: true },
    ],
    workspace_requests: [
      ...rowsOf('workspace_requests'),
      { id: requestId, conversation_id: conversationId, user_message_id: messageId, state: 'queued' },
    ],
  };
  return {
    data: { conversation_id: conversationId, message_id: messageId, request_id: requestId },
    error: null,
  };
}

function cancelAnswer(args: Row): Answer {
  const requests = rowsOf('workspace_requests');
  const target = requests.find(
    (row) => row.id === args.p_request_id && OPEN_STATES.includes(String(row.state)),
  );
  if (!target) return { data: false, error: null };
  state.rows = {
    ...state.rows,
    workspace_requests: requests.map((row) =>
      row === target ? { ...row, state: 'cancelled', error_code: 'cancelled' } : row,
    ),
  };
  return { data: true, error: null };
}

/** `workspace_ask_with`: `workspace_ask`'s rows, and the request's options row (the format the composer sent). */
function askWithAnswer(args: Row): Answer {
  const answer = askAnswer(args);
  if (answer.error) return answer;
  const requestId = (answer.data as Row).request_id;
  const options = (args.p_options ?? {}) as Row;
  state.rows = {
    ...state.rows,
    workspace_request_options: [
      ...rowsOf('workspace_request_options'),
      {
        request_id: requestId,
        depth: options.depth ?? 'auto',
        format: options.format ?? 'rich',
        routine_id: options.routine ?? null,
        course_display_id: options.course ?? null,
        course_ids: null,
      },
    ],
  };
  return answer;
}

/**
 * `workspace_document_delete`, as migration 196 writes it: an upload's first call
 * marks it `deleting` and returns its key, the second drops the row; a remembered
 * item goes whole in one call.
 */
function documentDeleteAnswer(args: Row): Answer {
  const documents = rowsOf('workspace_documents');
  const target = documents.find((row) => row.id === args.p_document_id);
  if (!target) return { data: null, error: { code: 'P0002', message: 'no such document' } };
  const done = args.p_object_removed === true || target.kind === 'memory';
  state.rows = {
    ...state.rows,
    workspace_documents: done
      ? documents.filter((row) => row !== target)
      : documents.map((row) => (row === target ? { ...row, state: 'deleting' } : row)),
  };
  return {
    data: { id: target.id, kind: target.kind, state: done ? 'deleted' : 'deleting', storage_key: target.storage_key ?? null },
    error: null,
  };
}

/** `workspace_upload_retry`: a failed upload with a new link is `stored` again. */
function uploadRetryAnswer(args: Row): Answer {
  const documents = rowsOf('workspace_documents');
  const target = documents.find((row) => row.id === args.p_document_id);
  if (!target) return { data: null, error: { code: 'P0002', message: 'no such document' } };
  state.rows = {
    ...state.rows,
    workspace_documents: documents.map((row) =>
      row === target ? { ...row, state: 'stored', error_code: null } : row,
    ),
  };
  return { data: { id: target.id, state: 'stored' }, error: null };
}

const BUILT_IN_RPC: Record<string, (args: Row) => Answer> = {
  workspace_ask: askAnswer,
  workspace_ask_with: askWithAnswer,
  workspace_cancel: cancelAnswer,
  workspace_document_delete: documentDeleteAnswer,
  workspace_upload_retry: uploadRetryAnswer,
};

/* ---------------------------------------------------------------------------
 * Storage
 * ------------------------------------------------------------------------ */

function storageBucket(bucket: string) {
  return {
    createSignedUrl: async (key: string, seconds: number): Promise<Answer> => {
      state.log.push(`storage:sign:${bucket}/${key}`);
      if (state.storage.signError) return { data: null, error: state.storage.signError };
      state.storage.signed.push(`${bucket}/${key}`);
      return { data: { signedUrl: `https://storage.test/${bucket}/${key}?seconds=${seconds}` }, error: null };
    },
    remove: async (keys: string[]): Promise<Answer> => {
      state.log.push(`storage:remove:${bucket}/${keys.join(',')}`);
      if (state.storage.removeError) return { data: null, error: state.storage.removeError };
      state.storage.removed.push(...keys.map((key) => `${bucket}/${key}`));
      return { data: keys.map((name) => ({ name })), error: null };
    },
    upload: async (key: string): Promise<Answer> => {
      state.log.push(`storage:upload:${bucket}/${key}`);
      state.storage.uploaded.push(`${bucket}/${key}`);
      return { data: { path: key }, error: null };
    },
  };
}

async function callRpc(fn: string, args: Row): Promise<Answer> {
  state.log.push(`rpc:${fn}`);
  state.rpcCalls.push({ fn, args });
  if (state.rpcGate) await state.rpcGate;
  const answer = state.rpc[fn] ?? BUILT_IN_RPC[fn];
  if (!answer) return { data: null, error: { code: 'PGRST202', message: `no function ${fn}` } };
  return answer(args);
}

/* ---------------------------------------------------------------------------
 * The two module mocks
 * ------------------------------------------------------------------------ */

function fakeClient() {
  return {
    from: (table: string) => {
      state.log.push(`from:${table}`);
      return tableChain(table);
    },
    rpc: callRpc,
    storage: { from: storageBucket },
    realtime: {
      setAuth: async () => {
        state.log.push('setAuth');
        if (state.authGate) await state.authGate;
        if (state.authError) throw state.authError;
      },
    },
    channel: (topic: string, params: unknown) => {
      state.log.push(`channel:${topic}`);
      const channel = new FakeChannel(topic, params);
      state.channels.push(channel);
      state.open.add(channel);
      state.maxOpen = Math.max(state.maxOpen, state.open.size);
      return channel;
    },
    removeChannel: async (channel: FakeChannel) => {
      state.log.push(`remove:${channel.topic}`);
      if (state.leaveGate) await state.leaveGate;
      state.open.delete(channel);
      if (state.leaveError) throw state.leaveError;
      return state.leaveAnswer;
    },
  };
}

/** The module `@/lib/supabase/client` is replaced with. */
export function supabaseClientMock() {
  return { getSupabaseBrowserClient: fakeClient };
}

function subscribeToRoute(listener: () => void): () => void {
  routeListeners.add(listener);
  return () => {
    routeListeners.delete(listener);
  };
}

/** `useSearchParams`, re-rendering when the stand-in router changes the route. */
function useFakeSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeToRoute, () => state.search, () => state.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** The module `next/navigation` is replaced with. */
export function navigationMock() {
  return {
    useSearchParams: useFakeSearchParams,
    usePathname: () => '/workspace',
    useRouter: () => state.router,
  };
}

/* ---------------------------------------------------------------------------
 * The stand-in composer and lobby (composer-contract.ts, ruling C-1)
 * ------------------------------------------------------------------------ */

/** The refusal sentence of an error the composer words itself; null for any other. */
async function refusalOf(error: unknown): Promise<string | null> {
  const { WorkspaceRefusal } = await import('@/lib/queries.workspace');
  const { WorkspaceOptionsRefusal } = await import('@/lib/queries.workspace-ask');
  if (error instanceof WorkspaceRefusal || error instanceof WorkspaceOptionsRefusal) return error.message;
  return null;
}

/** One question, through the frozen `askWorkspaceWith`, then the conversation re-read as the real hook does. */
async function askThroughTheFake(conversationId: string | null, text: string) {
  const ask = await import('@/lib/queries.workspace-ask');
  return ask.askWorkspaceWith({ conversationId, text, options: ask.DEFAULT_ASK_OPTIONS });
}

/**
 * The composer as the contract describes it, and no more: a box named
 * "Question", one button that reads Ask or Stop, Enter that asks (Shift+Enter
 * a new line), its own pending ask added to `busy`, a refusal said under the
 * box, any other failure handed to `onAskError`.
 */
function FakeComposer(props: ComposerProps) {
  useEffect(() => {
    state.composer = props;
  });
  const queryClient = useQueryClient();
  const [text, setText] = useState(props.initialText ?? '');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  async function ask(): Promise<void> {
    if (sending.current || props.requestOpen || props.disabled) return;
    sending.current = true;
    setPending(true);
    try {
      const result = await askThroughTheFake(props.conversationId, text);
      setText('');
      props.onAsked(result);
    } catch (error) {
      const sentence = await refusalOf(error);
      if (sentence === null) props.onAskError(error);
      else setRefusal(sentence);
    } finally {
      const { invalidateWorkspaceConversation } = await import('@/lib/queries.workspace');
      invalidateWorkspaceConversation(queryClient, props.conversationId);
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'request-options'] });
      sending.current = false;
      setPending(false);
    }
  }

  const busy = props.busy || pending;
  return (
    <div data-fake-composer>
      <textarea
        aria-label="Question"
        value={text}
        disabled={props.disabled}
        onChange={(event) => {
          setText(event.target.value);
          setRefusal(null);
          props.onEdit();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          void ask();
        }}
      />
      {props.requestOpen ? (
        <button type="button" disabled={busy || props.disabled} onClick={props.onStop}>
          Stop
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || props.disabled}
          aria-busy={busy || undefined}
          onClick={() => void ask()}
        >
          Ask
        </button>
      )}
      {refusal !== null && <p data-refusal>{refusal}</p>}
    </div>
  );
}

/** The lobby as the contract describes it: its root carries `data-lobby`, and a first question moves the page. */
function FakeLobby({ onCreated }: LobbyProps) {
  return (
    <div data-lobby>
      <FakeComposer
        conversationId={null}
        requestIds={[]}
        requestOpen={false}
        busy={false}
        disabled={false}
        onAsked={(result) => onCreated(result.conversationId)}
        onAskError={() => undefined}
        onStop={() => undefined}
        onEdit={() => undefined}
      />
    </div>
  );
}

/** The module `@/components/workspace/Composer` is replaced with. */
export function composerMock() {
  return { Composer: FakeComposer };
}

/** The module `@/components/workspace/Lobby` is replaced with. */
export function lobbyMock() {
  return { Lobby: FakeLobby };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

export function openTopics(): string[] {
  return [...state.open].map((channel) => channel.topic);
}

/** The channel the page holds on `topic`, once it has been opened and subscribed. */
export async function joined(topic: string): Promise<FakeChannel> {
  await waitFor(() => expect(state.log).toContain(`subscribe:${topic}`));
  const channel = state.channels.findLast((candidate) => candidate.topic === topic);
  if (!channel) throw new Error(`no channel on ${topic}`);
  return channel;
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A promise a test settles by hand, to hold the fake client mid-call. */
export function gate(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Let every pending promise callback and zero-delay timer run. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
