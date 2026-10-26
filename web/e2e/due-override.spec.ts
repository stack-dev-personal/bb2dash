/**
 * Shots for the due-date override (migration 221), for Stack's review page.
 *
 * Read-only: every write is refused (`guardWrites`). ECN.304 Quiz 5 already
 * carries Stack's date in prod (Thu 10/22, 3:30 PM; Blackboard says Tue 10/27),
 * so each surface shows the overridden state.
 *
 * Run: node scripts/walk-box.mjs due-override.spec.ts --url <preview origin>  (WALK_SHOTS=1)
 */

import { expect, test, type Page } from '@playwright/test';
import { assertNoWrites, dismissNativeDialogs, guardWrites, openSignedIn } from './walk';
import { shotPath22 } from './walk22.lib';

const THEMES = ['dark', 'light'] as const;
const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const QUIZ_5_POPOUT = '/course/ECN.304/classwork?item=assignment:ECN.304/quiz-5';
const WEEK_OF_QUIZ_5 = '/planner?week=2026-10-19';
const WEEK_OF_QUIZ_6 = '/planner?week=2026-10-26';

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
}

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    test(`due override · ${theme} · ${size.name}`, async ({ page, context }) => {
      const writes = await guardWrites(context);
      dismissNativeDialogs(page);
      await context.addInitScript((t) => {
        try {
          window.localStorage.setItem('bb2dash.theme', t);
          // Open the planner's Assignments band, where Quiz 6 (date only) sits.
          window.localStorage.setItem('bb2dash.planner.assignments', 'open');
        } catch {
          // storage blocked: the app falls back to its default theme
        }
      }, theme);
      await page.setViewportSize({ width: size.width, height: size.height });
      const tag = `${theme}-${size.width}`;

      await openSignedIn(page, WEEK_OF_QUIZ_5);
      await settle(page);
      // Quiz 5 sits in Thursday's 3:30 PM class block, below the fold.
      const quiz5 = page.getByText('Quiz 5', { exact: true }).first();
      await expect(quiz5).toBeVisible();
      await quiz5.scrollIntoViewIfNeeded();
      await page.screenshot({ path: shotPath22(`01-week-1019-${tag}.png`) });

      await openSignedIn(page, WEEK_OF_QUIZ_6);
      await settle(page);
      await page.screenshot({ path: shotPath22(`02-week-1026-${tag}.png`), fullPage: true });

      await openSignedIn(page, QUIZ_5_POPOUT);
      await settle(page);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/your date \(Blackboard: Tue, Oct 27/)).toBeVisible();
      await page.screenshot({ path: shotPath22(`03-detail-due-${tag}.png`) });

      const dueField = dialog.getByLabel('Due date');
      await dueField.scrollIntoViewIfNeeded();
      await expect(dueField).toHaveValue('2026-10-22');
      await expect(dialog.getByLabel('Due time')).toHaveValue('15:30');
      await page.screenshot({ path: shotPath22(`04-detail-plan-${tag}.png`) });

      assertNoWrites(writes);
    });
  }
}
