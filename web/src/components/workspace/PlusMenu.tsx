'use client';

/**
 * The plus menu (Phase 24b, brief 111, "The composer"; W-87).
 *
 * One button, "Add", opening a menu of two groups: Attachments (attach from
 * materials, upload from this device) and Starting points (use a routine).
 * The first two hand off to the composer, which owns the picker and the file
 * input; focus is put back on this button first, so the picker hands it back
 * here when it closes. "Use a routine" turns the panel into the routine list
 * on a wide screen and opens it as a `PopoutShell` sheet at 720 px and under.
 */

import { useState } from 'react';
import { PopoutShell } from '@/components/popout/PopoutShell';
import type { WorkspaceRoutine } from '@/lib/queries.workspace-routines';
import {
  ADD_MENU_LABEL,
  ATTACH_FROM_MATERIALS_LABEL,
  ATTACHMENTS_GROUP_HEADING,
  STARTING_POINTS_GROUP_HEADING,
  UPLOAD_FROM_DEVICE_LABEL,
  USE_ROUTINE_LABEL,
} from '@/lib/workspace-labels';
import { useMenuButton } from './menu-keys';
import { placedClass } from './menu-placement';
import { RoutineList } from './RoutineList';
import { usePhoneWidth } from './use-phone-width';
import menuStyles from './Menu.module.css';
import styles from './PlusMenu.module.css';

export interface PlusMenuProps {
  onAttachFromMaterials: () => void;
  onUploadFromDevice: () => void;
  onPickRoutine: (routine: WorkspaceRoutine) => void;
  disabled: boolean;
}

/** Phosphor's plus, regular weight, on the 256 grid. */
const PLUS_PATH =
  'M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8Z';

function PlusGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 256 256" aria-hidden="true">
      <path d={PLUS_PATH} />
    </svg>
  );
}

function MenuEntries(props: { onMaterials: () => void; onUpload: () => void; onRoutines: () => void }) {
  return (
    <>
      <div role="group" aria-label={ATTACHMENTS_GROUP_HEADING} className={menuStyles.group}>
        <span className={menuStyles.heading} aria-hidden="true">
          {ATTACHMENTS_GROUP_HEADING}
        </span>
        <button type="button" role="menuitem" className={menuStyles.item} onClick={props.onMaterials}>
          {ATTACH_FROM_MATERIALS_LABEL}
        </button>
        <button type="button" role="menuitem" className={menuStyles.item} onClick={props.onUpload}>
          {UPLOAD_FROM_DEVICE_LABEL}
        </button>
      </div>
      <div role="group" aria-label={STARTING_POINTS_GROUP_HEADING} className={menuStyles.group}>
        <span className={menuStyles.heading} aria-hidden="true">
          {STARTING_POINTS_GROUP_HEADING}
        </span>
        <button type="button" role="menuitem" className={menuStyles.item} onClick={props.onRoutines}>
          {USE_ROUTINE_LABEL}
        </button>
      </div>
    </>
  );
}

/** The plus button's routine list: in the panel on a wide screen, in a sheet on a phone. */
function useRoutineView(phone: boolean, close: () => void) {
  const [view, setView] = useState<'menu' | 'routines'>('menu');
  const [sheet, setSheet] = useState(false);
  return {
    view,
    sheet,
    showMenu: () => setView('menu'),
    closeSheet: () => setSheet(false),
    back: () => {
      setView('menu');
      close();
    },
    open: () => {
      if (!phone) {
        setView('routines');
        return;
      }
      close();
      setSheet(true);
    },
  };
}

export function PlusMenu({ onAttachFromMaterials, onUploadFromDevice, onPickRoutine, disabled }: PlusMenuProps) {
  const [menu, trigger, anchor, menuRef] = useMenuButton();
  const routines = useRoutineView(usePhoneWidth(), menu.close);
  const handOff = (action: () => void) => () => {
    routines.back();
    action();
  };
  const pick = (routine: WorkspaceRoutine) => {
    routines.closeSheet();
    routines.back();
    onPickRoutine(routine);
  };

  return (
    <span ref={anchor} className={menuStyles.anchor}>
      <button
        ref={trigger}
        type="button"
        className={styles.button}
        aria-label={ADD_MENU_LABEL}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={() => {
          routines.showMenu();
          menu.toggle();
        }}
      >
        <PlusGlyph />
      </button>
      {menu.open && routines.view === 'menu' && (
        <div ref={menuRef} role="menu" aria-label={ADD_MENU_LABEL} className={placedClass(menuStyles.panel, menuStyles.down, menu.placement)} onKeyDown={menu.onMenuKeyDown}>
          <MenuEntries onMaterials={handOff(onAttachFromMaterials)} onUpload={handOff(onUploadFromDevice)} onRoutines={routines.open} />
        </div>
      )}
      {menu.open && routines.view === 'routines' && (
        <div className={placedClass(`${menuStyles.panel} ${styles.routines}`, menuStyles.down, menu.placement)}>
          <RoutineList onPick={pick} onEscape={routines.back} />
        </div>
      )}
      {routines.sheet && (
        <PopoutShell label={USE_ROUTINE_LABEL} onClose={routines.closeSheet}>
          <RoutineList onPick={pick} inSheet />
        </PopoutShell>
      )}
    </span>
  );
}
