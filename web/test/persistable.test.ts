/**
 * The persisted cache keeps only data that comes back from JSON unchanged (2026-11-11).
 *
 * The Inbox's session labels were a Map; the localStorage persister wrote it as `{}`,
 * and the restored `{}` crashed the Inbox (PR #141). That query is fixed, but nothing
 * stopped the next query doing the same. `shouldPersistQuery` now refuses to save a
 * query whose data is not plain JSON, so such a query is fetched fresh instead of
 * restored broken.
 */

import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { isJsonSafe, shouldPersistQuery } from '@/lib/persistable';

describe('isJsonSafe', () => {
  it('accepts plain JSON values', () => {
    for (const value of [null, 'a', 0, -1.5, true, [], {}, [1, 'a', null], { a: { b: [1, { c: 'd' }] } }]) {
      expect(isJsonSafe(value)).toBe(true);
    }
  });

  it('accepts an object key that is undefined (JSON drops it, and it reads back undefined)', () => {
    expect(isJsonSafe({ a: undefined, b: 1 })).toBe(true);
  });

  it('refuses what JSON changes on the way back', () => {
    const cases: unknown[] = [
      new Map([[1, 'a']]),
      new Set([1]),
      new Date(0),
      Number.NaN,
      Number.POSITIVE_INFINITY,
      10n,
      () => 1,
      Symbol('s'),
      [undefined],
      { nested: [new Map()] },
      new (class Row {
        id = 1;
      })(),
    ];
    for (const value of cases) expect(isJsonSafe(value)).toBe(false);
  });

  it('refuses a cycle instead of looping', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(isJsonSafe(loop)).toBe(false);
  });
});

describe('shouldPersistQuery', () => {
  async function cacheWith(data: unknown): Promise<QueryClient> {
    const client = new QueryClient();
    await client.fetchQuery({ queryKey: ['probe'], queryFn: async () => data });
    return client;
  }

  it('persists a successful query with plain data', async () => {
    const client = await cacheWith([[82, 'Tue, Oct 27 · Firewalls I']]);
    const state = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery });
    expect(state.queries.map((q) => q.queryKey)).toEqual([['probe']]);
  });

  it('leaves a Map out of the saved cache, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = await cacheWith(new Map([[82, 'Firewalls I']]));
    const state = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery });
    expect(state.queries).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('["probe"]'));
    warn.mockRestore();

    // What the next load restores: nothing for this key, so it is fetched, not read as `{}`.
    const restored = new QueryClient();
    hydrate(restored, JSON.parse(JSON.stringify(state)));
    expect(restored.getQueryData(['probe'])).toBeUndefined();
  });
});
