/**
 * The answer body (Phase 24b, task 9; brief 111, "Formatted answers, with no
 * new dependency", "Sources").
 *
 * `AnswerBody.tsx` turns `parseAnswer`'s blocks into React elements whose
 * leaves are text nodes. It is the only guard between a model's text and the
 * page (no Content-Security-Policy backs it up), so the property case here
 * holds it for generated strings: no `img`, `a`, `iframe`, `script` or `style`
 * element, and no `href` or `src` attribute, whatever the text. A link form and
 * an image form show as their text, raw HTML shows as text, and a label becomes
 * a chip (a button, never a link) only when the request holds its source row.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerBody } from '@/components/workspace/AnswerBody';
import { parseAnswer, plainBlocks } from '@/lib/answer-format';
import { normalizeSource, type WorkspaceSource } from '@/lib/queries.workspace-sources';
import { sourceChipLabel } from '@/lib/workspace-labels';

afterEach(() => {
  cleanup();
});

function source(ord: number, fields: Record<string, unknown>): WorkspaceSource {
  const row = normalizeSource({
    request_id: 42,
    ord,
    kind: 'material',
    origin: 'auto',
    file_id: 7,
    text_id: null,
    document_id: null,
    doc_text_id: null,
    course_id: 'IST.323',
    title: 'Week 5 slides.pptx',
    unit_kind: 'slide',
    unit_no: 3,
    ...fields,
  });
  if (row === null) throw new Error('bad source fixture');
  return row;
}

const SOURCES: readonly WorkspaceSource[] = [
  source(1, { text_id: 12 }),
  source(2, { kind: 'upload', file_id: null, document_id: 5, doc_text_id: 9 }),
  source(3, { kind: 'feed', file_id: null, title: 'Planner' }),
];

function mount(text: string, onCite = vi.fn()) {
  const view = render(<AnswerBody blocks={parseAnswer(text)} sources={SOURCES} onCite={onCite} />);
  const root = view.container.querySelector('[data-answer-text]');
  if (!(root instanceof HTMLElement)) throw new Error('no answer body root');
  return { ...view, root, onCite };
}

const FORBIDDEN_ELEMENTS = 'img, a, iframe, script, style, object, embed, link, form, input';
const FORBIDDEN_ATTRIBUTES = '[href], [src], [srcset], [style], [onerror], [onclick]';

/** Fragments that a model, or a page it quotes, could write. */
const HOSTILE = [
  '![a picture](https://example.com/x.png)',
  '[a link](javascript:alert(1))',
  '[site](https://example.com)',
  '<img src=x onerror=alert(1)>',
  '<a href="https://example.com">here</a>',
  '<script>alert(1)</script>',
  '<iframe src="https://example.com"></iframe>',
  '<style>body{display:none}</style>',
  '<https://example.com>',
  '**bold** and *em*',
  '`code [M12]`',
  '[M12]',
  '[U9]',
  '[P]',
  '[R4]',
  '# Heading',
  '- item',
  '1. first',
  '> quote',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  '```js\nconst x = "<b>";\n```',
  '\n',
  '\n\n',
  '    indented',
];

describe('the answer body holds no element a page could be reached or styled through', () => {
  it('renders no img, a, iframe, script or style, and no href or src, for any generated text', () => {
    const piece = fc.oneof(fc.constantFrom(...HOSTILE), fc.string({ maxLength: 40 }));
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 12 }), (pieces) => {
        const text = pieces.join('');
        const { container, unmount } = render(
          <AnswerBody blocks={parseAnswer(text)} sources={SOURCES} onCite={() => undefined} />,
        );
        try {
          expect(container.querySelectorAll(FORBIDDEN_ELEMENTS)).toHaveLength(0);
          expect(container.querySelectorAll(FORBIDDEN_ATTRIBUTES)).toHaveLength(0);
        } finally {
          unmount();
        }
      }),
      { numRuns: 150 },
    );
  });

  it('shows a link form and an image form as their text', () => {
    const { root } = mount('See [the syllabus](https://example.com/s) and ![chart](https://example.com/c.png).');
    expect(root).toHaveTextContent('See [the syllabus](https://example.com/s) and ![chart](https://example.com/c.png).');
    expect(root.querySelector('a, img')).toBeNull();
  });

  it('shows raw HTML as the characters it is typed with', () => {
    const { root } = mount('<script>alert(1)</script> and <b>bold</b>');
    expect(root).toHaveTextContent('<script>alert(1)</script> and <b>bold</b>');
    expect(root.querySelector('script, b')).toBeNull();
  });
});

describe('the answer body formats what the parser read', () => {
  it('sets headings one level under the page`s own h1', () => {
    const { root } = mount('# One\n\n## Two\n\n### Three\n\n#### Four');
    expect([...root.querySelectorAll('h2, h3, h4')].map((h) => `${h.tagName}:${h.textContent}`)).toEqual([
      'H2:One',
      'H3:Two',
      'H4:Three',
      'H4:Four',
    ]);
    expect(root.querySelector('h1')).toBeNull();
  });

  it('sets lists, nested lists included', () => {
    const { root } = mount('- one\n- two\n  - two a\n\n1. first\n2. second');
    const lists = root.querySelectorAll(':scope > ul, :scope > ol');
    expect([...lists].map((list) => list.tagName)).toEqual(['UL', 'OL']);
    expect(lists[0].querySelector('ul')).toHaveTextContent('two a');
    expect(within(lists[1] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('sets a table inside a positioned box that scrolls sideways', () => {
    const { root } = mount('| Week | Due |\n|---|---|\n| 5 | Quiz 2 |');
    const table = root.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.parentElement?.hasAttribute('data-table-box')).toBe(true);
    expect([...(table?.querySelectorAll('th') ?? [])].map((cell) => cell.textContent)).toEqual(['Week', 'Due']);
    expect([...(table?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent)).toEqual(['5', 'Quiz 2']);
  });

  it('sets code in pre > code, with its language as a data attribute only', () => {
    const { root } = mount('```python\nprint("<b>")\n```');
    const code = root.querySelector('pre > code');
    expect(code).toHaveTextContent('print("<b>")');
    expect(code).toHaveAttribute('data-language', 'python');
    expect(code?.className ?? '').not.toContain('python');
  });

  it('sets bold, italic, inline code and a quote', () => {
    const { root } = mount('**bold** and *em* and `x`\n\n> quoted');
    expect(root.querySelector('strong')).toHaveTextContent('bold');
    expect(root.querySelector('em')).toHaveTextContent('em');
    expect(root.querySelector('p code')).toHaveTextContent('x');
    expect(root.querySelector('blockquote')).toHaveTextContent('quoted');
  });

  it('shows a plain answer as paragraphs of text: no markup read', () => {
    const { container } = render(<AnswerBody blocks={plainBlocks('# Title\n**bold**')} sources={[]} />);
    const root = container.querySelector('[data-answer-text]');
    expect(root).toHaveTextContent('# Title **bold**');
    expect(root?.querySelector('h2, h3, h4, strong')).toBeNull();
  });
});

describe('a label becomes a chip only when its source row is there', () => {
  it('makes a numbered button of a label with a row, never a link, and says which source it is', () => {
    const { root, onCite } = mount('Quiz 2 is on Friday [M12] and the upload agrees [U9].');
    const chips = within(root).getAllByRole('button');
    expect(chips.map((chip) => chip.getAttribute('data-source-ref'))).toEqual(['1', '2']);
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([sourceChipLabel(1), sourceChipLabel(2)]);
    expect(root.querySelector('a')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: sourceChipLabel(2) }));
    expect(onCite).toHaveBeenCalledWith(2);
  });

  it('leaves a label with no row as its text', () => {
    const { root } = mount('Something else [M99] and [R4].');
    expect(within(root).queryAllByRole('button')).toHaveLength(0);
    expect(root).toHaveTextContent('Something else [M99] and [R4].');
  });

  it('leaves a label inside code as text', () => {
    const { root } = mount('`[M12]`');
    expect(within(root).queryAllByRole('button')).toHaveLength(0);
    expect(root).toHaveTextContent('[M12]');
  });
});
