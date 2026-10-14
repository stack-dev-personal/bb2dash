/**
 * bb2dash — what an upload must be before anything is sent (Phase 24b, brief
 * 111, task 5; "Uploading from his device").
 *
 * 24a's limits (migration 190, the fixture README's "browser's four"): six
 * types, 1 to 20,971,520 bytes, a title of 1 to 200 characters, and an object
 * key that is `u/` followed by the content's SHA-256. The page refuses a file
 * here first, so the database's own refusal (23514) is a fallback.
 *
 * THE TYPE COMES FROM THE NAME. A browser may report no type for a Markdown
 * file, and may report a wrong one for anything else, so the extension decides
 * and the page sets the stored content type itself. `File.type` is never read.
 *
 * Pure: no request, no clock.
 */

import { UPLOAD_REFUSALS } from './workspace-labels';

/** The largest upload, in bytes (20 MiB): `workspace_upload_register`'s check. */
export const WORKSPACE_UPLOAD_MAX_BYTES = 20_971_520;

/** The longest title, in characters as `char_length` counts them. */
export const WORKSPACE_UPLOAD_TITLE_MAX = 200;

/** The six types of migration 190, with the extension each is known by. */
export const WORKSPACE_UPLOAD_TYPES: ReadonlyArray<{
  extension: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt' | 'md';
  mime: string;
}> = Object.freeze([
  { extension: 'pdf', mime: 'application/pdf' },
  { extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { extension: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { extension: 'txt', mime: 'text/plain' },
  { extension: 'md', mime: 'text/markdown' },
]);

export type UploadRefusalReason = 'too_large' | 'bad_type';

export type UploadRuleResult =
  | { ok: true; mime: string; extension: string; title: string }
  | { ok: false; reason: UploadRefusalReason; sentence: string };

/** The smallest upload the database takes. */
const MIN_BYTES = 1;

/** The title of a file whose name holds nothing once trimmed. A stored value, not page wording. */
const UNTITLED = 'Untitled';

/** A SHA-256 as Postgres stores it: 64 lower-case hex characters. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The object key's prefix in `workspace-uploads`; 24a's table refuses any other key. */
const STORAGE_KEY_PREFIX = 'u/';

/** The content type of an extension (any case, with or without its dot), or null outside the six. */
export function mimeForExtension(extension: string): string | null {
  const bare = extension.replace(/^\./, '').toLowerCase();
  return WORKSPACE_UPLOAD_TYPES.find((type) => type.extension === bare)?.mime ?? null;
}

/** The text after a file name's last dot, or '' when there is none (or nothing after it). */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).trim();
}

function refused(reason: UploadRefusalReason): UploadRuleResult {
  return { ok: false, reason, sentence: UPLOAD_REFUSALS[reason] };
}

/**
 * Whether a file may be uploaded, before any request: its type by its
 * extension, then its size, 1 to the limit. An empty file is refused as a bad
 * type (it is no readable file of the six; the database takes a size from 1).
 */
export function checkUploadRules(file: { name: string; size: number }): UploadRuleResult {
  const extension = extensionOf(file.name).toLowerCase();
  const mime = mimeForExtension(extension);
  if (mime === null) return refused('bad_type');
  if (!Number.isSafeInteger(file.size) || file.size < MIN_BYTES) return refused('bad_type');
  if (file.size > WORKSPACE_UPLOAD_MAX_BYTES) return refused('too_large');
  return { ok: true, mime, extension, title: uploadTitleOf(file.name) };
}

/**
 * The name kept as the upload's title: trimmed, cut to 200 characters, and
 * trimmed again, since a cut can end on a space (R2-2: the register call takes
 * only a trimmed title); "Untitled" when nothing is left.
 */
export function uploadTitleOf(fileName: string): string {
  const cut = Array.from(fileName.trim()).slice(0, WORKSPACE_UPLOAD_TITLE_MAX).join('').trim();
  return cut === '' ? UNTITLED : cut;
}

/** The object key of a content hash: `u/` and the hash. Throws for anything that is not one. */
export function storageKeyFor(sha256: string): string {
  if (!SHA256_HEX.test(sha256)) {
    throw new Error('an upload key needs a SHA-256 of 64 lower-case hex characters');
  }
  return `${STORAGE_KEY_PREFIX}${sha256}`;
}
