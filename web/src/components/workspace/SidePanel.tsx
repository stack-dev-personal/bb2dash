'use client';

/**
 * The Workspace's side panel (Phase 24b, task 10; brief 111, "The side panel",
 * frozen (f), D-I, D-J).
 *
 * A region named "Details" with three tabs, Sources, Files and Memory. The tab
 * is route state (`?panel=<tab>`, `route.ts`): picking a tab, the Hide panel
 * button and the Show panel button each navigate, so a fold survives a reload.
 * The tabs move with the arrows, Home and End (roving focus, `aria-selected`),
 * and the picked tab carries the page's one red mark of where he is, an
 * underline (D-I); nothing else here is red.
 *
 * WHERE IT SITS. At 1024 px and wider the screen docks it as the grid's third
 * track. Under that it is a sheet over the page from the right, through
 * `PopoutShell` (`SidePanelSheet`): the scrim, Esc and the sheet's Close each
 * fold it, which drops the parameter (D-J: one component owns every modal
 * surface on the page).
 *
 * The root carries `data-panel="<tab>"`. Each tab reads its own rows, once
 * hydrated.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { PopoutShell } from '@/components/popout/PopoutShell';
import type { AnswerBlock } from '@/lib/answer-format';
import { HIDE_PANEL_LABEL, PANEL_REGION_LABEL, PANEL_TABS } from '@/lib/workspace-labels';
import { FilesTab } from './FilesTab';
import { MemoryTab } from './MemoryTab';
import { SourcesTab } from './SourcesTab';
import { PANEL_TAB_ORDER, type PanelTab } from './route';
import styles from './SidePanel.module.css';

export interface SidePanelProps {
  /** The open tab. */
  tab: PanelTab;
  /** The request whose sources the Sources tab lists; null when no answer is picked. */
  sourcesRequestId: number | null;
  /** The row a chip opened the tab at (round 2, R2-5); null when the answer was picked as a whole. */
  sourcesOrd?: number | null;
  /** That answer's blocks, for the order of its rows (cited first). */
  sourcesBlocks: readonly AnswerBlock[];
  /** The clock, from the screen's `useNow`, for "updated" and "last indexed". */
  now: number;
  /** Pick a tab: the screen navigates to it. */
  onTab: (tab: PanelTab) => void;
  /** Fold the panel away: the screen drops the parameter. */
  onHide: () => void;
}

/** The tab an arrow, Home or End moves to from `current`; null for any other key. */
export function tabForKey(current: PanelTab, key: string): PanelTab | null {
  const index = PANEL_TAB_ORDER.indexOf(current);
  const last = PANEL_TAB_ORDER.length - 1;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return PANEL_TAB_ORDER[index === last ? 0 : index + 1];
    case 'ArrowLeft':
    case 'ArrowUp':
      return PANEL_TAB_ORDER[index === 0 ? last : index - 1];
    case 'Home':
      return PANEL_TAB_ORDER[0];
    case 'End':
      return PANEL_TAB_ORDER[last];
    default:
      return null;
  }
}

function Tabs(props: { tab: PanelTab; idOf: (tab: PanelTab) => string; panelId: string; onTab: (tab: PanelTab) => void }) {
  const buttons = useRef(new Map<PanelTab, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = tabForKey(props.tab, event.key);
    if (next === null) return;
    event.preventDefault();
    buttons.current.get(next)?.focus();
    props.onTab(next);
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={PANEL_REGION_LABEL} onKeyDown={onKeyDown}>
      {PANEL_TAB_ORDER.map((tab) => (
        <button
          key={tab}
          ref={(node) => {
            if (node === null) buttons.current.delete(tab);
            else buttons.current.set(tab, node);
          }}
          type="button"
          role="tab"
          id={props.idOf(tab)}
          className={styles.tab}
          aria-selected={tab === props.tab}
          aria-controls={props.panelId}
          tabIndex={tab === props.tab ? 0 : -1}
          onClick={() => props.onTab(tab)}
        >
          {PANEL_TABS[tab]}
        </button>
      ))}
    </div>
  );
}

function TabBody(props: SidePanelProps): ReactNode {
  switch (props.tab) {
    case 'sources':
      return (
        <SourcesTab
          requestId={props.sourcesRequestId}
          pickedOrd={props.sourcesOrd ?? null}
          blocks={props.sourcesBlocks}
          onMemory={() => props.onTab('memory')}
        />
      );
    case 'files':
      return <FilesTab now={props.now} />;
    case 'memory':
      return <MemoryTab now={props.now} />;
  }
}

export function SidePanel(props: SidePanelProps) {
  const base = useId();
  const idOf = (tab: PanelTab) => `${base}-tab-${tab}`;
  const panelId = `${base}-panel`;

  return (
    <section className={styles.panel} aria-label={PANEL_REGION_LABEL} data-panel={props.tab}>
      <div className={styles.head}>
        <Tabs tab={props.tab} idOf={idOf} panelId={panelId} onTab={props.onTab} />
        <button type="button" className={styles.hide} onClick={props.onHide}>
          {HIDE_PANEL_LABEL}
        </button>
      </div>
      <div className={styles.body} role="tabpanel" id={panelId} aria-labelledby={idOf(props.tab)}>
        <TabBody {...props} />
      </div>
    </section>
  );
}

/** The panel under 1024 px: a sheet from the right, closed by its Close, Esc or the scrim. */
export function SidePanelSheet(props: SidePanelProps) {
  return (
    <div className={styles.sheet}>
      <PopoutShell label={PANEL_REGION_LABEL} onClose={props.onHide}>
        <SidePanel {...props} />
      </PopoutShell>
    </div>
  );
}
