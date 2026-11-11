/**
 * What Phase 25b's acceptance tests share (`accept25.spec.ts`; the pack is `acceptance/25/` at the
 * root, brief 119, items D and E; the names are the frozen contract `119b_PHASE25B_contract.md`).
 * It stands beside `accept.lib.ts` and `accept24.lib.ts`, which it does not change, and like them
 * imports nothing from `src/`.
 *
 * Here, in this order: the owner's own calls (a read of a table or a view, and the decide call);
 * the planner row the run proposes on, picked by one rule the host's proof `target-before` applies
 * too; the proposal cards under an answer; and the planner's own Notes field, written through the
 * page as the owner writes it.
 *
 * THE RUN LEAVES THE PLANNER AS IT FOUND IT. It proposes on one field of one row only: the note of
 * the first assignment (by id) whose progress row is graded and holds no note. Steps 4 and 8 write
 * that note (an approval, then the planner's own field); step 9 clears it through the same field,
 * which stores no note again, and the host proves the row reads as it did before the run.
 *
 * Each page string a playbook gives is spelled in `accept25.spec.ts`, where the pack check reads it.
 */

import { expect, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';
import { openWithSession, type OwnerSession } from './accept24.lib';
import { SETTLE_MS, openSettled } from './walk21.lib';

export { openWithSession, type OwnerSession };

const HTTP_OK = 200;
/** The planner table the Notes field writes, by an upsert (POST) on its REST path. */
const PLANNER_PATH = '/rest/v1/assignment_progress';
/** The decide call both places make (206). */
const DECIDE_PATH = '/rest/v1/rpc/workspace_proposal_decide';
/** The proposals are read again when an answer finishes; a slow read is given this long before a reload. */
const CARDS_WAIT_MS = 45_000;
/** How long a save of the Notes field is given. */
const SAVE_WAIT_MS = 30_000;

/* ---------------------------------------------------------------------------
 * The owner's own calls, with the session the page itself uses
 * ------------------------------------------------------------------------ */

interface Reply {
  status: number;
  text: string;
}

async function ownerFetch(page: Page, session: OwnerSession, method: 'GET' | 'POST', path: string, body?: string): Promise<Reply> {
  const headers: Record<string, string> = { apikey: session.apikey, authorization: session.authorization };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return page.evaluate(
    async ({ url, verb, sent, payload }) => {
      const response = await fetch(url, { method: verb, headers: sent, body: payload });
      return { status: response.status, text: await response.text() };
    },
    { url: `${session.origin}${path}`, verb: method, sent: headers, payload: body },
  );
}

/** A read of a table or a view through PostgREST, as the page makes one: the rows, or an error that names the read. */
async function readRows(page: Page, session: OwnerSession, path: string, what: string): Promise<Record<string, unknown>[]> {
  const reply = await ownerFetch(page, session, 'GET', path);
  if (reply.status !== HTTP_OK) throw new Error(`the read of ${what} answered ${reply.status}`);
  const rows: unknown = JSON.parse(reply.text);
  if (!Array.isArray(rows)) throw new Error(`the read of ${what} answered no list`);
  return rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row));
}

/** What the decide call answered: its status, and for a refusal the database's code and message. */
export interface DecideReply {
  status: number;
  code: string | null;
  message: string | null;
}

/** `workspace_proposal_decide(p_id, p_decision)`, called as the page calls it. A refusal is returned, not thrown. */
export async function decideDirect(page: Page, session: OwnerSession, id: number, decision: 'approve' | 'reject'): Promise<DecideReply> {
  const reply = await ownerFetch(page, session, 'POST', DECIDE_PATH, JSON.stringify({ p_id: id, p_decision: decision }));
  if (reply.status === HTTP_OK) return { status: reply.status, code: null, message: null };
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(reply.text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    // Not JSON: the code and the message stay null, and the caller's check says so.
  }
  const code = typeof parsed['code'] === 'string' ? parsed['code'] : null;
  const message = typeof parsed['message'] === 'string' ? parsed['message'] : null;
  return { status: reply.status, code, message };
}

/* ---------------------------------------------------------------------------
 * The planner row the run proposes on
 * ------------------------------------------------------------------------ */

/** One assignment: its id and its course, as the planner page's address needs them. */
export interface PlannerTarget {
  assignmentId: string;
  courseId: string;
}

/**
 * The run's row, by the rule the host's proof `target-before` applies at go-live: among the
 * assignment progress rows whose status is graded and that hold no note, the first by assignment
 * id. The note itself is never read. Null when no row fits the rule.
 */
export async function pickTarget(page: Page, session: OwnerSession): Promise<PlannerTarget | null> {
  const rows = await readRows(
    page,
    session,
    `${PLANNER_PATH}?select=assignment_id&status=eq.graded&notes=is.null&order=assignment_id.asc&limit=1`,
    'assignment_progress',
  );
  const assignmentId = rows[0]?.['assignment_id'];
  if (typeof assignmentId !== 'string' || assignmentId === '') return null;
  const owner = await readRows(page, session, `/rest/v1/assignments?select=course_id&id=eq.${encodeURIComponent(assignmentId)}`, 'assignments');
  const courseId = owner[0]?.['course_id'];
  if (typeof courseId !== 'string' || courseId === '') throw new Error('the assignment of the run has no course');
  return { assignmentId, courseId };
}

/** One proposal's ids, read from `v_workspace_proposals` (205): never its values or its reason. */
export interface ProposalIds {
  id: number;
  requestId: number;
  conversationId: string;
  rowId: string;
  courseId: string | null;
  effectiveState: string;
}

const PROPOSAL_ID_COLUMNS = 'id,request_id,conversation_id,row_id,course_id,effective_state';

function proposalIdsOf(row: Record<string, unknown>): ProposalIds {
  const { id, request_id: requestId, conversation_id: conversationId, row_id: rowId, course_id: courseId, effective_state: state } = row;
  if (typeof id !== 'number' || typeof requestId !== 'number' || typeof conversationId !== 'string' || typeof rowId !== 'string' || typeof state !== 'string') {
    throw new Error('a row of v_workspace_proposals has no id, request, conversation, row or state');
  }
  return { id, requestId, conversationId, rowId, courseId: typeof courseId === 'string' ? courseId : null, effectiveState: state };
}

export async function proposalById(page: Page, session: OwnerSession, id: number): Promise<ProposalIds> {
  const rows = await readRows(page, session, `/rest/v1/v_workspace_proposals?select=${PROPOSAL_ID_COLUMNS}&id=eq.${id}`, 'v_workspace_proposals');
  if (rows.length !== 1) throw new Error(`proposal ${id} is not one row of v_workspace_proposals (${rows.length})`);
  return proposalIdsOf(rows[0] as Record<string, unknown>);
}

/** The proposals of one conversation that are still open (`effective_state` proposed). */
export async function openProposalsOf(page: Page, session: OwnerSession, conversation: string): Promise<ProposalIds[]> {
  const path = `/rest/v1/v_workspace_proposals?select=${PROPOSAL_ID_COLUMNS}&conversation_id=eq.${conversation}&effective_state=eq.proposed&order=id.asc`;
  return (await readRows(page, session, path, 'v_workspace_proposals')).map(proposalIdsOf);
}

/** The target of a proposal: its row and that row's course, for the planner page. */
export function targetOfProposal(proposal: ProposalIds): PlannerTarget {
  if (proposal.courseId === null) throw new Error(`proposal ${proposal.id} names no course`);
  return { assignmentId: proposal.rowId, courseId: proposal.courseId };
}

/* ---------------------------------------------------------------------------
 * The proposal cards
 * ------------------------------------------------------------------------ */

/** One proposal's card, wherever it stands on the page. */
export function proposalCard(page: Page, id: number): Locator {
  return page.locator(`[data-proposal="${id}"]`);
}

/** The cards under one answer. */
export function cardsOfTurn(turn: Locator): Locator {
  return turn.locator('[data-proposal]');
}

/**
 * Waits for the cards under a finished answer. The page reads the proposals again when an answer
 * finishes; when none shows within the wait, the conversation is opened once more and read again.
 * Returns the count the page shows at the end.
 */
export async function waitForCards(page: Page, turn: Locator, conversationPath: string): Promise<number> {
  try {
    await expect(cardsOfTurn(turn).first()).toBeVisible({ timeout: CARDS_WAIT_MS });
  } catch {
    await openSettled(page, conversationPath);
    await cardsOfTurn(turn).first().waitFor({ state: 'visible', timeout: CARDS_WAIT_MS }).catch(() => undefined);
  }
  return cardsOfTurn(turn).count();
}

/** The proposal id a card carries. */
export async function proposalIdOf(card: Locator): Promise<number> {
  const id = await card.getAttribute('data-proposal');
  if (id === null || !/^\d+$/.test(id)) throw new Error('the card carries no proposal id');
  return Number(id);
}

/**
 * What one card shows, as facts: its state, how many values it draws, its outcome and its buttons.
 * The card is waited for first, since the page draws it once its proposal row is read: a reading
 * taken before that would be a false fact. A card that never shows is noted as not present.
 */
export async function cardFacts(card: Locator): Promise<Record<string, unknown>> {
  const shown = await card
    .waitFor({ state: 'visible', timeout: CARDS_WAIT_MS })
    .then(() => true)
    .catch(() => false);
  if (!shown) return { present: false };
  const outcome = card.locator('[data-proposal-outcome]');
  return {
    present: true,
    state: await card.getAttribute('data-proposal-state'),
    values_drawn: await card.locator('[data-proposal-value]').count(),
    outcome: (await outcome.count()) === 0 ? null : ((await outcome.first().textContent()) ?? '').trim(),
    buttons: await card.getByRole('button').count(),
    // Each button's own text, so a count can be read: an open card has W-106's grey `edit` beside
    // Approve and Reject (it shows on hover and focus, so a picture may not hold it).
    button_words: (await card.getByRole('button').allTextContents()).map((text) => text.trim()),
  };
}

/**
 * The Inbox tab that is picked, by the start of its text (a tab's text may end in a count). The
 * pictures of a card far down a tab cannot hold the tab row too, so the tab is read as a fact.
 */
export async function pickedInboxTab(page: Page): Promise<string | null> {
  const picked = page.getByRole('tab', { selected: true });
  if ((await picked.count()) !== 1) return null;
  return ((await picked.first().textContent()) ?? '').trim();
}

/** Presses a card's own button (Approve or Reject: its name starts with the word) and waits for the decide call's answer. */
export async function pressOnCard(page: Page, card: Locator, word: string): Promise<number> {
  const answered = page.waitForResponse((response: Response) => new URL(response.url()).pathname === DECIDE_PATH && response.request().method() === 'POST');
  await card.getByRole('button', { name: new RegExp(`^${word}: `) }).click();
  return (await answered).status();
}

/** The Inbox, on one of its tabs (the tab's name is its label and its count). */
export async function openInboxTab(page: Page, label: string): Promise<void> {
  await openSettled(page, '/inbox');
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();
  await page.waitForTimeout(SETTLE_MS);
}

/* ---------------------------------------------------------------------------
 * The planner's own Notes field
 * ------------------------------------------------------------------------ */

/** The address of an assignment's full-details page under its course (`src/lib/assignment-page.ts`, copied). */
export function assignmentPagePath(target: PlannerTarget): string {
  const course = encodeURIComponent(target.courseId);
  const id = target.assignmentId.split('/').map(encodeURIComponent).join('/');
  return `/course/${course}/assignment/${id}`;
}

const isPlannerWrite = (url: URL): boolean => url.pathname === PLANNER_PATH;

/**
 * Lets the planner's own save through, and nothing else: a POST of `assignment_progress`, the
 * upsert the Notes field sends on blur. Registered after the write guard, so it is asked first;
 * every other write still reaches the guard and fails the test. Returns the writes it let through.
 */
export async function allowPlannerWrite(context: BrowserContext): Promise<string[]> {
  const allowed: string[] = [];
  await context.route(isPlannerWrite, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    allowed.push(`${request.method()} ${new URL(request.url()).pathname}`);
    await route.continue();
  });
  return allowed;
}

/**
 * The Notes field of the assignment page's plan block: the text area inside the label whose text
 * starts with the field's name. Found by its label element rather than its accessible name, which
 * an engine may build with the field's own text in it.
 */
export function notesField(page: Page, label: string): Locator {
  return page
    .locator('label:has(textarea)')
    .filter({ hasText: new RegExp(`^\\s*${label}`) })
    .locator('textarea');
}

/** What the planner's field shows now: whether it is empty, and how many characters it holds (never its text). */
export async function notesShown(field: Locator): Promise<{ empty: boolean; chars: number }> {
  const value = await field.inputValue();
  return { empty: value.trim() === '', chars: Array.from(value).length };
}

/**
 * Opens the assignment's page and writes its Notes field as the owner does: types (or clears) and
 * leaves the field, which saves. Returns the save's HTTP status, or null when the field already
 * held exactly this text and nothing was sent.
 */
export async function writeNotes(page: Page, target: PlannerTarget, label: string, text: string): Promise<number | null> {
  await openSettled(page, assignmentPagePath(target));
  const field = notesField(page, label);
  await expect(field, 'the plan block has one Notes field').toHaveCount(1);
  await expect(field, 'the Notes field is ready once the plan is read').toBeEnabled({ timeout: SAVE_WAIT_MS });
  if ((await field.inputValue()) === text) return null;
  await field.fill(text);
  const saved = page.waitForResponse(
    (response: Response) => isPlannerWrite(new URL(response.url())) && response.request().method() === 'POST',
    { timeout: SAVE_WAIT_MS },
  );
  await field.blur();
  const status = (await saved).status();
  await expect(field, 'the field is enabled again once the save has landed').toBeEnabled({ timeout: SAVE_WAIT_MS });
  return status;
}
