/**
 * bb2dash — Stack's edit of a proposed value, as pure functions (W-106, Phase 25b; Stack's ask on
 * the open Inbox card: a grey "edit" on the box that makes it editable).
 *
 * Only the Proposed box of an open card is edited, and the edit is a DRAFT held by that card: nothing
 * is written until Approve, which sends it as `p_value` to `workspace_proposal_decide` (206). Before a
 * draft is kept it passes the rules the database holds it to (`workspace_proposal_value_check`, 204):
 *
 *   * a status is one of the six the planner offers (`progress-status.ts`; the database also takes the
 *     three retired labels, which no menu offers);
 *   * a planned date is a real calendar date written `YYYY-MM-DD`;
 *   * a note is 1 to 2,000 characters, counted as Postgres counts them (code points), not only blanks;
 *   * and it is not what the planner has now (206 refuses that with 22023): a status with no
 *     progress row reads as not started, as 204 and 206 read it.
 *
 * Nothing here reads a clock, the cache, the network or the DOM.
 */

import { OFFERED_STATUSES, foldStatus, STATUS_LABEL, type OfferedStatus } from './progress-status';
import type { ProposalField, WorkspaceProposal } from './workspace-proposals';

/** 204's limit on a note, in characters. */
export const NOTE_MAX = 2000;

export const EDIT_WORD = 'edit';
export const SAVE_WORD = 'Save';
export const RESET_WORD = 'Reset';
/** The Proposed heading once Stack has kept an edit on this card. */
export const EDITED_HEADING_SUFFIX = ' · edited by you';
export const NOTE_SAVE_HINT = 'Ctrl or ⌘ + Enter to save · Esc to cancel';
export const FIELD_SAVE_HINT = 'Enter to save · Esc to cancel';

/** Under Approve / Reject while the Proposed box is in edit mode (round 2). */
export const EDIT_FIRST_LINE = 'Save or cancel your edit first.';
export const DRAFT_STATUS_PROBLEM = 'Pick one of the planner’s statuses.';
export const DRAFT_DATE_PROBLEM = 'Enter a real date.';
export const DRAFT_NOTE_EMPTY = 'A note can’t be empty.';
export const DRAFT_NOTE_TOO_LONG = `A note is at most ${NOTE_MAX.toLocaleString('en-US')} characters.`;
export const DRAFT_SAME_AS_PLANNER = 'That’s what the planner already has.';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIDDAY_UTC_HOUR = 12;
const DATE_FIELDS: ReadonlySet<ProposalField> = new Set(['planned_start', 'planned_finish']);

export type DraftCheck = { ok: true; value: string } | { ok: false; message: string };

function isOffered(value: string): value is OfferedStatus {
  return (OFFERED_STATUSES as readonly string[]).includes(value);
}

function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number);
  return new Date(Date.UTC(year, month - 1, day, MIDDAY_UTC_HOUR)).toISOString().slice(0, 10) === value;
}

/** A note's length as Postgres's char_length counts it: code points. */
export function noteCount(text: string): number {
  return [...text].length;
}

/** "13 / 2,000": the note editor's live count. */
export function noteCountWords(text: string): string {
  return `${noteCount(text).toLocaleString('en-US')} / ${NOTE_MAX.toLocaleString('en-US')}`;
}

/** What the planner has, as 206 compares it: a status with no row is not_started. */
function plannerValue(field: ProposalField, oldValue: unknown): string | null {
  if (typeof oldValue === 'string') return oldValue;
  return field === 'status' ? 'not_started' : null;
}

/** Whether a draft may be kept, and the value to keep: the same rules 204 and 206 hold it to. */
export function checkDraft(proposal: Pick<WorkspaceProposal, 'field' | 'old_value'>, text: string): DraftCheck {
  const { field } = proposal;
  if (field === 'status' && !isOffered(text)) return { ok: false, message: DRAFT_STATUS_PROBLEM };
  if (DATE_FIELDS.has(field) && !isRealIsoDate(text)) return { ok: false, message: DRAFT_DATE_PROBLEM };
  if (field === 'notes') {
    if (text.trim() === '') return { ok: false, message: DRAFT_NOTE_EMPTY };
    if (noteCount(text) > NOTE_MAX) return { ok: false, message: DRAFT_NOTE_TOO_LONG };
  }
  if (text === plannerValue(field, proposal.old_value)) return { ok: false, message: DRAFT_SAME_AS_PLANNER };
  return { ok: true, value: text };
}

/** The text an editor starts from: the value the box shows; a retired status as the one it folds into. */
export function editorTextOf(field: ProposalField, value: unknown): string {
  if (typeof value !== 'string') return field === 'status' ? 'not_started' : '';
  if (field === 'status' && Object.hasOwn(STATUS_LABEL, value)) return foldStatus(value as keyof typeof STATUS_LABEL);
  return value;
}

/** "Edit the proposed value for <label>": the edit button's name. */
export function editLabel(label: string): string {
  return `Edit the proposed value for ${label}`;
}

export function saveLabel(label: string): string {
  return `Save the edited value for ${label}`;
}

export function resetLabel(label: string): string {
  return `Reset the proposed value for ${label}`;
}

const EDITOR_NOUN: Readonly<Record<ProposalField, string>> = {
  status: 'status',
  notes: 'note',
  planned_start: 'planned start',
  planned_finish: 'planned finish',
};

/** "Proposed status for <label>": the editor's name. */
export function editorLabel(field: ProposalField, label: string): string {
  return `Proposed ${EDITOR_NOUN[field]} for ${label}`;
}
