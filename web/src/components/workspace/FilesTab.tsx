'use client';

/**
 * The side panel's Files tab (Phase 24b, task 10; brief 111, "Uploading from
 * his device", "Deleting an upload, in 24a's two steps", "The index status
 * line").
 *
 * His uploads, newest first (`workspace_documents`, re-read every 5 s while one
 * is settling), each with its title and its state in words (`data-upload-state`),
 * the reason of a failed one, and its controls:
 *
 *   * TRY AGAIN on a `failed` row signs a new link and calls the retry
 *     (`retryUploadLink`); on a `deleting` row ("Removing", a delete that did
 *     not finish) it runs the delete's steps again (`removeUpload`);
 *   * DELETE takes two presses: the first turns it into "Press again to
 *     delete", the second runs `removeUpload`'s steps (out of search, the
 *     object removed, the row dropped). A failure leaves the row `deleting`,
 *     with Try again. The line under it says what a delete does and does not do.
 *
 * The filter field narrows the rows already on the page by title as he types,
 * and sends nothing. Under the list, the index status (`v_workspace_index_status`):
 * one line per kind and when a course file was last indexed, from the row's
 * counts alone (PM default R-5 for the date's words).
 *
 * Not built here (the brief's cut order, Risks): renaming an upload and tagging
 * it with a course. Both writes exist in the data layer (`setUploadTitle`,
 * `setUploadCourse`).
 *
 * `TwoStepDelete` and `FilterField` are shared with the Memory tab.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { relativeTime } from '@/lib/queries.sync';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import {
  filterByTitle,
  removeUpload,
  retryUploadLink,
  useWorkspaceUploads,
  workspaceFileKeys,
  type WorkspaceDocument,
} from '@/lib/queries.workspace-files';
import { indexStatusLines, useWorkspaceIndexStatus, workspaceMemoryKeys } from '@/lib/queries.workspace-memory';
import { useHydrated } from '@/lib/use-hydrated';
import {
  CONFIRM_DELETE_LABEL,
  DELETE_LABEL,
  DOCUMENT_STATE_LABELS,
  FILTER_PLACEHOLDER,
  INDEX_STATUS_HEADING,
  NO_UPLOADS_LINE,
  NO_UPLOAD_MATCH_LINE,
  TRY_AGAIN_LABEL,
  UPLOAD_DELETE_NOTE,
  UPLOAD_ERROR_SENTENCES,
  filesProblemLine,
  indexStatusProblemLine,
  removeProblemLine,
  uploadProblemLine,
} from '@/lib/workspace-labels';
import tokens from '@/styles/tokens.module.css';
import styles from './SidePanel.module.css';

/* ---------------------------------------------------------------------------
 * Shared with the Memory tab
 * ------------------------------------------------------------------------ */

/** The filter field: it narrows the rows on the page by title, and sends nothing. */
export function FilterField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="search"
      className={styles.filter}
      placeholder={FILTER_PLACEHOLDER}
      aria-label={FILTER_PLACEHOLDER}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

/** Delete in two presses: the first asks again, the second deletes. A note under it says what it does. */
export function TwoStepDelete(props: { busy: boolean; note: string; describedBy: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className={styles.delete}>
      <button
        type="button"
        className={tokens.btnSecondary}
        disabled={props.busy}
        aria-busy={props.busy || undefined}
        aria-describedby={props.describedBy}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          props.onDelete();
        }}
      >
        {armed ? CONFIRM_DELETE_LABEL : DELETE_LABEL}
      </button>
      <p className={styles.note}>{props.note}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One upload
 * ------------------------------------------------------------------------ */

/** Delete and Try again on one upload, each re-reading the list and the index status when it settles. */
function useUploadActions(document: WorkspaceDocument) {
  const queryClient = useQueryClient();
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: workspaceFileKeys.uploads() });
    void queryClient.invalidateQueries({ queryKey: workspaceMemoryKeys.indexStatus() });
  };
  const remove = useMutation({ mutationFn: () => removeUpload(document), onSettled: settle });
  const retry = useMutation({ mutationFn: () => retryUploadLink(document), onSettled: settle });
  return { remove, retry, busy: remove.isPending || retry.isPending };
}

function UploadRow({ document }: { document: WorkspaceDocument }) {
  const { remove, retry, busy } = useUploadActions(document);
  const titleId = `upload-${document.id}-title`;
  const failed = document.state === 'failed';
  const removing = document.state === 'deleting';

  return (
    <li className={styles.row} data-upload-state={document.state}>
      <div className={styles.rowText}>
        <span id={titleId} className={styles.rowTitle}>
          {document.title}
        </span>
        <span className={styles.rowFacts}>{DOCUMENT_STATE_LABELS[document.state]}</span>
        {failed && document.error_code !== null && (
          <span className={styles.rowReason}>{UPLOAD_ERROR_SENTENCES[document.error_code]}</span>
        )}
        {remove.error && <span className={styles.problem}>{removeProblemLine(workspaceErrorReason(remove.error))}</span>}
        {retry.error && <span className={styles.problem}>{uploadProblemLine(workspaceErrorReason(retry.error))}</span>}
      </div>
      <div className={styles.rowActions}>
        {(failed || removing) && (
          <button
            type="button"
            className={tokens.btnSecondary}
            disabled={busy}
            aria-describedby={titleId}
            onClick={() => (removing ? remove.mutate() : retry.mutate())}
          >
            {TRY_AGAIN_LABEL}
          </button>
        )}
        {!removing && (
          <TwoStepDelete busy={busy} note={UPLOAD_DELETE_NOTE} describedBy={titleId} onDelete={() => remove.mutate()} />
        )}
      </div>
    </li>
  );
}

function Uploads({ filter }: { filter: string }) {
  const uploads = useWorkspaceUploads();
  if (uploads.error) {
    return (
      <p className={styles.problem} role="alert">
        {filesProblemLine(workspaceErrorReason(uploads.error))}
      </p>
    );
  }
  if (uploads.data === undefined) return null;
  if (uploads.data.length === 0) return <p className={styles.line}>{NO_UPLOADS_LINE}</p>;
  const shown = filterByTitle(uploads.data, filter);
  if (shown.length === 0) return <p className={styles.line}>{NO_UPLOAD_MATCH_LINE}</p>;
  return (
    <ul className={styles.rows}>
      {shown.map((document) => (
        <UploadRow key={document.id} document={document} />
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * The index status
 * ------------------------------------------------------------------------ */

function IndexStatus({ now }: { now: number }) {
  const status = useWorkspaceIndexStatus();
  let body: ReactNode = null;
  if (status.error) {
    body = (
      <p className={styles.problem} role="alert">
        {indexStatusProblemLine(workspaceErrorReason(status.error))}
      </p>
    );
  } else if (status.data) {
    const last = status.data.course_last_embedded;
    const words = last === null ? null : relativeTime(last, new Date(now));
    body = (
      <ul className={styles.statusLines}>
        {indexStatusLines(status.data, words).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    );
  }
  return (
    <section className={styles.status} aria-label={INDEX_STATUS_HEADING} data-index-status>
      <h3 className={styles.subheading}>{INDEX_STATUS_HEADING}</h3>
      {body}
    </section>
  );
}

export function FilesTab({ now }: { now: number }) {
  const hydrated = useHydrated();
  const [filter, setFilter] = useState('');
  return (
    <div className={styles.tabBody}>
      <FilterField value={filter} onChange={setFilter} />
      {hydrated && <Uploads filter={filter} />}
      {hydrated && <IndexStatus now={now} />}
    </div>
  );
}
