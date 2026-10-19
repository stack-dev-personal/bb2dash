// Task 10 (R-81, P-104): the files step and the embed step, on Phase 18's signed fetch and
// pull_files.mjs's pure helpers, with fakes for the network, Storage, extraction and the embed.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKeyFor } from '../../ingest/pull_files.mjs';
import type { FileStoredArgs, TextUnit, WorklistRow } from '../src/db.js';
import {
  EMBED_TIMEOUT_MS,
  makeEmbedder,
  makeExtractor,
  makeSupabaseFiles,
  moveIntoPlace,
  runFilesStep,
  safeJoin,
  type FilesPorts,
} from '../src/files.js';

const CDN = 'https://abc.content.blackboardcdn.com/signed/file?sig=1';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 0x20)]);
const SHA = createHash('sha256').update(PDF).digest('hex');
/** File 2489 (W-73): a curly apostrophe Storage refuses with 400 InvalidKey. */
const MUSK = 'Musk’s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf';
const MUSK_KEY = 'Musk_s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf';

let dir: string;
let tmpDir: string;
let courseDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w55-files-'));
  tmpDir = path.join(dir, 'tmp');
  courseDir = path.join(dir, 'course context');
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function row(id: string, over: Partial<WorklistRow> = {}): WorklistRow {
  return {
    id,
    file_name: `Lecture ${id}.pdf`,
    relpath: `IST.323/lecture_slides/week-01/Lecture ${id}.pdf`,
    mime: 'application/pdf',
    source_url: `https://blackboard.syracuse.edu/bbcswebdav/xid-${id}_1`,
    bucket: 'lecture_slides',
    attempt_id: null,
    ...over,
  };
}

/** Hops: the durable URL 302s to the CDN, unless a status is scripted for that row's URL. */
function hopFor(statusByUrl: Record<string, number> = {}) {
  return vi.fn(async (url: string): Promise<{ status: number; headers: Record<string, string> }> => {
    const scripted = statusByUrl[url];
    if (scripted !== undefined) return { status: scripted, headers: {} };
    return { status: 302, headers: { location: CDN } };
  });
}

function ports(rows: WorklistRow[], over: Partial<FilesPorts> = {}) {
  const stored: FileStoredArgs[] = [];
  const texts: { id: string; units: TextUnit[] }[] = [];
  const linked: { id: string; url: string }[] = [];
  const order: string[] = [];
  const p: FilesPorts = {
    rpc: {
      fileWorklist: vi.fn(async () => rows),
      fileStored: vi.fn(async (a: FileStoredArgs) => {
        // sync_file_stored's gate since 095: the key must be bb_file_storage_key(relpath), which is
        // storageKeyFor's rule (db/fixtures/phase14/storage_keys.json pins the two together).
        // With 091's gate, replace(relpath, '#', '_'), file 2489 was refused here (W-73 R2-1).
        if (a.key !== storageKeyFor({ relpath: a.relpath })) {
          throw Object.assign(new Error("sync_file_stored: key is not the relpath's storage key"), { code: '22023' });
        }
        stored.push(a);
        order.push(`stored ${a.id}`);
        return true;
      }),
      fileOutsideLink: vi.fn(async (id: string, url: string) => {
        linked.push({ id, url });
        order.push(`linked ${id}`);
        return true;
      }),
      fileTextPut: vi.fn(async (id: string, units: TextUnit[]) => {
        texts.push({ id, units });
        order.push('text');
        return { inserted: units.length, present: 0 };
      }),
    },
    hop: hopFor(),
    fetchSigned: vi.fn(async () => new Response(PDF, { status: 200 })),
    storagePost: vi.fn(async () => {
      order.push('storage');
      return { status: 200, body: '{}' };
    }),
    extract: vi.fn(async () => [{ unit_kind: 'page', unit_no: 1, text: 'hello' }]),
    embed: vi.fn(async () => {
      order.push('embed');
      return { code: 0, tail: 'remaining_parts=0' };
    }),
    fs: { mkdir: fs.promises.mkdir, rename: fs.promises.rename, copyFile: fs.promises.copyFile, unlink: fs.promises.unlink, readFile: fs.promises.readFile },
    tmpDir,
    courseFilesDir: courseDir,
    loginCheck: vi.fn(async () => 'alive' as const),
    log: () => {},
    ...over,
  };
  return { p, stored, order, linked, texts };
}

describe('the files step', () => {
  it('pulls a file: Storage, course-files, extract, text, then sync_file_stored with its sha256', async () => {
    const { p, stored, order } = ports([row('11')]);
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(r.stopped).toBeNull();
    expect(stored).toEqual([{
      id: '11',
      key: 'IST.323/lecture_slides/week-01/Lecture 11.pdf',
      relpath: 'IST.323/lecture_slides/week-01/Lecture 11.pdf',
      sha256: SHA,
      bytes: PDF.length,
      mime: 'application/pdf',
      textStatus: 'extracted',
    }]);
    expect(order).toEqual(['storage', 'text', 'stored 11', 'embed']);
    expect(fs.readFileSync(path.join(courseDir, 'IST.323/lecture_slides/week-01/Lecture 11.pdf'))).toEqual(PDF);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(p.hop).toHaveBeenCalledWith('https://blackboard.syracuse.edu/bbcswebdav/xid-11_1');
  });

  it('a key drops "#" the way storageKeyFor does; the relpath keeps it', async () => {
    const { p, stored } = ports([row('12', { file_name: 'HW #2.pdf', relpath: 'IST.323/assignment_spec/HW #2.pdf' })]);
    await runFilesStep(p);
    expect(stored[0]).toMatchObject({ key: 'IST.323/assignment_spec/HW _2.pdf', relpath: 'IST.323/assignment_spec/HW #2.pdf' });
  });

  it('W-73: file 2489\'s curly apostrophe is a _ in the Storage key; the relpath, and so the mirror, keeps it', async () => {
    const { p, stored } = ports([row('2489', { file_name: MUSK, relpath: `GEO.103/readings/${MUSK}`, bucket: 'readings' })]);
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(p.storagePost).toHaveBeenCalledWith(`GEO.103/readings/${MUSK_KEY}`, expect.any(Buffer), 'application/pdf');
    expect(stored[0]).toMatchObject({ key: `GEO.103/readings/${MUSK_KEY}`, relpath: `GEO.103/readings/${MUSK}` });
    expect(fs.existsSync(path.join(courseDir, 'GEO.103', 'readings', MUSK))).toBe(true);
  });

  it.each([401, 403])('session_expired (%i at the first hop) with a dead re-probe stops the step: later rows are not tried', async (status) => {
    const rows = [row('21'), row('22'), row('23')];
    const loginCheck = vi.fn(async () => 'dead' as const);
    const { p, stored } = ports(rows, { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-22_1': status }), loginCheck });
    const r = await runFilesStep(p);
    expect(r.stopped).toBe('session_expired');
    expect(loginCheck).toHaveBeenCalledTimes(1);
    expect(stored.map((s) => s.id)).toEqual(['21']);
    expect(r.files.pulled).toBe(1);
    expect(r.files.not_pulled).toEqual([{ id: '22', reason: `session_expired: status ${status}` }]);
    expect(p.hop).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('R2 item 3: one file\'s %i with users/me still 200 is that file refused, and the step goes on', async (status) => {
    const rows = [row('24'), row('25'), row('26')];
    const loginCheck = vi.fn(async () => 'alive' as const);
    const { p, stored } = ports(rows, { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-25_1': status }), loginCheck });
    const r = await runFilesStep(p);
    expect(r.stopped).toBeNull();
    expect(loginCheck).toHaveBeenCalledTimes(1);
    expect(stored.map((s) => s.id)).toEqual(['24', '26']);
    expect(r.files.not_pulled).toEqual([{ id: '25', reason: `refused: status ${status} at the first hop, but the login check passed` }]);
  });

  it('R2 item 3: a re-probe that does not answer is not a dead login either', async () => {
    const loginCheck = vi.fn(async () => 'error' as const);
    const { p } = ports([row('27'), row('28')], { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-27_1': 401 }), loginCheck });
    const r = await runFilesStep(p);
    expect(r.stopped).toBeNull();
    expect(r.files.pulled).toBe(1);
    expect(r.files.not_pulled[0]!.reason).toBe('refused: status 401 at the first hop, and the login check did not answer');
  });

  it('gone (404) is reported in not_pulled and never reaches sync_file_stored', async () => {
    const { p, stored } = ports([row('31')], { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-31_1': 404 }) });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '31', reason: 'gone: status 404' }]);
    expect(stored).toEqual([]);
    expect(p.storagePost).not.toHaveBeenCalled();
  });

  it('a file whose link redirects to Blackboard\'s file store is pulled, and the file store is downloaded from, never hopped to', async () => {
    const fileStore = 'https://prod02-use1-prod02-xythos.prod.files.blackboard.com/xythoswfs/webui/_xy-1?X-Blackboard-Signature=abc';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: fileStore } }));
    const { p, stored, linked } = ports([row('12')], { hop });
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(stored.map((s) => s.id)).toEqual(['12']);
    expect(linked).toEqual([]);
    expect(hop).toHaveBeenCalledTimes(1);
    expect(p.fetchSigned).toHaveBeenCalledWith(fileStore);
  });
  it('refused (a redirect to a Blackboard host off the allow-list) is reported in not_pulled with the host, never stored or linked', async () => {
    const hop = vi.fn(async () => ({ status: 302, headers: { location: 'https://learn.blackboardcdn.com/x.pdf?X-Amz-Signature=beef' } }));
    const { p, stored, linked } = ports([row('32')], { hop });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toHaveLength(1);
    expect(r.files.not_pulled[0]).toMatchObject({ id: '32', reason: expect.stringMatching(/^refused: .*learn\.blackboardcdn\.com/) });
    expect(r.files.not_pulled[0]!.reason).not.toMatch(/beef|X-Amz/);
    expect(stored).toEqual([]);
    expect(linked).toEqual([]);
    expect(r.files.linked ?? 0).toBe(0);
  });

  it('164: a redirect to another site is saved as a link: no bytes, no gap, counted as linked not as not_pulled', async () => {
    const target = 'https://www.cbo.gov/system/files/2024/report.pdf';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: target } }));
    const { p, stored, linked, order } = ports([row('33')], { hop });
    const r = await runFilesStep(p);
    expect(linked).toEqual([{ id: '33', url: target }]);
    expect(r.files).toEqual({ pulled: 0, not_pulled: [], linked: 1 });
    expect(stored).toEqual([]);
    expect(hop).toHaveBeenCalledTimes(1); // the target itself is never requested
    expect(p.fetchSigned).not.toHaveBeenCalled();
    expect(p.storagePost).not.toHaveBeenCalled();
    // Phase 24a: the embed loop runs once on every pass, a pass that only linked a file included
    // (DECISIONS 2026-10-08, "course files are embedded on every sync pass"); 164 wrote this
    // expectation on `main` against the older rule, and the merge of 2026-10-14 brings it to 24a's.
    expect(order).toEqual(['linked 33', 'embed']);
    expect(p.embed).toHaveBeenCalledTimes(1);
  });

  it('164: pulled, linked and flagged files are counted apart in one pass', async () => {
    const target = 'https://www.sec.gov/a.pdf';
    const hop = vi.fn(async (url: string): Promise<{ status: number; headers: Record<string, string> }> => {
      if (url.endsWith('xid-35_1')) return { status: 302, headers: { location: target } };
      if (url.endsWith('xid-36_1')) return { status: 404, headers: {} };
      return { status: 302, headers: { location: CDN } };
    });
    const { p, linked } = ports([row('34'), row('35'), row('36')], { hop });
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [{ id: '36', reason: 'gone: status 404' }], linked: 1 });
    expect(linked).toEqual([{ id: '35', url: target }]);
  });

  it('164: a redirect to an IP, localhost or credentials is flagged, not linked', async () => {
    for (const location of ['http://127.0.0.1:9000/x', 'https://localhost/x', 'ftp://example.com/x', 'https://u:p@example.com/x']) {
      const hop = vi.fn(async () => ({ status: 302, headers: { location } }));
      const { p, linked } = ports([row('37')], { hop });
      const r = await runFilesStep(p);
      expect(linked).toEqual([]);
      expect(r.files.not_pulled).toHaveLength(1);
      expect(r.files.not_pulled[0]!.reason).toMatch(/^refused: /);
      expect(r.files.not_pulled[0]!.reason).not.toMatch(/u:p|127\.0\.0\.1/);
    }
  });

  it('164: a redirect to a sign-in page or a university host is flagged with the host, never linked, and never asks the login check', async () => {
    for (const location of [
      'https://login.microsoftonline.com/tenant/saml2?SAMLRequest=abc',
      'https://shib.syracuse.edu/idp/x',
      'https://www.syr.edu/x',
      'https://files.example.org/f.pdf?X-Amz-Signature=beef',
    ]) {
      const hop = vi.fn(async () => ({ status: 302, headers: { location } }));
      const loginCheck = vi.fn(async () => 'alive' as const);
      const { p, linked } = ports([row('50')], { hop, loginCheck });
      const r = await runFilesStep(p);
      expect(linked).toEqual([]);
      expect(loginCheck).not.toHaveBeenCalled();
      expect(r.files.not_pulled).toHaveLength(1);
      expect(r.files.not_pulled[0]!.reason).toContain(new URL(location).hostname);
      expect(r.files.not_pulled[0]!.reason).not.toMatch(/SAMLRequest|beef|X-Amz/);
    }
  });

  it('164: before saving a link the login check is asked, and a dead session stops the step like a 401', async () => {
    const target = 'https://www.cbo.gov/x.pdf';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: target } }));
    const loginCheck = vi.fn(async () => 'dead' as const);
    const { p, linked } = ports([row('51'), row('52')], { hop, loginCheck });
    const r = await runFilesStep(p);
    expect(loginCheck).toHaveBeenCalledTimes(1);
    expect(linked).toEqual([]);
    expect(r.stopped).toBe('session_expired');
    expect(r.files.not_pulled).toHaveLength(1);
    expect(r.files.not_pulled[0]!.id).toBe('51');
    expect(r.files.not_pulled[0]!.reason).toMatch(/^session_expired: /);
    expect(hop).toHaveBeenCalledTimes(1);
  });

  it('164: a login check that does not answer saves nothing and names the host', async () => {
    const target = 'https://www.cbo.gov/x.pdf?page=1';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: target } }));
    const loginCheck = vi.fn(async () => 'error' as const);
    const { p, linked } = ports([row('53'), row('54')], { hop, loginCheck });
    const r = await runFilesStep(p);
    expect(linked).toEqual([]);
    expect(r.stopped).toBeNull();
    expect(r.files.not_pulled).toEqual([
      { id: '53', reason: 'offsite: www.cbo.gov, but the login check did not answer, so the link was not saved' },
      { id: '54', reason: 'offsite: www.cbo.gov, but the login check did not answer, so the link was not saved' },
    ]);
  });

  it('164: an alive login check saves the link', async () => {
    const target = 'https://www.cbo.gov/x.pdf';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: target } }));
    const loginCheck = vi.fn(async () => 'alive' as const);
    const { p, linked } = ports([row('55')], { hop, loginCheck });
    const r = await runFilesStep(p);
    expect(loginCheck).toHaveBeenCalledTimes(1);
    expect(linked).toEqual([{ id: '55', url: target }]);
    expect(r.files.linked).toBe(1);
  });

  it('164: no redirect (404, a 200 page) is flagged as before, never linked', async () => {
    const { p, linked } = ports([row('38'), row('39')], {
      hop: hopFor({
        'https://blackboard.syracuse.edu/bbcswebdav/xid-38_1': 404,
        'https://blackboard.syracuse.edu/bbcswebdav/xid-39_1': 200,
      }),
    });
    const r = await runFilesStep(p);
    expect(linked).toEqual([]);
    expect(r.files.not_pulled.map((n) => n.id)).toEqual(['38', '39']);
  });

  it('164: sync_file_outside_link answering false or refusing leaves the file flagged, with the host only', async () => {
    const target = 'https://www.cbo.gov/x.pdf?page=secret';
    const hop = vi.fn(async () => ({ status: 302, headers: { location: target } }));
    const answers: (boolean | Error)[] = [false, new Error('sync_file_outside_link: url is not a usable link')];
    const rows = [row('40'), row('47')];
    const { p } = ports(rows, {
      hop,
      rpc: {
        fileWorklist: vi.fn(async () => rows),
        fileStored: vi.fn(async () => true),
        fileOutsideLink: vi.fn(async () => {
          const a = answers.shift()!;
          if (a instanceof Error) throw a;
          return a;
        }),
        fileTextPut: vi.fn(async (_id: string, units: TextUnit[]) => ({ inserted: units.length, present: 0 })),
      },
    });
    const r = await runFilesStep(p);
    expect(r.files.linked ?? 0).toBe(0);
    expect(r.files.not_pulled).toEqual([
      { id: '40', reason: 'offsite: www.cbo.gov, but the database kept the row as it was (stored, superseded or gone)' },
      { id: '47', reason: 'offsite: www.cbo.gov, sync_file_outside_link refused: sync_file_outside_link: url is not a usable link' },
    ]);
    for (const n of r.files.not_pulled) expect(n.reason).not.toMatch(/secret/);
  });

  it('R2 item 2: a course file already in Storage (409 or Duplicate) goes on to the text and sync_file_stored', async () => {
    const answers = [{ status: 409, body: '{"error":"Duplicate"}' }, { status: 400, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }];
    const { p, stored } = ports([row('43'), row('44')], { storagePost: vi.fn(async () => answers.shift()!) });
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 2, not_pulled: [] });
    expect(stored.map((s) => s.id)).toEqual(['43', '44']);
  });

  it('R2 item 2: an upload whose text put failed is recorded on the next pass, past the Duplicate', async () => {
    let storageCalls = 0;
    const storagePost = vi.fn(async () => (storageCalls++ === 0 ? { status: 200, body: '{}' } : { status: 409, body: '{"error":"Duplicate"}' }));
    const first = ports([row('45')], { storagePost });
    first.p.rpc.fileTextPut = vi.fn(async () => { throw Object.assign(new Error('connection terminated'), { code: '08006' }); });
    const r1 = await runFilesStep(first.p);
    expect(r1.files.not_pulled).toEqual([{ id: '45', reason: 'sync_file_text_put refused: connection terminated' }]);
    expect(first.stored).toEqual([]);

    const second = ports([row('45')], { storagePost });
    const r2 = await runFilesStep(second.p);
    expect(r2.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(second.stored.map((s) => [s.id, s.textStatus])).toEqual([['45', 'extracted']]);
  });

  it('Phase 25a: the units go through sync_file_text_put as kind, number and text, never over REST', async () => {
    const { p, texts } = ports([row('48')], {
      extract: vi.fn(async () => [{ unit_kind: 'page', unit_no: 1, text: 'one' }, { unit_kind: 'page', unit_no: 2, text: 'two' }]),
    });
    const r = await runFilesStep(p);
    expect(r.unitsPosted).toBe(2);
    expect(texts).toEqual([{ id: '48', units: [{ unit_kind: 'page', unit_no: 1, text: 'one' }, { unit_kind: 'page', unit_no: 2, text: 'two' }] }]);
    expect(Object.keys(p)).not.toContain('textPost');
  });

  it('units already there (file 163) are kept and the file is recorded; only the inserted ones count as posted', async () => {
    const lines: string[] = [];
    const { p, stored } = ports([row('46'), row('47')], { log: (l) => lines.push(l) });
    const answers = [{ inserted: 0, present: 1 }, { inserted: 1, present: 1 }];
    p.rpc.fileTextPut = vi.fn(async () => answers.shift()!);
    p.extract = vi.fn(async () => [{ unit_kind: 'page', unit_no: 1, text: 'a' }]);
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(2);
    expect(stored.map((s) => s.textStatus)).toEqual(['extracted', 'extracted']);
    expect(r.unitsPosted).toBe(1);
    expect(lines).toContain('files: 46 already had 1 of 1 text unit(s); kept');
    expect(p.embed).toHaveBeenCalledTimes(1);
  });

  it('a file whose text 200 refuses as too large (54000) is stored with text_status failed and logged, so it is not pulled again', async () => {
    const lines: string[] = [];
    const { p, stored } = ports([row('3713')], { log: (l) => lines.push(l) });
    p.rpc.fileTextPut = vi.fn(async () => {
      throw Object.assign(new Error('sync_file_text_put: too large: a file puts at most 1000 units, not 1200'), { code: '54000' });
    });
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(r.unitsPosted).toBe(0);
    expect(stored.map((s) => [s.id, s.textStatus])).toEqual([['3713', 'failed']]);
    expect(lines).toContain('files: 3713 text not stored, too large for sync_file_text_put (sync_file_text_put: too large: a file puts at most 1000 units, not 1200); stored with text_status failed');
  });

  it('a unit with blank text is not sent (200 refuses it); a file with only blank units is stored with text_status failed', async () => {
    const mixed = ports([row('49')], { extract: vi.fn(async () => [{ unit_kind: 'doc', unit_no: 1, text: '  ' }, { unit_kind: 'page', unit_no: 2, text: 'kept' }]) });
    await runFilesStep(mixed.p);
    expect(mixed.texts).toEqual([{ id: '49', units: [{ unit_kind: 'page', unit_no: 2, text: 'kept' }] }]);
    expect(mixed.stored[0]!.textStatus).toBe('extracted');

    const blank = ports([row('50')], { extract: vi.fn(async () => [{ unit_kind: 'doc', unit_no: 1, text: '' }]) });
    const r = await runFilesStep(blank.p);
    expect(r.files.pulled).toBe(1);
    expect(blank.p.rpc.fileTextPut).not.toHaveBeenCalled();
    expect(blank.stored[0]!.textStatus).toBe('failed');
  });

  it('a submission already in Storage (409 or Duplicate) is reported in not_pulled, never done, never stored', async () => {
    const sub = (id: string) => row(id, { bucket: 'my_submissions', relpath: `IST.323/my_submissions/hw/attempt-9/${id}.pdf` });
    const rows = [sub('41'), sub('42')];
    const answers = [{ status: 409, body: '{"error":"Duplicate"}' }, { status: 400, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }];
    const { p, stored } = ports(rows, { storagePost: vi.fn(async () => answers.shift()!) });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(0);
    expect(r.files.not_pulled.map((n) => n.id)).toEqual(['41', '42']);
    expect(r.files.not_pulled[0]!.reason).toMatch(/^storage 409/);
    expect(stored).toEqual([]);
    expect(p.extract).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('W-73: a course file whose key sanitising left alone still resumes past a 409', async () => {
    const { p, stored } = ports([row('47', { relpath: "IST.323/readings/O'Brien (1) & co.pdf", bucket: 'readings' })], {
      storagePost: vi.fn(async () => ({ status: 409, body: '{"error":"Duplicate"}' })),
    });
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(stored.map((s) => s.key)).toEqual(["IST.323/readings/O'Brien (1) & co.pdf"]);
  });

  it('W-73: a course file whose key sanitising changed refuses a 409: another name may own that key', async () => {
    const { p, stored } = ports([row('2489', { file_name: MUSK, relpath: `GEO.103/readings/${MUSK}`, bucket: 'readings' })], {
      storagePost: vi.fn(async () => ({ status: 409, body: '{"error":"Duplicate"}' })),
    });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(0);
    expect(r.files.not_pulled).toEqual([{
      id: '2489',
      reason: `storage 409: key already occupied; this key was sanitised, so the object there may be another file; a human decides (${MUSK_KEY})`,
    }]);
    expect(stored).toEqual([]);
    expect(p.extract).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('W-73: two names that differ only in a refused character: the second to arrive is refused, not recorded on the first\'s bytes', async () => {
    let calls = 0;
    const rows = [
      row('61', { file_name: 'a’b.pdf', relpath: 'GEO.103/readings/a’b.pdf', bucket: 'readings' }),
      row('62', { file_name: 'a“b.pdf', relpath: 'GEO.103/readings/a“b.pdf', bucket: 'readings' }),
    ];
    const { p, stored } = ports(rows, {
      storagePost: vi.fn(async () => (calls++ === 0 ? { status: 200, body: '{}' } : { status: 409, body: '{"error":"Duplicate"}' })),
    });
    const r = await runFilesStep(p);
    expect(p.storagePost).toHaveBeenNthCalledWith(1, 'GEO.103/readings/a_b.pdf', expect.any(Buffer), 'application/pdf');
    expect(p.storagePost).toHaveBeenNthCalledWith(2, 'GEO.103/readings/a_b.pdf', expect.any(Buffer), 'application/pdf');
    expect(stored.map((s) => s.id)).toEqual(['61']);
    expect(r.files.not_pulled).toEqual([{ id: '62', reason: 'storage 409: key already occupied; this key was sanitised, so the object there may be another file; a human decides (a_b.pdf)' }]);
  });

  it('bytes that do not look like the file are reported, not stored', async () => {
    const { p, stored } = ports([row('51')], { fetchSigned: vi.fn(async () => new Response('<html>login</html>', { status: 200 })) });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled[0]).toMatchObject({ id: '51', reason: expect.stringMatching(/^bad bytes/) });
    expect(stored).toEqual([]);
  });

  it('a relpath that climbs out of course-files is refused before any request', async () => {
    const { p, stored } = ports([row('52', { relpath: '../../etc/passwd' })]);
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '52', reason: 'unsafe relpath' }]);
    expect(p.hop).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it('a refused text put leaves the row unstored and reported; an already-present answer keeps the text', async () => {
    const rows = [row('61'), row('62')];
    const answers: ({ inserted: number; present: number } | Error)[] = [
      Object.assign(new Error('sync_file_text_put: each unit needs a unit_kind of doc, page, sheet or slide\nDETAIL: x'), { code: '22023' }),
      { inserted: 0, present: 1 },
    ];
    const { p, stored } = ports(rows);
    p.rpc.fileTextPut = vi.fn(async () => {
      const a = answers.shift()!;
      if (a instanceof Error) throw a;
      return a;
    });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '61', reason: 'sync_file_text_put refused: sync_file_text_put: each unit needs a unit_kind of doc, page, sheet or slide' }]);
    expect(stored.map((s) => s.id)).toEqual(['62']);
    expect(p.embed).toHaveBeenCalledTimes(1);
  });

  it('an extraction that fails still stores the bytes, with text_status failed', async () => {
    const { p, stored } = ports([row('63')], { extract: vi.fn(async () => { throw new Error('uv: not found'); }) });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(1);
    expect(stored[0]!.textStatus).toBe('failed');
    expect(p.rpc.fileTextPut).not.toHaveBeenCalled();
  });

  it('sync_file_stored refusing (false or an error) is reported, not counted', async () => {
    const answers: (boolean | Error)[] = [false, new Error('relpath is not bb_file_relpath(72)')];
    const { p } = ports([row('71'), row('72')], {
      rpc: {
        fileWorklist: vi.fn(async () => [row('71'), row('72')]),
        fileStored: vi.fn(async () => {
          const a = answers.shift()!;
          if (a instanceof Error) throw a;
          return a;
        }),
        fileOutsideLink: vi.fn(async () => true),
        fileTextPut: vi.fn(async (_id: string, units: TextUnit[]) => ({ inserted: units.length, present: 0 })),
      },
    });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(0);
    expect(r.files.not_pulled).toEqual([
      { id: '71', reason: 'already stored by another writer' },
      { id: '72', reason: 'sync_file_stored refused: relpath is not bb_file_relpath(72)' },
    ]);
  });

  it('runs the embed loop once on every pass, with or without new units (Phase 24a)', async () => {
    const two = ports([row('81'), row('82')]);
    const withUnits = await runFilesStep(two.p);
    expect(two.p.embed).toHaveBeenCalledTimes(1);
    expect(withUnits.unitsPosted).toBe(2);

    const none = ports([row('83')], { extract: vi.fn(async () => []) });
    const noUnits = await runFilesStep(none.p);
    expect(none.p.embed).toHaveBeenCalledTimes(1);
    expect(noUnits.unitsPosted).toBe(0);

    const empty = ports([]);
    const r = await runFilesStep(empty.p);
    expect(empty.p.embed).toHaveBeenCalledTimes(1);
    expect(r.files).toEqual({ pulled: 0, not_pulled: [] });
    expect(r.unitsPosted).toBe(0);
  });

  it("an embed that exits non-zero is the step's embedError", async () => {
    const { p } = ports([row('84')], { embed: vi.fn(async () => ({ code: 1, tail: 'embed-corpus 401' })) });
    const r = await runFilesStep(p);
    expect(Object.keys(r).sort()).toEqual(['embedError', 'files', 'stopped', 'unitsPosted']);
    expect(r.embedError).toBe("embed_corpus.mjs's loop ended 1: embed-corpus 401");
    expect(r.unitsPosted).toBe(1);
  });

  it('an embed that exits non-zero on a pass with no new unit is still reported, with unitsPosted 0', async () => {
    const { p } = ports([], { embed: vi.fn(async () => ({ code: 1, tail: 'one unit cannot embed' })) });
    const r = await runFilesStep(p);
    expect(r.unitsPosted).toBe(0);
    expect(r.embedError).toBe("embed_corpus.mjs's loop ended 1: one unit cannot embed");
  });
});

describe('the move into course-files', () => {
  it('renames when it can', async () => {
    const ops = { mkdir: vi.fn(async () => undefined), rename: vi.fn(async () => undefined), copyFile: vi.fn(), unlink: vi.fn() };
    await moveIntoPlace('/tmp/a', '/app/course context/x/a', ops);
    expect(ops.rename).toHaveBeenCalledWith('/tmp/a', '/app/course context/x/a');
    expect(ops.copyFile).not.toHaveBeenCalled();
  });

  it('an EXDEV from the move takes copy-then-unlink (tmpfs to the course-files volume)', async () => {
    const exdev = Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
    const ops = {
      mkdir: vi.fn(async () => undefined),
      rename: vi.fn(async () => { throw exdev; }),
      copyFile: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    };
    await moveIntoPlace('/tmp/a', '/app/course context/x/a', ops);
    expect(ops.copyFile).toHaveBeenCalledWith('/tmp/a', '/app/course context/x/a');
    expect(ops.unlink).toHaveBeenCalledWith('/tmp/a');
  });

  it('any other rename error is thrown', async () => {
    const ops = {
      mkdir: vi.fn(async () => undefined),
      rename: vi.fn(async () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); }),
      copyFile: vi.fn(),
      unlink: vi.fn(),
    };
    await expect(moveIntoPlace('/tmp/a', '/b', ops)).rejects.toThrow('EACCES');
    expect(ops.copyFile).not.toHaveBeenCalled();
  });

  it('safeJoin keeps a relpath inside its base', () => {
    expect(safeJoin('/app/course context', 'IST.323/a.pdf')).toBe(path.resolve('/app/course context', 'IST.323/a.pdf'));
    expect(safeJoin('/app/course context', '../x')).toBeNull();
    expect(safeJoin('/app/course context', '/etc/passwd')).toBeNull();
    expect(safeJoin('/app/course context', '')).toBeNull();
  });
});

describe('the adapters', () => {
  it('Storage: POST bb-files/<encoded key> with the publishable key and no x-upsert; no REST text insert is left', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    });
    const sb = makeSupabaseFiles('https://x.supabase.co', 'sb_publishable_abc', fetchImpl as unknown as typeof fetch);
    await sb.storagePost('IST.323/a b.pdf', Buffer.from('x'), 'application/pdf');
    expect(calls[0]!.url).toBe('https://x.supabase.co/storage/v1/object/bb-files/IST.323/a%20b.pdf');
    const h0 = calls[0]!.init.headers as Record<string, string>;
    expect(h0.apikey).toBe('sb_publishable_abc');
    expect(h0['Content-Type']).toBe('application/pdf');
    expect(Object.keys(h0).map((k) => k.toLowerCase())).not.toContain('x-upsert');
    expect(calls).toHaveLength(1);
    // Phase 25a: the units go through sync_file_text_put over pg; the anon key is for Storage only.
    expect(Object.keys(sb)).toEqual(['storagePost']);
  });

  it('R2 item 9: the extractor is pull_files\' extractUnits (the locked project), and uv gets only what it needs', async () => {
    const parent = { PATH: '/usr/bin', HOME: '/home/pwuser', UV_CACHE_DIR: '/cache/uv', LANG: 'C.UTF-8', SB_ANON_JWT: 'eyJ.secret.x', SB_ANON_KEY: 'sb_publishable_x', SYNC_RUNNER_DB_URL: 'postgresql://u:p@h/db' };
    const exec = vi.fn(() => JSON.stringify([{ file: 'a.pdf', status: 'ok', units: [{ unit_kind: 'page', unit_no: 1, text: 'x' }] }]));
    const extract = makeExtractor('/app/ingest', { exec, parentEnv: parent });
    expect(await extract('/app/course context/a.pdf')).toEqual([{ unit_kind: 'page', unit_no: 1, text: 'x' }]);
    const [cmd, args, opts] = exec.mock.calls[0] as unknown as [string, string[], { cwd: string; env: Record<string, string> }];
    expect(cmd).toBe('uv');
    expect(args).toEqual(['run', '--locked', '--project', '/app/ingest', 'python', path.join('/app/ingest', 'extract_text.py'), '/app/course context/a.pdf']);
    expect(opts.cwd).toBe('/app/ingest');
    expect(opts.env).toEqual({ PATH: '/usr/bin', HOME: '/home/pwuser', UV_CACHE_DIR: '/cache/uv', LANG: 'C.UTF-8' });
  });

  it('R2 item 9: the embedder runs embed_corpus.mjs\'s loop in-process with the anon JWT, no child process', async () => {
    const runLoop = vi.fn(async () => ({ exitCode: 0, calls: 2, retries: 0, remainingParts: 0 }));
    const makePostImpl = vi.fn(() => async () => ({ status: 200, body: {} }));
    const embed = makeEmbedder({ supabaseUrl: 'https://p.supabase.co', jwt: 'eyJ.anon.x', runLoop, makePost: makePostImpl, log: () => {} });
    expect(await embed()).toEqual({ code: 0, tail: 'remaining_parts=0' });
    expect(makePostImpl).toHaveBeenCalledWith('https://p.supabase.co', 'eyJ.anon.x');
    expect(runLoop).toHaveBeenCalledTimes(1);

    const failing = makeEmbedder({
      supabaseUrl: 'https://p.supabase.co', jwt: 'eyJ.anon.x', log: () => {}, makePost: makePostImpl,
      runLoop: vi.fn(async () => ({ exitCode: 1, calls: 1, retries: 0, remainingParts: null, error: 'embed-corpus answered 401' })),
    });
    expect(await failing()).toEqual({ code: 1, tail: 'embed-corpus answered 401' });
  });

  it('R2 item 5: an embed that runs past EMBED_TIMEOUT_MS fails cleanly, and its later posts end the loop', async () => {
    vi.useFakeTimers();
    try {
      expect(EMBED_TIMEOUT_MS).toBe(600_000);
      let sawPost: { status: number } | null = null;
      const runLoop = vi.fn(async (o: { post: (b: object) => Promise<{ status: number; body: unknown }> }) => {
        await new Promise((r) => setTimeout(r, EMBED_TIMEOUT_MS + 60_000));
        sawPost = await o.post({});
        return { exitCode: 1, error: 'stopped' };
      });
      const real = vi.fn(async () => ({ status: 200, body: {} }));
      const embed = makeEmbedder({ supabaseUrl: 'https://p.supabase.co', jwt: 'eyJ.anon.x', log: () => {}, runLoop, makePost: () => real });
      const pending = embed();
      await vi.advanceTimersByTimeAsync(EMBED_TIMEOUT_MS + 1);
      expect(await pending).toEqual({ code: 1, tail: 'embed timed out after 600 s' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sawPost).toMatchObject({ status: 408 });
      expect(real).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('R2 item 9: no source file spawns a child with the parent\'s environment', () => {
    for (const file of ['files.ts', 'main.ts']) {
      const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', file), 'utf8');
      expect(src, file).not.toMatch(/\.\.\.(process\.)?env\b|spawn\(/);
    }
  });
});
