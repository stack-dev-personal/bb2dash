'use client';

/**
 * The material picker (Phase 24b, brief 111, "Attaching from materials"; W-87).
 *
 * A `PopoutShell` dialog (a sheet on a phone) over his current course files,
 * `v_bb_files_current` through `useCurrentFiles()` (the Materials screen's own
 * read; W-88's Sources tab reads the same), grouped by course under each
 * class's code, with a filter field that narrows them by file name as he types
 * and sends nothing. A pick becomes a file chip (`bb_files.id`); a file already
 * attached is shown pressed and cannot be picked twice. The rows come from a
 * cache restored before hydration, so they are read only once hydrated.
 */

import { useState } from 'react';
import { PopoutShell } from '@/components/popout/PopoutShell';
import { fileTitle, useCurrentFiles, type BbFileRow } from '@/lib/queries.materials';
import { useCourseDisplay, type CourseDisplay } from '@/lib/queries.today';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { filterByTitle } from '@/lib/queries.workspace-files';
import { useHydrated } from '@/lib/use-hydrated';
import { courseCodeOf } from '@/lib/workspace-examples';
import {
  ATTACH_FROM_MATERIALS_LABEL,
  ATTACHMENTS_LIMIT_LINE,
  MATERIAL_FILTER_PLACEHOLDER,
  MATERIALS_LOADING_LINE,
  NO_MATERIAL_MATCH_LINE,
  NO_MATERIALS_LINE,
  materialsProblemLine,
} from '@/lib/workspace-labels';
import { LIST_STOPS, handleListKeys } from './menu-keys';
import styles from './MaterialPicker.module.css';

export interface PickedFile {
  id: number;
  title: string;
}

export interface MaterialPickerProps {
  /** The `bb_files.id`s already on a chip. */
  attachedIds: readonly number[];
  /** Five attachments are on chips: the limit line shows. */
  full: boolean;
  onPick: (file: PickedFile) => void;
  onClose: () => void;
}

interface Choice extends PickedFile {
  code: string;
}

/**
 * The files as choices, in the view's order (course, bucket, week, name). A row
 * with no course is left out: the picker lists files by course, and every
 * pulled file has one.
 */
function choicesOf(rows: readonly BbFileRow[], courses: readonly CourseDisplay[]): Choice[] {
  return rows.flatMap((row) =>
    row.course_id === null
      ? []
      : [{ id: row.id, title: fileTitle(row), code: courseCodeOf(row.course_id, courses) }],
  );
}

/** The choices under their course codes, each course once, in first-seen order. */
function byCourse(choices: readonly Choice[]): ReadonlyArray<{ code: string; files: Choice[] }> {
  const codes = [...new Set(choices.map((choice) => choice.code))];
  return codes.map((code) => ({ code, files: choices.filter((choice) => choice.code === code) }));
}

function Groups(props: { choices: readonly Choice[]; attachedIds: readonly number[]; onPick: (file: PickedFile) => void }) {
  return byCourse(props.choices).map(({ code, files }) => (
    <section key={code} className={styles.group}>
      <h3 className={styles.heading}>{code}</h3>
      {files.map((file) => {
        const attached = props.attachedIds.includes(file.id);
        return (
          <button
            key={file.id}
            type="button"
            className={styles.file}
            aria-pressed={attached}
            disabled={attached}
            onClick={() => props.onPick({ id: file.id, title: file.title })}
          >
            {file.title}
          </button>
        );
      })}
    </section>
  ));
}

function Body(props: MaterialPickerProps & { filter: string }) {
  const hydrated = useHydrated();
  const files = useCurrentFiles();
  const courses = useCourseDisplay();
  if (!hydrated || files.isPending) return <p className={styles.line}>{MATERIALS_LOADING_LINE}</p>;
  if (files.error) {
    return (
      <p className={styles.problem} role="alert">
        {materialsProblemLine(workspaceErrorReason(files.error))}
      </p>
    );
  }
  if (files.data.length === 0) return <p className={styles.line}>{NO_MATERIALS_LINE}</p>;
  const shown = filterByTitle(choicesOf(files.data, courses.data ?? []), props.filter);
  if (shown.length === 0) return <p className={styles.line}>{NO_MATERIAL_MATCH_LINE}</p>;
  return <Groups choices={shown} attachedIds={props.attachedIds} onPick={props.onPick} />;
}

export function MaterialPicker(props: MaterialPickerProps) {
  const [filter, setFilter] = useState('');
  return (
    <PopoutShell label={ATTACH_FROM_MATERIALS_LABEL} onClose={props.onClose}>
      <div className={styles.picker} onKeyDown={(event) => handleListKeys(event, LIST_STOPS)}>
        <h2 className={styles.title}>{ATTACH_FROM_MATERIALS_LABEL}</h2>
        <input
          type="search"
          className={styles.search}
          aria-label={MATERIAL_FILTER_PLACEHOLDER}
          placeholder={MATERIAL_FILTER_PLACEHOLDER}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {props.full && <p className={styles.line}>{ATTACHMENTS_LIMIT_LINE}</p>}
        <div className={styles.scroll}>
          <Body {...props} filter={filter} />
        </div>
      </div>
    </PopoutShell>
  );
}
