'use client';

/**
 * The composer's state over time (Phase 24b, brief 111, "The composer"; W-87):
 * the text a lobby example puts in the box, the chips restored from the last
 * request, a routine pressed in the lobby, and the ask itself. Each hook keeps
 * one concern; `Composer.tsx` puts them together.
 *
 * Three of them follow a value the owner hands down and change state while
 * rendering when it changes (React's "storing information from previous
 * renders"), so the box and the chips are right in the same render and no
 * effect runs after it.
 */

import { useContext, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { WorkspaceRefusal, type WorkspaceAskResult } from '@/lib/queries.workspace';
import {
  WorkspaceOptionsRefusal,
  lastRequestOptionsOf,
  useAskWorkspaceWith,
  useWorkspaceRequestOptions,
  type WorkspaceAskOptions,
} from '@/lib/queries.workspace-ask';
import type { ComposerChoices } from './composer-choices';
import { RoutineRequestContext } from './routine-request';

type Update = (change: (choices: ComposerChoices) => ComposerChoices) => void;

/**
 * The box's text. `initialText` replaces it once each time it changes (an
 * example pressed in the lobby); what he types afterwards is not overwritten.
 */
export function useBoxText(initialText: string | undefined): [string, Dispatch<SetStateAction<string>>] {
  const [text, setText] = useState(initialText ?? '');
  const [seen, setSeen] = useState(initialText);
  if (initialText !== seen) {
    setSeen(initialText);
    if (initialText !== undefined) setText(initialText);
  }
  return [text, setText];
}

/**
 * The course and routine chips of the conversation's last request, restored
 * each time a newer options row arrives; depth and format are never restored.
 * Only once hydrated: the rows can come from the cache restored before
 * hydration, and the server rendered no chip. Returns the read's error.
 */
export function useRestoredChoices(
  conversationId: string | null,
  requestIds: readonly number[],
  hydrated: boolean,
  update: Update,
): unknown {
  const options = useWorkspaceRequestOptions(conversationId, requestIds);
  const last = options.data === undefined ? null : lastRequestOptionsOf(options.data);
  const [restored, setRestored] = useState<number | null>(null);
  if (hydrated && last !== null && last.request_id !== restored) {
    setRestored(last.request_id);
    update((choices) => ({ ...choices, course: last.course_display_id, routine: last.routine_id }));
  }
  return options.error;
}

/** A routine pressed in the lobby becomes the routine chip, each press once (default L-2). */
export function useRoutineRequestApplied(update: Update): void {
  const request = useContext(RoutineRequestContext);
  const [applied, setApplied] = useState<number | null>(null);
  if (request !== null && request.seq !== applied) {
    setApplied(request.seq);
    update((choices) => ({ ...choices, routine: request.routineId }));
  }
}

export type ComposerRefusal = WorkspaceRefusal | WorkspaceOptionsRefusal;

function isRefusal(error: unknown): error is ComposerRefusal {
  return error instanceof WorkspaceRefusal || error instanceof WorkspaceOptionsRefusal;
}

export interface ComposerAskInput {
  conversationId: string | null;
  requestOpen: boolean;
  onAsked: (result: WorkspaceAskResult) => void;
  onAskError: (error: unknown) => void;
}

/**
 * Ask through `workspace_ask_with`. A refusal is kept for the line under the
 * box; any other failure goes to the owner. "Still answering" is about the open
 * request, so it goes when that request closes; the others go when the text
 * changes (`clearRefusal`). Resolves true when the question was accepted.
 */
export function useComposerAsk({ conversationId, requestOpen, onAsked, onAskError }: ComposerAskInput) {
  const mutation = useAskWorkspaceWith();
  const [refusal, setRefusal] = useState<ComposerRefusal | null>(null);
  const [seenOpen, setSeenOpen] = useState(requestOpen);
  /** A question is on its way. A ref, because a held Enter repeats before the pending state has rendered. */
  const sending = useRef(false);

  if (seenOpen !== requestOpen) {
    setSeenOpen(requestOpen);
    if (!requestOpen && refusal instanceof WorkspaceRefusal && refusal.reason === 'still_answering') {
      setRefusal(null);
    }
  }

  async function ask(text: string, options: WorkspaceAskOptions): Promise<boolean> {
    if (sending.current) return false;
    sending.current = true;
    setRefusal(null);
    try {
      onAsked(await mutation.mutateAsync({ conversationId, text, options }));
      return true;
    } catch (error) {
      if (isRefusal(error)) setRefusal(error);
      else onAskError(error);
      return false;
    } finally {
      sending.current = false;
    }
  }

  return { ask, pending: mutation.isPending, refusal, clearRefusal: () => setRefusal(null) };
}
