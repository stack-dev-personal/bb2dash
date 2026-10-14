/**
 * bb2dash — routines (Phase 24b, brief 111, task 5; "Routines").
 *
 * The page reads `workspace_routines` (id, grp, title, description, needs,
 * sort, enabled) and never its instructions: those are the runner's. `needs`
 * gates Ask on the page, the case the database refuses with 23514: `file`
 * needs an attachment, `course_or_file` a course or an attachment.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { asRecord } from './json-record';
import { untypedClient } from './queries.sync';
import {
  ROUTINE_GROUP_HEADINGS,
  routineNeedsCourseOrFileLine,
  routineNeedsFileLine,
} from './workspace-labels';

export type WorkspaceRoutineNeeds = 'nothing' | 'file' | 'course_or_file';
export type WorkspaceRoutineGroup = 'study' | 'plan' | 'write';

export interface WorkspaceRoutine {
  id: string;
  grp: WorkspaceRoutineGroup;
  title: string;
  description: string;
  needs: WorkspaceRoutineNeeds;
  sort: number;
  enabled: boolean;
}

/** The columns the page reads: never `instructions`. */
export const ROUTINE_COLUMNS = 'id, grp, title, description, needs, sort, enabled';

/** The groups in the order the list shows them. */
const GROUPS: readonly WorkspaceRoutineGroup[] = ['study', 'plan', 'write'];
const NEEDS: readonly WorkspaceRoutineNeeds[] = ['nothing', 'file', 'course_or_file'];

export const workspaceRoutineKeys = { routines: () => ['workspace', 'routines'] as const } as const;

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** One routine row; null when it has no id, title or description, or a group, need or sort it cannot read. */
export function normalizeRoutine(row: unknown): WorkspaceRoutine | null {
  const raw = asRecord(row);
  const grp = oneOf(GROUPS, raw?.grp);
  const needs = oneOf(NEEDS, raw?.needs);
  if (!raw || grp === null || needs === null) return null;
  const { id, title, description, sort } = raw;
  if (typeof id !== 'string' || id === '' || typeof title !== 'string' || typeof description !== 'string') {
    return null;
  }
  if (typeof sort !== 'number' || !Number.isSafeInteger(sort)) return null;
  return { id, grp, title, description, needs, sort, enabled: raw.enabled === true };
}

/** The enabled routines, by sort. */
export function routinesOptions() {
  return queryOptions({
    queryKey: workspaceRoutineKeys.routines(),
    queryFn: async (): Promise<WorkspaceRoutine[]> => {
      const { data, error } = await untypedClient()
        .from('workspace_routines')
        .select(ROUTINE_COLUMNS)
        .eq('enabled', true)
        .order('sort', { ascending: true });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).flatMap((row: unknown) => normalizeRoutine(row) ?? []);
    },
  });
}

export function useWorkspaceRoutines() {
  return useQuery(routinesOptions());
}

/** Whether what is chosen meets a routine's need, as `workspace_ask_with` checks it. */
export function routineNeedsMet(
  needs: WorkspaceRoutineNeeds,
  chosen: { attachments: number; course: string | null },
): boolean {
  switch (needs) {
    case 'nothing':
      return true;
    case 'file':
      return chosen.attachments > 0;
    case 'course_or_file':
      return chosen.course !== null || chosen.attachments > 0;
  }
}

/** The line that says why Ask is off for a routine, or null when its need is met. */
export function routineNeedLine(
  routine: WorkspaceRoutine,
  chosen: { attachments: number; course: string | null },
): string | null {
  if (routineNeedsMet(routine.needs, chosen)) return null;
  return routine.needs === 'file' ? routineNeedsFileLine(routine.title) : routineNeedsCourseOrFileLine(routine.title);
}

/** The routines under their group headings: study, plan, write; each by sort; an empty group left out. */
export function routinesByGroup(
  rows: readonly WorkspaceRoutine[],
): ReadonlyArray<{ group: WorkspaceRoutineGroup; heading: string; routines: WorkspaceRoutine[] }> {
  return GROUPS.flatMap((group) => {
    const routines = rows.filter((row) => row.grp === group).sort((a, b) => a.sort - b.sort);
    return routines.length === 0 ? [] : [{ group, heading: ROUTINE_GROUP_HEADINGS[group], routines }];
  });
}

/** The routines whose title or description holds the filter, any case; a blank filter keeps every row. */
export function filterRoutines(rows: readonly WorkspaceRoutine[], filter: string): WorkspaceRoutine[] {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return [...rows];
  return rows.filter(
    (row) => row.title.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle),
  );
}
