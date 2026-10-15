'use client';

/**
 * A routine picked outside the composer (Phase 24b, brief 111, "The lobby";
 * W-87, default L-2).
 *
 * The lobby's six shortcuts set the composer's routine chip. `ComposerProps` is
 * frozen (ruling C-1) and has no routine prop, so the lobby puts a request in
 * this context and the composer applies it by the same path its own routine
 * list uses. Each press carries a new `seq`, so pressing the same shortcut
 * again after removing the chip sets it again.
 */

import { createContext, useCallback, useState } from 'react';

export interface RoutineRequest {
  routineId: string;
  seq: number;
}

/** Null outside the lobby: the thread's composer has no shortcuts. */
export const RoutineRequestContext = createContext<RoutineRequest | null>(null);

/** The lobby's side: the request to provide, and a press. */
export function useRoutineRequest(): { request: RoutineRequest | null; press: (routineId: string) => void } {
  const [request, setRequest] = useState<RoutineRequest | null>(null);
  const press = useCallback(
    (routineId: string) => setRequest((previous) => ({ routineId, seq: (previous?.seq ?? 0) + 1 })),
    [],
  );
  return { request, press };
}
