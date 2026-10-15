import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LOADING_FALLBACK, PAGE_KICKER } from '@/lib/workspace-labels';
import { Workspace } from './Workspace';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Workspace · bb2dash',
};

/**
 * /workspace — the assistant (S2-workspace-1, Phase 21; Phase 24b): the lobby,
 * or a conversation's thread, with the side panel.
 *
 * The screen reads `?c=` for its conversation and `?panel=` for the panel's
 * tab, so it sits behind a Suspense
 * boundary: without one, `useSearchParams` would opt this route out of
 * prerendering altogether (the same reason /planner has one). The (app) layout
 * supplies the top bar and the sign-in guard.
 */
export default function WorkspacePage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>{PAGE_KICKER}</span>
          <h1 className={styles.title}>Workspace</h1>
        </div>
      </header>

      <Suspense fallback={<p className={styles.stubBody}>{LOADING_FALLBACK}</p>}>
        <Workspace />
      </Suspense>
    </>
  );
}
