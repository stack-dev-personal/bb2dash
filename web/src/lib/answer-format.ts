/**
 * bb2dash — an answer's text as blocks (Phase 24b, brief 111, task 4).
 *
 * The Workspace formats an answer with no new dependency: this pure parser
 * turns text into blocks, and `AnswerBody.tsx` (W-88's) turns blocks into
 * elements. It reads paragraphs, three heading levels, lists (nested when
 * indented), pipe tables, fenced code, quotes, bold, italic and inline code.
 *
 * WHAT IS NEVER A FORM. A link form, an image form, an autolink and raw HTML
 * are not read: their characters are text. Nothing here yields an element, a
 * URL or an attribute; the two unions below are all that comes out.
 *
 * NEVER THROWS, AND STABLE WHILE STREAMING. Every string gives blocks. The
 * parse is a left-to-right scan whose blocks depend only on the lines up to
 * their end, so a flush that appends text changes only the last block. An
 * unclosed fence, table or emphasis at the end is text: a fence that never
 * closes makes one paragraph of its lines, a header line with no delimiter row
 * stays in its paragraph, and an emphasis marker with no closer is a character.
 * Nesting is bounded (`MAX_NESTING`), so no input can exhaust the stack.
 *
 * LABELS. The tokens `findLabelTokens` finds (`[M<n>]`, `[U<n>]`, `[R<n>]`,
 * `[P]`) come out whole as `label` inlines, except inside code, where they are
 * text. A soft line break inside a paragraph is kept as `\n` in its text.
 */

import { findLabelTokens } from './workspace-citations';

export type AnswerInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: readonly AnswerInline[] }
  | { type: 'em'; children: readonly AnswerInline[] }
  | { type: 'code'; text: string }
  | { type: 'label'; token: string };

export type AnswerBlock =
  | { type: 'paragraph'; children: readonly AnswerInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: readonly AnswerInline[] }
  | { type: 'list'; ordered: boolean; items: ReadonlyArray<readonly AnswerBlock[]> }
  | {
      type: 'table';
      header: ReadonlyArray<readonly AnswerInline[]>;
      rows: ReadonlyArray<ReadonlyArray<readonly AnswerInline[]>>;
    }
  | { type: 'code'; language: string | null; text: string }
  | { type: 'quote'; children: readonly AnswerBlock[] };

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------ */

/** How deep quotes and lists nest; deeper lines are read as paragraphs. */
const MAX_NESTING = 8;
const HEADING_LEVEL_MAX = 3;
const TAB_WIDTH = 4;
/** A block marker may sit at most this many columns in (CommonMark's rule). */
const MARKER_INDENT_MAX = 3;
/** Past this many spaces after a list marker, the content starts one space in. */
const MARKER_GAP_MAX = 4;
const ORDERED_FIRST = 1;

const LINE_BREAK = /\r\n|\r|\n/;
const BLANK = /^[ \t]*$/;
/**
 * A fence opener: three or more backticks or tildes, then any info string. Any
 * such line opens a fence, so a line that opened one still does once more
 * characters arrive; the language is the info string's first word when it is
 * a language name (`LANGUAGE`), else null.
 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const LANGUAGE = /^[A-Za-z0-9_+.#-]{1,32}$/;
/** A heading needs the space after its hashes: "#" alone may still become "#tag". */
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
/**
 * A line that may still become a list marker as characters arrive ("-", "1",
 * "12."). After a blank line inside a list it stays in the list, so the list
 * does not end and then take the line back once the marker is complete.
 */
const MARKER_PREFIX = /^ {0,3}(?:[-*+]|\d{1,9}[.)]?)$/;
const HEADING_CLOSE = /(?:^|[ \t]+)#+$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const LIST_ITEM = /^([-*+]|(\d{1,9})[.)])([ \t]+)(.*)$/;
const TABLE_DELIMITER_CELL = /^[ \t]*:?-+:?[ \t]*$/;
const UNESCAPED_PIPE = /(?:^|[^\\])\|/;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const WHITESPACE = /\s/;
/** The characters the inline scan stops at; everything between two of them is text. */
const INLINE_SPECIAL = /[\\`*_]/;

/* ---------------------------------------------------------------------------
 * Lines
 * ------------------------------------------------------------------------ */

/** The column a line's text starts at, a tab moving to the next multiple of four. */
function indentOf(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH - (width % TAB_WIDTH);
    else break;
  }
  return width;
}

/** The line with up to `columns` columns of indentation taken off. */
function stripIndent(line: string, columns: number): string {
  let width = 0;
  let index = 0;
  while (index < line.length && width < columns) {
    const ch = line[index];
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH - (width % TAB_WIDTH);
    else break;
    index += 1;
  }
  return line.slice(index);
}

interface ListMarker {
  ordered: boolean;
  start: number | null;
  /** The marker's own column, and the column its content starts at. */
  indent: number;
  contentIndent: number;
  content: string;
}

function listMarkerOf(line: string): ListMarker | null {
  const indent = indentOf(line);
  if (indent > MARKER_INDENT_MAX) return null;
  const match = LIST_ITEM.exec(stripIndent(line, indent));
  if (match === null) return null;
  const [, marker, digits, gap, content] = match;
  const gapWidth = gap.length > MARKER_GAP_MAX ? 1 : gap.length;
  return {
    ordered: digits !== undefined,
    start: digits === undefined ? null : Number(digits),
    indent,
    contentIndent: indent + marker.length + gapWidth,
    content,
  };
}

/** A bullet always may start a list inside a paragraph; an ordered one only from 1; neither empty. */
function interruptsParagraph(marker: ListMarker): boolean {
  return marker.content.trim() !== '' && (!marker.ordered || marker.start === ORDERED_FIRST);
}

/** A row's cells: the outer pipes dropped, split on each pipe that is not escaped. */
function rowCells(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    if (ch === '\\' && body[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The column count of a delimiter row (`|---|:-:|`), or null when the line is not one. */
function delimiterWidth(line: string | undefined): number | null {
  if (line === undefined || !UNESCAPED_PIPE.test(line)) return null;
  const cells = rowCells(line);
  return cells.every((cell) => TABLE_DELIMITER_CELL.test(cell)) ? cells.length : null;
}

/**
 * A header line followed by a delimiter row of the same width starts a table.
 * It is read only where a block starts, never inside a paragraph: a delimiter
 * row can stop being one as characters arrive, and the paragraph above it
 * would then have ended and come back.
 */
function startsTable(lines: readonly string[], at: number): boolean {
  const header = lines[at];
  if (!UNESCAPED_PIPE.test(header)) return false;
  const width = delimiterWidth(lines[at + 1]);
  return width !== null && rowCells(header).length === width;
}

/* ---------------------------------------------------------------------------
 * Blocks
 * ------------------------------------------------------------------------ */

interface Parsed {
  block: AnswerBlock | null;
  next: number;
}

function parseBlocks(lines: readonly string[], depth: number): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let at = 0;
  while (at < lines.length) {
    const parsed = parseBlockAt(lines, at, depth);
    if (parsed.block !== null) blocks.push(parsed.block);
    at = parsed.next;
  }
  return blocks;
}

function parseBlockAt(lines: readonly string[], at: number, depth: number): Parsed {
  const line = lines[at];
  if (BLANK.test(line) || THEMATIC_BREAK.test(line)) return { block: null, next: at + 1 };
  if (FENCE_OPEN.test(line)) return parseFence(lines, at);
  const heading = HEADING.exec(line);
  if (heading !== null) return { block: headingBlock(heading), next: at + 1 };
  const nests = depth < MAX_NESTING;
  if (nests && QUOTE.test(line)) return parseQuote(lines, at, depth);
  const marker = nests ? listMarkerOf(line) : null;
  if (marker !== null) return parseList(lines, at, marker, depth);
  if (startsTable(lines, at)) return parseTable(lines, at);
  return parseParagraph(lines, at, depth);
}

function headingBlock(match: RegExpExecArray): AnswerBlock {
  const level = Math.min(match[1].length, HEADING_LEVEL_MAX) as 1 | 2 | 3;
  const content = match[2].replace(HEADING_CLOSE, '');
  return { type: 'heading', level, children: parseInlines(content) };
}

function parseFence(lines: readonly string[], at: number): Parsed {
  const opener = FENCE_OPEN.exec(lines[at]) as RegExpExecArray;
  const [, fence, info] = opener;
  const word = info.trim().split(/[ \t]+/)[0];
  const language = LANGUAGE.test(word) ? word : '';
  const indent = indentOf(lines[at]);
  const closer = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
  for (let end = at + 1; end < lines.length; end += 1) {
    if (!closer.test(lines[end])) continue;
    const body = lines.slice(at + 1, end).map((line) => stripIndent(line, indent));
    const block: AnswerBlock = { type: 'code', language: language === '' ? null : language, text: body.join('\n') };
    return { block, next: end + 1 };
  }
  // Never closed: the fence and every line after it are one paragraph of text.
  const rest = lines.slice(at).join('\n').trimEnd();
  return { block: { type: 'paragraph', children: [{ type: 'text', text: rest }] }, next: lines.length };
}

function parseQuote(lines: readonly string[], at: number, depth: number): Parsed {
  const inner: string[] = [];
  let end = at;
  while (end < lines.length && QUOTE.test(lines[end])) {
    inner.push(lines[end].replace(QUOTE, ''));
    end += 1;
  }
  return { block: { type: 'quote', children: parseBlocks(inner, depth + 1) }, next: end };
}

function parseList(lines: readonly string[], at: number, first: ListMarker, depth: number): Parsed {
  const items: string[][] = [];
  let current: string[] = [first.content];
  let marker = first;
  let end = at + 1;
  let lastBlank = false;
  while (end < lines.length) {
    const line = lines[end];
    if (BLANK.test(line)) {
      current.push('');
      lastBlank = true;
      end += 1;
      continue;
    }
    const next = listMarkerOf(line);
    if (next !== null && next.indent <= first.indent) {
      if (next.ordered !== first.ordered) break;
      items.push(current);
      current = [next.content];
      marker = next;
    } else if (indentOf(line) > marker.indent) {
      current.push(stripIndent(line, marker.contentIndent));
    } else if ((!lastBlank && !startsOwnBlock(line)) || MARKER_PREFIX.test(line)) {
      current.push(line.trimStart()); // a lazy continuation of the item's text
    } else {
      break;
    }
    lastBlank = false;
    end += 1;
  }
  items.push(current);
  const parsed = items.map((item) => parseBlocks(item, depth + 1));
  return { block: { type: 'list', ordered: first.ordered, items: parsed }, next: end };
}

/** A line that starts a block of its own, so it is never a lazy continuation or a table row. */
function startsOwnBlock(line: string): boolean {
  return THEMATIC_BREAK.test(line) || QUOTE.test(line) || FENCE_OPEN.test(line) || HEADING.test(line);
}

/**
 * Rows run to a blank line or a line that starts its own block. A line with no
 * pipe is a row of one cell (GFM's rule), so a row still being written stays a
 * row as its pipes arrive.
 */
function parseTable(lines: readonly string[], at: number): Parsed {
  const header = rowCells(lines[at]);
  const rows: string[][] = [];
  let end = at + 2;
  while (end < lines.length && !BLANK.test(lines[end]) && !startsOwnBlock(lines[end])) {
    const cells = rowCells(lines[end]);
    const padding = Array<string>(Math.max(0, header.length - cells.length)).fill('');
    rows.push([...cells, ...padding]);
    end += 1;
  }
  return {
    block: {
      type: 'table',
      header: header.map(parseInlines),
      rows: rows.map((row) => row.map(parseInlines)),
    },
    next: end,
  };
}

/** Lines up to a blank one, or up to a line that starts a block of its own. */
function parseParagraph(lines: readonly string[], at: number, depth: number): Parsed {
  const taken: string[] = [lines[at].trim()];
  let end = at + 1;
  while (end < lines.length && !endsParagraph(lines, end, depth)) {
    taken.push(lines[end].trim());
    end += 1;
  }
  return { block: { type: 'paragraph', children: parseInlines(taken.join('\n')) }, next: end };
}

function endsParagraph(lines: readonly string[], at: number, depth: number): boolean {
  const line = lines[at];
  if (BLANK.test(line) || THEMATIC_BREAK.test(line) || FENCE_OPEN.test(line) || HEADING.test(line)) return true;
  if (depth >= MAX_NESTING) return false;
  if (QUOTE.test(line)) return true;
  const marker = listMarkerOf(line);
  return marker !== null && interruptsParagraph(marker);
}

/* ---------------------------------------------------------------------------
 * Inlines
 * ------------------------------------------------------------------------ */

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'delim'; key: string; size: 1 | 2; raw: string; opens: boolean; closes: boolean };

/** The length of the run of one character that starts at `at`. */
function runLength(source: string, at: number): number {
  let end = at + 1;
  while (source[end] === source[at]) end += 1;
  return end - at;
}

/** Where each run of backticks starts, by its length, so a closer is found without a rescan. */
function backtickRuns(source: string): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  let index = source.indexOf('`');
  while (index !== -1) {
    const run = runLength(source, index);
    const list = runs.get(run);
    if (list === undefined) runs.set(run, [index]);
    else list.push(index);
    index = source.indexOf('`', index + run);
  }
  return runs;
}

/** The first value in a sorted list greater than `after`, or -1. */
function firstAfter(sorted: readonly number[] | undefined, after: number): number {
  if (sorted === undefined) return -1;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] > after) high = middle;
    else low = middle + 1;
  }
  return low < sorted.length ? sorted[low] : -1;
}

/** A code span's text: line breaks as spaces, and one space each side dropped when both are there. */
function codeSpanText(raw: string): string {
  const flat = raw.replace(/\n/g, ' ');
  const padded = flat.length > 1 && flat.startsWith(' ') && flat.endsWith(' ') && flat.trim() !== '';
  return padded ? flat.slice(1, -1) : flat;
}

/** A run of one or two `*` or `_` as a delimiter, or null when it can neither open nor close. */
function delimiterToken(source: string, at: number, run: 1 | 2): Token | null {
  const before = source[at - 1] ?? ' ';
  const after = source[at + run] ?? ' ';
  const word = source[at] === '_';
  const opens = !WHITESPACE.test(after) && !(word && WORD_CHARACTER.test(before));
  const closes = !WHITESPACE.test(before) && !(word && WORD_CHARACTER.test(after));
  const raw = source.slice(at, at + run);
  return opens || closes ? { kind: 'delim', key: raw, size: run, raw, opens, closes } : null;
}

/**
 * The text as tokens: text runs, code spans and emphasis delimiters. The scan
 * jumps from one special character to the next (Q-4: it runs on every flush).
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const runs = backtickRuns(source);
  const special = new RegExp(INLINE_SPECIAL.source, 'g');
  let buffer = '';
  const flush = () => {
    if (buffer !== '') tokens.push({ kind: 'text', text: buffer });
    buffer = '';
  };
  let index = 0;
  while (index < source.length) {
    special.lastIndex = index;
    const found = special.exec(source);
    const at = found === null ? source.length : found.index;
    buffer += source.slice(index, at);
    index = at;
    if (found === null) break;
    const ch = source[index];
    if (ch === '\\') {
      const escaped = source[index + 1];
      const escapes = escaped !== undefined && ASCII_PUNCTUATION.test(escaped);
      buffer += escapes ? escaped : ch;
      index += escapes ? 2 : 1;
      continue;
    }
    const run = runLength(source, index);
    const close = ch === '`' ? firstAfter(runs.get(run), index + run - 1) : -1;
    const delim = ch !== '`' && run <= 2 ? delimiterToken(source, index, run as 1 | 2) : null;
    if (close !== -1) {
      flush();
      tokens.push({ kind: 'code', text: codeSpanText(source.slice(index + run, close)) });
      index = close + run;
      continue;
    }
    if (delim === null) {
      buffer += source.slice(index, index + run);
    } else {
      flush();
      tokens.push(delim);
    }
    index += run;
  }
  flush();
  return tokens;
}

/** Match each opener with the first closer of its kind inside the range; the rest is text. */
function buildInlines(
  tokens: readonly Token[],
  from: number,
  to: number,
  closers: ReadonlyMap<string, readonly number[]>,
): AnswerInline[] {
  const out: AnswerInline[] = [];
  let index = from;
  while (index < to) {
    const token = tokens[index];
    if (token.kind === 'delim') {
      const close = token.opens ? firstAfter(closers.get(token.key), index + 1) : -1;
      if (close !== -1 && close < to) {
        const children = buildInlines(tokens, index + 1, close, closers);
        out.push(token.size === 2 ? { type: 'strong', children } : { type: 'em', children });
        index = close + 1;
        continue;
      }
      out.push({ type: 'text', text: token.raw });
    } else if (token.kind === 'code') {
      out.push({ type: 'code', text: token.text });
    } else {
      out.push({ type: 'text', text: token.text });
    }
    index += 1;
  }
  return withLabels(out);
}

/** Adjacent text joined, then each text split around the label tokens it holds. */
function withLabels(inlines: readonly AnswerInline[]): AnswerInline[] {
  const merged: AnswerInline[] = [];
  for (const inline of inlines) {
    const last = merged[merged.length - 1];
    if (inline.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', text: last.text + inline.text };
    } else {
      merged.push(inline);
    }
  }
  return merged.flatMap((inline) => (inline.type === 'text' ? labelInlines(inline.text) : [inline]));
}

/** A text as text and label inlines, nothing else read. */
function labelInlines(source: string): AnswerInline[] {
  const out: AnswerInline[] = [];
  let at = 0;
  for (const { start, end, token } of findLabelTokens(source)) {
    if (start > at) out.push({ type: 'text', text: source.slice(at, start) });
    out.push({ type: 'label', token });
    at = end;
  }
  if (at < source.length) out.push({ type: 'text', text: source.slice(at) });
  return out;
}

function parseInlines(source: string): AnswerInline[] {
  const tokens = tokenize(source);
  const closers = new Map<string, number[]>();
  tokens.forEach((token, index) => {
    if (token.kind !== 'delim' || !token.closes) return;
    const list = closers.get(token.key);
    if (list === undefined) closers.set(token.key, [index]);
    else list.push(index);
  });
  return buildInlines(tokens, 0, tokens.length, closers);
}

/* ---------------------------------------------------------------------------
 * The exports
 * ------------------------------------------------------------------------ */

/** An answer's text as blocks. Never throws; pure and deterministic over the text. */
export function parseAnswer(text: string): readonly AnswerBlock[] {
  return parseBlocks(text.split(LINE_BREAK), 0);
}

/**
 * Format `plain`, and a stored answer with no options row: paragraphs split on
 * blank lines, inlines are text and label tokens only, no markup read.
 */
export function plainBlocks(text: string): readonly AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let lines: string[] = [];
  const close = () => {
    const body = lines.join('\n').trim();
    if (body !== '') blocks.push({ type: 'paragraph', children: labelInlines(body) });
    lines = [];
  };
  for (const line of text.split(LINE_BREAK)) {
    if (BLANK.test(line)) close();
    else lines.push(line);
  }
  close();
  return blocks;
}

/** The plain text of a run of inlines; a label reads as its token. */
export function inlineText(inlines: readonly AnswerInline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.type) {
        case 'text':
        case 'code':
          return inline.text;
        case 'label':
          return inline.token;
        case 'strong':
        case 'em':
          return inlineText(inline.children);
      }
    })
    .join('');
}

const ROW_CELL_SEPARATOR = ' | ';

/** The plain text of an answer (`data-answer-text`): blocks apart by a blank line, items and rows by a line break. */
export function blocksText(blocks: readonly AnswerBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
        case 'heading':
          return inlineText(block.children);
        case 'list':
          return block.items.map((item) => blocksText(item)).join('\n');
        case 'table':
          return [block.header, ...block.rows]
            .map((row) => row.map(inlineText).join(ROW_CELL_SEPARATOR))
            .join('\n');
        case 'code':
          return block.text;
        case 'quote':
          return blocksText(block.children);
      }
    })
    .join('\n\n');
}
