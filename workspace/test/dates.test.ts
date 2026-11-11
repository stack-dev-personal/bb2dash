import { describe, expect, it } from 'vitest';

import { dateWithWeekday, longDayOf, newYorkDate, newYorkDateTime, weekdayNameOf } from '../src/context/dates.js';

describe('a calendar date and its weekday', () => {
  it('gives a plain date its own weekday, with no time zone to shift it', () => {
    expect(dateWithWeekday('2026-10-16')).toBe('2026-10-16 Fri');
    expect(dateWithWeekday('2026-10-31')).toBe('2026-10-31 Sat');
    expect(dateWithWeekday('2026-11-01')).toBe('2026-11-01 Sun');
    expect(dateWithWeekday('2026-11-02')).toBe('2026-11-02 Mon');
    expect(dateWithWeekday('2026-12-31')).toBe('2026-12-31 Thu');
    expect(dateWithWeekday('2027-01-01')).toBe('2027-01-01 Fri');
  });

  it('leaves text that is not a real date as it is', () => {
    for (const text of ['soon', '', '2026-02-30', '2026-13-01', '2026-10-16T12:00:00Z', ' 2026-10-16'])
      expect(dateWithWeekday(text)).toBe(text);
  });

  it('names the whole day for a plain date, and nothing for text that is not one', () => {
    expect(longDayOf('2026-10-16')).toBe('Friday, October 16, 2026');
    expect(longDayOf('2026-10-20')).toBe('Tuesday, October 20, 2026');
    expect(longDayOf('2026-02-30')).toBeNull();
    expect(weekdayNameOf('2026-11-01')).toBe('Sunday');
    expect(weekdayNameOf('later')).toBeNull();
  });
});

describe('an instant on the New York clock, with its weekday', () => {
  it('keeps a late evening on its own New York day', () => {
    // 23:30 New York on Oct 31 is 03:30 UTC on Nov 1.
    expect(newYorkDateTime('2026-11-01T03:30:00Z')).toBe('2026-10-31 Sat 23:30');
    expect(newYorkDate('2026-11-01T03:30:00Z')).toBe('2026-10-31 Sat');
    expect(newYorkDateTime('2026-10-17T03:59:00+00:00')).toBe('2026-10-16 Fri 23:59');
  });

  it('follows the clock change of 2026-11-01', () => {
    expect(newYorkDateTime('2026-11-01T05:30:00Z')).toBe('2026-11-01 Sun 01:30'); // still EDT
    expect(newYorkDateTime('2026-11-01T06:30:00Z')).toBe('2026-11-01 Sun 01:30'); // EST from 06:00Z
    expect(newYorkDateTime('2026-11-02T04:59:00Z')).toBe('2026-11-01 Sun 23:59');
    expect(newYorkDateTime('2026-11-02T05:00:00Z')).toBe('2026-11-02 Mon 00:00');
  });

  it('writes midnight as 00:00 and leaves text that is not an instant as it is', () => {
    expect(newYorkDateTime('2026-10-20T04:00:00Z')).toBe('2026-10-20 Tue 00:00');
    expect(newYorkDateTime('not a time')).toBe('not a time');
    expect(newYorkDate('not a time')).toBe('not a time');
  });
});
