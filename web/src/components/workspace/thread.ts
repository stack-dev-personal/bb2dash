/**
 * bb2dash — the Workspace thread, as pure functions (Phase 21, task 16;
 * Phase 24b, task 9).
 *
 * A conversation is lists the page reads separately: the stored messages, the
 * requests, the live stream of the one request still being written, and since
 * Phase 24b each request's turn row (`workspace_turns`) and options row
 * (`workspace_request_options`). `buildTurns` joins them into what the message
 * column shows, by the Contract's rules (brief 102, "States, in words"; brief
 * 111, "Turn"):
 *
 *   * THE STATE under a question comes from its `workspace_requests` row
 *     (`queued`, `claimed`, `done`, `failed`, `cancelled`; in words: queued,
 *     streaming, done, failed, stopped), joined to the assistant message by
 *     `request_id` when one exists. Request ids are numbers on both sides.
 *   * THE SENTENCE of a failed request is chosen by the request row's
 *     `error_code`, so a failed or cancelled request with no assistant row
 *     still says why, under the question.
 *   * THE TEXT is the stored content once the assistant row is finished, and
 *     the live stream until then, as it was written: the answer body formats it
 *     (`answerBlocks`), by the request's format, and nothing here strips it.
 *   * SEARCHING. A claimed request whose stream has had no `sources` event and
 *     no text, and whose turn row is not known, says `SEARCHING_LINE`; the
 *     event, the first delta or the row takes it away.
 *   * THE FIXED LINES. A turn whose row says `empty` or `failed` shows the
 *     line `retrievalLineOf` gives, once the answer is no longer open, and only
 *     when the answer's first line is not already that sentence: the runner
 *     writes the nothing-matched sentence as the answer's first line itself
 *     (PM default R-1: no sentence twice).
 *
 * `emptyColumnOf` says which line the column shows when it has no turn.
 *
 * Nothing here reads a clock, the cache or the DOM.
 */

import { parseAnswer, plainBlocks, type AnswerBlock } from '@/lib/answer-format';
import {
  WORKSPACE_OPEN_STATES,
  type WorkspaceErrorCode,
  type WorkspaceMessage,
  type WorkspaceRequest,
  type WorkspaceRequestState,
} from '@/lib/queries.workspace';
import type { WorkspaceFormat, WorkspaceRequestOptions } from '@/lib/queries.workspace-ask';
import {
  retrievalLineOf,
  turnOf as turnRowOf,
  type WorkspaceRetrievalState,
  type WorkspaceTurn as WorkspaceTurnRow,
} from '@/lib/queries.workspace-sources';
import {
  ERROR_SENTENCES,
  LATE_STREAM_LINE,
  QUEUED_LINE,
  SEARCHING_LINE,
  STOPPED_SENTENCE,
} from '@/lib/workspace-labels';

/** The Contract's five states, in its words. */
export type TurnState = 'queued' | 'streaming' | 'done' | 'failed' | 'stopped';

/** The live half of the one request the page follows. */
export interface LiveStream {
  requestId: number;
  /** The contiguous run from seq 1, joined; empty when nothing arrived or the stream is late. */
  text: string;
  /** Deltas arrived and the lowest is not seq 1. */
  late: boolean;
  /** The `sources` event arrived: the runner has searched. Absent reads as not yet. */
  searched?: boolean;
}

/** One question with what is known of its answer. */
export interface WorkspaceTurn {
  /** Unique in the thread: the question's id, or the row that stands alone. */
  key: string;
  /** The user row; null for a request or an answer whose question row was not read. */
  question: WorkspaceMessage | null;
  request: WorkspaceRequest | null;
  /** The assistant row, finished or not; null before `workspace_begin()`. */
  answer: WorkspaceMessage | null;
  /** Null while the request row is not known. */
  state: TurnState | null;
  /** The answer's text, as written: stored when finished, else live. */
  text: string;
  /** The line under the turn: queued, searching, late-stream, or an error sentence; null when none applies. */
  line: string | null;
  /** The request's `workspace_turns` row; null while it is not known. */
  row: WorkspaceTurnRow | null;
  /** What the row says the search found; null while the row is not known. */
  retrieval: WorkspaceRetrievalState | null;
  /** The fixed line under the answer (R-1), or null. */
  retrievalLine: string | null;
  /** How the answer is read: the request's options row, plain when it has none. */
  format: WorkspaceFormat;
}

export interface BuildTurnsInput {
  /** Oldest first, as the messages query orders them. */
  messages: readonly WorkspaceMessage[];
  /** In id order, as the requests query orders them. */
  requests: readonly WorkspaceRequest[];
  live: LiveStream | null;
  /** Requests Stop was pressed on, before the database has answered. */
  stoppedRequestIds: ReadonlySet<number>;
  /** The conversation's `workspace_turns` rows; absent or undefined while not read. */
  turnRows?: readonly WorkspaceTurnRow[];
  /** Each request's format, from its options row (`formatsOf`). */
  formats?: ReadonlyMap<number, WorkspaceFormat>;
}

const STATE_IN_WORDS: Readonly<Record<WorkspaceRequestState, TurnState>> = {
  queued: 'queued',
  claimed: 'streaming',
  done: 'done',
  failed: 'failed',
  cancelled: 'stopped',
};

/** A failed request that carries no code reads as the runner's own catch-all. */
const UNRECOGNISED_FAILURE: WorkspaceErrorCode = 'cli_error';

/** An answer with no options row is shown as it always was: plain text. */
const DEFAULT_FORMAT: WorkspaceFormat = 'plain';

/** The states in which an answer is still being written: no fixed line yet. */
const OPEN_TURN_STATES: ReadonlySet<TurnState> = new Set(['queued', 'streaming']);

/* ---------------------------------------------------------------------------
 * One turn
 * ------------------------------------------------------------------------ */

function stateOf(
  request: WorkspaceRequest | null,
  stoppedRequestIds: ReadonlySet<number>,
): TurnState | null {
  if (request === null) return null;
  // Stop shows at once, but only over an open row: a request that had already
  // finished stays finished.
  if (stoppedRequestIds.has(request.id) && WORKSPACE_OPEN_STATES.includes(request.state)) {
    return 'stopped';
  }
  return STATE_IN_WORDS[request.state];
}

function isStored(answer: WorkspaceMessage | null): answer is WorkspaceMessage {
  return answer !== null && answer.finished;
}

type TurnBody = Pick<WorkspaceTurn, 'state' | 'request' | 'answer' | 'text' | 'row'>;

/** A claimed request with no text yet: searching until the runner says it has searched. */
function streamingLine(turn: TurnBody, live: LiveStream | null): string | null {
  if (turn.text !== '') return null;
  if (live?.late) return LATE_STREAM_LINE;
  const searched = live?.searched === true || turn.row !== null;
  return searched ? LATE_STREAM_LINE : SEARCHING_LINE;
}

function lineOf(turn: TurnBody, live: LiveStream | null): string | null {
  const { state, request, answer, text } = turn;
  switch (state) {
    case 'queued':
      if (text !== '') return null;
      return live?.late ? LATE_STREAM_LINE : QUEUED_LINE;
    case 'streaming':
      return streamingLine(turn, live);
    case 'done':
      // Done, and the stored row is still on its way: not blank, and not a guess.
      return isStored(answer) || text !== '' ? null : LATE_STREAM_LINE;
    case 'failed':
      return ERROR_SENTENCES[request?.error_code ?? answer?.error_code ?? UNRECOGNISED_FAILURE];
    case 'stopped':
      return STOPPED_SENTENCE;
    default:
      // No request row: an answer that stands alone still says how it ended.
      return answer?.error_code ? ERROR_SENTENCES[answer.error_code] : null;
  }
}

/** The answer's first line that holds anything, trimmed; null for an empty answer. */
function firstLineOf(text: string): string | null {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? null
  );
}

/**
 * The fixed line under a finished answer: the row's line for `empty` or
 * `failed`, unless the answer already opens with that sentence (R-1).
 */
function retrievalLineFor(turn: TurnBody): string | null {
  if (turn.state === null || OPEN_TURN_STATES.has(turn.state)) return null;
  const line = retrievalLineOf(turn.row);
  if (line === null) return null;
  return firstLineOf(turn.text) === line ? null : line;
}

interface TurnParts {
  key: string;
  question: WorkspaceMessage | null;
  request: WorkspaceRequest | null;
  answer: WorkspaceMessage | null;
}

function turnFrom(parts: TurnParts, input: BuildTurnsInput): WorkspaceTurn {
  const { request, answer } = parts;
  const live = request !== null && input.live?.requestId === request.id ? input.live : null;
  const body: TurnBody = {
    request,
    answer,
    state: stateOf(request, input.stoppedRequestIds),
    text: isStored(answer) ? answer.content : (live?.text ?? ''),
    row: request === null ? null : turnRowOf(input.turnRows, request.id),
  };
  return {
    key: parts.key,
    question: parts.question,
    ...body,
    line: lineOf(body, live),
    retrieval: body.row?.retrieval_state ?? null,
    retrievalLine: retrievalLineFor(body),
    format: (request === null ? undefined : input.formats?.get(request.id)) ?? DEFAULT_FORMAT,
  };
}

/* ---------------------------------------------------------------------------
 * The thread
 * ------------------------------------------------------------------------ */

/** Each request's assistant row, by request id. */
function answersByRequest(messages: readonly WorkspaceMessage[]): Map<number, WorkspaceMessage> {
  const out = new Map<number, WorkspaceMessage>();
  for (const message of messages) {
    if (message.role === 'assistant' && message.request_id !== null) {
      out.set(message.request_id, message);
    }
  }
  return out;
}

/** Each question's request row, by the question's id. */
function requestsByQuestion(requests: readonly WorkspaceRequest[]): Map<string, WorkspaceRequest> {
  const out = new Map<string, WorkspaceRequest>();
  for (const request of requests) {
    if (request.user_message_id !== null) out.set(request.user_message_id, request);
  }
  return out;
}

/**
 * The message column: one turn per question, in order. A row that does not pair
 * up is kept, never dropped: an assistant row with no request row stands in
 * its place, and a request whose question row was not read comes last.
 */
export function buildTurns(input: BuildTurnsInput): WorkspaceTurn[] {
  const answers = answersByRequest(input.messages);
  const byQuestion = requestsByQuestion(input.requests);
  const paired = new Set<number>();
  const turns: WorkspaceTurn[] = [];

  for (const message of input.messages) {
    if (message.role === 'user') {
      const request = byQuestion.get(message.id) ?? null;
      const answer = request === null ? null : (answers.get(request.id) ?? null);
      if (request !== null) paired.add(request.id);
      turns.push(turnFrom({ key: message.id, question: message, request, answer }, input));
    }
  }

  const unasked = input.requests
    .filter((request) => !paired.has(request.id))
    .map((request) => {
      const answer = answers.get(request.id) ?? null;
      return turnFrom({ key: `request-${request.id}`, question: null, request, answer }, input);
    });

  // An answer a turn already carries does not also stand alone: it is shown once.
  const placed = new Set(
    [...turns, ...unasked].flatMap((turn) => (turn.answer === null ? [] : [turn.answer.id])),
  );
  const alone = input.messages.filter(
    (message) => message.role === 'assistant' && !placed.has(message.id),
  );

  return [...withAnswersInPlace(turns, alone, input), ...unasked];
}

/**
 * `turns` with each stand-alone assistant row put back where the messages list
 * has it: after the last question that comes before it.
 */
function withAnswersInPlace(
  turns: readonly WorkspaceTurn[],
  alone: readonly WorkspaceMessage[],
  input: BuildTurnsInput,
): WorkspaceTurn[] {
  if (alone.length === 0) return [...turns];
  const position = new Map(input.messages.map((message, index) => [message.id, index]));
  const standing = alone.map((answer) =>
    turnFrom({ key: answer.id, question: null, request: null, answer }, input),
  );
  return [...turns, ...standing].sort(
    (left, right) => (position.get(left.key) ?? 0) - (position.get(right.key) ?? 0),
  );
}

/**
 * The request whose live text the page still needs: the newest one, until its
 * stored answer has landed. An open request is followed; so is one that has
 * just finished or been stopped, for the moment before its row arrives, so the
 * text on screen does not blink out between the two.
 */
export function liveRequestOf(
  requests: readonly WorkspaceRequest[],
  messages: readonly WorkspaceMessage[],
): WorkspaceRequest | null {
  const newest = requests.at(-1) ?? null;
  if (newest === null) return null;
  return isStored(answersByRequest(messages).get(newest.id) ?? null) ? null : newest;
}

/* ---------------------------------------------------------------------------
 * The format, and the answer read in it
 * ------------------------------------------------------------------------ */

/** Each request's format, by request id, from its options rows. */
export function formatsOf(
  rows: readonly Pick<WorkspaceRequestOptions, 'request_id' | 'format'>[],
): ReadonlyMap<number, WorkspaceFormat> {
  return new Map(rows.map((row) => [row.request_id, row.format]));
}

/**
 * The answer as blocks: parsed for `rich`, paragraphs of text for `plain`.
 * Called on every render while an answer streams (probe Q-4 passed); nothing
 * is kept between renders.
 */
export function answerBlocks(text: string, format: WorkspaceFormat): readonly AnswerBlock[] {
  return format === 'rich' ? parseAnswer(text) : plainBlocks(text);
}

/**
 * The answer the Sources tab shows when none is picked (PM default R-2): the
 * newest request whose turn row is known; null when no row is.
 */
export function newestKnownRequestOf(rows: readonly WorkspaceTurnRow[] | undefined): number | null {
  return (rows ?? []).reduce<number | null>(
    (newest, row) => (newest === null || row.request_id > newest ? row.request_id : newest),
    null,
  );
}

/* ---------------------------------------------------------------------------
 * The column with no turn to show
 * ------------------------------------------------------------------------ */

/**
 * The two states of an empty message column (the PM's ruling U1; Phase 24b
 * took away `start`: with no conversation the page shows the lobby). Each has
 * its own line in `workspace-labels.ts`:
 *   `loading`  the conversation's rows are still being read;
 *   `missing`  the id was not found.
 */
export type EmptyColumn = 'loading' | 'missing';

export interface EmptyColumnInput {
  /** Both reads of the conversation have answered, from the saved cache or the database. */
  loaded: boolean;
  /** A read failed: the problem line says why, and the column claims nothing. */
  readFailed: boolean;
  /** The ask answered that the id does not exist (SQLSTATE 23503). */
  askedIntoMissing: boolean;
  /** How many turns the rows make. */
  turns: number;
}

/**
 * What the column says in place of its turns, or null when it shows them.
 *
 * A first question always stores its message and its request with the
 * conversation, so an id whose two reads answered with no rows is one that
 * does not exist, or is not the owner's. The database saying so itself
 * (23503) outranks rows read before the conversation was gone.
 */
export function emptyColumnOf(input: EmptyColumnInput): EmptyColumn | null {
  if (input.askedIntoMissing) return 'missing';
  if (input.turns > 0 || input.readFailed) return null;
  return input.loaded ? 'missing' : 'loading';
}
