'use client';

/**
 * The lobby's recent conversations (Phase 24b, brief 111, "The lobby"; W-87).
 *
 * The five newest conversations that are not archived, each a link to its
 * thread with when it was last active; "View all" expands the block in place
 * to every one that is not archived (default L-1) and goes, as nothing is left
 * to show. No conversation says the one line; a failed read says why. The rows
 * come from a cache restored before hydration, so they are read only once
 * hydrated; while they are read the block shows its heading alone.
 */

import Link from 'next/link';
import { useId, useState } from 'react';
import { relativeTime } from '@/lib/queries.sync';
import { useWorkspaceConversations, workspaceErrorReason, type WorkspaceConversation } from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import {
  NO_CONVERSATIONS_LINE,
  RECENT_HEADING,
  VIEW_ALL_LABEL,
  conversationsProblemLine,
} from '@/lib/workspace-labels';
import { conversationHref } from './route';
import styles from './LobbyRecent.module.css';

/** How many conversations the block shows before "View all". */
const RECENT_SHOWN = 5;

function RecentRows({ rows, now }: { rows: readonly WorkspaceConversation[]; now: number }) {
  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.id}>
          <Link className={styles.row} href={conversationHref(row.id)}>
            <span className={styles.title}>{row.title}</span>
            <span className={styles.when}>{relativeTime(row.updated_at, new Date(now))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentBody({ now }: { now: number }) {
  const hydrated = useHydrated();
  const conversations = useWorkspaceConversations(false);
  const [all, setAll] = useState(false);
  if (!hydrated) return null;
  if (conversations.error) {
    return (
      <p className={styles.problem} role="alert">
        {conversationsProblemLine(workspaceErrorReason(conversations.error))}
      </p>
    );
  }
  const rows = conversations.data;
  if (rows === undefined) return null;
  if (rows.length === 0) return <p className={styles.empty}>{NO_CONVERSATIONS_LINE}</p>;
  const more = !all && rows.length > RECENT_SHOWN;
  return (
    <>
      <RecentRows rows={more ? rows.slice(0, RECENT_SHOWN) : rows} now={now} />
      {more && (
        <button type="button" className={styles.viewAll} aria-expanded={false} onClick={() => setAll(true)}>
          {VIEW_ALL_LABEL}
        </button>
      )}
    </>
  );
}

export function LobbyRecent({ now }: { now: number }) {
  const headingId = useId();
  return (
    <section className={styles.recent} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        {RECENT_HEADING}
      </h3>
      <RecentBody now={now} />
    </section>
  );
}
