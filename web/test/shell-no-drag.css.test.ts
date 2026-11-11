/**
 * `all: unset` must not undo `app-region: no-drag` (Phase 22, task 27; found with real clicks in the packed window).
 *
 * `app-region` is inherited, and `all: unset` resets every property of a rule to its inherited or
 * initial value. A control that the grouped rule marks `no-drag` and that a later rule of the same
 * selector declares `all: unset` on, takes the bar's `drag` again, and Windows takes a press on it as a
 * grab of the title bar. A synthetic click does not pass through that hit test, so no browser test sees it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENTS = join(process.cwd(), 'src', 'components');
const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selectors: string[];
  body: string;
}

function rulesOf(source: string): Rule[] {
  return [...strip(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim()),
    body: match[2] ?? '',
  }));
}

/** Every shell and popout stylesheet, by its path under `components/`. */
const SHEETS: Array<{ file: string; rules: Rule[] }> = ['shell', 'popout'].flatMap((folder) =>
  readdirSync(join(COMPONENTS, folder))
    .filter((file) => file.endsWith('.module.css'))
    .map((file) => ({ file: `${folder}/${file}`, rules: rulesOf(readFileSync(join(COMPONENTS, folder, file), 'utf8')) })),
);

const NO_DRAG = /app-region\s*:\s*no-drag/;

describe('the bar’s no-drag controls', () => {
  const topNav = SHEETS.find((sheet) => sheet.file === 'shell/TopNav.module.css')?.rules ?? [];
  const grouped = topNav.find((rule) => NO_DRAG.test(rule.body) && rule.selectors.length > 1);

  it('has a grouped no-drag rule', () => {
    expect(grouped?.selectors).toEqual(expect.arrayContaining(['.brand', '.link', '.menu', '.ic', '.dd', '.navMenu']));
  });

  it('is not undone by a later rule of the same selector that says all: unset without no-drag after it', () => {
    const undone = (grouped?.selectors ?? []).flatMap((selector) =>
      topNav
        .filter((rule) => rule !== grouped && rule.selectors.includes(selector) && /(^|[;\s])all\s*:/.test(rule.body))
        .filter((rule) => !/(^|[;\s])all\s*:[^;]*;[\s\S]*app-region\s*:\s*no-drag/.test(rule.body))
        .map(() => selector),
    );

    expect(undone, 'selectors the grouped rule marks no-drag whose own all: rule resets it').toEqual([]);
  });
});

describe('every shell and popout rule that holds both all: and app-region', () => {
  it('declares app-region after all:', () => {
    const wrong = SHEETS.flatMap((sheet) =>
      sheet.rules
        .filter((rule) => /(^|[;\s])all\s*:/.test(rule.body) && /app-region\s*:/.test(rule.body))
        .filter((rule) => rule.body.search(/app-region\s*:/) < rule.body.search(/(^|[;\s])all\s*:/))
        .map((rule) => `${sheet.file}: ${rule.selectors.join(', ')}`),
    );

    expect(wrong).toEqual([]);
  });

  it('puts no-drag on a control that sits in the bar or opens a panel from it, after all: unset', () => {
    const named: Array<[string, string]> = [
      ['shell/TopNav.module.css', '.ic'],
      ['shell/TopNav.module.css', '.menu'],
      ['shell/SyncButton.module.css', '.button'],
      ['shell/SyncButton.module.css', '.toastDismiss'],
    ];
    const missing = named.filter(([file, selector]) => {
      const rules = SHEETS.find((sheet) => sheet.file === file)?.rules ?? [];
      return !rules.some(
        (rule) => rule.selectors.includes(selector) && /(^|[;\s])all\s*:\s*unset[^;]*;[\s\S]*app-region\s*:\s*no-drag/.test(rule.body),
      );
    });

    expect(missing).toEqual([]);
  });
});
