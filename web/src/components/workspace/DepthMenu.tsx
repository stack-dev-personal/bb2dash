'use client';

/**
 * The depth menu (Phase 24b, brief 111, "The composer"; W-87): Auto, Quick,
 * Standard and Deep, in `WORKSPACE_DEPTHS` order, each with its one-line note.
 * It starts on Auto. The composer puts Deep back to Auto after one question;
 * Quick and Standard stay until he changes them.
 *
 * The button carries `data-depth` (brief 111, "Data attributes, final") and is
 * named by the menu's name and the depth it shows.
 */

import { WORKSPACE_DEPTHS, type WorkspaceDepth } from '@/lib/queries.workspace-ask';
import { DEPTH_LABELS, DEPTH_MENU_LABEL, DEPTH_NOTES } from '@/lib/workspace-labels';
import { useMenuButton } from './menu-keys';
import menuStyles from './Menu.module.css';
import styles from './DepthMenu.module.css';

export interface DepthMenuProps {
  depth: WorkspaceDepth;
  onPick: (depth: WorkspaceDepth) => void;
  disabled: boolean;
}

function DepthItems({ depth, onChoose }: { depth: WorkspaceDepth; onChoose: (depth: WorkspaceDepth) => void }) {
  return WORKSPACE_DEPTHS.map((entry) => (
    <button
      key={entry}
      type="button"
      role="menuitemradio"
      aria-checked={entry === depth}
      className={menuStyles.item}
      onClick={() => onChoose(entry)}
    >
      <span>{DEPTH_LABELS[entry]}</span>
      <span className={menuStyles.note}>{DEPTH_NOTES[entry]}</span>
    </button>
  ));
}

export function DepthMenu({ depth, onPick, disabled }: DepthMenuProps) {
  const [menu, trigger, anchor, menuRef] = useMenuButton();
  return (
    <span ref={anchor} className={menuStyles.anchor}>
      <button
        ref={trigger}
        type="button"
        className={styles.button}
        data-depth={depth}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={menu.toggle}
      >
        <span className="sr-only">{DEPTH_MENU_LABEL}</span>
        {DEPTH_LABELS[depth]}
      </button>
      {menu.open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={DEPTH_MENU_LABEL}
          className={menuStyles.panelEnd}
          onKeyDown={menu.onMenuKeyDown}
        >
          <DepthItems
            depth={depth}
            onChoose={(entry) => {
              onPick(entry);
              menu.close();
            }}
          />
        </div>
      )}
    </span>
  );
}
