'use client';

/**
 * Keys in the composer's menus and lists (Phase 24b, brief 111, "Keyboard";
 * W-87): the arrows step through the entries and wrap, Home and End go to the
 * first and the last, and Esc closes and hands focus back to the button that
 * opened the menu. `usePopover` closes on Esc as well; this adds the focus.
 *
 * In a list with a search field the field is one of the stops, and Home and
 * End typed in it move the caret, not the focus.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { usePopover, type PopoverAnchor } from '@/components/shell/usePopover';
import { placementOf, type MenuPlacement } from './menu-placement';

/** The entries of a `role="menu"`, in document order. */
export const MENU_ITEMS = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])';

/** The stops of a list with a search field: the field, then every enabled button. */
export const LIST_STOPS = 'input[type="search"], button:not([disabled])';

function nextIndex(key: string, index: number, count: number, inField: boolean): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return index < 0 ? 0 : (index + 1) % count;
    case 'ArrowUp':
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case 'Home':
      return inField ? null : 0;
    case 'End':
      return inField ? null : count - 1;
    default:
      return null;
  }
}

/**
 * Move the focus among the stops `selector` finds inside the element the
 * handler is on. `onEscape`, when given, closes the menu; a sheet leaves Esc to
 * `PopoutShell`.
 */
export function handleListKeys(
  event: KeyboardEvent<HTMLElement>,
  selector: string,
  onEscape?: () => void,
): void {
  if (event.key === 'Escape') {
    if (onEscape === undefined) return;
    event.preventDefault();
    onEscape();
    return;
  }
  const stops = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const active = document.activeElement;
  const index = stops.findIndex((stop) => stop === active);
  const next = nextIndex(event.key, index, stops.length, event.target instanceof HTMLInputElement);
  if (next === null) return;
  event.preventDefault();
  stops[next]?.focus();
}

/**
 * When a menu opens, focus its checked entry, else its first stop. `node` is
 * the menu element, held in state by a callback ref, so this runs once per
 * opening.
 */
export function useFocusOnOpen(node: HTMLElement | null, selector: string): void {
  useEffect(() => {
    if (node === null) return;
    const checked = node.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? node.querySelector<HTMLElement>(selector))?.focus();
  }, [node, selector]);
}

export interface MenuButtonState {
  open: boolean;
  /** Where the menu opens, measured when it opened (W-2). */
  placement: MenuPlacement;
  toggle: () => void;
  /** Close the menu and put focus back on its button. */
  close: () => void;
  onMenuKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * A button that opens a `role="menu"` pop-down: `usePopover` for the outside
 * press and Esc, the menu's first or checked entry focused on opening, the keys
 * above, and focus handed back on closing. Returned apart, as `usePopover`
 * does (R-51): the state, the button's ref, the anchor and the menu's ref, so
 * no object read during render carries a ref.
 */
export function useMenuButton(): [
  MenuButtonState,
  RefObject<HTMLButtonElement | null>,
  PopoverAnchor<HTMLSpanElement>,
  (node: HTMLDivElement | null) => void,
] {
  const [popover, anchor] = usePopover<HTMLSpanElement>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [menuNode, setMenuNode] = useState<HTMLDivElement | null>(null);
  useFocusOnOpen(menuNode, MENU_ITEMS);
  const [placement, setPlacement] = useState<MenuPlacement>('up');
  const { open, toggle: togglePopover, close: closePopover } = popover;
  const state = useMemo<MenuButtonState>(() => {
    const close = () => {
      closePopover();
      trigger.current?.focus();
    };
    const toggle = () => {
      if (!open) setPlacement(placementOf(trigger.current));
      togglePopover();
    };
    return { open, placement, toggle, close, onMenuKeyDown: (event) => handleListKeys(event, MENU_ITEMS, close) };
  }, [open, placement, togglePopover, closePopover]);
  return [state, trigger, anchor, setMenuNode];
}
