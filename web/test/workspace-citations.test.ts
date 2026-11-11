/**
 * Source labels (Phase 24b, brief 111, task 5).
 *
 * A label becomes a numbered chip only when the request's `workspace_sources`
 * holds its row: `[M<n>]` by `text_id`, `[U<n>]` by an upload's `doc_text_id`,
 * `[R<n>]` by a memory row's `document_id`, `[P]` by the feed row. A label with
 * no row stays text. The chip's number is the row's `ord`.
 */

import { describe, expect, it } from 'vitest';
import { parseAnswer } from '@/lib/answer-format';
import type { WorkspaceSource } from '@/lib/queries.workspace-sources';
import {
  LABEL_TOKEN,
  citationFor,
  citedOrdsOf,
  findLabelTokens,
  parseLabel,
  resolveLabel,
  sourceLocationLine,
  sourceTarget,
  sourcesForPanel,
} from '@/lib/workspace-citations';

function source(overrides: Partial<WorkspaceSource>): WorkspaceSource {
  return {
    request_id: 4812,
    ord: 1,
    kind: 'material',
    origin: 'auto',
    file_id: null,
    text_id: null,
    document_id: null,
    doc_text_id: null,
    course_id: null,
    title: null,
    unit_kind: null,
    unit_no: null,
    ...overrides,
  };
}

/** The fixture's rows as the table stores them: `turn-put.json`, numbered by ord. */
const SOURCES: WorkspaceSource[] = [
  source({ ord: 1, kind: 'material', file_id: 412, text_id: 9001, course_id: 'BIO.110', unit_kind: 'slide', unit_no: 7 }),
  source({ ord: 2, kind: 'upload', document_id: 17, doc_text_id: 88, unit_kind: 'page', unit_no: 2 }),
  source({ ord: 3, kind: 'memory', document_id: 21, doc_text_id: 93, unit_kind: 'doc', unit_no: 1 }),
  source({ ord: 4, kind: 'feed', title: 'Planner and grades' }),
  source({ ord: 5, kind: 'material', origin: 'attached', file_id: 412 }),
  source({ ord: 6, kind: 'upload', origin: 'attached', document_id: 17 }),
  source({ ord: 7, kind: 'material', origin: 'tool', text_id: 9003 }),
];

describe('the token', () => {
  it('is one whole label, and nothing else', () => {
    for (const token of ['[M12]', '[U3]', '[R7]', '[P]', '[M9007199254740991]']) expect(token).toMatch(LABEL_TOKEN);
    for (const token of ['[M0]', '[M01]', '[P1]', '[X1]', 'M12', '[M12] ', '[m12]']) {
      expect(token).not.toMatch(LABEL_TOKEN);
    }
  });

  it('finds every token with its offsets, left to right', () => {
    expect(findLabelTokens('a [M12] b [P][U3]')).toEqual([
      { start: 2, end: 7, token: '[M12]' },
      { start: 10, end: 13, token: '[P]' },
      { start: 13, end: 17, token: '[U3]' },
    ]);
    expect(findLabelTokens('no label here')).toEqual([]);
    expect(findLabelTokens('[brackets] only [M0]')).toEqual([]);
  });

  it('finds the same tokens on a second call: the scan keeps no state', () => {
    const text = '[M1] and [M2]';
    expect(findLabelTokens(text)).toEqual(findLabelTokens(text));
  });
});

describe('parseLabel', () => {
  it('reads the four forms', () => {
    expect(parseLabel('[M12]')).toEqual({ kind: 'material', textId: 12 });
    expect(parseLabel('[U3]')).toEqual({ kind: 'upload', docTextId: 3 });
    expect(parseLabel('[R7]')).toEqual({ kind: 'memory', documentId: 7 });
    expect(parseLabel('[P]')).toEqual({ kind: 'feed' });
  });

  it('is null for anything else, and for an id past 2^53', () => {
    expect(parseLabel('[M9999999999999999]')).toBeNull();
    expect(parseLabel('M12')).toBeNull();
    expect(parseLabel('[Q1]')).toBeNull();
  });
});

describe('resolveLabel and citationFor: a chip only when the row is there', () => {
  it('resolves each form by its own column', () => {
    expect(resolveLabel({ kind: 'material', textId: 9001 }, SOURCES)?.ord).toBe(1);
    expect(resolveLabel({ kind: 'upload', docTextId: 88 }, SOURCES)?.ord).toBe(2);
    expect(resolveLabel({ kind: 'memory', documentId: 21 }, SOURCES)?.ord).toBe(3);
    expect(resolveLabel({ kind: 'feed' }, SOURCES)?.ord).toBe(4);
    expect(resolveLabel({ kind: 'material', textId: 9003 }, SOURCES)?.ord).toBe(7);
  });

  it('never resolves a label to an attached row (it has no unit id), nor across kinds', () => {
    expect(resolveLabel({ kind: 'upload', docTextId: 17 }, SOURCES)).toBeNull();
    expect(resolveLabel({ kind: 'memory', documentId: 17 }, SOURCES)).toBeNull();
    expect(resolveLabel({ kind: 'material', textId: 88 }, SOURCES)).toBeNull();
  });

  it('takes the first match by ord, whatever the order given', () => {
    const twice = [source({ ord: 9, kind: 'feed' }), source({ ord: 4, kind: 'feed' })];
    expect(resolveLabel({ kind: 'feed' }, twice)?.ord).toBe(4);
  });

  it('keeps a label with no source row as text: citationFor is null', () => {
    expect(citationFor('[M5555]', SOURCES)).toBeNull();
    expect(citationFor('[P]', [])).toBeNull();
    expect(citationFor('not a token', SOURCES)).toBeNull();
  });

  it('numbers a chip by the row`s ord', () => {
    expect(citationFor('[U88]', SOURCES)).toEqual({ token: '[U88]', source: SOURCES[1], ord: 2 });
  });
});

describe('citedOrdsOf and sourcesForPanel', () => {
  it('lists the cited ords in answer order, each once, leaving out labels with no row and labels in code', () => {
    const blocks = parseAnswer(
      '## Notes [P]\n\nFirst [M9001], then [U88] and again [M9001].\n\n- a [M5555]\n- b [R21]\n\n' +
        '| x |\n|---|\n| [U88] |\n\n> [M9001]\n\nIn code: `[M9003]`\n\n```\n[M9003]\n```',
    );
    // [M9003] has a row (ord 7) but appears only in code, so it is no chip and is not cited.
    expect(citedOrdsOf(blocks, SOURCES)).toEqual([4, 1, 2, 3]);
    expect(citedOrdsOf(blocks, [])).toEqual([]);
  });

  it('puts the cited rows first, in cited order, then the rest by ord', () => {
    const shuffled = [...SOURCES].reverse();
    expect(sourcesForPanel(shuffled, [3, 1]).map((row) => row.ord)).toEqual([3, 1, 2, 4, 5, 6, 7]);
    expect(sourcesForPanel(SOURCES, [99]).map((row) => row.ord)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(sourcesForPanel([], [1])).toEqual([]);
  });
});

describe('what a row opens, and where it sits', () => {
  it('opens a course file, an upload, the Memory tab or the planner', () => {
    expect(sourceTarget(SOURCES[0])).toEqual({ kind: 'file', fileId: 412 });
    expect(sourceTarget(SOURCES[1])).toEqual({ kind: 'upload', documentId: 17 });
    expect(sourceTarget(SOURCES[2])).toEqual({ kind: 'memory', documentId: 21 });
    expect(sourceTarget(SOURCES[3])).toEqual({ kind: 'planner' });
    expect(sourceTarget(SOURCES[5])).toEqual({ kind: 'upload', documentId: 17 });
  });

  it('is null for a row with no id to open', () => {
    expect(sourceTarget(SOURCES[6])).toBeNull();
    expect(sourceTarget(source({ kind: 'upload' }))).toBeNull();
    expect(sourceTarget(source({ kind: 'memory' }))).toBeNull();
  });

  it('names the page, slide or sheet, or nothing', () => {
    expect(sourceLocationLine(SOURCES[0])).toBe('slide 7');
    expect(sourceLocationLine(SOURCES[1])).toBe('page 2');
    expect(sourceLocationLine(SOURCES[2])).toBe('part 1');
    expect(sourceLocationLine(SOURCES[4])).toBeNull();
    expect(sourceLocationLine(source({ unit_kind: 'slide' }))).toBeNull();
  });
});
