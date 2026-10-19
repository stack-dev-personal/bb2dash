/**
 * The index watch's measurement (brief 119, item C, W-102; migration 207): one call of
 * `workspace_search_timing()` as the runner's own login, and its eleven times in milliseconds.
 *
 * The doctor of bb2dash-stack runs the entry, `search-probe.ts`, inside the `workspace` container
 * (`docker compose exec -T workspace node /app/workspace/dist/search-probe.js`) and judges the median
 * itself. This file holds the rules, so the tests run them on fakes: what the line printed is, how a
 * result is read, and which failure is which.
 *
 * It prints one JSON line on stdout, whatever happens:
 *
 *   {"calls_ms":[23.7, ...]}                         exit 0   the eleven times, in call order
 *   {"error":"not_deployed","message":"..."}         exit 3   the function is not on the database yet (42883)
 *   {"error":"over_budget","message":"..."}          exit 4   the search ran past its time limit (57014):
 *                                                             the doctor reads this as `move`
 *   {"error":"failed","message":"..."}               exit 1   anything else on the way
 *   {"error":"config","message":"..."}               exit 2   the runner's secrets could not be read
 *
 * No message holds the DSN, its password or its host (`redactDsn`); the function returns numbers
 * only, so no text of the store can reach the line either.
 */

import { redactDsn, type PgClientLike } from './db.js';
import { messageOf } from './errors.js';

/** The one statement: 207's function, which takes nothing and returns double precision[]. */
export const SEARCH_TIMING_SQL = 'select public.workspace_search_timing() as calls_ms';
/** How many times the function returns (one warm-up is made and not reported). */
export const SEARCH_TIMING_CALLS = 11;
/** 207's own budget on its eleven calls (`c_budget_ms`): past it, the function stops with 57014. */
export const SEARCH_TIMING_FUNCTION_BUDGET_MS = 5_000;
/**
 * The session's own limit on the call, set before it: above the function's budget (it stops itself
 * first when it can, with its own message) and under the role's 15 s.
 */
export const SEARCH_TIMING_STATEMENT_TIMEOUT_MS = 10_000;
/**
 * The probe's whole budget, from the first connect to the line: past it the probe prints
 * `failed` and exits whatever the connection is doing. It replaces the driver's own bounds
 * (10 s to connect, 20 s a query), which together could outlast the doctor.
 */
export const PROBE_DEADLINE_MS = 20_000;
/** How long the probe waits for the connection to close once it has its answer. */
export const PROBE_CLOSE_MS = 1_000;
/**
 * bb2dash-stack's doctor kills `docker compose exec` after this long (its DOCKER_TIMEOUT_MS). The
 * probe must be done well inside it: PROBE_DEADLINE_MS + PROBE_CLOSE_MS + PROBE_EXEC_MARGIN_MS
 * may not pass it (test/search-timing.test.ts pins the relation; the doctor pins its side).
 */
export const DOCTOR_EXEC_TIMEOUT_MS = 30_000;
/** Room left for docker compose exec and node's own start. */
export const PROBE_EXEC_MARGIN_MS = 5_000;

const SET_STATEMENT_TIMEOUT_SQL = `set statement_timeout = ${SEARCH_TIMING_STATEMENT_TIMEOUT_MS}`;

/** Postgres' "undefined function": 207 is not applied yet. */
const UNDEFINED_FUNCTION = '42883';
/** Postgres' "query canceled": 207's own budget, or the session's statement_timeout. Either way the search was too slow. */
const QUERY_CANCELED = '57014';

export const PROBE_EXIT = Object.freeze({ ok: 0, failed: 1, config: 2, notDeployed: 3, overBudget: 4 });

export type ProbeLine =
  | { readonly calls_ms: readonly number[] }
  | { readonly error: 'not_deployed' | 'over_budget' | 'failed' | 'config'; readonly message: string };

/** The eleven times as the function returned them; anything else is refused with what was wrong. */
export function parseTimings(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('workspace_search_timing returned no array');
  if (value.length !== SEARCH_TIMING_CALLS) {
    throw new Error(`workspace_search_timing returned ${value.length} times, expected ${SEARCH_TIMING_CALLS}`);
  }
  const times = value.map((item) => (typeof item === 'string' ? Number(item) : item));
  if (!times.every((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0)) {
    throw new Error('workspace_search_timing returned a time that is not a non-negative number');
  }
  return times;
}

const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null | undefined)?.code;

/** True when the database says the function does not exist: 207 is not applied. */
export function isNotDeployed(error: unknown): boolean {
  return codeOf(error) === UNDEFINED_FUNCTION;
}

/** True when the database stopped the call for time: 207's budget, or the session's statement_timeout. */
export function isOverBudget(error: unknown): boolean {
  return codeOf(error) === QUERY_CANCELED;
}

export interface MeasureDeps {
  /** The runner's DSN and pinned CA, as the runner reads them; throws when they cannot be read. */
  readonly loadDb: () => { readonly dsn: string; readonly ca: string };
  readonly newClient: (dsn: string, ca: string) => PgClientLike;
  /** The whole budget; PROBE_DEADLINE_MS unless a test shortens it. */
  readonly deadlineMs?: number;
  /** The wait for the close; PROBE_CLOSE_MS unless a test shortens it. */
  readonly closeMs?: number;
}

/** Thrown when the deadline passes; never leaves this file. */
class DeadlineError extends Error {}

/** `work`, or a DeadlineError once `ms` have passed. The timer never holds the process open. */
async function within<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(message)), ms);
    timer.unref();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** One measurement: the line to print and the exit code. Never throws, and settles within the deadline and the close. */
export async function measureSearch(deps: MeasureDeps): Promise<{ line: ProbeLine; exitCode: number }> {
  const deadlineMs = deps.deadlineMs ?? PROBE_DEADLINE_MS;
  const closeMs = deps.closeMs ?? PROBE_CLOSE_MS;
  let db: { dsn: string; ca: string };
  try {
    db = deps.loadDb();
  } catch (error) {
    return { line: { error: 'config', message: messageOf(error) }, exitCode: PROBE_EXIT.config };
  }

  let client: PgClientLike | null = null;
  try {
    const opened = deps.newClient(db.dsn, db.ca);
    client = opened;
    // A connection error after connect is reported by the query that meets it; this keeps it from crashing the process.
    opened.on('error', () => undefined);
    const times = await within(
      (async () => {
        await opened.connect();
        await opened.query(SET_STATEMENT_TIMEOUT_SQL);
        const result = await opened.query(SEARCH_TIMING_SQL);
        return parseTimings(result.rows[0]?.calls_ms);
      })(),
      deadlineMs,
      `the probe gave up after ${deadlineMs} ms (connect and call together)`,
    );
    return { line: { calls_ms: times }, exitCode: PROBE_EXIT.ok };
  } catch (error) {
    const message = redactDsn(messageOf(error), db.dsn);
    if (isNotDeployed(error)) return { line: { error: 'not_deployed', message }, exitCode: PROBE_EXIT.notDeployed };
    if (isOverBudget(error)) return { line: { error: 'over_budget', message }, exitCode: PROBE_EXIT.overBudget };
    return { line: { error: 'failed', message }, exitCode: PROBE_EXIT.failed };
  } finally {
    if (client !== null) {
      try {
        await within(client.end(), closeMs, 'close');
      } catch {
        // The answer is already decided; a socket that will not close in time changes nothing in it,
        // and the entry exits once the line is written.
      }
    }
  }
}
