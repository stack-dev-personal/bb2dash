/**
 * The Inbox's read of `attention_items` asks for `workspace_proposal_id`, the checked link 205 adds
 * (Phase 25b, R2-8), so an `assistant_proposal` item finds its proposal through it. Vercel deploys on
 * merge and 205 goes on at the cut-over: for that window the column does not exist (42703), and the
 * read is made again without it rather than leave the whole Inbox unread.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const selects: string[] = [];
const answers: { data: unknown; error: unknown }[] = [];

function chain() {
  const builder: Record<string, unknown> = {};
  builder.select = (columns: string) => {
    selects.push(columns);
    return builder;
  };
  for (const method of ['eq', 'order']) builder[method] = () => builder;
  builder.then = (resolve: (value: unknown) => unknown) => resolve(answers.shift() ?? { data: [], error: null });
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ from: () => chain() }) }));

const { attentionItemsOptions } = await import('@/lib/queries.sync');

async function read(): Promise<unknown> {
  const fn = attentionItemsOptions().queryFn as (context: unknown) => Promise<unknown>;
  return fn({ signal: new AbortController().signal });
}

beforeEach(() => {
  selects.length = 0;
  answers.length = 0;
});

describe('the attention_items read', () => {
  it('asks for workspace_proposal_id', async () => {
    answers.push({ data: [{ id: 1, workspace_proposal_id: 7 }], error: null });
    await expect(read()).resolves.toEqual([{ id: 1, workspace_proposal_id: 7 }]);
    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatch(/\bworkspace_proposal_id\b/);
  });

  it('before the cut-over (42703), reads again without it, once, and says it once in the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    answers.push({ data: null, error: { code: '42703', message: 'column attention_items.workspace_proposal_id does not exist' } });
    answers.push({ data: [{ id: 1 }], error: null });
    await expect(read()).resolves.toEqual([{ id: 1 }]);
    expect(selects).toHaveLength(2);
    expect(selects[1]).not.toMatch(/workspace_proposal_id/);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('throws any other error as it did', async () => {
    answers.push({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(read()).rejects.toMatchObject({ code: '42501' });
    expect(selects).toHaveLength(1);
  });
});
