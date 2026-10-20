/**
 * The proposals' reads and the one write (Phase 25b, E; 119b): `v_workspace_proposals` by
 * conversation and by id, and `rpc('workspace_proposal_decide', {p_id, p_decision})`.
 *
 * The browser client is a recording fake, so each test reads the exact request the page makes.
 */

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  method: string;
  args: unknown[];
}

const calls: Call[] = [];
const answer: { data: unknown; error: unknown } = { data: [], error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: answer.data, error: answer.error });
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (relation: string) => {
      calls.push({ method: 'from', args: [relation] });
      return builder();
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ method: 'rpc', args: [name, args] });
      return Promise.resolve({ data: answer.data, error: answer.error });
    },
  }),
}));

const {
  conversationProposalsOptions,
  decideProposal,
  invalidateProposalCaches,
  proposalKeys,
  proposalsByIdsOptions,
} = await import('@/lib/queries.workspace-proposals');
const { PROPOSAL_COLUMNS } = await import('@/lib/workspace-proposals');
const { syncKeys } = await import('@/lib/queries.sync');

const CONVERSATION = '11111111-2222-4333-8444-555555555555';
const ROW = {
  id: 7,
  request_id: 41,
  conversation_id: CONVERSATION,
  target: 'assignment_progress',
  row_id: 'ECN.304/problem-set-4',
  label: 'ECN 304 Problem Set 4',
  field: 'status',
  old_value: 'in_progress',
  new_value: 'submitted',
  reason: 'Handed in.',
  state: 'proposed',
  effective_state: 'proposed',
};

async function run<T>(options: { queryFn?: unknown }): Promise<T> {
  const fn = options.queryFn as (context: unknown) => Promise<T>;
  return fn({ signal: new AbortController().signal });
}

beforeEach(() => {
  calls.length = 0;
  answer.data = [];
  answer.error = null;
});

describe('the proposals of a conversation', () => {
  it('reads the view by conversation, in id order, every row normalised', async () => {
    answer.data = [ROW, { ...ROW, id: 'x' }];
    const options = conversationProposalsOptions(CONVERSATION);
    expect(options.queryKey).toEqual(proposalKeys.conversation(CONVERSATION));
    expect(options.enabled).toBe(true);
    const rows = await run<unknown[]>(options);
    expect(rows).toHaveLength(1);
    expect(calls).toEqual([
      { method: 'from', args: ['v_workspace_proposals'] },
      { method: 'select', args: [PROPOSAL_COLUMNS] },
      { method: 'eq', args: ['conversation_id', CONVERSATION] },
      { method: 'order', args: ['id', { ascending: true }] },
    ]);
  });

  it('is read again whenever it is looked at: on focus and after an answer', () => {
    expect(conversationProposalsOptions(CONVERSATION).staleTime).toBe(0);
  });

  it('never runs without a conversation id', () => {
    expect(conversationProposalsOptions(null).enabled).toBe(false);
    expect(conversationProposalsOptions('nope').enabled).toBe(false);
  });

  it('throws any other database error, so the page says it', async () => {
    answer.error = { message: 'permission denied', code: '42501' };
    await expect(run(conversationProposalsOptions(CONVERSATION))).rejects.toMatchObject({ code: '42501' });
  });

  it('reads a view that does not exist yet (before the cut-over) as no proposals, and logs it once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const code of ['PGRST205', '42P01', 'PGRST202', '42883']) {
      answer.error = { message: 'Could not find the table', code };
      await expect(run(conversationProposalsOptions(CONVERSATION))).resolves.toEqual([]);
      await expect(run(proposalsByIdsOptions([7]))).resolves.toEqual([]);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('the proposals the Inbox names', () => {
  it('reads them by id, the ids sorted so the key does not move', async () => {
    answer.data = [ROW];
    const options = proposalsByIdsOptions([9, 7, 7]);
    expect(options.queryKey).toEqual(proposalKeys.ids([7, 9]));
    await run(options);
    expect(calls).toContainEqual({ method: 'in', args: ['id', [7, 9]] });
  });

  it('never runs with no id', () => {
    expect(proposalsByIdsOptions([]).enabled).toBe(false);
  });

  it('sits under the one prefix a decision invalidates', () => {
    expect(proposalKeys.ids([1]).slice(0, 2)).toEqual(proposalKeys.all());
    expect(proposalKeys.conversation(CONVERSATION).slice(0, 2)).toEqual(proposalKeys.all());
  });
});

describe('decideProposal', () => {
  it('calls the one function with its two arguments and returns its row', async () => {
    answer.data = [{ state: 'applied', applied: true }];
    await expect(decideProposal({ id: 7, decision: 'approve' })).resolves.toEqual({ state: 'applied', applied: true });
    expect(calls).toEqual([{ method: 'rpc', args: ['workspace_proposal_decide', { p_id: 7, p_decision: 'approve' }] }]);
  });

  it('refuses a bad id or decision before anything is sent', async () => {
    await expect(decideProposal({ id: 0, decision: 'approve' })).rejects.toThrow(/proposal id/);
    await expect(decideProposal({ id: 7, decision: 'maybe' as 'approve' })).rejects.toThrow(/decision/);
    expect(calls).toEqual([]);
  });

  it('throws the refusal as the database gave it, code and all', async () => {
    answer.error = { code: '55000', message: 'proposal 7 is already rejected' };
    await expect(decideProposal({ id: 7, decision: 'reject' })).rejects.toMatchObject({ code: '55000' });
  });

  it('throws when the answer is not a row it knows', async () => {
    answer.data = [];
    await expect(decideProposal({ id: 7, decision: 'reject' })).rejects.toThrow(/no outcome/);
  });
});

describe('invalidateProposalCaches', () => {
  it('moves the proposals and the Inbox together, so the other place shows the decision', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidateProposalCaches(client);
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(proposalKeys.all());
    expect(keys).toContainEqual(syncKeys.attentionAll());
    expect(keys).toContainEqual(syncKeys.status());
  });
});
