/**
 * The thread's answers, their sources and the searching line (Phase 24b, task
 * 9; brief 111, "Formatted answers, with no new dependency", "Sources", "The
 * fixed lines", "Stop"; frozen (g)).
 *
 * Read off the mounted screen over the fake client in `workspace-harness.tsx`,
 * the composer and the lobby stood in for by their contract (ruling C-1):
 *
 *   * a label with a source row is a chip, a button and never a link, and a
 *     press opens the panel's Sources tab at that answer; a label with no row
 *     is its text;
 *   * the sources row under a finished answer, "2 sources", absent with none;
 *   * a `rich` answer is formatted, a `plain` one and one with no options row
 *     are plain text;
 *   * `empty` and `failed` show their fixed line (unless the answer already
 *     opens with it, R-1), `attached_only` and `found` show none, and the
 *     turn carries `data-retrieval` either way;
 *   * a claimed request with no sources event and no text says it is searching
 *     until the event (or the first text) arrives;
 *   * after Stop, a later delta changes nothing on the page;
 *   * the date line names today's New York date and its weekday.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, gate, joined, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());
vi.mock('@/components/workspace/Composer', async () => (await import('./workspace-harness')).composerMock());
vi.mock('@/components/workspace/Lobby', async () => (await import('./workspace-harness')).lobbyMock());

const labels = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const TOPIC_A = `workspace:${A}`;
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';

function questionRow(content = 'What is due?'): Row {
  return { id: QUESTION, conversation_id: A, role: 'user', content, finished: true };
}

function answerRow(content: string, fields: Row = {}): Row {
  return {
    id: ANSWER,
    conversation_id: A,
    role: 'assistant',
    request_id: 42,
    tier: 'mid',
    content,
    tool_calls: [],
    finished: true,
    error_code: null,
    ...fields,
  };
}

function requestRow(state: string, fields: Row = {}): Row {
  return { id: 42, conversation_id: A, user_message_id: QUESTION, state, error_code: null, ...fields };
}

function turnRow(retrievalState: string): Row {
  return {
    request_id: 42,
    depth: 'standard',
    tier: 'mid',
    plan_state: 'planned',
    retrieval_state: retrievalState,
    found_n: 2,
    passages_n: 2,
    memory_n: 0,
    feed_rows: 98,
    attachments: [],
    created_at: '2026-10-15T14:00:00Z',
  };
}

function optionsRow(format: 'rich' | 'plain'): Row {
  return { request_id: 42, depth: 'standard', format, routine_id: null, course_display_id: null, course_ids: null };
}

function sourceRow(ord: number, fields: Row): Row {
  return {
    request_id: 42,
    ord,
    kind: 'material',
    origin: 'auto',
    file_id: 7,
    text_id: null,
    document_id: null,
    doc_text_id: null,
    course_id: 'IST.323',
    title: 'Week 5 slides.pptx',
    unit_kind: 'slide',
    unit_no: 3,
    ...fields,
  };
}

/** One finished question with its stored answer, and the 24b rows beside it. */
function seedDone(content: string, rows: { format?: 'rich' | 'plain' | null; retrieval?: string; sources?: Row[] } = {}) {
  const { format = 'rich', retrieval = 'found', sources = [] } = rows;
  fake.state.rows = {
    workspace_messages: [questionRow(), answerRow(content)],
    workspace_requests: [requestRow('done')],
    workspace_turns: [turnRow(retrieval)],
    workspace_request_options: format === null ? [] : [optionsRow(format)],
    workspace_sources: sources,
  };
}

function open(search = `c=${A}`) {
  fake.state.search = search;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

function turn(container: HTMLElement): HTMLElement {
  const found = container.querySelector('li[data-turn][data-request-id="42"]');
  if (!(found instanceof HTMLElement)) throw new Error('no turn for request 42');
  return found;
}

/** The answer body of the turn, once its text has been formatted. */
async function answerBody(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector('[data-answer-text]')).not.toBeNull());
  return container.querySelector('[data-answer-text]') as HTMLElement;
}

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a label in an answer', () => {
  it('is a chip, a button and never a link, when the request holds its source row', async () => {
    seedDone('Quiz 2 is on Friday [M12].', { sources: [sourceRow(1, { text_id: 12 })] });
    const { container } = open();

    const chip = await screen.findByRole('button', { name: labels.sourceChipLabel(1) });
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('data-source-ref', '1');
    expect(chip.closest('[data-answer-text]')).not.toBeNull();
    expect(container.querySelector('[data-answer-text] a')).toBeNull();
    expect(container.querySelector('[data-answer-text] [href]')).toBeNull();
  });

  it('opens the panel`s Sources tab at that answer when pressed', async () => {
    seedDone('Quiz 2 is on Friday [M12].', { sources: [sourceRow(1, { text_id: 12 })] });
    open();

    fireEvent.click(await screen.findByRole('button', { name: labels.sourceChipLabel(1) }));

    expect(fake.state.router.replace).toHaveBeenCalledWith(`/workspace?c=${A}&panel=sources`, { scroll: false });
    const panel = await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
    expect(panel).toHaveAttribute('data-panel', 'sources');
    expect(await within(panel).findByText('Week 5 slides.pptx')).toBeInTheDocument();
  });

  it('opens the Sources tab at its own row: the row is marked and scrolled into view (round 2, R2-5)', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    try {
      seedDone('The slides [M12] and your notes [U9].', {
        sources: [
          sourceRow(1, { text_id: 12 }),
          sourceRow(2, { kind: 'upload', file_id: null, document_id: 5, doc_text_id: 9, title: 'My notes.pdf' }),
        ],
      });
      open();

      fireEvent.click(await screen.findByRole('button', { name: labels.sourceChipLabel(2) }));

      const panel = await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
      const row = await waitFor(() => {
        const found = panel.querySelector('li[data-source-ref="2"]');
        if (found === null) throw new Error('no row 2 yet');
        return found;
      });
      await waitFor(() => expect(row).toHaveAttribute('aria-current', 'true'));
      expect(panel.querySelector('li[data-source-ref="1"]')).not.toHaveAttribute('aria-current');
      expect(scrolled).toContain(row);

      // The sources row picks the answer and no row: the mark goes.
      fireEvent.click(screen.getByRole('button', { name: '2 sources' }));
      await waitFor(() => expect(panel.querySelector('li[aria-current]')).toBeNull());
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('stays text when the request has no such row', async () => {
    seedDone('Something else [M99] and [U4].', { sources: [sourceRow(1, { text_id: 12 })] });
    const { container } = open();

    const body = await answerBody(container);
    await screen.findByRole('button', { name: labels.sourcesCountLine(1) });
    expect(within(body).queryAllByRole('button')).toHaveLength(0);
    expect(body).toHaveTextContent('Something else [M99] and [U4].');
  });
});

describe('the sources row under an answer', () => {
  it('counts the request`s rows, and opens the panel at them', async () => {
    seedDone('Two things.', {
      sources: [sourceRow(1, { text_id: 12 }), sourceRow(2, { kind: 'feed', file_id: null, title: 'Planner feed' })],
    });
    const { container } = open();

    const row = await screen.findByRole('button', { name: '2 sources' });
    expect(row).toHaveAttribute('data-sources');
    expect(container.querySelector('[data-used]')).toBeNull();
    fireEvent.click(row);
    expect(fake.state.router.replace).toHaveBeenCalledWith(`/workspace?c=${A}&panel=sources`, { scroll: false });
  });

  it('is absent for an answer with no row', async () => {
    seedDone('Nothing was looked up.');
    const { container } = open();
    await answerBody(container);
    await waitFor(() => expect(fake.state.log).toContain('from:workspace_sources'));
    expect(container.querySelector('[data-sources]')).toBeNull();
  });
});

describe('the answer`s format', () => {
  it('formats a rich answer', async () => {
    seedDone('# Plan\n\n- **Quiz 2** on Friday\n- reading');
    const { container } = open();
    const body = await answerBody(container);
    await waitFor(() => expect(body.querySelector('h2')).toHaveTextContent('Plan'));
    expect(body.querySelector('ul strong')).toHaveTextContent('Quiz 2');
  });

  it.each([
    ['plain', 'plain' as const],
    ['with no options row', null],
  ])('shows a %s answer as plain text', async (_name, format) => {
    seedDone('# Plan\n**Quiz 2** on Friday', { format });
    const { container } = open();
    const body = await answerBody(container);
    await waitFor(() => expect(fake.state.log).toContain('from:workspace_request_options'));
    expect(body).toHaveTextContent('# Plan **Quiz 2** on Friday');
    expect(body.querySelector('h2, h3, h4, strong, ul')).toBeNull();
  });
});

describe('a new question does not unformat the answers before it (round 2, R2-2a)', () => {
  it('keeps a rich answer formatted, and its fixed line, while the new ids` rows are read', async () => {
    seedDone('# Plan\n\n- **Quiz 2** on Friday', { retrieval: 'empty' });
    const { container } = open();
    const body = await answerBody(container);
    await waitFor(() => expect(body.querySelector('h2')).toHaveTextContent('Plan'));
    await waitFor(() => expect(turn(container)).toHaveAttribute('data-retrieval', 'empty'));
    // The options and turn rows of the new id list are held: only the requests and messages answer.
    const held = gate();
    fake.state.tableGates = { workspace_request_options: held.promise, workspace_turns: held.promise };

    fireEvent.change(screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL }), {
      target: { value: 'And the reading?' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL }), { key: 'Enter' });
    await screen.findByText('And the reading?', { selector: 'p' });
    await waitFor(() => expect(container.querySelectorAll('li[data-turn]')).toHaveLength(2));

    expect(turn(container).querySelector('[data-answer-text] h2')).toHaveTextContent('Plan');
    expect(turn(container).querySelector('[data-answer-text]')).not.toHaveTextContent('**');
    expect(turn(container)).toHaveAttribute('data-retrieval', 'empty');
    expect(turn(container).querySelector('[data-turn-line]')).toHaveTextContent(labels.RETRIEVAL_LINES.empty);
    await act(async () => {
      held.release();
      await held.promise;
    });
  });
});

describe('the fixed lines', () => {
  it('shows the nothing-matched line under an `empty` answer that does not already open with it', async () => {
    seedDone('Quiz 2 is on Friday.', { retrieval: 'empty' });
    const { container } = open();
    await waitFor(() => expect(turn(container)).toHaveAttribute('data-retrieval', 'empty'));
    expect(turn(container).querySelector('[data-turn-line]')).toHaveTextContent(labels.RETRIEVAL_LINES.empty);
  });

  it('does not say it twice when the runner wrote it as the answer`s first line (R-1)', async () => {
    seedDone(`${labels.RETRIEVAL_LINES.empty}\n\nQuiz 2 is on Friday.`, { retrieval: 'empty' });
    const { container } = open();
    await waitFor(() => expect(turn(container)).toHaveAttribute('data-retrieval', 'empty'));
    expect(turn(container).querySelector('[data-turn-line]')).toBeNull();
    const lines = (turn(container).querySelector('[data-answer-text]')?.textContent ?? '').split(
      labels.RETRIEVAL_LINES.empty,
    );
    expect(lines).toHaveLength(2);
  });

  it('shows the search-failed line under a `failed` answer', async () => {
    seedDone('Quiz 2 is on Friday.', { retrieval: 'failed' });
    const { container } = open();
    await waitFor(() => expect(turn(container)).toHaveAttribute('data-retrieval', 'failed'));
    expect(turn(container).querySelector('[data-turn-line]')).toHaveTextContent(labels.RETRIEVAL_LINES.failed);
  });

  it.each(['attached_only', 'found'])('shows no line for %s', async (state) => {
    seedDone('From the attached file: Quiz 2 is on Friday.', { retrieval: state });
    const { container } = open();
    await waitFor(() => expect(turn(container)).toHaveAttribute('data-retrieval', state));
    expect(turn(container).querySelector('[data-turn-line]')).toBeNull();
    expect(container.textContent).not.toContain(labels.RETRIEVAL_LINES.empty);
  });
});

describe('the searching line', () => {
  function seedClaimed(): void {
    fake.state.rows = {
      workspace_messages: [questionRow('Draft a plan')],
      workspace_requests: [requestRow('claimed')],
      workspace_request_options: [optionsRow('rich')],
    };
  }

  it('shows while a claimed request has no sources event and no text, and goes on the event', async () => {
    seedClaimed();
    const { container } = open();
    const channel = await joined(TOPIC_A);
    await waitFor(() =>
      expect(turn(container).querySelector('[data-turn-line]')).toHaveTextContent(labels.SEARCHING_LINE),
    );

    act(() => channel.emit('sources', { request_id: 42, state: 'found', found_n: 3 }));

    await waitFor(() => expect(turn(container)).not.toHaveTextContent(labels.SEARCHING_LINE));
    expect(turn(container).querySelector('[data-turn-line]')).toHaveTextContent(labels.LATE_STREAM_LINE);
  });

  it('goes on the first text', async () => {
    seedClaimed();
    const { container } = open();
    const channel = await joined(TOPIC_A);
    await waitFor(() => expect(turn(container)).toHaveTextContent(labels.SEARCHING_LINE));

    act(() => channel.emit('delta', { request_id: 42, seq: 1, delta: 'Week one: ' }));

    expect(turn(container)).not.toHaveTextContent(labels.SEARCHING_LINE);
    expect(turn(container).querySelector('[data-answer-text]')).toHaveTextContent('Week one:');
  });
});

describe('Stop', () => {
  it('leaves the page as it was for a delta that arrives after the cancel answered (R2-2b)', async () => {
    fake.state.rows = {
      workspace_messages: [questionRow('Draft a plan'), answerRow('', { finished: false })],
      workspace_requests: [requestRow('claimed')],
      workspace_request_options: [optionsRow('rich')],
    };
    const { container } = open();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: 42, seq: 1, delta: 'Week one: reading.' }));
    await waitFor(() => expect(screen.getByRole('button', { name: labels.STOP_LABEL })).toBeInTheDocument());
    const held = gate();
    fake.state.rpcGate = held.promise;

    fireEvent.click(screen.getByRole('button', { name: labels.STOP_LABEL }));
    // The stopped sentence at the press, before the database has answered.
    expect(turn(container)).toHaveAttribute('data-turn', 'stopped');
    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(fake.state.rows.workspace_requests[0]).toMatchObject({ state: 'cancelled' }));
    await waitFor(() => expect(fake.state.composer).toMatchObject({ busy: false }));

    act(() => channel.emit('delta', { request_id: 42, seq: 2, delta: ' Week two: the quiz.' }));

    expect(turn(container)).toHaveAttribute('data-turn', 'stopped');
    expect(turn(container).querySelector('[data-answer-text]')).toHaveTextContent('Week one: reading.');
    expect(container.textContent).not.toContain('Week two');
  });
});

describe('the date line (amendment (g))', () => {
  it('names today`s New York date and its weekday, on the thread and in the lobby', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-15T16:00:00Z'), shouldAdvanceTime: true });
    try {
      seedDone('Quiz 2.');
      const view = open();
      const line = await waitFor(() => {
        const found = document.querySelector('[data-today]');
        if (found === null) throw new Error('no date line yet');
        return found;
      });
      expect(line).toHaveAttribute('data-today', '2026-10-15');
      expect(line).toHaveTextContent('Today is Thursday, October 15, 2026.');
      view.unmount();

      open('');
      await waitFor(() => expect(document.querySelector('[data-today]')).toHaveAttribute('data-today', '2026-10-15'));
    } finally {
      vi.useRealTimers();
    }
  });
});
