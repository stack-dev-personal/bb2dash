/**
 * The Inbox's `assistant_proposal` items (Phase 25b, E; 119b, "The page"; Stack's answer 7: both
 * places, a decision in either shows in the other).
 *
 *   * the item is drawn as the proposal card: open = the two values and Approve / Reject; decided =
 *     the outcome and a link back to the answer; never the Inbox's own answer box, note or buttons;
 *   * a decided proposal is finished work: it sits under Archived, never in "Answered, not
 *     applied", and the footer's answered count (what Apply answers works through) leaves it out;
 *   * the screen reads the proposals its items name, and a decision there calls only
 *     `workspace_proposal_decide`, then reads the Inbox and the proposals again.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAttentionItem } from './factories';

const CONVERSATION = '11111111-2222-4333-8444-555555555555';
const tables: Record<string, unknown[]> = {};
const rpc = vi.fn();
const reads: { table: string; filters: unknown[][] }[] = [];

function chain(table: string) {
  const filters: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is', 'or', 'gte', 'lte']) {
    builder[method] = (...args: unknown[]) => {
      filters.push([method, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) => {
    reads.push({ table, filters });
    return resolve({ data: tables[table] ?? [], error: null });
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => chain(table), rpc }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/inbox/InboxApplyButton', () => ({ InboxApplyButton: () => null }));

const { default: Inbox, InboxView } = await import('@/app/(app)/inbox/Inbox');
const { InboxProposalCard } = await import('@/components/inbox/InboxProposal');
const { tabCounts, tabOf } = await import('@/components/inbox/inbox-tabs');
const { PROPOSAL_LOADING_LINE, PROPOSAL_MISSING_LINE, normalizeProposal } = await import('@/lib/workspace-proposals');

function proposalItem(over: Parameters<typeof makeAttentionItem>[0] = {}) {
  return makeAttentionItem({
    id: 900,
    kind: 'assistant_proposal',
    course_id: 'DEMO.101',
    entity: 'assignment_progress',
    ref: 'workspace_proposal/7',
    field: 'status',
    from_value: 'in_progress',
    to_value: 'submitted',
    question: 'Mark Demo Problem Set 4 as submitted?',
    suggested: { source: 'workspace', proposal_id: 7, conversation_id: CONVERSATION, request_id: 41, reason: 'Handed in.' },
    raised_by: null,
    ...over,
  });
}

function proposalRow(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    request_id: 41,
    conversation_id: CONVERSATION,
    target: 'assignment_progress',
    row_id: 'DEMO.101/problem-set-4',
    course_id: 'DEMO.101',
    label: 'Demo Problem Set 4',
    field: 'status',
    old_value: 'in_progress',
    new_value: 'submitted',
    reason: 'Handed in.',
    state: 'proposed',
    effective_state: 'proposed',
    attention_item_id: 900,
    attention_state: 'open',
    ...over,
  };
}

function proposal(over: Record<string, unknown> = {}) {
  const row = normalizeProposal(proposalRow(over));
  if (row === null) throw new Error('fixture did not normalise');
  return row;
}

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>) };
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  reads.length = 0;
  rpc.mockReset();
});

describe('where a proposal item sits', () => {
  it('needs you while open, and is archived once decided: never answered-not-applied', () => {
    expect(tabOf(proposalItem())).toBe('needs_you');
    expect(tabOf(proposalItem({ state: 'resolved', resolution: { outcome: 'rejected', proposal_id: 7 } }))).toBe('archived');
    const counts = tabCounts([
      proposalItem({ state: 'resolved' }),
      makeAttentionItem({ id: 2, state: 'resolved', resolution: { accept: 'keep' } }),
    ]);
    expect(counts).toEqual({ needs_you: 0, answered: 1, archived: 1 });
  });
});

describe('InboxView', () => {
  it('hands a proposal item to the proposal renderer, and every other item to its own card', () => {
    const renderProposal = vi.fn((item: { id: number }) => <p key={item.id}>proposal {item.id}</p>);
    render(
      <InboxView
        items={[proposalItem(), makeAttentionItem({ id: 2 })]}
        status={null}
        onResolve={vi.fn()}
        renderProposal={renderProposal}
      />,
    );
    expect(renderProposal).toHaveBeenCalledTimes(1);
    expect(screen.getByText('proposal 900')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeTruthy();
  });

  it('with no renderer, draws the item’s question and none of the Inbox’s answer controls', () => {
    const { container } = render(<InboxView items={[proposalItem()]} status={null} onResolve={vi.fn()} />);
    expect(screen.getByText('Mark Demo Problem Set 4 as submitted?')).toBeTruthy();
    expect(container.querySelector('textarea, input')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Save|Dismiss|Keep mine|Accept/ })).toHaveLength(0);
  });
});

describe('InboxProposalCard', () => {
  it('open: the two values and Approve / Reject, as one of the cards j and k move between', () => {
    const { container } = withClient(<InboxProposalCard item={proposalItem()} proposal={proposal()} loading={false} error={null} />);
    expect(container.querySelectorAll('[data-proposal-value]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Approve: mark Demo Problem Set 4 as submitted' })).toBeTruthy();
    expect(container.querySelector('[data-inbox-card]')).not.toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('decided: the outcome and a link back to the answer, no value drawn', () => {
    const decided = proposal({ state: 'rejected', effective_state: 'rejected' });
    const { container } = withClient(
      <InboxProposalCard item={proposalItem({ state: 'resolved' })} proposal={decided} loading={false} error={null} />,
    );
    expect(container.querySelector('[data-proposal-outcome]')?.textContent).toBe('Rejected');
    expect(screen.getByRole('link', { name: /Open the answer/ }).getAttribute('href')).toBe(`/workspace?c=${CONVERSATION}`);
    expect(container.querySelectorAll('[data-proposal-value]')).toHaveLength(0);
  });

  it('while the proposal is read, says so and offers no button', () => {
    withClient(<InboxProposalCard item={proposalItem()} proposal={undefined} loading error={null} />);
    expect(screen.getByText(PROPOSAL_LOADING_LINE)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('when the read failed, says why as an alert', () => {
    withClient(<InboxProposalCard item={proposalItem()} proposal={undefined} loading={false} error={new Error('offline')} />);
    expect(screen.getByRole('alert').textContent).toBe('Could not read the proposed planner changes: offline');
  });

  it('when the proposal is gone, says so; a decided item still shows its outcome and its way back', () => {
    withClient(
      <InboxProposalCard
        item={proposalItem({ state: 'resolved', resolution: { outcome: 'applied', proposal_id: 7 } })}
        proposal={undefined}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText(PROPOSAL_MISSING_LINE)).toBeTruthy();
    expect(screen.getByText('Approved: marked submitted')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open the answer/ })).toBeTruthy();
  });
});

describe('the Inbox screen', () => {
  it('reads the proposals its items name, and a decision calls only the one function', async () => {
    tables.attention_items = [proposalItem()];
    tables.v_workspace_proposals = [proposalRow()];
    rpc.mockImplementation(async (name: string) => {
      tables.v_workspace_proposals = [proposalRow({ state: 'applied', effective_state: 'applied' })];
      tables.attention_items = [proposalItem({ state: 'resolved', resolution: { outcome: 'applied', proposal_id: 7 } })];
      return { data: name === 'workspace_proposal_decide' ? [{ state: 'applied', applied: true }] : null, error: null };
    });
    const { container } = withClient(<Inbox />);

    const approve = await screen.findByRole('button', { name: 'Approve: mark Demo Problem Set 4 as submitted' });
    expect(reads.find((read) => read.table === 'v_workspace_proposals')?.filters).toContainEqual(['in', 'id', [7]]);
    fireEvent.click(approve);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('workspace_proposal_decide', { p_id: 7, p_decision: 'approve' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    // Read again: the item is decided, so it left Needs you for Archived.
    await waitFor(() => expect(container.querySelector('[data-proposal]')).toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }));
    const card = await waitFor(() => {
      const found = container.querySelector('[data-proposal="7"]');
      if (!(found instanceof HTMLElement)) throw new Error('no card');
      return found;
    });
    expect(within(card).getByText('Approved: marked submitted')).toBeTruthy();
  });
});
