/**
 * bb2dash — the Workspace's source labels (Phase 24b, brief 111, task 5).
 *
 * 24a's answering turn writes a label beside what it took from a source:
 * `[M<n>]` for a course passage, `[U<n>]` for an upload's passage, `[R<n>]` for
 * a remembered item and `[P]` for the planner feed (the fixture README, "Labels,
 * and what a label resolves to"). This module finds those tokens in an answer's
 * text (`answer-format.ts` uses it to keep a token whole as a `label` inline),
 * and turns a token into a numbered chip only when the request's
 * `workspace_sources` holds its row: the chip's number is the row's `ord`, and
 * anything else stays text. A passage the model found with its own search and
 * did not open has no row, so a bare token is a real case, not only a guard.
 *
 * Pure: the rows come in as arguments.
 */

import type { AnswerBlock, AnswerInline } from './answer-format';
import type { WorkspaceSource } from './queries.workspace-sources';
import { unitLocationLine } from './workspace-labels';

/** One whole label token, and nothing else. */
export const LABEL_TOKEN = /^\[(?:[MUR][1-9]\d{0,15}|P)\]$/;

/** The same shape, unanchored, for a scan through a text. */
const LABEL_SCAN = /\[(?:[MUR][1-9]\d{0,15}|P)\]/g;

const NO_TOKENS: ReadonlyArray<{ start: number; end: number; token: string }> = Object.freeze([]);

/**
 * Every label token in `text`, left to right, with its offsets: `start` is the
 * index of the `[`, `end` the index just past the `]`. Pure to its callers; a
 * text with no token gives an empty list.
 *
 * It runs on every text run of every flush (probe Q-4), so it is an `exec`
 * loop over one regex, reset before and after, rather than `matchAll`, which
 * copies the regex on each call; and a text with no `[` is not scanned at all.
 */
export function findLabelTokens(
  text: string,
): ReadonlyArray<{ start: number; end: number; token: string }> {
  if (!text.includes('[')) return NO_TOKENS;
  const found: Array<{ start: number; end: number; token: string }> = [];
  LABEL_SCAN.lastIndex = 0;
  for (let match = LABEL_SCAN.exec(text); match !== null; match = LABEL_SCAN.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length, token: match[0] });
  }
  LABEL_SCAN.lastIndex = 0;
  return found;
}

/* ---------------------------------------------------------------------------
 * A label and its source row (pure)
 * ------------------------------------------------------------------------ */

export type SourceLabel =
  | { kind: 'material'; textId: number }
  | { kind: 'upload'; docTextId: number }
  | { kind: 'memory'; documentId: number }
  | { kind: 'feed' };

const FEED_TOKEN = '[P]';

/** A token's form and id; null for anything that is not one whole token, or an id past 2^53. */
export function parseLabel(token: string): SourceLabel | null {
  if (!LABEL_TOKEN.test(token)) return null;
  if (token === FEED_TOKEN) return { kind: 'feed' };
  const id = Number(token.slice(2, -1));
  if (!Number.isSafeInteger(id)) return null;
  switch (token[1]) {
    case 'M':
      return { kind: 'material', textId: id };
    case 'U':
      return { kind: 'upload', docTextId: id };
    default:
      return { kind: 'memory', documentId: id };
  }
}

function matches(label: SourceLabel, source: WorkspaceSource): boolean {
  switch (label.kind) {
    case 'material':
      return source.kind === 'material' && source.text_id === label.textId;
    case 'upload':
      return source.kind === 'upload' && source.doc_text_id === label.docTextId;
    case 'memory':
      return source.kind === 'memory' && source.document_id === label.documentId;
    case 'feed':
      return source.kind === 'feed';
  }
}

function byOrd(sources: readonly WorkspaceSource[]): WorkspaceSource[] {
  return [...sources].sort((a, b) => a.ord - b.ord);
}

/**
 * The request's row a label points at: `[M<n>]` by `text_id`, `[U<n>]` by an
 * upload's `doc_text_id`, `[R<n>]` by a memory row's `document_id`, `[P]` by
 * the feed row; the first match by ord. Null when the request has no such row,
 * and the token then stays text. An attached file's row carries no unit id, so
 * no label resolves to it.
 */
export function resolveLabel(label: SourceLabel, sources: readonly WorkspaceSource[]): WorkspaceSource | null {
  return byOrd(sources).find((source) => matches(label, source)) ?? null;
}

/** A numbered chip: its token, its row, and the row's ord as its number. */
export interface Citation {
  token: string;
  source: WorkspaceSource;
  ord: number;
}

/** The chip a token makes, or null: a label with no source row is text. */
export function citationFor(token: string, sources: readonly WorkspaceSource[]): Citation | null {
  const label = parseLabel(token);
  const source = label === null ? null : resolveLabel(label, sources);
  return source === null ? null : { token, source, ord: source.ord };
}

/** Every label inline of the blocks, in answer order. A label in code is text, so it is not here. */
function labelTokensOf(blocks: readonly AnswerBlock[]): string[] {
  const tokens: string[] = [];
  const fromInlines = (inlines: readonly AnswerInline[]): void => {
    for (const inline of inlines) {
      if (inline.type === 'label') tokens.push(inline.token);
      if (inline.type === 'strong' || inline.type === 'em') fromInlines(inline.children);
    }
  };
  const fromBlocks = (list: readonly AnswerBlock[]): void => {
    for (const block of list) {
      if (block.type === 'paragraph' || block.type === 'heading') fromInlines(block.children);
      if (block.type === 'list') block.items.forEach(fromBlocks);
      if (block.type === 'quote') fromBlocks(block.children);
      if (block.type === 'table') {
        block.header.forEach(fromInlines);
        block.rows.forEach((row) => row.forEach(fromInlines));
      }
    }
  };
  fromBlocks(blocks);
  return tokens;
}

/** The ords the answer cites, in answer order, each once. */
export function citedOrdsOf(blocks: readonly AnswerBlock[], sources: readonly WorkspaceSource[]): readonly number[] {
  const ords: number[] = [];
  for (const token of labelTokensOf(blocks)) {
    const ord = citationFor(token, sources)?.ord;
    if (ord !== undefined && !ords.includes(ord)) ords.push(ord);
  }
  return ords;
}

/** The Sources tab's order: the cited rows first, in cited order, then the rest by ord. */
export function sourcesForPanel(
  sources: readonly WorkspaceSource[],
  citedOrds: readonly number[],
): readonly WorkspaceSource[] {
  const sorted = byOrd(sources);
  const cited = citedOrds.flatMap((ord) => sorted.find((source) => source.ord === ord) ?? []);
  return [...cited, ...sorted.filter((source) => !citedOrds.includes(source.ord))];
}

/* ---------------------------------------------------------------------------
 * What a row opens, and where it sits (pure)
 * ------------------------------------------------------------------------ */

export type SourceTarget =
  | { kind: 'file'; fileId: number }
  | { kind: 'upload'; documentId: number }
  | { kind: 'memory'; documentId: number }
  | { kind: 'planner' };

/**
 * What Open does for a row: a course file through `FileOpenAction`, an upload
 * through a short signed link, a remembered item in the Memory tab, the feed
 * at `/planner`. Null for a row with no id to open.
 */
export function sourceTarget(source: WorkspaceSource): SourceTarget | null {
  switch (source.kind) {
    case 'material':
      return source.file_id === null ? null : { kind: 'file', fileId: source.file_id };
    case 'upload':
      return source.document_id === null ? null : { kind: 'upload', documentId: source.document_id };
    case 'memory':
      return source.document_id === null ? null : { kind: 'memory', documentId: source.document_id };
    case 'feed':
      return { kind: 'planner' };
  }
}

/** "page 7", "slide 3", "sheet 2": where the passage sits, or null when the row does not say. */
export function sourceLocationLine(source: WorkspaceSource): string | null {
  return source.unit_kind === null || source.unit_no === null
    ? null
    : unitLocationLine(source.unit_kind, source.unit_no);
}
