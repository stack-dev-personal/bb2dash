/**
 * The Inbox's session labels survive the persisted query cache.
 *
 * `QueryProvider` saves every query to localStorage as JSON and restores it on the
 * next load. A `Map` written that way comes back as `{}`, and the candidate buttons'
 * `sessionLabels.get(...)` then threw "c?.get is not a function": the whole Inbox fell
 * to Next's "This page couldn't load" whenever a session question was open
 * (2026-11-11, item 9206). The query now caches plain pairs and builds the Map in
 * `select`, which runs on restored data too.
 */

import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeAttentionItem } from './factories';

const SESSIONS = [
  { id: 82, session_date: '2026-10-27', topic: 'Firewalls I', kind: 'lecture' },
  { id: 83, session_date: '2026-10-29', topic: 'Firewalls II', kind: 'lecture' },
];

const candidateItem = makeAttentionItem({
  id: 9206,
  kind: 'stack_must_confirm',
  state: 'open',
  course_id: 'IST.323',
  entity: 'bb_file',
  ref: 'session_link/5052',
  field: 'session_id',
  from_value: null,
  to_value: [82, 83],
  question: 'IST.323: the file "Lecture#10.pptx" belongs to week 10, which has 2 class sessions. Which session is it for?',
  suggested: {
    source: 'link_file_sessions',
    file_id: 5052,
    week_no: 10,
    candidates: [82, 83],
    answer_with: '{"session_id": <one of candidates>} or {"accept": "none"}',
  },
});

const tables: Record<string, unknown[]> = { sessions: SESSIONS, attention_items: [candidateItem] };

function chain(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is', 'or', 'gte', 'lte', 'not']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: tables[table] ?? [], error: null, count: 0 });
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => chain(table), rpc: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/inbox/InboxApplyButton', () => ({ InboxApplyButton: () => null }));

const { sessionLabelsOptions } = await import('@/lib/queries.inboxChoice');
const { default: Inbox } = await import('@/app/(app)/inbox/Inbox');

/** What the localStorage persister does to a cache: JSON out, JSON back in. */
function throughLocalStorage(source: QueryClient): QueryClient {
  const restored = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  hydrate(restored, JSON.parse(JSON.stringify(dehydrate(source))));
  return restored;
}

describe('session labels in the persisted cache', () => {
  it('caches data that survives a JSON round trip', async () => {
    const client = new QueryClient();
    const cached = await client.fetchQuery(sessionLabelsOptions([82, 83]));
    expect(JSON.parse(JSON.stringify(cached))).toEqual(cached);
  });

  it('still reads as a Map after the cache is restored', async () => {
    const source = new QueryClient();
    await source.fetchQuery(sessionLabelsOptions([82, 83]));
    const restored = throughLocalStorage(source);
    const options = sessionLabelsOptions([82, 83]);
    const labels = options.select!(restored.getQueryData(options.queryKey)!);
    expect(labels.get(82)).toContain('Firewalls I');
    expect(labels.get(83)).toContain('Firewalls II');
  });

  it('draws the Inbox from a restored cache instead of crashing', async () => {
    const source = new QueryClient();
    await source.fetchQuery(sessionLabelsOptions([82, 83]));
    const restored = throughLocalStorage(source);
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      render(
        <QueryClientProvider client={restored}>
          <Inbox />
        </QueryClientProvider>,
      );
      expect(await screen.findByRole('button', { name: /Firewalls I\b/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Firewalls II/ })).toBeTruthy();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
  });
});
