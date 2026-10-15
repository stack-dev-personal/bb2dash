'use client';

/**
 * The answer body (Phase 24b, task 9; brief 111, "Formatted answers, with no
 * new dependency", "Sources").
 *
 * It turns `parseAnswer`'s blocks (or `plainBlocks`', for a `plain` answer)
 * into React elements whose leaves are text nodes: paragraphs, headings one
 * level under the page's own h1 (h2 to h4), lists with nested lists, a table
 * in a box that scrolls sideways, code in `pre > code` with its language as a
 * data attribute only, strong, em, inline code and a quote.
 *
 * NO IMAGE IS DRAWN AND NO LINK IS MADE. The parser yields no element, URL or
 * attribute, and this file makes no `img`, `a`, `iframe`, `script` or `style`
 * and sets no `href`, `src` or `style`: a link form and an image form are their
 * characters, and raw HTML is text. Nothing here reaches `innerHTML`.
 *
 * A LABEL BECOMES A CHIP only when `citationFor` finds the request's source
 * row: a button, never a link, numbered by the row's `ord`, which opens the
 * panel's Sources tab at that answer (`onCite`). A label with no row is the
 * text it is.
 *
 * The root carries `data-answer-text`. Nothing is kept between renders: while
 * an answer streams the caller parses the live text again on each render
 * (probe Q-4 passed).
 */

import type { ReactNode } from 'react';
import type { AnswerBlock, AnswerInline } from '@/lib/answer-format';
import type { WorkspaceSource } from '@/lib/queries.workspace-sources';
import { citationFor } from '@/lib/workspace-citations';
import { sourceChipLabel } from '@/lib/workspace-labels';
import styles from './AnswerBody.module.css';

/** What every block and inline needs from the body around it. */
interface Context {
  sources: readonly WorkspaceSource[];
  onCite?: (ord: number) => void;
}

/** A label: a chip when its row is there, its token as text otherwise. */
function Label({ token, context }: { token: string; context: Context }) {
  const citation = citationFor(token, context.sources);
  if (citation === null) return <>{token}</>;
  return (
    <button
      type="button"
      className={styles.chip}
      data-source-ref={citation.ord}
      aria-label={sourceChipLabel(citation.ord)}
      onClick={() => context.onCite?.(citation.ord)}
    >
      {citation.ord}
    </button>
  );
}

function inlineNode(inline: AnswerInline, key: number, context: Context): ReactNode {
  switch (inline.type) {
    case 'text':
      return inline.text;
    case 'strong':
      return <strong key={key}>{inlines(inline.children, context)}</strong>;
    case 'em':
      return <em key={key}>{inlines(inline.children, context)}</em>;
    case 'code':
      return (
        <code key={key} className={styles.inlineCode}>
          {inline.text}
        </code>
      );
    case 'label':
      return <Label key={key} token={inline.token} context={context} />;
  }
}

function inlines(children: readonly AnswerInline[], context: Context): ReactNode[] {
  return children.map((inline, index) => inlineNode(inline, index, context));
}

/** h2, h3, h4: the page's own heading is the h1 "Workspace". */
function Heading({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) {
  if (level === 1) return <h2 className={styles.heading}>{children}</h2>;
  if (level === 2) return <h3 className={styles.heading}>{children}</h3>;
  return <h4 className={styles.heading}>{children}</h4>;
}

function List({ block, context }: { block: Extract<AnswerBlock, { type: 'list' }>; context: Context }) {
  const items = block.items.map((item, index) => (
    <li key={index} className={styles.item}>
      {blocks(item, context)}
    </li>
  ));
  return block.ordered ? <ol className={styles.list}>{items}</ol> : <ul className={styles.list}>{items}</ul>;
}

function Table({ block, context }: { block: Extract<AnswerBlock, { type: 'table' }>; context: Context }) {
  return (
    <div className={styles.tableBox} data-table-box>
      <table className={styles.table}>
        <thead>
          <tr>
            {block.header.map((cell, index) => (
              <th key={index}>{inlines(cell, context)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index}>{inlines(cell, context)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function blockNode(block: AnswerBlock, key: number, context: Context): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={key} className={styles.paragraph}>
          {inlines(block.children, context)}
        </p>
      );
    case 'heading':
      return (
        <Heading key={key} level={block.level}>
          {inlines(block.children, context)}
        </Heading>
      );
    case 'list':
      return <List key={key} block={block} context={context} />;
    case 'table':
      return <Table key={key} block={block} context={context} />;
    case 'code':
      return (
        <pre key={key} className={styles.code}>
          <code data-language={block.language ?? undefined}>{block.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote key={key} className={styles.quote}>
          {blocks(block.children, context)}
        </blockquote>
      );
  }
}

function blocks(list: readonly AnswerBlock[], context: Context): ReactNode[] {
  return list.map((block, index) => blockNode(block, index, context));
}

export interface AnswerBodyProps {
  /** The answer as blocks: `answerBlocks(text, format)`. */
  blocks: readonly AnswerBlock[];
  /** The request's source rows; a label with no row stays text. */
  sources: readonly WorkspaceSource[];
  /** A chip was pressed: open the Sources tab at this answer. */
  onCite?: (ord: number) => void;
}

export function AnswerBody({ blocks: list, sources, onCite }: AnswerBodyProps) {
  return (
    <div className={styles.body} data-answer-text>
      {blocks(list, { sources, onCite })}
    </div>
  );
}
