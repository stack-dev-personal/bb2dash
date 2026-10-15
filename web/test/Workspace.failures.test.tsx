/**
 * The Workspace screen when something fails (Phase 21, task 16).
 *
 * `Workspace.test.tsx` holds what the Contract says the page shows. This
 * sibling holds the other half of every read and write: a failure is said, in
 * the app's "Could not …: <reason>" form, and the page is left in the state the
 * database is really in. Nothing is swallowed, and nothing typed is lost.
 * A line that has lost its reason goes: "could not send" once the text is
 * edited, "could not stop" once the request it was pressed on has finished.
 *
 * Since Phase 24b the composer is W-87's, rendered through its contract
 * (ruling C-1) and stood in for here by `composerMock()`: its own refusals,
 * keys and waiting state are W-87's tests. This file holds what the thread
 * hands it, amendment (h) among them: `busy` is a Stop on its way and nothing
 * else, false once the cancel settles. It also holds the message column's
 * scroll, which no Contract sentence names.
 */

import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { NEW_REQUEST, fake, gate, joined, resetFake, settle, wrapperFor, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());
vi.mock('@/components/workspace/Composer', async () => (await import('./workspace-harness')).composerMock());
vi.mock('@/components/workspace/Lobby', async () => (await import('./workspace-harness')).lobbyMock());

const labels = await import('@/lib/workspace-labels');
const { normalizeMessage, normalizeRequest } = await import('@/lib/queries.workspace');
const { normalizeTurn } = await import('@/lib/queries.workspace-sources');
const { MessageList } = await import('@/components/workspace/MessageList');
const { buildTurns } = await import('@/components/workspace/thread');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const TOPIC_A = `workspace:${A}`;
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';
const DENIED = { code: '42501', message: 'permission denied' };

const QUESTION_ROW: Row = { id: QUESTION, conversation_id: A, role: 'user', content: 'What is due?', finished: true };

function requestRow(state: string, fields: Row = {}): Row {
  return { id: 42, conversation_id: A, user_message_id: QUESTION, state, ...fields };
}

/** The conversation once request 42 is answered: the stored row and the closed request. */
const ANSWERED_ROWS: Record<string, Row[]> = {
  workspace_messages: [
    QUESTION_ROW,
    {
      id: ANSWER,
      conversation_id: A,
      role: 'assistant',
      request_id: 42,
      tier: 'low',
      content: 'Quiz 2.',
      finished: true,
    },
  ],
  workspace_requests: [requestRow('done')],
};

/** The broadcast `workspace_finish()` sends for it. */
const DONE_EVENT = { request_id: 42, message_id: ANSWER, state: 'done' };

/** The same conversation after a second question was asked from another tab: request 43 is open. */
const SECOND_QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-000000000043';
const SECOND_ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-000000000043';
const OTHER_TAB_ASKED_ROWS: Record<string, Row[]> = {
  workspace_messages: [
    ...ANSWERED_ROWS.workspace_messages,
    { id: SECOND_QUESTION, conversation_id: A, role: 'user', content: 'And the reading?', finished: true },
  ],
  workspace_requests: [
    ...ANSWERED_ROWS.workspace_requests,
    { id: 43, conversation_id: A, user_message_id: SECOND_QUESTION, state: 'queued' },
  ],
};

function open(search = `c=${A}`) {
  fake.state.search = search;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

function box(): HTMLElement {
  return screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
}

function type(text: string): HTMLElement {
  fireEvent.change(box(), { target: { value: text } });
  return box();
}

function alerts(): string[] {
  return screen.queryAllByRole('alert').map((alert) => alert.textContent ?? '');
}

beforeEach(() => {
  resetFake();
});

describe('a read that fails is said', () => {
  it('says the conversations could not be loaded, in the list', async () => {
    fake.state.readErrors = { workspace_conversations: DENIED };
    open('');

    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    expect(await within(list).findByRole('alert')).toHaveTextContent(
      'Could not load the conversations: permission denied',
    );
    expect(within(list).queryByText(labels.NO_CONVERSATIONS_LINE)).toBeNull();
  });

  it('says the conversation could not be loaded when its messages cannot be read', async () => {
    fake.state.rows = { workspace_requests: [requestRow('done')] };
    fake.state.readErrors = { workspace_messages: DENIED };
    open();

    await waitFor(() =>
      expect(alerts()).toEqual(['Could not load this conversation: permission denied']),
    );
  });

  it('leaves a failed read of the options rows to the composer: it is not said twice (round 2, R2-4)', async () => {
    fake.state.rows = ANSWERED_ROWS;
    fake.state.readErrors = { workspace_request_options: DENIED };
    open();
    await screen.findByText('Quiz 2.');
    await waitFor(() => expect(fake.state.log).toContain('from:workspace_request_options'));
    await settle();

    expect(alerts()).toEqual([]);
    expect(screen.queryByText(/Could not load this conversation/)).toBeNull();
  });

  it('says a failed read of the turn rows once, above the column', async () => {
    fake.state.rows = ANSWERED_ROWS;
    fake.state.readErrors = { workspace_turns: DENIED };
    open();
    await screen.findByText('Quiz 2.');

    await waitFor(() => expect(alerts()).toEqual(['Could not load this conversation: permission denied']));
  });

  it('says an empty list is empty only once the list has answered', async () => {
    open('');

    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    expect(await within(list).findByText('No conversations yet.')).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('checkbox', { name: 'Show archived' }));
    expect(await within(list).findByText('No archived conversations.')).toBeInTheDocument();
  });
});

describe('a question that fails', () => {
  const BROKE = { code: 'XX000', message: 'it broke' };

  it('says it could not be sent, above the column, and the composer keeps the text', async () => {
    fake.state.rows = ANSWERED_ROWS;
    fake.state.rpc.workspace_ask_with = () => ({ data: null, error: BROKE });
    open();
    await screen.findByText('Quiz 2.');
    type('What is due?');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(alerts()).toEqual(['Could not send this question: it broke']));
    expect(box()).toHaveValue('What is due?');
  });

  it('takes that line away once the text is edited', async () => {
    fake.state.rows = ANSWERED_ROWS;
    fake.state.rpc.workspace_ask_with = () => ({ data: null, error: BROKE });
    open();
    await screen.findByText('Quiz 2.');
    type('What is due?');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(alerts()).toEqual(['Could not send this question: it broke']));

    type('What is due this week?');

    await waitFor(() => expect(alerts()).toEqual([]));
  });

  it('says a failed read in its own words and a missing id in the not-found line, never the foreign-key sentence', async () => {
    fake.state.readErrors = { workspace_requests: DENIED };
    fake.state.rpc.workspace_ask_with = () => ({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    });
    const { container } = open();
    // A read that failed is not "not found": the page does not know, so the question may be sent.
    await waitFor(() => expect(alerts()).toEqual(['Could not load this conversation: permission denied']));
    type('hello?');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(fake.state.rpcCalls).toHaveLength(1));
    await waitFor(() =>
      expect(alerts()).toEqual([
        'Could not load this conversation: permission denied',
        'This conversation was not found.',
      ]),
    );
    expect(container.textContent).not.toContain('violates foreign key constraint');
  });
});

describe('a Stop that does not stop', () => {
  function seedClaimed(): void {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('claimed')],
    };
  }

  it('says it could not stop, and reads as open again: the request is still running', async () => {
    seedClaimed();
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByText(labels.STOPPED_SENTENCE)).toBeNull();
  });

  it('shows the finished answer when Stop came too late: the row wins', async () => {
    seedClaimed();
    // The runner finished between the page's last read and the press.
    fake.state.rpc.workspace_cancel = () => {
      fake.state.rows = ANSWERED_ROWS;
      return { data: false, error: null };
    };
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Quiz 2.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(labels.STOPPED_SENTENCE)).toBeNull());
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(alerts()).toEqual([]);
  });

  it('takes the could-not-stop line away once that request has finished, and does not put it on the next', async () => {
    seedClaimed();
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    open();
    const channel = await joined(TOPIC_A);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));

    // The answer finishes by itself: there is nothing left to stop.
    fake.state.rows = ANSWERED_ROWS;
    act(() => channel.emit('done', DONE_EVENT));
    expect(await screen.findByText('Quiz 2.')).toBeInTheDocument();
    await waitFor(() => expect(alerts()).toEqual([]));

    // The next question opens another request. Stop was never pressed on it.
    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(alerts()).toEqual([]);
  });
});


/**
 * Amendment (h), from pack 24's run of 2026-10-15: after a Stop and a second
 * finished answer the Ask button looked a shade dim. `busy` is the composer's
 * one input for a Stop on its way, and it is the cancel's own pending state:
 * false the moment the cancel settles, either way. The composer adds its own
 * pending ask; nothing else dims the button.
 */
describe('the composer after a Stop (amendment (h))', () => {
  const SECOND_ANSWER_ID = 'a7c1d2e3-55aa-4f10-b1d2-000000000900';

  /** Request 900's answer stored, as `workspace_finish()` writes it. */
  function storeSecondAnswer(): void {
    const { workspace_messages: messages, workspace_requests: requests } = fake.state.rows;
    fake.state.rows = {
      ...fake.state.rows,
      workspace_messages: [
        ...messages,
        {
          id: SECOND_ANSWER_ID,
          conversation_id: A,
          role: 'assistant',
          request_id: NEW_REQUEST,
          tier: 'low',
          content: 'Chapter 4 is due Friday.',
          finished: true,
        },
      ],
      workspace_requests: requests.map((row) => (row.id === NEW_REQUEST ? { ...row, state: 'done' } : row)),
    };
  }

  it('is not busy once the cancel settles, and asks again when the next answer is stored', async () => {
    fake.state.rows = { workspace_messages: [QUESTION_ROW], workspace_requests: [requestRow('claimed')] };
    open();
    const channel = await joined(TOPIC_A);
    const held = gate();
    fake.state.rpcGate = held.promise;

    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    // The cancel is on its way: that is the one thing that makes the composer busy.
    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: true, requestOpen: false }));

    fake.state.rpcGate = null;
    await act(async () => {
      held.release();
      await held.promise;
    });
    // Settled: busy is false again, whatever the cancel answered.
    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: false, requestOpen: false }));

    fireEvent.keyDown(type('And the reading?'), { key: 'Enter' });
    await screen.findByText('And the reading?', { selector: 'p' });
    storeSecondAnswer();
    act(() => channel.emit('done', { request_id: NEW_REQUEST, message_id: SECOND_ANSWER_ID, state: 'done' }));
    await screen.findByText('Chapter 4 is due Friday.');

    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: false, requestOpen: false, disabled: false }));
    const ask = screen.getByRole('button', { name: 'Ask' });
    expect(ask).toBeEnabled();
    expect(ask).not.toHaveAttribute('aria-busy');
  });

  it('is not busy after a cancel that failed either: the request reads open again', async () => {
    fake.state.rows = { workspace_messages: [QUESTION_ROW], workspace_requests: [requestRow('claimed')] };
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));
    expect(fake.state.composer).toMatchObject({ busy: false, requestOpen: true });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  });
});

/**
 * Round 2, R2-2b: the stream is marked stopped only when `workspace_cancel` answers true. The stopped
 * sentence still shows at the press (the turn's own mark); a cancel that failed marks nothing, so the
 * answer the runner keeps writing still reaches the page.
 */
describe('the stream`s stop mark follows the cancel`s answer (round 2, R2-2b)', () => {
  function seedWriting(): void {
    fake.state.rows = {
      workspace_messages: [
        QUESTION_ROW,
        { id: ANSWER, conversation_id: A, role: 'assistant', request_id: 42, tier: 'mid', content: '', finished: false },
      ],
      workspace_requests: [requestRow('claimed')],
    };
  }

  function answerText(container: HTMLElement): string {
    return container.querySelector('li[data-request-id="42"] [data-answer-text]')?.textContent ?? '';
  }

  it('marks it once the cancel answers true: a later delta changes nothing', async () => {
    seedWriting();
    const { container } = open();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: 42, seq: 1, delta: 'Week one.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(fake.state.rows.workspace_requests[0]).toMatchObject({ state: 'cancelled' }));
    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: false }));

    act(() => channel.emit('delta', { request_id: 42, seq: 2, delta: ' Week two.' }));

    expect(answerText(container)).toBe('Week one.');
    expect(screen.getByText(labels.STOPPED_SENTENCE)).toBeInTheDocument();
  });

  it('marks nothing when the cancel fails: the answer keeps arriving under the reopened turn', async () => {
    seedWriting();
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    const { container } = open();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: 42, seq: 1, delta: 'Week one.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));

    act(() => channel.emit('delta', { request_id: 42, seq: 2, delta: ' Week two.' }));

    expect(answerText(container)).toBe('Week one. Week two.');
    expect(container.querySelector('li[data-request-id="42"]')).toHaveAttribute('data-turn', 'streaming');
  });

  it('marks nothing when the request had already finished (the cancel answers false)', async () => {
    seedWriting();
    fake.state.rpc.workspace_cancel = () => ({ data: false, error: null });
    const { container } = open();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: 42, seq: 1, delta: 'Week one.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: false, requestOpen: true }));

    act(() => channel.emit('delta', { request_id: 42, seq: 2, delta: ' Week two.' }));

    expect(answerText(container)).toBe('Week one. Week two.');
  });
});

describe('archiving', () => {
  const ROWS = [{ id: A, title: 'spike', archived: false, updated_at: null }];

  it('says it could not change the conversation, and leaves the row where it is', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    fake.state.writeErrors = { workspace_conversations: DENIED };
    open('');
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    expect(await within(list).findByRole('alert')).toHaveTextContent(
      'Could not change this conversation: permission denied',
    );
    expect(within(list).getByRole('link', { name: /spike/ })).toBeInTheDocument();
    expect(fake.state.rows.workspace_conversations[0]).toMatchObject({ archived: false });
  });

  it('lets go of the selected conversation once it is archived: it left the list', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    open();
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(fake.state.router.replace).toHaveBeenCalledWith('/workspace'));
  });

  it('stays on another conversation when one that is not selected is archived', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    open('');
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(within(list).queryByRole('link', { name: /spike/ })).toBeNull());
    expect(fake.state.router.replace).not.toHaveBeenCalled();
  });
});

describe('the message column follows an answer as it is written', () => {
  function turnsWith(text: string) {
    const question = normalizeMessage(QUESTION_ROW);
    if (question === null) throw new Error('bad fixture');
    return buildTurns({
      messages: [question],
      requests: [],
      live: null,
      stoppedRequestIds: new Set(),
    }).map((turn) => ({ ...turn, text }));
  }

  /** jsdom lays nothing out: give the column the sizes a browser would. */
  function size(column: HTMLElement, scrollHeight: number): void {
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: 400 });
  }

  function mount() {
    const view = render(<MessageList turns={turnsWith('a')} empty={null} />, {
      wrapper: wrapperFor(newQueryClient()),
    });
    const column = view.container.firstElementChild as HTMLElement;
    return { ...view, column };
  }

  it('keeps the end in view while the reader is at the end', () => {
    const { column, rerender } = mount();
    size(column, 900);

    rerender(<MessageList turns={turnsWith('a longer answer')} empty={null} />);

    expect(column.scrollTop).toBe(900);
  });

  it('lets go once the reader scrolls up, and follows again from the end', () => {
    const { column, rerender } = mount();
    size(column, 900);
    column.scrollTop = 100;
    fireEvent.scroll(column);

    size(column, 1200);
    rerender(<MessageList turns={turnsWith('a longer answer')} empty={null} />);
    expect(column.scrollTop).toBe(100);

    column.scrollTop = 780;
    fireEvent.scroll(column);
    size(column, 1500);
    rerender(<MessageList turns={turnsWith('a much longer answer')} empty={null} />);
    expect(column.scrollTop).toBe(1500);
  });
});

/**
 * The PM's walk of 2026-10-07, W-2: after a long answer finished, its last
 * line was under the visible part of the column. The stored row stores the text
 * already on screen, and adds lines no character of that text accounts for:
 * since Phase 24b the fixed line of an `empty` turn is one of them.
 */
describe('the message column follows what arrives with the stored row', () => {
  const LIVE_TEXT = 'Quiz 2 is due on Friday.';
  const MORE_TEXT = `${LIVE_TEXT} The reading is chapter 4.`;

  /** Request 42's turn row: its search found nothing. */
  function emptyTurnRow() {
    const row = normalizeTurn({
      request_id: 42,
      depth: 'auto',
      tier: 'mid',
      plan_state: 'skipped',
      retrieval_state: 'empty',
      found_n: 0,
      passages_n: 0,
      memory_n: 0,
      feed_rows: 98,
      attachments: [],
      created_at: null,
    });
    if (row === null) throw new Error('bad turn fixture');
    return row;
  }

  /** Request 42's assistant row: as `workspace_begin()` writes it, unless `fields` say it is stored. */
  function answerRow(fields: Row = {}): Row {
    return {
      id: ANSWER,
      conversation_id: A,
      role: 'assistant',
      request_id: 42,
      tier: 'mid',
      content: '',
      tool_calls: [],
      finished: false,
      error_code: null,
      ...fields,
    };
  }

  /** Request 42 as the page builds it: from its rows, and the text of its stream. */
  function turnsOfRequest(rows: { request: Row; answer?: Row; text: string; searchedEmpty?: boolean }) {
    const messages = [QUESTION_ROW, ...(rows.answer ? [rows.answer] : [])].flatMap(
      (row) => normalizeMessage(row) ?? [],
    );
    const requests = [rows.request].flatMap((row) => normalizeRequest(row) ?? []);
    return buildTurns({
      messages,
      requests,
      live: { requestId: 42, text: rows.text, late: false },
      stoppedRequestIds: new Set(),
      turnRows: rows.searchedEmpty ? [emptyTurnRow()] : [],
    });
  }

  type Turns = ReturnType<typeof turnsOfRequest>;

  /** jsdom lays nothing out: give the column the sizes a browser would. */
  function size(column: HTMLElement, scrollHeight: number): void {
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: 400 });
  }

  /** The column while `written` grows to `grown`, with the reader at its end: 900 px of content, scrolled to 900. */
  function mountAtTheEnd(written: Turns, grown: Turns) {
    const view = render(<MessageList turns={written} empty={null} />, {
      wrapper: wrapperFor(newQueryClient()),
    });
    const column = view.container.firstElementChild as HTMLElement;
    size(column, 900);
    view.rerender(<MessageList turns={grown} empty={null} />);
    expect(column.scrollTop).toBe(900);
    return { ...view, column };
  }

  /** An answer being written, its begun row already read. */
  const writing = (text: string) =>
    turnsOfRequest({ request: requestRow('claimed'), answer: answerRow(), text });

  /** The same answer stored: the text that was on screen, and the fixed line of a search that found nothing. */
  const stored = () =>
    turnsOfRequest({
      request: requestRow('done'),
      answer: answerRow({ content: MORE_TEXT, finished: true }),
      text: MORE_TEXT,
      searchedEmpty: true,
    });

  it('keeps the fixed line in view when it arrives under text that does not change', () => {
    const { column, container, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    expect(container.querySelector('[data-turn-line]')).toBeNull();

    size(column, 930);
    rerender(<MessageList turns={stored()} empty={null} />);

    expect(container.querySelector('[data-answer-text]')).toHaveTextContent(MORE_TEXT);
    expect(container.querySelector('[data-turn-line]')).toHaveTextContent(labels.RETRIEVAL_LINES.empty);
    expect(column.scrollTop).toBe(930);
  });

  it('keeps the end in view when the tier badge arrives over text that is already there', () => {
    // The first deltas can reach the page before it has read the row `workspace_begin()` wrote.
    const unread = (text: string) => turnsOfRequest({ request: requestRow('claimed'), text });
    const { column, container, rerender } = mountAtTheEnd(unread(LIVE_TEXT), unread(MORE_TEXT));
    expect(container.querySelector('[data-tier]')).toBeNull();

    size(column, 930);
    rerender(<MessageList turns={writing(MORE_TEXT)} empty={null} />);

    expect(container.querySelector('[data-tier]')).toHaveTextContent('Sonnet · standard');
    expect(column.scrollTop).toBe(930);
  });

  it.each([
    ['the stopped sentence', 'cancelled', 'cancelled'],
    ['an error sentence', 'failed', 'timeout'],
  ] as const)('keeps %s in view when it arrives under a partial answer', (_name, state, code) => {
    const { column, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));

    size(column, 940);
    rerender(
      <MessageList
        turns={turnsOfRequest({
          request: requestRow(state, { error_code: code }),
          answer: answerRow({ content: MORE_TEXT, finished: true, error_code: code }),
          text: MORE_TEXT,
        })}
        empty={null}
      />,
    );

    expect(screen.getByText(labels.ERROR_SENTENCES[code])).toBeInTheDocument();
    expect(column.scrollTop).toBe(940);
  });

  it('does not pull the column down for the stored row once the reader has scrolled up', () => {
    const { column, container, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    column.scrollTop = 100;
    fireEvent.scroll(column);

    size(column, 930);
    rerender(<MessageList turns={stored()} empty={null} />);

    expect(container.querySelector('[data-turn-line]')).not.toBeNull();
    expect(column.scrollTop).toBe(100);
  });

  it('leaves a reader a few lines above the end where they are when nothing has grown', () => {
    const { column, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    // 20 px from the end: still following, and not to be moved by a render that adds nothing.
    column.scrollTop = 480;
    fireEvent.scroll(column);

    rerender(<MessageList turns={writing(MORE_TEXT)} empty={null} />);

    expect(column.scrollTop).toBe(480);
  });
});

/**
 * The third review's R3-5. The column follows a reader who was within 96 px of its end at their
 * last scroll, and asking brought no one back to it: a question asked from further up appeared,
 * and was answered, out of view. The reader's own question takes the column to its end and it
 * follows from there (the PM's ruling of 2026-10-07); a turn they did not ask moves no one.
 *
 * These run the page and not the column alone: who asked is the page's to know.
 */
describe('the message column goes to its end when the reader asks', () => {
  const ASKED = 'and next week?';
  const OTHER_TABS_QUESTION = 'And the reading?';
  const OWN_QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-000000000900';
  const OWN_ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-000000000900';
  /** The answer to it, as the runner flushes it. Each flush is longer than the waiting line. */
  const FLUSHES = [
    'Next week has two things due: quiz 3 on Wednesday,',
    ' and the chapter 5 reading response on Friday.',
  ];
  /** The line the stored row brings under the answer: its search found nothing. */
  const FIXED_LINE = labels.RETRIEVAL_LINES.empty;
  /** How far from its end the column still follows (`FOLLOW_SLACK_PX`). */
  const SLACK_PX = 96;
  /** The stand-in layout: the column's own height, and what one turn adds to its content. */
  const COLUMN_PX = 400;
  const TURN_PX = 600;

  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  /**
   * The column, with a stand-in for the layout jsdom does not do: it is as tall as what it
   * holds, 600 px a turn and 1 px a character, so a turn, a delta or a line makes it taller.
   */
  function laidOutColumn(): HTMLElement {
    const column = screen.getByRole('list', { name: labels.MESSAGES_REGION_LABEL }).parentElement;
    if (column === null) throw new Error('the turns have no column');
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: COLUMN_PX });
    Object.defineProperty(column, 'scrollHeight', {
      configurable: true,
      get: () => column.querySelectorAll('li').length * TURN_PX + (column.textContent ?? '').length,
    });
    return column;
  }

  /** Conversation A answered, and the reader back at the top of its column: more than 96 px from the end. */
  async function openScrolledUp() {
    fake.state.rows = ANSWERED_ROWS;
    open();
    const channel = await joined(TOPIC_A);
    await screen.findByText('Quiz 2.');
    const column = laidOutColumn();
    column.scrollTop = 0;
    fireEvent.scroll(column);
    expect(column.scrollHeight - column.clientHeight).toBeGreaterThan(SLACK_PX);
    return { column, channel };
  }

  /** The reader asks from up there, and the question is added to the thread. */
  async function ask(column: HTMLElement): Promise<void> {
    fireEvent.keyDown(type(ASKED), { key: 'Enter' });
    await within(column).findByText(ASKED);
  }

  /** jsdom does not clamp a scroll: at its end, the column's `scrollTop` is its content's height. */
  async function atItsEnd(column: HTMLElement): Promise<void> {
    await waitFor(() => expect(column.scrollTop).toBe(column.scrollHeight));
  }

  /** The rows once the runner has stored request 900's answer: its text, its tier, and its turn row. */
  function storedRows(content: string): Record<string, Row[]> {
    const { workspace_messages: messages, workspace_requests: requests } = fake.state.rows;
    const answer: Row = {
      id: OWN_ANSWER,
      conversation_id: A,
      role: 'assistant',
      request_id: NEW_REQUEST,
      tier: 'mid',
      content,
      tool_calls: [],
      finished: true,
    };
    const turnRow: Row = {
      request_id: NEW_REQUEST,
      depth: 'auto',
      tier: 'mid',
      plan_state: 'skipped',
      retrieval_state: 'empty',
      found_n: 0,
      passages_n: 0,
      memory_n: 0,
      feed_rows: 98,
      attachments: [],
      created_at: null,
    };
    return {
      ...fake.state.rows,
      workspace_turns: [turnRow],
      workspace_messages: [...messages, answer],
      workspace_requests: requests.map((row) => (row.id === NEW_REQUEST ? { ...row, state: 'done' } : row)),
    };
  }

  it('is at its end once their question is added, wherever they had scrolled to', async () => {
    const { column } = await openScrolledUp();

    await ask(column);

    expect(column.querySelectorAll('li')).toHaveLength(2);
    await atItsEnd(column);
  });

  it('follows the answer to it from there: each delta, and the lines of the stored row', async () => {
    const { column, channel } = await openScrolledUp();
    await ask(column);

    FLUSHES.forEach((delta, index) => {
      const before = column.scrollHeight;
      act(() => channel.emit('delta', { request_id: NEW_REQUEST, seq: index + 1, delta }));
      expect(column.scrollHeight).toBeGreaterThan(before);
      expect(column.scrollTop).toBe(column.scrollHeight);
    });

    const written = column.scrollHeight;
    fake.state.rows = storedRows(FLUSHES.join(''));
    act(() => channel.emit('done', { request_id: NEW_REQUEST, message_id: OWN_ANSWER, state: 'done' }));
    await within(column).findByText(FIXED_LINE);
    expect(column.scrollHeight).toBeGreaterThan(written);
    await atItsEnd(column);
  });

  it('lets go again when the reader scrolls back up while that answer is written', async () => {
    const { column, channel } = await openScrolledUp();
    await ask(column);
    await settle();
    column.scrollTop = 0;
    fireEvent.scroll(column);

    act(() => channel.emit('delta', { request_id: NEW_REQUEST, seq: 1, delta: FLUSHES[0] }));

    expect(column).toHaveTextContent(FLUSHES[0]);
    expect(column.scrollTop).toBe(0);
  });

  it('stays where the reader left it when a turn arrives that they did not ask', async () => {
    const { column } = await openScrolledUp();

    // Asked from another tab. This page reads it when its own tab comes back to the front.
    fake.state.rows = OTHER_TAB_ASKED_ROWS;
    act(() => focusManager.setFocused(true));
    await within(column).findByText(OTHER_TABS_QUESTION);
    await settle();

    expect(column.querySelectorAll('li')).toHaveLength(2);
    expect(column.scrollTop).toBe(0);
  });

  it("stays there when their question is refused and the turn that arrives is another tab's", async () => {
    const { column } = await openScrolledUp();
    // Open in the database and not yet read here: Enter sends, and the database refuses.
    fake.state.rows = OTHER_TAB_ASKED_ROWS;

    fireEvent.keyDown(type(ASKED), { key: 'Enter' });
    await screen.findByText(labels.REFUSAL_STILL_ANSWERING);
    await within(column).findByText(OTHER_TABS_QUESTION);
    await settle();

    expect(box()).toHaveValue(ASKED);
    expect(column.scrollTop).toBe(0);
  });

  it('goes to its end when the rows bring the question before `workspace_ask_with()` has answered', async () => {
    const { column } = await openScrolledUp();
    // The database has stored the question. Its answer to this page is still on the way.
    const answered = gate();
    fake.state.rpc.workspace_ask_with = async () => {
      fake.state.rows = {
        workspace_messages: [
          ...ANSWERED_ROWS.workspace_messages,
          { id: OWN_QUESTION, conversation_id: A, role: 'user', content: ASKED, finished: true },
        ],
        workspace_requests: [
          ...ANSWERED_ROWS.workspace_requests,
          { id: NEW_REQUEST, conversation_id: A, user_message_id: OWN_QUESTION, state: 'queued' },
        ],
      };
      await answered.promise;
      return {
        data: { conversation_id: A, message_id: OWN_QUESTION, request_id: NEW_REQUEST },
        error: null,
      };
    };
    fireEvent.keyDown(type(ASKED), { key: 'Enter' });
    await waitFor(() => expect(fake.state.rpcCalls).toHaveLength(1));

    // The tab regains focus and the rows are re-read: the turn is shown, and the page cannot yet say whose it is.
    act(() => focusManager.setFocused(true));
    await within(column).findByText(ASKED);
    await settle();
    expect(column.scrollTop).toBe(0);

    await act(async () => {
      answered.release();
      await answered.promise;
    });

    await atItsEnd(column);
  });
});
