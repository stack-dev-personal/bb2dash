'use client';

/**
 * Everything the composer shows and does, in one model (Phase 24b, brief 111,
 * task 7; W-87). `Composer.tsx` renders it; the hooks of `use-composer.ts` and
 * `use-composer-uploads.ts` and the pure rules of `composer-choices.ts` do the
 * work. Rows read from the cache restored before hydration (routines, uploads)
 * are used only once `useHydrated()` is true.
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ComposerProps } from './composer-contract';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import type { WorkspaceDepth } from '@/lib/queries.workspace-ask';
import { useWorkspaceUploads, type WorkspaceDocument } from '@/lib/queries.workspace-files';
import { useWorkspaceRoutines, type WorkspaceRoutine } from '@/lib/queries.workspace-routines';
import { useHydrated } from '@/lib/use-hydrated';
import { filesProblemLine, optionsProblemLine } from '@/lib/workspace-labels';
import {
  START_CHOICES,
  afterAsk,
  askGateLine,
  askOptionsOf,
  fileKey,
  isFull,
  withAttachment,
  withoutAttachment,
  withoutLastChip,
  type ComposerChoices,
} from './composer-choices';
import type { PickedFile } from './MaterialPicker';
import { depthAfterAsk, setComposerDepth, useComposerDepth } from './depth-store';
import { useComposerUploads } from './use-composer-uploads';
import { useBoxText, useComposerAsk, useRestoredChoices, useRoutineRequestApplied } from './use-composer';

export interface ComposerModel {
  text: string;
  changeText: (text: string) => void;
  choices: ComposerChoices;
  /** The depth menu's pick, kept for the life of the page (`depth-store.ts`). */
  depth: WorkspaceDepth;
  /** The routine chip's row, once the routines are read; null with no routine or one the rows lack. */
  routineRow: WorkspaceRoutine | null;
  uploadRows: readonly WorkspaceDocument[] | undefined;
  /** Why Ask sends nothing, or null. */
  gate: string | null;
  pending: boolean;
  /** The refused question's sentence, or null. */
  refusal: string | null;
  /** Failed reads and uploads, each worded by its problem line. */
  problems: readonly string[];
  limitHit: boolean;
  full: boolean;
  fileIds: readonly number[];
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  pickFile: (file: PickedFile) => void;
  pickCourse: (course: string | null) => void;
  pickDepth: (depth: WorkspaceDepth) => void;
  pickRoutine: (routineId: string) => void;
  removeRoutine: () => void;
  removeAttachment: (key: string) => void;
  removeLastChip: () => void;
  addFiles: (files: readonly File[]) => void;
  retryUpload: (row: WorkspaceDocument) => void;
  submit: () => Promise<void>;
}

type SetChoices = Dispatch<SetStateAction<ComposerChoices>>;

/** The chips, picked and removed. A pick past the fifth attachment says the limit line instead. */
function useChipActions(choices: ComposerChoices, setChoices: SetChoices) {
  const [limitHit, setLimitHit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function pickFile(file: PickedFile) {
    setPickerOpen(false);
    if (isFull(choices)) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    setChoices((current) => withAttachment(current, { kind: 'file', key: fileKey(file.id), ...file }));
  }

  return {
    limitHit,
    setLimitHit,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    pickFile,
    pickCourse: (course: string | null) => setChoices((current) => ({ ...current, course })),
    pickDepth: setComposerDepth,
    pickRoutine: (routine: string) => setChoices((current) => ({ ...current, routine })),
    removeRoutine: () => setChoices((current) => ({ ...current, routine: null })),
    removeAttachment: (key: string) => {
      setLimitHit(false);
      setChoices((current) => withoutAttachment(current, key));
    },
    removeLastChip: () => {
      setLimitHit(false);
      setChoices(withoutLastChip);
    },
  };
}

function problemsOf(input: {
  hydrated: boolean;
  optionsError: unknown;
  uploadsError: unknown;
  uploadProblem: string | null;
  hasUploads: boolean;
}): string[] {
  const lines: string[] = [];
  if (input.uploadProblem !== null) lines.push(input.uploadProblem);
  if (input.hydrated && input.optionsError) lines.push(optionsProblemLine(workspaceErrorReason(input.optionsError)));
  if (input.hydrated && input.hasUploads && input.uploadsError) {
    lines.push(filesProblemLine(workspaceErrorReason(input.uploadsError)));
  }
  return lines;
}

/** The routine and upload rows the chips read, once hydrated. */
function useChipRows(hydrated: boolean, choices: ComposerChoices) {
  const routines = useWorkspaceRoutines();
  const uploads = useWorkspaceUploads();
  const routineRows = hydrated ? routines.data : undefined;
  const uploadRows = hydrated ? uploads.data : undefined;
  return {
    routineRows,
    uploadRows,
    routineRow: routineRows?.find((row) => row.id === choices.routine) ?? null,
    uploadsError: uploads.error,
  };
}

export function useComposerModel(props: ComposerProps): ComposerModel {
  const hydrated = useHydrated();
  const [text, setText] = useBoxText(props.initialText);
  const [choices, setChoices] = useState<ComposerChoices>(START_CHOICES);
  const depth = useComposerDepth();
  const optionsError = useRestoredChoices(props.conversationId, props.requestIds, hydrated, setChoices);
  useRoutineRequestApplied(setChoices);
  const rows = useChipRows(hydrated, choices);
  const asking = useComposerAsk(props);
  const chips = useChipActions(choices, setChoices);
  const onLimit = () => chips.setLimitHit(true);
  const uploading = useComposerUploads({ course: choices.course, attached: choices.attachments.length, update: setChoices, onLimit });
  const gate = askGateLine(choices, rows.routineRow, rows.uploadRows);
  const hasUploads = choices.attachments.some((item) => item.kind === 'upload');

  async function submit() {
    if (props.busy || props.disabled || asking.pending || gate !== null) return;
    chips.setLimitHit(false);
    if (await asking.ask(text, askOptionsOf(choices, depth, rows.routineRows))) {
      setText('');
      setChoices(afterAsk);
      setComposerDepth(depthAfterAsk(depth));
    }
  }

  function changeText(next: string) {
    setText(next);
    asking.clearRefusal();
    uploading.clearProblem();
    props.onEdit();
  }

  return {
    ...chips,
    ...rows,
    text,
    changeText,
    choices,
    depth,
    gate,
    pending: asking.pending,
    refusal: asking.refusal?.message ?? null,
    problems: problemsOf({ hydrated, optionsError, uploadsError: rows.uploadsError, uploadProblem: uploading.problem, hasUploads }),
    full: isFull(choices),
    fileIds: choices.attachments.flatMap((item) => (item.kind === 'file' ? [item.id] : [])),
    addFiles: uploading.addFiles,
    retryUpload: (row) => void uploading.retry(row),
    submit,
  };
}
