/**
 * The card a proposed planner change shows (Phase 25b, E; 119b, "The page"; brief 119's DoD: "a
 * decided card draws no old or new value; an open one draws both").
 *
 * The view alone: no query client, no network. The decision flow is `ProposalDecide.test.tsx`.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProposalCard } from '@/components/workspace/ProposalCard';
import { statusLabel } from '@/lib/progress-status';
import {
  ALREADY_DECIDED_LINE,
  NO_ENTRY_YET,
  normalizeProposal,
  type WorkspaceProposal,
} from '@/lib/workspace-proposals';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function proposal(over: Record<string, unknown> = {}): WorkspaceProposal {
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
    reason: 'You said you handed it in this morning.',
    state: 'proposed',
    effective_state: 'proposed',
    ...over,
  });
  if (row === null) throw new Error('fixture did not normalise');
  return row;
}

const decided = (state: string, over: Record<string, unknown> = {}) =>
  proposal({ state, effective_state: state, ...over });

describe('an open proposal', () => {
  it('draws the line with the label in italics, both values, the reason and the two buttons', () => {
    const { container } = render(<ProposalCard proposal={proposal()} onDecide={vi.fn()} />);
    expect(container.querySelector('em')?.textContent).toBe('ECN 304 Problem Set 4');
    expect(screen.getByText(/^Mark/).textContent).toBe('Mark ECN 304 Problem Set 4 as submitted');
    const old = container.querySelector('[data-proposal-value="old"]');
    const next = container.querySelector('[data-proposal-value="new"]');
    expect(old?.textContent).toContain(statusLabel('in_progress'));
    expect(next?.textContent).toContain(statusLabel('submitted'));
    expect(screen.getByText('You said you handed it in this morning.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve: mark ECN 304 Problem Set 4 as submitted' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject: mark ECN 304 Problem Set 4 as submitted' })).toBeTruthy();
    expect(container.querySelector('[data-proposal-outcome]')).toBeNull();
  });

  it('hands up approve or reject', () => {
    const onDecide = vi.fn();
    render(<ProposalCard proposal={proposal()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Reject/ }));
    expect(onDecide.mock.calls).toEqual([['approve'], ['reject']]);
  });

  it('disables both buttons while a decision is in flight', () => {
    render(<ProposalCard proposal={proposal()} onDecide={vi.fn()} pending />);
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('draws a note’s old and new text, and an empty old note as no entry yet', () => {
    const long = 'Start with question 3. '.repeat(40).trim();
    const { container } = render(
      <ProposalCard proposal={proposal({ field: 'notes', old_value: null, new_value: long })} onDecide={vi.fn()} />,
    );
    expect(screen.getByText(/^Replace the note on/).textContent).toBe('Replace the note on ECN 304 Problem Set 4');
    expect(container.querySelector('[data-proposal-value="old"]')?.textContent).toContain(NO_ENTRY_YET);
    expect(container.querySelector('[data-proposal-value="new"]')?.textContent).toContain(long);
  });

  it('draws dates as the planner writes them', () => {
    const { container } = render(
      <ProposalCard
        proposal={proposal({ field: 'planned_start', old_value: '2026-10-19', new_value: '2026-10-21' })}
        onDecide={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-proposal-value="old"]')?.textContent).toContain('Oct 19');
    expect(container.querySelector('[data-proposal-value="new"]')?.textContent).toContain('Oct 21');
  });

  it('says a failure plainly, as an alert', () => {
    render(<ProposalCard proposal={proposal()} onDecide={vi.fn()} problem="That decision was not saved: offline. Try again." />);
    expect(screen.getByRole('alert').textContent).toBe('That decision was not saved: offline. Try again.');
  });

  it('renders model text as text, never as markup', () => {
    const { container } = render(
      <ProposalCard proposal={proposal({ reason: '<img src=x onerror=alert(1)>', label: '<b>Bold</b>' })} onDecide={vi.fn()} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('a decided proposal', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['applied', {}, 'Approved: marked submitted'],
    ['rejected', {}, 'Rejected'],
    ['stale', {}, 'Stale: the row changed'],
    ['expired', { state: 'proposed' }, 'Expired'],
  ];

  for (const [state, over, words] of cases) {
    it(`${state}: draws only the outcome, no old or new value, no reason and no button`, () => {
      const { container } = render(<ProposalCard proposal={decided(state, over)} onDecide={vi.fn()} />);
      expect(container.querySelector('[data-proposal-outcome]')?.textContent).toBe(words);
      expect(container.querySelectorAll('[data-proposal-value]')).toHaveLength(0);
      expect(container.textContent).not.toContain(statusLabel('in_progress'));
      expect(container.textContent).not.toContain('You said you handed it in this morning.');
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      // The item it was about is still named.
      expect(container.textContent).toContain('ECN 304 Problem Set 4');
    });
  }

  it('draws no date for an approved date change', () => {
    const { container } = render(
      <ProposalCard
        proposal={decided('applied', { field: 'planned_start', old_value: '2026-10-19', new_value: '2026-10-21' })}
      />,
    );
    expect(container.textContent).not.toMatch(/Oct 19|Oct 21/);
    expect(container.querySelector('[data-proposal-outcome]')?.textContent).toBe('Approved: planned start changed');
  });

  it('links back to the answer when the Inbox gives it the way', () => {
    render(<ProposalCard proposal={decided('rejected')} answerHref="/workspace?c=abc" />);
    expect(screen.getByRole('link', { name: /Open the answer/ }).getAttribute('href')).toBe('/workspace?c=abc');
  });

  it('takes the focus on its outcome once decided here, so a keyboard user is not dropped', () => {
    const { container } = render(<ProposalCard proposal={decided('applied')} focusOutcome />);
    expect(document.activeElement).toBe(container.querySelector('[data-proposal-outcome]'));
  });

  it('does not show the already-decided line once the card shows where it stands', () => {
    render(<ProposalCard proposal={decided('rejected')} problem={ALREADY_DECIDED_LINE} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
