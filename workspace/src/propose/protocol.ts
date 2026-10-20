/**
 * The planner proposal tool's shared terms (Phase 25b, E; the contract `119b_PHASE25B_contract.md`,
 * "The tool"): its names, its input and the JSON schema the model sees, the per-turn limit, and the
 * one-line messages the tool server and the runner exchange over the turn's socket.
 *
 * The tool server (`planner-server.ts`) holds no credential. It checks the input's shape and hands it
 * to the runner over `/run/workspace/propose-<request id>.sock`; the runner (`channel.ts`) checks the
 * shape again and calls `workspace_propose` (204) on its own connection with its own request id and
 * runner name, never with anything the model wrote but these five fields. The database checks the
 * rest (the row exists, the value fits the field, five a request).
 *
 * Pure and dependency-free.
 */

export const PLANNER_SERVER = 'planner';
export const PROPOSE_TOOL = 'propose_planner_change';
/** The name the CLI gives the tool: the gate's and `--allowedTools`'s. */
export const PROPOSE_TOOL_FULL = `mcp__${PLANNER_SERVER}__${PROPOSE_TOOL}`;

/** The tool server's environment: where the runner listens, and how many calls it forwards. */
export const PROPOSE_SOCKET_ENV = 'WORKSPACE_PROPOSE_SOCKET';
export const PROPOSE_LIMIT_ENV = 'WORKSPACE_PROPOSE_LIMIT';
/** Proposals a turn may make: 204 refuses a sixth of a request (54000), the tool server a sixth call. */
export const PROPOSALS_PER_TURN = 5;
/** Calls of the tool a turn may make in all, refused and malformed ones included (119a R2-5). */
export const PROPOSE_CALLS_PER_TURN = 10;

export const PROPOSE_TARGETS = ['assignment_progress', 'reading_progress'] as const;
export type ProposeTarget = (typeof PROPOSE_TARGETS)[number];
export const PROPOSE_FIELDS = ['status', 'notes', 'planned_start', 'planned_finish'] as const;
export type ProposeField = (typeof PROPOSE_FIELDS)[number];
/** The labels of `progress_status`, read on prod 2026-10-19 (119b). */
export const PLANNER_STATUSES = [
  'not_started', 'planned', 'in_progress', 'submitted', 'graded', 'missed', 'excused', 'not_applicable', 'waived',
] as const;

export const ROW_ID_MAX_CHARS = 200;
export const VALUE_MAX_CHARS = 2000;
export const REASON_MAX_CHARS = 500;
/** One message either way is one line of at most this many bytes. */
export const MESSAGE_MAX_BYTES = 16 * 1024;

export interface ProposeInput {
  readonly target: ProposeTarget;
  readonly row_id: string;
  readonly field: ProposeField;
  readonly value: string;
  readonly reason: string;
}

/** What 204 returns, as the tool shows it to the model. */
export interface ProposalRow {
  readonly proposal_id: string;
  readonly label: string;
  readonly old_value: unknown;
  readonly new_value: unknown;
}

/** The runner's answer on the socket: the proposal, or why there is none. */
export type ProposeReply = { readonly ok: true; readonly proposal: ProposalRow } | { readonly ok: false; readonly error: string };

export const PROPOSE_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['target', 'row_id', 'field', 'value', 'reason'],
  properties: {
    target: { type: 'string', enum: [...PROPOSE_TARGETS], description: 'assignment_progress for an assignment (kind A in the planner block), reading_progress for a reading (kind R).' },
    row_id: { type: 'string', minLength: 1, maxLength: ROW_ID_MAX_CHARS, description: 'The row\'s id exactly as the planner block\'s id column shows it.' },
    field: { type: 'string', enum: [...PROPOSE_FIELDS], description: 'status or notes; planned_start or planned_finish on an assignment only.' },
    value: { type: 'string', minLength: 1, maxLength: VALUE_MAX_CHARS, description: `For status one of ${PLANNER_STATUSES.join(', ')}; for a planned date YYYY-MM-DD; for notes the whole new note, which replaces the old one.` },
    reason: { type: 'string', minLength: 1, maxLength: REASON_MAX_CHARS, description: 'One sentence for Stack: why, in his own words where he gave them.' },
  },
});

export const PROPOSE_TOOL_DESCRIPTION =
  'Propose one change to Stack\'s planner: the status or the note of an assignment or a reading, or the planned start or ' +
  'finish of an assignment. Nothing is changed: Stack approves or rejects the proposal under your answer or in his Inbox. ' +
  `At most ${PROPOSALS_PER_TURN} a turn.`;

const KEYS: readonly string[] = ['target', 'row_id', 'field', 'value', 'reason'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Characters as the database counts them (code points). */
const charsOf = (text: string): number => [...text].length;

function textFits(value: unknown, maxChars: number, blankOk: boolean): value is string {
  return typeof value === 'string' && charsOf(value) >= 1 && charsOf(value) <= maxChars && (blankOk || value.trim() !== '');
}

/** The five fields, or the reason they are not a proposal's input. Unknown keys are refused. */
export function readProposeInput(value: unknown): { ok: true; input: ProposeInput } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'the input is not an object' };
  const extra = Object.keys(value).find((key) => !KEYS.includes(key));
  if (extra !== undefined) return { ok: false, reason: `unknown field ${extra.slice(0, 40)}` };
  const { target, row_id: rowId, field, value: proposed, reason } = value;
  if (typeof target !== 'string' || !(PROPOSE_TARGETS as readonly string[]).includes(target)) {
    return { ok: false, reason: 'target must be assignment_progress or reading_progress' };
  }
  if (typeof field !== 'string' || !(PROPOSE_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, reason: 'field must be status, notes, planned_start or planned_finish' };
  }
  if (target === 'reading_progress' && field !== 'status' && field !== 'notes') {
    return { ok: false, reason: 'a reading has no planned dates' };
  }
  if (!textFits(rowId, ROW_ID_MAX_CHARS, false)) return { ok: false, reason: `row_id must be 1 to ${ROW_ID_MAX_CHARS} characters` };
  if (!textFits(proposed, VALUE_MAX_CHARS, true)) return { ok: false, reason: `value must be 1 to ${VALUE_MAX_CHARS} characters` };
  if (!textFits(reason, REASON_MAX_CHARS, false)) return { ok: false, reason: `reason must be 1 to ${REASON_MAX_CHARS} characters` };
  return { ok: true, input: { target: target as ProposeTarget, row_id: rowId, field: field as ProposeField, value: proposed, reason } };
}

/** A reply read off the socket, or null when it is not one. */
export function readProposeReply(value: unknown): ProposeReply | null {
  if (!isRecord(value)) return null;
  if (value.ok === false && typeof value.error === 'string') return { ok: false, error: value.error };
  const proposal = value.proposal;
  if (value.ok !== true || !isRecord(proposal) || typeof proposal.proposal_id !== 'string' || typeof proposal.label !== 'string') return null;
  return { ok: true, proposal: { proposal_id: proposal.proposal_id, label: proposal.label, old_value: proposal.old_value ?? null, new_value: proposal.new_value ?? null } };
}

/** One message as one line. */
export const messageLine = (message: unknown): string => `${JSON.stringify(message)}\n`;
