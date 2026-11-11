'use client';

/**
 * One Inbox item's error boundary (2026-11-11).
 *
 * Each card is drawn inside its own boundary, so an item the screen cannot draw becomes
 * one short card with its id and the error, and every other item stays answerable. Before
 * it, one card's error (the session labels restored as `{}`, PR #141) took the whole
 * Inbox down. The card keeps `data-inbox-card`, so `j` / `k` still step over it.
 */

import { catchError, type ErrorInfo } from 'next/error';
import tokens from '@/styles/tokens.module.css';
import styles from './InboxItemBoundary.module.css';

export interface InboxItemBoundaryProps {
  itemId: number;
}

export const ITEM_ERROR_TITLE = 'This item could not be shown';

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'No message.';
}

function ItemFallback({ itemId }: InboxItemBoundaryProps, { error, retry }: ErrorInfo) {
  return (
    <article className={`${tokens.card} ${styles.card}`} data-inbox-card="" tabIndex={0} role="alert">
      <p className={styles.title}>
        {ITEM_ERROR_TITLE} <span className={tokens.mono}>(item {itemId})</span>
      </p>
      <p className={styles.detail}>{messageOf(error)}</p>
      <div>
        <button type="button" className={`${tokens.btn} ${tokens.btnSecondary}`} onClick={() => retry()}>
          Try again
        </button>
      </div>
    </article>
  );
}

export const InboxItemBoundary = catchError(ItemFallback);
