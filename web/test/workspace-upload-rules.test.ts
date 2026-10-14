/**
 * The upload rules (Phase 24b, brief 111, task 5): what the page checks before
 * anything is sent. Six types decided by the extension, a size of 1 to
 * 20,971,520 bytes (24a's limits, migration 190), a title of 1 to 200
 * characters as `char_length` counts them, and the object key made from the
 * hash alone.
 */

import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_UPLOAD_MAX_BYTES,
  WORKSPACE_UPLOAD_TITLE_MAX,
  WORKSPACE_UPLOAD_TYPES,
  checkUploadRules,
  mimeForExtension,
  storageKeyFor,
  uploadTitleOf,
  type UploadRefusalReason,
} from '@/lib/workspace-upload-rules';
import { UPLOAD_REFUSALS } from '@/lib/workspace-labels';

/** The refusal sentences are keyed by this module's reasons: the two are pinned equal. */
const _refusals: Record<UploadRefusalReason, string> = UPLOAD_REFUSALS;

const HASH = 'a'.repeat(64);

describe('the six types of migration 190', () => {
  it('lists the six extensions with their content types', () => {
    expect(WORKSPACE_UPLOAD_TYPES).toEqual([
      { extension: 'pdf', mime: 'application/pdf' },
      { extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { extension: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { extension: 'txt', mime: 'text/plain' },
      { extension: 'md', mime: 'text/markdown' },
    ]);
    expect(Object.keys(_refusals).sort()).toEqual(['bad_type', 'too_large']);
  });

  it('reads an extension in any case, with or without its dot', () => {
    expect(mimeForExtension('PDF')).toBe('application/pdf');
    expect(mimeForExtension('.md')).toBe('text/markdown');
    expect(mimeForExtension('exe')).toBeNull();
    expect(mimeForExtension('')).toBeNull();
  });
});

describe('checkUploadRules: refused before any request', () => {
  it('takes a file at the limit', () => {
    expect(checkUploadRules({ name: 'notes.pdf', size: WORKSPACE_UPLOAD_MAX_BYTES })).toEqual({
      ok: true,
      mime: 'application/pdf',
      extension: 'pdf',
      title: 'notes.pdf',
    });
  });

  it('refuses a file of 20,971,521 bytes with the size sentence', () => {
    expect(WORKSPACE_UPLOAD_MAX_BYTES).toBe(20_971_520);
    expect(checkUploadRules({ name: 'big.pdf', size: 20_971_521 })).toEqual({
      ok: false,
      reason: 'too_large',
      sentence: UPLOAD_REFUSALS.too_large,
    });
  });

  it('takes a Markdown file by its extension, whatever the browser reported', () => {
    // The rule reads the name and the size only: a browser may report no type for Markdown.
    const markdown = new File(['# Notes'], 'Week 5.MD', { type: '' });
    expect(markdown.type).toBe('');
    expect(checkUploadRules(markdown)).toMatchObject({ ok: true, mime: 'text/markdown', extension: 'md' });
  });

  it('refuses another type, and a name with no extension', () => {
    for (const name of ['setup.exe', 'archive.tar.gz', 'README', 'trailing.']) {
      expect(checkUploadRules({ name, size: 10 })).toEqual({
        ok: false,
        reason: 'bad_type',
        sentence: UPLOAD_REFUSALS.bad_type,
      });
    }
  });

  it('refuses an empty file (the database takes a size from 1) and a size that is not a count', () => {
    expect(checkUploadRules({ name: 'empty.txt', size: 0 })).toMatchObject({ ok: false, reason: 'bad_type' });
    expect(checkUploadRules({ name: 'odd.txt', size: Number.NaN })).toMatchObject({ ok: false, reason: 'bad_type' });
  });
});

describe('uploadTitleOf: the name kept as the title', () => {
  it('trims the name', () => {
    expect(uploadTitleOf('  lab notes.pdf  ')).toBe('lab notes.pdf');
  });

  it('cuts it to 200 characters as char_length counts them', () => {
    const emoji = '😀'.repeat(250);
    const title = uploadTitleOf(emoji);
    expect(Array.from(title)).toHaveLength(WORKSPACE_UPLOAD_TITLE_MAX);
    expect(title.length).toBe(400); // 200 code points, 400 UTF-16 units
  });

  it('is "Untitled" for a name with nothing in it', () => {
    expect(uploadTitleOf('   ')).toBe('Untitled');
  });
});

describe('storageKeyFor: the key is the hash, never the name', () => {
  it('is u/ followed by the hash', () => {
    expect(storageKeyFor(HASH)).toBe(`u/${HASH}`);
  });

  it('throws for a hash that is not 64 lower-case hex characters', () => {
    for (const bad of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`, '../etc/passwd', '']) {
      expect(() => storageKeyFor(bad)).toThrow();
    }
  });
});
