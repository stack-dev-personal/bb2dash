/**
 * An `env()` name cannot live in a CSS module (Phase 22, task 27; found on the packed desktop build).
 *
 * The build's CSS Modules step renames the name inside `env()` as if it were a local identifier:
 * `env(titlebar-area-width, 100vw)` in `TopNav.module.css` came out as
 * `env(TopNav-module__Ztz69q__titlebar-area-width,100vw)`, which no browser defines, so the fallback was
 * always taken and Windows' three window buttons lay over the bar's last icons. `globals.css` is not a
 * module and passes `env()` through untouched, so the value is declared there once, as a token.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

describe('env() in stylesheets', () => {
  it('is in no .module.css file outside a comment: the build renames the name inside it', () => {
    const holders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.module.css'))
      .filter((file) => /\benv\(/.test(strip(readFileSync(join(SRC, file), 'utf8'))))
      .map((file) => file.split(sep).join('/'));

    expect(
      holders,
      'a CSS module must not hold env(): the build renames its name as a local identifier (env(TopNav-module__x__titlebar-area-width)), ' +
        'which no browser defines. Declare the value as a token in globals.css and use var(--…) here',
    ).toEqual([]);
  });

  it('is declared once, as a token, in globals.css: what the bar clears for the window buttons', () => {
    const globals = strip(readFileSync(join(SRC, 'app', 'globals.css'), 'utf8'));

    expect(globals).toMatch(/--size-window-controls\s*:\s*calc\(\s*100vw\s*-\s*env\(titlebar-area-width/);
  });

  it('is read by the bar through that token', () => {
    const bar = strip(readFileSync(join(SRC, 'components', 'shell', 'TopNav.module.css'), 'utf8'));

    expect(bar).toMatch(/max\(\s*var\(--size-28\)\s*,\s*var\(--size-window-controls\)\s*\)/);
  });
});
