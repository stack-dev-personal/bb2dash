'use client';

/**
 * Two parts of the composer (Phase 24b, brief 111, task 7; W-87): the chips
 * after the course chip (the routine, then the attachments in the order they
 * were added), and the lines under the box.
 */

import type { WorkspaceDocument } from '@/lib/queries.workspace-files';
import {
  ATTACHMENTS_LIMIT_LINE,
  DOCUMENT_STATE_LABELS,
  TRY_AGAIN_LABEL,
  UPLOADING_LABEL,
  attachmentChipLabel,
  routineChipLabel,
} from '@/lib/workspace-labels';
import { Chip, ChipAction } from './Chip';
import { uploadStateOf, type ComposerAttachment } from './composer-choices';
import type { ComposerModel } from './use-composer-model';
import styles from './Composer.module.css';

function AttachmentChip({ item, model }: { item: ComposerAttachment; model: ComposerModel }) {
  const remove = () => model.removeAttachment(item.key);
  if (item.kind === 'file') {
    return (
      <Chip kind="file" label={attachmentChipLabel(item.title)} onRemove={remove}>
        {item.title}
      </Chip>
    );
  }
  const row: WorkspaceDocument | undefined =
    item.id === null ? undefined : model.uploadRows?.find((candidate) => candidate.id === item.id);
  const state = uploadStateOf(item, model.uploadRows);
  const title = row?.title ?? item.title;
  return (
    <Chip
      kind="upload"
      label={attachmentChipLabel(title)}
      uploadState={state ?? undefined}
      stateLine={state === null ? UPLOADING_LABEL : DOCUMENT_STATE_LABELS[state]}
      action={
        row?.state === 'failed' ? (
          <ChipAction label={TRY_AGAIN_LABEL} onPress={() => model.retryUpload(row)} />
        ) : undefined
      }
      onRemove={remove}
    >
      {title}
    </Chip>
  );
}

export function ChipRow({ model }: { model: ComposerModel }) {
  const { routineRow } = model;
  return (
    <>
      {routineRow !== null && (
        <Chip kind="routine" label={routineChipLabel(routineRow.title)} onRemove={model.removeRoutine}>
          {routineRow.title}
        </Chip>
      )}
      {model.choices.attachments.map((item) => (
        <AttachmentChip key={item.key} item={item} model={model} />
      ))}
    </>
  );
}

/**
 * Under the box: a refused question and each failure, said as they happen; the
 * limit of five; and why Ask sends nothing, which Ask names as its description.
 */
export function ComposerLines({ model, requestOpen, gateId }: { model: ComposerModel; requestOpen: boolean; gateId: string }) {
  const lines = [...(model.refusal === null ? [] : [model.refusal]), ...model.problems];
  return (
    <>
      {lines.map((line) => (
        <p key={line} className={styles.refusal} role="alert">
          {line}
        </p>
      ))}
      {model.limitHit && (
        <p className={styles.note} role="status">
          {ATTACHMENTS_LIMIT_LINE}
        </p>
      )}
      {!requestOpen && model.gate !== null && (
        <p id={gateId} className={styles.note}>
          {model.gate}
        </p>
      )}
    </>
  );
}
