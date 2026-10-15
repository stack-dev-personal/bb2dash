'use client';

/**
 * The composer's uploads from his device (Phase 24b, brief 111, "Uploading from
 * his device"; W-87).
 *
 * A picked or dropped file becomes a chip at once, "Uploading", and goes
 * through W-86's `uploadFile` with the chosen course: a refusal of the rules
 * takes the chip away and says its sentence under the box; a row that already
 * holds the file's hash, or the row just registered, takes the chip's place
 * under its id, and the chip then follows the row through `useWorkspaceUploads`
 * (re-read every 5 s while it settles). A thrown error takes the chip away and
 * is worded by `uploadProblemLine`. Try again on a failed row signs a new link
 * through `retryUploadLink`.
 *
 * The chips past the limit of five are not started; the composer says the
 * limit line.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { WORKSPACE_ATTACHMENTS_MAX } from '@/lib/queries.workspace-ask';
import {
  retryUploadLink,
  uploadFile,
  workspaceFileKeys,
  type UploadOutcome,
  type WorkspaceDocument,
} from '@/lib/queries.workspace-files';
import { uploadTitleOf } from '@/lib/workspace-upload-rules';
import { uploadProblemLine } from '@/lib/workspace-labels';
import {
  replacingAttachment,
  uploadKey,
  withAttachment,
  withoutAttachment,
  type ComposerChoices,
} from './composer-choices';

type Update = (change: (choices: ComposerChoices) => ComposerChoices) => void;

export interface ComposerUploadsInput {
  /** The course to tag a new upload with. */
  course: string | null;
  /** How many chips are attached now. */
  attached: number;
  update: Update;
  /** Some of the files were left out: five are attached. */
  onLimit: () => void;
}

/** What an outcome does to the chip that was on its way. */
function settledChoices(choices: ComposerChoices, key: string, title: string, outcome: UploadOutcome): ComposerChoices {
  switch (outcome.kind) {
    case 'refused':
      return withoutAttachment(choices, key);
    case 'existing': {
      const { id, title: rowTitle, state } = outcome.document;
      return replacingAttachment(choices, key, { kind: 'upload', key: uploadKey(id), id, title: rowTitle, state });
    }
    case 'registered':
      return replacingAttachment(choices, key, {
        kind: 'upload',
        key: uploadKey(outcome.id),
        id: outcome.id,
        title,
        state: outcome.state,
      });
  }
}

/**
 * How many chips are attached, counting the uploads started since the last render (R2-7): two drops in one
 * tick both read the same `attached`, so the room is taken from this count, which each start raises and each
 * committed render sets back to what the chips hold.
 */
function useTakenCount(attached: number): RefObject<number> {
  const taken = useRef(attached);
  useEffect(() => {
    taken.current = attached;
  }, [attached]);
  return taken;
}

export function useComposerUploads({ course, attached, update, onLimit }: ComposerUploadsInput) {
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const counter = useRef(0);
  const takenRef = useTakenCount(attached);

  function refreshRows() {
    void queryClient.invalidateQueries({ queryKey: workspaceFileKeys.uploads() });
  }

  async function uploadOne(file: File) {
    counter.current += 1;
    const key = `upload-pending:${counter.current}`;
    const title = uploadTitleOf(file.name);
    update((choices) => withAttachment(choices, { kind: 'upload', key, id: null, title, state: null }));
    try {
      const outcome = await uploadFile(file, course);
      update((choices) => settledChoices(choices, key, title, outcome));
      if (outcome.kind === 'refused') setProblem(outcome.sentence);
      else refreshRows();
    } catch (error) {
      update((choices) => withoutAttachment(choices, key));
      setProblem(uploadProblemLine(workspaceErrorReason(error)));
    }
  }

  function addFiles(files: readonly File[]) {
    if (files.length === 0) return;
    setProblem(null);
    const room = Math.max(0, WORKSPACE_ATTACHMENTS_MAX - takenRef.current);
    if (files.length > room) onLimit();
    const started = files.slice(0, room);
    takenRef.current += started.length;
    for (const file of started) void uploadOne(file);
  }

  async function retry(row: WorkspaceDocument) {
    setProblem(null);
    try {
      await retryUploadLink(row);
    } catch (error) {
      setProblem(uploadProblemLine(workspaceErrorReason(error)));
    } finally {
      refreshRows();
    }
  }

  return { addFiles, retry, problem, clearProblem: () => setProblem(null) };
}
