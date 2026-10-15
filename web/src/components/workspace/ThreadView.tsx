'use client';

/**
 * The Workspace thread (Phase 21, task 16; moved out of `Workspace.tsx` and
 * rewritten for Phase 24b, task 9).
 *
 * THE FILE'S NAME. The brief names it `Thread.tsx`; beside the pure `thread.ts`
 * that name cannot be imported on a disk that ignores case (Windows, where this
 * app is built and tested): `@/components/workspace/Thread` resolves to
 * `thread.ts` first. So the component is `ThreadView.tsx` and exports `Thread`.
 *
 * One conversation: what went wrong above it, the message column, and docked
 * under it the composer and the service line. `Workspace.tsx` reads the rows
 * and holds the channel; this component is keyed by the conversation, so a
 * pressed Stop, an ask's failure and the question it sent belong to one
 * conversation and go with it.
 *
 * THE COMPOSER IS W-87's, rendered through `composer-contract.ts` (ruling C-1).
 * It owns its chips and its ask and words its refusals under the box. This
 * component hands it the request ids (to restore its chips), whether a request
 * is open, `busy` (a Stop on its way, and nothing else: amendment (h); the
 * composer adds its own pending ask) and `disabled` (the conversation was not
 * found). It hears back through `onAsked` (the question this page sent, which
 * takes the column to its end, R3-5), `onAskError` (a failure the composer
 * does not word: said above the column, and a 23503 is the not-found line),
 * `onStop` and `onEdit` (which clears that failure).
 *
 * STOP. The request is marked at the press, so the stopped sentence shows at
 * once. The stream is told (`markStopped`) only when `workspace_cancel`
 * answers true, so from then a later delta for it changes nothing on the page
 * (brief 111, "Stop"; round 2, R2-2b: the stream's mark cannot be taken back).
 * The mark on the turn comes off again if the database says the request had
 * already finished (false) or the cancel failed (it is still open), and the
 * answer the runner keeps writing still arrives. `busy` is the cancel's own
 * pending state, false the moment it settles, either way (amendment (h)).
 *
 * THE DOCK. The composer and the service line sit in a wrapper that is sticky
 * at the bottom of the pane on the pane's ground, so a long thread never pushes
 * them off screen (frozen (f), the phone).
 */

import { useState } from 'react';
import { Composer } from '@/components/workspace/Composer';
import {
  isMissingConversation,
  useCancelWorkspaceRequest,
  workspaceErrorReason,
  type WorkspaceMessage,
  type WorkspaceRequest,
} from '@/lib/queries.workspace';
import type { WorkspaceFormat } from '@/lib/queries.workspace-ask';
import type { WorkspaceTurn as WorkspaceTurnRow } from '@/lib/queries.workspace-sources';
import { askProblemLine, conversationProblemLine, stopProblemLine } from '@/lib/workspace-labels';
import { MessageList } from './MessageList';
import { ServiceStatus } from './ServiceStatus';
import { buildTurns, emptyColumnOf, type LiveStream } from './thread';
import styles from './ThreadView.module.css';

const NONE_STOPPED: ReadonlySet<number> = new Set();

/**
 * What went wrong, one line each, in the reason it came with. A refusal is the
 * composer's to word under the box, and an id that does not exist (23503) is
 * the column's not-found line: the database's sentence about the foreign key is
 * never shown.
 */
function problemLines(failed: { read: unknown; ask: unknown; stop: unknown }): string[] {
  const { read, ask, stop } = failed;
  const lines: string[] = [];
  if (read) lines.push(conversationProblemLine(workspaceErrorReason(read)));
  if (ask && !isMissingConversation(ask)) lines.push(askProblemLine(workspaceErrorReason(ask)));
  if (stop) lines.push(stopProblemLine(workspaceErrorReason(stop)));
  return lines;
}

/**
 * Stop. The request is marked the moment the button is pressed; the stream is
 * told once the cancel answers true, so nothing it sends for that request
 * moves the page any more. A cancel that fails or comes too late marks nothing.
 *
 * A Stop that failed is reported only while the request it was pressed on is
 * the open one (`openRequest`, as the rows have it): once that request has
 * finished there is nothing left to stop, and the next one never had Stop
 * pressed on it.
 */
function useStop(
  conversationId: string,
  openRequest: WorkspaceRequest | null,
  markStopped: (requestId: number) => void,
) {
  const [stopped, setStopped] = useState<ReadonlySet<number>>(NONE_STOPPED);
  const cancel = useCancelWorkspaceRequest(conversationId);
  const failedOnOpen = openRequest !== null && openRequest.id === cancel.variables;

  function stop(requestId: number) {
    const unmark = () => setStopped((ids) => new Set([...ids].filter((id) => id !== requestId)));
    setStopped((ids) => new Set([...ids, requestId]));
    cancel.mutate(requestId, {
      onSuccess: (changed) => {
        if (changed) markStopped(requestId);
        else unmark();
      },
      onError: unmark,
    });
  }

  return {
    stopped,
    stop,
    error: failedOnOpen ? cancel.error : null,
    pending: cancel.isPending,
  };
}

export interface ThreadProps {
  conversationId: string;
  requests: readonly WorkspaceRequest[];
  messages: readonly WorkspaceMessage[];
  /** The conversation's open request, as its rows have it. */
  openRequest: WorkspaceRequest | null;
  live: LiveStream | null;
  /** The stream's guard: after it, nothing the channel sends for that request changes the view. */
  markStopped: (requestId: number) => void;
  /** The conversation's `workspace_turns` rows; undefined while not read. */
  turnRows: readonly WorkspaceTurnRow[] | undefined;
  /** Each request's format, from its options row. */
  formats: ReadonlyMap<number, WorkspaceFormat>;
  /** Every read of the conversation has answered. */
  loaded: boolean;
  /** The conversation could not be read. */
  readError: unknown;
  now: number;
  /** A chip or a sources row was pressed: open the panel's Sources tab at that request. */
  onOpenSources: (requestId: number, ord: number | null) => void;
}

export function Thread(props: ThreadProps) {
  const { conversationId, requests, messages, live } = props;
  const [askError, setAskError] = useState<unknown>(null);
  const [askedQuestionId, setAskedQuestionId] = useState<string | null>(null);
  const stopper = useStop(conversationId, props.openRequest, props.markStopped);
  const { stopped, stop } = stopper;

  // Stop was pressed on it: it reads as stopped, and the button as Ask, before the row does.
  const openRequest =
    props.openRequest !== null && !stopped.has(props.openRequest.id) ? props.openRequest : null;
  const turns = buildTurns({
    messages,
    requests,
    live,
    stoppedRequestIds: stopped,
    turnRows: props.turnRows,
    formats: props.formats,
  });
  const empty = emptyColumnOf({
    loaded: props.loaded,
    readFailed: Boolean(props.readError),
    askedIntoMissing: isMissingConversation(askError),
    turns: turns.length,
  });
  const problems = problemLines({ read: props.readError, ask: askError, stop: stopper.error });

  return (
    <section className={styles.thread}>
      {problems.map((line) => (
        <p key={line} className={styles.problem} role="alert">
          {line}
        </p>
      ))}
      <MessageList
        turns={turns}
        empty={empty}
        askedQuestionId={askedQuestionId}
        onOpenSources={props.onOpenSources}
      />
      <div className={styles.dock} data-composer-dock>
        <Composer
          conversationId={conversationId}
          requestIds={requests.map((request) => request.id)}
          requestOpen={openRequest !== null}
          busy={stopper.pending}
          disabled={empty === 'missing'}
          onAsked={(result) => {
            setAskError(null);
            setAskedQuestionId(result.messageId);
          }}
          onAskError={setAskError}
          onStop={() => {
            if (openRequest !== null) stop(openRequest.id);
          }}
          onEdit={() => setAskError(null)}
        />
        <ServiceStatus now={props.now} />
      </div>
    </section>
  );
}
