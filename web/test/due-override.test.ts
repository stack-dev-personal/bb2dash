/**
 * Stack's own due date (migration 221): the form ⇄ instant helpers in
 * `lib/due-override.ts` and the `effectiveDue` rule the due lines share.
 *
 * The case that prompted it: ECN.304 Quiz 5 was taken Thu 10/22 at 3:30 PM,
 * but Blackboard's placeholder column due date put it on Tue 10/27.
 */

import { describe, expect, it } from 'vitest';
import {
  END_OF_DAY,
  dueOverrideForm,
  dueOverrideInstant,
} from '@/lib/due-override';
import { effectiveDue } from '@/components/popout/assignment-detail-format';

const BLACKBOARD_QUIZ_5 = '2026-10-27T16:53:23.005Z'; // 12:53 PM New York (EDT)

describe('dueOverrideForm', () => {
  it('reads a stored instant as its New York date and clock', () => {
    expect(dueOverrideForm('2026-10-22T19:30:00Z')).toEqual({
      due_date: '2026-10-22',
      due_time: '15:30',
    });
  });

  it('reads an 11:59 PM deadline on its New York day, not the UTC one', () => {
    expect(dueOverrideForm('2026-09-24T03:59:00Z')).toEqual({
      due_date: '2026-09-23',
      due_time: '23:59',
    });
  });

  it('is empty when nothing is stored', () => {
    expect(dueOverrideForm(null)).toEqual({ due_date: '', due_time: '' });
    expect(dueOverrideForm(undefined)).toEqual({ due_date: '', due_time: '' });
    expect(dueOverrideForm('not a date')).toEqual({ due_date: '', due_time: '' });
  });
});

describe('dueOverrideInstant', () => {
  it('turns a New York date and time into the UTC instant (EDT)', () => {
    expect(dueOverrideInstant({ due_date: '2026-10-22', due_time: '15:30' })).toBe(
      '2026-10-22T19:30:00.000Z',
    );
  });

  it('uses the winter offset after the clocks change (EST)', () => {
    expect(dueOverrideInstant({ due_date: '2026-12-01', due_time: '09:00' })).toBe(
      '2026-12-01T14:00:00.000Z',
    );
  });

  it('takes 11:59 PM when no time is given, never Blackboard’s placeholder clock', () => {
    expect(END_OF_DAY).toBe('23:59');
    expect(dueOverrideInstant({ due_date: '2026-10-22', due_time: '' })).toBe(
      '2026-10-23T03:59:00.000Z',
    );
  });

  it('clears the override when the date is empty', () => {
    expect(dueOverrideInstant({ due_date: '', due_time: '15:30' })).toBeNull();
  });

  it('refuses something that is not a date', () => {
    expect(() => dueOverrideInstant({ due_date: '2026-02-30', due_time: '' })).toThrow(
      /real date/,
    );
    expect(() => dueOverrideInstant({ due_date: '2026-10-22', due_time: '25:00' })).toThrow(
      /real date/,
    );
  });
});

describe('effectiveDue', () => {
  const quiz5 = { due_date: null, due_at: BLACKBOARD_QUIZ_5, due_rule: null };

  it('is Blackboard’s date when Stack set none', () => {
    const due = effectiveDue(quiz5, null);
    expect(due.overridden).toBe(false);
    expect(due.due_at).toBe(BLACKBOARD_QUIZ_5);
    expect(due.blackboard).toBe('Tue, Oct 27 · 12:53 PM');
  });

  it('is Stack’s date when he set one, with Blackboard’s kept for the hint', () => {
    const due = effectiveDue(quiz5, '2026-10-22T19:30:00Z');
    expect(due).toMatchObject({
      overridden: true,
      due_at: '2026-10-22T19:30:00Z',
      due_date: null,
      due_rule: null,
      blackboard: 'Tue, Oct 27 · 12:53 PM',
    });
  });

  it('drops Blackboard’s day and rule, which would name a different day', () => {
    const due = effectiveDue(
      { due_date: '2026-10-27', due_at: null, due_rule: 'start of class' },
      '2026-10-22T19:30:00Z',
    );
    expect(due.due_date).toBeNull();
    expect(due.due_rule).toBeNull();
  });

  it('treats a blank override as none', () => {
    expect(effectiveDue(quiz5, '  ').overridden).toBe(false);
  });
});
