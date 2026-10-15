'use client';

/**
 * The side panel's Memory tab (Phase 24b, task 10; brief 111, "Memory,
 * switched on").
 *
 * ABOUT ME. His note, a few lines the assistant reads with every question
 * (`workspace_profile.about_me`): shown, edited in place, saved through
 * `setAboutMe` after `parseAboutMe` (past 2000 characters the limit's own line
 * is said and nothing is sent), "Saved." once it is stored, the failure in the
 * app's words when it is not.
 *
 * WHAT IS REMEMBERED. The items of `v_workspace_memory`, newest first: the
 * title, the state in words, the summary and when it was last updated; Delete
 * in two presses forgets one (`forgetMemoryItem`: it goes whole). The filter
 * field narrows the items on the page by title and sends nothing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { relativeTime } from '@/lib/queries.sync';
import { filterByTitle } from '@/lib/queries.workspace-files';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import {
  forgetMemoryItem,
  parseAboutMe,
  setAboutMe,
  useWorkspaceMemory,
  useWorkspaceProfile,
  workspaceMemoryKeys,
  type WorkspaceMemoryItem,
  type WorkspaceProfile,
} from '@/lib/queries.workspace-memory';
import { useHydrated } from '@/lib/use-hydrated';
import {
  ABOUT_ME_HEADING,
  ABOUT_ME_PLACEHOLDER,
  CANCEL_LABEL,
  DOCUMENT_STATE_LABELS,
  EDIT_LABEL,
  MEMORY_DELETE_NOTE,
  NO_MEMORY_LINE,
  NO_MEMORY_MATCH_LINE,
  SAVED_LINE,
  SAVE_LABEL,
  aboutMeProblemLine,
  forgetProblemLine,
  memoryProblemLine,
} from '@/lib/workspace-labels';
import tokens from '@/styles/tokens.module.css';
import { FilterField, TwoStepDelete } from './FilesTab';
import styles from './SidePanel.module.css';

/* ---------------------------------------------------------------------------
 * About me
 * ------------------------------------------------------------------------ */

/** Save the note, then read the profile again. */
function useSaveAboutMe(profile: WorkspaceProfile) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => setAboutMe(profile.id, text),
    onSettled: () => queryClient.invalidateQueries({ queryKey: workspaceMemoryKeys.profile() }),
  });
}

/** The limit's own line when the note is too long; null when it may be sent. */
function limitLineOf(text: string): string | null {
  try {
    parseAboutMe(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function AboutMeEditor(props: { profile: WorkspaceProfile; onDone: (saved: boolean) => void }) {
  const save = useSaveAboutMe(props.profile);
  const [text, setText] = useState(props.profile.about_me);
  const [limit, setLimit] = useState<string | null>(null);

  function submit() {
    const refused = limitLineOf(text);
    setLimit(refused);
    if (refused !== null) return;
    save.mutate(text, { onSuccess: () => props.onDone(true) });
  }

  return (
    <div className={styles.editor}>
      <textarea
        className={styles.noteField}
        aria-label={ABOUT_ME_HEADING}
        placeholder={ABOUT_ME_PLACEHOLDER}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.rowActions}>
        <button type="button" className={tokens.btnSecondary} disabled={save.isPending} onClick={submit}>
          {SAVE_LABEL}
        </button>
        <button type="button" className={tokens.btnGhost} onClick={() => props.onDone(false)}>
          {CANCEL_LABEL}
        </button>
      </div>
      {limit !== null && (
        <p className={styles.problem} role="alert">
          {limit}
        </p>
      )}
      {save.error && (
        <p className={styles.problem} role="alert">
          {aboutMeProblemLine(workspaceErrorReason(save.error))}
        </p>
      )}
    </div>
  );
}

function AboutMe() {
  const profile = useWorkspaceProfile();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const row = profile.data ?? null;

  let body: ReactNode = null;
  if (profile.error) {
    body = (
      <p className={styles.problem} role="alert">
        {memoryProblemLine(workspaceErrorReason(profile.error))}
      </p>
    );
  } else if (row !== null && editing) {
    body = (
      <AboutMeEditor
        profile={row}
        onDone={(done) => {
          setEditing(false);
          setSaved(done);
        }}
      />
    );
  } else if (row !== null) {
    body = (
      <>
        <p className={row.about_me === '' ? styles.line : styles.aboutMe}>{row.about_me || ABOUT_ME_PLACEHOLDER}</p>
        {saved && <p className={styles.line} role="status">{SAVED_LINE}</p>}
        <button
          type="button"
          className={tokens.btnSecondary}
          onClick={() => {
            setSaved(false);
            setEditing(true);
          }}
        >
          {EDIT_LABEL}
        </button>
      </>
    );
  }

  return (
    <section className={styles.aboutBlock} aria-label={ABOUT_ME_HEADING}>
      <h3 className={styles.subheading}>{ABOUT_ME_HEADING}</h3>
      {body}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * What is remembered
 * ------------------------------------------------------------------------ */

function MemoryRow({ item, now }: { item: WorkspaceMemoryItem; now: number }) {
  const queryClient = useQueryClient();
  const forget = useMutation({
    mutationFn: () => forgetMemoryItem(item.document_id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceMemoryKeys.memory() });
      void queryClient.invalidateQueries({ queryKey: workspaceMemoryKeys.indexStatus() });
    },
  });
  const titleId = `memory-${item.document_id}-title`;
  const facts = [DOCUMENT_STATE_LABELS[item.state], relativeTime(item.updated_at, new Date(now))];

  return (
    <li className={styles.row} data-memory-state={item.state}>
      <div className={styles.rowText}>
        <span id={titleId} className={styles.rowTitle}>
          {item.title}
        </span>
        <span className={styles.rowFacts}>{facts.join(' · ')}</span>
        {item.summary !== null && <span className={styles.summary}>{item.summary}</span>}
        {forget.error && <span className={styles.problem}>{forgetProblemLine(workspaceErrorReason(forget.error))}</span>}
      </div>
      <div className={styles.rowActions}>
        <TwoStepDelete
          busy={forget.isPending}
          note={MEMORY_DELETE_NOTE}
          describedBy={titleId}
          onDelete={() => forget.mutate()}
        />
      </div>
    </li>
  );
}

function Remembered({ filter, now }: { filter: string; now: number }) {
  const memory = useWorkspaceMemory();
  if (memory.error) {
    return (
      <p className={styles.problem} role="alert">
        {memoryProblemLine(workspaceErrorReason(memory.error))}
      </p>
    );
  }
  if (memory.data === undefined) return null;
  if (memory.data.length === 0) return <p className={styles.line}>{NO_MEMORY_LINE}</p>;
  const shown = filterByTitle(memory.data, filter);
  if (shown.length === 0) return <p className={styles.line}>{NO_MEMORY_MATCH_LINE}</p>;
  return (
    <ul className={styles.rows}>
      {shown.map((item) => (
        <MemoryRow key={item.document_id} item={item} now={now} />
      ))}
    </ul>
  );
}

export function MemoryTab({ now }: { now: number }) {
  const hydrated = useHydrated();
  const [filter, setFilter] = useState('');
  return (
    <div className={styles.tabBody}>
      {hydrated && <AboutMe />}
      <FilterField value={filter} onChange={setFilter} />
      {hydrated && <Remembered filter={filter} now={now} />}
    </div>
  );
}
