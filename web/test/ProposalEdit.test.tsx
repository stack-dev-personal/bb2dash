/**
 * Stack's edit of a proposed value on an open card (W-106; Stack: "an option available on-hover for
 * all of the boxes … a grey "edit" text that functions as a button … clicking off of the box should
 * reset it to its initial state (or submitting)").
 *
 *   * only the Proposed box of an open card has an edit button, named after the item;
 *   * edit turns the box into its field's editor (a select of the six statuses, a date input, a note
 *     box with a live count) and moves the focus into it;
 *   * Enter (Ctrl/Cmd+Enter for a note) or Save keeps the value as a draft on this card, marked
 *     "Proposed · edited by you" with Reset; Escape, or focus leaving the box, drops what was typed;
 *   * a value that does not fit, or equals what the planner has, is said inline and edit mode stays;
 *   * Approve sends the draft as p_value; Reject never does; nothing is written by editing.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ rpc, from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { DecidableProposal } = await import('@/components/workspace/DecidableProposal');
const { normalizeProposal } = await import('@/lib/workspace-proposals');
const { DRAFT_NOTE_EMPTY, DRAFT_SAME_AS_PLANNER, EDIT_FIRST_LINE } = await import('@/lib/proposal-draft');

const LABEL = 'ECN 304 Problem Set 4';
const EDIT = `Edit the proposed value for ${LABEL}`;

function proposal(over: Record<string, unknown> = {}) {
  const row = normalizeProposal({
    id: 7,
    request_id: 41,
    conversation_id: '11111111-2222-4333-8444-555555555555',
    target: 'assignment_progress',
    row_id: 'ECN.304/problem-set-4',
    label: LABEL,
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
  return render(
    <QueryClientProvider client={client}>
      {node}
      <button type="button">somewhere else</button>
    </QueryClientProvider>,
  );
}

const proposedBox = () => screen.getByRole('group', { name: /^Proposed/ });
const plannerBox = () => screen.getByRole('group', { name: 'Planner has' });

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [{ state: 'applied', applied: true }], error: null });
});

describe('the edit button', () => {
  it('is a real button in the Proposed box alone, named after the item', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    expect(within(proposedBox()).getByRole('button', { name: EDIT }).textContent).toBe('edit');
    expect(within(plannerBox()).queryByRole('button')).toBeNull();
  });

  it('is not on a decided card', () => {
    setup(<DecidableProposal proposal={proposal({ state: 'applied', effective_state: 'applied' })} />);
    expect(screen.queryByRole('button', { name: EDIT })).toBeNull();
  });

  it('shows on hover and on focus, grey turning to the strongest text colour, always shown without hover', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/workspace/ProposalCard.module.css'), 'utf8');
    expect(css).toMatch(/\.textButton\s*\{[^}]*color:\s*var\(--color-muted\)/);
    expect(css).toMatch(/\.textButton:hover[^{]*\{[^}]*color:\s*var\(--color-text\)/);
    expect(css).toMatch(/\.textButton:focus-visible/);
    expect(css).toMatch(/\.editable:hover \.editButton/);
    expect(css).toMatch(/\.editable:focus-within \.editButton/);
    expect(css).toMatch(/@media \(hover: none\)\s*\{\s*\.editButton\s*\{\s*opacity:\s*1/);
  });
});

describe('editing a status', () => {
  it('turns the box into a select of the six statuses, in the app’s words, with the focus in it', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    const select = within(proposedBox()).getByRole('combobox', { name: `Proposed status for ${LABEL}` }) as HTMLSelectElement;
    expect(document.activeElement).toBe(select);
    expect(select.value).toBe('submitted');
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'not opened',
      'in progress',
      'submitted',
      'graded',
      'excused',
      'DNF',
    ]);
  });

  it('Enter keeps the draft: "Proposed · edited by you", the new value, Reset, and the line follows it', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'graded' } });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(screen.queryByRole('combobox')).toBeNull();
    const box = proposedBox();
    expect(box.getAttribute('aria-label')).toBe('Proposed · edited by you');
    expect(box.hasAttribute('data-proposal-edited')).toBe(true);
    expect(within(box).getByText('graded')).toBeTruthy();
    expect(within(box).getByRole('button', { name: `Reset the proposed value for ${LABEL}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Approve: mark ${LABEL} as graded` })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: EDIT }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('Reset drops the draft and shows the assistant’s value again', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'graded' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: `Reset the proposed value for ${LABEL}` }));
    expect(proposedBox().getAttribute('aria-label')).toBe('Proposed');
    expect(within(proposedBox()).getByText('submitted')).toBeTruthy();
  });

  it('Escape drops what was picked and returns the box as it was, the focus on edit', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'graded' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(proposedBox().getAttribute('aria-label')).toBe('Proposed');
    expect(within(proposedBox()).getByText('submitted')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: EDIT }));
  });

  it('focus leaving the box drops what was picked; focus moving within it does not', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'graded' } });
    fireEvent.focusOut(select, { relatedTarget: screen.getByRole('button', { name: /^Save/ }) });
    expect(screen.getByRole('combobox')).toBeTruthy();
    fireEvent.focusOut(select, { relatedTarget: screen.getByRole('button', { name: 'somewhere else' }) });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(within(proposedBox()).getByText('submitted')).toBeTruthy();
    expect(proposedBox().getAttribute('aria-label')).toBe('Proposed');
  });

  it('a draft equal to what the planner has is said inline and edit mode stays', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'in_progress' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(screen.getByRole('alert').textContent).toBe(DRAFT_SAME_AS_PLANNER);
    expect(screen.getByRole('combobox').getAttribute('aria-invalid')).toBe('true');
  });

  it('picking the assistant’s own value again keeps no draft', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(proposedBox().getAttribute('aria-label')).toBe('Proposed');
  });
});

describe('editing a date and a note', () => {
  it('a date is a date input; Save keeps it, drawn as the planner draws dates', () => {
    setup(<DecidableProposal proposal={proposal({ field: 'planned_start', old_value: '2026-10-20', new_value: '2026-10-21' })} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    const input = screen.getByLabelText(`Proposed planned start for ${LABEL}`) as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-10-21');
    fireEvent.change(input, { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(within(proposedBox()).getByText('Oct 22')).toBeTruthy();
  });

  it('a note is a box prefilled with the proposed note and a live count; Ctrl+Enter keeps it, Enter alone does not', () => {
    setup(<DecidableProposal proposal={proposal({ field: 'notes', old_value: null, new_value: 'Start with 3.' })} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    const box = screen.getByRole('textbox', { name: `Proposed note for ${LABEL}` }) as HTMLTextAreaElement;
    expect(box.value).toBe('Start with 3.');
    expect(screen.getByText('13 / 2,000')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'My plan.' } });
    expect(screen.getByText('8 / 2,000')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('textbox')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(within(proposedBox()).getByText('My plan.')).toBeTruthy();
  });

  it('an empty note is said inline and edit mode stays', () => {
    setup(<DecidableProposal proposal={proposal({ field: 'notes', old_value: null, new_value: 'Start with 3.' })} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true });
    expect(screen.getByRole('alert').textContent).toBe(DRAFT_NOTE_EMPTY);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});

describe('deciding with a draft', () => {
  function draftGraded() {
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'graded' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  }

  it('Approve sends the draft as p_value', async () => {
    setup(<DecidableProposal proposal={proposal()} />);
    draftGraded();
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('workspace_proposal_decide', { p_id: 7, p_decision: 'approve', p_value: 'graded' }),
    );
  });

  it('Approve without a draft sends no p_value', async () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('workspace_proposal_decide', { p_id: 7, p_decision: 'approve' }));
  });

  it('Reject ignores the draft', async () => {
    setup(<DecidableProposal proposal={proposal()} />);
    draftGraded();
    fireEvent.click(screen.getByRole('button', { name: /^Reject/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('workspace_proposal_decide', { p_id: 7, p_decision: 'reject' }));
  });

  it('while the box is in edit mode, Approve and Reject wait: a hint says why, and pressing them keeps the edit (round 2)', () => {
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'graded' } });
    const approve = screen.getByRole('button', { name: /^Approve/ });
    const reject = screen.getByRole('button', { name: /^Reject/ });
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(reject.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(EDIT_FIRST_LINE)).toBeTruthy();
    // The press must not take the focus away from the editor, which would drop the edit.
    expect(fireEvent.mouseDown(approve)).toBe(false);
    expect(fireEvent.mouseDown(reject)).toBe(false);
    fireEvent.click(approve);
    fireEvent.click(reject);
    expect(rpc).not.toHaveBeenCalled();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('graded');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.queryByText(EDIT_FIRST_LINE)).toBeNull();
    expect(screen.getByRole('button', { name: /^Approve/ }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('says a refusal of the edit in plain words, without the function’s name (round 2)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'workspace_proposal_decide: an edited value must differ from the planner\'s' },
    });
    setup(<DecidableProposal proposal={proposal()} />);
    draftGraded();
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That decision was not saved: an edited value must differ from the planner\'s. Try again.',
    );
  });

  it('edit is off while a decision is in flight', async () => {
    rpc.mockReturnValue(new Promise(() => undefined));
    setup(<DecidableProposal proposal={proposal()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: EDIT }) as HTMLButtonElement).disabled).toBe(true));
  });
});
