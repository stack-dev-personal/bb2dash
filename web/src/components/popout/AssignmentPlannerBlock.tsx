'use client';

/**
 * "Your plan" — the one editable block of the assignment detail (R-05).
 *
 * Split out of `AssignmentPopout.tsx` in Phase 12b (T-2) so the popout and the
 * full-details page under the course render the same block rather than two
 * copies of it. Everything here writes `assignment_progress`, which is Stack's
 * own row and is never overwritten by a sync.
 */

import { useEffect, useRef, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import { StatusOptions } from '@/components/tracker/StatusSelect';
import type { ProgressStatus } from '@/lib/queries';
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  useSavePlanner,
  type AssignmentProgress,
  type PlannerPatch,
} from '@/lib/queries.popout';
import { isQueryUnresolved, queryStateText, type QueryLike } from '@/components/shared/QueryState';
import { dueOverrideForm, dueOverrideInstant } from '@/lib/due-override';
import { effectiveDue, type DueFields } from './assignment-detail-format';
import styles from './Popout.module.css';

/** The planner fields, as the form holds them (empty string = cleared). */
export interface PlannerForm {
  due_date: string;
  due_time: string;
  planned_start: string;
  planned_finish: string;
  est_minutes: string;
  notes: string;
}

export const EMPTY_FORM: PlannerForm = {
  due_date: '',
  due_time: '',
  planned_start: '',
  planned_finish: '',
  est_minutes: '',
  notes: '',
};

export function formFrom(progress: AssignmentProgress | null | undefined): PlannerForm {
  if (!progress) return EMPTY_FORM;
  return {
    ...dueOverrideForm(progress.due_override),
    planned_start: progress.planned_start ?? '',
    planned_finish: progress.planned_finish ?? '',
    est_minutes: progress.est_minutes == null ? '' : String(progress.est_minutes),
    notes: progress.notes ?? '',
  };
}

const PLANNER_FIELDS = [
  'due_date',
  'due_time',
  'planned_start',
  'planned_finish',
  'est_minutes',
  'notes',
] as const;

/** Two stored instants name the same moment (or are both unset). */
function sameInstant(a: string | null, b: string | null | undefined): boolean {
  if (a === null || b === null || b === undefined) return a === (b ?? null);
  return Date.parse(a) === Date.parse(b);
}

/**
 * Take the server's values for every field the owner has not touched since
 * their last commit, and keep the owner's text for the ones they have.
 *
 * Returns `current` itself when nothing moved, so a refetch that changes
 * nothing does not re-render the form.
 */
export function mergePlannerForm(
  current: PlannerForm,
  server: PlannerForm,
  dirtyFields: ReadonlySet<keyof PlannerForm>,
): PlannerForm {
  let changed = false;
  const merged: PlannerForm = { ...current };
  for (const key of PLANNER_FIELDS) {
    if (dirtyFields.has(key)) continue;
    if (merged[key] === server[key]) continue;
    merged[key] = server[key];
    changed = true;
  }
  return changed ? merged : current;
}

/** What the block needs of the `assignment_progress` query. */
export interface ProgressQuery extends QueryLike {
  data: AssignmentProgress | null | undefined;
}

export interface AssignmentPlannerBlockProps {
  assignmentId: string;
  progressQ: ProgressQuery;
  /** Blackboard's due facts, for the hint beside Stack's date and its default time. */
  blackboardDue: DueFields;
}

export function AssignmentPlannerBlock({
  assignmentId,
  progressQ,
  blackboardDue,
}: AssignmentPlannerBlockProps) {
  const save = useSavePlanner();

  const [form, setForm] = useState<PlannerForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Fields edited since their last successful commit — the server may not overwrite these. */
  const dirtyFields = useRef<Set<keyof PlannerForm>>(new Set());
  const seededFor = useRef<string | null>(null);

  /**
   * Seed the form when the block switches items, and afterwards merge the
   * server's values only into fields nobody is typing in.
   *
   * Replacing the whole form on every `progressQ.data` identity change wiped
   * whatever was being typed: a blur commit invalidates the row, the refetch
   * returns a new object, and the effect ran again with it.
   */
  useEffect(() => {
    if (seededFor.current !== assignmentId) {
      seededFor.current = assignmentId;
      dirtyFields.current = new Set();
      setForm(formFrom(progressQ.data));
      setSaveError(null);
      return;
    }
    const server = formFrom(progressQ.data);
    setForm((current) => mergePlannerForm(current, server, dirtyFields.current));
  }, [assignmentId, progressQ.data]);

  /** Record that the owner has changed a field, then hold the new text. */
  function editField<K extends keyof PlannerForm>(key: K, value: string) {
    dirtyFields.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  }

  const progress = progressQ.data ?? null;
  const status = progress?.status ?? 'not_started';
  const priority = progress?.priority ?? 'normal';

  function commit(patch: PlannerPatch, onSaved?: () => void) {
    setSaveError(null);
    save.mutate(
      { assignmentId, patch },
      {
        onSuccess: () => onSaved?.(),
        onError: (error) => setSaveError(error instanceof Error ? error.message : 'Save failed.'),
      },
    );
  }

  /**
   * Send a field only when it actually changed, so a blur is not a write. The
   * field stops being dirty once the write has landed — until then the server's
   * copy is the stale one and must not be merged back over it.
   */
  function commitField<K extends keyof PlannerForm>(key: K, current: string) {
    const saved = formFrom(progress)[key];
    if (current === saved) {
      dirtyFields.current.delete(key);
      return;
    }
    if (key === 'due_date' || key === 'due_time') {
      commitDue(key, { ...form, [key]: current });
      return;
    }
    const settle = () => dirtyFields.current.delete(key);
    if (key === 'est_minutes') {
      commit({ est_minutes: current === '' ? null : Number(current) }, settle);
      return;
    }
    if (key === 'notes') {
      commit({ notes: current }, settle);
      return;
    }
    commit({ [key]: current === '' ? null : current } as PlannerPatch, settle);
  }

  /**
   * Save Stack's own due date from the two fields. An empty date clears it;
   * an empty time is 11:59 PM. Only the field that was committed settles: the
   * other may still be mid-edit (tabbing from the date into the time).
   */
  function commitDue(key: 'due_date' | 'due_time', next: Pick<PlannerForm, 'due_date' | 'due_time'>) {
    let instant: string | null;
    try {
      instant = dueOverrideInstant(next);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'That is not a date.');
      return;
    }
    const settle = () => dirtyFields.current.delete(key);
    if (sameInstant(instant, progress?.due_override)) {
      // Nothing to write and no refetch will come, so show the stored value
      // again (a cleared time that resolves to the saved one reads back as it).
      settle();
      const stored = dueOverrideForm(progress?.due_override);
      setForm((f) => ({ ...f, [key]: stored[key] }));
      return;
    }
    commit({ due_override: instant }, settle);
  }

  /** Go back to Blackboard's date. */
  function resetDue() {
    setForm((f) => ({ ...f, due_date: '', due_time: '' }));
    commit({ due_override: null }, () => {
      dirtyFields.current.delete('due_date');
      dirtyFields.current.delete('due_time');
    });
  }

  const due = effectiveDue(blackboardDue, progress?.due_override);

  // The planner block is the owner's own row. Until it has actually been read
  // there is nothing to edit: an enabled empty form would invite a write that
  // silently replaces planner state the screen never managed to load.
  const plannerUnavailable = isQueryUnresolved(progressQ);
  const pending = save.isPending;
  const controlsDisabled = pending || plannerUnavailable;

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <span className={tokens.kicker}>Your plan</span>
        <span className={styles.footerNote}>
          assignment_progress · yours, never overwritten by a sync
        </span>
        <span className={styles.saveState}>
          {pending
            ? 'saving…'
            : (queryStateText(progressQ, 'your plan') ?? (progress ? 'saved' : 'not planned yet'))}
        </span>
      </div>

      {saveError && (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      )}

      <div className={styles.planner}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select
            className={styles.control}
            value={status}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => commit({ status: e.target.value as AssignmentProgress['status'] })}
          >
            <StatusOptions value={status as ProgressStatus} />
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Priority</span>
          <select
            className={styles.control}
            value={priority}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => commit({ priority: e.target.value as AssignmentProgress['priority'] })}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PRIORITY_LABEL[option]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Due date</span>
          <input
            className={styles.control}
            type="date"
            value={form.due_date}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => editField('due_date', e.target.value)}
            onBlur={(e) => commitField('due_date', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Due time</span>
          <input
            className={styles.control}
            type="time"
            value={form.due_time}
            // Not locked while the date's own save is in flight: tabbing from
            // the date to the time starts that save, and a disabled field
            // would drop what is typed next.
            disabled={plannerUnavailable || form.due_date === ''}
            aria-busy={pending}
            onChange={(e) => editField('due_time', e.target.value)}
            onBlur={(e) => commitField('due_time', e.target.value)}
          />
        </label>

        <div className={`${styles.plannerWide} ${styles.dueHint}`}>
          <span>
            {due.overridden ? 'Your date. ' : 'Empty uses Blackboard’s date. '}
            Blackboard: {due.blackboard}
          </span>
          {due.overridden && (
            <button
              type="button"
              className={`${tokens.btn} ${tokens.btnGhost}`}
              disabled={controlsDisabled}
              onClick={resetDue}
            >
              Reset to Blackboard
            </button>
          )}
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Planned start</span>
          <input
            className={styles.control}
            type="date"
            value={form.planned_start}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => editField('planned_start', e.target.value)}
            onBlur={(e) => commitField('planned_start', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Planned finish</span>
          <input
            className={styles.control}
            type="date"
            value={form.planned_finish}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => editField('planned_finish', e.target.value)}
            onBlur={(e) => commitField('planned_finish', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Estimate (minutes)</span>
          <input
            className={styles.control}
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            value={form.est_minutes}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => editField('est_minutes', e.target.value)}
            onBlur={(e) => commitField('est_minutes', e.target.value)}
          />
        </label>

        <label className={`${styles.field} ${styles.plannerWide}`}>
          <span className={styles.fieldLabel}>Notes</span>
          <textarea
            className={styles.textArea}
            value={form.notes}
            disabled={controlsDisabled}
            aria-busy={pending}
            onChange={(e) => editField('notes', e.target.value)}
            onBlur={(e) => commitField('notes', e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
