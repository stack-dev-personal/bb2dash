'use client';

/**
 * One proposed planner change (Phase 25b, E; the frozen contract 119b, "The page"), as a view: no
 * query, no write. `DecidableProposal` gives it its decision; the Inbox gives it a way back to the
 * answer.
 *
 * OPEN (`effective_state = 'proposed'`): the line ("Mark *ECN 304 Problem Set 4* as submitted"),
 * the value read and the value proposed side by side (a note's old and new text, which keeps its
 * line breaks and scrolls inside its pane), the reason, and Approve / Reject. Each button's name
 * says the item ("Approve: mark ECN 304 Problem Set 4 as submitted"), and both are disabled while a
 * decision is in flight. The Proposed box has a grey "edit" on hover and focus (W-106,
 * `ProposedValue.tsx`): Stack's edit is a draft on this card, and Approve sends it.
 *
 * DECIDED: the item's name and the outcome, and nothing else (Stack, 2026-10-19): no old or new
 * value, no reason, no button. The Inbox adds "Open the answer →". When the decision was made on
 * this card, the focus moves to the outcome, so a keyboard user is not dropped when the buttons go.
 *
 * Every string is a text node: a label, a value and a reason come from the model or the planner
 * and are never parsed as markup.
 *
 * Data attributes for a walk or a spec: `data-proposal` (its id), `data-proposal-state` (the
 * effective state), `data-proposal-value` (old, new) and `data-proposal-outcome`.
 */

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import tokens from '@/styles/tokens.module.css';
import {
  ALREADY_DECIDED_LINE,
  APPROVE_WORD,
  OLD_VALUE_HEADING,
  OPEN_ANSWER_LABEL,
  PROPOSAL_KICKER,
  REASON_HEADING,
  REJECT_WORD,
  approveLabel,
  isOpenProposal,
  lineParts,
  outcomeLine,
  rejectLabel,
  valueWords,
  type ProposalDecision,
  type WorkspaceProposal,
} from '@/lib/workspace-proposals';
import styles from './ProposalCard.module.css';
import { ProposedValue } from './ProposedValue';

export interface ProposalCardProps {
  proposal: WorkspaceProposal;
  /** A decision is in flight: both buttons are disabled. */
  pending?: boolean;
  /** Why the last decision did not go through, in words; null when it did or none was made. */
  problem?: string | null;
  onDecide?: (decision: ProposalDecision) => void;
  /** Decided, in the Inbox: the answer the proposal came from. */
  answerHref?: string | null;
  /** The decision was made here: the outcome takes the focus once it shows. */
  focusOutcome?: boolean;
  /** Drawn as an Inbox item: on the page's ground, and one of the cards `j` / `k` move between. */
  inbox?: boolean;
  /** W-106: Stack's kept edit of the proposed value on this card, or null. */
  draft?: string | null;
  /** W-106: keep or drop the draft; without it the Proposed box is not editable. */
  onDraftChange?: (draft: string | null) => void;
}

/** The value read and the value proposed, side by side; the proposed one Stack may edit (W-106). */
function Values(props: {
  proposal: WorkspaceProposal;
  draft: string | null;
  onDraftChange?: (draft: string | null) => void;
  pending: boolean;
}) {
  const { proposal } = props;
  return (
    <div className={styles.panes}>
      <div role="group" aria-label={OLD_VALUE_HEADING} className={styles.pane} data-proposal-value="old">
        <span className={tokens.kicker}>{OLD_VALUE_HEADING}</span>
        <span className={styles.value}>{valueWords(proposal.field, proposal.old_value)}</span>
      </div>
      <ProposedValue proposal={proposal} draft={props.draft} onDraftChange={props.onDraftChange} disabled={props.pending} />
    </div>
  );
}

function Actions(props: { proposal: WorkspaceProposal; pending: boolean; onDecide?: (decision: ProposalDecision) => void }) {
  const { proposal, pending, onDecide } = props;
  const disabled = pending || onDecide === undefined;
  return (
    <div className={styles.actions} aria-busy={pending}>
      <button
        type="button"
        className={tokens.btnPrimary}
        aria-label={approveLabel(proposal)}
        disabled={disabled}
        onClick={() => onDecide?.('approve')}
      >
        {APPROVE_WORD}
      </button>
      <button
        type="button"
        className={tokens.btnSecondary}
        aria-label={rejectLabel(proposal)}
        disabled={disabled}
        onClick={() => onDecide?.('reject')}
      >
        {REJECT_WORD}
      </button>
    </div>
  );
}

function Outcome(props: { words: string; focus: boolean }) {
  const outcome = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (props.focus) outcome.current?.focus();
  }, [props.focus]);
  return (
    <p ref={outcome} className={styles.outcome} tabIndex={-1} data-proposal-outcome>
      {props.words}
    </p>
  );
}

export function ProposalCard(props: ProposalCardProps) {
  const { proposal, pending = false, problem = null, answerHref = null, focusOutcome = false, inbox = false } = props;
  const draft = props.draft ?? null;
  const titleId = useId();
  const open = isOpenProposal(proposal);
  const outcome = outcomeLine(proposal);
  // With a draft kept, the line and the buttons' names say the value Approve would write.
  const asApproved = draft === null ? proposal : { ...proposal, new_value: draft };
  const line = lineParts(asApproved);
  // Once the card shows where it stands, "already decided" has said all it had to.
  const shownProblem = !open && problem === ALREADY_DECIDED_LINE ? null : problem;

  return (
    <article
      className={inbox ? `${styles.card} ${styles.inbox}` : styles.card}
      aria-labelledby={titleId}
      data-proposal={proposal.id}
      data-proposal-state={proposal.effective_state}
      data-inbox-card={inbox ? '' : undefined}
      tabIndex={inbox ? 0 : undefined}
    >
      <span className={tokens.kicker}>{PROPOSAL_KICKER}</span>
      {open ? (
        <p id={titleId} className={styles.line}>
          {line.before}
          <em>{line.label}</em>
          {line.after}
        </p>
      ) : (
        <p id={titleId} className={styles.line}>
          {proposal.label}
        </p>
      )}

      {open && <Values proposal={proposal} draft={draft} onDraftChange={props.onDraftChange} pending={pending} />}
      {open && proposal.reason !== '' && (
        <p className={styles.reason}>
          <span className={tokens.kicker}>{REASON_HEADING}</span>
          <span>{proposal.reason}</span>
        </p>
      )}
      {open && <Actions proposal={asApproved} pending={pending} onDecide={props.onDecide} />}

      {outcome !== null && <Outcome words={outcome} focus={focusOutcome} />}
      {!open && answerHref !== null && (
        <Link href={answerHref} className={styles.link}>
          {OPEN_ANSWER_LABEL}
        </Link>
      )}

      {shownProblem !== null && (
        <p className={styles.problem} role="alert">
          {shownProblem}
        </p>
      )}
    </article>
  );
}
