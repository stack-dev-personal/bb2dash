/**
 * Routines (Phase 24b, brief 111, task 5): `workspace_routines` read without
 * its instructions, `needs` gating Ask the way the database refuses it (23514),
 * three groups in a fixed order, and a filter over title and description.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import routinesSeed from '../../workspace/test/fixtures/contract24/seed/routines.json';

interface Call {
  target: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  result: { data: null as unknown, error: null as unknown },
}));

function builder(table: string) {
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      stub.calls.push({ target: table, op, args });
      return chain;
    };
  const chain: Record<string, unknown> = {
    select: record('select'),
    eq: record('eq'),
    order: record('order'),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(stub.result).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => builder(table) }),
}));

const {
  ROUTINE_COLUMNS,
  filterRoutines,
  normalizeRoutine,
  routineNeedLine,
  routineNeedsMet,
  routinesByGroup,
  routinesOptions,
  useWorkspaceRoutines,
  workspaceRoutineKeys,
} = await import('@/lib/queries.workspace-routines');
const labels = await import('@/lib/workspace-labels');
type WorkspaceRoutineGroup = import('@/lib/queries.workspace-routines').WorkspaceRoutineGroup;
type WorkspaceRoutine = import('@/lib/queries.workspace-routines').WorkspaceRoutine;

/** The group headings are keyed by this module's groups: the two are pinned equal. */
const _headings: Record<WorkspaceRoutineGroup, string> = labels.ROUTINE_GROUP_HEADINGS;

const SEED: Record<string, unknown>[] = routinesSeed;
const ROUTINES = SEED.map((row) => normalizeRoutine(row)).filter((row): row is WorkspaceRoutine => row !== null);

beforeEach(() => {
  stub.calls = [];
  stub.result = { data: null, error: null };
});

describe('normalizeRoutine', () => {
  it('reads the six seed rows, and never the instructions', () => {
    expect(ROUTINES).toHaveLength(6);
    expect(ROUTINES[0]).toEqual({
      id: 'quiz',
      grp: 'study',
      title: 'Quiz me',
      description: 'One question at a time from a course or a file, with your answer checked.',
      needs: 'course_or_file',
      sort: 10,
      enabled: true,
    });
    expect(ROUTINES.some((row) => 'instructions' in row)).toBe(false);
  });

  it('drops a row with an unknown group or need, or no id', () => {
    const row = SEED[0];
    expect(normalizeRoutine({ ...row, grp: 'play' })).toBeNull();
    expect(normalizeRoutine({ ...row, needs: 'everything' })).toBeNull();
    expect(normalizeRoutine({ ...row, id: '' })).toBeNull();
    expect(normalizeRoutine({ ...row, title: 3 })).toBeNull();
    expect(normalizeRoutine({ ...row, sort: '10' })).toBeNull();
    expect(normalizeRoutine(null)).toBeNull();
    expect(normalizeRoutine({ ...row, enabled: 'yes' })?.enabled).toBe(false);
  });
});

describe('routinesOptions', () => {
  it('reads the enabled routines by sort, naming the columns (never instructions)', async () => {
    expect(ROUTINE_COLUMNS).toBe('id, grp, title, description, needs, sort, enabled');
    const query = routinesOptions();
    expect(query.queryKey).toEqual(workspaceRoutineKeys.routines());
    expect(query.queryKey).toEqual(['workspace', 'routines']);
    stub.result = { data: SEED, error: null };
    await expect(query.queryFn!({} as never)).resolves.toHaveLength(6);
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      ['select', ROUTINE_COLUMNS],
      ['eq', 'enabled', true],
      ['order', 'sort', { ascending: true }],
    ]);
  });

  it('throws a read error', async () => {
    stub.result = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(routinesOptions().queryFn!({} as never)).rejects.toMatchObject({ code: '42501' });
  });

  it('runs through the hook', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    stub.result = { data: SEED.slice(0, 2), error: null };
    const { result } = renderHook(() => useWorkspaceRoutines(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });
});

describe('needs: Ask is off until the need is met', () => {
  const quiz = ROUTINES.find((row) => row.id === 'quiz')!;
  const explain = ROUTINES.find((row) => row.id === 'explain-file')!;
  const plan = ROUTINES.find((row) => row.id === 'plan-week')!;

  it('meets nothing always, a file with one attachment, course_or_file with either', () => {
    expect(routineNeedsMet('nothing', { attachments: 0, course: null })).toBe(true);
    expect(routineNeedsMet('file', { attachments: 0, course: 'BIO.110' })).toBe(false);
    expect(routineNeedsMet('file', { attachments: 1, course: null })).toBe(true);
    expect(routineNeedsMet('course_or_file', { attachments: 0, course: null })).toBe(false);
    expect(routineNeedsMet('course_or_file', { attachments: 0, course: 'BIO.110' })).toBe(true);
    expect(routineNeedsMet('course_or_file', { attachments: 2, course: null })).toBe(true);
  });

  it('says why Ask is off, and nothing when the need is met', () => {
    expect(routineNeedLine(explain, { attachments: 0, course: null })).toBe(
      labels.routineNeedsFileLine('Explain this file'),
    );
    expect(routineNeedLine(quiz, { attachments: 0, course: null })).toBe(
      labels.routineNeedsCourseOrFileLine('Quiz me'),
    );
    expect(routineNeedLine(quiz, { attachments: 1, course: null })).toBeNull();
    expect(routineNeedLine(plan, { attachments: 0, course: null })).toBeNull();
  });
});

describe('routinesByGroup and filterRoutines', () => {
  it('groups study, plan, write in that order, with their headings', () => {
    const groups = routinesByGroup(ROUTINES);
    expect(groups.map((group) => [group.group, group.heading, group.routines.map((row) => row.id)])).toEqual([
      ['study', 'Study', ['quiz', 'study-guide', 'explain-file', 'summarise-reading']],
      ['plan', 'Plan', ['plan-week']],
      ['write', 'Write', ['draft-help']],
    ]);
    expect(Object.keys(_headings)).toEqual(['study', 'plan', 'write']);
  });

  it('leaves an empty group out, and orders each group by sort', () => {
    const reversed = [...ROUTINES].reverse().filter((row) => row.grp !== 'plan');
    const groups = routinesByGroup(reversed);
    expect(groups.map((group) => group.group)).toEqual(['study', 'write']);
    expect(groups[0].routines.map((row) => row.sort)).toEqual([10, 20, 30, 40]);
    expect(routinesByGroup([])).toEqual([]);
  });

  it('filters by title or description, any case; a blank filter keeps every row', () => {
    expect(filterRoutines(ROUTINES, 'QUIZ').map((row) => row.id)).toEqual(['quiz']);
    expect(filterRoutines(ROUTINES, 'planner').map((row) => row.id)).toEqual(['plan-week']);
    expect(filterRoutines(ROUTINES, '  ')).toHaveLength(6);
    expect(filterRoutines(ROUTINES, 'nothing like it')).toEqual([]);
  });
});
