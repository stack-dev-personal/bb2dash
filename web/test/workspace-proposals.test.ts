/**
 * The planner changes the assistant proposes (Phase 25b, E; brief 119b, "The page"): the pure half.
 *
 * A row of `v_workspace_proposals` is normalised before anything reads it, and every word the card
 * and the Inbox item say comes from here: the line per field, the two values, the outcome, the
 * button labels and the refusal a second decision gets (55000).
 */

import { describe, expect, it } from 'vitest';
import { statusLabel } from '@/lib/progress-status';
import {
  ALREADY_DECIDED_LINE,
  NO_ENTRY_YET,
  PROPOSAL_COLUMNS,
  approveLabel,
  itemOutcomeLine,
  decideProblemLine,
  heldStateOf,
  isAlreadyDecided,
  isOpenProposal,
  lineParts,
  lineText,
  normalizeProposal,
  outcomeLine,
  proposalIdOfItem,
  proposalsByRequest,
  rejectLabel,
  valueWords,
  type WorkspaceProposal,
} from '@/lib/workspace-proposals';

const CONVERSATION = '11111111-2222-4333-8444-555555555555';

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    created_at: '2026-10-19T14:00:00Z',
    expires_at: '2026-10-26T14:00:00Z',
    request_id: 41,
    conversation_id: CONVERSATION,
    target: 'assignment_progress',
    row_id: 'ECN.304/problem-set-4',
    course_id: 'ECN.304',
    label: 'ECN 304 Problem Set 4',
    field: 'status',
    old_value: 'in_progress',
    new_value: 'submitted',
    reason: 'You said you handed it in this morning.',
    state: 'proposed',
    decided_at: null,
    effective_state: 'proposed',
    attention_item_id: 900,
    attention_state: 'open',
    ...over,
  };
}

function proposal(over: Record<string, unknown> = {}): WorkspaceProposal {
  const normalized = normalizeProposal(row(over));
  if (normalized === null) throw new Error('fixture did not normalise');
  return normalized;
}

describe('normalizeProposal', () => {
  it('keeps a well-formed row, with ids as numbers', () => {
    const p = proposal({ id: '7', request_id: '41', attention_item_id: '900' });
    expect(p).toMatchObject({ id: 7, request_id: 41, attention_item_id: 900, field: 'status' });
    expect(p.effective_state).toBe('proposed');
  });

  it('reads a reading id that comes back as a number as text', () => {
    expect(proposal({ target: 'reading_progress', row_id: 31 }).row_id).toBe('31');
  });

  it('drops a row it cannot identify or whose vocabulary is unknown', () => {
    for (const bad of [
      { id: null },
      { request_id: 0 },
      { conversation_id: 'not-a-uuid' },
      { target: 'assignments' },
      { field: 'due_at' },
      { state: 'pending' },
      { label: '' },
      { new_value: undefined },
    ]) {
      expect(normalizeProposal(row(bad)), JSON.stringify(bad)).toBeNull();
    }
    expect(normalizeProposal(null)).toBeNull();
    expect(normalizeProposal([row()])).toBeNull();
  });

  it('takes the stored state when the view has no effective state', () => {
    expect(proposal({ effective_state: null, state: 'rejected' }).effective_state).toBe('rejected');
  });

  it('reads an absent old value as null (no progress row yet)', () => {
    expect(proposal({ old_value: undefined }).old_value).toBeNull();
  });
});

describe('the line, per field', () => {
  it('marks a status with the planner’s own word', () => {
    expect(lineText(proposal())).toBe('Mark ECN 304 Problem Set 4 as submitted');
    expect(lineText(proposal({ new_value: 'missed' }))).toBe(`Mark ECN 304 Problem Set 4 as ${statusLabel('missed')}`);
  });

  it('sets a planned start or finish to a date as the planner writes it', () => {
    expect(lineText(proposal({ field: 'planned_start', old_value: null, new_value: '2026-10-21' }))).toBe(
      'Set the planned start of ECN 304 Problem Set 4 to Oct 21',
    );
    expect(lineText(proposal({ field: 'planned_finish', old_value: '2026-10-20', new_value: '2026-10-23' }))).toBe(
      'Set the planned finish of ECN 304 Problem Set 4 to Oct 23',
    );
  });

  it('replaces a note', () => {
    expect(lineText(proposal({ field: 'notes', old_value: null, new_value: 'Start with question 3.' }))).toBe(
      'Replace the note on ECN 304 Problem Set 4',
    );
  });

  it('keeps the label apart, so the card can set it in italics', () => {
    expect(lineParts(proposal())).toEqual({ before: 'Mark ', label: 'ECN 304 Problem Set 4', after: ' as submitted' });
  });

  it('names the item on each button', () => {
    expect(approveLabel(proposal())).toBe('Approve: mark ECN 304 Problem Set 4 as submitted');
    expect(rejectLabel(proposal())).toBe('Reject: mark ECN 304 Problem Set 4 as submitted');
  });
});

describe('valueWords', () => {
  it('says a status in the planner’s words, and no progress row as the planner shows it', () => {
    expect(valueWords('status', 'in_progress')).toBe('in progress');
    expect(valueWords('status', null)).toBe(valueWords('status', 'not_started'));
  });

  it('says a date as a short month and day; a value that is not a date stands as written', () => {
    expect(valueWords('planned_start', '2026-10-21')).toBe('Oct 21');
    expect(valueWords('planned_finish', '2026-02-30')).toBe('2026-02-30');
  });

  it('says an empty date or note as no entry yet, and a note as its text', () => {
    expect(valueWords('planned_start', null)).toBe(NO_ENTRY_YET);
    expect(valueWords('notes', null)).toBe(NO_ENTRY_YET);
    expect(valueWords('notes', '')).toBe(NO_ENTRY_YET);
    expect(valueWords('notes', 'Line one\nLine two')).toBe('Line one\nLine two');
  });

  it('never prints JSON for an object', () => {
    expect(valueWords('notes', { a: 1 })).toBe(NO_ENTRY_YET);
  });
});

describe('the outcome', () => {
  it('is null while the proposal is open', () => {
    expect(isOpenProposal(proposal())).toBe(true);
    expect(outcomeLine(proposal())).toBeNull();
  });

  it('says each decided state in the brief’s words', () => {
    expect(outcomeLine(proposal({ state: 'applied', effective_state: 'applied' }))).toBe('Approved: marked submitted');
    expect(outcomeLine(proposal({ state: 'rejected', effective_state: 'rejected' }))).toBe('Rejected');
    expect(outcomeLine(proposal({ state: 'stale', effective_state: 'stale' }))).toBe('Stale: the row changed');
    expect(outcomeLine(proposal({ state: 'proposed', effective_state: 'expired' }))).toBe('Expired');
  });

  it('names no date and no note text for an approved date or note', () => {
    const start = proposal({ field: 'planned_start', new_value: '2026-10-21', effective_state: 'applied', state: 'applied' });
    expect(outcomeLine(start)).toBe('Approved: planned start changed');
    const finish = proposal({ field: 'planned_finish', new_value: '2026-10-23', effective_state: 'applied', state: 'applied' });
    expect(outcomeLine(finish)).toBe('Approved: planned finish changed');
    const note = proposal({ field: 'notes', new_value: 'Start with 3.', effective_state: 'applied', state: 'applied' });
    expect(outcomeLine(note)).toBe('Approved: note replaced');
  });

  it('says the value an approval wrote, from approved_value, when the row has one (W-106)', () => {
    const edited = proposal({ state: 'applied', effective_state: 'applied', new_value: 'submitted', approved_value: 'graded' });
    expect(edited.approved_value).toBe('graded');
    expect(outcomeLine(edited)).toBe('Approved: marked graded');
    const start = proposal({ field: 'planned_start', new_value: '2026-10-21', approved_value: '2026-10-22', state: 'applied', effective_state: 'applied' });
    expect(outcomeLine(start)).toBe('Approved: planned start Oct 22');
    const finish = proposal({ field: 'planned_finish', new_value: '2026-10-21', approved_value: '2026-10-23', state: 'applied', effective_state: 'applied' });
    expect(outcomeLine(finish)).toBe('Approved: planned finish Oct 23');
    const note = proposal({ field: 'notes', new_value: 'Theirs.', approved_value: 'Mine.', state: 'applied', effective_state: 'applied' });
    expect(outcomeLine(note)).toBe('Approved: note replaced');
  });

  it('reads approved_value as null when the row has none', () => {
    expect(proposal().approved_value).toBeNull();
    expect(PROPOSAL_COLUMNS).toContain('approved_value');
  });

  it('from the Inbox item alone, an edited approval names no value it cannot know', () => {
    const item = { state: 'resolved', field: 'status', to_value: 'submitted', resolution: { outcome: 'applied', proposal_id: 7, edited: true } };
    expect(itemOutcomeLine(item)).toBe('Approved with your edit');
    expect(itemOutcomeLine({ ...item, resolution: { outcome: 'applied', proposal_id: 7, edited: false } })).toBe('Approved: marked submitted');
    expect(itemOutcomeLine({ ...item, field: 'planned_start', to_value: '2026-10-21' })).toBe('Approved: planned start changed');
  });

  it('is open only while the effective state is proposed (an expired row is decided)', () => {
    expect(isOpenProposal(proposal({ effective_state: 'expired' }))).toBe(false);
  });
});

describe('a decision the database refused', () => {
  const refused = { code: '55000', message: 'proposal 7 is already rejected' };

  it('knows the 55000 refusal and the state it names', () => {
    expect(isAlreadyDecided(refused)).toBe(true);
    expect(heldStateOf(refused)).toBe('rejected');
    expect(isAlreadyDecided({ code: '22023', message: 'bad decision' })).toBe(false);
    expect(heldStateOf({ code: '55000', message: 'something else' })).toBeNull();
  });

  it('says a refusal as already decided, and any other failure with its reason', () => {
    expect(decideProblemLine(refused)).toBe(ALREADY_DECIDED_LINE);
    expect(decideProblemLine(new Error('network down'))).toBe('That decision was not saved: network down. Try again.');
    expect(decideProblemLine({})).toMatch(/^That decision was not saved: .+\. Try again\.$/);
  });
});

describe('grouping and the Inbox item', () => {
  it('groups by request, each request’s cards in id order', () => {
    const rows = [proposal({ id: 9 }), proposal({ id: 3 }), proposal({ id: 5, request_id: 42 })];
    const grouped = proposalsByRequest(rows);
    expect(grouped.get(41)?.map((p) => p.id)).toEqual([3, 9]);
    expect(grouped.get(42)?.map((p) => p.id)).toEqual([5]);
  });

  it('finds an Inbox item’s proposal through the checked column 205 adds, never through suggested (R2-8)', () => {
    const item = (fields: { workspace_proposal_id?: unknown; suggested?: unknown }) => proposalIdOfItem(fields);
    expect(item({ workspace_proposal_id: 7 })).toBe(7);
    expect(item({ workspace_proposal_id: 7, suggested: { proposal_id: 9 } })).toBe(7);
    expect(item({ workspace_proposal_id: null, suggested: { proposal_id: 9 } })).toBeNull();
    expect(item({ suggested: { proposal_id: 9 } })).toBeNull();
    expect(item({ workspace_proposal_id: -1 })).toBeNull();
  });
});
