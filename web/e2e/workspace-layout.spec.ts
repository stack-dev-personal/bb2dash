/**
 * The Workspace thread, laid out by a browser (Phase 21; the PM's walk of
 * 2026-10-07, W-1; rewritten for Phase 24b, task 11, frozen (f)).
 *
 * NOT A WALK. This spec opens no host, needs no saved session and reads no
 * data, so it runs anywhere the harness's Chromium is installed:
 *
 *   npx playwright test -c e2e/playwright.config.ts workspace-layout
 *
 * It is a static page: the thread's own markup (the screen's grid and column,
 * `ThreadView.tsx`'s thread and dock, `MessageList.tsx`'s column, turns, turn,
 * question and answer, each with its `.sr-only` label first, `AnswerBody.tsx`'s
 * body with a table in its box, and the sources row) under the stylesheets as
 * they are written: `src/app/globals.css` for `.sr-only` and the tokens, and
 * the four modules the thread is laid out with. A CSS Module's build only
 * renames its classes, so the source names are used as they stand (the
 * screen's column is `.pageColumn`, apart from the message column's `.column`);
 * a `composes:` line is no property to a browser and changes nothing here.
 * This spec reads those files, and nothing else under `src/`.
 *
 * WHAT IT MEASURES is what jsdom cannot:
 *
 *   * a long conversation makes the document no taller than its window, and
 *     each label's offset parent is the column that scrolls it (W-1);
 *   * the sources row under an answer is the column's, and scrolls with it;
 *   * at 390 px the composer's dock stays at the bottom of the pane, wherever
 *     the pane and the column are scrolled to;
 *   * at 390 px a wide table scrolls inside its own box, and the page does not
 *     scroll sideways.
 *
 * `test/Workspace.layout.test.tsx` holds the same rule on the stylesheets and
 * on the mounted screen, in every unit run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// No saved session: the config's `storageState` file need not exist for this spec.
test.use({ storageState: { cookies: [], origins: [] } });

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
const SRC = join(__dirname, '..', 'src');
const STYLESHEETS = [
  'app/globals.css',
  'app/(app)/workspace/Workspace.module.css',
  'components/workspace/ThreadView.module.css',
  'components/workspace/MessageList.module.css',
  'components/workspace/AnswerBody.module.css',
];

/** Enough turns, each long enough, to be several windows tall. */
const TURNS = 6;
const LINES_PER_ANSWER = 24;

/** A label's own `margin: -1px`, and a pixel of rounding. */
const LABEL_SLACK_PX = 2;

/** The phone the brief names (frozen (f): 390 px, no sideways page scroll). */
const PHONE = { width: 390, height: 700 };

/** Lines above the column, so the thread is taller than the pane. */
const PROBLEM_LINES = 12;

function turnMarkup(index: number): string {
  const answer = Array.from(
    { length: LINES_PER_ANSWER },
    (_, line) => `<p class="paragraph">Line ${line + 1} of answer ${index + 1}: the reading and the quiz for the week.</p>`,
  ).join('');
  return `
    <li class="turn" data-turn="done" data-request-id="${index + 1}">
      <div class="question">
        <span class="sr-only">You asked</span>
        <p class="text">Question ${index + 1}: what is due this week?</p>
      </div>
      <div class="answer">
        <span class="sr-only">The assistant answered</span>
        <div class="body" data-answer-text>${answer}</div>
        <button type="button" class="sources" data-sources>2 sources</button>
      </div>
    </li>`;
}

/** A table no phone can hold: each cell is one word with no space or hyphen, so no font folds it. (A hyphen
 * is a break point: the walk box's Linux Chromium folded the hyphenated cells, and the table fit 356 px.) */
function wideTableMarkup(): string {
  const cell = 'IST323WeekFiveReadingResponseDraftUnbroken';
  const row = (tag: string) => `<tr>${Array.from({ length: 5 }, () => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
  return `
    <li class="turn" data-turn="done" data-request-id="99">
      <div class="answer">
        <span class="sr-only">The assistant answered</span>
        <div class="body" data-answer-text>
          <div class="tableBox" data-table-box><table class="table"><thead>${row('th')}</thead><tbody>${row('td')}</tbody></table></div>
        </div>
      </div>
    </li>`;
}

function threadMarkup(problems: number): string {
  const lines = Array.from({ length: problems }, (_, index) => `<p class="problem">Could not load this conversation: line ${index + 1}</p>`).join('');
  const turns = Array.from({ length: TURNS }, (_, index) => turnMarkup(index)).join('') + wideTableMarkup();
  return `
    <section class="thread">
      ${lines}
      <div class="column" data-column><ol class="turns" aria-label="Messages">${turns}</ol></div>
      <div class="dock" data-composer-dock><textarea aria-label="Question"></textarea><button type="button">Ask</button></div>
    </section>`;
}

/**
 * The page. `pane` stands in for the shell's content pane (`Shell.module.css`
 * `.main`: it scrolls inside itself), or is left out so the document is the
 * thread's only container.
 */
function pageMarkup(options: { pane: boolean; problems: number }): string {
  const css = STYLESHEETS.map((file) => readFileSync(join(SRC, file), 'utf8')).join('\n');
  const screen = `
    <div class="workspace">
      <div class="pageColumn">
        <div class="bar"><p class="today" data-today="2026-10-15">Today is Thursday, October 15, 2026.</p></div>
        <div class="stream" data-workspace-stream>${threadMarkup(options.problems)}</div>
      </div>
    </div>`;
  const body = options.pane
    ? `<div data-pane style="position: relative; height: 100vh; overflow-y: auto">${screen}</div>`
    : screen;
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>The Workspace thread</title><style>${css}</style><style>body { margin: 0; }</style></head>
  <body>${body}</body>
</html>`;
}

async function openThread(page: Page, options: { pane: boolean; problems: number }): Promise<void> {
  // globals.css imports a web font. Nothing here may reach the network.
  await page.route('**/*', (route) => route.abort());
  await page.setContent(pageMarkup(options), { waitUntil: 'load' });
}

test('a long conversation does not make the page taller than its window', async ({ page }) => {
  await openThread(page, { pane: false, problems: 0 });

  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-column]');
    if (column === null) throw new Error('no column');
    return {
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      columnHeight: column.clientHeight,
      contentHeight: column.scrollHeight,
      labels: column.querySelectorAll('.sr-only').length,
    };
  });

  // The conversation is several windows tall, and scrolls inside the column.
  expect(measured.labels).toBe(TURNS * 2 + 1);
  expect(measured.contentHeight).toBeGreaterThan(measured.windowHeight * 2);
  expect(measured.columnHeight).toBeLessThan(measured.windowHeight);
  // The page itself has nothing to scroll.
  expect(measured.documentHeight).toBe(measured.windowHeight);
});

test('a screen-reader label is contained by the column, and scrolls with what it names', async ({ page }) => {
  await openThread(page, { pane: false, problems: 0 });

  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-column]');
    if (column === null) throw new Error('no column');
    const labels = [...column.querySelectorAll<HTMLElement>('.sr-only')];
    /** The furthest any label sits from the top of the question or answer it is the first child of. */
    const furthestFromItsBox = () =>
      Math.max(
        ...labels.map((label) => {
          const named = label.parentElement;
          if (named === null) throw new Error('a label with no parent');
          return Math.abs(label.getBoundingClientRect().top - named.getBoundingClientRect().top);
        }),
      );

    const atTheTop = furthestFromItsBox();
    column.scrollTop = column.scrollHeight;
    return {
      containedByColumn: labels.every((label) => label.offsetParent === column),
      scrolledBy: Math.round(column.scrollTop),
      atTheTop: Math.round(atTheTop),
      atTheEnd: Math.round(furthestFromItsBox()),
    };
  });

  expect(measured.containedByColumn).toBe(true);
  expect(measured.scrolledBy).toBeGreaterThan(0);
  expect(measured.atTheTop).toBeLessThanOrEqual(LABEL_SLACK_PX);
  expect(measured.atTheEnd).toBeLessThanOrEqual(LABEL_SLACK_PX);
});

test('the sources row under an answer is the column`s, and scrolls with it', async ({ page }) => {
  await openThread(page, { pane: false, problems: 0 });

  const measured = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>('[data-column]');
    if (column === null) throw new Error('no column');
    const rows = [...column.querySelectorAll<HTMLElement>('[data-sources]')];
    const last = rows.at(-1);
    if (last === undefined) throw new Error('no sources row');
    const before = last.getBoundingClientRect().top;
    column.scrollTop = column.scrollHeight;
    return {
      rows: rows.length,
      insideColumn: rows.every((row) => column.contains(row)),
      moved: Math.round(before - last.getBoundingClientRect().top),
      scrolledBy: Math.round(column.scrollTop),
    };
  });

  expect(measured.rows).toBe(TURNS);
  expect(measured.insideColumn).toBe(true);
  expect(measured.moved).toBe(measured.scrolledBy);
});

test('at 390 px the composer stays docked at the bottom of the pane', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openThread(page, { pane: true, problems: PROBLEM_LINES });

  const measured = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('[data-pane]');
    const column = document.querySelector<HTMLElement>('[data-column]');
    const dock = document.querySelector<HTMLElement>('[data-composer-dock]');
    if (pane === null || column === null || dock === null) throw new Error('no pane, column or dock');
    const gap = () => Math.round(pane.getBoundingClientRect().bottom - dock.getBoundingClientRect().bottom);
    const atTop = gap();
    column.scrollTop = column.scrollHeight;
    const columnScrolled = gap();
    pane.scrollTop = Math.round(pane.scrollHeight / 3);
    const paneScrolled = gap();
    return {
      paneScrolls: pane.scrollHeight > pane.clientHeight,
      columnScrolled: column.scrollTop > 0,
      atTop,
      afterColumn: columnScrolled,
      afterPane: paneScrolled,
      pageWidth: document.documentElement.scrollWidth,
    };
  });

  // The thread is taller than the pane, so the dock would be below it if it were not docked.
  expect(measured.paneScrolls).toBe(true);
  expect(measured.columnScrolled).toBe(true);
  expect(Math.abs(measured.atTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(measured.afterColumn)).toBeLessThanOrEqual(1);
  expect(Math.abs(measured.afterPane)).toBeLessThanOrEqual(1);
  expect(measured.pageWidth).toBeLessThanOrEqual(PHONE.width);
});

test('at 390 px a wide table scrolls inside its own box, and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openThread(page, { pane: false, problems: 0 });

  const measured = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-table-box]');
    if (box === null) throw new Error('no table box');
    return {
      boxScrollWidth: box.scrollWidth,
      boxClientWidth: box.clientWidth,
      position: getComputedStyle(box).position,
      overflowX: getComputedStyle(box).overflowX,
      pageWidth: document.documentElement.scrollWidth,
    };
  });

  expect(measured.boxScrollWidth).toBeGreaterThan(measured.boxClientWidth);
  expect(measured.position).toBe('relative');
  expect(measured.overflowX).toBe('auto');
  expect(measured.pageWidth).toBeLessThanOrEqual(PHONE.width);
});
