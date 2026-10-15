'use client';

/**
 * The dashed course chip (Phase 24b, brief 111, "The composer"; W-87).
 *
 * The chip shows the picked class's code, or "All courses", and opens a menu
 * listing "All courses" first, then the classes of `v_course_display` in the
 * view's order. Picking one closes the menu and hands focus back to the chip.
 * The chip is never removed: "All courses" is the empty pick. The rows come
 * from a cache restored before hydration, so they are read only once
 * `useHydrated()` is true; a failed read leaves "All courses" and says why.
 */

import { useCourseDisplay, type CourseDisplay } from '@/lib/queries.today';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import {
  ALL_COURSES_LABEL,
  COURSE_MENU_LABEL,
  courseChipLabel,
  coursesProblemLine,
} from '@/lib/workspace-labels';
import { useMenuButton } from './menu-keys';
import { placedClass } from './menu-placement';
import menuStyles from './Menu.module.css';
import styles from './CourseMenu.module.css';

export interface CourseMenuProps {
  /** A `v_course_display.display_id`, or null for all courses. */
  course: string | null;
  onPick: (course: string | null) => void;
  disabled: boolean;
}

function CourseItems(props: {
  course: string | null;
  rows: readonly CourseDisplay[];
  onChoose: (course: string | null) => void;
}) {
  const entries = [
    { id: null, label: ALL_COURSES_LABEL },
    ...props.rows.map((row) => ({ id: row.display_id, label: row.code })),
  ];
  return (
    <div className={menuStyles.list}>
      {entries.map((entry) => (
        <button
          key={entry.id ?? ''}
          type="button"
          role="menuitemradio"
          aria-checked={props.course === entry.id}
          className={menuStyles.item}
          onClick={() => props.onChoose(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function CourseMenu({ course, onPick, disabled }: CourseMenuProps) {
  const hydrated = useHydrated();
  const courses = useCourseDisplay();
  const [menu, trigger, anchor, menuRef] = useMenuButton();
  const rows = hydrated ? (courses.data ?? []) : [];
  const shown = course === null ? ALL_COURSES_LABEL : (rows.find((row) => row.display_id === course)?.code ?? course);

  return (
    <span ref={anchor} className={menuStyles.anchor}>
      <button
        ref={trigger}
        type="button"
        className={styles.chip}
        data-chip="course"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={courseChipLabel(shown)}
        disabled={disabled}
        onClick={menu.toggle}
      >
        {shown}
      </button>
      {menu.open && (
        <div ref={menuRef} role="menu" aria-label={COURSE_MENU_LABEL} className={placedClass(menuStyles.panel, menuStyles.down, menu.placement)} onKeyDown={menu.onMenuKeyDown}>
          <CourseItems
            course={course}
            rows={rows}
            onChoose={(next) => {
              onPick(next);
              menu.close();
            }}
          />
          {hydrated && courses.error && (
            <p className={menuStyles.problem} role="alert">
              {coursesProblemLine(workspaceErrorReason(courses.error))}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
