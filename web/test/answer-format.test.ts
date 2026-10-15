/**
 * The answer parser (Phase 24b, brief 111, task 4; "The data layer's frozen exports").
 *
 * `parseAnswer` turns an answer's text into blocks the page renders with no new
 * dependency. What is asserted is the frozen contract:
 *
 *   * paragraphs, three heading levels, lists (nested when indented), pipe
 *     tables, fenced code, bold, italic, inline code and quotes are read;
 *   * a link form, an image form and raw HTML are not forms: their characters
 *     stay text, and no block or inline type outside the two unions ever comes
 *     out (no element, no URL, no attribute);
 *   * an unclosed fence, table or emphasis at the end is a paragraph of text;
 *   * inline code is verbatim, and a label inside it is text;
 *   * the four label tokens come out whole as `label` inlines;
 *   * it never throws, it is deterministic, and a flush that appends text
 *     leaves the finished blocks before it unchanged;
 *   * `plainBlocks` reads no markup, and `blocksText` keeps every label token.
 *
 * The property cases use `fast-check` over generated strings built from the
 * characters markup is made of.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  blocksText,
  inlineText,
  parseAnswer,
  plainBlocks,
  type AnswerBlock,
  type AnswerInline,
} from '@/lib/answer-format';
import { findLabelTokens, LABEL_TOKEN } from '@/lib/workspace-citations';

const text = (value: string): AnswerInline => ({ type: 'text', text: value });
const paragraph = (...children: AnswerInline[]): AnswerBlock => ({ type: 'paragraph', children });

/* ---------------------------------------------------------------------------
 * The shape checker: every node is one of the union's members, with exactly its keys
 * ------------------------------------------------------------------------ */

const INLINE_KEYS: Readonly<Record<string, readonly string[]>> = {
  text: ['text', 'type'],
  strong: ['children', 'type'],
  em: ['children', 'type'],
  code: ['text', 'type'],
  label: ['token', 'type'],
};

const BLOCK_KEYS: Readonly<Record<string, readonly string[]>> = {
  paragraph: ['children', 'type'],
  heading: ['children', 'level', 'type'],
  list: ['items', 'ordered', 'type'],
  table: ['header', 'rows', 'type'],
  code: ['language', 'text', 'type'],
  quote: ['children', 'type'],
};

function keysOf(node: object): string[] {
  return Object.keys(node).sort();
}

function checkInline(node: AnswerInline, inCode: boolean): void {
  expect(INLINE_KEYS[node.type]).toBeDefined();
  expect(keysOf(node)).toEqual(INLINE_KEYS[node.type]);
  if (node.type === 'label') {
    expect(inCode).toBe(false);
    expect(node.token).toMatch(LABEL_TOKEN);
  }
  if (node.type === 'text' || node.type === 'code') expect(typeof node.text).toBe('string');
  if (node.type === 'strong' || node.type === 'em') {
    node.children.forEach((child) => checkInline(child, inCode));
  }
}

function checkBlock(block: AnswerBlock): void {
  expect(BLOCK_KEYS[block.type]).toBeDefined();
  expect(keysOf(block)).toEqual(BLOCK_KEYS[block.type]);
  switch (block.type) {
    case 'paragraph':
      block.children.forEach((child) => checkInline(child, false));
      return;
    case 'heading':
      expect([1, 2, 3]).toContain(block.level);
      block.children.forEach((child) => checkInline(child, false));
      return;
    case 'list':
      expect(typeof block.ordered).toBe('boolean');
      block.items.forEach((item) => item.forEach(checkBlock));
      return;
    case 'table':
      block.header.forEach((cell) => cell.forEach((child) => checkInline(child, false)));
      block.rows.forEach((row) => row.forEach((cell) => cell.forEach((child) => checkInline(child, false))));
      return;
    case 'code':
      expect(typeof block.text).toBe('string');
      expect(block.language === null || typeof block.language === 'string').toBe(true);
      return;
    case 'quote':
      block.children.forEach(checkBlock);
      return;
  }
}

/** Every label inline in the blocks, in order. */
function labelsOf(blocks: readonly AnswerBlock[]): string[] {
  const out: string[] = [];
  const inline = (node: AnswerInline): void => {
    if (node.type === 'label') out.push(node.token);
    if (node.type === 'strong' || node.type === 'em') node.children.forEach(inline);
  };
  const block = (node: AnswerBlock): void => {
    if (node.type === 'paragraph' || node.type === 'heading') node.children.forEach(inline);
    if (node.type === 'list') node.items.forEach((item) => item.forEach(block));
    if (node.type === 'quote') node.children.forEach(block);
    if (node.type === 'table') {
      node.header.forEach((cell) => cell.forEach(inline));
      node.rows.forEach((row) => row.forEach((cell) => cell.forEach(inline)));
    }
  };
  blocks.forEach(block);
  return out;
}

/* ---------------------------------------------------------------------------
 * Blocks
 * ------------------------------------------------------------------------ */

describe('parseAnswer: the blocks', () => {
  it('gives no block for an empty or blank answer', () => {
    expect(parseAnswer('')).toEqual([]);
    expect(parseAnswer('  \n\t\n')).toEqual([]);
  });

  it('splits paragraphs on a blank line and keeps a line break inside one', () => {
    expect(parseAnswer('one\ntwo\n\nthree')).toEqual([paragraph(text('one\ntwo')), paragraph(text('three'))]);
  });

  it('reads three heading levels; four hashes and more are level 3', () => {
    expect(parseAnswer('# One\n## Two\n### Three\n#### Four\n###### Six ##')).toEqual([
      { type: 'heading', level: 1, children: [text('One')] },
      { type: 'heading', level: 2, children: [text('Two')] },
      { type: 'heading', level: 3, children: [text('Three')] },
      { type: 'heading', level: 3, children: [text('Four')] },
      { type: 'heading', level: 3, children: [text('Six')] },
    ]);
  });

  it('needs a space after the hashes: "#tag" and a lone "#" are text', () => {
    expect(parseAnswer('#tag')).toEqual([paragraph(text('#tag'))]);
    expect(parseAnswer('a\n#')).toEqual([paragraph(text('a\n#'))]);
  });

  it('reads a bullet list and an ordered list', () => {
    expect(parseAnswer('- a\n- b\n\n1. c\n2. d')).toEqual([
      { type: 'list', ordered: false, items: [[paragraph(text('a'))], [paragraph(text('b'))]] },
      { type: 'list', ordered: true, items: [[paragraph(text('c'))], [paragraph(text('d'))]] },
    ]);
  });

  it('nests an indented list inside its item', () => {
    expect(parseAnswer('1. first\n   - inner a\n   - inner b\n2. second')).toEqual([
      {
        type: 'list',
        ordered: true,
        items: [
          [
            paragraph(text('first')),
            { type: 'list', ordered: false, items: [[paragraph(text('inner a'))], [paragraph(text('inner b'))]] },
          ],
          [paragraph(text('second'))],
        ],
      },
    ]);
  });

  it('takes a two-space nested list under an ordered item too', () => {
    const [list] = parseAnswer('1. first\n  - inner\n2. second');
    expect(list).toMatchObject({ type: 'list', ordered: true });
    expect(list.type === 'list' && list.items.length).toBe(2);
  });

  it('starts a new list when the marker kind changes', () => {
    const blocks = parseAnswer('- a\n1. b');
    expect(blocks.map((block) => block.type === 'list' && block.ordered)).toEqual([false, true]);
  });

  it('reads a pipe table with its header and rows, padding a short row', () => {
    expect(parseAnswer('| Week | Topic |\n|---|:--:|\n| 5 | Membranes [M12] |\n| 6 |')).toEqual([
      {
        type: 'table',
        header: [[text('Week')], [text('Topic')]],
        rows: [
          [[text('5')], [text('Membranes '), { type: 'label', token: '[M12]' }]],
          [[text('6')], []],
        ],
      },
    ]);
  });

  it('starts a table only where a block starts, and ends it at a blank line', () => {
    expect(parseAnswer('Intro\n\na | b\n--|--\n1 | 2\n\nAfter').map((block) => block.type)).toEqual([
      'paragraph',
      'table',
      'paragraph',
    ]);
    // Inside a paragraph the two lines stay text: a delimiter row can stop being one as text arrives.
    expect(parseAnswer('Intro\na | b\n--|--')).toEqual([paragraph(text('Intro\na | b\n--|--'))]);
  });

  it('takes a line with no pipe as a one-cell row, and ends the rows at a heading', () => {
    const blocks = parseAnswer('| a | b |\n|---|---|\nplain\n## Next');
    expect(blocks).toEqual([
      { type: 'table', header: [[text('a')], [text('b')]], rows: [[[text('plain')], []]] },
      { type: 'heading', level: 2, children: [text('Next')] },
    ]);
  });

  it('keeps an escaped pipe inside a cell', () => {
    const [table] = parseAnswer('| a \\| b | c |\n|---|---|');
    expect(table).toEqual({ type: 'table', header: [[text('a | b')], [text('c')]], rows: [] });
  });

  it('reads a fenced code block verbatim, with its language', () => {
    expect(parseAnswer('```ts\nconst x = **1**; // [M3]\n\n<b>y</b>\n```')).toEqual([
      { type: 'code', language: 'ts', text: 'const x = **1**; // [M3]\n\n<b>y</b>' },
    ]);
  });

  it('takes the info string`s first word as the language, and null for one that is not a name', () => {
    expect(parseAnswer('```js title="x"\na\n```\n```(see)\nb\n```')).toEqual([
      { type: 'code', language: 'js', text: 'a' },
      { type: 'code', language: null, text: 'b' },
    ]);
  });

  it('reads a tilde fence and a fence with no language', () => {
    expect(parseAnswer('~~~\na\n~~~\n```\nb\n```')).toEqual([
      { type: 'code', language: null, text: 'a' },
      { type: 'code', language: null, text: 'b' },
    ]);
  });

  it('reads a quote, with blocks inside it', () => {
    expect(parseAnswer('> said\n> - one\n\nafter')).toEqual([
      {
        type: 'quote',
        children: [paragraph(text('said')), { type: 'list', ordered: false, items: [[paragraph(text('one'))]] }],
      },
      paragraph(text('after')),
    ]);
  });

  it('drops a thematic break between blocks', () => {
    expect(parseAnswer('a\n\n---\n\nb')).toEqual([paragraph(text('a')), paragraph(text('b'))]);
  });

  it('reads a fence inside a list item', () => {
    const [list] = parseAnswer('- run:\n  ```sh\n  ls\n  ```');
    expect(list).toEqual({
      type: 'list',
      ordered: false,
      items: [[paragraph(text('run:')), { type: 'code', language: 'sh', text: 'ls' }]],
    });
  });
});

/* ---------------------------------------------------------------------------
 * Inlines
 * ------------------------------------------------------------------------ */

describe('parseAnswer: the inlines', () => {
  it('reads bold, italic and inline code', () => {
    expect(parseAnswer('**bold** and *it* and _it2_ and `co*de*`')).toEqual([
      paragraph(
        { type: 'strong', children: [text('bold')] },
        text(' and '),
        { type: 'em', children: [text('it')] },
        text(' and '),
        { type: 'em', children: [text('it2')] },
        text(' and '),
        { type: 'code', text: 'co*de*' },
      ),
    ]);
  });

  it('nests italic inside bold', () => {
    expect(parseAnswer('**a *b* c**')).toEqual([
      paragraph({ type: 'strong', children: [text('a '), { type: 'em', children: [text('b')] }, text(' c')] }),
    ]);
  });

  it('keeps an underscore inside a word as text', () => {
    expect(parseAnswer('snake_case_name')).toEqual([paragraph(text('snake_case_name'))]);
  });

  it('keeps a label inside inline code as text', () => {
    expect(parseAnswer('see `[M12]` and [M12]')).toEqual([
      paragraph(text('see '), { type: 'code', text: '[M12]' }, text(' and '), { type: 'label', token: '[M12]' }),
    ]);
  });

  it('emits each of the four label forms whole', () => {
    const labels = labelsOf(parseAnswer('a [M12], b [U3]; c [R7] and **[P]**'));
    expect(labels).toEqual(['[M12]', '[U3]', '[R7]', '[P]']);
  });

  it('does not take a label lookalike: [M0], [X1], [m1], [M01]', () => {
    expect(labelsOf(parseAnswer('[M0] [X1] [m1] [M01] [P1]'))).toEqual([]);
  });

  it('reads a backslash escape as the character', () => {
    expect(parseAnswer('\\*not em\\*')).toEqual([paragraph(text('*not em*'))]);
  });

  it('strips one space on each side of a code span', () => {
    expect(parseAnswer('`` a`b ``')).toEqual([paragraph({ type: 'code', text: 'a`b' })]);
  });
});

/* ---------------------------------------------------------------------------
 * What is never a form
 * ------------------------------------------------------------------------ */

describe('parseAnswer: links, images and raw HTML are text', () => {
  it('keeps a link form as its characters', () => {
    expect(parseAnswer('[the site](https://example.com)')).toEqual([
      paragraph(text('[the site](https://example.com)')),
    ]);
  });

  it('keeps an image form as its characters', () => {
    expect(parseAnswer('![x](https://example.com/a.png "t")')).toEqual([
      paragraph(text('![x](https://example.com/a.png "t")')),
    ]);
  });

  it('keeps raw HTML and an autolink as text', () => {
    const source = '<img src="x" onerror="alert(1)"> <a href="https://e.com">e</a> <https://e.com>';
    expect(parseAnswer(source)).toEqual([paragraph(text(source))]);
  });
});

/* ---------------------------------------------------------------------------
 * Unclosed forms at the end
 * ------------------------------------------------------------------------ */

describe('parseAnswer: an unclosed form at the end is a paragraph of text', () => {
  it('an unclosed fence: the fence and what follows it are text', () => {
    expect(parseAnswer('Before\n\n```py\nprint(1)\n[M3]')).toEqual([
      paragraph(text('Before')),
      paragraph(text('```py\nprint(1)\n[M3]')),
    ]);
  });

  it('an unclosed emphasis: the markers are text', () => {
    expect(parseAnswer('a **bold that never ends')).toEqual([paragraph(text('a **bold that never ends'))]);
    expect(parseAnswer('an *open')).toEqual([paragraph(text('an *open'))]);
  });

  it('an unclosed table: a header line with no delimiter row yet', () => {
    expect(parseAnswer('| a | b |')).toEqual([paragraph(text('| a | b |'))]);
    expect(parseAnswer('| a | b |\n|--')).toEqual([paragraph(text('| a | b |\n|--'))]);
  });

  it('an unclosed code span: the backticks are text', () => {
    expect(parseAnswer('use `npm')).toEqual([paragraph(text('use `npm'))]);
  });
});

/* ---------------------------------------------------------------------------
 * Properties
 * ------------------------------------------------------------------------ */

/** Strings built from the characters markup is made of, labels and lookalikes among them. */
const markupish = fc
  .array(
    fc.constantFrom(
      'a',
      'b',
      ' ',
      '  ',
      '\n',
      '\n\n',
      '\t',
      '*',
      '**',
      '_',
      '`',
      '```',
      '~~~',
      '#',
      '# ',
      '- ',
      '1. ',
      '> ',
      '|',
      '---',
      ':',
      '\\',
      '[',
      ']',
      '(',
      ')',
      '!',
      '<',
      '>',
      '"',
      '=',
      'src',
      'href',
      'https://e.com',
      '[M12]',
      '[U3]',
      '[R7]',
      '[P]',
      '[M0]',
      'ts',
    ),
    { maxLength: 60 },
  )
  .map((parts) => parts.join(''));

/**
 * The text with each fence line taken out: a line that, past any quote and
 * list markers, starts with three backticks or tildes. Its info string is
 * markup (the language), so a label there is not answer text.
 */
function withoutFenceLines(source: string): string {
  const containers = /^(?:[ \t>]|[-*+][ \t]|\d{1,9}[.)][ \t])*/;
  return source
    .split(/\r\n|\r|\n/)
    .filter((line) => !/^(`{3,}|~{3,})/.test(line.replace(containers, '')))
    .join('\n');
}

const anyText = fc.oneof(markupish, fc.string({ maxLength: 200 }), fc.string({ unit: 'binary', maxLength: 80 }));

describe('parseAnswer: properties over generated strings', () => {
  it('never throws, and every node is one of the unions with exactly its keys', () => {
    fc.assert(
      fc.property(anyText, (source) => {
        const blocks = parseAnswer(source);
        blocks.forEach(checkBlock);
      }),
      { numRuns: 400 },
    );
  });

  it('keeps every label token of the text in blocksText, in code or not (a fence line is markup)', () => {
    fc.assert(
      fc.property(markupish, (source) => {
        const out = blocksText(parseAnswer(source));
        for (const { token } of findLabelTokens(withoutFenceLines(source))) expect(out).toContain(token);
      }),
      { numRuns: 400 },
    );
  });

  it('is deterministic: the same text gives equal blocks', () => {
    fc.assert(
      fc.property(markupish, (source) => {
        expect(parseAnswer(source)).toEqual(parseAnswer(source));
      }),
    );
  });

  it('leaves the finished blocks unchanged when a flush appends text', () => {
    fc.assert(
      fc.property(markupish, markupish, (head, tail) => {
        const before = parseAnswer(head);
        const after = parseAnswer(head + tail);
        const finished = before.slice(0, -1);
        expect(after.slice(0, finished.length)).toEqual(finished);
      }),
      { numRuns: 400 },
    );
  });

  it('never throws on deep nesting', () => {
    expect(() => parseAnswer('>'.repeat(5_000) + ' x')).not.toThrow();
    expect(() => parseAnswer(Array.from({ length: 500 }, (_, i) => `${' '.repeat(i)}- x`).join('\n'))).not.toThrow();
    expect(() => parseAnswer('*'.repeat(3_000) + 'a' + '_'.repeat(3_000))).not.toThrow();
  });
});

/* ---------------------------------------------------------------------------
 * plainBlocks, inlineText, blocksText
 * ------------------------------------------------------------------------ */

describe('plainBlocks: no markup read', () => {
  it('splits paragraphs on blank lines and keeps every character', () => {
    expect(plainBlocks('**a** `b`\n# c\n\n\n- d [M2]')).toEqual([
      paragraph(text('**a** `b`\n# c')),
      paragraph(text('- d '), { type: 'label', token: '[M2]' }),
    ]);
  });

  it('gives no block for an empty answer', () => {
    expect(plainBlocks('')).toEqual([]);
    expect(plainBlocks('\n \n')).toEqual([]);
  });

  it('holds only text and label inlines, for any string', () => {
    fc.assert(
      fc.property(anyText, (source) => {
        for (const block of plainBlocks(source)) {
          expect(block.type).toBe('paragraph');
          if (block.type !== 'paragraph') return;
          for (const child of block.children) expect(['text', 'label']).toContain(child.type);
        }
      }),
    );
  });
});

describe('inlineText and blocksText: the plain text of an answer', () => {
  it('reads every inline kind', () => {
    expect(
      inlineText([
        text('a '),
        { type: 'strong', children: [text('b'), { type: 'em', children: [text('c')] }] },
        { type: 'code', text: ' d' },
        { type: 'label', token: '[P]' },
      ]),
    ).toBe('a bc d[P]');
  });

  it('joins blocks with a blank line, items and rows with a line break', () => {
    const blocks = parseAnswer('# T\n\n- a\n- b\n\n| x | y |\n|-|-|\n| 1 | 2 |\n\n```\nc\n```\n\n> q');
    expect(blocksText(blocks)).toBe('T\n\na\nb\n\nx | y\n1 | 2\n\nc\n\nq');
  });
});
