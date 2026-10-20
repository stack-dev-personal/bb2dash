/**
 * Stack's edit of a proposed value (W-106), the pure half: what the editor starts from, and the
 * check a draft passes before it is kept, the same rules 204 and 206 hold the value to (a status the
 * planner offers, a real ISO date, a note of 1 to 2,000 characters, and not what the planner has).
 */

import { describe, expect, it } from 'vitest';
import {
  DRAFT_DATE_PROBLEM,
  DRAFT_NOTE_EMPTY,
  DRAFT_NOTE_TOO_LONG,
  DRAFT_SAME_AS_PLANNER,
  DRAFT_STATUS_PROBLEM,
  NOTE_MAX,
  checkDraft,
  editLabel,
  editorTextOf,
  noteCount,
} from '@/lib/proposal-draft';

const status = { field: 'status' as const, old_value: 'in_progress' as unknown };
const date = { field: 'planned_start' as const, old_value: '2026-10-20' as unknown };
const note = { field: 'notes' as const, old_value: null as unknown };

describe('checkDraft', () => {
  it('keeps a value that fits its field and differs from the planner', () => {
    expect(checkDraft(status, 'graded')).toEqual({ ok: true, value: 'graded' });
    expect(checkDraft(date, '2026-10-22')).toEqual({ ok: true, value: '2026-10-22' });
    expect(checkDraft(note, '  my words  ')).toEqual({ ok: true, value: '  my words  ' });
  });

  it('offers only the planner’s six statuses', () => {
    expect(checkDraft(status, 'planned')).toEqual({ ok: false, message: DRAFT_STATUS_PROBLEM });
    expect(checkDraft(status, 'done')).toEqual({ ok: false, message: DRAFT_STATUS_PROBLEM });
  });

  it('takes a real calendar date written YYYY-MM-DD and nothing else', () => {
    for (const bad of ['', '2026-02-30', 'Oct 22', '2026-1-5']) {
      expect(checkDraft(date, bad)).toEqual({ ok: false, message: DRAFT_DATE_PROBLEM });
    }
  });

  it('takes a note of 1 to 2,000 characters that is not only blanks', () => {
    expect(checkDraft(note, '   ')).toEqual({ ok: false, message: DRAFT_NOTE_EMPTY });
    expect(checkDraft(note, 'n'.repeat(NOTE_MAX)).ok).toBe(true);
    expect(checkDraft(note, 'n'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, message: DRAFT_NOTE_TOO_LONG });
  });

  it('refuses what the planner already has (no row is a status of not opened)', () => {
    expect(checkDraft(status, 'in_progress')).toEqual({ ok: false, message: DRAFT_SAME_AS_PLANNER });
    expect(checkDraft({ field: 'status', old_value: null }, 'not_started')).toEqual({ ok: false, message: DRAFT_SAME_AS_PLANNER });
    expect(checkDraft(date, '2026-10-20')).toEqual({ ok: false, message: DRAFT_SAME_AS_PLANNER });
    expect(checkDraft({ field: 'notes', old_value: 'same' }, 'same')).toEqual({ ok: false, message: DRAFT_SAME_AS_PLANNER });
  });
});

describe('the editor', () => {
  it('starts from the value shown, a retired status read as the one it folds into', () => {
    expect(editorTextOf('status', 'submitted')).toBe('submitted');
    expect(editorTextOf('status', 'planned')).toBe('not_started');
    expect(editorTextOf('planned_start', '2026-10-21')).toBe('2026-10-21');
    expect(editorTextOf('notes', 'Start with 3.')).toBe('Start with 3.');
    expect(editorTextOf('notes', null)).toBe('');
  });

  it('counts a note in characters as the database does, not UTF-16 units', () => {
    expect(noteCount('ab')).toBe(2);
    expect(noteCount('😀')).toBe(1);
  });

  it('names the edit button after the item', () => {
    expect(editLabel('ECN 304 Problem Set 4')).toBe('Edit the proposed value for ECN 304 Problem Set 4');
  });
});
