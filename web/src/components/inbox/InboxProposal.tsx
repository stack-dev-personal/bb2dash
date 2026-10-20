'use client';

/**
 * An `assistant_proposal` Inbox item (Phase 25b, E; 119b, "The page"), drawn as the same card the
 * answer shows (`DecidableProposal`): open, the two values and Approve / Reject; decided, the
 * outcome and a link back to the answer (`/workspace?c=<conversation>`). The item is never given the
 * Inbox's own controls (an answer box, a "why" note, Save, Dismiss, Undo): it is answered only
 * through `workspace_proposal_decide`, which resolves the item itself.
 *
 * The card is drawn from the proposal row (`v_workspace_proposals`, read by the ids the items name).
 * While that row is read, when the read failed, or when no row came back, `InboxProposalSummary`
 * draws what the item alone knows: its question, its outcome once decided, the way back to the
 * answer, and no button.
 */

import Link from 'next/link';
import { useId } from 'react';
import tokens from '@/styles/tokens.module.css';
import { conversationHref } from '@/components/workspace/route';
import { DecidableProposal } from '@/components/workspace/DecidableProposal';
import cardStyles from '@/components/workspace/ProposalCard.module.css';
import type { AttentionItem } from '@/lib/queries.sync';
import {
  OPEN_ANSWER_LABEL,
  PROPOSAL_KICKER,
  PROPOSAL_LOADING_LINE,
  PROPOSAL_MISSING_LINE,
  conversationOfItem,
  itemOutcomeLine,
  proposalsProblemLine,
  type WorkspaceProposal,
} from '@/lib/workspace-proposals';

/** The answer a proposal came from, or null when the item does not name its conversation. */
function answerHrefOf(conversationId: string | null): string | null {
  return conversationId === null ? null : conversationHref(conversationId);
}

export interface InboxProposalSummaryProps {
  item: AttentionItem;
  /** One plain line about the proposal row: loading, gone; null for none. */
  line?: string | null;
  /** The proposals could not be read: said as an alert. */
  problem?: string | null;
}

/** The item without its proposal row: what the item alone knows, and no button. */
export function InboxProposalSummary({ item, line = null, problem = null }: InboxProposalSummaryProps) {
  const titleId = useId();
  const outcome = itemOutcomeLine(item);
  const href = item.state === 'open' ? null : answerHrefOf(conversationOfItem(item));
  return (
    <article
      className={`${cardStyles.card} ${cardStyles.inbox}`}
      aria-labelledby={titleId}
      data-kind={item.kind}
      data-inbox-card=""
      tabIndex={0}
    >
      <span className={tokens.kicker}>{PROPOSAL_KICKER}</span>
      <p id={titleId} className={cardStyles.line}>
        {item.question}
      </p>
      {line !== null && <p className={tokens.muted}>{line}</p>}
      {outcome !== null && (
        <p className={cardStyles.outcome} data-proposal-outcome>
          {outcome}
        </p>
      )}
      {href !== null && (
        <Link href={href} className={cardStyles.link}>
          {OPEN_ANSWER_LABEL}
        </Link>
      )}
      {problem !== null && (
        <p className={cardStyles.problem} role="alert">
          {problem}
        </p>
      )}
    </article>
  );
}

export interface InboxProposalCardProps {
  item: AttentionItem;
  /** The proposal row the item names; undefined while not read, or when none came back. */
  proposal: WorkspaceProposal | undefined;
  loading: boolean;
  error: unknown;
}

export function InboxProposalCard({ item, proposal, loading, error }: InboxProposalCardProps) {
  if (proposal !== undefined) {
    return (
      <DecidableProposal proposal={proposal} answerHref={answerHrefOf(proposal.conversation_id)} inbox />
    );
  }
  if (error) return <InboxProposalSummary item={item} problem={proposalsProblemLine(error)} />;
  return <InboxProposalSummary item={item} line={loading ? PROPOSAL_LOADING_LINE : PROPOSAL_MISSING_LINE} />;
}
