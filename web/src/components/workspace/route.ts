/**
 * bb2dash — the Workspace's route, spelled once (Phase 21, task 16; Phase 24b).
 *
 * The selected conversation is route state, like the popouts:
 * `/workspace?c=<conversation uuid>`. With no `?c=` the page shows the lobby,
 * and the first question creates the conversation.
 *
 * Phase 24b adds the side panel's tab, `?panel=sources|files|memory`: the panel
 * is open on that tab, and folded away with no parameter, so a fold survives a
 * reload (brief 111, "The side panel").
 */

/** The route. */
export const WORKSPACE_PATH = '/workspace';

/** The query-string key that names the selected conversation. */
export const CONVERSATION_PARAM = 'c';

/** The query-string key that names the side panel's open tab. */
export const PANEL_PARAM = 'panel';

/** The side panel's three tabs, in the order they are shown. */
export const PANEL_TAB_ORDER = ['sources', 'files', 'memory'] as const;
export type PanelTab = (typeof PANEL_TAB_ORDER)[number];

/** Where a conversation lives; `null` is the lobby. */
export function conversationHref(conversationId: string | null): string {
  return panelHref(conversationId, null);
}

/**
 * Where a conversation lives with the panel open on `tab`, or folded away when
 * `tab` is null. `?c=` is kept as given; the lobby's panel has no `?c=`.
 */
export function panelHref(conversationId: string | null, tab: PanelTab | null): string {
  const params = new URLSearchParams();
  if (conversationId !== null) params.set(CONVERSATION_PARAM, conversationId);
  if (tab !== null) params.set(PANEL_PARAM, tab);
  const query = params.toString();
  return query === '' ? WORKSPACE_PATH : `${WORKSPACE_PATH}?${query}`;
}

/** The tab a `?panel=` value names, or null for none or anything else (folded). */
export function parsePanelTab(value: string | null | undefined): PanelTab | null {
  return PANEL_TAB_ORDER.find((tab) => tab === value) ?? null;
}
