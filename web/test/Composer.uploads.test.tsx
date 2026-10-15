/**
 * The composer's uploads and its material picker (Phase 24b, brief 111, task 7;
 * W-87): "Uploading from his device" and "Attaching from materials".
 *
 * The upload flow itself (rules, hash, bucket, register) is W-86's and tested in
 * `queries.workspace-files.test.ts`; here `uploadFile` and `retryUploadLink` are
 * stubbed and the composer is read for what it does with each outcome: a
 * refusal's sentence under the box, an existing row or a registered one as a
 * chip that follows the row's state, Ask kept off until the upload is indexed,
 * Try again on a failed row, and a thrown error worded by `uploadProblemLine`.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComposerProps } from '@/components/workspace/composer-contract';
import type * as FilesModule from '@/lib/queries.workspace-files';
import { newQueryClient } from './hydration-harness';
import { COURSES, bbFile, db, resetDb, settle, upload, withClient } from './composer-fake';

vi.mock('@/lib/supabase/client', async () => (await import('./composer-fake')).supabaseClientMock());

const flow = vi.hoisted(() => ({ uploadFile: vi.fn(), retryUploadLink: vi.fn() }));
vi.mock('@/lib/queries.workspace-files', async (importOriginal) => {
  const original = await importOriginal<typeof FilesModule>();
  return { ...original, uploadFile: flow.uploadFile, retryUploadLink: flow.retryUploadLink };
});

const labels = await import('@/lib/workspace-labels');
const { WORKSPACE_UPLOAD_TYPES } = await import('@/lib/workspace-upload-rules');
const { workspaceFileKeys } = await import('@/lib/queries.workspace-files');
const { Composer } = await import('@/components/workspace/Composer');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

function mount(overrides: Partial<ComposerProps> = {}) {
  const handlers = { onAsked: vi.fn(), onAskError: vi.fn(), onStop: vi.fn(), onEdit: vi.fn() };
  const props: ComposerProps = {
    conversationId: A,
    requestIds: [],
    requestOpen: false,
    busy: false,
    disabled: false,
    ...handlers,
    ...overrides,
  };
  const client = newQueryClient();
  return { ...render(withClient(<Composer {...props} />, client)), ...handlers, client };
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
}

function choose(container: HTMLElement, name: string): File {
  const file = new File(['# notes'], name, { type: '' });
  fireEvent.change(fileInput(container), { target: { files: [file] } });
  return file;
}

function uploadChip(container: HTMLElement): HTMLElement {
  const chip = container.querySelector('[data-chip="upload"]');
  if (!(chip instanceof HTMLElement)) throw new Error('no upload chip');
  return chip;
}

function askButton(): HTMLElement {
  return screen.getByRole('button', { name: labels.ASK_LABEL });
}

function askCalls() {
  return db.state.rpcCalls.filter((call) => call.fn === 'workspace_ask_with');
}

beforeEach(() => {
  resetDb();
  flow.uploadFile.mockReset();
  flow.retryUploadLink.mockReset();
  db.state.rows = { v_course_display: COURSES, v_bb_files_current: [bbFile(11)] };
});

describe('the file input', () => {
  it('accepts the six types of the upload rules, and the menu entry opens it', () => {
    const { container } = mount();
    const input = fileInput(container);
    expect(input.accept.split(',')).toEqual(WORKSPACE_UPLOAD_TYPES.map((type) => `.${type.extension}`));
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
    expect(screen.getByRole('group', { name: labels.ATTACHMENTS_GROUP_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: labels.STARTING_POINTS_GROUP_HEADING })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: labels.UPLOAD_FROM_DEVICE_LABEL }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: labels.ADD_MENU_LABEL })).toHaveFocus();
  });
});

describe('an upload', () => {
  it('refused by the rules shows its sentence under the box and adds no chip', async () => {
    flow.uploadFile.mockResolvedValue({ kind: 'refused', reason: 'bad_type', sentence: labels.UPLOAD_REFUSALS.bad_type });
    const { container } = mount();
    choose(container, 'photo.png');
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.UPLOAD_REFUSALS.bad_type);
    expect(container.querySelector('[data-chip="upload"]')).toBeNull();
  });

  it('passes the chosen course to the flow', async () => {
    flow.uploadFile.mockResolvedValue({ kind: 'registered', id: 31, state: 'stored' });
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: labels.courseChipLabel(labels.ALL_COURSES_LABEL) }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'IST 323' }));
    const file = choose(container, 'notes.md');
    await waitFor(() => expect(flow.uploadFile).toHaveBeenCalledWith(file, 'IST.323'));
  });

  it('registered shows a chip that follows its row, and keeps Ask off until the row is indexed', async () => {
    flow.uploadFile.mockResolvedValue({ kind: 'registered', id: 31, state: 'stored' });
    db.state.rows = { ...db.state.rows, workspace_documents: [upload(31, 'reading', { title: 'notes.md' })] };
    const { container, onAsked, client } = mount();
    choose(container, 'notes.md');

    await waitFor(() => expect(uploadChip(container)).toHaveAttribute('data-upload-state', 'reading'));
    expect(uploadChip(container)).toHaveTextContent(labels.DOCUMENT_STATE_LABELS.reading);
    expect(screen.getByRole('group', { name: labels.attachmentChipLabel('notes.md') })).toBe(uploadChip(container));
    expect(screen.getByText(labels.UPLOAD_NOT_READY_LINE)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Summarise it' } });
    fireEvent.click(askButton());
    await settle();
    expect(askCalls()).toEqual([]);
    // W-4: the disabled look while an attached upload is not indexed.
    expect(askButton()).toBeDisabled();
    expect(askButton()).toHaveAccessibleDescription(labels.UPLOAD_NOT_READY_LINE);

    db.state.rows = { ...db.state.rows, workspace_documents: [upload(31, 'indexed', { title: 'notes.md' })] };
    // The query re-reads every 5 s while a row settles; the test re-reads at once.
    await act(() => client.invalidateQueries({ queryKey: workspaceFileKeys.uploads() }));
    await waitFor(() => expect(uploadChip(container)).toHaveAttribute('data-upload-state', 'indexed'));
    expect(screen.queryByText(labels.UPLOAD_NOT_READY_LINE)).toBeNull();
    expect(askButton()).toBeEnabled();
    fireEvent.click(askButton());
    await waitFor(() => expect(onAsked).toHaveBeenCalled());
    expect(askCalls()[0].args.p_options).toMatchObject({ uploads: [31], files: [] });
  });

  it('existing shows that row as a chip in its state, with Try again when it failed', async () => {
    const failed = upload(32, 'failed', { title: 'old.pdf' });
    db.state.rows = { ...db.state.rows, workspace_documents: [failed] };
    const { normalizeDocument } = await import('@/lib/queries.workspace-files');
    flow.uploadFile.mockResolvedValue({ kind: 'existing', document: normalizeDocument(failed) });
    flow.retryUploadLink.mockResolvedValue({ id: 32, state: 'stored' });
    const { container } = mount();
    choose(container, 'old.pdf');

    await waitFor(() => expect(uploadChip(container)).toHaveAttribute('data-upload-state', 'failed'));
    const chip = uploadChip(container);
    expect(chip).toHaveTextContent(labels.DOCUMENT_STATE_LABELS.failed);
    fireEvent.click(within(chip).getByRole('button', { name: labels.TRY_AGAIN_LABEL }));
    await waitFor(() => expect(flow.retryUploadLink).toHaveBeenCalledTimes(1));
    expect(flow.retryUploadLink.mock.calls[0][0]).toMatchObject({ id: 32, state: 'failed' });
    fireEvent.click(within(chip).getByRole('button', { name: labels.REMOVE_CHIP_LABEL }));
    expect(container.querySelector('[data-chip="upload"]')).toBeNull();
  });

  it('that throws is worded by uploadProblemLine and leaves no chip', async () => {
    flow.uploadFile.mockRejectedValue(new Error('storage is down'));
    const { container } = mount();
    choose(container, 'notes.md');
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.uploadProblemLine('storage is down'));
    expect(container.querySelector('[data-chip="upload"]')).toBeNull();
  });

  it('dropped on the composer goes through the same flow', async () => {
    flow.uploadFile.mockResolvedValue({ kind: 'registered', id: 33, state: 'stored' });
    const { container } = mount();
    const file = new File(['x'], 'dropped.txt', { type: 'text/plain' });
    const target = screen.getByRole('textbox').closest('[data-drop-target]');
    if (!(target instanceof HTMLElement)) throw new Error('no drop target');
    fireEvent.dragOver(target, { dataTransfer: { files: [file], types: ['Files'] } });
    fireEvent.drop(target, { dataTransfer: { files: [file], types: ['Files'] } });
    await waitFor(() => expect(flow.uploadFile).toHaveBeenCalledWith(file, null));
    await waitFor(() => expect(container.querySelector('[data-chip="upload"]')).not.toBeNull());
  });
});

describe('the material picker', () => {
  function openPicker() {
    fireEvent.click(screen.getByRole('button', { name: labels.ADD_MENU_LABEL }));
    fireEvent.click(screen.getByRole('menuitem', { name: labels.ATTACH_FROM_MATERIALS_LABEL }));
    return screen.getByRole('dialog', { name: labels.ATTACH_FROM_MATERIALS_LABEL });
  }

  it('lists the current files by course, filters them by name and says when none match', async () => {
    db.state.rows = {
      ...db.state.rows,
      v_bb_files_current: [bbFile(11), bbFile(21, { course_id: 'MAS.362.M002', file_name: 'Syllabus.pdf' })],
    };
    mount();
    const dialog = openPicker();
    expect(await within(dialog).findByRole('heading', { name: 'IST 323' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'MAS 362' })).toBeInTheDocument();
    const filter = within(dialog).getByRole('searchbox', { name: labels.MATERIAL_FILTER_PLACEHOLDER });
    fireEvent.change(filter, { target: { value: 'sylla' } });
    expect(within(dialog).queryByRole('button', { name: 'Week 11 slides.pptx' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Syllabus.pdf' })).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'zzz' } });
    expect(within(dialog).getByText(labels.NO_MATERIAL_MATCH_LINE)).toBeInTheDocument();
  });

  it('says it is loading, then that no file has been pulled', async () => {
    let release: () => void = () => undefined;
    db.state.readGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.state.rows = { ...db.state.rows, v_bb_files_current: [] };
    mount();
    const dialog = openPicker();
    expect(within(dialog).getByText(labels.MATERIALS_LOADING_LINE)).toBeInTheDocument();
    release();
    expect(await within(dialog).findByText(labels.NO_MATERIALS_LINE)).toBeInTheDocument();
  });

  it('says so when the files could not be read', async () => {
    db.state.readErrors = { v_bb_files_current: { code: '42501', message: 'permission denied' } };
    mount();
    const dialog = openPicker();
    expect(await within(dialog).findByText(labels.materialsProblemLine('permission denied'))).toBeInTheDocument();
  });

  it('closes on Esc and hands focus back to the add button', async () => {
    mount();
    openPicker();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: labels.ADD_MENU_LABEL })).toHaveFocus();
  });
});

describe('the limit of five, for files dropped before a re-render (R2-7)', () => {
  it('uploads no sixth file and says the limit line', async () => {
    flow.uploadFile.mockImplementation(async (file: File) => ({
      kind: 'registered',
      id: Number(file.name.replace(/\D/g, '')),
      state: 'stored',
    }));
    const { container } = mount();
    const target = screen.getByRole('textbox').closest('[data-drop-target]');
    if (!(target instanceof HTMLElement)) throw new Error('no drop target');
    const drop = (names: string[]) => {
      const files = names.map((name) => new File(['x'], name, { type: 'text/plain' }));
      fireEvent.drop(target, { dataTransfer: { files, types: ['Files'] } });
    };
    act(() => {
      drop(['f1.txt', 'f2.txt', 'f3.txt']);
      drop(['f4.txt', 'f5.txt', 'f6.txt']);
    });
    await waitFor(() => expect(container.querySelectorAll('[data-chip="upload"][data-upload-state]')).toHaveLength(5));
    await settle();
    expect(flow.uploadFile).toHaveBeenCalledTimes(5);
    expect(screen.getByText(labels.ATTACHMENTS_LIMIT_LINE)).toBeInTheDocument();
  });
});

describe('an attached upload that failed (Round 3, W-6)', () => {
  it.each([
    ['too_many_units', 'with its reason'],
    [null, 'with no reason when the row has no code'],
  ] as const)('keeps Ask off and says it failed, %s, never the not-ready line (%s)', async (code, _why) => {
    const failed = upload(34, 'failed', { title: 'big.pptx', error_code: code });
    db.state.rows = { ...db.state.rows, workspace_documents: [failed] };
    const { normalizeDocument } = await import('@/lib/queries.workspace-files');
    flow.uploadFile.mockResolvedValue({ kind: 'existing', document: normalizeDocument(failed) });
    const { container } = mount();
    choose(container, 'big.pptx');

    await waitFor(() => expect(uploadChip(container)).toHaveAttribute('data-upload-state', 'failed'));
    const line = labels.uploadFailedAttachedLine(code === null ? null : labels.UPLOAD_ERROR_SENTENCES[code]);
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByText(labels.UPLOAD_NOT_READY_LINE)).toBeNull();
    expect(askButton()).toBeDisabled();
    expect(askButton()).toHaveAccessibleDescription(line);
  });
});
