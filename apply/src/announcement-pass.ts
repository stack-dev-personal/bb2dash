/**
 * The announcement reader's pass (Phase 26): the second request kind, one request at a time.
 *
 *   1. announcement_review_claim(): the oldest queued request, claimed; none -> idle
 *   2. announcement_review_prepare(id): at most six unreviewed announcements, as ids, and the day's run count
 *   3. one `claude -p` run of /announcement-review, unless the day's announcement cap is reached
 *   4. announcement_review_prepare(id) again: whichever of the six it still lists got no decision, and
 *      each is marked refused ('no decision recorded') so a post the model cannot decide never loops
 *   5. announcement_review_close(id, done | failed, result): a done close files the follow-up for the rest
 *
 * Step 4 happens only after a run that ended by itself. A run cut short (the time limit, a stop, the
 * plan's limit, an expired sign-in) says nothing about the posts it never reached, so they stay
 * unreviewed for the next request instead of being refused for an outage. The day's cap closes the
 * request failed, so no follow-up is filed against a cap. Every failed close carries `result.error`, the
 * RunError code: the database counts timed_out and budget_exceeded against a post (two refuse it) and
 * never an outage.
 *
 * The same ports as the Inbox pass: every step is injected, so this runs on fakes.
 */

import { ANNOUNCEMENT_BATCH_MAX, ANNOUNCEMENT_RUNS_PER_DAY } from './config.js';
import type { AnnouncementRpc } from './db.js';
import type { PassOutcome } from './loop.js';
import { ERROR_SENTENCE, type ClaudeOutcome, type RunError } from './report.js';

export const NO_DECISION_REASON = 'no decision recorded';

export interface AnnouncementRunInput {
  readonly requestId: number;
  readonly announcementIds: readonly number[];
}

export interface AnnouncementDeps {
  /** Overrides ANNOUNCEMENT_RUNS_PER_DAY, for tests. */
  readonly maxRunsPerDay?: number;
  readonly rpc: AnnouncementRpc;
  readonly runClaude: (input: AnnouncementRunInput) => Promise<ClaudeOutcome>;
}

interface Ports {
  readonly log: (line: string) => void;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

/** The Inbox pass's sentences, with the two that name announcements instead of answers. */
const ERROR_LINE: Readonly<Record<RunError, string>> = Object.freeze({
  ...ERROR_SENTENCE,
  daily_cap: "Today's limit on announcement runs was reached; the rest waits for tomorrow.",
  not_applied: 'Some announcements could not be reviewed.',
});

interface Counts {
  readonly batch: number;
  readonly skipped: readonly number[];
  readonly claude: ClaudeOutcome | null;
  readonly error: RunError | null;
}

function resultOf(c: Counts): Record<string, unknown> {
  const lines = [`${c.batch} ${c.batch === 1 ? 'announcement' : 'announcements'} read`];
  if (c.error !== null) lines.push(c.claude?.detail ?? ERROR_LINE[c.error]);
  if (c.skipped.length > 0) lines.push(`No decision recorded for ${c.skipped.length}: announcements ${c.skipped.join(', ')}.`);
  return {
    lines,
    kind: 'announcement_review',
    announcements: c.batch,
    skipped: c.skipped,
    claude: {
      started: c.claude !== null,
      exit_code: c.claude?.exitCode ?? null,
      timed_out: c.claude?.timedOut ?? false,
      cost_usd: c.claude?.costUsd ?? null,
    },
    error: c.error,
  };
}

/** Step 4: refuse what the finished run left unreviewed. A refusal that itself fails is logged and not counted. */
async function skipUnreviewed(d: AnnouncementDeps, p: Ports, requestId: number, batch: ReadonlySet<number>): Promise<number[]> {
  const after = await d.rpc.prepare(requestId);
  const left = after.announcements.map((a) => a.id).filter((id) => batch.has(id));
  const skipped: number[] = [];
  for (const id of left) {
    try {
      await d.rpc.skip(requestId, id, NO_DECISION_REASON);
      skipped.push(id);
    } catch (error) {
      p.log(`announcement pass: announcement ${id} could not be marked refused: ${message(error)}`);
    }
  }
  return skipped;
}

/** Steps 2 to 5 for a claimed request; throws on a database failure, which `runAnnouncementPass` turns into a failed close. */
async function work(d: AnnouncementDeps, p: Ports, requestId: number, onRun: () => void): Promise<'done' | 'failed'> {
  const prepared = await d.rpc.prepare(requestId);
  const ids = prepared.announcements.slice(0, ANNOUNCEMENT_BATCH_MAX).map((a) => a.id);
  const capped = ids.length > 0 && prepared.runsToday >= (d.maxRunsPerDay ?? ANNOUNCEMENT_RUNS_PER_DAY);

  let claude: ClaudeOutcome | null = null;
  let skipped: number[] = [];
  if (capped) {
    p.log(`announcement pass: request ${requestId}: today's ${prepared.runsToday} runs reached the cap; ${ids.length} announcement(s) wait`);
  } else if (ids.length > 0) {
    p.log(`announcement pass: request ${requestId}: ${ids.length} to Claude`);
    onRun();
    claude = await d.runClaude({ requestId, announcementIds: ids });
    if (claude.error === null) skipped = await skipUnreviewed(d, p, requestId, new Set(ids));
  }

  const error: RunError | null = claude?.error ?? (capped ? 'daily_cap' : null);
  const state = error === null ? 'done' : 'failed';
  const followUp = await d.rpc.close(requestId, state, resultOf({ batch: ids.length, skipped, claude, error }));
  p.log(`announcement pass: request ${requestId} closed ${state}${followUp === null ? '' : `; follow-up ${followUp} queued`}`);
  return state;
}

/** One announcement pass. A throw after the claim still closes the request, failed; if even that fails the next claim releases it. */
export async function runAnnouncementPass(d: AnnouncementDeps, p: Ports): Promise<PassOutcome> {
  const request = await d.rpc.claim();
  if (request === null) return 'idle';
  p.log(`announcement pass: claimed request ${request.id}`);
  let started = false;
  try {
    return await work(d, p, request.id, () => {
      started = true;
    });
  } catch (error) {
    p.log(`announcement pass: request ${request.id} failed: ${message(error)}`);
    try {
      await d.rpc.close(request.id, 'failed', {
        lines: ['The apply worker hit an error before it could finish.'],
        kind: 'announcement_review',
        error: 'cli_error',
        claude: { started },
      });
    } catch (closeError) {
      p.log(`announcement pass: request ${request.id} could not be closed (${message(closeError)}); the next claim releases it`);
    }
    return 'failed';
  }
}
