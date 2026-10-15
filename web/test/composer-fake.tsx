/**
 * The composer's and the lobby's test scaffold (Phase 24b, W-87).
 *
 * `workspace-harness.tsx` is W-88's and its table fake applies no `.in()`,
 * `.gte()` or `.lte()`, which the composer's reads use (`workspace_request_options`
 * by request ids, `v_work_items` by a date window). So these suites fake the
 * Supabase browser client here, in the same shape: every client call is
 * logged in order, a read answers with the seeded rows of its table (filters
 * are not applied: a test seeds exactly what the screen should see), a read can
 * fail per table, and an RPC answers through `db.rpc` or a built-in
 * `workspace_ask_with` that hands out fixed ids.
 *
 * `vi.mock` stays in each test file (vitest hoists it per file), importing this
 * module inside its factory so the file and its mock share one `db`:
 *
 *   vi.mock('@/lib/supabase/client', async () => (await import('./composer-fake')).supabaseClientMock());
 */

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { newQueryClient } from './hydration-harness';

export type Row = Record<string, unknown>;

export interface Answer {
  data: unknown;
  error: unknown;
}

/** The ids the built-in `workspace_ask_with` answers with. */
export const ASKED = Object.freeze({
  conversationId: '9d3b1c70-4a2e-4f6b-8c1d-5e7f90a1b2c3',
  messageId: 'a1000000-0000-4000-8000-000000000001',
  requestId: 900,
});

function freshDb() {
  return {
    log: [] as string[],
    rows: {} as Record<string, Row[]>,
    readErrors: {} as Record<string, { code: string; message: string }>,
    /** When set, every read waits on it: the rows are still being read. */
    readGate: null as Promise<void> | null,
    rpc: {} as Record<string, (args: Row) => Answer | Promise<Answer>>,
    rpcCalls: [] as { fn: string; args: Row }[],
  };
}

let state = freshDb();

/** One object for the whole file: `db.state` is replaced by `resetDb()`. */
export const db = {
  get state() {
    return state;
  },
};

export function resetDb(): void {
  state = freshDb();
}

function readChain(table: string): Record<string, unknown> {
  const answer = async (): Promise<Answer> => {
    if (state.readGate) await state.readGate;
    const error = state.readErrors[table];
    if (error) return { data: null, error };
    return { data: (state.rows[table] ?? []).map((row) => ({ ...row })), error: null };
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const name of ['select', 'eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range']) {
    chain[name] = self;
  }
  Object.assign(chain, {
    maybeSingle: async () => {
      const result = await answer();
      return result.error ? result : { data: (result.data as Row[])[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: Answer) => unknown, onRejected?: (reason: unknown) => unknown) =>
      answer().then(onFulfilled, onRejected),
  });
  return chain;
}

function askWithAnswer(): Answer {
  return {
    data: {
      conversation_id: ASKED.conversationId,
      message_id: ASKED.messageId,
      request_id: ASKED.requestId,
    },
    error: null,
  };
}

async function callRpc(fn: string, args: Row): Promise<Answer> {
  state.log.push(`rpc:${fn}`);
  state.rpcCalls.push({ fn, args });
  const replaced = state.rpc[fn];
  if (replaced) return replaced(args);
  if (fn === 'workspace_ask_with') return askWithAnswer();
  return { data: null, error: { code: 'PGRST202', message: `no function ${fn}` } };
}

function fakeClient() {
  return {
    from: (table: string) => {
      state.log.push(`from:${table}`);
      return readChain(table);
    },
    rpc: callRpc,
  };
}

/** The module `@/lib/supabase/client` is replaced with. */
export function supabaseClientMock() {
  return { getSupabaseBrowserClient: fakeClient };
}

/** The tables the suites read, by name. */
export function readTables(): string[] {
  return state.log.filter((entry) => entry.startsWith('from:')).map((entry) => entry.slice('from:'.length));
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

export function withClient(node: ReactNode, client: QueryClient = newQueryClient()): ReactNode {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

/** Let every pending promise callback and zero-delay timer run. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/* ---------------------------------------------------------------------------
 * Synthetic rows (no private text)
 * ------------------------------------------------------------------------ */

export const COURSES: Row[] = [
  { display_id: 'IST.323', code: 'IST 323', title: 'Course one', shell_ids: ['IST.323.M001'], meetings: null },
  { display_id: 'MAS.362', code: 'MAS 362', title: 'Course two', shell_ids: ['MAS.362.M002'], meetings: null },
];

export function routine(id: string, overrides: Row = {}): Row {
  return {
    id,
    grp: 'study',
    title: `Routine ${id}`,
    description: `What ${id} does.`,
    needs: 'nothing',
    sort: 1,
    enabled: true,
    ...overrides,
  };
}

export function bbFile(id: number, overrides: Row = {}): Row {
  return {
    id,
    course_id: 'IST.323.M001',
    file_name: `Week ${id} slides.pptx`,
    storage_path: null,
    path: null,
    bucket: 'lecture',
    week_no: id,
    ...overrides,
  };
}

export function upload(id: number, state: string, overrides: Row = {}): Row {
  return {
    id,
    kind: 'upload',
    title: `notes-${id}.md`,
    state,
    error_code: state === 'failed' ? 'link_expired' : null,
    mime: 'text/markdown',
    byte_size: 10,
    sha256: 'a'.repeat(64),
    storage_key: `u/${'a'.repeat(64)}`,
    course_id: null,
    conversation_id: null,
    attempts: 1,
    created_at: '2026-10-15T12:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
    ...overrides,
  };
}
