'use client';

/**
 * The Workspace screen (Phase 21, task 16; Phase 24b, tasks 9 to 11).
 *
 * The page lays itself out in the pane the shell gives it (frozen (f)): the
 * conversations rail, a column at a reading measure, and the side panel while
 * `?panel=<tab>` names one. At 1024 px and wider the panel is the grid's third
 * track; under that it is a sheet from the right; under 720 px the rail is a
 * sheet too, opened by one button at the top of the column (D-J). The column
 * starts with today's New York date and its weekday (amendment (g)) and holds
 * the lobby when no conversation is selected (`Lobby`, W-87's) or the thread
 * (`Thread.tsx`).
 *
 * WHERE AN ANSWER COMES FROM. Live, as Realtime Broadcast deltas on the page's
 * one private channel (`use-workspace-stream.ts`), and once more as the stored
 * row `workspace_finish()` writes. The stored row is the record. The page
 * learns that a stream has ended from the `done` broadcast and from a refetch
 * when the tab regains focus; whichever shows the request closed, the messages
 * are read once more (`useStoredRowOnClose`): a missed broadcast costs live
 * text, never the answer. Since Phase 24b the conversation's turn rows and
 * options rows are read beside them: the searching line, the fixed lines and
 * the format come from them (`thread.ts`).
 *
 * TWO PARTS. `Workspace` reads the rows and holds the channel, and stays
 * mounted from one conversation to the next so the old channel is left before
 * the next is joined (the lobby holds `workspace:lobby`). `Thread` is keyed by
 * the conversation.
 *
 * THE PANEL'S ANSWER. A chip or a sources row picks the answer the Sources tab
 * lists; the pick is page state and goes when the conversation changes. With
 * nothing picked the tab lists the newest answer whose turn row is known (PM
 * default R-2).
 *
 * HYDRATION. The rows come from a query cache that is restored from
 * localStorage before this boundary hydrates, and the server never has them.
 * So they are read only once `useHydrated()` is true; the first client render
 * is the server's, with the panel docked and no date line.
 *
 * The stream area carries what it is doing as data attributes, for a walk or a
 * spec to read: `data-topic`, `data-channel`, `data-channel-detail` and
 * `data-request-id` (the open request, when there is one).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { PopoutShell } from '@/components/popout/PopoutShell';
import { ConversationList } from '@/components/workspace/ConversationList';
import { Lobby } from '@/components/workspace/Lobby';
import { SidePanel, SidePanelSheet } from '@/components/workspace/SidePanel';
import { Thread } from '@/components/workspace/ThreadView';
import {
  CONVERSATION_PARAM,
  PANEL_PARAM,
  conversationHref,
  panelHref,
  parsePanelTab,
  type PanelTab,
} from '@/components/workspace/route';
import { answerBlocks, formatsOf, liveRequestOf, newestKnownRequestOf } from '@/components/workspace/thread';
import type { AnswerBlock } from '@/lib/answer-format';
import { courseToday } from '@/lib/course-dimension';
import {
  WORKSPACE_STATUS_REFETCH_MS,
  openRequestOf,
  parseConversationId,
  useWorkspaceMessages,
  useWorkspaceRequests,
  workspaceKeys,
  type WorkspaceMessage,
  type WorkspaceRequest,
} from '@/lib/queries.workspace';
import type { WorkspaceSource } from '@/lib/queries.workspace-sources';
import {
  useWorkspaceRequestOptions,
  type WorkspaceFormat,
  type WorkspaceRequestOptions,
} from '@/lib/queries.workspace-ask';
import { sourcesByRequest, useWorkspaceSourcesFor, useWorkspaceTurns } from '@/lib/queries.workspace-sources';
import { useHydrated } from '@/lib/use-hydrated';
import { useNow } from '@/lib/use-now';
import { useWorkspaceStream, type WorkspaceStreamView } from '@/lib/use-workspace-stream';
import { todayWords } from '@/lib/workspace-examples';
import { CONVERSATIONS_HEADING, SHOW_PANEL_LABEL, todayLine } from '@/lib/workspace-labels';
import styles from './Workspace.module.css';

const NO_REQUESTS: readonly WorkspaceRequest[] = [];
const NO_MESSAGES: readonly WorkspaceMessage[] = [];
const NO_OPTIONS: readonly WorkspaceRequestOptions[] = [];

/**
 * Rows of this conversation's requests only. The turn and options reads keep their previous rows while a new
 * id list is read (round 2, R2-2a), and a disabled read (the lobby, another conversation) can still hold the
 * last conversation's: those never reach this one.
 */
function ofRequests<T extends { request_id: number }>(rows: readonly T[] | undefined, requestIds: readonly number[]) {
  if (rows === undefined) return undefined;
  const known = new Set(requestIds);
  return rows.filter((row) => known.has(row.request_id));
}
const NO_BLOCKS: readonly AnswerBlock[] = [];
const NO_FORMATS: ReadonlyMap<number, WorkspaceFormat> = new Map();
const NO_SOURCE_ROWS: ReadonlyMap<number, readonly WorkspaceSource[]> = new Map();

/** The width under which the panel is a sheet: the shell's own drawer step (frozen (f)). */
const PANEL_SHEET_QUERY = '(max-width: 1023.98px)';

/** The tab Show panel opens on a first visit. */
const FIRST_TAB: PanelTab = 'sources';

/* ---------------------------------------------------------------------------
 * The rows of one conversation, and its channel
 * ------------------------------------------------------------------------ */

/**
 * A request that stops being the open one has its stored row: `workspace_finish()`
 * commits the request and the message together. So the messages are read once at
 * that moment, whatever told the page (the `done` broadcast, a poll, a refetch on
 * focus).
 */
function useStoredRowOnClose(conversationId: string | null, openRequestId: number | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (conversationId === null || openRequestId === null) return undefined;
    return () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.messages(conversationId) });
    };
  }, [conversationId, openRequestId, queryClient]);
}

/** Read the status again, once, each time `requestId` becomes a request (or another one). */
function useStatusRereadFor(requestId: number | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (requestId === null) return;
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.status() });
  }, [requestId, queryClient]);
}

/**
 * The offline line is said from a status row re-read every 30 s, so it is
 * re-read at once at the two moments the page learns the service is answering
 * (the PM's ruling U1): a request in view becomes `claimed`, and its first
 * delta arrives.
 */
function useStatusOnAnswer(
  openRequest: WorkspaceRequest | null,
  followed: WorkspaceRequest | null,
  stream: WorkspaceStreamView,
): void {
  useStatusRereadFor(openRequest?.state === 'claimed' ? openRequest.id : null);
  // The first delta: text from seq 1, or a stream joined late (its text is held back).
  const receiving = stream.text !== '' || stream.late;
  useStatusRereadFor(followed !== null && receiving ? followed.id : null);
}

/** Everything the screen reads about one conversation, once hydrated, and the stream it follows. */
function useConversation(conversationId: string | null, hydrated: boolean) {
  const requests = useWorkspaceRequests(conversationId);
  const requestRows = hydrated ? (requests.data ?? NO_REQUESTS) : NO_REQUESTS;
  const openRequest = openRequestOf(requestRows);
  // The messages poll is decided from the requests: one open, or one just closed and unstored.
  const messages = useWorkspaceMessages(conversationId, requestRows);
  useStoredRowOnClose(conversationId, openRequest?.id ?? null);
  const messageRows = hydrated ? (messages.data ?? NO_MESSAGES) : NO_MESSAGES;
  const requestIds = useMemo(() => requestRows.map((request) => request.id), [requestRows]);
  const turns = useWorkspaceTurns(conversationId, requestIds);
  const options = useWorkspaceRequestOptions(conversationId, requestIds);
  const turnRows = useMemo(() => ofRequests(turns.data, requestIds), [turns.data, requestIds]);
  const sources = useWorkspaceSourcesFor(conversationId, requestIds);
  const sourceRows = useMemo(
    () => sourcesByRequest(ofRequests(sources.data, requestIds)),
    [sources.data, requestIds],
  );
  const formats = useMemo(
    () => formatsOf(ofRequests(options.data, requestIds) ?? NO_OPTIONS),
    [options.data, requestIds],
  );

  // The newest request is followed until its stored answer has landed.
  const followed = liveRequestOf(requestRows, messageRows);
  const stream = useWorkspaceStream(conversationId, followed?.id ?? null);
  useStatusOnAnswer(openRequest, followed, stream);
  const live =
    followed === null
      ? null
      : { requestId: followed.id, text: stream.text, late: stream.late, searched: stream.sources !== null };

  return {
    requestRows,
    messageRows,
    openRequest,
    stream,
    live,
    turnRows: hydrated ? turnRows : undefined,
    sources: hydrated ? sourceRows : NO_SOURCE_ROWS,
    sourcesError: hydrated ? sources.error : null,
    formats: hydrated ? formats : NO_FORMATS,
    // Until both have answered, an id with no rows is still being read, not "not found".
    loaded: hydrated && requests.data !== undefined && messages.data !== undefined,
    // The options rows' failure is the composer's to say, under the box (round 2, R2-4): not said twice.
    readError: hydrated ? (requests.error ?? messages.error ?? turns.error) : null,
  };
}

type Conversation = ReturnType<typeof useConversation>;

/* ---------------------------------------------------------------------------
 * The panel: its tab is route state, its answer page state
 * ------------------------------------------------------------------------ */

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(PANEL_SHEET_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the pane is under the panel's step. The server, and a window with no `matchMedia`, read as wide. */
function usePanelIsSheet(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => typeof window.matchMedia === 'function' && window.matchMedia(PANEL_SHEET_QUERY).matches,
    () => false,
  );
}

/** The blocks of one request's stored answer, for the Sources tab's cited order. */
function blocksOf(conversation: Conversation, requestId: number | null): readonly AnswerBlock[] {
  if (requestId === null) return NO_BLOCKS;
  const answer = conversation.messageRows.find(
    (message) => message.role === 'assistant' && message.request_id === requestId && message.finished,
  );
  if (answer === undefined) return NO_BLOCKS;
  return answerBlocks(answer.content, conversation.formats.get(requestId) ?? 'plain');
}

function usePanel(conversationId: string | null, tab: PanelTab | null, conversation: Conversation) {
  const router = useRouter();
  const [lastTab, setLastTab] = useState<PanelTab>(FIRST_TAB);
  const [picked, setPicked] = useState<{
    conversationId: string | null;
    requestId: number;
    /** The chip's row (round 2, R2-5); null for a sources row, which picks the answer alone. */
    ord: number | null;
  } | null>(null);
  const go = (next: PanelTab | null) => {
    if (next !== null) setLastTab(next);
    router.replace(panelHref(conversationId, next), { scroll: false });
  };
  const ours = picked !== null && picked.conversationId === conversationId ? picked : null;
  const requestId = ours !== null ? ours.requestId : newestKnownRequestOf(conversation.turnRows);

  return {
    tab,
    requestId,
    ord: ours?.ord ?? null,
    blocks: tab === 'sources' ? blocksOf(conversation, requestId) : NO_BLOCKS,
    open: (next: PanelTab) => go(next),
    hide: () => {
      if (tab !== null) setLastTab(tab);
      go(null);
    },
    show: () => go(lastTab),
    openSources: (id: number, ord: number | null) => {
      setPicked({ conversationId, requestId: id, ord });
      go('sources');
    },
  };
}

type Panel = ReturnType<typeof usePanel>;

/* ---------------------------------------------------------------------------
 * The parts of the screen
 * ------------------------------------------------------------------------ */

/** The column's wrapper: what the channel is doing, as data attributes (see the header). */
function StreamArea(props: { stream: WorkspaceStreamView; openRequestId: number | undefined; children: ReactNode }) {
  const { stream } = props;
  return (
    <div
      className={styles.stream}
      data-workspace-stream
      data-topic={stream.topic}
      data-channel={stream.channel}
      data-channel-detail={stream.channelDetail ?? undefined}
      data-request-id={props.openRequestId}
    >
      {props.children}
    </div>
  );
}

/** "Today is Thursday, October 15, 2026.": the New York date, once hydrated (amendment (g)). */
function DateLine({ now, hydrated }: { now: number; hydrated: boolean }) {
  if (!hydrated) return <span className={styles.today} />;
  const today = courseToday(new Date(now));
  return (
    <p className={styles.today} data-today={today}>
      {todayLine(todayWords(today))}
    </p>
  );
}

/** The top of the column: the rail's button under 720 px, the date, and Show panel while it is folded. */
function ColumnBar(props: { now: number; hydrated: boolean; panel: Panel; onRail: () => void }) {
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.railButton} onClick={props.onRail}>
        {CONVERSATIONS_HEADING}
      </button>
      <DateLine now={props.now} hydrated={props.hydrated} />
      {props.panel.tab === null && (
        <button type="button" className={styles.showPanel} onClick={props.panel.show}>
          {SHOW_PANEL_LABEL}
        </button>
      )}
    </div>
  );
}

/** The thread of a selected conversation. */
function ThreadOf(props: { conversationId: string; conversation: Conversation; now: number; panel: Panel }) {
  const { conversation } = props;
  return (
    <Thread
      key={props.conversationId}
      conversationId={props.conversationId}
      requests={conversation.requestRows}
      messages={conversation.messageRows}
      openRequest={conversation.openRequest}
      live={conversation.live}
      markStopped={conversation.stream.markStopped}
      turnRows={conversation.turnRows}
      sources={conversation.sources}
      sourcesError={conversation.sourcesError}
      formats={conversation.formats}
      loaded={conversation.loaded}
      readError={conversation.readError}
      now={props.now}
      onOpenSources={props.panel.openSources}
    />
  );
}

function PanelOf(props: { panel: Panel; now: number; sheet: boolean }) {
  const { panel } = props;
  if (panel.tab === null) return null;
  const shared = {
    tab: panel.tab,
    sourcesRequestId: panel.requestId,
    sourcesOrd: panel.ord,
    sourcesBlocks: panel.blocks,
    now: props.now,
    onTab: panel.open,
    onHide: panel.hide,
  };
  if (props.sheet) return <SidePanelSheet {...shared} />;
  return (
    <aside className={styles.panelTrack}>
      <SidePanel {...shared} />
    </aside>
  );
}

export function Workspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = parseConversationId(searchParams.get(CONVERSATION_PARAM));
  const hydrated = useHydrated();
  const now = useNow(WORKSPACE_STATUS_REFETCH_MS);
  const conversation = useConversation(conversationId, hydrated);
  const panel = usePanel(conversationId, parsePanelTab(searchParams.get(PANEL_PARAM)), conversation);
  const sheet = usePanelIsSheet();
  // The rail's sheet belongs to the route it was opened on: a pick closes it.
  const route = searchParams.toString();
  const [railOpenOn, setRailOpenOn] = useState<string | null>(null);
  const openRequestId = conversation.stream.stopped ? undefined : conversation.openRequest?.id;
  const list = (
    <ConversationList
      selectedId={conversationId}
      now={now}
      onArchivedSelected={() => router.replace(conversationHref(null))}
    />
  );

  return (
    <>
      <div className={styles.workspace} data-panel-docked={panel.tab !== null && !sheet ? '' : undefined}>
        <div className={styles.rail}>{list}</div>
        <div className={styles.pageColumn}>
          <ColumnBar now={now} hydrated={hydrated} panel={panel} onRail={() => setRailOpenOn(route)} />
          <StreamArea stream={conversation.stream} openRequestId={openRequestId}>
            {conversationId === null ? (
              <Lobby now={now} onCreated={(id) => router.replace(conversationHref(id))} />
            ) : (
              <ThreadOf conversationId={conversationId} conversation={conversation} now={now} panel={panel} />
            )}
          </StreamArea>
        </div>
        {!sheet && <PanelOf panel={panel} now={now} sheet={false} />}
      </div>
      {sheet && <PanelOf panel={panel} now={now} sheet />}
      {railOpenOn === route && (
        <div className={styles.railSheet}>
          <PopoutShell label={CONVERSATIONS_HEADING} onClose={() => setRailOpenOn(null)}>
            {list}
          </PopoutShell>
        </div>
      )}
    </>
  );
}
