/**
 * Where a pop-down of the composer opens (Phase 24b, Round 2, W-2; W-87).
 *
 * By the room there is, measured when it opens: down when the space below the
 * button is at least the space above it, up otherwise. In the lobby the
 * composer sits near the top of the window and its menus open down; at the foot
 * of a thread they open up. A box with no size (nothing laid out) opens down.
 */

export type MenuPlacement = 'up' | 'down';

export function menuPlacement(button: { top: number; bottom: number }, windowHeight: number): MenuPlacement {
  const below = windowHeight - button.bottom;
  const above = button.top;
  return below >= above ? 'down' : 'up';
}

/** The placement for a button as it is laid out now. */
export function placementOf(button: HTMLElement | null): MenuPlacement {
  if (button === null || typeof window === 'undefined') return 'up';
  return menuPlacement(button.getBoundingClientRect(), window.innerHeight);
}

/** A panel's classes: its own, and the module's `down` class when it opens down. */
export function placedClass(panel: string, down: string, placement: MenuPlacement): string {
  return placement === 'down' ? `${panel} ${down}` : panel;
}
