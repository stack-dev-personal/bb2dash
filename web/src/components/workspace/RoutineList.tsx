'use client';

/**
 * The routine list (Phase 24b, brief 111, "Routines"; W-87): a search field,
 * the enabled routines under their group headings (study, plan, write), each
 * with its one-line description. A pick becomes the composer's routine chip.
 *
 * It reads `workspace_routines` through `useWorkspaceRoutines()`, whose select
 * list is `ROUTINE_COLUMNS` and never the instructions. The rows come from a
 * cache restored before hydration, so they are read only once hydrated; while
 * they are still being read the list shows its field alone.
 */

import { useEffect, useRef, useState } from 'react';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import {
  filterRoutines,
  routinesByGroup,
  useWorkspaceRoutines,
  type WorkspaceRoutine,
} from '@/lib/queries.workspace-routines';
import { useHydrated } from '@/lib/use-hydrated';
import { NO_ROUTINE_MATCH_LINE, ROUTINE_FILTER_PLACEHOLDER, routinesProblemLine } from '@/lib/workspace-labels';
import { LIST_STOPS, handleListKeys } from './menu-keys';
import styles from './RoutineList.module.css';

export interface RoutineListProps {
  onPick: (routine: WorkspaceRoutine) => void;
  /** Close the list and hand focus back; absent in a sheet, where `PopoutShell` takes Esc. */
  onEscape?: () => void;
}

function Groups({ rows, onPick }: { rows: readonly WorkspaceRoutine[]; onPick: (routine: WorkspaceRoutine) => void }) {
  return routinesByGroup(rows).map(({ group, heading, routines }) => (
    <section key={group} className={styles.group}>
      <h3 className={styles.heading}>{heading}</h3>
      {routines.map((routine) => (
        <button key={routine.id} type="button" className={styles.option} onClick={() => onPick(routine)}>
          <span className={styles.title}>{routine.title}</span>
          <span className={styles.description}>{routine.description}</span>
        </button>
      ))}
    </section>
  ));
}

export function RoutineList({ onPick, onEscape }: RoutineListProps) {
  const hydrated = useHydrated();
  const routines = useWorkspaceRoutines();
  const [filter, setFilter] = useState('');
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const rows = hydrated ? routines.data : undefined;
  const shown = rows === undefined ? [] : filterRoutines(rows, filter);

  return (
    <div className={styles.routines} onKeyDown={(event) => handleListKeys(event, LIST_STOPS, onEscape)}>
      <input
        ref={field}
        type="search"
        className={styles.search}
        aria-label={ROUTINE_FILTER_PLACEHOLDER}
        placeholder={ROUTINE_FILTER_PLACEHOLDER}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className={styles.scroll}>
        {hydrated && routines.error ? (
          <p className={styles.problem} role="alert">
            {routinesProblemLine(workspaceErrorReason(routines.error))}
          </p>
        ) : rows !== undefined && shown.length === 0 ? (
          <p className={styles.empty}>{NO_ROUTINE_MATCH_LINE}</p>
        ) : (
          <Groups rows={shown} onPick={onPick} />
        )}
      </div>
    </div>
  );
}
