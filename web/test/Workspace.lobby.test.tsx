/**
 * The lobby (Phase 24b, brief 111, task 8; W-87): `/workspace` with no
 * conversation. Read off the mounted `Lobby` over the fake client in
 * `composer-fake.tsx`.
 *
 * The task's deterministic check: no upcoming rows give no example row at all;
 * a press on an example fills the box and calls no RPC; the greeting holds no
 * name; the routines render from the rows; Recent shows the rows and View all
 * expands them. Around it: a routine shortcut sets the composer's routine chip,
 * the refresh steps through the examples, a first question moves the page, a
 * failure is said above the composer, and each block's failed read is said.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { ASKED, COURSES, db, readTables, resetDb, routine, settle, withClient, type Row } from './composer-fake';

vi.mock('@/lib/supabase/client', async () => (await import('./composer-fake')).supabaseClientMock());

const labels = await import('@/lib/workspace-labels');
const { Lobby } = await import('@/components/workspace/Lobby');
const { conversationHref } = await import('@/components/workspace/route');

/** Thursday, October 15, 2026, at noon in New York. */
const NOW = Date.parse('2026-10-15T16:00:00Z');

function item(id: string, dueOn: string, overrides: Row = {}): Row {
  return {
    item_kind: 'assignment',
    item_id: id,
    course_id: 'IST.323.M001',
    title: `Lab ${id}`,
    category: 'assignment',
    due_on: dueOn,
    status: 'not_started',
    in_workload: true,
    undated: false,
    ...overrides,
  };
}

function conversation(n: number): Row {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    title: `Conversation ${n}`,
    archived: false,
    updated_at: new Date(NOW - n * 3_600_000).toISOString(),
  };
}

function mount() {
  const onCreated = vi.fn();
  const view = render(withClient(<Lobby now={NOW} onCreated={onCreated} />, newQueryClient()));
  return { ...view, onCreated };
}

function lobby(container: HTMLElement): HTMLElement {
  const root = container.querySelector('[data-lobby]');
  if (!(root instanceof HTMLElement)) throw new Error('no lobby root');
  return root;
}

function box(): HTMLElement {
  return screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
}

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

beforeEach(() => {
  resetDb();
  db.state.rows = {
    v_course_display: COURSES,
    workspace_routines: [
      routine('quiz', { title: 'Quiz me', sort: 1 }),
      routine('plan', { title: 'Plan my week', grp: 'plan', sort: 2 }),
    ],
  };
});

describe('the greeting', () => {
  it('says the greeting line and holds no name: the lobby reads no profile', async () => {
    const { container } = mount();
    await settle();
    expect(lobby(container)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(labels.GREETING_LINE);
    expect(readTables()).not.toContain('workspace_profile');
    expect(screen.queryByText(labels.COLUMN_START_LINE)).toBeNull();
  });
});

describe('the routines', () => {
  it('render from the rows as shortcuts, and a press sets the composer\'s routine chip and sends nothing', async () => {
    const { container } = mount();
    const routines = await screen.findByRole('region', { name: labels.ROUTINES_HEADING });
    const buttons = await within(routines).findAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Quiz me', 'Plan my week']);

    fireEvent.click(within(routines).getByRole('button', { name: 'Plan my week' }));
    expect(screen.getByRole('group', { name: labels.routineChipLabel('Plan my week') })).toBeInTheDocument();
    fireEvent.click(within(routines).getByRole('button', { name: 'Quiz me' }));
    expect(container.querySelectorAll('[data-chip="routine"]')).toHaveLength(1);
    expect(screen.getByRole('group', { name: labels.routineChipLabel('Quiz me') })).toBeInTheDocument();
    expect(db.state.rpcCalls).toEqual([]);
  });

  it('say so when the routines could not be read', async () => {
    db.state.readErrors = { workspace_routines: { code: '42501', message: 'permission denied' } };
    mount();
    expect(await screen.findByText(labels.routinesProblemLine('permission denied'))).toBeInTheDocument();
  });
});

describe('the example prompts', () => {
  it('are absent, heading and all, when no upcoming row exists', async () => {
    db.state.rows = { ...db.state.rows, v_work_items: [] };
    mount();
    await screen.findByRole('region', { name: labels.ROUTINES_HEADING });
    await settle();
    expect(screen.queryByText(labels.EXAMPLES_HEADING)).toBeNull();
    expect(screen.queryByRole('button', { name: labels.REFRESH_EXAMPLES_LABEL })).toBeNull();
  });

  it('name real items by title and date; a press fills the box and calls no rpc', async () => {
    db.state.rows = { ...db.state.rows, v_work_items: [item('1', '2026-10-16'), item('2', '2026-10-20')] };
    mount();
    const examples = await screen.findByRole('region', { name: labels.EXAMPLES_HEADING });
    const first = labels.examplePromptLine('work', { title: 'Lab 1', course: 'IST 323', date: 'Fri Oct 16' });
    fireEvent.click(within(examples).getByRole('button', { name: first }));
    expect(box()).toHaveValue(first);
    await settle();
    expect(db.state.rpcCalls).toEqual([]);
    expect(within(examples).queryByRole('button', { name: labels.REFRESH_EXAMPLES_LABEL })).toBeNull();
  });

  it('show three at a time, and the refresh steps to the others', async () => {
    db.state.rows = {
      ...db.state.rows,
      v_work_items: ['1', '2', '3', '4'].map((id) => item(id, `2026-10-2${id}`)),
    };
    mount();
    const examples = await screen.findByRole('region', { name: labels.EXAMPLES_HEADING });
    const prompts = () =>
      within(examples)
        .getAllByRole('button')
        .filter((button) => button.textContent !== labels.REFRESH_EXAMPLES_LABEL)
        .map((button) => button.textContent ?? '');
    expect(prompts()).toHaveLength(3);
    expect(prompts().some((text) => text.includes('Lab 4'))).toBe(false);
    fireEvent.click(within(examples).getByRole('button', { name: labels.REFRESH_EXAMPLES_LABEL }));
    expect(prompts().some((text) => text.includes('Lab 4'))).toBe(true);
    expect(prompts()).toHaveLength(3);
  });

  it('say so when the upcoming work could not be read', async () => {
    db.state.readErrors = { v_work_items: { code: '42501', message: 'permission denied' } };
    mount();
    expect(await screen.findByText(labels.examplesProblemLine('permission denied'))).toBeInTheDocument();
  });
});

describe('recent conversations', () => {
  it('shows the five newest as links, and View all expands the block to every one in place', async () => {
    db.state.rows = { ...db.state.rows, workspace_conversations: [1, 2, 3, 4, 5, 6, 7].map(conversation) };
    mount();
    const recent = await screen.findByRole('region', { name: labels.RECENT_HEADING });
    const links = await within(recent).findAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      [1, 2, 3, 4, 5].map((n) => conversationHref(String(conversation(n).id))),
    );
    expect(links[0]).toHaveTextContent('Conversation 1');
    expect(links[0]).toHaveTextContent('1 hr ago');

    const viewAll = within(recent).getByRole('button', { name: labels.VIEW_ALL_LABEL });
    expect(viewAll).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(viewAll);
    expect(within(recent).getAllByRole('link')).toHaveLength(7);
    expect(within(recent).queryByRole('button', { name: labels.VIEW_ALL_LABEL })).toBeNull();
  });

  it('has no View all with five or fewer, and says when there are none', async () => {
    db.state.rows = { ...db.state.rows, workspace_conversations: [conversation(1)] };
    const first = mount();
    const recent = await screen.findByRole('region', { name: labels.RECENT_HEADING });
    await within(recent).findByRole('link');
    expect(within(recent).queryByRole('button', { name: labels.VIEW_ALL_LABEL })).toBeNull();
    first.unmount();

    db.state.rows = { ...db.state.rows, workspace_conversations: [] };
    mount();
    expect(await screen.findByText(labels.NO_CONVERSATIONS_LINE)).toBeInTheDocument();
  });

  it('says so when the conversations could not be read', async () => {
    db.state.readErrors = { workspace_conversations: { code: '42501', message: 'permission denied' } };
    mount();
    expect(await screen.findByText(labels.conversationsProblemLine('permission denied'))).toBeInTheDocument();
  });
});

describe('the composer in the lobby', () => {
  it('asks into a new conversation and hands its id to onCreated', async () => {
    const { onCreated } = mount();
    fireEvent.change(box(), { target: { value: 'What is due?' } });
    fireEvent.click(screen.getByRole('button', { name: labels.ASK_LABEL }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(ASKED.conversationId));
    expect(db.state.rpcCalls[0]).toMatchObject({ fn: 'workspace_ask_with', args: { p_conversation_id: null } });
  });

  it('says a failure above the composer, and the line goes once the text changes', async () => {
    db.state.rpc.workspace_ask_with = () => ({ data: null, error: { code: 'XX000', message: 'the network fell over' } });
    const { onCreated, container } = mount();
    fireEvent.change(box(), { target: { value: 'Hello?' } });
    fireEvent.click(screen.getByRole('button', { name: labels.ASK_LABEL }));
    const line = await screen.findByRole('alert');
    expect(line).toHaveTextContent(labels.askProblemLine('the network fell over'));
    expect(line.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: 'Hello again?' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(lobby(container)).toBeInTheDocument();
  });
});

describe('each block while it loads', () => {
  it('shows no row and no spinner until its read answers', async () => {
    let release: () => void = () => undefined;
    db.state.readGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.state.rows = {
      ...db.state.rows,
      v_work_items: [item('1', '2026-10-16')],
      workspace_conversations: [conversation(1)],
    };
    const { container } = mount();
    await settle();
    expect(screen.queryByText('Quiz me')).toBeNull();
    expect(screen.queryByText('Conversation 1')).toBeNull();
    expect(screen.queryByText(labels.NO_CONVERSATIONS_LINE)).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    await act(async () => release());
    expect(await screen.findByText('Conversation 1')).toBeInTheDocument();
    expect(region(labels.EXAMPLES_HEADING)).toBeInTheDocument();
  });
});
