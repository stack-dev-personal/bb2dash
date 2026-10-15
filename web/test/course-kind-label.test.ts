/**
 * `courseKindLabel`: the word the course rail puts after a course's code and section when the
 * course is not a lecture. A lecture is the common case and says nothing.
 */

import { describe, expect, it } from 'vitest';
import { courseKindLabel } from '@/lib/queries';

describe('courseKindLabel', () => {
  it('says nothing for a lecture', () => {
    expect(courseKindLabel('lecture')).toBe('');
  });

  it.each([
    ['recitation', 'Recitation'],
    ['lab', 'Lab'],
    ['seminar', 'Seminar'],
    ['internship', 'Internship'],
    ['online', 'Online'],
  ] as const)('names a %s', (kind, label) => {
    expect(courseKindLabel(kind)).toBe(label);
  });
});
