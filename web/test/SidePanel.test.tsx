/**
 * The Workspace's side panel (Phase 24b, task 10; brief 111, "The side panel",
 * "Sources", "Deleting an upload, in 24a's two steps", "The index status
 * line", "Memory, switched on").
 *
 * Each state of the Contract's table for the three tabs, read off the mounted
 * panel over the fake client in `workspace-harness.tsx`:
 *
 *   * Sources: no answer picked; loading; rows, cited first; nothing matched;
 *     the read failed; and what Open does for each kind of row;
 *   * Files: no uploads; waiting, reading, indexing, ready; failed with its
 *     reason and Try again; removing (a delete that did not finish) with Try
 *     again; Delete in two presses; filtered and none matching; the index
 *     status lines;
 *   * Memory: About me empty, editing, saved, too long, failed; the items,
 *     filtered, none matching, Delete in two presses, failed.
 *
 * Typing in either filter field narrows the rows and sends nothing. The fold
 * button and its route are at the end, on the mounted screen.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, gate, resetFake, settle, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());
vi.mock('@/components/workspace/Composer', async () => (await import('./workspace-harness')).composerMock());
vi.mock('@/components/workspace/Lobby', async () => (await import('./workspace-harness')).lobbyMock());

const labels = await import('@/lib/workspace-labels');
const { SidePanel, tabForKey } = await import('@/components/workspace/SidePanel');
const { panelHref, parsePanelTab } = await import('@/components/workspace/route');
const { parseAnswer } = await import('@/lib/answer-format');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

type PanelTab = 'sources' | 'files' | 'memory';

const NOW = Date.parse('2026-10-15T15:00:00Z');
const HOUR_AGO = '2026-10-15T14:00:00Z';
const SHA = 'a'.repeat(64);

function sourceRow(ord: number, fields: Row): Row {
  return {
    request_id: 42,
    ord,
    kind: 'material',
    origin: 'auto',
    file_id: null,
    text_id: null,
    document_id: null,
    doc_text_id: null,
    course_id: 'IST.323',
    title: null,
    unit_kind: null,
    unit_no: null,
    ...fields,
  };
}

const SOURCES: Row[] = [
  sourceRow(1, { file_id: 7, text_id: 12, title: 'Week 5 slides.pptx', unit_kind: 'slide', unit_no: 3 }),
  sourceRow(2, { kind: 'upload', origin: 'attached', document_id: 5, doc_text_id: 9, title: 'My notes.pdf' }),
  sourceRow(3, { kind: 'memory', origin: 'tool', document_id: 8, title: 'Quiz plan', course_id: null }),
  sourceRow(4, { kind: 'feed', title: 'Your planner feed', course_id: null }),
];

function upload(id: number, state: string, fields: Row = {}): Row {
  return {
    id,
    kind: 'upload',
    title: `Upload ${id}.pdf`,
    state,
    error_code: null,
    mime: 'application/pdf',
    byte_size: 1000,
    sha256: SHA,
    storage_key: `u/${SHA}`,
    course_id: null,
    conversation_id: null,
    attempts: 1,
    created_at: HOUR_AGO,
    updated_at: HOUR_AGO,
    ...fields,
  };
}

const INDEX_STATUS: Row = {
  course_units_indexed: 120,
  course_units_waiting: 3,
  course_last_embedded: HOUR_AGO,
  course_files_text_pending: 0,
  uploads_indexed: 2,
  uploads_waiting: 1,
  uploads_failed: 1,
  upload_links_expired: 0,
  uploads_deleting: 1,
  memory_indexed: 1,
  memory_waiting: 0,
  memory_failed: 0,
  ingest_polled_age_seconds: 4,
};

function memoryDocument(id: number, title: string, updatedAt: string): Row {
  return { id, kind: 'memory', title, state: 'indexed', conversation_id: null, created_at: updatedAt, updated_at: updatedAt };
}

function seed(): void {
  fake.state.rows = {
    workspace_sources: SOURCES,
    v_bb_files_current: [
      { id: 7, course_id: 'IST.323', file_name: 'Week 5 slides.pptx', storage_path: 'bb-files/w5.pptx', local_path: null, source_url: null },
    ],
    workspace_documents: [
      upload(5, 'indexed', { title: 'My notes.pdf' }),
      upload(6, 'failed', { title: 'Scan.pdf', error_code: 'no_text' }),
      upload(10, 'deleting', { title: 'Old draft.docx' }),
      upload(11, 'stored', { title: 'Reading list.md' }),
      upload(12, 'reading', { title: 'Lecture 4.pptx' }),
      upload(13, 'text_ready', { title: 'Budget.xlsx' }),
      memoryDocument(8, 'Quiz plan', HOUR_AGO),
      memoryDocument(9, 'Reading habits', '2026-10-14T10:00:00Z'),
    ],
    v_workspace_memory: [
      { document_id: 8, summary: 'He plans quizzes a week out.' },
      { document_id: 9, summary: 'He reads in the morning.' },
    ],
    workspace_profile: [{ id: 1, about_me: 'I study IST at Syracuse.', memory_since: null, updated_at: HOUR_AGO }],
    v_workspace_index_status: [INDEX_STATUS],
  };
}

interface MountOptions {
  tab?: PanelTab;
  requestId?: number | null;
  answer?: string;
}

function mount({ tab = 'sources', requestId = 42, answer = '' }: MountOptions = {}) {
  const onTab = vi.fn();
  const onHide = vi.fn();
  const view = render(
    <QueryClientProvider client={newQueryClient()}>
      <SidePanel
        tab={tab}
        sourcesRequestId={requestId}
        sourcesBlocks={parseAnswer(answer)}
        now={NOW}
        onTab={onTab}
        onHide={onHide}
      />
    </QueryClientProvider>,
  );
  return { ...view, onTab, onHide, panel: screen.getByRole('region', { name: labels.PANEL_REGION_LABEL }) };
}

function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest('li');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${title}`);
  return row;
}

function reads(): number {
  return fake.state.log.filter((entry) => entry.startsWith('from:')).length;
}

beforeEach(() => {
  resetFake();
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the panel`s route', () => {
  const C = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

  it('keeps ?c= and names the tab, and folds by dropping the parameter', () => {
    expect(panelHref(C, 'files')).toBe(`/workspace?c=${C}&panel=files`);
    expect(panelHref(C, null)).toBe(`/workspace?c=${C}`);
    expect(panelHref(null, 'memory')).toBe('/workspace?panel=memory');
    expect(panelHref(null, null)).toBe('/workspace');
  });

  it('reads a tab from the parameter, and anything else as folded', () => {
    expect(parsePanelTab('sources')).toBe('sources');
    expect(parsePanelTab('memory')).toBe('memory');
    expect(parsePanelTab('other')).toBeNull();
    expect(parsePanelTab(null)).toBeNull();
  });
});

describe('the panel', () => {
  it('is a region named Details, its root carrying the open tab', () => {
    const { panel } = mount({ tab: 'files' });
    expect(panel).toHaveAttribute('data-panel', 'files');
    const tabs = within(panel).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Sources', 'Files', 'Memory']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(within(panel).getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[1].id);
  });

  it('moves between tabs with the arrows, Home and End, and the focus goes with it', () => {
    const { panel, onTab } = mount({ tab: 'sources' });
    const tabs = within(panel).getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(onTab).toHaveBeenLastCalledWith('files');
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(onTab).toHaveBeenLastCalledWith('memory');
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(onTab).toHaveBeenLastCalledWith('memory');
    fireEvent.click(tabs[1]);
    expect(onTab).toHaveBeenLastCalledWith('files');

    expect(tabForKey('memory', 'ArrowRight')).toBe('sources');
    expect(tabForKey('files', 'Home')).toBe('sources');
    expect(tabForKey('files', 'a')).toBeNull();
  });

  it('folds itself away through the one Hide panel button', () => {
    const { onHide } = mount();
    fireEvent.click(screen.getByRole('button', { name: labels.HIDE_PANEL_LABEL }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('the Sources tab', () => {
  it('asks for an answer when none is picked, and reads nothing', async () => {
    mount({ requestId: null });
    expect(screen.getByText(labels.NO_ANSWER_PICKED_LINE)).toBeInTheDocument();
    await settle();
    expect(fake.state.log).not.toContain('from:workspace_sources');
  });

  it('says it is loading while the rows are read', async () => {
    const held = gate();
    fake.state.readGate = held.promise;
    mount();
    await settle();
    expect(screen.getByText(labels.SOURCES_LOADING_LINE)).toBeInTheDocument();
    await act(async () => {
      held.release();
      await held.promise;
    });
    await screen.findByText('Week 5 slides.pptx');
  });

  it('lists the cited rows first, in the answer`s order, then the rest by number, each saying what it is', async () => {
    mount({ answer: 'Your notes [U9] and the slides [M12].' });
    await screen.findByText('Week 5 slides.pptx');

    const rows = [...document.querySelectorAll('[data-source-row]')].map((row) => row.getAttribute('data-source-row'));
    expect(rows).toEqual(['2', '1', '3', '4']);
    expect(rowOf('Week 5 slides.pptx')).toHaveTextContent('Course file · IST.323 · slide 3');
    expect(rowOf('My notes.pdf')).toHaveTextContent('Upload · IST.323 · Attached');
    expect(rowOf('Quiz plan')).toHaveTextContent('Remembered · Opened by the assistant');
    expect(rowOf('Your planner feed')).toHaveTextContent('Planner');
    expect(within(rowOf('My notes.pdf')).getByLabelText(labels.sourceChipLabel(2))).toHaveTextContent('2');
  });

  it('says no source was used for an answer with no row', async () => {
    mount({ requestId: 43 });
    expect(await screen.findByText(labels.NO_SOURCES_LINE)).toBeInTheDocument();
  });

  it('says the rows could not be read', async () => {
    fake.state.readErrors = { workspace_sources: { code: '42501', message: 'permission denied' } };
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the sources: permission denied');
  });

  it('opens a course file through its stored copy, the planner as a link, and a remembered item in the Memory tab', async () => {
    const { onTab } = mount();
    await screen.findByText('Week 5 slides.pptx');

    await waitFor(() =>
      expect(within(rowOf('Week 5 slides.pptx')).getByRole('button', { name: labels.OPEN_SOURCE_LABEL })).toBeInTheDocument(),
    );
    expect(within(rowOf('Your planner feed')).getByRole('link', { name: labels.OPEN_SOURCE_LABEL })).toHaveAttribute('href', '/planner');
    fireEvent.click(within(rowOf('Quiz plan')).getByRole('button', { name: labels.OPEN_SOURCE_LABEL }));
    expect(onTab).toHaveBeenCalledWith('memory');
  });

  it('opens an upload through a short signed link of its key, in a tab opened inside the press', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    mount();
    await screen.findByText('My notes.pdf');
    const button = await within(rowOf('My notes.pdf')).findByRole('button', { name: labels.OPEN_SOURCE_LABEL });

    fireEvent.click(button);

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    await waitFor(() => expect(tab.location.href).toBe(`https://storage.test/workspace-uploads/u/${SHA}?seconds=3600`));
    expect(fake.state.storage.signed).toEqual([`workspace-uploads/u/${SHA}`]);
  });

  it('says so when the upload`s link cannot be made, and closes the blank tab', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    fake.state.storage.signError = { message: 'Object not found' };
    mount();
    await screen.findByText('My notes.pdf');
    fireEvent.click(await within(rowOf('My notes.pdf')).findByRole('button', { name: labels.OPEN_SOURCE_LABEL }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this file: Object not found');
    expect(tab.close).toHaveBeenCalled();
  });
});

describe('the Files tab', () => {
  it('says there are no uploads once the list has answered with none', async () => {
    fake.state.rows = { ...fake.state.rows, workspace_documents: [] };
    mount({ tab: 'files' });
    expect(await screen.findByText(labels.NO_UPLOADS_LINE)).toBeInTheDocument();
  });

  it('names each upload`s state in words, on the row', async () => {
    mount({ tab: 'files' });
    await screen.findByText('My notes.pdf');
    const states = [...document.querySelectorAll('[data-upload-state]')].map((row) => [
      row.getAttribute('data-upload-state'),
      within(row as HTMLElement).getByText(labels.DOCUMENT_STATE_LABELS[row.getAttribute('data-upload-state') as 'stored']).textContent,
    ]);
    expect(states).toEqual([
      ['indexed', 'Indexed'],
      ['failed', 'Failed'],
      ['deleting', 'Removing'],
      ['stored', 'Waiting'],
      ['reading', 'Reading'],
      ['text_ready', 'Indexing'],
    ]);
    expect(screen.queryByText('Quiz plan')).toBeNull();
  });

  it('shows a failed upload`s reason and Try again, which signs a new link and retries it', async () => {
    mount({ tab: 'files' });
    const row = rowOf(await screen.findByText('Scan.pdf').then((node) => node.textContent ?? ''));
    expect(row).toHaveTextContent(labels.UPLOAD_ERROR_SENTENCES.no_text);

    fireEvent.click(within(row).getByRole('button', { name: labels.TRY_AGAIN_LABEL }));

    await waitFor(() => expect(fake.state.rpcCalls.map((call) => call.fn)).toEqual(['workspace_upload_retry']));
    expect(fake.state.rpcCalls[0].args).toMatchObject({ p_document_id: 6 });
    expect(fake.state.storage.signed).toEqual([`workspace-uploads/u/${SHA}`]);
    await waitFor(() => expect(rowOf('Scan.pdf')).toHaveAttribute('data-upload-state', 'stored'));
  });

  it('reads a delete that did not finish as Removing, with Try again that runs the delete`s steps again', async () => {
    mount({ tab: 'files' });
    const row = rowOf(await screen.findByText('Old draft.docx').then((node) => node.textContent ?? ''));
    expect(row).toHaveTextContent('Removing');
    expect(within(row).queryByRole('button', { name: labels.DELETE_LABEL })).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: labels.TRY_AGAIN_LABEL }));

    await waitFor(() => expect(screen.queryByText('Old draft.docx')).toBeNull());
    expect(fake.state.rpcCalls.map((call) => [call.fn, call.args.p_object_removed])).toEqual([
      ['workspace_document_delete', false],
      ['workspace_document_delete', true],
    ]);
    expect(fake.state.storage.removed).toEqual([`workspace-uploads/u/${SHA}`]);
  });

  it('deletes only on the second press, and says under Delete what it does', async () => {
    mount({ tab: 'files' });
    const row = rowOf(await screen.findByText('My notes.pdf').then((node) => node.textContent ?? ''));
    expect(row).toHaveTextContent(labels.UPLOAD_DELETE_NOTE);

    fireEvent.click(within(row).getByRole('button', { name: labels.DELETE_LABEL }));
    expect(within(row).getByRole('button', { name: labels.CONFIRM_DELETE_LABEL })).toBeInTheDocument();
    await settle();
    expect(fake.state.rpcCalls).toEqual([]);

    fireEvent.click(within(row).getByRole('button', { name: labels.CONFIRM_DELETE_LABEL }));
    await waitFor(() => expect(screen.queryByText('My notes.pdf')).toBeNull());
    expect(fake.state.rpcCalls.map((call) => call.args.p_object_removed)).toEqual([false, true]);
  });

  it('leaves a row whose object could not be removed as Removing, with Try again and the reason', async () => {
    fake.state.storage.removeError = { message: 'storage is down' };
    mount({ tab: 'files' });
    const row = () => rowOf('My notes.pdf');
    await screen.findByText('My notes.pdf');

    fireEvent.click(within(row()).getByRole('button', { name: labels.DELETE_LABEL }));
    fireEvent.click(within(row()).getByRole('button', { name: labels.CONFIRM_DELETE_LABEL }));

    await waitFor(() => expect(row()).toHaveAttribute('data-upload-state', 'deleting'));
    expect(row()).toHaveTextContent('Removing');
    expect(row()).toHaveTextContent('Could not remove this file: storage is down');
    expect(within(row()).getByRole('button', { name: labels.TRY_AGAIN_LABEL })).toBeInTheDocument();
    expect(fake.state.rpcCalls.map((call) => call.args.p_object_removed)).toEqual([false]);
  });

  it('narrows the rows by title as he types, sends nothing, and says when none match', async () => {
    mount({ tab: 'files' });
    await screen.findByText('My notes.pdf');
    await settle();
    const before = reads();
    const filter = screen.getByRole('searchbox', { name: labels.FILTER_PLACEHOLDER });

    fireEvent.change(filter, { target: { value: 'SCAN' } });
    expect(screen.getByText('Scan.pdf')).toBeInTheDocument();
    expect(screen.queryByText('My notes.pdf')).toBeNull();

    fireEvent.change(filter, { target: { value: 'nothing like it' } });
    expect(screen.getByText(labels.NO_UPLOAD_MATCH_LINE)).toBeInTheDocument();
    await settle();
    expect(reads()).toBe(before);
    expect(fake.state.rpcCalls).toEqual([]);
  });

  it('says the uploads could not be read', async () => {
    fake.state.readErrors = { workspace_documents: { code: '42501', message: 'permission denied' } };
    mount({ tab: 'files' });
    expect(await screen.findByText('Could not load your uploads: permission denied')).toBeInTheDocument();
  });

  it('states the index status from the row`s counts, and when a course file was last indexed', async () => {
    mount({ tab: 'files' });
    const status = await screen.findByRole('region', { name: labels.INDEX_STATUS_HEADING });
    await within(status).findByText('Course files: 120 indexed, 3 waiting');
    expect([...status.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      'Course files: 120 indexed, 3 waiting',
      'Uploads: 2 indexed, 1 waiting, 1 failed',
      'Remembered: 1 indexed, 0 waiting, 0 failed',
      'Course files last indexed 1 hr ago.',
    ]);
  });

  it('says the index status could not be read', async () => {
    fake.state.readErrors = { v_workspace_index_status: { code: '42501', message: 'permission denied' } };
    mount({ tab: 'files' });
    expect(await screen.findByText('Could not load the index status: permission denied')).toBeInTheDocument();
  });
});

describe('the Memory tab', () => {
  function aboutMe(): HTMLElement {
    return screen.getByRole('region', { name: labels.ABOUT_ME_HEADING });
  }

  it('shows the About me note, edits it in place and saves it', async () => {
    mount({ tab: 'memory' });
    await within(aboutMe()).findByText('I study IST at Syracuse.');

    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.EDIT_LABEL }));
    const field = within(aboutMe()).getByRole('textbox', { name: labels.ABOUT_ME_HEADING });
    expect(field).toHaveAttribute('placeholder', labels.ABOUT_ME_PLACEHOLDER);
    fireEvent.change(field, { target: { value: '  I study IST and finance.  ' } });
    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.SAVE_LABEL }));

    expect(await within(aboutMe()).findByText(labels.SAVED_LINE)).toBeInTheDocument();
    expect(fake.state.rows.workspace_profile[0]).toMatchObject({ about_me: 'I study IST and finance.' });
    expect(await within(aboutMe()).findByText('I study IST and finance.')).toBeInTheDocument();
  });

  it('shows the placeholder for an empty note, and Cancel leaves it as it was', async () => {
    fake.state.rows = { ...fake.state.rows, workspace_profile: [{ id: 1, about_me: '' }] };
    mount({ tab: 'memory' });
    await within(aboutMe()).findByText(labels.ABOUT_ME_PLACEHOLDER);

    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.EDIT_LABEL }));
    fireEvent.change(within(aboutMe()).getByRole('textbox'), { target: { value: 'changed' } });
    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.CANCEL_LABEL }));

    expect(within(aboutMe()).getByText(labels.ABOUT_ME_PLACEHOLDER)).toBeInTheDocument();
    expect(fake.state.log).not.toContain('update:workspace_profile');
  });

  it('says the limit and sends nothing for a note past 2000 characters', async () => {
    mount({ tab: 'memory' });
    await within(aboutMe()).findByText('I study IST at Syracuse.');
    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.EDIT_LABEL }));
    fireEvent.change(within(aboutMe()).getByRole('textbox'), { target: { value: 'x'.repeat(2001) } });

    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.SAVE_LABEL }));

    expect(within(aboutMe()).getByRole('alert')).toHaveTextContent(labels.ABOUT_ME_LIMIT_LINE);
    await settle();
    expect(fake.state.log).not.toContain('update:workspace_profile');
  });

  it('says the note could not be saved, and keeps what was typed', async () => {
    fake.state.writeErrors = { workspace_profile: { code: '42501', message: 'permission denied' } };
    mount({ tab: 'memory' });
    await within(aboutMe()).findByText('I study IST at Syracuse.');
    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.EDIT_LABEL }));
    fireEvent.change(within(aboutMe()).getByRole('textbox'), { target: { value: 'new words' } });

    fireEvent.click(within(aboutMe()).getByRole('button', { name: labels.SAVE_LABEL }));

    expect(await within(aboutMe()).findByRole('alert')).toHaveTextContent('Could not save the note: permission denied');
    expect(within(aboutMe()).getByRole('textbox')).toHaveValue('new words');
  });

  it('lists what is remembered, newest first, with its state, summary and when it was updated', async () => {
    mount({ tab: 'memory' });
    await screen.findByText('Quiz plan');
    const rows = [...document.querySelectorAll('[data-memory-state]')];
    expect(rows.map((row) => row.querySelector('span')?.textContent)).toEqual(['Quiz plan', 'Reading habits']);
    expect(rowOf('Quiz plan')).toHaveTextContent('Indexed · 1 hr ago');
    expect(rowOf('Quiz plan')).toHaveTextContent('He plans quizzes a week out.');
    expect(rowOf('Quiz plan')).toHaveTextContent(labels.MEMORY_DELETE_NOTE);
    expect(screen.queryByText('My notes.pdf')).toBeNull();
  });

  it('forgets an item only on the second press', async () => {
    mount({ tab: 'memory' });
    await screen.findByText('Quiz plan');

    fireEvent.click(within(rowOf('Quiz plan')).getByRole('button', { name: labels.DELETE_LABEL }));
    await settle();
    expect(fake.state.rpcCalls).toEqual([]);
    fireEvent.click(within(rowOf('Quiz plan')).getByRole('button', { name: labels.CONFIRM_DELETE_LABEL }));

    await waitFor(() => expect(screen.queryByText('Quiz plan')).toBeNull());
    expect(fake.state.rpcCalls).toEqual([
      { fn: 'workspace_document_delete', args: { p_document_id: 8, p_object_removed: false } },
    ]);
  });

  it('says an item could not be deleted, and keeps it', async () => {
    fake.state.rpc.workspace_document_delete = () => ({ data: null, error: { code: 'XX000', message: 'it broke' } });
    mount({ tab: 'memory' });
    await screen.findByText('Quiz plan');
    fireEvent.click(within(rowOf('Quiz plan')).getByRole('button', { name: labels.DELETE_LABEL }));
    fireEvent.click(within(rowOf('Quiz plan')).getByRole('button', { name: labels.CONFIRM_DELETE_LABEL }));

    expect(await screen.findByText('Could not delete this item: it broke')).toBeInTheDocument();
    expect(screen.getByText('Quiz plan')).toBeInTheDocument();
  });

  it('narrows the items by title as he types, sends nothing, and says when none match', async () => {
    mount({ tab: 'memory' });
    await screen.findByText('Quiz plan');
    await settle();
    const before = reads();
    const filter = screen.getByRole('searchbox', { name: labels.FILTER_PLACEHOLDER });

    fireEvent.change(filter, { target: { value: 'habits' } });
    expect(screen.getByText('Reading habits')).toBeInTheDocument();
    expect(screen.queryByText('Quiz plan')).toBeNull();
    fireEvent.change(filter, { target: { value: 'zzz' } });
    expect(screen.getByText(labels.NO_MEMORY_MATCH_LINE)).toBeInTheDocument();
    await settle();
    expect(reads()).toBe(before);
  });

  it('says nothing is remembered yet, and says a failed read', async () => {
    fake.state.rows = { ...fake.state.rows, workspace_documents: [] };
    const view = mount({ tab: 'memory' });
    expect(await screen.findByText(labels.NO_MEMORY_LINE)).toBeInTheDocument();
    view.unmount();

    fake.state.readErrors = { v_workspace_memory: { code: '42501', message: 'permission denied' } };
    mount({ tab: 'memory' });
    expect(await screen.findByText('Could not load what is remembered: permission denied')).toBeInTheDocument();
  });
});

describe('the fold, on the mounted screen (the route)', () => {
  const C = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

  function openScreen(search: string) {
    fake.state.search = search;
    return render(
      <QueryClientProvider client={newQueryClient()}>
        <Workspace />
      </QueryClientProvider>,
    );
  }

  /** A window under 1024 px: the panel is a sheet. */
  function narrowWindow(): void {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(max-width: 1023.98px)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  }

  it('folds the panel away by dropping the parameter, and the same button brings its tab back', async () => {
    openScreen(`c=${C}&panel=memory`);
    const panel = await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
    expect(panel).toHaveAttribute('data-panel', 'memory');

    fireEvent.click(within(panel).getByRole('button', { name: labels.HIDE_PANEL_LABEL }));

    expect(fake.state.router.replace).toHaveBeenLastCalledWith(`/workspace?c=${C}`, { scroll: false });
    await waitFor(() => expect(screen.queryByRole('region', { name: labels.PANEL_REGION_LABEL })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: labels.SHOW_PANEL_LABEL }));

    expect(fake.state.router.replace).toHaveBeenLastCalledWith(`/workspace?c=${C}&panel=memory`, { scroll: false });
    expect(await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL })).toHaveAttribute('data-panel', 'memory');
    expect(screen.queryByRole('button', { name: labels.SHOW_PANEL_LABEL })).toBeNull();
  });

  it('moves to another tab through the route', async () => {
    openScreen(`c=${C}&panel=sources`);
    const panel = await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
    fireEvent.click(within(panel).getByRole('tab', { name: 'Files' }));
    expect(fake.state.router.replace).toHaveBeenLastCalledWith(`/workspace?c=${C}&panel=files`, { scroll: false });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: labels.PANEL_REGION_LABEL })).toHaveAttribute('data-panel', 'files'),
    );
  });

  it('is a sheet under 1024 px, which Esc, its Close and the scrim each fold', async () => {
    narrowWindow();
    openScreen(`c=${C}&panel=files`);
    const sheet = await screen.findByRole('dialog', { name: labels.PANEL_REGION_LABEL });
    expect(within(sheet).getByRole('region', { name: labels.PANEL_REGION_LABEL })).toHaveAttribute('data-panel', 'files');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fake.state.router.replace).toHaveBeenLastCalledWith(`/workspace?c=${C}`, { scroll: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => fake.state.router.replace(`/workspace?c=${C}&panel=files`));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: labels.CLOSE_LABEL }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => fake.state.router.replace(`/workspace?c=${C}&panel=files`));
    const backdrop = (await screen.findByRole('dialog')).parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens on a tab in the lobby too, where the Sources tab has no answer to show', async () => {
    openScreen('panel=sources');
    const panel = await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
    expect(within(panel).getByText(labels.NO_ANSWER_PICKED_LINE)).toBeInTheDocument();
  });
});
