/**
 * The index watch's probe (brief 119, item C, W-102; migration 207): the rules in
 * `search-timing.ts` on a fake connection, and the built entry `dist/search-probe.js` as a process
 * with no secrets to read. No test reaches a database.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { PgClientLike, QueryResult } from '../src/db.js';
import {
  PROBE_EXIT,
  SEARCH_TIMING_CALLS,
  SEARCH_TIMING_SQL,
  SEARCH_TIMING_STATEMENT_TIMEOUT_MS,
  isNotDeployed,
  measureSearch,
  parseTimings,
} from '../src/search-timing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT_PROBE = path.resolve(HERE, '..', 'dist', 'search-probe.js');

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

describe('measureSearch', () => {
  const deps = (fake: ReturnType<typeof fakeClient>, loadDb = () => ({ dsn: DSN, ca: CA })) => ({
    loadDb,
    newClient: (dsn: string, ca: string) => {
      expect(dsn).toBe(DSN);
      expect(ca).toBe(CA);
      return fake.client;
    },
  });

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

  it('a refusal, a timeout or a bad result is failed, exit 1', async () => {
    const cases: Array<[Partial<Record<Step, () => unknown>>, RegExp]> = [
      [{ select: () => { throw pgError('permission denied for function workspace_search_timing', '42501'); } }, /permission denied/],
      [{ select: () => { throw pgError('workspace_search_timing: past its 5000 ms budget after 4 of 11 calls', '57014'); } }, /budget/],
      [{ select: () => ({ rows: [{ calls_ms: [1, 2, 3] }] }) }, /returned 3 times/],
      [{ select: () => ({ rows: [] }) }, /no array/],
      [{ set: () => { throw pgError('canceling statement', '57014'); } }, /canceling/],
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
