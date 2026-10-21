/**
 * Phase 25b's acceptance tests: two Workspace runners (item D) and the planner changes the
 * assistant proposes (item E), on the live site (brief 119, "Definition of done"; the names are the
 * frozen contract `119b_PHASE25B_contract.md`; the pack is `acceptance/25/` at the root).
 *
 * THESE RUN ONLY INSIDE AN ACCEPTANCE RUN. Without `ACCEPT=1` every test here is skipped where it is
 * declared; with it, the one test whose exact title is `ACCEPT_ONLY` runs. The Claude operator in the
 * sandbox starts them one at a time, in the order they stand here, and reads what each leaves in
 * `ACCEPT_OUT` (`accept.lib.ts` says what that is). `accept25.lib.ts` holds what they share.
 *
 * Four sandbox stages run them, with the host's own steps around them (`acceptance/25/manifest.json`):
 *
 * * `two`: `2 two at once`, two questions from two conversations sent at the same moment.
 * * `decide`: `3` to `7`. One conversation; three of its questions each ask for one proposal on the
 *   same planner field (the note of one assignment). The first is approved on its card, the second
 *   rejected in the Inbox, a second decision on each is refused, and both decided cards draw no value.
 * * `stale`: `8`, the third proposal, made stale by an edit in the planner, then approved.
 * * `restore`: `9`, the note cleared through the planner's own field: the planner as the run found it.
 *
 * THE QUESTIONS. The page sends Auto, so the router (`workspace/src/router.ts`) picks the tier from
 * the words. Each question here opens with a word that is neither a lookup cue nor an execution verb
 * (`Explain`, `Propose`): the middle tier, which takes a planning turn. A test of the pack runs the
 * router over each. The three proposal questions name the run's assignment by its id, so their text
 * differs from run to run: each is `PROPOSE_HEAD`, the id, `PROPOSE_MIDDLE`, a word of `PROPOSAL_WORDS`
 * and `PROPOSE_TAIL`, and the host's proofs rebuild the same text from the proposal's own row id.
 *
 * EVERY CONVERSATION THE RUN OPENS IS ARCHIVED through the list's own button: step 2's two at its end,
 * and the proposals' one by step 8, the last step that asks into it. Each test records first and
 * asserts afterwards, so a step that fails still leaves what the page showed. An answer's text goes
 * into the step's facts file and is never printed; the planner's note is never read or written down.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { archiveAfter, requestIdOf } from './accept24.lib';
import {
  allowPlannerWrite,
  assignmentPagePath,
  cardFacts,
  cardsOfTurn,
  decideDirect,
  notesField,
  notesShown,
  openInboxTab,
  openProposalsOf,
  openWithSession,
  pickTarget,
  pickedInboxTab,
  pressOnCard,
  proposalById,
  proposalCard,
  proposalIdOf,
  targetOfProposal,
  waitForCards,
  writeNotes,
} from './accept25.lib';
import {
  acceptStep,
  askInto,
  conversationOfStep,
  expectShotsShowTheTurn,
  readTurn,
  registerAcceptHooks,
  shootTurn,
  turnFacts,
  turnOfRequest,
  waitClosed,
  type Recorder,
} from './accept.lib';
import { stepId } from './accept.env';
import {
  BADGE_MID,
  STORED_SETTLE_MS,
  conversationOf,
  conversationPath,
  lastTurn,
  openSettled,
  utcNow,
  workspaceReady,
} from './walk21.lib';

registerAcceptHooks();

/* ---------------------------------------------------------------------------
 * The questions (a test of the pack holds the proofs' md5s and templates to these)
 * ------------------------------------------------------------------------ */

/** Step 2: two questions sent at the same moment from two conversations; each long enough to overlap the other. */
const QUESTION_FIRST = 'Explain how the IST.323 syllabus describes the course project, in a few paragraphs';
const QUESTION_SECOND = 'Explain what the IST.352 slides say a systems analyst does, in a few paragraphs';

/** Steps 3, 5 and 8: one proposal each, on the note of the run's assignment. The proofs rebuild the same text. */
const PROPOSE_HEAD = 'Propose one planner change with your planner tool for the assignment ';
const PROPOSE_MIDDLE = ': set its notes to "Acceptance run 25 proposal ';
const PROPOSE_TAIL = '". Change nothing else.';
const PROPOSAL_WORDS = { first: 'one', second: 'two', third: 'three' } as const;
type ProposalWord = (typeof PROPOSAL_WORDS)[keyof typeof PROPOSAL_WORDS];

function proposeQuestion(assignmentId: string, word: ProposalWord): string {
  return `${PROPOSE_HEAD}${assignmentId}${PROPOSE_MIDDLE}${word}${PROPOSE_TAIL}`;
}

/** Step 8: what the planner's own field is set to before the third proposal is approved. Synthetic. */
const PLANNER_EDIT_TEXT = 'Acceptance run 25 edit made in the planner';

/* ---------------------------------------------------------------------------
 * The page's own strings (`src/lib/workspace-proposals.ts`, `src/components/inbox/inbox-tabs.ts`,
 * `AssignmentPlannerBlock.tsx`). Copied, not imported: a browser test imports nothing from `src/`.
 * The pack check holds every text the playbook gives as the page's own to this file.
 * ------------------------------------------------------------------------ */

const PROPOSAL_KICKER = 'Proposed planner change';
const OLD_VALUE_HEADING = 'Planner has';
const NEW_VALUE_HEADING = 'Proposed';
const NO_ENTRY_YET = 'no entry yet';
const APPROVE_WORD = 'Approve';
const REJECT_WORD = 'Reject';
/** W-106's grey text button in the Proposed box (`src/lib/proposal-draft.ts`, EDIT_WORD). */
const EDIT_WORD = 'edit';
const NOTE_LINE_START = 'Replace the note on ';
const OUTCOME_APPLIED = 'Approved: note replaced';
const OUTCOME_REJECTED = 'Rejected';
const OUTCOME_STALE = 'Stale: the row changed';
const OPEN_ANSWER_LABEL = 'Open the answer →';
const INBOX_NEEDS_YOU = 'Needs you';
const INBOX_ARCHIVED = 'Archived';
const NOTES_LABEL = 'Notes';

/** 206's refusal of a proposal that is no longer `proposed`. */
const ALREADY_DECIDED_CODE = '55000';
/** 208: PostgREST sends 206's refusal as 409 Conflict, not 500. */
const ALREADY_DECIDED_STATUS = 409;

/* ---------------------------------------------------------------------------
 * Steps shared by the stages
 * ------------------------------------------------------------------------ */

/** The step that opens the proposals' conversation and makes the first proposal. */
const FIRST_PROPOSAL_STEP = '3';
const SECOND_PROPOSAL_STEP = '5';

/** A proposal a step made: from this stage's facts, else from the carry-over. */
function proposalOfStep(step: string): number {
  return stepId({}, process.env['ACCEPT_OUT'] ?? null, process.env['ACCEPT_IN'], step, 'proposal_id');
}

interface Proposed {
  /** The answer's turn, found by its request id, so it is found again after the conversation is reopened. */
  turn: Locator;
  /** The first card under the answer (there should be exactly one). */
  card: Locator;
  /** How many cards stand under the answer. */
  cards: number;
}

/**
 * Asks one proposal question into a conversation (null starts one), waits for the stored answer and
 * its card, and records both. Nothing is asserted here: the step takes its pictures first, then
 * calls `expectProposed`.
 */
async function askForProposal(page: Page, rec: Recorder, conversation: string | null, question: string): Promise<Proposed> {
  const asked = await askInto(page, rec, conversation, question);
  const opened = conversationOf(page);
  const requestId = await requestIdOf(asked);
  rec.note({ closed_at: await waitClosed(asked) });
  await page.waitForTimeout(STORED_SETTLE_MS);
  rec.note(turnFacts(await readTurn(asked)));
  const turn = turnOfRequest(page, requestId);
  const cards = await waitForCards(page, turn, conversationPath(opened));
  const card = cardsOfTurn(turn).first();
  rec.note({ cards_under_answer: cards });
  if (cards > 0) rec.note({ proposal_id: await proposalIdOf(card), open_card: await cardFacts(card) });
  return { turn, card, cards };
}

/** Brings the card into the window when there is one, for the step's picture of it. */
async function showCard(proposed: Proposed): Promise<void> {
  if (proposed.cards > 0) await proposed.card.scrollIntoViewIfNeeded();
}

/** The answer is done on the middle tier, with one open card under it that draws both values. Returns its proposal id. */
async function expectProposed(proposed: Proposed): Promise<number> {
  await expect(proposed.turn).toHaveAttribute('data-turn', 'done');
  await expect(proposed.turn.locator('[data-tier]')).toHaveText(BADGE_MID);
  await expect(proposed.turn.locator('[data-turn-line]')).toHaveCount(0);
  expect(proposed.cards, 'one card stands under the answer: the question asked for one change').toBe(1);
  await expectOpenCard(proposed.card);
  return proposalIdOf(proposed.card);
}

/** An open card: its kicker, its line, the value read and the value proposed, both decisions and the edit. */
async function expectOpenCard(card: Locator): Promise<void> {
  await expect(card).toHaveAttribute('data-proposal-state', 'proposed');
  await expect(card.getByText(PROPOSAL_KICKER, { exact: true })).toBeVisible();
  await expect(card.locator('p').first()).toContainText(NOTE_LINE_START);
  await expect(card.locator('[data-proposal-value]'), 'an open card draws the value read and the value proposed').toHaveCount(2);
  await expect(card.locator('[data-proposal-value="old"]')).toContainText(OLD_VALUE_HEADING);
  await expect(card.locator('[data-proposal-value="new"]')).toContainText(NEW_VALUE_HEADING);
  await expect(card.getByRole('button', { name: new RegExp(`^${APPROVE_WORD}: `) })).toBeEnabled();
  await expect(card.getByRole('button', { name: new RegExp(`^${REJECT_WORD}: `) })).toBeEnabled();
  await expect(card.getByRole('button'), 'an open card has Approve, Reject and the edit (W-106)').toHaveCount(3);
  await expect(card.getByRole('button').filter({ hasText: new RegExp(`^${EDIT_WORD}$`) })).toHaveCount(1);
}

/** A decided card: its outcome, no value drawn and no button. */
async function expectDecidedCard(card: Locator, outcome: string): Promise<void> {
  await expect(card.locator('[data-proposal-outcome]')).toHaveText(outcome);
  await expect(card.locator('[data-proposal-value]'), 'a decided card draws no value').toHaveCount(0);
  await expect(card.getByRole('button'), 'a decided card has no button').toHaveCount(0);
}

/* ---------------------------------------------------------------------------
 * Stage `two`: two runners answer at once (item D)
 * ------------------------------------------------------------------------ */

// Step 2: two questions, each from a conversation of its own, sent at the same moment. Each is
// answered; the host reads that two runners took them and that their claims overlap. Both
// conversations are archived at the end.
acceptStep('2 two at once', { shots: ['first', 'second'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  const second = await context.newPage();
  await archiveAfter(page, context, rec, opened, async () => {
    for (const each of [page, second]) {
      await openSettled(each, '/workspace');
      await workspaceReady(each);
    }
    // Both questions are typed first; then both buttons are pressed together.
    await page.getByRole('textbox', { name: 'Question' }).fill(QUESTION_FIRST);
    await second.getByRole('textbox', { name: 'Question' }).fill(QUESTION_SECOND);
    const askedAt = utcNow();
    await Promise.all([
      page.getByRole('button', { name: 'Ask', exact: true }).click(),
      second.getByRole('button', { name: 'Ask', exact: true }).click(),
    ]);
    const turns: Locator[] = [];
    for (const each of [page, second]) {
      await expect(lastTurn(each)).toHaveAttribute('data-request-id', /^\d+$/);
      opened.push(conversationOf(each));
      turns.push(turnOfRequest(each, await requestIdOf(lastTurn(each))));
    }
    rec.note({
      asked_at: askedAt,
      first_request_id: await requestIdOf(turns[0] as Locator),
      second_request_id: await requestIdOf(turns[1] as Locator),
      first_conversation_id: opened[0],
      second_conversation_id: opened[1],
    });
    const closed = await Promise.all(turns.map((turn) => waitClosed(turn)));
    rec.note({ first_closed_at: closed[0], second_closed_at: closed[1] });
    await page.waitForTimeout(STORED_SETTLE_MS);
    const [first, other] = await Promise.all(turns.map((turn) => readTurn(turn)));
    rec.note({ ...turnFacts(first!), second_state: other!.state, second_badge: other!.badge, second_line: other!.line, second_answer_chars: Array.from(other!.answer).length, second_answer: other!.answer });
    await rec.shot(page, 'first');
    await rec.shot(second, 'second');
    for (const turn of turns) {
      await expect(turn).toHaveAttribute('data-turn', 'done');
      await expect(turn.locator('[data-tier]')).toHaveText(BADGE_MID);
      await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
      await expect(turn.locator('[data-turn-line]')).toHaveCount(0);
    }
    expect(opened[0], 'the two questions are in two conversations').not.toBe(opened[1]);
  });
  await second.close();
});

/* ---------------------------------------------------------------------------
 * Stage `decide`: the first two proposals (item E)
 * ------------------------------------------------------------------------ */

// Step 3: the first proposal. The test picks the run's assignment by the host's rule, asks for one
// change of its note, and the answer carries one open card that draws both values. The
// conversation stays open: steps 4 to 8 work in it, and step 8 archives it.
acceptStep('3 proposal card', { shots: ['start', 'end', 'card'] }, async ({ page }, rec) => {
  const session = await openWithSession(page);
  const target = await pickTarget(page, session);
  if (target === null) throw new Error('no assignment progress row is graded and holds no note: the run has no row to propose on');
  rec.note({ target_assignment: target.assignmentId, target_course: target.courseId });
  const question = proposeQuestion(target.assignmentId, PROPOSAL_WORDS.first);
  const proposed = await askForProposal(page, rec, null, question);
  const shots = await shootTurn(page, rec, proposed.turn, question);
  await expectShotsShowTheTurn(proposed.turn, question, shots);
  await showCard(proposed);
  await rec.shot(page, 'card');
  await expectProposed(proposed);
  // No note yet on the row: the value read is the planner's empty entry.
  await expect(proposed.card.locator('[data-proposal-value="old"]')).toContainText(NO_ENTRY_YET);
});

// Step 4: the first proposal approved on its card. The card then shows the outcome alone, and the
// Inbox's item, under Archived, shows the same outcome and a link back to the answer.
acceptStep('4 approve on the card', { shots: ['card', 'inbox'] }, async ({ page }, rec) => {
  const conversation = conversationOfStep(FIRST_PROPOSAL_STEP);
  const proposalId = proposalOfStep(FIRST_PROPOSAL_STEP);
  rec.note({ conversation_id: conversation, proposal_id: proposalId });
  await openSettled(page, conversationPath(conversation));
  await workspaceReady(page);
  const card = proposalCard(page, proposalId);
  await expect(card, 'the first proposal is open on the answer').toHaveAttribute('data-proposal-state', 'proposed');
  rec.note({ decide_status: await pressOnCard(page, card, APPROVE_WORD), decided_at: utcNow() });
  await expect(card.locator('[data-proposal-outcome]')).toHaveText(OUTCOME_APPLIED);
  rec.note({ card: await cardFacts(card) });
  await card.scrollIntoViewIfNeeded();
  await rec.shot(page, 'card');
  await expectDecidedCard(card, OUTCOME_APPLIED);

  await openInboxTab(page, INBOX_ARCHIVED);
  const item = proposalCard(page, proposalId);
  await expect(item, 'the decided item stands under Archived').toHaveCount(1);
  rec.note({ inbox_tab: await pickedInboxTab(page), inbox_card: await cardFacts(item) });
  await item.scrollIntoViewIfNeeded();
  await rec.shot(page, 'inbox');
  await expectDecidedCard(item, OUTCOME_APPLIED);
  await expect(item.getByRole('link', { name: OPEN_ANSWER_LABEL })).toHaveAttribute('href', conversationPath(conversation));
});

// Step 5: the second proposal, asked into the same conversation, rejected in the Inbox. Its card on
// the answer then shows the outcome alone.
acceptStep('5 reject in the inbox', { shots: ['open', 'inbox', 'card'] }, async ({ page }, rec) => {
  const conversation = conversationOfStep(FIRST_PROPOSAL_STEP);
  const first = await proposalById(page, await openWithSession(page), proposalOfStep(FIRST_PROPOSAL_STEP));
  const question = proposeQuestion(first.rowId, PROPOSAL_WORDS.second);
  const proposed = await askForProposal(page, rec, conversation, question);
  await showCard(proposed);
  await rec.shot(page, 'open');
  const proposalId = await expectProposed(proposed);

  await openInboxTab(page, INBOX_NEEDS_YOU);
  const item = proposalCard(page, proposalId);
  await expect(item, 'the open item stands under Needs you').toHaveCount(1);
  rec.note({ decide_status: await pressOnCard(page, item, REJECT_WORD), decided_at: utcNow() });
  await openInboxTab(page, INBOX_ARCHIVED);
  rec.note({ inbox_tab: await pickedInboxTab(page), inbox_card: await cardFacts(item) });
  await item.scrollIntoViewIfNeeded();
  await rec.shot(page, 'inbox');
  await expectDecidedCard(item, OUTCOME_REJECTED);

  await openSettled(page, conversationPath(conversation));
  await workspaceReady(page);
  const onAnswer = proposalCard(page, proposalId);
  rec.note({ card: await cardFacts(onAnswer) });
  await onAnswer.scrollIntoViewIfNeeded();
  await rec.shot(page, 'card');
  await expectDecidedCard(onAnswer, OUTCOME_REJECTED);
});

// Step 6: a second decision on each decided proposal is refused (409, code 55000), and the page still shows
// each as decided. The calls are the ones the cards make.
acceptStep('6 second decision refused', { shots: ['cards'] }, async ({ page }, rec) => {
  const conversation = conversationOfStep(FIRST_PROPOSAL_STEP);
  const firstId = proposalOfStep(FIRST_PROPOSAL_STEP);
  const secondId = proposalOfStep(SECOND_PROPOSAL_STEP);
  rec.note({ conversation_id: conversation, first_proposal_id: firstId, second_proposal_id: secondId });
  const session = await openWithSession(page);
  const onFirst = await decideDirect(page, session, firstId, 'reject');
  const onSecond = await decideDirect(page, session, secondId, 'approve');
  rec.note({
    first_refusal: { status: onFirst.status, code: onFirst.code, message: onFirst.message },
    second_refusal: { status: onSecond.status, code: onSecond.code, message: onSecond.message },
    refused_at: utcNow(),
  });
  await openSettled(page, conversationPath(conversation));
  await workspaceReady(page);
  const cards = [proposalCard(page, firstId), proposalCard(page, secondId)];
  rec.note({ first_card: await cardFacts(cards[0] as Locator), second_card: await cardFacts(cards[1] as Locator) });
  await (cards[1] as Locator).scrollIntoViewIfNeeded();
  await rec.shot(page, 'cards');
  expect(onFirst.status, 'the refusal is a 409 (208), not a 500').toBe(ALREADY_DECIDED_STATUS);
  expect(onFirst.code, 'a reject of the approved proposal is refused as already decided').toBe(ALREADY_DECIDED_CODE);
  expect(onFirst.message ?? '').toMatch(/already applied/);
  expect(onSecond.status, 'the refusal is a 409 (208), not a 500').toBe(ALREADY_DECIDED_STATUS);
  expect(onSecond.code, 'an approve of the rejected proposal is refused as already decided').toBe(ALREADY_DECIDED_CODE);
  expect(onSecond.message ?? '').toMatch(/already rejected/);
  await expectDecidedCard(cards[0] as Locator, OUTCOME_APPLIED);
  await expectDecidedCard(cards[1] as Locator, OUTCOME_REJECTED);
});

// Step 7: both decided cards draw no value, in both places: on the answer and in the Inbox. (An open
// card draws both values: steps 3, 5 and 8 show it.)
acceptStep('7 decided cards draw no value', { shots: ['workspace', 'inbox'] }, async ({ page }, rec) => {
  const conversation = conversationOfStep(FIRST_PROPOSAL_STEP);
  const decided = [
    { id: proposalOfStep(FIRST_PROPOSAL_STEP), outcome: OUTCOME_APPLIED },
    { id: proposalOfStep(SECOND_PROPOSAL_STEP), outcome: OUTCOME_REJECTED },
  ] as const;
  rec.note({ conversation_id: conversation, first_proposal_id: decided[0].id, second_proposal_id: decided[1].id });

  await openSettled(page, conversationPath(conversation));
  await workspaceReady(page);
  rec.note({ workspace_cards: [await cardFacts(proposalCard(page, decided[0].id)), await cardFacts(proposalCard(page, decided[1].id))] });
  await proposalCard(page, decided[1].id).scrollIntoViewIfNeeded();
  await rec.shot(page, 'workspace');
  for (const { id, outcome } of decided) await expectDecidedCard(proposalCard(page, id), outcome);

  await openInboxTab(page, INBOX_ARCHIVED);
  rec.note({ inbox_tab: await pickedInboxTab(page), inbox_cards: [await cardFacts(proposalCard(page, decided[0].id)), await cardFacts(proposalCard(page, decided[1].id))] });
  await proposalCard(page, decided[0].id).scrollIntoViewIfNeeded();
  await rec.shot(page, 'inbox');
  for (const { id, outcome } of decided) await expectDecidedCard(proposalCard(page, id), outcome);
});

/* ---------------------------------------------------------------------------
 * Stage `stale`: the third proposal, made stale in the planner (item E)
 * ------------------------------------------------------------------------ */

// Step 8: the third proposal, asked into the same conversation; the note is then changed in the
// planner's own field; an approval finds the row changed and writes nothing. The step archives the
// conversation, the last step that asks into it.
acceptStep('8 stale after a planner edit', { shots: ['open', 'planner', 'stale'] }, async ({ page, context }, rec) => {
  const conversation = conversationOfStep(FIRST_PROPOSAL_STEP);
  const opened: string[] = [conversation];
  await archiveAfter(page, context, rec, opened, async () => {
    const first = await proposalById(page, await openWithSession(page), proposalOfStep(FIRST_PROPOSAL_STEP));
    const target = targetOfProposal(first);
    const question = proposeQuestion(first.rowId, PROPOSAL_WORDS.third);
    const proposed = await askForProposal(page, rec, conversation, question);
    await showCard(proposed);
    await rec.shot(page, 'open');
    const proposalId = await expectProposed(proposed);

    const writes = await allowPlannerWrite(context);
    const status = await writeNotes(page, target, NOTES_LABEL, PLANNER_EDIT_TEXT);
    rec.note({ planner_write_status: status, planner_writes: writes.length, planner_edited_at: utcNow(), notes_after_edit: await notesShown(notesField(page, NOTES_LABEL)) });
    await rec.shot(page, 'planner');
    expect(status, 'the planner saved the edit').not.toBeNull();
    expect(writes, 'one planner write').toHaveLength(1);

    await openSettled(page, conversationPath(conversation));
    await workspaceReady(page);
    const onAnswer = proposalCard(page, proposalId);
    await expect(onAnswer, 'the third proposal is still open: nothing decided it').toHaveAttribute('data-proposal-state', 'proposed');
    rec.note({ decide_status: await pressOnCard(page, onAnswer, APPROVE_WORD), decided_at: utcNow() });
    await expect(onAnswer.locator('[data-proposal-outcome]')).toHaveText(OUTCOME_STALE);
    rec.note({ card: await cardFacts(onAnswer) });
    await onAnswer.scrollIntoViewIfNeeded();
    await rec.shot(page, 'stale');
    await expectDecidedCard(onAnswer, OUTCOME_STALE);
  });
});

/* ---------------------------------------------------------------------------
 * Stage `restore`: the planner as the run found it
 * ------------------------------------------------------------------------ */

// Step 9: the note is cleared through the planner's own field, as the owner clears one; the row then
// holds no note, as before the run. Any proposal of the run still open (only when an earlier step
// failed) is rejected first, so nothing of the run waits in the Inbox.
acceptStep('9 planner restored', { shots: ['planner'] }, async ({ page, context }, rec) => {
  const session = await openWithSession(page);
  const first = await proposalById(page, session, proposalOfStep(FIRST_PROPOSAL_STEP));
  const target = targetOfProposal(first);
  const leftOpen = await openProposalsOf(page, session, first.conversationId);
  const rejected: number[] = [];
  for (const proposal of leftOpen) rejected.push((await decideDirect(page, session, proposal.id, 'reject')).status);
  rec.note({ first_proposal_id: first.id, left_open_ids: leftOpen.map((proposal) => proposal.id), left_open_reject_statuses: rejected });

  const writes = await allowPlannerWrite(context);
  const status = await writeNotes(page, target, NOTES_LABEL, '');
  rec.note({ planner_write_status: status, planner_writes: writes.length, restored_at: utcNow() });
  // Read back from a fresh load of the page: the field shows what the database holds.
  await openSettled(page, assignmentPagePath(target));
  const field = notesField(page, NOTES_LABEL);
  await expect(field).toBeEnabled({ timeout: 30_000 });
  const shown = await notesShown(field);
  rec.note({ notes_after_reload: shown });
  await field.scrollIntoViewIfNeeded();
  await rec.shot(page, 'planner');
  expect(shown.empty, 'the Notes field is empty after a fresh load').toBe(true);
  expect(rejected.every((code) => code === 200), 'every proposal left open was rejected').toBe(true);
});

