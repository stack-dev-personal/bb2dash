/**
 * What the composer has chosen for the next question, and the pure rules over
 * it (Phase 24b, brief 111, "The composer"; W-87).
 *
 * The chips are the course, the routine and up to five attachments: files from
 * his materials (`bb_files.id`) and uploads from his device
 * (`workspace_documents.id`, null while the upload is on its way). The depth is
 * not a chip and lives in `depth-store.ts`, for the life of the page. Every update
 * returns a new object; nothing here mutates what it is given.
 */

import {
  DEFAULT_ASK_OPTIONS,
  WORKSPACE_ATTACHMENTS_MAX,
  type WorkspaceAskOptions,
  type WorkspaceDepth,
} from '@/lib/queries.workspace-ask';
import type { WorkspaceDocument, WorkspaceDocumentState } from '@/lib/queries.workspace-files';
import { routineNeedLine, type WorkspaceRoutine } from '@/lib/queries.workspace-routines';
import { UPLOAD_ERROR_SENTENCES, UPLOAD_NOT_READY_LINE, uploadFailedAttachedLine } from '@/lib/workspace-labels';

export type ComposerAttachment =
  | { kind: 'file'; key: string; id: number; title: string }
  | { kind: 'upload'; key: string; id: number | null; title: string; state: WorkspaceDocumentState | null };

export interface ComposerChoices {
  /** A `v_course_display.display_id`, or null for all courses. */
  course: string | null;
  /** A `workspace_routines.id`. */
  routine: string | null;
  attachments: readonly ComposerAttachment[];
}

export const START_CHOICES: ComposerChoices = Object.freeze({
  course: DEFAULT_ASK_OPTIONS.course,
  routine: DEFAULT_ASK_OPTIONS.routine,
  attachments: Object.freeze([]) as readonly ComposerAttachment[],
});

export function fileKey(id: number): string {
  return `file:${id}`;
}

export function uploadKey(id: number): string {
  return `upload:${id}`;
}

/**
 * The options to ask with. A routine the routine rows no longer hold is sent as
 * none (its chip is not shown either); while the rows are still being read the
 * choice is sent as it is and the database judges it.
 */
export function askOptionsOf(
  choices: ComposerChoices,
  depth: WorkspaceDepth,
  routines: readonly WorkspaceRoutine[] | undefined,
): WorkspaceAskOptions {
  const routineGone = routines !== undefined && !routines.some((row) => row.id === choices.routine);
  return {
    course: choices.course,
    depth,
    routine: routineGone ? null : choices.routine,
    format: 'rich',
    files: choices.attachments.flatMap((item) => (item.kind === 'file' ? [item.id] : [])),
    uploads: choices.attachments.flatMap((item) => (item.kind === 'upload' && item.id !== null ? [item.id] : [])),
  };
}

/** After an accepted question the attachments go; the course and routine stay (the depth: `depth-store.ts`). */
export function afterAsk(choices: ComposerChoices): ComposerChoices {
  return { ...choices, attachments: [] };
}

/** Backspace in an empty box: the last attachment, else the routine, else the course. */
export function withoutLastChip(choices: ComposerChoices): ComposerChoices {
  if (choices.attachments.length > 0) return { ...choices, attachments: choices.attachments.slice(0, -1) };
  if (choices.routine !== null) return { ...choices, routine: null };
  if (choices.course !== null) return { ...choices, course: null };
  return choices;
}

export function isFull(choices: ComposerChoices): boolean {
  return choices.attachments.length >= WORKSPACE_ATTACHMENTS_MAX;
}

/** One more attachment; the same choices when it is already attached or five are. */
export function withAttachment(choices: ComposerChoices, attachment: ComposerAttachment): ComposerChoices {
  if (isFull(choices) || choices.attachments.some((item) => item.key === attachment.key)) return choices;
  return { ...choices, attachments: [...choices.attachments, attachment] };
}

export function withoutAttachment(choices: ComposerChoices, key: string): ComposerChoices {
  return { ...choices, attachments: choices.attachments.filter((item) => item.key !== key) };
}

/**
 * The chip `key` becomes `next`: an upload on its way becomes its row. When
 * that row is already attached under its own key the chip on its way just goes.
 */
export function replacingAttachment(
  choices: ComposerChoices,
  key: string,
  next: ComposerAttachment,
): ComposerChoices {
  if (choices.attachments.some((item) => item.key === next.key)) return withoutAttachment(choices, key);
  return { ...choices, attachments: choices.attachments.map((item) => (item.key === key ? next : item)) };
}

/** An upload chip's state: its row's as last read, else the state its upload returned; null on its way. */
export function uploadStateOf(
  attachment: ComposerAttachment,
  rows: readonly WorkspaceDocument[] | undefined,
): WorkspaceDocumentState | null {
  if (attachment.kind !== 'upload' || attachment.id === null) return null;
  return rows?.find((row) => row.id === attachment.id)?.state ?? attachment.state;
}

/**
 * Why Ask sends nothing, or null: the routine's need first (its line names the
 * routine), then an attached upload that failed (with its reason), then one that
 * is not yet indexed.
 */
export function askGateLine(
  choices: ComposerChoices,
  routine: WorkspaceRoutine | null,
  uploads: readonly WorkspaceDocument[] | undefined,
): string | null {
  if (routine !== null) {
    const need = routineNeedLine(routine, { attachments: choices.attachments.length, course: choices.course });
    if (need !== null) return need;
  }
  const failed = failedUploadOf(choices, uploads);
  if (failed !== undefined) return failedLineOf(failed);
  const notReady = choices.attachments.some(
    (item) => item.kind === 'upload' && uploadStateOf(item, uploads) !== 'indexed',
  );
  return notReady ? UPLOAD_NOT_READY_LINE : null;
}

/** The first attached upload whose row is `failed`, as last read. */
function failedUploadOf(
  choices: ComposerChoices,
  uploads: readonly WorkspaceDocument[] | undefined,
): WorkspaceDocument | undefined {
  const ids = choices.attachments.flatMap((item) => (item.kind === 'upload' && item.id !== null ? [item.id] : []));
  return uploads?.find((row) => row.state === 'failed' && ids.includes(row.id));
}

/** A failed upload says so with its reason (Round 3, W-6), never that it is still being read. */
function failedLineOf(row: WorkspaceDocument): string {
  return uploadFailedAttachedLine(row.error_code === null ? null : UPLOAD_ERROR_SENTENCES[row.error_code]);
}
