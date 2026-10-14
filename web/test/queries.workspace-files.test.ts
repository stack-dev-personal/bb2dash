/**
 * Uploads, the bucket and the two-step delete (Phase 24b, brief 111, task 5).
 *
 * The named cases of task 5 are here, run through fake `UploadFlowPorts` that
 * record their calls in order:
 *
 *   * a file of 20,971,521 bytes is refused before any request;
 *   * a Markdown file with no reported type is taken by its extension and
 *     stored with `text/markdown`;
 *   * the object key is `u/` followed by the SHA-256, whatever the file's name;
 *   * a file whose hash an upload row already holds is not uploaded, and that
 *     row is used;
 *   * the register call carries the hash;
 *   * a delete makes the first call, then the storage remove, then the second
 *     call, and a failed remove makes no second call.
 *
 * The query functions and the browser store run over a recording Supabase stub.
 */

import { webcrypto } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  target: string;
  op: string;
  args: unknown[];
}

type Answer = { data: unknown; error: unknown };

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  answers: {} as Record<string, Answer>,
}));

function answerFor(target: string): Answer {
  return stub.answers[target] ?? { data: null, error: null };
}

function builder(table: string) {
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      stub.calls.push({ target: table, op, args });
      return chain;
    };
  const chain: Record<string, unknown> = {
    select: record('select'),
    update: record('update'),
    eq: record('eq'),
    order: record('order'),
    limit: record('limit'),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(answerFor(table)).then(onFulfilled, onRejected),
  };
  return chain;
}

function bucket(name: string) {
  const call = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ target: `storage:${name}`, op, args });
    return Promise.resolve(answerFor(`storage:${op}`));
  };
  return { upload: call('upload'), createSignedUrl: call('createSignedUrl'), remove: call('remove') };
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      stub.calls.push({ target: fn, op: 'rpc', args: [args] });
      return Promise.resolve(answerFor(fn));
    },
    storage: { from: (name: string) => bucket(name) },
  }),
}));

const files = await import('@/lib/queries.workspace-files');
const labels = await import('@/lib/workspace-labels');
const { WorkspaceOptionsRefusal } = await import('@/lib/queries.workspace-ask');
const {
  WORKSPACE_DOCUMENT_STATES,
  WORKSPACE_UPLOADS_BUCKET,
  WORKSPACE_UPLOADS_REFETCH_MS,
  WORKSPACE_UPLOAD_ERROR_CODES,
  WORKSPACE_UPLOAD_LINK_SECONDS,
  WORKSPACE_UPLOAD_OPEN_LINK_SECONDS,
  browserUploadPorts,
  browserUploadStore,
  createSignedUploadUrl,
  deleteDocument,
  filterByTitle,
  findUploadBySha256,
  normalizeDocument,
  refusalForDocumentCall,
  registerUpload,
  removeUpload,
  retryUpload,
  retryUploadLink,
  setUploadCourse,
  setUploadTitle,
  sha256Hex,
  uploadFile,
  uploadsOptions,
  uploadsSettling,
  useWorkspaceUploads,
  workspaceFileKeys,
} = files;
type WorkspaceDocument = import('@/lib/queries.workspace-files').WorkspaceDocument;
type WorkspaceDocumentState = import('@/lib/queries.workspace-files').WorkspaceDocumentState;
type WorkspaceUploadErrorCode = import('@/lib/queries.workspace-files').WorkspaceUploadErrorCode;
type UploadFlowPorts = import('@/lib/queries.workspace-files').UploadFlowPorts;

/** The two records keyed by this module's vocabularies, pinned to their types. */
const _stateLabels: Record<WorkspaceDocumentState, string> = labels.DOCUMENT_STATE_LABELS;
const _errorSentences: Record<WorkspaceUploadErrorCode, string> = labels.UPLOAD_ERROR_SENTENCES;

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; // SHA-256 of "abc"
const OTHER_HASH = 'f'.repeat(64);
const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const DOCUMENT_COLUMNS =
  'id, kind, title, state, error_code, mime, byte_size, sha256, storage_key, course_id, conversation_id, ' +
  'attempts, created_at, updated_at';

const ROW = {
  id: 17,
  kind: 'upload',
  title: 'lab-notes.pdf',
  state: 'indexed',
  error_code: null,
  mime: 'application/pdf',
  byte_size: 2048,
  sha256: HASH,
  storage_key: `u/${HASH}`,
  course_id: 'BIO.110',
  conversation_id: null,
  attempts: 0,
  created_at: '2026-10-14T10:00:00Z',
  updated_at: '2026-10-14T10:01:00Z',
};

function document(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return { ...(normalizeDocument(ROW) as WorkspaceDocument), ...overrides };
}

/** Fake ports that record every call in order; each answer can be replaced. */
function fakePorts(overrides: Partial<UploadFlowPorts> = {}) {
  const log: string[] = [];
  const seen: Record<string, unknown[]> = {};
  const note = (name: string, args: unknown[]) => {
    log.push(name);
    seen[name] = args;
  };
  const ports: UploadFlowPorts = {
    store: {
      putObject: async (...args) => note('putObject', args),
      signUrl: async (...args) => {
        note('signUrl', args);
        return { url: `https://signed/${String(args[0])}`, expiresAt: '2026-10-21T10:00:00.000Z' };
      },
      removeObject: async (...args) => note('removeObject', args),
    },
    digest: async (...args) => {
      note('digest', args);
      return HASH;
    },
    findBySha256: async (...args) => {
      note('findBySha256', args);
      return null;
    },
    register: async (...args) => {
      note('register', args);
      return { id: 30, state: 'stored', existing: false };
    },
    retry: async (...args) => {
      note('retry', args);
      return { id: 17, state: 'stored' };
    },
    remove: async (id, objectRemoved) => {
      note(`remove(${objectRemoved})`, [id, objectRemoved]);
      return objectRemoved
        ? { id, kind: 'upload', state: 'deleted', storageKey: `u/${HASH}` }
        : { id, kind: 'upload', state: 'deleting', storageKey: `u/${HASH}` };
    },
    ...overrides,
  };
  return { ports, log, seen };
}

beforeEach(() => {
  stub.calls = [];
  stub.answers = {};
});

/* ---------------------------------------------------------------------------
 * Vocabularies and rows
 * ------------------------------------------------------------------------ */

describe('the vocabularies', () => {
  it('lists the six states and the ten error codes, pinned to their words', () => {
    expect(WORKSPACE_DOCUMENT_STATES).toEqual(['stored', 'reading', 'text_ready', 'indexed', 'failed', 'deleting']);
    expect(WORKSPACE_UPLOAD_ERROR_CODES).toEqual([
      'too_large',
      'bad_type',
      'bad_bytes',
      'no_text',
      'extract_timeout',
      'extract_failed',
      'too_many_units',
      'link_expired',
      'download_failed',
      'embed_failed',
    ]);
    expect(Object.keys(_stateLabels)).toEqual([...WORKSPACE_DOCUMENT_STATES]);
    expect(Object.keys(_errorSentences)).toEqual([...WORKSPACE_UPLOAD_ERROR_CODES]);
  });

  it('holds the bucket and the times', () => {
    expect(WORKSPACE_UPLOADS_BUCKET).toBe('workspace-uploads');
    expect(WORKSPACE_UPLOAD_LINK_SECONDS).toBe(604_800);
    expect(WORKSPACE_UPLOAD_OPEN_LINK_SECONDS).toBe(3_600);
    expect(WORKSPACE_UPLOADS_REFETCH_MS).toBe(5_000);
  });
});

describe('normalizeDocument', () => {
  it('reads a row, and never the signed link', () => {
    const row = normalizeDocument({ ...ROW, signed_url: 'https://x', signed_url_expires_at: 'y' });
    expect(row).toEqual({ ...ROW, kind: 'upload', state: 'indexed' });
    expect(Object.keys(row ?? {})).not.toContain('signed_url');
  });

  it('reads a misshapen column as null, and drops a row it cannot identify', () => {
    const row = normalizeDocument({ ...ROW, error_code: 'oops', sha256: 'short', byte_size: -1, attempts: null });
    expect(row).toMatchObject({ error_code: null, sha256: null, byte_size: null, attempts: 0 });
    expect(normalizeDocument({ ...ROW, conversation_id: CONVERSATION.toUpperCase() })?.conversation_id).toBe(
      CONVERSATION,
    );
    expect(normalizeDocument({ ...ROW, id: 0 })).toBeNull();
    expect(normalizeDocument({ ...ROW, kind: 'note' })).toBeNull();
    expect(normalizeDocument({ ...ROW, state: 'deleted' })).toBeNull();
    expect(normalizeDocument({ ...ROW, title: null })).toBeNull();
    expect(normalizeDocument(undefined)).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------ */

describe('uploadsOptions and uploadsSettling', () => {
  it('reads the uploads newest first, naming the columns', async () => {
    stub.answers.workspace_documents = { data: [ROW, { id: 'x' }], error: null };
    const query = uploadsOptions();
    expect(query.queryKey).toEqual(workspaceFileKeys.uploads());
    expect(query.queryKey).toEqual(['workspace', 'uploads']);
    await expect(query.queryFn!({} as never)).resolves.toEqual([document()]);
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      ['select', DOCUMENT_COLUMNS],
      ['eq', 'kind', 'upload'],
      ['order', 'created_at', { ascending: false }],
    ]);
  });

  it('re-reads every 5 s while a row is neither indexed nor failed', () => {
    const interval = uploadsOptions().refetchInterval as (query: { state: { data: unknown } }) => number | false;
    expect(interval({ state: { data: [document({ state: 'reading' })] } })).toBe(WORKSPACE_UPLOADS_REFETCH_MS);
    expect(interval({ state: { data: [document(), document({ state: 'failed' })] } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(false);
    expect(uploadsSettling([document({ state: 'deleting' })])).toBe(true);
    expect(uploadsSettling([document({ state: 'stored' })])).toBe(true);
    expect(uploadsSettling([])).toBe(false);
  });

  it('throws a read error, and runs through the hook', async () => {
    stub.answers.workspace_documents = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(uploadsOptions().queryFn!({} as never)).rejects.toMatchObject({ code: '42501' });
    stub.answers.workspace_documents = { data: [ROW], error: null };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useWorkspaceUploads(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });
});

describe('filterByTitle', () => {
  const rows = [{ title: 'Lab notes.pdf' }, { title: 'Essay draft.docx' }, { title: 'LAB data.xlsx' }];

  it('narrows by title, any case, and keeps every row for a blank filter', () => {
    expect(filterByTitle(rows, 'lab')).toEqual([rows[0], rows[2]]);
    expect(filterByTitle(rows, '  ')).toEqual(rows);
    expect(filterByTitle(rows, '')).not.toBe(rows);
    expect(filterByTitle(rows, 'zzz')).toEqual([]);
  });
});

describe('findUploadBySha256', () => {
  it('reads the upload row that holds the hash, in any state', async () => {
    stub.answers.workspace_documents = { data: [{ ...ROW, state: 'deleting' }], error: null };
    await expect(findUploadBySha256(HASH)).resolves.toMatchObject({ id: 17, state: 'deleting' });
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      ['select', DOCUMENT_COLUMNS],
      ['eq', 'kind', 'upload'],
      ['eq', 'sha256', HASH],
      ['limit', 1],
    ]);
  });

  it('is null when no row holds it, throws a read error, and refuses a bad hash before reading', async () => {
    stub.answers.workspace_documents = { data: [], error: null };
    await expect(findUploadBySha256(HASH)).resolves.toBeNull();
    stub.answers.workspace_documents = { data: null, error: { code: 'x', message: 'y' } };
    await expect(findUploadBySha256(HASH)).rejects.toMatchObject({ code: 'x' });
    stub.calls = [];
    await expect(findUploadBySha256('ABC')).rejects.toThrow(/hash/);
    expect(stub.calls).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * The four calls and the two column writes
 * ------------------------------------------------------------------------ */

describe('registerUpload, retryUpload, deleteDocument', () => {
  const input = {
    sha256: HASH,
    title: 'lab-notes.pdf',
    mime: 'application/pdf',
    byteSize: 2048,
    signedUrl: 'https://signed/u',
    signedUrlExpiresAt: '2026-10-21T10:00:00.000Z',
    courseId: null,
  };

  it('registers with the hash and the six other arguments', async () => {
    stub.answers.workspace_upload_register = { data: { id: '30', state: 'stored', existing: false }, error: null };
    await expect(registerUpload(input)).resolves.toEqual({ id: 30, state: 'stored', existing: false });
    expect(stub.calls).toEqual([
      {
        target: 'workspace_upload_register',
        op: 'rpc',
        args: [
          {
            p_sha256: HASH,
            p_title: 'lab-notes.pdf',
            p_mime: 'application/pdf',
            p_byte_size: 2048,
            p_signed_url: 'https://signed/u',
            p_signed_url_expires_at: '2026-10-21T10:00:00.000Z',
            p_course_id: null,
          },
        ],
      },
    ]);
  });

  it.each([
    ['a bad hash', { sha256: 'xyz' }],
    ['an empty title', { title: '' }],
    ['a title past 200 characters', { title: 'a'.repeat(201) }],
    ['a type outside the six', { mime: 'text/html' }],
    ['a size of 0', { byteSize: 0 }],
    ['a size past the limit', { byteSize: 20_971_521 }],
    ['no link', { signedUrl: '' }],
    ['no expiry', { signedUrlExpiresAt: '' }],
  ])('refuses %s before any call', async (_label, overrides) => {
    await expect(registerUpload({ ...input, ...overrides })).rejects.toThrow();
    expect(stub.calls).toEqual([]);
  });

  it('maps 42501 to not_owner, passes any other error through, and throws on a misshapen answer', async () => {
    stub.answers.workspace_upload_register = { data: null, error: { code: '42501', message: 'no' } };
    await expect(registerUpload(input)).rejects.toBeInstanceOf(WorkspaceOptionsRefusal);
    const other = { code: '23514', message: 'check' };
    stub.answers.workspace_upload_register = { data: null, error: other };
    await expect(registerUpload(input)).rejects.toBe(other);
    stub.answers.workspace_upload_register = { data: { id: 30, state: 'gone' }, error: null };
    await expect(registerUpload(input)).rejects.toThrow(/workspace_upload_register/);
  });

  it('retries a failed upload with a new link', async () => {
    stub.answers.workspace_upload_retry = { data: { id: 17, state: 'stored' }, error: null };
    await expect(
      retryUpload({ documentId: 17, signedUrl: 'https://signed/u', signedUrlExpiresAt: 'z' }),
    ).resolves.toEqual({ id: 17, state: 'stored' });
    expect(stub.calls[0]).toEqual({
      target: 'workspace_upload_retry',
      op: 'rpc',
      args: [{ p_document_id: 17, p_signed_url: 'https://signed/u', p_signed_url_expires_at: 'z' }],
    });
    stub.answers.workspace_upload_retry = { data: null, error: { code: '42501' } };
    await expect(retryUpload({ documentId: 17, signedUrl: 'u', signedUrlExpiresAt: 'z' })).rejects.toMatchObject({
      reason: 'not_owner',
    });
    await expect(retryUpload({ documentId: -1, signedUrl: 'u', signedUrlExpiresAt: 'z' })).rejects.toThrow(/document id/);
  });

  it('deletes in a step that returns the key, and maps its answer', async () => {
    stub.answers.workspace_document_delete = {
      data: { id: 17, kind: 'upload', state: 'deleting', storage_key: `u/${HASH}` },
      error: null,
    };
    await expect(deleteDocument(17, false)).resolves.toEqual({
      id: 17,
      kind: 'upload',
      state: 'deleting',
      storageKey: `u/${HASH}`,
    });
    expect(stub.calls[0].args).toEqual([{ p_document_id: 17, p_object_removed: false }]);
    stub.answers.workspace_document_delete = { data: { id: 17, kind: 'upload', state: 'indexed' }, error: null };
    await expect(deleteDocument(17, true)).rejects.toThrow(/workspace_document_delete/);
    stub.answers.workspace_document_delete = { data: null, error: { code: '22023', message: 'state' } };
    await expect(deleteDocument(17, true)).rejects.toMatchObject({ code: '22023' });
  });

  it('is null for an error that is not 42501', () => {
    expect(refusalForDocumentCall({ code: '42501' })?.message).toBe(labels.NOT_OWNER_LINE);
    expect(refusalForDocumentCall({ code: '22023' })).toBeNull();
    expect(refusalForDocumentCall('x')).toBeNull();
  });
});

describe('setUploadCourse and setUploadTitle', () => {
  it('update one upload`s course and title', async () => {
    await setUploadCourse(17, 'BIO.110');
    await setUploadCourse(17, null);
    await setUploadTitle(17, '  Lab notes  ');
    expect(stub.calls.map((call) => [call.op, ...call.args])).toEqual([
      ['update', { course_id: 'BIO.110' }],
      ['eq', 'id', 17],
      ['eq', 'kind', 'upload'],
      ['update', { course_id: null }],
      ['eq', 'id', 17],
      ['eq', 'kind', 'upload'],
      ['update', { title: 'Lab notes' }],
      ['eq', 'id', 17],
      ['eq', 'kind', 'upload'],
    ]);
  });

  it('refuses a bad title or id before any write, and throws a write error', async () => {
    await expect(setUploadTitle(17, '   ')).rejects.toThrow(/title/);
    await expect(setUploadTitle(17, 'a'.repeat(201))).rejects.toThrow(/title/);
    await expect(setUploadCourse(0, null)).rejects.toThrow(/document id/);
    await expect(setUploadCourse(17, '')).rejects.toThrow(/course/);
    expect(stub.calls).toEqual([]);
    stub.answers.workspace_documents = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(setUploadTitle(17, 'x')).rejects.toMatchObject({ code: '42501' });
  });
});

/* ---------------------------------------------------------------------------
 * The hash and the bucket
 * ------------------------------------------------------------------------ */

describe('sha256Hex', () => {
  it('is 64 lower-case hex characters of the bytes', async () => {
    await expect(sha256Hex(new Blob(['abc']), webcrypto.subtle as SubtleCrypto)).resolves.toBe(HASH);
  });

  it('throws when no Web Crypto is there to use', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      await expect(sha256Hex(new Blob(['abc']))).rejects.toThrow(/Web Crypto/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('browserUploadStore', () => {
  it('puts an object with the content type it is given, and no overwrite', async () => {
    const blob = new Blob(['x']);
    await browserUploadStore().putObject(`u/${HASH}`, blob, 'text/markdown');
    expect(stub.calls).toEqual([
      {
        target: `storage:${WORKSPACE_UPLOADS_BUCKET}`,
        op: 'upload',
        args: [`u/${HASH}`, blob, { contentType: 'text/markdown', upsert: false }],
      },
    ]);
  });

  it('takes an object already there under the key as the same bytes, and throws any other failure', async () => {
    stub.answers['storage:upload'] = { data: null, error: { status: 409, statusCode: '409', message: 'exists' } };
    await expect(browserUploadStore().putObject('k', new Blob(['x']), 'text/plain')).resolves.toBeUndefined();
    stub.answers['storage:upload'] = { data: null, error: { status: 400, statusCode: '400', message: 'bad' } };
    await expect(browserUploadStore().putObject('k', new Blob(['x']), 'text/plain')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('signs a link and says when it expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    try {
      stub.answers['storage:createSignedUrl'] = { data: { signedUrl: 'https://signed/x' }, error: null };
      await expect(browserUploadStore().signUrl('k', WORKSPACE_UPLOAD_LINK_SECONDS)).resolves.toEqual({
        url: 'https://signed/x',
        expiresAt: '2026-10-21T10:00:00.000Z',
      });
      expect(stub.calls[0]).toMatchObject({ op: 'createSignedUrl', args: ['k', WORKSPACE_UPLOAD_LINK_SECONDS] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when signing fails or returns no link', async () => {
    stub.answers['storage:createSignedUrl'] = { data: null, error: { message: 'no' } };
    await expect(browserUploadStore().signUrl('k', 60)).rejects.toMatchObject({ message: 'no' });
    stub.answers['storage:createSignedUrl'] = { data: {}, error: null };
    await expect(browserUploadStore().signUrl('k', 60)).rejects.toThrow(/signed/);
  });

  it('removes an object, and throws a failed remove', async () => {
    await browserUploadStore().removeObject('k');
    expect(stub.calls[0]).toMatchObject({ op: 'remove', args: [['k']] });
    stub.answers['storage:remove'] = { data: null, error: { message: 'down' } };
    await expect(browserUploadStore().removeObject('k')).rejects.toMatchObject({ message: 'down' });
  });

  it('makes the Open link of an upload source for an hour by default', async () => {
    stub.answers['storage:createSignedUrl'] = { data: { signedUrl: 'https://signed/open' }, error: null };
    await expect(createSignedUploadUrl(`u/${HASH}`)).resolves.toBe('https://signed/open');
    expect(stub.calls[0].args).toEqual([`u/${HASH}`, WORKSPACE_UPLOAD_OPEN_LINK_SECONDS]);
    stub.answers['storage:createSignedUrl'] = { data: null, error: { message: 'no' } };
    await expect(createSignedUploadUrl('k', 60)).rejects.toMatchObject({ message: 'no' });
    stub.answers['storage:createSignedUrl'] = { data: {}, error: null };
    await expect(createSignedUploadUrl('k')).rejects.toThrow(/signed/);
  });

  it('wires the browser ports to this module`s functions', () => {
    const ports = browserUploadPorts();
    expect(ports.findBySha256).toBe(findUploadBySha256);
    expect(ports.register).toBe(registerUpload);
    expect(ports.retry).toBe(retryUpload);
    expect(ports.remove).toBe(deleteDocument);
    expect(typeof ports.digest).toBe('function');
    expect(typeof ports.store.putObject).toBe('function');
  });
});

/* ---------------------------------------------------------------------------
 * The flows, through fake ports
 * ------------------------------------------------------------------------ */

describe('uploadFile', () => {
  it('refuses a file of 20,971,521 bytes before any request', async () => {
    const { ports, log } = fakePorts();
    const big = new File([new Uint8Array(20_971_521)], 'big.pdf', { type: 'application/pdf' });
    await expect(uploadFile(big, null, ports)).resolves.toEqual({
      kind: 'refused',
      reason: 'too_large',
      sentence: labels.UPLOAD_REFUSALS.too_large,
    });
    expect(log).toEqual([]);
  });

  it('refuses a type outside the six before any request', async () => {
    const { ports, log } = fakePorts();
    await expect(uploadFile(new File(['x'], 'run.exe'), null, ports)).resolves.toMatchObject({ reason: 'bad_type' });
    expect(log).toEqual([]);
  });

  it('stores a Markdown file with no reported type as text/markdown, under u/ and its hash', async () => {
    const { ports, log, seen } = fakePorts();
    const markdown = new File(['# Notes'], 'Week 5 notes.md', { type: '' });
    await expect(uploadFile(markdown, 'BIO.110', ports)).resolves.toEqual({ kind: 'registered', id: 30, state: 'stored' });
    expect(log).toEqual(['digest', 'findBySha256', 'putObject', 'signUrl', 'register']);
    expect(seen.putObject).toEqual([`u/${HASH}`, markdown, 'text/markdown']);
    expect(seen.signUrl).toEqual([`u/${HASH}`, WORKSPACE_UPLOAD_LINK_SECONDS]);
  });

  it('makes the key from the hash whatever the file is called', async () => {
    for (const name of ['../../etc/passwd.txt', 'u/other.txt', 'résumé final (2).txt']) {
      const { ports, seen } = fakePorts();
      await uploadFile(new File(['abc'], name), null, ports);
      expect(seen.putObject?.[0]).toBe(`u/${HASH}`);
    }
  });

  it('sends the hash, the title from the name and the rules` type to the register call', async () => {
    const { ports, seen } = fakePorts();
    await uploadFile(new File(['abc'], '  lab.PDF ', { type: 'application/octet-stream' }), 'BIO.110', ports);
    expect(seen.register).toEqual([
      {
        sha256: HASH,
        title: 'lab.PDF',
        mime: 'application/pdf',
        byteSize: 3,
        signedUrl: `https://signed/u/${HASH}`,
        signedUrlExpiresAt: '2026-10-21T10:00:00.000Z',
        courseId: 'BIO.110',
      },
    ]);
  });

  it('reaches register for a name whose 200th character is a space (R2-2)', async () => {
    const { ports, log, seen } = fakePorts({ register: registerUpload });
    stub.answers.workspace_upload_register = { data: { id: 31, state: 'stored', existing: false }, error: null };
    const name = `${'A'.repeat(199)} B.pdf`;
    await expect(uploadFile(new File(['abc'], name), null, ports)).resolves.toEqual({
      kind: 'registered',
      id: 31,
      state: 'stored',
    });
    expect(log).toEqual(['digest', 'findBySha256', 'putObject', 'signUrl']);
    expect(seen.putObject?.[0]).toBe(`u/${HASH}`);
    const [call] = stub.calls.filter((entry) => entry.target === 'workspace_upload_register');
    expect((call.args[0] as Record<string, unknown>).p_title).toBe('A'.repeat(199));
  });

  it('uploads nothing when an upload row already holds the hash, and uses that row', async () => {
    const existing = document({ state: 'failed', error_code: 'link_expired' });
    const { ports, log } = fakePorts({ findBySha256: async () => existing });
    await expect(uploadFile(new File(['abc'], 'again.pdf'), null, ports)).resolves.toEqual({
      kind: 'existing',
      document: existing,
    });
    expect(log).toEqual(['digest']);
  });

  it('stops at the first failed step', async () => {
    const { ports, log } = fakePorts({
      store: {
        ...fakePorts().ports.store,
        putObject: async () => {
          throw new Error('storage down');
        },
      },
    });
    await expect(uploadFile(new File(['abc'], 'a.txt'), null, ports)).rejects.toThrow('storage down');
    expect(log).toEqual(['digest', 'findBySha256']);
  });
});

describe('retryUploadLink', () => {
  it('signs a new link for a failed upload, then retries it', async () => {
    const { ports, log, seen } = fakePorts();
    await expect(retryUploadLink(document({ state: 'failed' }), ports)).resolves.toEqual({ id: 17, state: 'stored' });
    expect(log).toEqual(['signUrl', 'retry']);
    expect(seen.retry).toEqual([
      { documentId: 17, signedUrl: `https://signed/u/${HASH}`, signedUrlExpiresAt: '2026-10-21T10:00:00.000Z' },
    ]);
  });

  it('refuses a row that is not failed, or has no key, before any call', async () => {
    const { ports, log } = fakePorts();
    await expect(retryUploadLink(document({ state: 'indexed' }), ports)).rejects.toThrow(/failed/);
    await expect(retryUploadLink(document({ state: 'failed', storage_key: null }), ports)).rejects.toThrow(/key/);
    expect(log).toEqual([]);
  });
});

describe('removeUpload: the two-step delete', () => {
  it('makes the first call, then the storage remove with the key it returned, then the second call', async () => {
    const { ports, log, seen } = fakePorts();
    await expect(removeUpload(document({ storage_key: `u/${OTHER_HASH}` }), ports)).resolves.toMatchObject({
      state: 'deleted',
    });
    expect(log).toEqual(['remove(false)', 'removeObject', 'remove(true)']);
    expect(seen.removeObject).toEqual([`u/${HASH}`]);
  });

  it('makes no second call when the storage remove fails, so the row stays deleting', async () => {
    const { ports, log } = fakePorts({
      store: {
        ...fakePorts().ports.store,
        removeObject: async () => {
          throw new Error('remove failed');
        },
      },
    });
    await expect(removeUpload(document(), ports)).rejects.toThrow('remove failed');
    expect(log).toEqual(['remove(false)']);
  });

  it('runs the same steps for a row already in deleting (Try again)', async () => {
    const { ports, log } = fakePorts();
    await removeUpload(document({ state: 'deleting' }), ports);
    expect(log).toEqual(['remove(false)', 'removeObject', 'remove(true)']);
  });

  it('stops after the first call when it already removed the row, and throws when it returned no key', async () => {
    const gone = fakePorts({ remove: async (id) => ({ id, kind: 'upload', state: 'deleted', storageKey: null }) });
    await expect(removeUpload(document(), gone.ports)).resolves.toMatchObject({ state: 'deleted' });
    expect(gone.log).toEqual([]);
    const keyless = fakePorts({ remove: async (id) => ({ id, kind: 'upload', state: 'deleting', storageKey: null }) });
    await expect(removeUpload(document(), keyless.ports)).rejects.toThrow(/key/);
  });
});
