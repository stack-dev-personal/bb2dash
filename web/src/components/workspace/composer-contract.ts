/**
 * bb2dash — the props of the Workspace composer and the lobby, frozen by the PM
 * at the cut of W-87 and W-88 (Phase 24b, brief 111, "Frozen at the gate";
 * ruling C-1 in 111a, 2026-10-15). Types only: no component is here.
 *
 * W-87 builds `Composer.tsx` and `Lobby.tsx` to these interfaces; W-88's
 * `Thread` and `Workspace.tsx` render them through these interfaces. Neither
 * worker edits this file; a need goes in its record as a default.
 *
 * THE COMPOSER OWNS ITS CHIPS AND ITS ASK. The course chip, the routine chip,
 * the depth menu, the attachment chips (files from his materials, uploads from
 * his device), their restoration from the last request's options row
 * (`useWorkspaceRequestOptions` + `lastRequestOptionsOf`), the upload flow for
 * its own chips (`uploadFile`), the `workspace_ask_with` call
 * (`useAskWorkspaceWith`) and every sentence shown under the box (the five
 * refusals through `askWithRefusalFor`, the routine-needs lines, the upload
 * refusals, the not-ready line, the attachments limit) are the composer's. The
 * owner learns of an accepted question through `onAsked`, and of a failure the
 * composer does not word itself through `onAskError`, which it says above the
 * column as today (`askProblemLine`) and reads with `isMissingConversation`.
 */

import type { WorkspaceAskResult } from '@/lib/queries.workspace';

export interface ComposerProps {
  /** The conversation the question goes into; null in the lobby, where the first question makes one. */
  conversationId: string | null;
  /**
   * The conversation's request ids as the owner has them (`workspace_requests`, in id order), for restoring
   * the course and routine chips from the last request's `workspace_request_options` row; `[]` in the lobby.
   */
  requestIds: readonly number[];
  /** A request is open in this conversation: the button reads Stop and Enter sends nothing. */
  requestOpen: boolean;
  /** A Stop is on its way (the owner's). The composer adds its own pending ask to this. */
  busy: boolean;
  /** The conversation was not found: the box and the button are disabled and nothing is sent. */
  disabled: boolean;
  /**
   * Text to start the box with: an example prompt pressed in the lobby. A new value replaces the box's text
   * once, when it changes; typing afterwards is not overwritten.
   */
  initialText?: string;
  /**
   * The question was accepted. The owner moves to `result.conversationId` when it had none and hands
   * `result.messageId` to the column so the reader's own question takes it to its end (R3-5).
   */
  onAsked: (result: WorkspaceAskResult) => void;
  /**
   * A question failed for a reason the composer does not word under the box: not a `WorkspaceRefusal` and
   * not a `WorkspaceOptionsRefusal`. The owner says it above the column and reads `isMissingConversation`.
   */
  onAskError: (error: unknown) => void;
  /** Stop the open request. The owner marks it stopped at once and calls `workspace_cancel`. */
  onStop: () => void;
  /** The text changed: the owner may clear what it said about the old text. */
  onEdit: () => void;
}

export interface LobbyProps {
  /** The clock, from the screen's `useNow`, for the recent rows' "last active" and the service line. */
  now: number;
  /** A first question made a conversation: the page moves to it. */
  onCreated: (conversationId: string) => void;
}
