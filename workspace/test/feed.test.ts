import { describe, expect, it } from 'vitest';

import { parseFeed, renderFeed, type Feed } from '../src/context/feed.js';
import { bigFeedJson } from './helpers/context24.js';

/** One work row and one score row around the clock change, in the feed's jsonb shape. */
function feedOf(overrides: { asOf?: string; work?: Record<string, unknown>; seenAt?: string | null } = {}): Feed {
  const base = bigFeedJson(1, 1) as { work: Array<Record<string, unknown>>; scores: Array<Record<string, unknown>> };
  const feed = parseFeed({
    ...base,
    as_of: overrides.asOf ?? '2026-10-20T05:30:00+00:00',
    from: '2026-10-13',
    to: '2026-11-17',
    work: [{ ...base.work[0], ...overrides.work }],
    scores: [{ ...base.scores[0], seen_at: overrides.seenAt === undefined ? '2026-11-01T03:30:00+00:00' : overrides.seenAt }],
  });
  if (feed === null) throw new Error('synthetic feed does not parse');
  return feed;
}

const linesOf = (feed: Feed): string[] => renderFeed(feed).text.split('\n');
const dueOf = (feed: Feed): string => linesOf(feed)[3]?.split(' | ')[2] ?? '';
const seenOf = (feed: Feed): string => linesOf(feed)[5]?.split(' | ').at(-1) ?? '';

describe('the feed gives every date its New York weekday', () => {
  it('opens with the time it was read and today, both with the weekday, and the window with weekdays', () => {
    expect(linesOf(feedOf())[0]).toBe(
      'Planner and grades, read 2026-10-20 Tue 01:30 New York time (today is Tuesday, October 20, 2026). Work due 2026-10-13 Tue to 2026-11-17 Tue; posted scores are not limited to those dates.',
    );
  });

  it('takes today from the New York clock, not from UTC', () => {
    // 03:30 UTC on Oct 21 is still Tuesday evening in New York.
    expect(linesOf(feedOf({ asOf: '2026-10-21T03:30:00Z' }))[0]).toContain('read 2026-10-20 Tue 23:30 New York time (today is Tuesday, October 20, 2026).');
  });

  it('writes a due time as date, weekday and New York time, across the clock change', () => {
    expect(dueOf(feedOf({ work: { due_at: '2026-11-01T03:30:00+00:00' } }))).toBe('2026-10-31 Sat 23:30');
    expect(dueOf(feedOf({ work: { due_at: '2026-11-02T04:59:00+00:00' } }))).toBe('2026-11-01 Sun 23:59');
  });

  it('writes a due date alone with its own weekday, never shifted', () => {
    expect(dueOf(feedOf({ work: { due_at: null, due_on: '2026-11-01' } }))).toBe('2026-11-01 Sun');
  });

  it('leaves an undated row a dash and a due value that is not a date as it is', () => {
    expect(dueOf(feedOf({ work: { due_at: null, due_on: null, undated: true } }))).toBe('-');
    expect(dueOf(feedOf({ work: { due_at: null, due_on: 'week 9' } }))).toBe('week 9');
  });

  it('writes the date a score was seen as the New York date with its weekday', () => {
    expect(seenOf(feedOf())).toBe('2026-10-31 Sat');
    expect(seenOf(feedOf({ seenAt: null }))).toBe('-');
  });

  it('keeps a header that is not a date as it is', () => {
    const feed = { ...feedOf(), asOf: 'unknown', from: 'start', to: 'end' };
    expect(linesOf(feed)[0]).toBe('Planner and grades, read unknown New York time. Work due start to end; posted scores are not limited to those dates.');
  });
});

describe('a score line names the assignment its column is linked to', () => {
  // A graded row is usually older than the work window, so its score line is where the assistant finds
  // the id a planner proposal names it by (25b follow-up).
  function scoreLineOf(assignmentId: string | null): string {
    const base = bigFeedJson(0, 1) as { scores: Array<Record<string, unknown>> };
    const feed = parseFeed({ ...base, scores: [{ ...base.scores[0], assignment_id: assignmentId }] });
    if (feed === null) throw new Error('synthetic feed does not parse');
    return linesOf(feed).find((line) => line.startsWith('CRS.')) ?? '';
  }

  it('puts the id after the course, under the header that names it', () => {
    const feed = parseFeed(bigFeedJson(0, 1));
    if (feed === null) throw new Error('synthetic feed does not parse');
    expect(linesOf(feed)).toContain('scores: course | id | name | score | possible | grade | released | exempt | submission | seen');
    expect(scoreLineOf('ECN.304/exam-1').split(' | ').slice(0, 3)).toEqual(['CRS.100', 'ECN.304/exam-1', 'Synthetic graded column 0']);
  });

  it('shows a dash for a column linked to no assignment', () => {
    expect(scoreLineOf(null).split(' | ')[1]).toBe('-');
  });
});
