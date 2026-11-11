'use client';

/**
 * The screen bb2dash shows when a page throws while it draws (2026-11-11).
 *
 * Before it, any render error fell through to Next's own "This page couldn't load",
 * which says nothing and offers only a reload. A reload does not help when the cause
 * is the cache this window saved (the Inbox's session labels, PR #141), so this screen
 * offers three ways out: try again, clear the saved data and reload, or go to Today.
 * It also prints the error's message, so a screenshot is enough to diagnose it.
 *
 * Used by `app/(app)/error.tsx` (inside the shell: the top bar and the rail stay) and
 * by `app/global-error.tsx` (the last resort, which draws its own document).
 */

import { useEffect } from 'react';
import { clearPersistedQueryCache } from '@/lib/query-provider';
import tokens from '@/styles/tokens.module.css';
import styles from './ErrorScreen.module.css';

export const ERROR_SCREEN_TITLE = 'This screen hit an error';
export const ERROR_SCREEN_LEDE =
  'Nothing you saved is lost. Try again first. If it keeps happening, clear the data this window keeps for speed and reload.';
export const RETRY_LABEL = 'Try again';
export const CLEAR_LABEL = 'Clear saved data and reload';
export const HOME_LABEL = 'Go to Today';

export interface ErrorScreenProps {
  error: Error & { digest?: string };
  /** Re-fetch and re-draw what failed (Next's `retry`). */
  retry: () => void;
  /** Called after the saved cache is cleared. Defaults to a full reload. */
  reload?: () => void;
  /** The last-resort page: fills the window instead of the content pane. */
  fullPage?: boolean;
}

function defaultReload(): void {
  window.location.reload();
}

/** The line under the buttons: the message, and the server's digest when there is one. */
export function errorDetail(error: Error & { digest?: string }): string {
  const message = error.message?.trim() || 'No message.';
  return error.digest ? `${message} (digest ${error.digest})` : message;
}

export function ErrorScreen({ error, retry, reload = defaultReload, fullPage = false }: ErrorScreenProps) {
  useEffect(() => {
    // The browser console is where the stack lives; the screen shows only the message.
    console.error(error);
  }, [error]);

  function clearAndReload(): void {
    clearPersistedQueryCache();
    reload();
  }

  return (
    <section className={fullPage ? styles.fullPage : styles.pane} role="alert" aria-labelledby="error-screen-title">
      <div className={styles.block}>
        <span className={styles.kicker}>Something went wrong</span>
        <h1 id="error-screen-title" className={styles.title}>
          {ERROR_SCREEN_TITLE}
        </h1>
        <p className={styles.lede}>{ERROR_SCREEN_LEDE}</p>
        <div className={styles.actions}>
          <button type="button" className={`${tokens.btn} ${tokens.btnPrimary}`} onClick={() => retry()}>
            {RETRY_LABEL}
          </button>
          <button type="button" className={`${tokens.btn} ${tokens.btnSecondary}`} onClick={clearAndReload}>
            {CLEAR_LABEL}
          </button>
          {/* A plain anchor, not next/link: it must work when the router itself is what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load is the point */}
          <a className={`${tokens.btn} ${tokens.btnGhost}`} href="/">
            {HOME_LABEL}
          </a>
        </div>
        <p className={styles.detail}>{errorDetail(error)}</p>
      </div>
    </section>
  );
}
