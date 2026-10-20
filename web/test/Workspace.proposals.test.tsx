/**
 * The proposed planner changes under an answer, on the mounted screen (Phase 25b, E; 119b, "The
 * page"): read from `v_workspace_proposals` by conversation, matched to the answer by
 * `request_id`, shown under a finished answer only, decided through
 * `workspace_proposal_decide`, read again after, and a failed read said once above the column.
 *
 * Over the fake client in `workspace-harness.tsx`; the composer and the lobby are stood in for.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () => (await import('./workspace-harness')).supabaseClientMock());
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());
vi.mock('@/components/workspace/Composer', async () => (await import('./workspace-harness')).composerMock());
vi.mock('@/components/workspace/Lobby', async () => (await import('./workspace-harness')).lobbyMock());

const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';
const VIEW = 'v_workspace_proposals';

function proposalRow(fields: Row = {}): Row {
  return {
    id: 7,
    request_id: 42,
    conversation_id: A,
    target: 'assignment_progress',
    row_id: 'DEMO.101/problem-set-4',
    course_id: 'DEMO.101',
    label: 'Demo Problem Set 4',
    field: 'status',
    old_value: 'in_progress',
    new_value: 'submitted',
    reason: 'You said you handed it in.',
    state: 'proposed',
    effective_state: 'proposed',
    attention_item_id: 900,
    attention_state: 'open',
    ...fields,
  };
}

function seed(requestState: string, proposals: Row[]) {
  const finished = requestState === 'done';
  fake.state.rows = {
    workspace_messages: [
      { id: QUESTION, conversation_id: A, role: 'user', content: 'I handed in problem set 4.', finished: true },
      {
        id: ANSWER,
        conversation_id: A,
        role: 'assistant',
        request_id: 42,
        tier: 'mid',
        content: finished ? 'Noted. I can mark it submitted for you.' : '',
        tool_calls: [],
        finished,
        error_code: null,
      },
    ],
    workspace_requests: [{ id: 42, conversation_id: A, user_message_id: QUESTION, state: requestState, error_code: null }],
    [VIEW]: proposals,
  };
}

function open() {
  fake.state.search = `c=${A}`;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

function turnOf(container: HTMLElement): HTMLElement {
  const found = container.querySelector('li[data-turn][data-request-id="42"]');
  if (!(found instanceof HTMLElement)) throw new Error('no turn for request 42');
  return found;
}

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('proposals under an answer', () => {
  it('shows one card per proposal of the answer’s request, inside its turn', async () => {
    seed('done', [proposalRow(), proposalRow({ id: 8, field: 'notes', old_value: null, new_value: 'Start with 3.' }), proposalRow({ id: 9, request_id: 99 })]);
    const { container } = open();
    await waitFor(() => expect(turnOf(container).querySelectorAll('[data-proposal]')).toHaveLength(2));
    const turn = within(turnOf(container));
    expect(turn.getByRole('button', { name: 'Approve: mark Demo Problem Set 4 as submitted' })).toBeTruthy();
    expect(container.querySelector('[data-proposal="9"]')).toBeNull();
  });

  it('shows none under an answer still being written', async () => {
    seed('claimed', [proposalRow()]);
    const { container } = open();
    await waitFor(() => expect(container.querySelector('li[data-turn="streaming"]')).not.toBeNull());
    expect(container.querySelector('[data-proposal]')).toBeNull();
  });

  it('reads them again when the answer finishes, and shows the card under it', async () => {
    seed('claimed', []);
    const { container } = open();
    await waitFor(() => expect(container.querySelector('li[data-turn="streaming"]')).not.toBeNull());
    const channel = fake.state.channels.findLast((candidate) => candidate.topic === `workspace:${A}`);
    if (!channel) throw new Error('no channel');
    // The runner proposes while it answers, then finishes the turn.
    seed('done', [proposalRow()]);
    act(() => channel.emit('done', { request_id: 42 }));
    await waitFor(() => expect(turnOf(container).querySelector('[data-proposal="7"]')).not.toBeNull());
  });

  it('approves through the one function and shows the outcome it reads back', async () => {
    seed('done', [proposalRow()]);
    fake.state.rpc.workspace_proposal_decide = (args) => {
      fake.state.rows = {
        ...fake.state.rows,
        [VIEW]: [proposalRow({ state: 'applied', effective_state: 'applied', attention_state: 'resolved' })],
      };
      return { data: [{ state: 'applied', applied: args.p_decision === 'approve' }], error: null };
    };
    const { container } = open();
    fireEvent.click(await screen.findByRole('button', { name: /^Approve: mark Demo Problem Set 4/ }));
    await waitFor(() =>
      expect(container.querySelector('[data-proposal-outcome]')?.textContent).toBe('Approved: marked submitted'),
    );
    expect(fake.state.rpcCalls).toContainEqual({ fn: 'workspace_proposal_decide', args: { p_id: 7, p_decision: 'approve' } });
    expect(container.querySelectorAll('[data-proposal-value]')).toHaveLength(0);
  });

  it('says a failed read once, above the column', async () => {
    seed('done', []);
    fake.state.readErrors = { ...fake.state.readErrors, [VIEW]: { code: '42P01', message: 'relation does not exist' } };
    open();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toContain(
      'Could not read the proposed planner changes: relation does not exist',
    );
  });
});
