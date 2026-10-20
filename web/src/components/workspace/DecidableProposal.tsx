'use client';

/**
 * A proposal card with its decision (Phase 25b, E; 119b), used in both places: under an answer
 * (`AnswerProposals`) and as an Inbox item (`InboxProposal.tsx`).
 *
 * Each card holds its own decision: a press calls `workspace_proposal_decide` through
 * `useDecideProposal`, which reads the proposals and the Inbox again on success and on a 55000. The
 * card itself is drawn from the row the page reads, never from the call's answer, so the place the
 * decision was not made in and this one say the same thing once both have read.
 *
 * W-106: the card also holds Stack's edit of the proposed value as a draft. Editing writes nothing;
 * Approve sends the draft as `p_value`, and Reject ignores it.
 */

import { useState } from 'react';
import { useDecideProposal } from '@/lib/queries.workspace-proposals';
import { decideProblemLine, isAlreadyDecided, progressTargetOf, type WorkspaceProposal } from '@/lib/workspace-proposals';
import { ProposalCard } from './ProposalCard';
import styles from './ProposalCard.module.css';

export interface DecidableProposalProps {
  proposal: WorkspaceProposal;
  /** Decided, in the Inbox: the answer the proposal came from. */
  answerHref?: string | null;
  inbox?: boolean;
}

export function DecidableProposal({ proposal, answerHref = null, inbox = false }: DecidableProposalProps) {
  const decide = useDecideProposal();
  const [decidedHere, setDecidedHere] = useState(false);
  // W-106: Stack's edit of the proposed value, this card's own (never shared with the other place).
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <ProposalCard
      proposal={proposal}
      pending={decide.isPending}
      problem={decide.error ? decideProblemLine(decide.error) : null}
      answerHref={answerHref}
      focusOutcome={decidedHere}
      inbox={inbox}
      draft={draft}
      onDraftChange={setDraft}
      onDecide={(decision) =>
        decide.mutate(
          {
            id: proposal.id,
            decision,
            // Approve sends the edit when there is one; Reject never does.
            value: decision === 'approve' && draft !== null ? draft : undefined,
            progress: progressTargetOf(proposal),
          },
          {
            onSuccess: () => setDecidedHere(true),
            onError: (error) => setDecidedHere(isAlreadyDecided(error)),
          },
        )
      }
    />
  );
}

/** The cards under one finished answer, one per proposal of its request; nothing when it made none. */
export function AnswerProposals({ proposals }: { proposals: readonly WorkspaceProposal[] }) {
  if (proposals.length === 0) return null;
  return (
    <ul className={styles.list} data-proposals>
      {proposals.map((proposal) => (
        <li key={proposal.id}>
          <DecidableProposal proposal={proposal} />
        </li>
      ))}
    </ul>
  );
}
