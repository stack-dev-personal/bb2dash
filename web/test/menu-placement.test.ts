/**
 * Where the composer's pop-downs open (Phase 24b, Round 2, W-2; W-87): by the
 * room there is. In the lobby the composer sits near the top of the window, so
 * its menus open down; at the foot of a thread they open up. Measured when the
 * menu opens, from the button's box and the window's height.
 */

import { describe, expect, it } from 'vitest';
import { menuPlacement } from '@/components/workspace/menu-placement';

const WINDOW = 900;

describe('menuPlacement', () => {
  it('opens down when the button sits in the upper part of the window (the lobby)', () => {
    expect(menuPlacement({ top: 220, bottom: 252 }, WINDOW)).toBe('down');
  });

  it('opens up when the button sits at the foot of the window (a thread)', () => {
    expect(menuPlacement({ top: 820, bottom: 852 }, WINDOW)).toBe('up');
  });

  it('opens down when the room below is the larger, and down on a tie', () => {
    expect(menuPlacement({ top: 430, bottom: 460 }, WINDOW)).toBe('down');
    expect(menuPlacement({ top: 435, bottom: 465 }, WINDOW)).toBe('down');
    expect(menuPlacement({ top: 470, bottom: 500 }, WINDOW)).toBe('up');
  });

  it('opens down for a box with no size (nothing laid out, as in jsdom)', () => {
    expect(menuPlacement({ top: 0, bottom: 0 }, WINDOW)).toBe('down');
  });
});
