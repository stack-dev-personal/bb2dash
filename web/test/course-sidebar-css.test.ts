/**
 * The course rail's look, after the grouped side nav Stack chose on 2026-10-15 (a Zenkit settings
 * nav): the rows in one rounded card on the panel, a subject tile and a chevron on every row, and
 * the current course a solid ink row with ground-coloured words and the red mark of "where you are".
 * jsdom paints nothing, so the rules are read from the stylesheet. Tokens only: the token audit
 * counts every literal, and this file pins which tokens the rules name.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIDEBAR = readFileSync(
  join(process.cwd(), 'src/components/shell/CourseSidebar.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose whole selector is `selector`, or '' when there is none. */
function rule(source: string, selector: string): string {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').split(',').some((part) => part.trim() === selector)) return match[2] ?? '';
  }
  return '';
}

describe('the course rail after the grouped nav', () => {
  it('holds the rows in one card: the surface colour, the large radius, the resting edge', () => {
    const group = rule(SIDEBAR, '.group');
    expect(group).toMatch(/background\s*:\s*var\(--color-surface\)/);
    expect(group).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
    expect(group).toMatch(/box-shadow\s*:\s*var\(--shadow-sm\)/);
  });

  it('heads the list in sentence case, not small capitals', () => {
    expect(rule(SIDEBAR, '.head')).not.toMatch(/text-transform\s*:\s*uppercase/);
  });

  it('fills the current row with the ink, writes it in the ground colour, and keeps the red mark', () => {
    const current = rule(SIDEBAR, '.rowCurrent');
    expect(current).toMatch(/background\s*:\s*var\(--color-accent\)/);
    expect(current).toMatch(/(?<![a-z-])color\s*:\s*var\(--color-bg\)/);
    expect(current).toMatch(/box-shadow\s*:[^;]*var\(--color-accent-500\)/);
  });

  it('sets the tile and the code line in the mono face', () => {
    expect(rule(SIDEBAR, '.tile')).toMatch(/font-family\s*:\s*var\(--font-mono\)/);
    expect(rule(SIDEBAR, '.sub')).toMatch(/font-family\s*:\s*var\(--font-mono\)/);
  });

  it('eases a row by the one control transition', () => {
    expect(rule(SIDEBAR, '.row')).toMatch(/transition\s*:\s*var\(--motion-control\)/);
  });
});
