'use client';

/**
 * The Proposed box of an open proposal card, which Stack may edit before he approves (W-106; his
 * words: a grey "edit" on hover that works as a button, turns white on hover, makes the box
 * editable, and clicking off resets it unless it was submitted).
 *
 * DISPLAY: the heading ("Proposed", or "Proposed · edited by you" with Reset once a draft is kept),
 * the value in the planner's words, and a small "edit" text button in the box's top-right corner that
 * shows on hover and on keyboard focus (always, on a device with no hover; the CSS decides).
 *
 * EDITING: the field's own editor (a select of the six statuses, a date input, a note box with a
 * live count), with the focus in it. Enter (Ctrl/Cmd+Enter in a note) or Save checks the value
 * (`checkDraft`, 204's rules and "not what the planner has") and keeps it as this card's draft; a
 * value that fails is said inline and the box stays in edit mode. Escape, or the focus leaving the
 * box, drops what was typed and shows the box as it was. Nothing is written: Approve sends the draft.
 *
 * Every string is a text node.
 */

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import tokens from '@/styles/tokens.module.css';
import {
  EDITED_HEADING_SUFFIX,
  EDIT_WORD,
  FIELD_SAVE_HINT,
  NOTE_SAVE_HINT,
  RESET_WORD,
  SAVE_WORD,
  checkDraft,
  editLabel,
  editorLabel,
  editorTextOf,
  noteCountWords,
  resetLabel,
  saveLabel,
} from '@/lib/proposal-draft';
import { OFFERED_STATUSES, statusLabel } from '@/lib/progress-status';
import { NEW_VALUE_HEADING, valueWords, type WorkspaceProposal } from '@/lib/workspace-proposals';
import styles from './ProposalCard.module.css';

export interface ProposedValueProps {
  proposal: WorkspaceProposal;
  /** Stack's kept edit on this card, or null. */
  draft: string | null;
  /** Keep a draft (a string) or drop it (null). Without it the box is not editable. */
  onDraftChange?: (draft: string | null) => void;
  /** A decision is in flight: edit and Reset are off. */
  disabled?: boolean;
}

const NOTE_ROWS = 5;

function Editor(props: {
  proposal: WorkspaceProposal;
  text: string;
  invalid: boolean;
  describedBy: string;
  onText: (text: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  editorRef: React.RefObject<HTMLSelectElement & HTMLInputElement & HTMLTextAreaElement | null>;
}) {
  const { proposal, text, invalid, describedBy, onText, onKeyDown, editorRef } = props;
  const common = {
    ref: editorRef,
    className: tokens.input,
    'aria-label': editorLabel(proposal.field, proposal.label),
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
    value: text,
    onKeyDown,
  };
  if (proposal.field === 'status') {
    return (
      <select {...common} onChange={(event) => onText(event.target.value)}>
        {OFFERED_STATUSES.map((value) => (
          <option key={value} value={value}>
            {statusLabel(value)}
          </option>
        ))}
      </select>
    );
  }
  if (proposal.field === 'notes') {
    return (
      <textarea {...common} className={`${tokens.input} ${styles.noteEditor}`} rows={NOTE_ROWS} onChange={(event) => onText(event.target.value)} />
    );
  }
  return <input {...common} type="date" onChange={(event) => onText(event.target.value)} />;
}

export function ProposedValue({ proposal, draft, onDraftChange, disabled = false }: ProposedValueProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  /** Edit mode ended by Enter, Save or Escape: the focus goes back to edit once it shows again. */
  const focusEdit = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  /** Cleared the moment edit mode ends, so a focus change while the editor goes is not a click off. */
  const open = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLSelectElement & HTMLInputElement & HTMLTextAreaElement>(null);
  const hintId = useId();
  const problemId = useId();

  const editable = onDraftChange !== undefined;
  const heading = draft === null ? NEW_VALUE_HEADING : `${NEW_VALUE_HEADING}${EDITED_HEADING_SUFFIX}`;
  const shown = draft ?? proposal.new_value;

  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing && focusEdit.current) {
      editButton.current?.focus();
      focusEdit.current = false;
    }
  }, [editing]);

  function start() {
    setText(editorTextOf(proposal.field, shown));
    setProblem(null);
    open.current = true;
    setEditing(true);
  }

  function stop(returnFocus: boolean) {
    open.current = false;
    setEditing(false);
    setProblem(null);
    focusEdit.current = returnFocus;
  }

  function submit() {
    const check = checkDraft(proposal, text);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    // The assistant's own value again is no edit.
    onDraftChange?.(check.value === proposal.new_value ? null : check.value);
    stop(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop(true);
      return;
    }
    if (event.key !== 'Enter') return;
    const inNote = proposal.field === 'notes';
    if (inNote && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    submit();
  }

  /** Clicking off the box drops what was typed; moving the focus within it (to Save) does not. */
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!open.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && box.current?.contains(next)) return;
    stop(false);
  }

  if (editing) {
    return (
      <div
        ref={box}
        role="group"
        aria-label={heading}
        className={`${styles.pane} ${styles.editing}`}
        data-proposal-value="new"
        data-proposal-editing=""
        onBlur={onBlur}
      >
        <span className={tokens.kicker}>{heading}</span>
        <Editor
          proposal={proposal}
          text={text}
          invalid={problem !== null}
          describedBy={problem === null ? hintId : `${problemId} ${hintId}`}
          onText={(next) => {
            setText(next);
            setProblem(null);
          }}
          onKeyDown={onKeyDown}
          editorRef={editor}
        />
        {problem !== null && (
          <p id={problemId} className={styles.problem} role="alert">
            {problem}
          </p>
        )}
        <span className={styles.editFoot}>
          {proposal.field === 'notes' && <span className={styles.count}>{noteCountWords(text)}</span>}
          <span id={hintId} className={styles.hint}>
            {proposal.field === 'notes' ? NOTE_SAVE_HINT : FIELD_SAVE_HINT}
          </span>
          <button
            type="button"
            className={styles.textButton}
            aria-label={saveLabel(proposal.label)}
            // Keep the focus in the editor, so pressing Save is never a click off the box.
            onMouseDown={(event) => event.preventDefault()}
            onClick={submit}
          >
            {SAVE_WORD}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={heading}
      className={editable ? `${styles.pane} ${styles.editable}` : styles.pane}
      data-proposal-value="new"
      data-proposal-edited={draft === null ? undefined : ''}
    >
      <span className={styles.paneHead}>
        <span className={tokens.kicker}>{heading}</span>
        {editable && draft !== null && (
          <button
            type="button"
            className={styles.textButton}
            aria-label={resetLabel(proposal.label)}
            disabled={disabled}
            onClick={() => onDraftChange?.(null)}
          >
            {RESET_WORD}
          </button>
        )}
      </span>
      <span className={styles.value}>{valueWords(proposal.field, shown)}</span>
      {editable && (
        <button
          ref={editButton}
          type="button"
          className={`${styles.textButton} ${styles.editButton}`}
          aria-label={editLabel(proposal.label)}
          disabled={disabled}
          onClick={start}
        >
          {EDIT_WORD}
        </button>
      )}
    </div>
  );
}
