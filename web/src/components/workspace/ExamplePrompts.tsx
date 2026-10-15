'use client';

/**
 * The lobby's example prompts (Phase 24b, brief 111, "Example prompts"; W-87).
 *
 * Built by `exampleCandidates` from his own upcoming work: the items of
 * `v_work_items` due from today to 14 days on (New York dates), with the class
 * codes of `v_course_display`. Up to three show; "Other examples" steps to the
 * next three when there are more. A press fills the composer's box and sends
 * nothing. With no candidate the whole block is absent: no example is ever
 * invented. While the rows are read, or before hydration, nothing shows; a
 * failed read is said in its one line.
 */

import { useId, useState } from 'react';
import { courseToday } from '@/lib/course-dimension';
import { useCourseDisplay, useWorkItemsWindow } from '@/lib/queries.today';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { EXAMPLE_WINDOW_DAYS, exampleCandidates, examplePages, examplesShown } from '@/lib/workspace-examples';
import { EXAMPLES_HEADING, REFRESH_EXAMPLES_LABEL, examplesProblemLine } from '@/lib/workspace-labels';
import styles from './ExamplePrompts.module.css';

const MS_PER_DAY = 86_400_000;

/** A YYYY-MM-DD date `days` later, by the calendar. */
function laterDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface ExamplePromptsProps {
  /** The screen's clock: today's New York date is read from it. */
  now: number;
  /** A pressed example's text, for the composer's box. */
  onPick: (text: string) => void;
}

export function ExamplePrompts({ now, onPick }: ExamplePromptsProps) {
  const hydrated = useHydrated();
  const today = courseToday(new Date(now));
  const items = useWorkItemsWindow(today, laterDate(today, EXAMPLE_WINDOW_DAYS));
  const courses = useCourseDisplay();
  const [page, setPage] = useState(0);
  const headingId = useId();

  if (!hydrated) return null;
  if (items.error) {
    return (
      <p className={styles.problem} role="alert">
        {examplesProblemLine(workspaceErrorReason(items.error))}
      </p>
    );
  }
  if (items.data === undefined || courses.isPending) return null;
  const candidates = exampleCandidates({ items: items.data, courses: courses.data ?? [], today });
  if (candidates.length === 0) return null;

  return (
    <section className={styles.examples} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h3 id={headingId} className={styles.heading}>
          {EXAMPLES_HEADING}
        </h3>
        {examplePages(candidates) > 1 && (
          <button type="button" className={styles.refresh} onClick={() => setPage((current) => current + 1)}>
            {REFRESH_EXAMPLES_LABEL}
          </button>
        )}
      </div>
      <div className={styles.list}>
        {examplesShown(candidates, page).map((example) => (
          <button key={example.key} type="button" className={styles.example} onClick={() => onPick(example.text)}>
            {example.text}
          </button>
        ))}
      </div>
    </section>
  );
}
