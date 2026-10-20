/**
 * bb2dash — the planner changes the assistant proposes, as pure functions (Phase 25b, E;
 * brief 119, item E; the frozen contract `119b_PHASE25B_contract.md`, "The page").
 *
 * The runner never writes the planner. It writes a proposal (203, through 204), and Stack approves
 * or rejects it on the answer or in the Inbox, both of which call `workspace_proposal_decide`
 * (206) and nothing else. This file holds what the two places say:
 *
 *   * a row of `v_workspace_proposals` (205), normalised: a row that cannot be identified, or whose
 *     target, field or state is outside the contract's vocabulary, is dropped;
 *   * THE LINE, one per field: "Mark *<label>* as submitted", "Set the planned start of *<label>*
 *     to Oct 21", "Set the planned finish of …", "Replace the note on *<label>*";
 *   * THE TWO VALUES while the proposal is open: statuses in `progress-status.ts`'s words, dates as
 *     a short month and day, a note as its text; JSON null (no progress row yet) as the planner
 *     shows it: a status reads as not started, a date or a note as "no entry yet";
 *   * THE OUTCOME once decided, and nothing else (Stack, 2026-10-19): "Approved: marked submitted",
 *     "Rejected", "Stale: the row changed", "Expired". An approved date or note names no value;
 *   * the refusal of a second decision (SQLSTATE 55000, "proposal <id> is already <state>").
 *
 * Nothing here reads a clock, the cache, the network or the DOM. Every string is a React text node
 * where it is shown: no value, label or reason is ever rendered as HTML.
 */

import { asRecord } from './json-record';
import type { ProgressTarget } from './progress-cache';
import { statusLabel, STATUS_LABEL, type ProgressStatus } from './progress-status';
import { parseConversationId, toRequestId } from './queries.workspace';

/* ---------------------------------------------------------------------------
 * The contract's vocabularies (119b, 203 and 205)
 * ------------------------------------------------------------------------ */

export const PROPOSAL_TARGETS = ['assignment_progress', 'reading_progress'] as const;
export type ProposalTarget = (typeof PROPOSAL_TARGETS)[number];

export const PROPOSAL_FIELDS = ['status', 'notes', 'planned_start', 'planned_finish'] as const;
export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

/** `approved` stays in 203's check and is unused in v1 (119a): an approval that writes stores `applied`. */
export const PROPOSAL_STATES = ['proposed', 'approved', 'rejected', 'stale', 'applied', 'expired'] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/** What `p_decision` takes (206). */
export const PROPOSAL_DECISIONS = ['approve', 'reject'] as const;
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

/** The SQLSTATE 206 raises for a proposal that is no longer `proposed`. */
export const ALREADY_DECIDED_CODE = '55000';

/** One row of `v_workspace_proposals`: every column of 203, the effective state and the Inbox item. */
export interface WorkspaceProposal {
  id: number;
  created_at: string | null;
  expires_at: string | null;
  request_id: number;
  conversation_id: string;
  target: ProposalTarget;
  /** `assignment_id`, or `reading_id` as text. */
  row_id: string;
  course_id: string | null;
  /** The item's title as the planner shows it. */
  label: string;
  field: ProposalField;
  /** The value 204 read; null when no progress row existed. jsonb: trust no shape. */
  old_value: unknown;
  /** A status, a `YYYY-MM-DD` date or the whole note. jsonb: trust no shape. */
  new_value: unknown;
  reason: string;
  state: ProposalState;
  decided_at: string | null;
  /** `expired` once `expires_at` has passed while still `proposed`; else `state`. */
  effective_state: ProposalState;
  attention_item_id: number | null;
  attention_state: string | null;
}

/** The view's columns, by name (no `*`: the select says what the page reads). */
export const PROPOSAL_COLUMNS =
  'id, created_at, expires_at, request_id, conversation_id, target, row_id, course_id, label, field, ' +
  'old_value, new_value, reason, state, decided_at, effective_state, attention_item_id, attention_state';

/* ---------------------------------------------------------------------------
 * Words
 * ------------------------------------------------------------------------ */

export const PROPOSAL_KICKER = 'Proposed planner change';
export const OLD_VALUE_HEADING = 'Planner has';
export const NEW_VALUE_HEADING = 'Proposed';
export const REASON_HEADING = 'Why';
export const APPROVE_WORD = 'Approve';
export const REJECT_WORD = 'Reject';
/** A date or a note the planner has no entry for (JSON null, or an empty note). */
export const NO_ENTRY_YET = 'no entry yet';
export const OPEN_ANSWER_LABEL = 'Open the answer →';
export const PROPOSAL_LOADING_LINE = 'Reading the proposal…';
export const PROPOSAL_MISSING_LINE = 'The proposal behind this item could not be found.';
/** A 55000: the other place decided first; the card is read again and shows where it stands. */
export const ALREADY_DECIDED_LINE = 'Already decided in the other place; showing where it stands.';

const DECIDED_WORDS: Readonly<Record<Exclude<ProposalState, 'proposed' | 'approved' | 'applied'>, string>> = {
  rejected: 'Rejected',
  stale: 'Stale: the row changed',
  expired: 'Expired',
};

/** An approved change that names no value: a date or a note is not drawn once decided. */
const APPROVED_WITHOUT_VALUE: Readonly<Record<Exclude<ProposalField, 'status'>, string>> = {
  planned_start: 'Approved: planned start changed',
  planned_finish: 'Approved: planned finish changed',
  notes: 'Approved: note replaced',
};

const DATE_FIELDS: ReadonlySet<ProposalField> = new Set(['planned_start', 'planned_finish']);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Midday UTC is the same calendar day in New York all year round. */
const MIDDAY_UTC_HOUR = 12;
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const NO_REASON = 'the database gave no reason';
const HELD_STATE = /already\s+([a-z]+)/i;

/* ---------------------------------------------------------------------------
 * Normalising a row
 * ------------------------------------------------------------------------ */

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rowIdOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return textOrNull(value);
}

/** One `v_workspace_proposals` row, or null when it cannot be identified or breaks the vocabulary. */
export function normalizeProposal(row: unknown): WorkspaceProposal | null {
  const raw = asRecord(row);
  if (raw === null) return null;
  const id = toRequestId(raw.id);
  const requestId = toRequestId(raw.request_id);
  const conversationId = parseConversationId(raw.conversation_id);
  const target = oneOf(PROPOSAL_TARGETS, raw.target);
  const field = oneOf(PROPOSAL_FIELDS, raw.field);
  const state = oneOf(PROPOSAL_STATES, raw.state);
  const rowId = rowIdOf(raw.row_id);
  const label = textOrNull(raw.label);
  if (id === null || requestId === null || conversationId === null || target === null) return null;
  if (field === null || state === null || rowId === null || label === null || raw.new_value === undefined) return null;
  return {
    id,
    created_at: textOrNull(raw.created_at),
    expires_at: textOrNull(raw.expires_at),
    request_id: requestId,
    conversation_id: conversationId,
    target,
    row_id: rowId,
    course_id: textOrNull(raw.course_id),
    label,
    field,
    old_value: raw.old_value ?? null,
    new_value: raw.new_value,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    state,
    decided_at: textOrNull(raw.decided_at),
    effective_state: oneOf(PROPOSAL_STATES, raw.effective_state) ?? state,
    attention_item_id: toRequestId(raw.attention_item_id),
    attention_state: textOrNull(raw.attention_state),
  };
}

/** Every row of a read that normalises, in the order read. */
export function normalizeProposals(data: unknown): WorkspaceProposal[] {
  return (Array.isArray(data) ? data : []).flatMap((row: unknown) => normalizeProposal(row) ?? []);
}

/** The planner row an approval writes, as the planner's caches name it (`progress-cache.ts`). */
export function progressTargetOf(proposal: Pick<WorkspaceProposal, 'target' | 'row_id'>): ProgressTarget {
  return {
    item_kind: proposal.target === 'assignment_progress' ? 'assignment' : 'reading',
    item_id: proposal.row_id,
  };
}

/** The rows by request id, each request's cards in id order. */
export function proposalsByRequest(rows: readonly WorkspaceProposal[]): ReadonlyMap<number, WorkspaceProposal[]> {
  const grouped = new Map<number, WorkspaceProposal[]>();
  for (const row of rows) grouped.set(row.request_id, [...(grouped.get(row.request_id) ?? []), row]);
  return new Map([...grouped].map(([requestId, list]) => [requestId, [...list].sort((a, b) => a.id - b.id)]));
}

/* ---------------------------------------------------------------------------
 * Values and lines
 * ------------------------------------------------------------------------ */

function isStatus(value: unknown): value is ProgressStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_LABEL, value);
}

/** A real `YYYY-MM-DD` date as "Oct 21"; null for anything else. */
function shortDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  if (match === null) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const moment = new Date(Date.UTC(year, month - 1, day, MIDDAY_UTC_HOUR));
  return moment.toISOString().slice(0, 10) === value ? SHORT_DATE.format(moment) : null;
}

/** One value of a field, in the planner's words. */
export function valueWords(field: ProposalField, value: unknown): string {
  if (field === 'status') {
    if (value === null || value === undefined) return statusLabel('not_started');
    return isStatus(value) ? statusLabel(value) : typeof value === 'string' ? value : NO_ENTRY_YET;
  }
  if (typeof value !== 'string' || value === '') return NO_ENTRY_YET;
  return DATE_FIELDS.has(field) ? (shortDate(value) ?? value) : value;
}

/** The line with the label apart, so the card can set it in italics. */
export interface LineParts {
  before: string;
  label: string;
  after: string;
}

export function lineParts(proposal: Pick<WorkspaceProposal, 'field' | 'label' | 'new_value'>): LineParts {
  const { field, label } = proposal;
  const words = valueWords(field, proposal.new_value);
  switch (field) {
    case 'status':
      return { before: 'Mark ', label, after: ` as ${words}` };
    case 'planned_start':
      return { before: 'Set the planned start of ', label, after: ` to ${words}` };
    case 'planned_finish':
      return { before: 'Set the planned finish of ', label, after: ` to ${words}` };
    case 'notes':
      return { before: 'Replace the note on ', label, after: '' };
  }
}

export function lineText(proposal: Pick<WorkspaceProposal, 'field' | 'label' | 'new_value'>): string {
  const { before, label, after } = lineParts(proposal);
  return `${before}${label}${after}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Approve: mark ECN 304 Problem Set 4 as submitted": the button's name says the item. */
export function approveLabel(proposal: Pick<WorkspaceProposal, 'field' | 'label' | 'new_value'>): string {
  return `${APPROVE_WORD}: ${lowerFirst(lineText(proposal))}`;
}

export function rejectLabel(proposal: Pick<WorkspaceProposal, 'field' | 'label' | 'new_value'>): string {
  return `${REJECT_WORD}: ${lowerFirst(lineText(proposal))}`;
}

/* ---------------------------------------------------------------------------
 * The outcome
 * ------------------------------------------------------------------------ */

export function isOpenProposal(proposal: Pick<WorkspaceProposal, 'effective_state'>): boolean {
  return proposal.effective_state === 'proposed';
}

/** A decided state in words; null for `proposed`. An approval names a status, never a date or a note. */
export function outcomeWords(state: ProposalState, field: ProposalField, newValue: unknown): string | null {
  if (state === 'proposed') return null;
  if (state === 'applied' || state === 'approved') {
    return field === 'status' ? `Approved: marked ${valueWords('status', newValue)}` : APPROVED_WITHOUT_VALUE[field];
  }
  return DECIDED_WORDS[state];
}

export function outcomeLine(proposal: Pick<WorkspaceProposal, 'effective_state' | 'field' | 'new_value'>): string | null {
  return outcomeWords(proposal.effective_state, proposal.field, proposal.new_value);
}

/* ---------------------------------------------------------------------------
 * A decision the database refused
 * ------------------------------------------------------------------------ */

function codeOf(error: unknown): unknown {
  return asRecord(error)?.code;
}

function messageOf(error: unknown): string | null {
  const message = error instanceof Error ? error.message : asRecord(error)?.message;
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null;
}

/** 206's refusal of a proposal that is no longer `proposed`. */
export function isAlreadyDecided(error: unknown): boolean {
  return codeOf(error) === ALREADY_DECIDED_CODE;
}

/** The state a 55000 names ("proposal 7 is already rejected"), or null. */
export function heldStateOf(error: unknown): ProposalState | null {
  if (!isAlreadyDecided(error)) return null;
  return oneOf(PROPOSAL_STATES, HELD_STATE.exec(messageOf(error) ?? '')?.[1]?.toLowerCase());
}

/** What the card says when a decision did not go through. */
export function decideProblemLine(error: unknown): string {
  if (isAlreadyDecided(error)) return ALREADY_DECIDED_LINE;
  return `That decision was not saved: ${messageOf(error) ?? NO_REASON}. Try again.`;
}

/** What the page says when the proposals could not be read. */
export function proposalsProblemLine(error: unknown): string {
  return `Could not read the proposed planner changes: ${messageOf(error) ?? NO_REASON}`;
}

/* ---------------------------------------------------------------------------
 * The Inbox item (205): `suggested = {source: 'workspace', proposal_id, conversation_id, request_id, reason}`
 * ------------------------------------------------------------------------ */

/**
 * The proposal an `assistant_proposal` Inbox item stands for: the checked column 205 adds
 * (`attention_items.workspace_proposal_id`), never `suggested`, which is the model's free jsonb (R2-8).
 */
export function proposalIdOfItem(item: { workspace_proposal_id?: unknown }): number | null {
  return toRequestId(item.workspace_proposal_id);
}

/** The conversation the proposal was made in, from `suggested.conversation_id`. */
export function conversationOfItem(item: { suggested: unknown }): string | null {
  return parseConversationId(asRecord(item.suggested)?.conversation_id);
}

/** The outcome 206 or the sweep wrote on the item (`resolution.outcome`), or null while it is open. */
export function itemOutcomeState(item: { state: string; resolution: unknown }): ProposalState | null {
  if (item.state === 'open') return null;
  return oneOf(PROPOSAL_STATES, asRecord(item.resolution)?.outcome);
}

/** The outcome in words from the Inbox item alone (its field and `to_value` are the proposal's); null while open. */
export function itemOutcomeLine(item: { state: string; resolution: unknown; field: string | null; to_value: unknown }): string | null {
  const state = itemOutcomeState(item);
  const field = oneOf(PROPOSAL_FIELDS, item.field);
  if (state === null || field === null) return null;
  return outcomeWords(state, field, item.to_value);
}
