'use client';

/**
 * Whether the window is at the phone step (Phase 24b, brief 111, "Phone"; W-87).
 *
 * At 720 px and under, the routine list is a `PopoutShell` sheet rather than a
 * pop-down; the menus stay pop-downs. The step is the stylesheets' own (the
 * token audit allows 720 px). The server and the hydrating render read false,
 * so the first client render matches the server's; a window without
 * `matchMedia` (jsdom) is never a phone.
 */

import { useSyncExternalStore } from 'react';

const PHONE_QUERY = '(max-width: 720px)';

function phoneQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PHONE_QUERY)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const query = phoneQuery();
  if (query === null) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePhoneWidth(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => phoneQuery()?.matches ?? false,
    () => false,
  );
}
