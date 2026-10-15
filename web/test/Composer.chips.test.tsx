/**
 * The composer (Phase 24b, brief 111, task 7; W-87): its chips, its two menus
 * and its ask, read off the mounted component over the fake client in
 * `composer-fake.tsx`.
 *
 * The task's deterministic check: Ask sends the options (the `workspace_ask_with`
 * payload holds the six keys); Deep returns to Auto after one question; a file
 * routine with no file keeps Ask off and says why; Backspace in an empty box
 * removes the last chip; a refusal shows under the box; any other error reaches
 * `onAskError`; the button is enabled whenever nothing is on its way (amendment
 * (h)). Around it: Enter and Shift+Enter, Stop, the restored chips, the limit of
 * five, and `initialText`.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComposerProps } from '@/components/workspace/composer-contract';
import { newQueryClient } from './hydration-harness';
import { ASKED, COURSES, bbFile, db, resetDb, routine, settle, withClient } from './composer-fake';

vi.mock('@/lib/supabase/client', async () => (await import('./composer-fake')).supabaseClientMock());

const labels = await import('@/lib/workspace-labels');
const { Composer } = await import('@/components/workspace/Composer');
const { setComposerDepth } = await import('@/components/workspace/depth-store');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const FILE_ROUTINE = routine('explain', { title: 'Explain a file', needs: 'file' });

function mount(overrides: Partial<ComposerProps> = {}) {
  const handlers = { onAsked: vi.fn(), onAskError: vi.fn(), onStop: vi.fn(), onEdit: vi.fn() };
  const base: ComposerProps = {
    conversationId: A,
    requestIds: [],
    requestOpen: false,
    busy: false,
    disabled: false,
    ...handlers,
  };
  const client = newQueryClient();
  const props = { ...base, ...overrides };
  const view = render(withClient(<Composer {...props} />, client));
  const rerender = (next: Partial<ComposerProps>) =>
    view.rerender(withClient(<Composer {...props} {...next} />, client));
  return { ...view, ...handlers, rerender };
}

function box(): HTMLElement {
  return screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
}

function type(text: string): HTMLElement {
  fireEvent.change(box(), { target: { value: text } });
  return box();
}

function askButton(): HTMLElement {
  return screen.getByRole('button', { name: labels.ASK_LABEL });
}

function depthButton(container: HTMLElement): HTMLElement {
  const button = container.querySelector('[data-depth]');
  if (!(button instanceof HTMLElement)) throw new Error('no depth button');
  return button;
}

function chips(container: HTMLElement, kind: string): Element[] {
  return [...container.querySelectorAll(`[data-chip="${kind}"]`)];
}

async function pickDepth(container: HTMLElement, label: string): Promise<void> {
  fireEvent.click(depthButton(container));
  const menu = screen.getByRole('menu', { name: labels.DEPTH_MENU_LABEL });
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: new RegExp(`^${label}`) }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

async function pickCourse(code: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: labels.courseChipLabel(labels.ALL_COURSES_LABEL) }));
  const menu = screen.getByRole('menu', { name: labels.COURSE_MENU_LABEL });
  fireEvent.click(await within(menu).findByRole('menuitemradio', { name: code }));
}

async function pickRoutine(title: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
  fireEvent.click(screen.getByRole('menuitem', { name: labels.USE_ROUTINE_LABEL }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
}

async function attachFile(title: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
  fireEvent.click(screen.getByRole('menuitem', { name: labels.ATTACH_FROM_MATERIALS_LABEL }));
  const dialog = screen.getByRole('dialog', { name: labels.ATTACH_FROM_MATERIALS_LABEL });
  fireEvent.click(await within(dialog).findByRole('button', { name: title }));
}

function askCalls() {
  return db.state.rpcCalls.filter((call) => call.fn === 'workspace_ask_with');
}

beforeEach(() => {
  resetDb();
  setComposerDepth('auto');
  db.state.rows = {
    v_course_display: COURSES,
    workspace_routines: [FILE_ROUTINE, routine('plan', { title: 'Plan my week', grp: 'plan', sort: 2 })],
    v_bb_files_current: [bbFile(11), bbFile(12)],
  };
});

describe('Ask sends the options', () => {
  it('calls workspace_ask_with with the six keys of the chosen options, then hands the result to onAsked', async () => {
    const { container, onAsked } = mount();
    await pickCourse('IST 323');
    await pickDepth(container, 'Quick');
    type('What is due?');
    fireEvent.click(askButton());

    await waitFor(() => expect(onAsked).toHaveBeenCalledTimes(1));
    expect(askCalls()).toEqual([
      {
        fn: 'workspace_ask_with',
        args: {
          p_conversation_id: A,
          p_text: 'What is due?',
          p_options: { course: 'IST.323', depth: 'quick', routine: null, format: 'rich', files: [], uploads: [] },
        },
      },
    ]);
    expect(Object.keys(askCalls()[0].args.p_options as object).sort()).toEqual(
      ['course', 'depth', 'files', 'format', 'routine', 'uploads'],
    );
    expect(onAsked).toHaveBeenCalledWith(ASKED);
    expect(box()).toHaveValue('');
    expect(screen.getByRole('button', { name: labels.courseChipLabel('IST 323') })).toHaveAttribute(
      'data-chip',
      'course',
    );
  });

  it('asks on Enter, breaks the line on Shift+Enter, and sends nothing on Enter while a request is open', async () => {
    const { rerender, onStop } = mount();
    fireEvent.keyDown(type('one'), { key: 'Enter', shiftKey: true });
    await settle();
    expect(askCalls()).toEqual([]);

    rerender({ requestOpen: true });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await settle();
    expect(askCalls()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: labels.STOP_LABEL }));
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender({ requestOpen: false });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(askCalls()).toHaveLength(1));
  });

  it('sends the files picked from the materials in chip order', async () => {
    const { onAsked } = mount();
    await attachFile('Week 12 slides.pptx');
    await attachFile('Week 11 slides.pptx');
    type('Compare them');
    fireEvent.click(askButton());
    await waitFor(() => expect(onAsked).toHaveBeenCalled());
    expect((askCalls()[0].args.p_options as { files: number[] }).files).toEqual([12, 11]);
    expect(screen.queryAllByRole('group', { name: /^Attached:/ })).toEqual([]);
  });
});

describe('the depth menu', () => {
  it('starts on Auto and lists the four depths with their notes', () => {
    const { container } = mount();
    expect(depthButton(container)).toHaveAttribute('data-depth', 'auto');
    fireEvent.click(depthButton(container));
    const items = within(screen.getByRole('menu', { name: labels.DEPTH_MENU_LABEL })).getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      `${labels.DEPTH_LABELS.auto}${labels.DEPTH_NOTES.auto}`,
      `${labels.DEPTH_LABELS.quick}${labels.DEPTH_NOTES.quick}`,
      `${labels.DEPTH_LABELS.standard}${labels.DEPTH_NOTES.standard}`,
      `${labels.DEPTH_LABELS.deep}${labels.DEPTH_NOTES.deep}`,
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('applies Deep to one question, then reads Auto again; Quick stays', async () => {
    const { container, onAsked } = mount();
    await pickDepth(container, 'Deep');
    expect(depthButton(container)).toHaveAttribute('data-depth', 'deep');
    type('Go deep');
    fireEvent.click(askButton());
    await waitFor(() => expect(onAsked).toHaveBeenCalledTimes(1));
    expect((askCalls()[0].args.p_options as { depth: string }).depth).toBe('deep');
    expect(depthButton(container)).toHaveAttribute('data-depth', 'auto');

    await pickDepth(container, 'Quick');
    type('Quickly');
    fireEvent.click(askButton());
    await waitFor(() => expect(onAsked).toHaveBeenCalledTimes(2));
    expect(depthButton(container)).toHaveAttribute('data-depth', 'quick');
  });

  it('moves with the arrows, Home and End, and Esc closes it and hands focus back', () => {
    const { container } = mount();
    fireEvent.click(depthButton(container));
    const menu = screen.getByRole('menu', { name: labels.DEPTH_MENU_LABEL });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(depthButton(container)).toHaveFocus();
  });
});

describe('a routine', () => {
  it('needing a file keeps Ask off and says why, until a file is attached', async () => {
    const { container, onAsked } = mount();
    await pickRoutine('Explain a file');
    expect(chips(container, 'routine')).toHaveLength(1);
    expect(screen.getByRole('group', { name: labels.routineChipLabel('Explain a file') })).toBeInTheDocument();
    const line = labels.routineNeedsFileLine('Explain a file');
    expect(screen.getByText(line)).toBeInTheDocument();

    type('Explain it');
    fireEvent.click(askButton());
    fireEvent.keyDown(box(), { key: 'Enter' });
    await settle();
    expect(askCalls()).toEqual([]);
    expect(askButton()).toHaveAttribute('aria-disabled', 'true');

    await attachFile('Week 11 slides.pptx');
    expect(screen.queryByText(line)).toBeNull();
    fireEvent.click(askButton());
    await waitFor(() => expect(onAsked).toHaveBeenCalled());
    expect(askCalls()[0].args.p_options).toMatchObject({ routine: 'explain', files: [11] });
  });

  it('lists the routines by group with a search field and a no-match line', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
    fireEvent.click(screen.getByRole('menuitem', { name: labels.USE_ROUTINE_LABEL }));
    expect(await screen.findByRole('heading', { name: labels.ROUTINE_GROUP_HEADINGS.study })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: labels.ROUTINE_GROUP_HEADINGS.plan })).toBeInTheDocument();
    expect(screen.getByText('What explain does.')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: labels.ROUTINE_FILTER_PLACEHOLDER });
    fireEvent.change(search, { target: { value: 'week' } });
    expect(screen.queryByRole('button', { name: /^Explain a file/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Plan my week/ })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(labels.NO_ROUTINE_MATCH_LINE)).toBeInTheDocument();
  });

  it('says so when the routines could not be read', async () => {
    db.state.readErrors = { workspace_routines: { code: '42501', message: 'permission denied' } };
    mount();
    fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
    fireEvent.click(screen.getByRole('menuitem', { name: labels.USE_ROUTINE_LABEL }));
    expect(await screen.findByText(labels.routinesProblemLine('permission denied'))).toBeInTheDocument();
  });
});

describe('Backspace in an empty box', () => {
  it('removes the last chip, one per press, and leaves typed text alone', async () => {
    const { container } = mount();
    await pickRoutine('Plan my week');
    await attachFile('Week 11 slides.pptx');
    expect(chips(container, 'file')).toHaveLength(1);

    fireEvent.keyDown(type('x'), { key: 'Backspace' });
    expect(chips(container, 'file')).toHaveLength(1);

    fireEvent.keyDown(type(''), { key: 'Backspace' });
    expect(chips(container, 'file')).toHaveLength(0);
    expect(chips(container, 'routine')).toHaveLength(1);
    fireEvent.keyDown(box(), { key: 'Backspace' });
    expect(chips(container, 'routine')).toHaveLength(0);
  });

  it('is what the Remove button on a chip does too', async () => {
    const { container } = mount();
    await attachFile('Week 11 slides.pptx');
    const chip = screen.getByRole('group', { name: labels.attachmentChipLabel('Week 11 slides.pptx') });
    fireEvent.click(within(chip).getByRole('button', { name: labels.REMOVE_CHIP_LABEL }));
    expect(chips(container, 'file')).toHaveLength(0);
  });
});

describe('a refused question, and any other failure', () => {
  it.each([
    ['23505', 'duplicate key value', 'REFUSAL_STILL_ANSWERING'],
    ['23514', 'check', 'REFUSAL_OPTIONS_REJECTED'],
    ['42501', 'denied', 'NOT_OWNER_LINE'],
  ] as const)('shows the sentence for %s under the box and keeps the text', async (code, message, sentence) => {
    db.state.rpc.workspace_ask_with = () => ({ data: null, error: { code, message } });
    const { onAskError, onAsked } = mount();
    type('Still there?');
    fireEvent.click(askButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(labels[sentence]);
    expect(onAskError).not.toHaveBeenCalled();
    expect(onAsked).not.toHaveBeenCalled();
    expect(box()).toHaveValue('Still there?');
  });

  it('refuses an empty question before any request, and the line goes once the text changes', async () => {
    const { onEdit } = mount();
    fireEvent.click(askButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.REFUSAL_QUESTION_LENGTH);
    expect(askCalls()).toEqual([]);
    type('Now a question');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onEdit).toHaveBeenCalled();
  });

  it('hands an error that is not a refusal to onAskError and keeps the text', async () => {
    const failure = { code: 'XX000', message: 'the network fell over' };
    db.state.rpc.workspace_ask_with = () => ({ data: null, error: failure });
    const { onAskError } = mount();
    type('Hello?');
    fireEvent.click(askButton());

    await waitFor(() => expect(onAskError).toHaveBeenCalledWith(failure));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box()).toHaveValue('Hello?');
  });
});

describe('the button (amendment (h))', () => {
  it('is enabled while nothing is on its way, and disabled only by busy, a pending ask or a missing conversation', async () => {
    let release: () => void = () => undefined;
    db.state.rpc.workspace_ask_with = () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ data: { conversation_id: A, message_id: ASKED.messageId, request_id: 7 }, error: null });
      });
    const { rerender, onAsked } = mount();
    expect(askButton()).toBeEnabled();
    expect(askButton()).not.toHaveAttribute('aria-busy');

    type('Wait for it');
    fireEvent.click(askButton());
    await waitFor(() => expect(askButton()).toBeDisabled());
    release();
    await waitFor(() => expect(onAsked).toHaveBeenCalled());
    expect(askButton()).toBeEnabled();

    rerender({ busy: true });
    expect(askButton()).toBeDisabled();
    rerender({ busy: false, disabled: true });
    expect(askButton()).toBeDisabled();
    expect(box()).toBeDisabled();
    fireEvent.keyDown(type('nothing'), { key: 'Enter' });
    await settle();
    expect(askCalls()).toHaveLength(1);
    rerender({ disabled: false });
    expect(askButton()).toBeEnabled();
  });
});

describe('the restored chips', () => {
  it('restores the course and the routine of the last request, never its depth', async () => {
    db.state.rows = {
      ...db.state.rows,
      workspace_request_options: [
        { request_id: 41, depth: 'quick', format: 'rich', routine_id: null, course_display_id: 'MAS.362', course_ids: null },
        { request_id: 42, depth: 'deep', format: 'rich', routine_id: 'plan', course_display_id: 'IST.323', course_ids: null },
      ],
    };
    const { container } = mount({ requestIds: [41, 42] });
    expect(await screen.findByRole('button', { name: labels.courseChipLabel('IST 323') })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: labels.routineChipLabel('Plan my week') })).toBeInTheDocument();
    expect(depthButton(container)).toHaveAttribute('data-depth', 'auto');
  });

  it('says so when the options rows could not be read', async () => {
    db.state.readErrors = { workspace_request_options: { code: '42501', message: 'permission denied' } };
    mount({ requestIds: [42] });
    expect(await screen.findByText(labels.optionsProblemLine('permission denied'))).toBeInTheDocument();
  });
});

describe('the course menu', () => {
  it('lists All courses first, then the classes, and All courses clears the pick', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: labels.courseChipLabel(labels.ALL_COURSES_LABEL) }));
    const menu = screen.getByRole('menu', { name: labels.COURSE_MENU_LABEL });
    await within(menu).findByRole('menuitemradio', { name: 'IST 323' });
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      labels.ALL_COURSES_LABEL,
      'IST 323',
      'MAS 362',
    ]);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'MAS 362' }));
    fireEvent.click(screen.getByRole('button', { name: labels.courseChipLabel('MAS 362') }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: labels.ALL_COURSES_LABEL }));
    expect(screen.getByRole('button', { name: labels.courseChipLabel(labels.ALL_COURSES_LABEL) })).toBeInTheDocument();
  });
});

describe('the limit of five', () => {
  it('refuses the sixth attachment with its line', async () => {
    db.state.rows = { ...db.state.rows, v_bb_files_current: [1, 2, 3, 4, 5, 6].map((id) => bbFile(id)) };
    const { container } = mount();
    for (const id of [1, 2, 3, 4, 5]) await attachFile(`Week ${id} slides.pptx`);
    expect(chips(container, 'file')).toHaveLength(5);
    await attachFile('Week 6 slides.pptx');
    expect(chips(container, 'file')).toHaveLength(5);
    expect(screen.getByText(labels.ATTACHMENTS_LIMIT_LINE)).toBeInTheDocument();
  });
});

describe('initialText', () => {
  it('fills the box when it changes and sends nothing', async () => {
    const { rerender } = mount({ initialText: undefined });
    expect(box()).toHaveValue('');
    rerender({ initialText: 'Help me plan IST 323' });
    expect(box()).toHaveValue('Help me plan IST 323');
    type('my own words');
    rerender({ initialText: 'Help me plan IST 323' });
    expect(box()).toHaveValue('my own words');
    await settle();
    expect(askCalls()).toEqual([]);
  });
});

describe('the routine list at the phone step', () => {
  it('opens as a sheet at 720 px and under, and a pick closes it', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(max-width: 720px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = mount();
      fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
      fireEvent.click(screen.getByRole('menuitem', { name: labels.USE_ROUTINE_LABEL }));
      const sheet = screen.getByRole('dialog', { name: labels.USE_ROUTINE_LABEL });
      fireEvent.click(await within(sheet).findByRole('button', { name: /^Plan my week/ }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(chips(container, 'routine')).toHaveLength(1);
    } finally {
      window.matchMedia = original;
    }
  });

  it('steps from the search field into the routines with the arrows', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
    fireEvent.click(screen.getByRole('menuitem', { name: labels.USE_ROUTINE_LABEL }));
    const first = await screen.findByRole('button', { name: /^Explain a file/ });
    const search = screen.getByRole('searchbox', { name: labels.ROUTINE_FILTER_PLACEHOLDER });
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: labels.ADD_MENU_LABEL })).toHaveFocus();
  });
});

describe('the depth across a remount (R2-1)', () => {
  it('keeps Standard when the composer mounts again, as the lobby hands over to the thread', async () => {
    const lobby = mount({ conversationId: null });
    await pickDepth(lobby.container, 'Standard');
    lobby.unmount();
    const thread = mount({ conversationId: A });
    expect(depthButton(thread.container)).toHaveAttribute('data-depth', 'standard');
  });

  it('reads Auto after a Deep question, in the next mount too', async () => {
    const lobby = mount({ conversationId: null });
    await pickDepth(lobby.container, 'Deep');
    type('Go deep');
    fireEvent.click(askButton());
    await waitFor(() => expect(lobby.onAsked).toHaveBeenCalled());
    expect((askCalls()[0].args.p_options as { depth: string }).depth).toBe('deep');
    lobby.unmount();
    const thread = mount({ conversationId: A });
    expect(depthButton(thread.container)).toHaveAttribute('data-depth', 'auto');
  });
});
