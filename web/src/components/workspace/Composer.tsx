'use client';

/**
 * The composer (Phase 21, task 16; rewritten for Phase 24b, brief 111, task 7,
 * W-87, to the frozen `ComposerProps` of ruling C-1).
 *
 * A text box over one row: the plus menu, the dashed course chip, the routine
 * chip and the attachment chips, then the depth menu and Ask. The composer owns
 * its chips and its ask: it restores the course and the routine from the last
 * request's options row, sends the question through `workspace_ask_with` with
 * the six options (`format` always `rich`), and says every sentence about the
 * question under the box: the refusals, the routine's need, an upload not yet
 * indexed, the limit of five, an upload's refusal or failure. The owner hears
 * of an accepted question through `onAsked` and of any other failure through
 * `onAskError`.
 *
 * Enter asks and Shift+Enter breaks the line; while a request is open the
 * button reads Stop and Enter sends nothing (the PM's ruling U1). Backspace in
 * an empty box removes the last chip. Ask is disabled (Phase 22's flat grey
 * pill) while a question or a Stop is on its way, when the conversation was not
 * found, and while a routine's need is unmet or an attached upload is not yet
 * indexed (Round 2, W-4), the last two saying why in one line under the box,
 * which is the button's description. After a Stop and after an answer it is
 * enabled again (amendment (h)). Deep applies to one question: after it the menu reads Auto again.
 * After an accepted question the box and the attachments are cleared.
 *
 * A file can be dropped on the composer, and the plus menu opens the file
 * input; both go through `use-composer-uploads.ts`. The input takes the six
 * types of `WORKSPACE_UPLOAD_TYPES`.
 */

import { useId, useRef, useState, type DragEvent, type KeyboardEvent, type Ref } from 'react';
import type { ComposerProps } from './composer-contract';
import { WORKSPACE_UPLOAD_TYPES } from '@/lib/workspace-upload-rules';
import { ASK_LABEL, QUESTION_FIELD_LABEL, QUESTION_PLACEHOLDER, STOP_LABEL } from '@/lib/workspace-labels';
import { MaterialPicker } from './MaterialPicker';
import { PlusMenu } from './PlusMenu';
import { CourseMenu } from './CourseMenu';
import { DepthMenu } from './DepthMenu';
import { ChipRow, ComposerLines } from './ComposerParts';
import { useComposerModel, type ComposerModel } from './use-composer-model';
import styles from './Composer.module.css';

/** How tall the box starts, in lines. */
const QUESTION_ROWS = 3;

/** What the file input offers: the six extensions the upload rules take. */
const ACCEPTED_TYPES = WORKSPACE_UPLOAD_TYPES.map((type) => `.${type.extension}`).join(',');

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** The composer as a drop target for files from his device. */
function useDropTarget(model: ComposerModel, disabled: boolean) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (event: DragEvent<HTMLElement>) => {
        setDragging(false);
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        model.addFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}

function onBoxKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, model: ComposerModel, requestOpen: boolean) {
  if (event.key === 'Backspace' && model.text === '') {
    model.removeLastChip();
    return;
  }
  // Shift+Enter is the browser's new line. Enter while an input method is composing picks a candidate.
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
  // Enter is the page's key in every state, so it never adds a line. While a request is open it sends nothing.
  event.preventDefault();
  if (requestOpen) return;
  void model.submit();
}

function AskButton({ props, model, gateId }: { props: ComposerProps; model: ComposerModel; gateId: string }) {
  const gated = !props.requestOpen && model.gate !== null;
  return (
    <button
      type="button"
      className={styles.ask}
      disabled={props.busy || model.pending || props.disabled || gated}
      aria-describedby={gated ? gateId : undefined}
      onClick={() => (props.requestOpen ? props.onStop() : void model.submit())}
    >
      {props.requestOpen ? STOP_LABEL : ASK_LABEL}
    </button>
  );
}

/** The hidden file input the plus menu opens; it takes the six types of the upload rules. */
function FileInput({ ref, onFiles }: { ref: Ref<HTMLInputElement>; onFiles: (files: readonly File[]) => void }) {
  return (
    <input
      ref={ref}
      type="file"
      hidden
      multiple
      accept={ACCEPTED_TYPES}
      aria-hidden="true"
      tabIndex={-1}
      onChange={(event) => {
        onFiles(Array.from(event.target.files ?? []));
        event.target.value = '';
      }}
    />
  );
}

export function Composer(props: ComposerProps) {
  const model = useComposerModel(props);
  const drop = useDropTarget(model, props.disabled);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const gateId = useId();

  return (
    <div className={drop.dragging ? styles.dragging : styles.composer} data-drop-target {...drop.handlers}>
      <textarea
        className={styles.box}
        aria-label={QUESTION_FIELD_LABEL}
        placeholder={QUESTION_PLACEHOLDER}
        rows={QUESTION_ROWS}
        disabled={props.disabled}
        value={model.text}
        onChange={(event) => model.changeText(event.target.value)}
        onKeyDown={(event) => onBoxKeyDown(event, model, props.requestOpen)}
      />
      <div className={styles.bar}>
        <PlusMenu
          disabled={props.disabled}
          onAttachFromMaterials={model.openPicker}
          onUploadFromDevice={() => fileInput.current?.click()}
          onPickRoutine={(routine) => model.pickRoutine(routine.id)}
        />
        <CourseMenu course={model.choices.course} onPick={model.pickCourse} disabled={props.disabled} />
        <ChipRow model={model} />
        <span className={styles.end}>
          <DepthMenu depth={model.depth} onPick={model.pickDepth} disabled={props.disabled} />
          <AskButton props={props} model={model} gateId={gateId} />
        </span>
      </div>
      <ComposerLines model={model} requestOpen={props.requestOpen} gateId={gateId} />
      <FileInput ref={fileInput} onFiles={model.addFiles} />
      {model.pickerOpen && (
        <MaterialPicker
          attachedIds={model.fileIds}
          full={model.full}
          onPick={model.pickFile}
          onClose={model.closePicker}
        />
      )}
    </div>
  );
}
