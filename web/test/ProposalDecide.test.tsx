/**
 * Deciding a proposal from its card (Phase 25b, E; 119b): the one call, the buttons while it is in
 * flight, both caches read again on success and on a 55000, and a failure said plainly.
 *
 * A real query client; the browser client is a fake whose `rpc` the test settles by hand.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ rpc, from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { AnswerProposals, DecidableProposal } = await import('@/components/workspace/DecidableProposal');
const { proposalKeys } = await import('@/lib/queries.workspace-proposals');
const { syncKeys } = await import('@/lib/queries.sync');
const { ALREADY_DECIDED_LINE, normalizeProposal } = await import('@/lib/workspace-proposals');

function proposal(over: Record<string, unknown> = {}) {
  const row = normalizeProposal({
    id: 7,
    request_id: 41,
    conversation_id: '11111111-2222-4333-8444-555555555555',
    target: 'assignment_progress',
    row_id: 'ECN.304/problem-set-4',
    label: 'ECN 304 Problem Set 4',
    field: 'status',
    old_value: 'in_progress',
    new_value: 'submitted',
    reason: 'Handed in.',
    state: 'proposed',
    effective_state: 'proposed',
    ...over,
  });
  if (row === null) throw new Error('fixture did not normalise');
  return row;
}

function setup(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidated = vi.spyOn(client, 'invalidateQueries');
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  const keys = () => invalidated.mock.calls.map(([filters]) => filters?.queryKey);
  return { client, keys, ...view };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('DecidableProposal', () => {
  it('calls the one function, disables both buttons while it is in flight, then reads both places again', async () => {
    const answer = deferred<{ data: unknown; error: unknown }>();
    rpc.mockReturnValue(answer.promise);
    const { keys } = setup(<DecidableProposal proposal={proposal()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('workspace_proposal_decide', { p_id: 7, p_decision: 'approve' }));
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);

    await act(async () => answer.resolve({ data: [{ state: 'applied', applied: true }], error: null }));
    await waitFor(() => expect(keys()).toContainEqual(proposalKeys.all()));
    expect(keys()).toContainEqual(syncKeys.attentionAll());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('on a 55000 reads both places again and says it was already decided', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'proposal 7 is already rejected' } });
    const { keys } = setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Reject/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(ALREADY_DECIDED_LINE);
    expect(keys()).toContainEqual(proposalKeys.all());
    expect(keys()).toContainEqual(syncKeys.attentionAll());
  });

  it('says any other failure with its reason, leaves the caches alone and the buttons live', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const { keys } = setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('That decision was not saved: permission denied. Try again.');
    expect(keys()).not.toContainEqual(proposalKeys.all());
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('moves the focus to the outcome when the decided row arrives', async () => {
    rpc.mockResolvedValue({ data: [{ state: 'applied', applied: true }], error: null });
    const client = new QueryClient();
    const { rerender, container } = render(
      <QueryClientProvider client={client}>
        <DecidableProposal proposal={proposal()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    rerender(
      <QueryClientProvider client={client}>
        <DecidableProposal proposal={proposal({ state: 'applied', effective_state: 'applied' })} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('[data-proposal-outcome]')));
  });
});

describe('AnswerProposals', () => {
  it('draws one card per proposal, as a list', () => {
    setup(<AnswerProposals proposals={[proposal(), proposal({ id: 8, field: 'notes', new_value: 'Start with 3.' })]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Approve/ })).toHaveLength(2);
  });

  it('draws nothing for no proposal', () => {
    const { container } = setup(<AnswerProposals proposals={[]} />);
    expect(container.querySelector('ul')).toBeNull();
  });
});
