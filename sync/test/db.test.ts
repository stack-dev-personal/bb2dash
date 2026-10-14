// 164: the runner's one new call, sync_file_outside_link, as a typed function over a bare query.

import { describe, expect, it, vi } from 'vitest';

import { createRpc, type QueryFn } from '../src/db.js';

function rpcOver(answer: Record<string, unknown>[]) {
  const query = vi.fn<QueryFn>(async () => ({ rows: answer }));
  return { rpc: createRpc(query), query };
}

describe('fileOutsideLink (migration 164)', () => {
  it('calls sync_file_outside_link with the id as a bigint and the link as a parameter', async () => {
    const { rpc, query } = rpcOver([{ ok: true }]);
    const url = 'https://www.cbo.gov/x.pdf';
    expect(await rpc.fileOutsideLink('3711', url)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toBe('select public.sync_file_outside_link($1::bigint, $2) as ok');
    expect(params).toEqual(['3711', url]);
    // The link is never spliced into the SQL text.
    expect(sql).not.toContain('cbo.gov');
  });

  it('is true only on an exact true: false, null and no row all read as "not saved"', async () => {
    expect(await rpcOver([{ ok: false }]).rpc.fileOutsideLink('1', 'https://a.example/x')).toBe(false);
    expect(await rpcOver([{ ok: null }]).rpc.fileOutsideLink('1', 'https://a.example/x')).toBe(false);
    expect(await rpcOver([]).rpc.fileOutsideLink('1', 'https://a.example/x')).toBe(false);
  });

  it('refuses an id that is not a numeric id before it asks the database anything', async () => {
    const { rpc, query } = rpcOver([{ ok: true }]);
    await expect(rpc.fileOutsideLink('3711; drop table bb_files', 'https://a.example/x')).rejects.toThrow(/numeric id/);
    expect(query).not.toHaveBeenCalled();
  });

  it('lets a database refusal through as an error', async () => {
    const query = vi.fn<QueryFn>(async () => {
      throw new Error('sync_file_outside_link: url is not a usable link');
    });
    await expect(createRpc(query).fileOutsideLink('1', 'ftp://x')).rejects.toThrow(/not a usable link/);
  });
});
