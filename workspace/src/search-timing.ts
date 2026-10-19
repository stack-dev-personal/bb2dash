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
 *   {"error":"not_deployed","message":"..."}         exit 3   the function is not on the database yet
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
/**
 * The session's own limit on the call, set before it. Above the function's 5 s budget (it stops
 * itself first when it can, with its own message), under the role's 15 s and under the doctor's
 * 30 s for the whole `docker compose exec`.
 */
export const SEARCH_TIMING_STATEMENT_TIMEOUT_MS = 10_000;
const SET_STATEMENT_TIMEOUT_SQL = `set statement_timeout = ${SEARCH_TIMING_STATEMENT_TIMEOUT_MS}`;

/** Postgres' "undefined function": 207 is not applied yet. */
const UNDEFINED_FUNCTION = '42883';

export const PROBE_EXIT = Object.freeze({ ok: 0, failed: 1, config: 2, notDeployed: 3 });

export type ProbeLine =
  | { readonly calls_ms: readonly number[] }
  | { readonly error: 'not_deployed' | 'failed' | 'config'; readonly message: string };

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

/** True when the database says the function does not exist: 207 is not applied. */
export function isNotDeployed(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === UNDEFINED_FUNCTION;
}

export interface MeasureDeps {
  /** The runner's DSN and pinned CA, as the runner reads them; throws when they cannot be read. */
  readonly loadDb: () => { readonly dsn: string; readonly ca: string };
  readonly newClient: (dsn: string, ca: string) => PgClientLike;
}

/** One measurement: the line to print and the exit code. Never throws. */
export async function measureSearch(deps: MeasureDeps): Promise<{ line: ProbeLine; exitCode: number }> {
  let db: { dsn: string; ca: string };
  try {
    db = deps.loadDb();
  } catch (error) {
    return { line: { error: 'config', message: messageOf(error) }, exitCode: PROBE_EXIT.config };
  }

  let client: PgClientLike | null = null;
  try {
    client = deps.newClient(db.dsn, db.ca);
    // A connection error after connect is reported by the query that meets it; this keeps it from crashing the process.
    client.on('error', () => undefined);
    await client.connect();
    await client.query(SET_STATEMENT_TIMEOUT_SQL);
    const result = await client.query(SEARCH_TIMING_SQL);
    const times = parseTimings(result.rows[0]?.calls_ms);
    return { line: { calls_ms: times }, exitCode: PROBE_EXIT.ok };
  } catch (error) {
    const message = redactDsn(messageOf(error), db.dsn);
    if (isNotDeployed(error)) return { line: { error: 'not_deployed', message }, exitCode: PROBE_EXIT.notDeployed };
    return { line: { error: 'failed', message }, exitCode: PROBE_EXIT.failed };
  } finally {
    if (client !== null) {
      try {
        await client.end();
      } catch {
        // The answer is already decided; a socket that will not close cleanly changes nothing in it.
      }
    }
  }
}
