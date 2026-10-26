/**
 * Stack's own due date for an assignment (migration 221), as the planner block
 * edits it: a New York date and an optional clock time, stored as one instant
 * in `assignment_progress.due_override`.
 *
 * Pure and React-free. The zone is the term's (`COURSE_TIME_ZONE`), the same
 * zone every due line on screen is read in.
 */

import { COURSE_TIME_ZONE } from './course-dimension';
import { wallClockIn, wallClockToInstant } from './planner-zone';

/** The clock a due date gets when neither Stack nor Blackboard named one. */
export const END_OF_DAY = '23:59';

/** The override as the form holds it: '' means "not set". */
export interface DueOverrideForm {
  /** 'YYYY-MM-DD' in New York, or ''. */
  due_date: string;
  /** 'HH:MM' in New York, or ''. */
  due_time: string;
}

/** Read a stored override into the form's two fields. */
export function dueOverrideForm(dueOverride: string | null | undefined): DueOverrideForm {
  const wall = wallClockIn(dueOverride ?? null, COURSE_TIME_ZONE);
  return wall ? { due_date: wall.date, due_time: wall.time } : { due_date: '', due_time: '' };
}

/**
 * The clock to use when Stack picks a day but no time: Blackboard's own time
 * of day when it has one, else the end of the day.
 */
export function defaultDueTime(blackboardDueAt: string | null | undefined): string {
  return wallClockIn(blackboardDueAt ?? null, COURSE_TIME_ZONE)?.time ?? END_OF_DAY;
}

/**
 * The instant to store for a form, or null when the date is empty (which
 * clears the override, so Blackboard's date shows again).
 *
 * Throws with a message the panel can show when the date or time is not one.
 */
export function dueOverrideInstant(
  form: DueOverrideForm,
  blackboardDueAt: string | null | undefined,
): string | null {
  const date = form.due_date.trim();
  if (date === '') return null;
  const time = form.due_time.trim() === '' ? defaultDueTime(blackboardDueAt) : form.due_time.trim();
  const resolved = wallClockToInstant(date, time, COURSE_TIME_ZONE);
  if (!resolved) throw new Error('Due date must be a real date (and time, if given).');
  return resolved.iso;
}
