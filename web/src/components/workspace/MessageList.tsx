'use client';

/**
 * The message column (Phase 21, task 16; Phase 24b, task 9).
 *
 * One turn per question: the question, then what is known of its answer. The
 * turns come from `buildTurns()` in `thread.ts`, which decides the state, the
 * text, the format, the turn row and the lines; this file lays them out.
 *
 * AN ANSWER IS FORMATTED BY `AnswerBody.tsx` from the blocks of its text in
 * its request's format (`answerBlocks`): `rich` is parsed, `plain` and a
 * request with no options row are paragraphs of text. Its leaves are text
 * nodes; there is no raw-HTML sink here or there. A question is shown as the
 * reader typed it.
 *
 * UNDER A FINISHED ANSWER (PM default R-6: its source rows are read once the
 * turn is done, failed or stopped): the sources row, "3 sources", a button that
 * opens the panel's Sources tab at that answer, absent when it has none; then
 * the fixed line `thread.ts` gives (R-1), then the state's own line. The tool
 * names an answer used are no longer printed: the Sources tab holds them.
 *
 * NEVER SHOWN: a tool's result, the stored `query`, a cost, a timing or a
 * similarity (the query layer does not read them).
 *
 * WITH NO TURN TO SHOW the column says which of two states it is in
 * (`emptyColumnOf()`; the PM's ruling U1, less its `start`, which is the lobby
 * now). The not-found line is an alert and has the "New conversation" link
 * beside it, the way back to the lobby.
 *
 * Each turn carries what it is as data attributes, for a walk or a spec:
 * `data-turn` (queued, streaming, done, failed, stopped), `data-request-id` and
 * `data-retrieval` (the turn row's state, once it is known); inside it
 * `data-tier`, `data-answer-text`, `data-sources`, `data-source-ref` on a chip,
 * and `data-turn-line`. The empty column carries `data-column-empty` (loading,
 * missing).
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useWorkspaceSources } from '@/lib/queries.workspace-sources';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import {
  ANSWER_ROLE_LABEL,
  COLUMN_LOADING_LINE,
  COLUMN_NOT_FOUND_LINE,
  MESSAGES_REGION_LABEL,
  NEW_CONVERSATION_LABEL,
  QUESTION_ROLE_LABEL,
  STATUS_ROLE_LABEL,
  sourcesCountLine,
  sourcesProblemLine,
} from '@/lib/workspace-labels';
import { AnswerBody } from './AnswerBody';
import { TierBadge } from './TierBadge';
import { conversationHref } from './route';
import { answerBlocks, type EmptyColumn, type TurnState, type WorkspaceTurn } from './thread';
import styles from './MessageList.module.css';

/** How close to its end, in pixels, the column must be scrolled to keep following an answer. */
const FOLLOW_SLACK_PX = 96;

/** The content height before the column has been looked at: no real height is negative. */
const NOT_MEASURED = -1;

/** The one line of each empty state. */
const EMPTY_LINES: Readonly<Record<EmptyColumn, string>> = {
  loading: COLUMN_LOADING_LINE,
  missing: COLUMN_NOT_FOUND_LINE,
};

/** The states in which an answer is finished, and its source rows are read (R-6). */
const FINISHED_STATES: ReadonlySet<TurnState> = new Set(['done', 'failed', 'stopped']);

/** No source rows: a stable empty list, so a render with none changes nothing. */
const NO_SOURCES: never[] = [];

/**
 * Keeps the end of the column in view while the reader is at it.
 *
 * WHAT IS FOLLOWED is the height of the column's content, read after every
 * commit, and not a list of the things that can make it taller. The list was
 * the fault (the PM's walk of 2026-10-07, W-2): a line or a badge that arrives
 * with a row changes no character of the text, so it moved nothing, and a
 * long answer ended with its last line under the visible part of the column.
 *
 * WHO IS FOLLOWING is as it was: a reader within `FOLLOW_SLACK_PX` of the end
 * at their last scroll. Scrolling up lets go of it, and a commit that leaves
 * the height as it was moves no one.
 *
 * ASKING BRINGS THE READER BACK (the third review's R3-5; the PM's ruling of
 * 2026-10-07). `ownQuestion` is the id of the question this page sent, once it
 * is a turn of the column. The first commit that has it takes the column to
 * its end from wherever it was scrolled to, and the reader follows from there.
 * It happens once a question, so scrolling up during the answer lets go as
 * before. A turn the reader did not ask moves no one who has scrolled up.
 */
function useFollowTheEnd(ownQuestion: string | null) {
  const box = useRef<HTMLDivElement>(null);
  /** Whether the reader is at the end of the column. Scrolling up lets go of it. */
  const following = useRef(true);
  /** The height of the column's content at the last commit that changed it. */
  const contentHeight = useRef(NOT_MEASURED);
  /** The question of the reader's own that the column last went to its end for. */
  const broughtBackFor = useRef<string | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const asked = ownQuestion !== null && ownQuestion !== broughtBackFor.current;
    if (asked) {
      broughtBackFor.current = ownQuestion;
      following.current = true;
    }
    // The reader's own question moves the column even when this commit made it no taller:
    // the rows can bring the turn a commit before the page learns the question is its own.
    if (!asked && element.scrollHeight === contentHeight.current) return;
    contentHeight.current = element.scrollHeight;
    if (following.current) element.scrollTop = element.scrollHeight;
  });

  function noteScroll() {
    const element = box.current;
    if (element === null) return;
    const fromEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    following.current = fromEnd <= FOLLOW_SLACK_PX;
  }

  return { box, noteScroll };
}

/** The request whose source rows a turn reads: a finished turn's, else none. */
function finishedRequestOf(turn: WorkspaceTurn): number | null {
  if (turn.request === null || turn.state === null) return null;
  return FINISHED_STATES.has(turn.state) ? turn.request.id : null;
}

/** "3 sources", a button that opens the panel at this answer; nothing when it has none. */
function SourcesRow(props: { count: number; onOpen: () => void }) {
  if (props.count === 0) return null;
  return (
    <button type="button" className={styles.sources} data-sources onClick={props.onOpen}>
      {sourcesCountLine(props.count)}
    </button>
  );
}

interface AnswerProps {
  turn: WorkspaceTurn;
  onOpenSources: (requestId: number) => void;
}

function Answer({ turn, onOpenSources }: AnswerProps) {
  const requestId = finishedRequestOf(turn);
  const sources = useWorkspaceSources(requestId);
  const rows = requestId === null ? NO_SOURCES : (sources.data ?? NO_SOURCES);
  const tier = turn.answer?.tier ?? null;
  const lines = [turn.retrievalLine, turn.line].filter((line): line is string => line !== null);
  if (tier === null && turn.text === '' && lines.length === 0 && rows.length === 0) return null;
  // A line with no text beside it is a status, not an answer: a screen reader is not
  // told "The assistant answered" before "Waiting for the Workspace service".
  const statusOnly = turn.text === '' && lines.length > 0;
  const open = () => {
    if (requestId !== null) onOpenSources(requestId);
  };

  return (
    <div className={styles.answer}>
      <span className="sr-only">{statusOnly ? STATUS_ROLE_LABEL : ANSWER_ROLE_LABEL}</span>
      {tier !== null && <TierBadge tier={tier} />}
      {turn.text !== '' && (
        <AnswerBody
          blocks={answerBlocks(turn.text, turn.format)}
          sources={rows}
          onCite={open}
        />
      )}
      <SourcesRow count={rows.length} onOpen={open} />
      {requestId !== null && sources.error && (
        <p className={styles.line}>{sourcesProblemLine(workspaceErrorReason(sources.error))}</p>
      )}
      {lines.map((line) => (
        <p key={line} className={styles.line} data-turn-line>
          {line}
        </p>
      ))}
    </div>
  );
}

function Turns(props: { turns: readonly WorkspaceTurn[]; onOpenSources: (requestId: number) => void }) {
  return (
    <ol className={styles.turns} aria-label={MESSAGES_REGION_LABEL}>
      {props.turns.map((turn) => (
        <li
          key={turn.key}
          className={styles.turn}
          data-turn={turn.state ?? ''}
          data-request-id={turn.request?.id}
          data-retrieval={turn.retrieval ?? undefined}
        >
          {turn.question !== null && (
            <div className={styles.question}>
              <span className="sr-only">{QUESTION_ROLE_LABEL}</span>
              <p className={styles.text}>{turn.question.content}</p>
            </div>
          )}
          <Answer turn={turn} onOpenSources={props.onOpenSources} />
        </li>
      ))}
    </ol>
  );
}

/** The column with no turn to show: its one line, and for an id that was not found the way out. */
function EmptyLine({ state }: { state: EmptyColumn }) {
  const missing = state === 'missing';
  return (
    <div className={styles.empty} data-column-empty={state}>
      <p className={styles.line} role={missing ? 'alert' : undefined}>
        {EMPTY_LINES[state]}
      </p>
      {missing && (
        <Link href={conversationHref(null)} className={styles.emptyLink}>
          {NEW_CONVERSATION_LABEL}
        </Link>
      )}
    </div>
  );
}

export interface MessageListProps {
  turns: readonly WorkspaceTurn[];
  /** The state the column says it is in, in place of its turns; null shows the turns. */
  empty: EmptyColumn | null;
  /**
   * The id of the question this page last sent, as the ask answered with it; null or absent when it
   * has sent none. Its turn takes the column to its end (`useFollowTheEnd`).
   */
  askedQuestionId?: string | null;
  /** A chip or a sources row was pressed: open the panel's Sources tab at that request. */
  onOpenSources?: (requestId: number) => void;
}

const NOWHERE = (): void => undefined;

export function MessageList({ turns, empty, askedQuestionId = null, onOpenSources = NOWHERE }: MessageListProps) {
  // The reader's own question, from the commit in which it is one of the turns.
  const ownQuestion =
    askedQuestionId !== null && turns.some((turn) => turn.question?.id === askedQuestionId)
      ? askedQuestionId
      : null;
  const { box, noteScroll } = useFollowTheEnd(ownQuestion);

  return (
    <div ref={box} className={styles.column} onScroll={noteScroll}>
      {empty === null ? <Turns turns={turns} onOpenSources={onOpenSources} /> : <EmptyLine state={empty} />}
    </div>
  );
}
