/**
 * Phase 25b's walk of the proposal cards (brief 119, item E; the frozen contract 119b, "The page").
 * Run in the walk box, from the worktree's root:
 *
 *   WALK_SHOTS=1 node scripts/walk-box.mjs web/e2e/walk25b.spec.ts [-- -g "dark 390"]
 *
 * Before the cut-over no proposal row exists anywhere, so every row this spec shows is made up and
 * handed to the page by route: the conversation, its answer, `v_workspace_proposals`,
 * `attention_items` and the answers of `workspace_proposal_decide`. Nothing is written: the decide
 * call is answered here and never reaches the database, and the write guard (`walk22.lib`) stops
 * anything else. Shots are of the cards alone, so no live row is in them.
 *
 * One case per theme and width (dark and light, 1280 and 390 px), each walking the same flow:
 *
 *   1. the Workspace: three open cards under a finished answer (a status, a long note, a date),
 *      each drawing the value read and the value proposed;
 *   1b. (W-106) Stack's edit of the proposed value: "edit" on the note card opens its note box (Escape
 *      puts the box back), "edit" on the status card opens the status select; picking graded and
 *      pressing Enter keeps it as a draft, "Proposed · edited by you" with Reset;
 *   2. Approve on the status card: the call goes out with `{p_id, p_decision, p_value: 'graded'}`, the
 *      card reads back `applied` and shows only "Approved: marked graded", and the focus is on that
 *      outcome;
 *   3. Approve on the date card when the row has changed: the card reads back "Stale: the row
 *      changed" and draws no date;
 *   1a. (round 2) the grey "edit": at rest only at 390, where the page is a touch phone (`hover: none`
 *      by CDP); shown, grey, with the pointer over the box (12); the strong text colour with the
 *      pointer over "edit" itself (13); the draft shot (10) is taken at rest, no focus ring;
 *   4. the Inbox: the pointer over the open note's Proposed box shows "edit" (14), and its "edit" opens
 *      the note box, which a click off the box puts back; the two decided ones are under Archived,
 *      each with its outcome and a link back to the answer.
 */

import type { BrowserContext, CDPSession, Locator, Page, Route } from '@playwright/test';
import { coldCache, fulfillView, openSignedIn } from './walk';
import { expect, quietSync, shotPath22, shotsAsked22, test } from './walk22.lib';
import { fulfillWorkspacePageFixture } from './walk24b.lib';

test.use({ reducedMotion: 'reduce' });

const THEME_KEY = 'bb2dash.theme';
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];
const WIDTHS = [
  { name: '1280', size: { width: 1280, height: 900 } },
  { name: '390', size: { width: 390, height: 844 } },
] as const;

/** The app polls, so 'networkidle' never fires; this lets the first reads land. */
const SETTLE_MS = 2500;
const JSON_TYPE = 'application/json; charset=utf-8';

const CONVERSATION = '25250000-2525-4525-8525-252500000001';
const QUESTION = '25250000-2525-4525-8525-252500000002';
const ANSWER = '25250000-2525-4525-8525-252500000003';
const REQUEST_ID = 25_001;
const WORKSPACE_PATH = `/workspace?c=${CONVERSATION}`;
const ANSWER_HREF = `/workspace?c=${CONVERSATION}`;

const STATUS_ID = 2_501;
const NOTE_ID = 2_502;
const DATE_ID = 2_503;
const LABEL = 'Demo Problem Set 4';
const LONG_NOTE =
  'Sample note: start with question 3, then check the answers to 1 and 2 against the worked example. ' +
  'Leave twenty minutes for the write-up and read it once aloud before handing it in. '.repeat(3);

type Row = Record<string, unknown>;

/** The rows the page reads, held per case and moved by the decide route. */
interface Fixture {
  proposals: Row[];
  items: Row[];
  decisions: Row[];
}

function proposal(id: number, field: string, oldValue: unknown, newValue: unknown, reason: string): Row {
  return {
    id,
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    request_id: REQUEST_ID,
    conversation_id: CONVERSATION,
    target: 'assignment_progress',
    row_id: 'DEMO.101/problem-set-4',
    course_id: 'DEMO.101',
    label: LABEL,
    field,
    old_value: oldValue,
    new_value: newValue,
    reason,
    state: 'proposed',
    decided_at: null,
    approved_value: null,
    effective_state: 'proposed',
    attention_item_id: id + 1_000,
    attention_state: 'open',
  };
}

function itemOf(row: Row): Row {
  return {
    id: Number(row.id) + 1_000,
    raised_at: row.created_at,
    raised_by: null,
    kind: 'assistant_proposal',
    course_id: 'DEMO.101',
    entity: row.target,
    ref: `workspace_proposal/${String(row.id)}`,
    field: row.field,
    from_value: row.old_value,
    to_value: row.new_value,
    question: `${LABEL}: change its ${String(row.field).replace('_', ' ')}?`,
    suggested: { source: 'workspace', proposal_id: row.id, conversation_id: CONVERSATION, request_id: REQUEST_ID, reason: row.reason },
    workspace_proposal_id: row.id,
    state: 'open',
    resolved_at: null,
    resolution: null,
    resolution_note: null,
    applied_at: null,
    archived_at: null,
    archived_by: null,
    decision: null,
  };
}

function newFixture(): Fixture {
  const proposals = [
    proposal(STATUS_ID, 'status', 'in_progress', 'submitted', 'Sample reason: you said you handed it in this morning.'),
    proposal(NOTE_ID, 'notes', null, LONG_NOTE, 'Sample reason: you asked me to keep the plan for this one.'),
    proposal(DATE_ID, 'planned_start', '2026-10-20', '2026-10-21', 'Sample reason: Tuesday is full.'),
  ];
  return { proposals, items: proposals.map(itemOf), decisions: [] };
}

/**
 * What 206 does, on the fixture: the status approval writes (Stack's edit, p_value, when sent, and
 * approved_value is what was written), the date approval finds the row changed.
 */
function decide(fixture: Fixture, id: number, decision: string, value: unknown): string {
  const state = decision === 'reject' ? 'rejected' : id === DATE_ID ? 'stale' : 'applied';
  fixture.proposals = fixture.proposals.map((row) =>
    row.id === id
      ? {
          ...row,
          state,
          effective_state: state,
          decided_at: new Date().toISOString(),
          attention_state: 'resolved',
          approved_value: state === 'applied' ? (value ?? row.new_value) : null,
        }
      : row,
  );
  fixture.items = fixture.items.map((item) =>
    item.id === id + 1_000
      ? {
          ...item,
          state: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution: { outcome: state, proposal_id: id, edited: state === 'applied' && value !== undefined },
        }
      : item,
  );
  return state;
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: JSON_TYPE, body: JSON.stringify(body) });
}

async function fulfillProposalRows(context: BrowserContext, fixture: Fixture): Promise<void> {
  await context.route('**/rest/v1/v_workspace_proposals?**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return json(route, fixture.proposals);
  });
  await context.route('**/rest/v1/attention_items?**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const openOnly = route.request().url().includes('state=eq.open');
    return json(route, openOnly ? fixture.items.filter((item) => item.state === 'open') : fixture.items);
  });
  // Answered here: the call never reaches the database, and the guard never sees it.
  await context.route('**/rest/v1/rpc/workspace_proposal_decide', async (route) => {
    const args = (route.request().postDataJSON() ?? {}) as Row;
    fixture.decisions.push(args);
    const state = decide(fixture, Number(args.p_id), String(args.p_decision), args.p_value);
    return json(route, [{ state, applied: state === 'applied' }]);
  });
}

async function fulfillConversation(context: BrowserContext): Promise<void> {
  const now = new Date();
  const earlier = new Date(now.getTime() - 5 * 60_000).toISOString();
  await fulfillView(context, 'workspace_conversations', [
    { id: CONVERSATION, created_at: earlier, updated_at: earlier, title: 'Sample: I handed in problem set 4', archived: false },
  ]);
  await fulfillView(context, 'workspace_messages', [
    { id: QUESTION, conversation_id: CONVERSATION, role: 'user', request_id: null, tier: null, content: 'Sample question: I handed in problem set 4 and want to start the next one on Wednesday.', tool_calls: [], finished: true, error_code: null, created_at: earlier },
    { id: ANSWER, conversation_id: CONVERSATION, role: 'assistant', request_id: REQUEST_ID, tier: 'mid', content: 'Sample answer: I proposed three changes to your planner below. Nothing changes until you approve one.', tool_calls: [], finished: true, error_code: null, created_at: now.toISOString() },
  ]);
  await fulfillView(context, 'workspace_requests', [
    { id: REQUEST_ID, created_at: earlier, conversation_id: CONVERSATION, user_message_id: QUESTION, state: 'done', claimed_at: earlier, finished_at: now.toISOString(), error_code: null },
  ]);
  await fulfillView(context, 'v_workspace_status', [
    { polled_at: now.toISOString(), runner: 'walk25b', open_requests: 0, oldest_open_at: null, polled_age_seconds: 5 },
  ]);
  await fulfillWorkspacePageFixture(context, REQUEST_ID, now.toISOString());
}

async function useTheme(context: BrowserContext, theme: Theme): Promise<void> {
  if (theme !== 'light') return;
  await context.addInitScript(
    ([key, value]: readonly [string, string]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage disabled: the page keeps its default theme, and the theme assertion says so.
      }
    },
    [THEME_KEY, 'light'] as const,
  );
}

async function shoot(locator: Locator, name: string): Promise<void> {
  if (!shotsAsked22()) return;
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: shotPath22(name), animations: 'disabled' });
}

const card = (page: Page, id: number): Locator => page.locator(`[data-proposal="${id}"]`);
const proposedBox = (page: Page, id: number): Locator => card(page, id).locator('[data-proposal-value="new"]');

/** Hover the Proposed box, so its grey "edit" shows as Stack sees it, then press it (W-106). */
async function openEditor(page: Page, id: number): Promise<void> {
  await proposedBox(page, id).hover();
  await card(page, id).getByRole('button', { name: `Edit the proposed value for ${LABEL}` }).click();
}

/**
 * Round 2: at 390 the page is a touch phone, so CSS `(hover: none)` matches and "edit" shows at rest.
 * Playwright's device options do not change Chromium's hover media feature, so it is set by CDP;
 * Playwright's own media features (colour scheme, reduced motion) are named again so this call
 * does not drop them. The spec checks `matchMedia` after every page it opens.
 */
async function emulatePhone(cdp: CDPSession, page: Page): Promise<void> {
  const scheme = await page.evaluate(() => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'hover', value: 'none' },
      { name: 'any-hover', value: 'none' },
      { name: 'pointer', value: 'coarse' },
      { name: 'any-pointer', value: 'coarse' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: scheme },
    ],
  });
}

async function openAt(page: Page, path: string, theme: Theme, phone: CDPSession | null): Promise<void> {
  await openSignedIn(page, path);
  await page.waitForLoadState('load');
  if (phone !== null) await emulatePhone(phone, page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await page.evaluate(() => window.matchMedia('(hover: none)').matches)).toBe(phone !== null);
  await page.waitForTimeout(SETTLE_MS);
}

/** The "edit" of a card's Proposed box. */
const editOf = (page: Page, id: number): Locator =>
  card(page, id).getByRole('button', { name: `Edit the proposed value for ${LABEL}` });

/** The pointer off every card, and no focus ring left on a button: the card at rest. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
}

async function opacityOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).opacity);
}

async function colourOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const tag = `${theme}-${width.name}`;

    test(`25b proposals ${theme} ${width.name}`, async ({ page, context }) => {
      const fixture = newFixture();
      await coldCache(context);
      await useTheme(context, theme);
      await quietSync(context);
      await fulfillConversation(context);
      await fulfillProposalRows(context, fixture);
      await page.setViewportSize(width.size);
      const phone = width.name === '390' ? await context.newCDPSession(page) : null;

      // 1. The Workspace: three open cards under the finished answer, each with both values.
      await openAt(page, WORKSPACE_PATH, theme, phone);
      for (const id of [STATUS_ID, NOTE_ID, DATE_ID]) {
        await expect(card(page, id)).toHaveAttribute('data-proposal-state', 'proposed');
        await expect(card(page, id).locator('[data-proposal-value]')).toHaveCount(2);
      }
      await expect(card(page, STATUS_ID).locator('[data-proposal-value="old"]')).toContainText('in progress');
      await expect(card(page, DATE_ID).locator('[data-proposal-value="new"]')).toContainText('Oct 21');
      await shoot(card(page, STATUS_ID), `01-workspace-open-status-${tag}.png`);
      await shoot(card(page, NOTE_ID), `02-workspace-open-note-${tag}.png`);
      await shoot(card(page, DATE_ID), `03-workspace-open-date-${tag}.png`);

      // 1a. (Round 2) The grey "edit": at rest it shows only on a phone; the pointer over the box
      //     shows it, grey; the pointer over "edit" itself turns it to the strong text colour (the
      //     colour of the card's line, which is set in it).
      await rest(page);
      expect(await opacityOf(editOf(page, STATUS_ID))).toBe(phone === null ? '0' : '1');
      const strong = await colourOf(card(page, STATUS_ID).locator('p').first());
      await proposedBox(page, STATUS_ID).hover();
      await expect.poll(() => opacityOf(editOf(page, STATUS_ID))).toBe('1');
      await expect.poll(() => colourOf(editOf(page, STATUS_ID))).not.toBe(strong);
      await shoot(card(page, STATUS_ID), `12-workspace-hover-box-${tag}.png`);
      await editOf(page, STATUS_ID).hover();
      await expect.poll(() => colourOf(editOf(page, STATUS_ID))).toBe(strong);
      await shoot(card(page, STATUS_ID), `13-workspace-hover-edit-${tag}.png`);
      await rest(page);

      // 1b. (W-106) Edit: the note box, put back by Escape; then the status select, kept as a draft.
      await openEditor(page, NOTE_ID);
      await expect(card(page, NOTE_ID).getByRole('textbox', { name: `Proposed note for ${LABEL}` })).toBeFocused();
      await shoot(card(page, NOTE_ID), `09-workspace-edit-mode-note-${tag}.png`);
      await page.keyboard.press('Escape');
      await expect(card(page, NOTE_ID).getByRole('textbox')).toHaveCount(0);
      await expect(proposedBox(page, NOTE_ID)).toHaveAttribute('aria-label', 'Proposed');
      await openEditor(page, STATUS_ID);
      const status = card(page, STATUS_ID).getByRole('combobox', { name: `Proposed status for ${LABEL}` });
      await expect(status).toBeFocused();
      await shoot(card(page, STATUS_ID), `09-workspace-edit-mode-status-${tag}.png`);
      await status.selectOption('graded');
      await status.press('Enter');
      await expect(proposedBox(page, STATUS_ID)).toHaveAttribute('aria-label', 'Proposed · edited by you');
      await expect(proposedBox(page, STATUS_ID)).toContainText('graded');
      await expect(card(page, STATUS_ID).getByRole('button', { name: `Reset the proposed value for ${LABEL}` })).toBeVisible();
      // The draft at rest: no focus ring on edit (it took the focus back) and no pointer over it.
      await rest(page);
      await shoot(card(page, STATUS_ID), `10-workspace-edited-draft-${tag}.png`);
      expect(fixture.decisions).toEqual([]);

      // 2. Approve the status with the edit: one call carrying it, then the outcome alone, focused.
      await page.getByRole('button', { name: `Approve: mark ${LABEL} as graded` }).click();
      await expect(card(page, STATUS_ID).locator('[data-proposal-outcome]')).toHaveText('Approved: marked graded');
      await expect(card(page, STATUS_ID).locator('[data-proposal-value]')).toHaveCount(0);
      await expect(card(page, STATUS_ID).locator('[data-proposal-outcome]')).toBeFocused();
      expect(fixture.decisions).toEqual([{ p_id: STATUS_ID, p_decision: 'approve', p_value: 'graded' }]);
      await shoot(card(page, STATUS_ID), `04-workspace-approved-${tag}.png`);

      // 3. Approve the date after the row changed: stale, and no date drawn.
      await page.getByRole('button', { name: `Approve: set the planned start of ${LABEL} to Oct 21` }).click();
      await expect(card(page, DATE_ID).locator('[data-proposal-outcome]')).toHaveText('Stale: the row changed');
      await expect(card(page, DATE_ID)).not.toContainText('Oct 21');
      await shoot(card(page, DATE_ID), `05-workspace-stale-${tag}.png`);

      // 4. The Inbox: the open note under Needs you; the two decided ones under Archived, linked back.
      await openAt(page, '/inbox', theme, phone);
      await expect(card(page, NOTE_ID).getByRole('button', { name: /^Approve: replace the note on/ })).toBeVisible();
      await expect(card(page, STATUS_ID)).toHaveCount(0);
      await shoot(card(page, NOTE_ID), `06-inbox-open-note-${tag}.png`);
      // (Round 2) The pointer over the Inbox card's Proposed box shows its grey "edit".
      await proposedBox(page, NOTE_ID).hover();
      await expect.poll(() => opacityOf(editOf(page, NOTE_ID))).toBe('1');
      await shoot(card(page, NOTE_ID), `14-inbox-hover-box-${tag}.png`);
      await rest(page);
      await openEditor(page, NOTE_ID);
      await expect(card(page, NOTE_ID).getByRole('textbox', { name: `Proposed note for ${LABEL}` })).toBeFocused();
      await shoot(card(page, NOTE_ID), `11-inbox-edit-mode-${tag}.png`);
      // A click off the box puts it back as it was.
      await page.mouse.click(1, 1);
      await expect(card(page, NOTE_ID).getByRole('textbox')).toHaveCount(0);
      await expect(proposedBox(page, NOTE_ID)).toHaveAttribute('aria-label', 'Proposed');
      await page.getByRole('tab', { name: /Archived/ }).click();
      await expect(card(page, STATUS_ID).locator('[data-proposal-outcome]')).toHaveText('Approved: marked graded');
      await expect(card(page, DATE_ID).locator('[data-proposal-outcome]')).toHaveText('Stale: the row changed');
      for (const id of [STATUS_ID, DATE_ID]) {
        await expect(card(page, id).getByRole('link', { name: /Open the answer/ })).toHaveAttribute('href', ANSWER_HREF);
        await expect(card(page, id).locator('[data-proposal-value]')).toHaveCount(0);
      }
      await shoot(card(page, STATUS_ID), `07-inbox-approved-${tag}.png`);
      await shoot(card(page, DATE_ID), `08-inbox-stale-${tag}.png`);
      expect(fixture.decisions).toHaveLength(2);
    });
  }
}
