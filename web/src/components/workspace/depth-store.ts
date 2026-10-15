'use client';

/**
 * The composer's depth for the life of the page (Phase 24b, Round 2, R2-1; W-87).
 *
 * Quick and Standard stay until he changes them; Deep applies to one question
 * and then reads Auto again (brief 111, "The composer"). The lobby and the
 * thread render different composers, so a depth held in the composer's own
 * state was lost on the hop from the lobby to the new conversation. It is held
 * here instead, in one module-level value read through `useSyncExternalStore`:
 * read on mount, written on each pick and by the Deep rule. No prop joins
 * `ComposerProps`. The server and the hydrating render read Auto.
 */

import { useSyncExternalStore } from 'react';
import { DEFAULT_ASK_OPTIONS, type WorkspaceDepth } from '@/lib/queries.workspace-ask';

let depth: WorkspaceDepth = DEFAULT_ASK_OPTIONS.depth;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setComposerDepth(next: WorkspaceDepth): void {
  if (next === depth) return;
  depth = next;
  for (const listener of listeners) listener();
}

/** The depth after an accepted question: Deep goes back to Auto, the others stay. */
export function depthAfterAsk(asked: WorkspaceDepth): WorkspaceDepth {
  return asked === 'deep' ? DEFAULT_ASK_OPTIONS.depth : asked;
}

export function useComposerDepth(): WorkspaceDepth {
  return useSyncExternalStore(
    subscribe,
    () => depth,
    () => DEFAULT_ASK_OPTIONS.depth,
  );
}
