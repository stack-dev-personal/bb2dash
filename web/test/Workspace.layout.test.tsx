/**
 * The Workspace screen: nothing it positions absolutely is left outside the
 * box that scrolls it (the PM's walk of 2026-10-07, W-1; rewritten for Phase
 * 24b, task 11).
 *
 * A screen-reader label is `.sr-only`: `position: absolute` with no offsets
 * (`src/app/globals.css`). What contains such a box is its nearest positioned
 * ancestor, and a box that scrolls clips and moves only what it contains. The
 * message column once scrolled without being positioned, so the labels of its
 * turns were the page's, and the document grew to hold them. Phase 24b adds
 * more boxes that scroll: a wide table and a code block scroll sideways inside
 * the answer body, and the dock is sticky. The rule is the same for each.
 *
 * jsdom lays nothing out and does not apply the CSS Modules, so the
 * stylesheets are read here: which classes scroll, which are positioned, which
 * are absolute. The folder's sheets are read by `import.meta.glob` (probe Q-5
 * passed), so a new module in the folder is read without a hand-written list;
 * `readdirSync` holds the glob to the folder. The rule is then checked on the
 * stylesheets and on the screen, mounted twice: the lobby, and a thread with
 * the panel open. `e2e/workspace-layout.spec.ts` measures the same in a browser.
 *
 * THE SCREEN MOUNTED HERE IS THE REAL ONE: W-87's `Lobby.tsx` and `Composer.tsx`
 * (merged into this branch at d495f32), not the harness's stand-ins, so the
 * lobby's and the composer's own boxes are checked with the rest.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import screenStyles from '@/app/(app)/workspace/Workspace.module.css';
import answerStyles from '@/components/workspace/AnswerBody.module.css';
import messageStyles from '@/components/workspace/MessageList.module.css';
import dockStyles from '@/components/workspace/ThreadView.module.css';
import { newQueryClient } from './hydration-harness';
import { fake, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const labels = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

/* ---------------------------------------------------------------------------
 * What the stylesheets say of a rendered class
 * ------------------------------------------------------------------------ */

// `process.cwd()`, not `import.meta.url`: under jsdom the module URL is an http
// one (see audits.test.ts). Vitest runs from `web/`.
const SRC = join(process.cwd(), 'src');
const COMPONENTS = 'components/workspace';

type ClassMap = Readonly<Record<string, string>>;

interface Sheet {
  readonly file: string;
  /** Source class name → the class name the module renders; null for a sheet that renames nothing. */
  readonly names: ClassMap | null;
}

/** Where `.sr-only` is written. Its classes render as they are written. */
const GLOBAL_SHEET: Sheet = { file: 'app/globals.css', names: null };

/** The folder's modules, as the bundler loads them: path → module. */
const FOLDER_MODULES = import.meta.glob('../src/components/workspace/*.module.css', { eager: true });

/** A loaded CSS module's class map: its default export, or the module itself. */
function classMapOf(loaded: unknown): ClassMap {
  const sheet = loaded as { default?: ClassMap } & ClassMap;
  return sheet.default ?? sheet;
}

/** Every stylesheet the screen lays itself out with: the folder's, read by glob, and the screen's own. */
const SCREEN_SHEETS: readonly Sheet[] = [
  { file: 'app/(app)/workspace/Workspace.module.css', names: screenStyles },
  ...Object.entries(FOLDER_MODULES).map(([path, loaded]) => ({
    file: `${COMPONENTS}/${path.split('/').at(-1)}`,
    names: classMapOf(loaded),
  })),
];

interface Facts {
  /** Where the class is written, as `file: .class`. */
  readonly source: string;
  /** It scrolls what overflows it. */
  readonly scrolls: boolean;
  /** It contains the absolutely positioned boxes inside it. */
  readonly positioned: boolean;
  /** It is taken out of the flow, and placed by whatever contains it. */
  readonly absolute: boolean;
}

const SCROLLS = /(?:^|[;\s])overflow(?:-[xy])?\s*:\s*(?:auto|scroll)\b/;
const POSITIONED = /(?:^|[;\s])position\s*:\s*(?:relative|absolute|fixed|sticky)\b/;
const ABSOLUTE = /(?:^|[;\s])position\s*:\s*absolute\b/;

/** The class a sheet renders `name` as. A composed class renders several: its own comes first. */
function renderedName(sheet: Sheet, name: string): string | undefined {
  return sheet.names === null ? name : sheet.names[name]?.split(/\s+/)[0];
}

/** One sheet's facts, by rendered class. A rule is about the last compound of its selector. */
function factsOf(sheet: Sheet): ReadonlyMap<string, Facts> {
  const css = readFileSync(join(SRC, sheet.file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const facts = new Map<string, Facts>();
  // Innermost blocks only, so a rule inside @media is read like any other.
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
      const subject = selector.trim().split(/\s*[>+~]\s*|\s+/).at(-1) ?? '';
      for (const [, name] of subject.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        const rendered = renderedName(sheet, name);
        if (rendered === undefined) continue;
        const known = facts.get(rendered);
        facts.set(rendered, {
          source: `${sheet.file}: .${name}`,
          scrolls: (known?.scrolls ?? false) || SCROLLS.test(body),
          positioned: (known?.positioned ?? false) || POSITIONED.test(body),
          absolute: (known?.absolute ?? false) || ABSOLUTE.test(body),
        });
      }
    }
  }
  return facts;
}

/** Every class the screen can render, with what its sheet says of it. */
const FACTS: ReadonlyMap<string, Facts> = new Map(
  [GLOBAL_SHEET, ...SCREEN_SHEETS].flatMap((sheet) => [...factsOf(sheet)]),
);

function factsOfElement(element: Element): readonly Facts[] {
  return [...element.classList].flatMap((name) => {
    const facts = FACTS.get(name);
    return facts === undefined ? [] : [facts];
  });
}

function describeBox(element: Element): string {
  const written = factsOfElement(element).map((facts) => facts.source);
  return written.length > 0 ? written.join(' + ') : element.tagName.toLowerCase();
}

/**
 * Every absolutely positioned box under `root` that a scrolling ancestor does
 * not contain: going up from it, a box that scrolls comes before any that is
 * positioned.
 */
function leftOutside(root: Element): string[] {
  const out: string[] = [];
  for (const element of root.querySelectorAll('*')) {
    if (!factsOfElement(element).some((facts) => facts.absolute)) continue;
    for (let box = element.parentElement; box !== null; box = box.parentElement) {
      const facts = factsOfElement(box);
      if (facts.some((one) => one.positioned)) break;
      if (facts.some((one) => one.scrolls)) {
        out.push(`"${element.textContent}" is not contained by ${describeBox(box)}`);
        break;
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * A conversation with each of the labels in it, a wide table and its sources
 * ------------------------------------------------------------------------ */

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, content: string): Row {
  return { id: uuid(n), conversation_id: A, role: 'user', content, finished: true };
}

const WIDE_TABLE = [
  '| Week | Reading | Quiz | Project | Notes |',
  '|---|---|---|---|---|',
  '| 5 | Chapter 4 | Quiz 2 | Draft due | [M12] |',
].join('\n');

/** An answered question (a table and a chip in it), then one stopped before the runner began. */
const CONVERSATION: Record<string, Row[]> = {
  workspace_conversations: [{ id: A, title: 'spike', archived: false, updated_at: '2026-10-06T15:00:00+00:00' }],
  workspace_messages: [
    question(1, 'What is due?'),
    {
      id: uuid(2),
      conversation_id: A,
      role: 'assistant',
      request_id: 41,
      tier: 'low',
      content: `Quiz 2.\n\n${WIDE_TABLE}\n\n\`\`\`text\na long line of code\n\`\`\``,
      tool_calls: [],
      finished: true,
      error_code: null,
    },
    question(3, 'And the reading?'),
  ],
  workspace_requests: [
    { id: 41, conversation_id: A, user_message_id: uuid(1), state: 'done', error_code: null },
    { id: 42, conversation_id: A, user_message_id: uuid(3), state: 'cancelled', error_code: 'cancelled' },
  ],
  workspace_request_options: [
    { request_id: 41, depth: 'auto', format: 'rich', routine_id: null, course_display_id: null, course_ids: null },
  ],
  workspace_sources: [
    {
      request_id: 41,
      ord: 1,
      kind: 'material',
      origin: 'auto',
      file_id: 7,
      text_id: 12,
      document_id: null,
      doc_text_id: null,
      course_id: 'IST.323',
      title: 'Week 5 slides.pptx',
      unit_kind: 'slide',
      unit_no: 3,
    },
  ],
};

function mount(search: string) {
  fake.state.search = search;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetFake();
});

describe('what the stylesheets say', () => {
  it('reads every stylesheet of the folder: the glob is the folder', () => {
    const inFolder = readdirSync(join(SRC, COMPONENTS))
      .filter((name) => name.endsWith('.module.css'))
      .map((name) => `${COMPONENTS}/${name}`);

    expect(SCREEN_SHEETS.map((sheet) => sheet.file).filter((file) => file.startsWith(COMPONENTS)).sort()).toEqual(
      inFolder.sort(),
    );
    expect(inFolder.length).toBeGreaterThanOrEqual(8);
  });

  it('writes a screen-reader label as an absolute box, and the message column as one that scrolls', () => {
    expect(FACTS.get('sr-only')?.absolute).toBe(true);
    expect(FACTS.get(messageStyles.column)?.scrolls).toBe(true);
  });

  it('positions every box that scrolls on the Workspace screen, so it contains what it scrolls', () => {
    const scrollers = [...FACTS.values()].filter((facts) => facts.scrolls);

    expect(scrollers.map((facts) => facts.source)).toEqual(
      expect.arrayContaining([
        `${COMPONENTS}/MessageList.module.css: .column`,
        `${COMPONENTS}/AnswerBody.module.css: .tableBox`,
        `${COMPONENTS}/AnswerBody.module.css: .code`,
      ]),
    );
    expect(scrollers.filter((facts) => !facts.positioned).map((facts) => facts.source)).toEqual([]);
  });

  it('docks the composer: its wrapper is sticky at the bottom, on the page`s ground', () => {
    const css = readFileSync(join(SRC, `${COMPONENTS}/ThreadView.module.css`), 'utf8');
    const dock = /\.dock\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(dock).toMatch(/position:\s*sticky/);
    expect(dock).toMatch(/bottom:\s*0/);
    expect(dock).toMatch(/background:\s*var\(--color-bg\)/);
    expect(FACTS.get(dockStyles.dock)?.positioned).toBe(true);
    expect(FACTS.get(answerStyles.tableBox)?.positioned).toBe(true);
  });

  /**
   * The walk of the preview (round 2, W-1): the rail's button showed at 1280 px, because `.railButton`
   * composes `btnSecondary`, whose `display: inline-flex` comes later in the built sheet and wins over the
   * module's own `display: none`. The button now sits in a slot that composes nothing and is the one
   * hidden; the button itself sets no display.
   */
  it('hides the rail`s button above 720 px through a slot no composition can show (round 2, W-1)', () => {
    const css = readFileSync(join(SRC, 'app/(app)/workspace/Workspace.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const [outside, ...steps] = css.split(/@media\s*\(max-width:\s*720px\)\s*\{/);
    const slot = /\.railSlot\s*\{([^}]*)\}/.exec(outside)?.[1] ?? '';
    expect(slot).toMatch(/display:\s*none/);
    expect(slot).not.toMatch(/composes/);
    const phone = steps.join('');
    expect(/\.railSlot\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '').toMatch(/display:\s*(?!none)\w+/);
    const button = [...css.matchAll(/\.railButton\s*\{([^}]*)\}/g)].map((match) => match[1]).join('');
    expect(button).not.toMatch(/display\s*:/);
  });

  it('folds only on the two steps the audit allows, 1023.98 px and 720 px', () => {
    const widths = SCREEN_SHEETS.filter((sheet) => !sheet.file.includes('Composer') && !sheet.file.includes('Lobby'))
      .flatMap((sheet) => [...readFileSync(join(SRC, sheet.file), 'utf8').matchAll(/@media[^{]*\(\s*max-width:\s*([\d.]+px)\s*\)/g)])
      .map((match) => match[1]);
    expect(new Set(widths)).toEqual(new Set(['1023.98px', '720px']));
  });
});

describe('the mounted screen', () => {
  it('leaves no screen-reader label of a conversation outside the column that scrolls it, with the panel open', async () => {
    fake.state.rows = CONVERSATION;
    const { container } = mount(`c=${A}&panel=sources`);
    await screen.findByText('You stopped this answer.');
    await screen.findByRole('link', { name: /spike/ });
    await screen.findByRole('region', { name: labels.PANEL_REGION_LABEL });
    await screen.findByRole('button', { name: labels.sourceChipLabel(1) });

    // The labels, each inside the column: the check below has something to check.
    const column = container.querySelector(`.${messageStyles.column}`);
    const inColumn = [...(column?.querySelectorAll('.sr-only') ?? [])].map((label) => label.textContent);
    expect(inColumn).toEqual([
      labels.QUESTION_ROLE_LABEL,
      labels.ANSWER_ROLE_LABEL,
      labels.QUESTION_ROLE_LABEL,
      labels.STATUS_ROLE_LABEL,
    ]);
    // The wide table is inside its own box that scrolls sideways.
    expect(container.querySelector(`.${answerStyles.tableBox} > table`)).not.toBeNull();

    expect(leftOutside(container)).toEqual([]);
    // The rail's button sits in its slot (W-1).
    const railButton = screen.getByRole('button', { name: labels.CONVERSATIONS_HEADING, hidden: true });
    expect(railButton.parentElement).toHaveClass(screenStyles.railSlot);
  });

  it('leaves none outside in the lobby', async () => {
    fake.state.rows = { workspace_conversations: CONVERSATION.workspace_conversations };
    const { container } = mount('');
    // The rail's link and the lobby's recent row, both.
    await waitFor(() => expect(screen.getAllByRole('link', { name: /spike/ })).toHaveLength(2));
    expect(container.querySelector('[data-lobby]')).not.toBeNull();

    expect(leftOutside(container)).toEqual([]);
  });
});
