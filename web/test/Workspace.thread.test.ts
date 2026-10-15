/**
 * The Workspace thread, as pure functions (Phase 21, task 16).
 *
 * `Workspace.test.tsx` reads the mounted screen; this sibling holds the rules
 * the screen is built from, in `web/src/components/workspace/thread.ts`:
 *
 *   * the state under a question comes from its `workspace_requests` row,
 *     joined to the assistant message by `request_id` when one exists;
 *   * the sentence of a failed or cancelled request comes from the request
 *     row's `error_code`, with or without an assistant row;
 *   * a stored answer replaces the stream; text past a gap never shows;
 *   * a column with no turn says one of two things (ruling U1, less its
 *     `start`: no conversation shows the lobby, Phase 24b): loading, or that
 *     the conversation was not found;
 *   * Phase 24b: the searching line, the turn row (`workspace_turns`), the
 *     fixed lines it shows (default R-1: never the sentence twice), and the
 *     format the answer is read in.
 */

import { describe, expect, it } from 'vitest';
import {
  answerBlocks,
  buildTurns,
  emptyColumnOf,
  formatsOf,
  liveRequestOf,
  newestKnownRequestOf,
} from '@/components/workspace/thread';
import { normalizeTurn, type WorkspaceTurn as WorkspaceTurnRow } from '@/lib/queries.workspace-sources';
import {
  WORKSPACE_ERROR_CODES,
  normalizeMessage,
  normalizeRequest,
  type WorkspaceMessage,
  type WorkspaceRequest,
} from '@/lib/queries.workspace';
import {
  ERROR_SENTENCES,
  LATE_STREAM_LINE,
  QUEUED_LINE,
  RETRIEVAL_LINES,
  SEARCHING_LINE,
  STOPPED_SENTENCE,
} from '@/lib/workspace-labels';

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const NONE: ReadonlySet<number> = new Set();

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, content = 'a question'): WorkspaceMessage {
  const row = normalizeMessage({ id: uuid(n), conversation_id: A, role: 'user', content, finished: true });
  if (row === null) throw new Error('bad question fixture');
  return row;
}

function answer(n: number, requestId: number, fields: Record<string, unknown> = {}): WorkspaceMessage {
  const row = normalizeMessage({
    id: uuid(n),
    conversation_id: A,
    role: 'assistant',
    request_id: requestId,
    tier: 'low',
    content: '',
    finished: true,
    ...fields,
  });
  if (row === null) throw new Error('bad answer fixture');
  return row;
}

function request(id: number, questionN: number, state: string, errorCode: string | null = null): WorkspaceRequest {
  const row = normalizeRequest({
    id,
    conversation_id: A,
    user_message_id: uuid(questionN),
    state,
    error_code: errorCode,
  });
  if (row === null) throw new Error('bad request fixture');
  return row;
}

/** A `workspace_turns` row, through the frozen normaliser. */
function turnRow(requestId: number, retrievalState: string): WorkspaceTurnRow {
  const row = normalizeTurn({
    request_id: requestId,
    depth: 'auto',
    tier: 'low',
    plan_state: 'skipped',
    retrieval_state: retrievalState,
    found_n: 0,
    passages_n: 0,
    memory_n: 0,
    feed_rows: 0,
    attachments: [],
    created_at: '2026-10-15T14:00:00Z',
  });
  if (row === null) throw new Error('bad turn fixture');
  return row;
}

/** The one turn of a one-question conversation. */
function turn(
  messages: WorkspaceMessage[],
  requests: WorkspaceRequest[],
  live: { requestId: number; text: string; late: boolean; searched?: boolean } | null = null,
  stopped: ReadonlySet<number> = NONE,
) {
  const turns = buildTurns({ messages, requests, live, stoppedRequestIds: stopped });
  expect(turns).toHaveLength(1);
  return turns[0];
}

describe('buildTurns: the state under a question comes from its request row', () => {
  it.each([
    ['queued', 'queued', QUEUED_LINE],
    ['claimed', 'streaming', SEARCHING_LINE],
    ['cancelled', 'stopped', STOPPED_SENTENCE],
  ])('reads %s as %s', (rowState, state, line) => {
    expect(turn([question(1)], [request(42, 1, rowState)])).toMatchObject({ state, line, text: '' });
  });

  it('reads done with its stored answer as done, with no line', () => {
    const stored = answer(2, 42, { content: 'Quiz 2.' });
    expect(turn([question(1), stored], [request(42, 1, 'done')])).toMatchObject({
      state: 'done',
      line: null,
      text: 'Quiz 2.',
      answer: stored,
    });
  });

  it('joins the assistant message by request id, as numbers on both sides', () => {
    const turns = buildTurns({
      messages: [question(1), answer(2, 41, { content: 'first' }), question(3), answer(4, 42, { content: 'second' })],
      requests: [request(41, 1, 'done'), request(42, 3, 'done')],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(turns.map((each) => [each.request?.id, each.text])).toEqual([
      [41, 'first'],
      [42, 'second'],
    ]);
  });

  it('shows nothing under a question whose request row has not been read yet', () => {
    expect(turn([question(1)], [])).toMatchObject({ request: null, state: null, line: null, text: '' });
  });
});

describe('buildTurns: one sentence per error code, chosen by the request row', () => {
  it.each(WORKSPACE_ERROR_CODES.filter((code) => code !== 'cancelled'))(
    'says the sentence for %s, with an assistant row and without one',
    (code) => {
      const withRow = turn([question(1), answer(2, 42, { error_code: code })], [request(42, 1, 'failed', code)]);
      const without = turn([question(1)], [request(42, 1, 'failed', code)]);

      expect(withRow).toMatchObject({ state: 'failed', line: ERROR_SENTENCES[code] });
      expect(without).toMatchObject({ state: 'failed', line: ERROR_SENTENCES[code], answer: null });
    },
  );

  it('prefers the request row`s code to the message`s', () => {
    expect(
      turn([question(1), answer(2, 42, { error_code: 'cli_error' })], [request(42, 1, 'failed', 'timeout')]).line,
    ).toBe(ERROR_SENTENCES.timeout);
  });

  it('falls back to the message`s code, then to the sentence for an unrecognised failure', () => {
    expect(
      turn([question(1), answer(2, 42, { error_code: 'usage_limit' })], [request(42, 1, 'failed')]).line,
    ).toBe(ERROR_SENTENCES.usage_limit);
    expect(turn([question(1)], [request(42, 1, 'failed')]).line).toBe(ERROR_SENTENCES.cli_error);
  });

  it('says the stopped sentence for a cancelled request, with a partial answer or with no row', () => {
    const partial = answer(2, 42, { content: 'Week 1: ', error_code: 'cancelled' });
    expect(turn([question(1), partial], [request(42, 1, 'cancelled', 'cancelled')])).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
      text: 'Week 1: ',
    });
    expect(turn([question(1)], [request(42, 1, 'cancelled', 'cancelled')])).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
      text: '',
    });
  });

  it('says the stopped sentence at once for a request Stop was pressed on', () => {
    const pressed = new Set([42]);
    expect(turn([question(1)], [request(42, 1, 'queued')], null, pressed)).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
    });
    expect(turn([question(1)], [request(42, 1, 'claimed')], null, pressed).state).toBe('stopped');
  });

  it('lets the row win when Stop came too late: a finished request stays finished', () => {
    const stored = answer(2, 42, { content: 'Quiz 2.' });
    expect(turn([question(1), stored], [request(42, 1, 'done')], null, new Set([42]))).toMatchObject({
      state: 'done',
      line: null,
      text: 'Quiz 2.',
    });
  });
});

describe('buildTurns: the stream, then the stored row', () => {
  const live = (text: string, late = false) => ({ requestId: 42, text, late });

  it('shows the live text of the followed request, and no line beside it', () => {
    expect(turn([question(1)], [request(42, 1, 'claimed')], live('The syllabus'))).toMatchObject({
      state: 'streaming',
      text: 'The syllabus',
      line: null,
    });
  });

  it('shows text that arrives while the row still reads queued', () => {
    expect(turn([question(1)], [request(42, 1, 'queued')], live('spike-ok 1'))).toMatchObject({
      state: 'queued',
      text: 'spike-ok 1',
      line: null,
    });
  });

  it('shows only the late-stream line for a stream joined late, queued or claimed', () => {
    expect(turn([question(1)], [request(42, 1, 'claimed')], live('', true))).toMatchObject({
      text: '',
      line: LATE_STREAM_LINE,
    });
    expect(turn([question(1)], [request(42, 1, 'queued')], live('', true)).line).toBe(LATE_STREAM_LINE);
  });

  it('ignores the live text of another request', () => {
    const other = { requestId: 41, text: 'not this one', late: false };
    expect(turn([question(1)], [request(42, 1, 'claimed')], other)).toMatchObject({
      text: '',
      line: SEARCHING_LINE,
    });
  });

  it('lets the stored row take over: a finished answer is shown, never the stream', () => {
    const stored = answer(2, 42, { content: 'abcd' });
    // The stream held "ab" behind a gap; the stored row is the whole answer.
    expect(turn([question(1), stored], [request(42, 1, 'claimed')], live('ab')).text).toBe('abcd');
    expect(turn([question(1), stored], [request(42, 1, 'done')], live('ab')).text).toBe('abcd');
  });

  it('keeps the live text while the row is done and the stored answer has not landed', () => {
    const unfinished = answer(2, 42, { finished: false });
    expect(turn([question(1), unfinished], [request(42, 1, 'done')], live('The syllabus'))).toMatchObject({
      state: 'done',
      text: 'The syllabus',
      line: null,
    });
    expect(turn([question(1), unfinished], [request(42, 1, 'done')]).line).toBe(LATE_STREAM_LINE);
  });

  it('keeps the partial text under the stopped sentence until the stored row lands', () => {
    const unfinished = answer(2, 42, { finished: false, tier: 'high' });
    expect(
      turn([question(1), unfinished], [request(42, 1, 'cancelled', 'cancelled')], live('Week 1: ')),
    ).toMatchObject({ state: 'stopped', text: 'Week 1: ', line: STOPPED_SENTENCE });
  });
});

describe('buildTurns: rows that do not pair up', () => {
  it('gives a request with no question row its own turn, after the others', () => {
    const turns = buildTurns({
      messages: [question(1), answer(2, 41, { content: 'first' })],
      requests: [request(41, 1, 'done'), request(42, 9, 'queued')],
      live: { requestId: 42, text: 'spike-ok 1', late: false },
      stoppedRequestIds: NONE,
    });

    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ question: null, state: 'queued', text: 'spike-ok 1' });
  });

  it('gives an assistant row with no request row its own turn, in place', () => {
    const orphan = answer(2, 77, { content: 'kept', error_code: 'timeout' });
    const turns = buildTurns({
      messages: [question(1), orphan, question(3)],
      requests: [],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(turns.map((each) => each.key)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(turns[1]).toMatchObject({ question: null, answer: orphan, text: 'kept', line: ERROR_SENTENCES.timeout });
  });

  it('shows an answer once when its request is known and its question row was not read', () => {
    const stored = answer(2, 42, { content: 'kept once' });
    const turns = buildTurns({
      messages: [question(1), stored],
      requests: [request(42, 9, 'done')],
      live: null,
      stoppedRequestIds: NONE,
    });

    // The request's turn carries the answer; the answer does not also stand alone.
    expect(turns.filter((each) => each.answer === stored)).toHaveLength(1);
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ question: null, state: 'done', text: 'kept once' });
  });

  it('gives every turn its own key', () => {
    const turns = buildTurns({
      messages: [question(1), question(3)],
      requests: [request(41, 1, 'done'), request(42, 3, 'queued'), request(43, 9, 'failed')],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(new Set(turns.map((each) => each.key)).size).toBe(turns.length);
  });
});

describe('liveRequestOf: the request whose stream the page still needs', () => {
  it('is the open request', () => {
    const open = request(42, 3, 'claimed');
    expect(liveRequestOf([request(41, 1, 'done'), open], [question(1), question(3)])).toBe(open);
  });

  it('is the newest request until its stored answer has landed', () => {
    const newest = request(42, 1, 'done');
    expect(liveRequestOf([newest], [question(1), answer(2, 42, { finished: false })])).toBe(newest);
    expect(liveRequestOf([newest], [question(1), answer(2, 42, { content: 'stored' })])).toBeNull();
  });

  it('is nothing for a conversation with no request', () => {
    expect(liveRequestOf([], [])).toBeNull();
  });
});

describe('emptyColumnOf: what the message column says while it holds no turn (ruling U1)', () => {
  /** An id that has been read with no failure, no rows and no question asked into it. */
  const READ = { loaded: true, readFailed: false, askedIntoMissing: false, turns: 0 };

  it('is "loading" while the rows of a conversation are still being read', () => {
    expect(emptyColumnOf({ ...READ, loaded: false })).toBe('loading');
  });

  it('is "missing" for an id whose reads answered with no rows', () => {
    expect(emptyColumnOf(READ)).toBe('missing');
  });

  it('is nothing once there is a turn to show', () => {
    expect(emptyColumnOf({ ...READ, turns: 1 })).toBeNull();
    expect(emptyColumnOf({ ...READ, loaded: false, turns: 1 })).toBeNull();
  });

  it('is nothing when a read failed: the problem line says why, and "not found" is not claimed', () => {
    expect(emptyColumnOf({ ...READ, readFailed: true })).toBeNull();
    expect(emptyColumnOf({ ...READ, readFailed: true, loaded: false })).toBeNull();
  });

  it('is "missing" once workspace_ask said the id does not exist (23503), even over rows read before', () => {
    expect(emptyColumnOf({ ...READ, askedIntoMissing: true, turns: 3 })).toBe('missing');
    expect(emptyColumnOf({ ...READ, askedIntoMissing: true, loaded: false })).toBe('missing');
    expect(emptyColumnOf({ ...READ, askedIntoMissing: true, readFailed: true })).toBe('missing');
  });
});

describe('buildTurns: the text is shown as it was written (Phase 24b: the answer body formats it)', () => {
  it('keeps a stored answer`s markers: formatting is the answer body`s, not the thread`s', () => {
    const stored = answer(2, 42, { content: '**Quiz 2.** It is on Friday.' });
    expect(turn([question(1), stored], [request(42, 1, 'done')]).text).toBe('**Quiz 2.** It is on Friday.');
  });

  it('keeps the live text as it arrived', () => {
    const live = { requestId: 42, text: '**The syl', late: false };
    expect(turn([question(1)], [request(42, 1, 'claimed')], live).text).toBe('**The syl');
  });
});

describe('buildTurns: the searching line (brief 111, "Turn": searching)', () => {
  const claimed = () => [request(42, 1, 'claimed')];

  it('shows the searching line for a claimed request with no sources event and no text', () => {
    const live = { requestId: 42, text: '', late: false, searched: false };
    expect(turn([question(1)], claimed(), live).line).toBe(SEARCHING_LINE);
  });

  it('shows it too while no stream is followed and no turn row is known', () => {
    expect(turn([question(1)], claimed()).line).toBe(SEARCHING_LINE);
  });

  it('takes it away on the sources event: the answer is being written', () => {
    const live = { requestId: 42, text: '', late: false, searched: true };
    expect(turn([question(1)], claimed(), live).line).toBe(LATE_STREAM_LINE);
  });

  it('takes it away on the first text', () => {
    const live = { requestId: 42, text: 'Quiz', late: false, searched: false };
    expect(turn([question(1)], claimed(), live).line).toBeNull();
  });

  it('takes it away once the turn row is known: the search is over', () => {
    const turns = buildTurns({
      messages: [question(1)],
      requests: claimed(),
      live: null,
      stoppedRequestIds: NONE,
      turnRows: [turnRow(42, 'found')],
    });
    expect(turns[0].line).toBe(LATE_STREAM_LINE);
  });

  it('is never shown for a queued request: no runner has claimed it', () => {
    expect(turn([question(1)], [request(42, 1, 'queued')]).line).toBe(QUEUED_LINE);
  });
});

describe('buildTurns: the turn row, the format and the fixed lines', () => {
  const EMPTY_LINE = RETRIEVAL_LINES.empty;

  function doneTurn(content: string, rows: WorkspaceTurnRow[], formats?: ReadonlyMap<number, 'plain' | 'rich'>) {
    const turns = buildTurns({
      messages: [question(1), answer(2, 42, { content })],
      requests: [request(42, 1, 'done')],
      live: null,
      stoppedRequestIds: NONE,
      turnRows: rows,
      formats,
    });
    return turns[0];
  }

  it('carries the turn row of its request, or null while it is not known', () => {
    expect(doneTurn('a', [turnRow(41, 'found'), turnRow(42, 'empty')]).row?.request_id).toBe(42);
    expect(doneTurn('a', [turnRow(41, 'found')]).row).toBeNull();
    expect(doneTurn('a', []).retrieval).toBeNull();
  });

  it.each([
    ['empty', RETRIEVAL_LINES.empty],
    ['failed', RETRIEVAL_LINES.failed],
  ] as const)('shows the fixed line for %s when the answer does not already start with it', (state, line) => {
    const done = doneTurn('Quiz 2 is on Friday.', [turnRow(42, state)]);
    expect(done.retrieval).toBe(state);
    expect(done.retrievalLine).toBe(line);
  });

  it('does not say the sentence twice: the runner wrote it as the answer`s first line (R-1)', () => {
    const done = doneTurn(`\n  ${EMPTY_LINE}\n\nQuiz 2 is on Friday.`, [turnRow(42, 'empty')]);
    expect(done.retrieval).toBe('empty');
    expect(done.retrievalLine).toBeNull();
  });

  it.each(['found', 'attached_only'] as const)('shows no fixed line for %s', (state) => {
    const done = doneTurn('Quiz 2 is on Friday.', [turnRow(42, state)]);
    expect(done.retrieval).toBe(state);
    expect(done.retrievalLine).toBeNull();
  });

  it('shows no fixed line while the answer is still open', () => {
    const turns = buildTurns({
      messages: [question(1)],
      requests: [request(42, 1, 'claimed')],
      live: { requestId: 42, text: 'Quiz', late: false, searched: true },
      stoppedRequestIds: NONE,
      turnRows: [turnRow(42, 'empty')],
    });
    expect(turns[0].retrieval).toBe('empty');
    expect(turns[0].retrievalLine).toBeNull();
  });

  it('reads the format from the request`s options row, and plain when there is none', () => {
    expect(doneTurn('a', [], new Map([[42, 'rich']])).format).toBe('rich');
    expect(doneTurn('a', [], new Map([[42, 'plain']])).format).toBe('plain');
    expect(doneTurn('a', []).format).toBe('plain');
  });
});

describe('formatsOf and answerBlocks', () => {
  it('maps each options row to its request', () => {
    const rows = [
      { request_id: 41, depth: 'auto', format: 'plain', routine_id: null, course_display_id: null, course_ids: null },
      { request_id: 42, depth: 'deep', format: 'rich', routine_id: null, course_display_id: null, course_ids: null },
    ] as const;
    expect([...formatsOf(rows)]).toEqual([
      [41, 'plain'],
      [42, 'rich'],
    ]);
  });

  it('parses a rich answer and reads a plain one as paragraphs of text', () => {
    expect(answerBlocks('# Title', 'rich')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'Title' }] },
    ]);
    expect(answerBlocks('# Title', 'plain')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '# Title' }] },
    ]);
  });
});

describe('newestKnownRequestOf: the answer the Sources tab shows when none is picked (R-2)', () => {
  it('is the newest request whose turn row is known', () => {
    expect(newestKnownRequestOf([turnRow(41, 'found'), turnRow(43, 'empty'), turnRow(42, 'found')])).toBe(43);
  });

  it('is nothing with no row', () => {
    expect(newestKnownRequestOf(undefined)).toBeNull();
    expect(newestKnownRequestOf([])).toBeNull();
  });
});
