/**
 * The "Due date" fields of the planner block (migration 221; reshaped on
 * Stack's review, 2026-10-26).
 *
 * Two boxes: a date, and an optional time (blank = end of the day). Clearing
 * the date puts Blackboard's date back. Planned start and finish are gone from
 * the form. The save hook is a stub; nothing here reaches Supabase.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ save: null as unknown }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

vi.mock('@/lib/queries.popout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.popout')>();
  return { ...actual, useSavePlanner: () => hooks.save };
});

const { AssignmentPlannerBlock } = await import('@/components/popout/AssignmentPlannerBlock');

const BASE_PROGRESS = {
  assignment_id: 'ECN.304/quiz-5',
  status: 'not_started',
  priority: 'normal',
  planned_start: '2026-10-20',
  planned_finish: '2026-10-21',
  est_minutes: null,
  notes: null,
  due_override: null as string | null,
};

function progressQ(due_override: string | null) {
  return {
    data: { ...BASE_PROGRESS, due_override } as never,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
  };
}

const mutate = vi.fn();

function renderBlock(due_override: string | null) {
  return render(
    <AssignmentPlannerBlock assignmentId="ECN.304/quiz-5" progressQ={progressQ(due_override)} />,
  );
}

const dateBox = () => screen.getByLabelText('Due date') as HTMLInputElement;
const timeBox = () => screen.getByLabelText('Due time (optional)') as HTMLInputElement;

beforeEach(() => {
  mutate.mockReset();
  mutate.mockImplementation((_vars, options) => options?.onSuccess?.());
  hooks.save = { mutate, isPending: false, isError: false, error: null };
});

describe('AssignmentPlannerBlock — due date', () => {
  it('starts with both boxes empty and usable', () => {
    renderBlock(null);
    expect(dateBox().value).toBe('');
    expect(timeBox().value).toBe('');
    expect(timeBox().disabled).toBe(false);
  });

  it('no longer offers planned start or finish', () => {
    renderBlock(null);
    expect(screen.queryByLabelText('Planned start')).toBeNull();
    expect(screen.queryByLabelText('Planned finish')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to Blackboard' })).toBeNull();
  });

  it('saves a picked day at 11:59 PM when no time is given', () => {
    renderBlock(null);
    fireEvent.change(dateBox(), { target: { value: '2026-10-22' } });
    fireEvent.blur(dateBox());
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      assignmentId: 'ECN.304/quiz-5',
      patch: { due_override: '2026-10-23T03:59:00.000Z' },
    });
  });

  it('shows an end-of-day date with the optional time left blank', () => {
    renderBlock('2026-10-23T03:59:00Z');
    expect(dateBox().value).toBe('2026-10-22');
    expect(timeBox().value).toBe('');
  });

  it('shows a stored time and saves a changed one', () => {
    renderBlock('2026-10-22T16:53:00Z');
    expect(dateBox().value).toBe('2026-10-22');
    expect(timeBox().value).toBe('12:53');
    fireEvent.change(timeBox(), { target: { value: '15:30' } });
    fireEvent.blur(timeBox());
    expect(mutate.mock.calls[0][0].patch).toEqual({ due_override: '2026-10-22T19:30:00.000Z' });
  });

  it('keeps a time typed before any date, and saves it with the date', () => {
    renderBlock(null);
    fireEvent.change(timeBox(), { target: { value: '15:30' } });
    fireEvent.blur(timeBox());
    expect(mutate).not.toHaveBeenCalled();
    expect(timeBox().value).toBe('15:30');
    fireEvent.change(dateBox(), { target: { value: '2026-10-22' } });
    fireEvent.blur(dateBox());
    expect(mutate.mock.calls[0][0].patch).toEqual({ due_override: '2026-10-22T19:30:00.000Z' });
  });

  it('does not write when the date and time are unchanged', () => {
    renderBlock('2026-10-22T19:30:00Z');
    fireEvent.blur(dateBox());
    fireEvent.blur(timeBox());
    expect(mutate).not.toHaveBeenCalled();
  });

  it('clearing the date puts Blackboard’s date back', () => {
    renderBlock('2026-10-22T19:30:00Z');
    fireEvent.change(dateBox(), { target: { value: '' } });
    fireEvent.blur(dateBox());
    expect(mutate.mock.calls[0][0].patch).toEqual({ due_override: null });
  });

  it('keeps the time box usable while the date’s save is in flight', () => {
    hooks.save = { mutate, isPending: true, isError: false, error: null };
    renderBlock('2026-10-22T19:30:00Z');
    expect(dateBox().disabled).toBe(true);
    expect(timeBox().disabled).toBe(false);
  });
});
