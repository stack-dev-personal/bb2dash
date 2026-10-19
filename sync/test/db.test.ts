// 164 and 200: the runner's calls sync_file_outside_link and sync_file_text_put, as typed functions over a bare query.

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

describe('fileTextPut (migration 200)', () => {
  const units = [{ unit_kind: 'page', unit_no: 1, text: 'one' }, { unit_kind: 'page', unit_no: 2, text: 'two' }];

  it('calls sync_file_text_put with the id as a bigint and the units as one jsonb parameter', async () => {
    const { rpc, query } = rpcOver([{ inserted: 2, present: 0 }]);
    expect(await rpc.fileTextPut('3736', units)).toEqual({ inserted: 2, present: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toBe('select inserted, present from public.sync_file_text_put($1::bigint, $2::jsonb)');
    expect(params).toEqual(['3736', JSON.stringify(units)]);
    // The text is never spliced into the SQL text.
    expect(sql).not.toContain('one');
  });

  it('reads pg\'s answer as numbers, text included, and checks they add up to the units sent', async () => {
    expect(await rpcOver([{ inserted: '0', present: '2' }]).rpc.fileTextPut('1', units)).toEqual({ inserted: 0, present: 2 });
    await expect(rpcOver([]).rpc.fileTextPut('1', units)).rejects.toThrow(/no answer/);
    await expect(rpcOver([{ inserted: null, present: 2 }]).rpc.fileTextPut('1', units)).rejects.toThrow(/not whole numbers/);
    await expect(rpcOver([{ inserted: 1, present: 0 }]).rpc.fileTextPut('1', units)).rejects.toThrow(/1 \+ 0 is not the 2 units sent/);
  });

  it('refuses an id that is not a numeric id before it asks the database anything', async () => {
    const { rpc, query } = rpcOver([{ inserted: 2, present: 0 }]);
    await expect(rpc.fileTextPut('1 or 1=1', units)).rejects.toThrow(/numeric id/);
    expect(query).not.toHaveBeenCalled();
  });

  it('lets a database refusal through as an error', async () => {
    const query = vi.fn<QueryFn>(async () => {
      throw new Error('sync_file_text_put: a (unit_kind, unit_no) appears twice');
    });
    await expect(createRpc(query).fileTextPut('1', units)).rejects.toThrow(/appears twice/);
  });
});
