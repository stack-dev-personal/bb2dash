/**
 * Example prompts (Phase 24b, brief 111, task 5): built from the page's own read
 * of `v_work_items`, never invented.
 *
 * Asserted: dated items due in the next 14 days (today included), not finished,
 * by due date then title, nine at most; the three forms by category; the course
 * named by its display code; the date in words in New York; no rows give no
 * example; three shown a page, the refresh wrapping.
 */

import { describe, expect, it } from 'vitest';
import type { CourseDisplay, WorkItem } from '@/lib/queries.today';
import { examplePromptLine } from '@/lib/workspace-labels';
import {
  EXAMPLES_SHOWN,
  EXAMPLE_CANDIDATES_MAX,
  EXAMPLE_WINDOW_DAYS,
  courseCodeOf,
  dateWords,
  exampleCandidates,
  examplePages,
  examplesShown,
  todayWords,
  type ExamplePrompt,
} from '@/lib/workspace-examples';

const TODAY = '2026-10-14';

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    item_kind: 'assignment',
    item_id: 'a1',
    course_id: 'BIO.110.lab',
    title: 'Lab report 3',
    type: null,
    category: 'assignment',
    glyph: '',
    in_workload: true,
    due_at: null,
    due_on: '2026-10-20',
    due_rule: null,
    points_possible: null,
    submission: null,
    series_key: null,
    sequence_no: null,
    status: 'not_started',
    priority: null,
    effort: null,
    effort_source: null,
    is_override: false,
    multiplier_applied: false,
    suggested_start: null,
    undated: false,
    confidence: null,
    ...overrides,
  };
}

const COURSES: CourseDisplay[] = [
  {
    display_id: 'BIO.110',
    code: 'BIO 110',
    title: 'Intro Biology',
    shell_ids: ['BIO.110', 'BIO.110.lab'],
    meetings: null,
    room_disputed: false,
    bb_url: null,
    card_note: null,
  },
];

describe('the constants', () => {
  it('are fourteen days, nine candidates, three shown', () => {
    expect([EXAMPLE_WINDOW_DAYS, EXAMPLE_CANDIDATES_MAX, EXAMPLES_SHOWN]).toEqual([14, 9, 3]);
  });
});

describe('exampleCandidates', () => {
  it('gives no example for no rows, ever', () => {
    expect(exampleCandidates({ items: [], courses: COURSES, today: TODAY })).toEqual([]);
  });

  it('names a real item by title, course and date', () => {
    const [prompt] = exampleCandidates({ items: [item({})], courses: COURSES, today: TODAY });
    expect(prompt).toEqual({
      key: 'assignment:a1',
      form: 'work',
      text: examplePromptLine('work', { title: 'Lab report 3', course: 'BIO 110', date: 'Tue Oct 20' }),
      itemKind: 'assignment',
      itemId: 'a1',
      courseId: 'BIO.110.lab',
      dueOn: '2026-10-20',
    });
  });

  it('takes the form from the category', () => {
    const forms = exampleCandidates({
      items: [
        item({ item_id: 'e', category: 'exam', due_on: '2026-10-15' }),
        item({ item_id: 'q', category: 'quiz', due_on: '2026-10-16' }),
        item({ item_id: 'r', item_kind: 'reading', category: 'reading', due_on: '2026-10-17' }),
        item({ item_id: 'p', category: 'project', due_on: '2026-10-18' }),
      ],
      courses: COURSES,
      today: TODAY,
    }).map((prompt) => prompt.form);
    expect(forms).toEqual(['exam', 'exam', 'reading', 'work']);
  });

  it('keeps the window [today, today + 14 days] and leaves out undated and finished items', () => {
    const keys = exampleCandidates({
      items: [
        item({ item_id: 'yesterday', due_on: '2026-10-13' }),
        item({ item_id: 'today', due_on: TODAY }),
        item({ item_id: 'last-day', due_on: '2026-10-28' }),
        item({ item_id: 'too-late', due_on: '2026-10-29' }),
        item({ item_id: 'undated', due_on: null, undated: true }),
        item({ item_id: 'bad-date', due_on: 'soon' }),
        item({ item_id: 'submitted', status: 'submitted' }),
        item({ item_id: 'graded', status: 'graded' }),
        item({ item_id: 'excused', status: 'excused' }),
        item({ item_id: 'missed', status: 'missed' }),
        item({ item_id: 'waived', status: 'waived' }),
        item({ item_id: 'planned', status: 'planned' }),
        item({ item_id: 'started', status: 'in_progress' }),
      ],
      courses: COURSES,
      today: TODAY,
    }).map((prompt) => prompt.itemId);
    expect(keys).toEqual(['today', 'planned', 'started', 'last-day']);
  });

  it('orders by due date, then title, and keeps the first nine', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      item({ item_id: `i${index}`, title: `T${String.fromCharCode(76 - index)}`, due_on: `2026-10-${20 + (index % 3)}` }),
    );
    const candidates = exampleCandidates({ items, courses: COURSES, today: TODAY });
    expect(candidates).toHaveLength(EXAMPLE_CANDIDATES_MAX);
    const order = candidates.map((prompt) => [prompt.dueOn, prompt.itemId]);
    expect(order.slice(0, 4)).toEqual([
      ['2026-10-20', 'i9'],
      ['2026-10-20', 'i6'],
      ['2026-10-20', 'i3'],
      ['2026-10-20', 'i0'],
    ]);
  });

  it('throws for a today that is not a date', () => {
    expect(() => exampleCandidates({ items: [item({})], courses: COURSES, today: 'today' })).toThrow();
  });
});

describe('courseCodeOf and dateWords', () => {
  it('names the course by the display that holds it, else by its id', () => {
    expect(courseCodeOf('BIO.110', COURSES)).toBe('BIO 110');
    expect(courseCodeOf('BIO.110.lab', COURSES)).toBe('BIO 110');
    expect(courseCodeOf('HST.205', COURSES)).toBe('HST.205');
  });

  it('writes the date as a New York weekday, month and day', () => {
    expect(dateWords('2026-10-21')).toBe('Wed Oct 21');
    expect(dateWords('2026-11-01')).toBe('Sun Nov 1'); // the day the clocks go back
    expect(dateWords('2026-03-08')).toBe('Sun Mar 8');
    expect(() => dateWords('21 Oct')).toThrow();
  });
});

describe("todayWords (amendment (g): the page states today's weekday and date)", () => {
  it('writes the full weekday, month, day and year in New York', () => {
    expect(todayWords('2026-10-15')).toBe('Thursday, October 15, 2026');
    expect(todayWords('2026-10-16')).toBe('Friday, October 16, 2026'); // the weekday step 6's answer got wrong
    expect(todayWords('2026-11-01')).toBe('Sunday, November 1, 2026');
    expect(todayWords('2026-01-01')).toBe('Thursday, January 1, 2026');
  });

  it('throws for a string that is not a YYYY-MM-DD date', () => {
    expect(() => todayWords('15 Oct 2026')).toThrow();
    expect(() => todayWords('2026-02-30')).toThrow();
    expect(() => todayWords('')).toThrow();
  });
});

describe('examplePages and examplesShown', () => {
  const prompts = (count: number): ExamplePrompt[] =>
    Array.from({ length: count }, (_, index) => ({
      key: `k${index}`,
      form: 'work',
      text: `t${index}`,
      itemKind: 'assignment',
      itemId: `${index}`,
      courseId: 'c',
      dueOn: TODAY,
    }));

  it('counts the pages', () => {
    expect(examplePages([])).toBe(0);
    expect(examplePages(prompts(3))).toBe(1);
    expect(examplePages(prompts(7))).toBe(3);
  });

  it('shows three a page, wrapping past the end', () => {
    const seven = prompts(7);
    const keys = (page: number) => examplesShown(seven, page).map((prompt) => prompt.key);
    expect(keys(0)).toEqual(['k0', 'k1', 'k2']);
    expect(keys(2)).toEqual(['k6', 'k0', 'k1']);
    expect(keys(3)).toEqual(keys(0));
    expect(keys(-1)).toEqual(keys(2));
  });

  it('shows what there is when there are fewer than three, and nothing for none', () => {
    expect(examplesShown(prompts(2), 5).map((prompt) => prompt.key)).toEqual(['k0', 'k1']);
    expect(examplesShown([], 0)).toEqual([]);
  });
});
