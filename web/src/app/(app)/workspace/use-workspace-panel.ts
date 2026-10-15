'use client';

/**
 * The Workspace's side panel, as the screen holds it (Phase 24b, task 10;
 * split out of `Workspace.tsx` in round 2).
 *
 * ITS TAB is route state (`?panel=<tab>`); its answer is page state: a chip or
 * a sources row picks it (a chip with its row, round 2, R2-5), and with nothing
 * picked the Sources tab lists the newest answer whose turn row is known (PM
 * default R-2). The pick goes when the conversation changes.
 *
 * WHERE IT SITS is decided by the content pane's width, not the window's
 * (round 2, W-3; D-F ruled by the PM): the panel docks as the grid's third
 * track when the shell's pane (`main`) is at least 1024 px wide, and is a sheet
 * otherwise, so with the course rail open a 1280 px window gives a sheet and
 * a 1440 px one docks. The pane is measured by script (a `ResizeObserver`),
 * since the audit's frozen list allows no container query. Until it is measured
 * (the server's render, hydration, a browser with no `ResizeObserver`) the panel
 * reads as docked, as the server drew it.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { panelHref, type PanelTab } from '@/components/workspace/route';
import { answerBlocks, newestKnownRequestOf } from '@/components/workspace/thread';
import type { AnswerBlock } from '@/lib/answer-format';
import type { WorkspaceMessage } from '@/lib/queries.workspace';
import type { WorkspaceFormat } from '@/lib/queries.workspace-ask';
import type { WorkspaceTurn as WorkspaceTurnRow } from '@/lib/queries.workspace-sources';

/** The narrowest content pane the panel docks in: the shell's own drawer step (frozen (f)). */
export const PANEL_DOCK_MIN_WIDTH = 1024;

/** The tab Show panel opens on a first visit. */
const FIRST_TAB: PanelTab = 'sources';

const NO_BLOCKS: readonly AnswerBlock[] = [];

/** Whether the panel docks in a pane this wide; an unmeasured pane (null) reads as docked. */
export function panelDocks(paneWidth: number | null): boolean {
  return paneWidth === null || paneWidth >= PANEL_DOCK_MIN_WIDTH;
}

/** The content pane around `root`: the shell's `main`, else the root's parent. */
function paneOf(root: HTMLElement | null): HTMLElement | null {
  if (root === null) return null;
  return root.closest('main') ?? root.parentElement;
}

/** The pane's width, followed as it changes; null on the server and where nothing can measure it. */
export function usePaneWidth(root: HTMLElement | null): number | null {
  const pane = paneOf(root);
  const measurable = pane !== null && typeof ResizeObserver === 'function';
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (pane === null || typeof ResizeObserver !== 'function') return () => undefined;
      const observer = new ResizeObserver(onChange);
      observer.observe(pane);
      return () => observer.disconnect();
    },
    [pane],
  );
  return useSyncExternalStore(
    subscribe,
    () => (measurable && pane !== null ? pane.clientWidth : null),
    () => null,
  );
}

/** What the panel reads of the conversation. */
export interface PanelRows {
  messageRows: readonly WorkspaceMessage[];
  formats: ReadonlyMap<number, WorkspaceFormat>;
  turnRows: readonly WorkspaceTurnRow[] | undefined;
}

/** The blocks of one request's stored answer, for the Sources tab's cited order. */
function blocksOf(rows: PanelRows, requestId: number | null): readonly AnswerBlock[] {
  if (requestId === null) return NO_BLOCKS;
  const answer = rows.messageRows.find(
    (message) => message.role === 'assistant' && message.request_id === requestId && message.finished,
  );
  if (answer === undefined) return NO_BLOCKS;
  return answerBlocks(answer.content, rows.formats.get(requestId) ?? 'plain');
}

interface Picked {
  conversationId: string | null;
  requestId: number;
  /** The chip's row (round 2, R2-5); null for a sources row, which picks the answer alone. */
  ord: number | null;
}

export function usePanel(conversationId: string | null, tab: PanelTab | null, rows: PanelRows) {
  const router = useRouter();
  const [lastTab, setLastTab] = useState<PanelTab>(FIRST_TAB);
  const [picked, setPicked] = useState<Picked | null>(null);
  const go = (next: PanelTab | null) => {
    if (next !== null) setLastTab(next);
    router.replace(panelHref(conversationId, next), { scroll: false });
  };
  const ours = picked !== null && picked.conversationId === conversationId ? picked : null;
  const requestId = ours !== null ? ours.requestId : newestKnownRequestOf(rows.turnRows);

  return {
    tab,
    requestId,
    ord: ours?.ord ?? null,
    blocks: tab === 'sources' ? blocksOf(rows, requestId) : NO_BLOCKS,
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

export type Panel = ReturnType<typeof usePanel>;
