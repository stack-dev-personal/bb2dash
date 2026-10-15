'use client';

/**
 * The side panel's Sources tab (Phase 24b, task 10; brief 111, "Sources").
 *
 * One answer's source rows (`workspace_sources`, 40 at most), the cited rows
 * first in the order the answer cites them, then the rest by `ord`
 * (`sourcesForPanel`). Each row says its number, its kind, its course, its
 * title, where in the file it sits, whether he attached it or the assistant
 * opened it, and Open:
 *
 *   * a course file opens through `FileOpenAction`, from its row of
 *     `v_bb_files_current` (`useFileRoutes`, PM default R-3); the row names the
 *     page, since whether an opened PDF lands on it is probe Q-2's, at the walk;
 *   * an upload opens through a short signed link of its `storage_key`
 *     (`createSignedUploadUrl`), the way `OpenStoredButton` opens a stored
 *     course file: a blank tab opened inside the press, then pointed at the
 *     link (PM default R-4);
 *   * a remembered item opens the Memory tab;
 *   * the planner feed is an app link to `/planner`.
 *
 * No passage text is shown (24a stores none), and no similarity.
 */

import Link from 'next/link';
import { useState } from 'react';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import type { AnswerBlock } from '@/lib/answer-format';
import { useCurrentFiles, type BbFileRow } from '@/lib/queries.materials';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { createSignedUploadUrl, useWorkspaceUploads } from '@/lib/queries.workspace-files';
import { useWorkspaceSources, type WorkspaceSource } from '@/lib/queries.workspace-sources';
import { useHydrated } from '@/lib/use-hydrated';
import { citedOrdsOf, sourceLocationLine, sourceTarget, sourcesForPanel } from '@/lib/workspace-citations';
import {
  ATTACHED_SOURCE_LABEL,
  NO_ANSWER_PICKED_LINE,
  NO_SOURCES_LINE,
  OPENED_SOURCE_LABEL,
  OPEN_SOURCE_LABEL,
  SOURCES_LOADING_LINE,
  SOURCE_KIND_LABELS,
  openProblemLine,
  sourceChipLabel,
  sourcesProblemLine,
} from '@/lib/workspace-labels';
import tokens from '@/styles/tokens.module.css';
import styles from './SidePanel.module.css';

/** Where the planner lives: the feed's rows come from it. */
const PLANNER_PATH = '/planner';

/** A source row's origin, in words; `auto` (found by the runner's search) says nothing. */
function originLabel(source: WorkspaceSource): string | null {
  if (source.origin === 'attached') return ATTACHED_SOURCE_LABEL;
  if (source.origin === 'tool') return OPENED_SOURCE_LABEL;
  return null;
}

/** A course file's routes, from the current files by id (R-3); null while not read, or not there. */
function useFileRoutes(fileId: number): BbFileRow | null {
  const files = useCurrentFiles();
  return files.data?.find((row) => row.id === fileId) ?? null;
}

function OpenFile({ fileId }: { fileId: number }) {
  const row = useFileRoutes(fileId);
  if (row === null) return null;
  return <FileOpenAction routes={row} action={OPEN_SOURCE_LABEL} className={tokens.btnSecondary} />;
}

/**
 * Open an upload: a short signed link of its key, minted at the press. The new
 * tab is opened inside the press so a pop-up blocker allows it, then pointed at
 * the link, as `OpenStoredButton` does for a stored course file.
 */
function OpenUpload({ documentId }: { documentId: number }) {
  const uploads = useWorkspaceUploads();
  const key = uploads.data?.find((row) => row.id === documentId)?.storage_key ?? null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (key === null) return null;

  async function open(storageKey: string) {
    setError(null);
    setPending(true);
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await createSignedUploadUrl(storageKey);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (failure) {
      tab?.close();
      setError(openProblemLine(workspaceErrorReason(failure)));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={tokens.btnSecondary}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => void open(key)}
      >
        {OPEN_SOURCE_LABEL}
      </button>
      {error !== null && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function OpenAction({ source, onMemory }: { source: WorkspaceSource; onMemory: () => void }) {
  const target = sourceTarget(source);
  switch (target?.kind) {
    case 'file':
      return <OpenFile fileId={target.fileId} />;
    case 'upload':
      return <OpenUpload documentId={target.documentId} />;
    case 'memory':
      return (
        <button type="button" className={tokens.btnSecondary} onClick={onMemory}>
          {OPEN_SOURCE_LABEL}
        </button>
      );
    case 'planner':
      return (
        <Link href={PLANNER_PATH} className={tokens.btnSecondary}>
          {OPEN_SOURCE_LABEL}
        </Link>
      );
    default:
      return null;
  }
}

function SourceRow({ source, onMemory }: { source: WorkspaceSource; onMemory: () => void }) {
  const facts = [SOURCE_KIND_LABELS[source.kind], source.course_id, sourceLocationLine(source), originLabel(source)];
  return (
    <li className={styles.row} data-source-row={source.ord}>
      <span className={styles.ord} aria-label={sourceChipLabel(source.ord)}>
        {source.ord}
      </span>
      <div className={styles.rowText}>
        {source.title !== null && <span className={styles.rowTitle}>{source.title}</span>}
        <span className={styles.rowFacts}>{facts.filter((fact) => fact !== null).join(' · ')}</span>
      </div>
      <div className={styles.rowActions}>
        <OpenAction source={source} onMemory={onMemory} />
      </div>
    </li>
  );
}

export interface SourcesTabProps {
  /** The answer whose sources are listed; null when none is picked. */
  requestId: number | null;
  /** That answer's blocks, for the cited order. */
  blocks: readonly AnswerBlock[];
  /** A remembered item's Open: the Memory tab. */
  onMemory: () => void;
}

export function SourcesTab({ requestId, blocks, onMemory }: SourcesTabProps) {
  const hydrated = useHydrated();
  const sources = useWorkspaceSources(requestId);

  if (requestId === null) return <p className={styles.line}>{NO_ANSWER_PICKED_LINE}</p>;
  if (!hydrated || (sources.data === undefined && !sources.error)) {
    return <p className={styles.line}>{SOURCES_LOADING_LINE}</p>;
  }
  if (sources.error) {
    return (
      <p className={styles.problem} role="alert">
        {sourcesProblemLine(workspaceErrorReason(sources.error))}
      </p>
    );
  }
  const rows = sources.data ?? [];
  if (rows.length === 0) return <p className={styles.line}>{NO_SOURCES_LINE}</p>;
  const ordered = sourcesForPanel(rows, citedOrdsOf(blocks, rows));

  return (
    <ul className={styles.rows} data-request-id={requestId}>
      {ordered.map((source) => (
        <SourceRow key={source.ord} source={source} onMemory={onMemory} />
      ))}
    </ul>
  );
}
