/**
 * The index watch's probe (brief 119, item C, W-102; migration 207): the rules in
 * `search-timing.ts` on a fake connection, and the built entry `dist/search-probe.js` as a process
 * with no secrets to read. No test reaches a database.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { PgClientLike, QueryResult } from '../src/db.js';
import {
  DOCTOR_EXEC_TIMEOUT_MS,
  PROBE_CLOSE_MS,
  PROBE_DEADLINE_MS,
  PROBE_EXEC_MARGIN_MS,
  PROBE_EXIT,
  SEARCH_TIMING_CALLS,
  SEARCH_TIMING_FUNCTION_BUDGET_MS,
  SEARCH_TIMING_SQL,
  SEARCH_TIMING_STATEMENT_TIMEOUT_MS,
  isNotDeployed,
  isOverBudget,
  measureSearch,
  parseTimings,
} from '../src/search-timing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT_PROBE = path.resolve(HERE, '..', 'dist', 'search-probe.js');
const MIGRATION_207 = path.resolve(HERE, '..', '..', 'db', 'migrations', '207_workspace_search_timing.sql');
/** A promise that never settles: a connect or a close that hangs. */
const never = (): Promise<never> => new Promise<never>(() => undefined);

const DSN = 'postgresql://workspace_runner.ref:s3cret-pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const CA = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n';
const ELEVEN = Object.freeze([23.7, 20.1, 21, 22, 23, 24, 25, 26, 27, 176.6, 19]);

type Step = 'connect' | 'set' | 'select' | 'end';

/** A scripted pg client: what each step returns or throws, and the statements it was sent. */
function fakeClient(script: Partial<Record<Step, () => unknown>> = {}) {
  const sent: string[] = [];
  const steps: Step[] = [];
  const run = async (step: Step): Promise<unknown> => {
    steps.push(step);
    return script[step]?.();
  };
  const client: PgClientLike = {
    connect: () => run('connect'),
    async query(sql: string): Promise<QueryResult> {
      sent.push(sql);
      const step: Step = sql.startsWith('set ') ? 'set' : 'select';
      const value = await run(step);
      return (value as QueryResult | undefined) ?? { rows: step === 'select' ? [{ calls_ms: [...ELEVEN] }] : [] };
    },
    end: () => run('end'),
    on: () => client,
  };
  return { client, sent, steps };
}

const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('parseTimings', () => {
  it('takes exactly eleven non-negative numbers, in order', () => {
    expect(parseTimings([...ELEVEN])).toEqual([...ELEVEN]);
    expect(parseTimings(Array(SEARCH_TIMING_CALLS).fill(0))).toHaveLength(11);
  });

  it('reads numbers the driver handed over as text', () => {
    expect(parseTimings(ELEVEN.map(String))).toEqual([...ELEVEN]);
  });

  it('refuses no array, the wrong count, and a value that is not a non-negative number', () => {
    expect(() => parseTimings(null)).toThrow(/no array/);
    expect(() => parseTimings('23.7')).toThrow(/no array/);
    expect(() => parseTimings(ELEVEN.slice(0, 10))).toThrow(/returned 10 times, expected 11/);
    expect(() => parseTimings([...ELEVEN, 1])).toThrow(/returned 12 times/);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, null, 'fast']) {
      expect(() => parseTimings([...ELEVEN.slice(0, 10), bad])).toThrow(/not a non-negative number/);
    }
  });
});

describe('isNotDeployed', () => {
  it('is the undefined-function SQLSTATE and nothing else', () => {
    expect(isNotDeployed(pgError('function public.workspace_search_timing() does not exist', '42883'))).toBe(true);
    expect(isNotDeployed(pgError('permission denied for function workspace_search_timing', '42501'))).toBe(false);
    expect(isNotDeployed(new Error('no code'))).toBe(false);
    expect(isNotDeployed(null)).toBe(false);
  });
});

/** measureSearch's deps over a fake client, checking it is handed the runner's DSN and CA. */
const deps = (fake: ReturnType<typeof fakeClient>, loadDb = () => ({ dsn: DSN, ca: CA })) => ({
  loadDb,
  newClient: (dsn: string, ca: string) => {
    expect(dsn).toBe(DSN);
    expect(ca).toBe(CA);
    return fake.client;
  },
});

describe('measureSearch', () => {

  it('sets the session limit, makes the one call, prints the eleven times and exits 0', async () => {
    const fake = fakeClient();
    const { line, exitCode } = await measureSearch(deps(fake));
    expect(exitCode).toBe(PROBE_EXIT.ok);
    expect(line).toEqual({ calls_ms: [...ELEVEN] });
    expect(fake.sent).toEqual([`set statement_timeout = ${SEARCH_TIMING_STATEMENT_TIMEOUT_MS}`, SEARCH_TIMING_SQL]);
    expect(fake.steps).toEqual(['connect', 'set', 'select', 'end']);
  });

  it('the session limit sits above the function budget (5 s) and under the role limit (15 s)', () => {
    expect(SEARCH_TIMING_STATEMENT_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(SEARCH_TIMING_STATEMENT_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it('a database without 207 is not_deployed, exit 3, and the connection is closed', async () => {
    const fake = fakeClient({ select: () => { throw pgError('function public.workspace_search_timing() does not exist', '42883'); } });
    const { line, exitCode } = await measureSearch(deps(fake));
    expect(exitCode).toBe(PROBE_EXIT.notDeployed);
    expect(line).toEqual({ error: 'not_deployed', message: 'function public.workspace_search_timing() does not exist' });
    expect(fake.steps.at(-1)).toBe('end');
  });

  it("a search stopped for time (57014: 207's budget or the session's limit) is over_budget, exit 4", async () => {
    const cases: Array<[Partial<Record<Step, () => unknown>>, RegExp]> = [
      [{ select: () => { throw pgError('workspace_search_timing: past its 5000 ms budget after 4 of 11 calls', '57014'); } }, /past its 5000 ms budget/],
      [{ select: () => { throw pgError('canceling statement due to statement timeout', '57014'); } }, /statement timeout/],
    ];
    for (const [script, message] of cases) {
      const fake = fakeClient(script);
      const { line, exitCode } = await measureSearch(deps(fake));
      expect(exitCode).toBe(PROBE_EXIT.overBudget);
      expect(line).toMatchObject({ error: 'over_budget' });
      expect((line as { message: string }).message).toMatch(message);
      expect(fake.steps.at(-1)).toBe('end');
    }
    expect(isOverBudget(pgError('x', '57014'))).toBe(true);
    expect(isOverBudget(pgError('x', '57P01'))).toBe(false);
    expect(isOverBudget(null)).toBe(false);
  });

  it('a refusal or a bad result is failed, exit 1', async () => {
    const cases: Array<[Partial<Record<Step, () => unknown>>, RegExp]> = [
      [{ select: () => { throw pgError('permission denied for function workspace_search_timing', '42501'); } }, /permission denied/],
      [{ select: () => ({ rows: [{ calls_ms: [1, 2, 3] }] }) }, /returned 3 times/],
      [{ select: () => ({ rows: [] }) }, /no array/],
      [{ set: () => { throw pgError('terminating connection due to administrator command', '57P01'); } }, /terminating/],
    ];
    for (const [script, message] of cases) {
      const fake = fakeClient(script);
      const { line, exitCode } = await measureSearch(deps(fake));
      expect(exitCode).toBe(PROBE_EXIT.failed);
      expect(line).toMatchObject({ error: 'failed' });
      expect((line as { message: string }).message).toMatch(message);
      expect(fake.steps.at(-1)).toBe('end');
    }
  });

  it('a failed connect is failed, and its message never holds the DSN, the password or the host', async () => {
    const fake = fakeClient({ connect: () => { throw new Error(`connect ECONNREFUSED ${DSN} (aws-0-us-east-1.pooler.supabase.com, s3cret-pass)`); } });
    const { line, exitCode } = await measureSearch(deps(fake));
    expect(exitCode).toBe(PROBE_EXIT.failed);
    const text = JSON.stringify(line);
    expect(text).not.toContain('s3cret-pass');
    expect(text).not.toContain('pooler.supabase.com');
    expect(text).not.toContain(DSN);
    expect(text).toContain('<redacted>');
  });

  it('secrets that cannot be read are config, exit 2, and no connection is made', async () => {
    const fake = fakeClient();
    const { line, exitCode } = await measureSearch(deps(fake, () => { throw new Error('the secret workspace_runner_db_url is missing or empty (read at /run/secrets/workspace_runner_db_url)'); }));
    expect(exitCode).toBe(PROBE_EXIT.config);
    expect(line).toEqual({ error: 'config', message: 'the secret workspace_runner_db_url is missing or empty (read at /run/secrets/workspace_runner_db_url)' });
    expect(fake.steps).toEqual([]);
  });

  it('a close that fails after a good measurement keeps the measurement', async () => {
    const fake = fakeClient({ end: () => { throw new Error('socket already closed'); } });
    const { line, exitCode } = await measureSearch(deps(fake));
    expect(exitCode).toBe(PROBE_EXIT.ok);
    expect(line).toEqual({ calls_ms: [...ELEVEN] });
  });
});

describe('the time budget', () => {
  it('a connect that hangs is given up at the deadline: failed, exit 1, and the close is not waited on forever', async () => {
    const fake = fakeClient({ connect: never, end: never });
    const started = Date.now();
    const { line, exitCode } = await measureSearch({ ...deps(fake), deadlineMs: 50, closeMs: 20 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(exitCode).toBe(PROBE_EXIT.failed);
    expect(line).toEqual({ error: 'failed', message: 'the probe gave up after 50 ms (connect and call together)' });
  });

  it('a call that hangs is given up at the deadline too', async () => {
    const fake = fakeClient({ select: never });
    const { line, exitCode } = await measureSearch({ ...deps(fake), deadlineMs: 50, closeMs: 20 });
    expect(exitCode).toBe(PROBE_EXIT.failed);
    expect((line as { message: string }).message).toMatch(/gave up after 50 ms/);
  });

  it('a close that hangs after a good measurement keeps the measurement and returns', async () => {
    const fake = fakeClient({ end: never });
    const { line, exitCode } = await measureSearch({ ...deps(fake), closeMs: 20 });
    expect(exitCode).toBe(PROBE_EXIT.ok);
    expect(line).toEqual({ calls_ms: [...ELEVEN] });
  });

  it("the probe is done well inside the doctor's exec limit: deadline + close + margin <= 30 s", () => {
    expect(DOCTOR_EXEC_TIMEOUT_MS).toBe(30_000);
    expect(PROBE_EXEC_MARGIN_MS).toBeGreaterThanOrEqual(5_000);
    expect(PROBE_DEADLINE_MS + PROBE_CLOSE_MS + PROBE_EXEC_MARGIN_MS).toBeLessThanOrEqual(DOCTOR_EXEC_TIMEOUT_MS);
  });

  it("inside the probe: 207's budget < the session's statement_timeout < the probe's deadline", () => {
    expect(SEARCH_TIMING_FUNCTION_BUDGET_MS).toBeLessThan(SEARCH_TIMING_STATEMENT_TIMEOUT_MS);
    expect(SEARCH_TIMING_STATEMENT_TIMEOUT_MS).toBeLessThan(PROBE_DEADLINE_MS);
  });

  it('207 holds the budget this file names', () => {
    const sql = fs.readFileSync(MIGRATION_207, 'utf8');
    expect(sql).toMatch(new RegExp(String.raw`c_budget_ms\s+constant double precision := ${SEARCH_TIMING_FUNCTION_BUDGET_MS};`));
  });
});

describe('the built probe', () => {
  it('with no secrets to read, prints one config line and exits 2', () => {
    const env = { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '' };
    const run = spawnSync(process.execPath, [BUILT_PROBE], { encoding: 'utf8', env, timeout: 30_000 });
    expect(run.status).toBe(PROBE_EXIT.config);
    const lines = run.stdout.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0] ?? '') as { error: string; message: string };
    expect(line.error).toBe('config');
    expect(line.message).toMatch(/workspace_runner_db_url/);
  });
});
