'use client';

/**
 * One removable chip of the composer (Phase 24b, brief 111, "The composer";
 * W-87): the routine, a file from his materials or an upload from his device.
 *
 * The chip is a named group (`routineChipLabel`, `attachmentChipLabel`), so its
 * Remove button, which every chip names the same, is told apart by the group
 * it sits in. An upload chip also says its row's state in words and carries it
 * as `data-upload-state`; a failed one offers Try again beside Remove.
 */

import type { ReactNode } from 'react';
import { Mark } from '@/components/shell/icons';
import { REMOVE_CHIP_LABEL } from '@/lib/workspace-labels';
import styles from './Chip.module.css';

export interface ChipProps {
  kind: 'routine' | 'file' | 'upload';
  /** The group's accessible name. */
  label: string;
  /** What the chip shows. */
  children: ReactNode;
  /** An upload's state, as the database spells it; absent while it is on its way. */
  uploadState?: string;
  /** The state in words, shown after the title. */
  stateLine?: string;
  /** A control before Remove (Try again). */
  action?: ReactNode;
  onRemove: () => void;
}

export function Chip({ kind, label, children, uploadState, stateLine, action, onRemove }: ChipProps) {
  return (
    <span role="group" aria-label={label} className={styles.chip} data-chip={kind} data-upload-state={uploadState}>
      <span className={styles.title}>{children}</span>
      {stateLine !== undefined && <span className={styles.state}>{stateLine}</span>}
      {action}
      <button type="button" className={styles.remove} aria-label={REMOVE_CHIP_LABEL} onClick={onRemove}>
        <Mark name="close" />
      </button>
    </span>
  );
}

/** Try again, on a failed upload's chip. */
export function ChipAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button type="button" className={styles.action} onClick={onPress}>
      {label}
    </button>
  );
}
