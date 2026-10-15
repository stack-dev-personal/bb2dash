/**
 * bb2dash — example prompts (Phase 24b, brief 111, task 5; "Example prompts").
 *
 * Built from the page's own read of `v_work_items`: the next 14 days, up to
 * nine candidates, three shown, the refresh stepping through them. A prompt
 * names a real item by title and date; with no rows there is no example, ever.
 *
 * Pure: the rows and today's New York date come in as arguments.
 */

import type { CourseDisplay, WorkItem } from './queries.today';
import { foldStatus, type OfferedStatus } from './progress-status';
import { examplePromptLine } from './workspace-labels';

export const EXAMPLE_WINDOW_DAYS = 14;
export const EXAMPLE_CANDIDATES_MAX = 9;
export const EXAMPLES_SHOWN = 3;

export type ExampleForm = 'exam' | 'reading' | 'work';

export interface ExamplePrompt {
  key: string;
  form: ExampleForm;
  text: string;
  itemKind: 'assignment' | 'reading';
  itemId: string;
  courseId: string;
  dueOn: string;
}

export interface ExampleInput {
  items: readonly WorkItem[];
  courses: readonly CourseDisplay[];
  /** The New York date, YYYY-MM-DD. */
  today: string;
}

/** The statuses still to be worked on; every other offered status is finished (`progress-status.ts`). */
const OPEN_STATUSES: ReadonlySet<OfferedStatus> = new Set<OfferedStatus>(['not_started', 'in_progress']);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
/** Midday UTC is the same calendar day in New York all year round. */
const MIDDAY_UTC_HOUR = 12;
const NEW_YORK = 'America/New_York';

const DATE_WORDS = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** A YYYY-MM-DD date as the moment of its midday UTC, or null when it is not a real date. */
function middayOf(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (match === null) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const moment = Date.UTC(year, month - 1, day, MIDDAY_UTC_HOUR);
  return new Date(moment).toISOString().slice(0, 10) === date ? moment : null;
}

function formOf(item: WorkItem): ExampleForm {
  if (item.category === 'exam' || item.category === 'quiz') return 'exam';
  return item.category === 'reading' ? 'reading' : 'work';
}

/** The course's display code: the display whose id or shells hold it, else the id itself. */
export function courseCodeOf(courseId: string, courses: readonly CourseDisplay[]): string {
  const display = courses.find((course) => course.display_id === courseId || course.shell_ids.includes(courseId));
  return display?.code ?? courseId;
}

/** "Tue Oct 21": the date's weekday, month and day in New York. Throws for a string that is not a date. */
export function dateWords(dueOn: string): string {
  const moment = middayOf(dueOn);
  if (moment === null) throw new Error(`not a YYYY-MM-DD date: ${dueOn}`);
  const parts = Object.fromEntries(DATE_WORDS.formatToParts(moment).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.month} ${parts.day}`;
}

/**
 * Up to nine prompts from the dated items due in [today, today + 14 days] that
 * are not finished, by due date then title. No rows give an empty list.
 */
export function exampleCandidates(input: ExampleInput): readonly ExamplePrompt[] {
  const start = middayOf(input.today);
  if (start === null) throw new Error(`today must be a YYYY-MM-DD date, got ${input.today}`);
  const end = start + EXAMPLE_WINDOW_DAYS * MS_PER_DAY;
  const due = input.items.filter((item) => {
    const moment = item.due_on === null ? null : middayOf(item.due_on);
    return moment !== null && moment >= start && moment <= end && OPEN_STATUSES.has(foldStatus(item.status));
  });
  const ordered = [...due].sort(
    (a, b) => (a.due_on as string).localeCompare(b.due_on as string) || a.title.localeCompare(b.title, 'en'),
  );
  return ordered.slice(0, EXAMPLE_CANDIDATES_MAX).map((item) => {
    const dueOn = item.due_on as string;
    const form = formOf(item);
    return {
      key: `${item.item_kind}:${item.item_id}`,
      form,
      text: examplePromptLine(form, {
        title: item.title,
        course: courseCodeOf(item.course_id, input.courses),
        date: dateWords(dueOn),
      }),
      itemKind: item.item_kind,
      itemId: item.item_id,
      courseId: item.course_id,
      dueOn,
    };
  });
}

/** How many pages of three the candidates make; 0 for none. */
export function examplePages(candidates: readonly ExamplePrompt[]): number {
  return Math.ceil(candidates.length / EXAMPLES_SHOWN);
}

/**
 * The page's three, wrapping: a page past the last starts over, and the last
 * page is filled from the start, so three show whenever there are three.
 */
export function examplesShown(candidates: readonly ExamplePrompt[], page: number): readonly ExamplePrompt[] {
  const count = candidates.length;
  const pages = examplePages(candidates);
  if (count === 0) return [];
  const step = Number.isFinite(page) ? Math.trunc(page) : 0;
  const first = (((step % pages) + pages) % pages) * EXAMPLES_SHOWN;
  return Array.from({ length: Math.min(EXAMPLES_SHOWN, count) }, (_, offset) => candidates[(first + offset) % count]);
}
