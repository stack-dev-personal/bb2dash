/**
 * The error screens (2026-11-11): the screen-level error screen in the shell and the
 * Inbox's per-item boundary. Before them, one card's error (PR #141) dropped the
 * whole page to Next's bare "This page couldn't load".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeAttentionItem } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { ErrorScreen, errorDetail, ERROR_SCREEN_TITLE, RETRY_LABEL, CLEAR_LABEL, HOME_LABEL } = await import(
  '@/components/shell/ErrorScreen'
);
const { default: AppError } = await import('@/app/(app)/error');
const { PERSIST_KEY } = await import('@/lib/query-provider');
const { InboxView } = await import('@/app/(app)/inbox/Inbox');
const { ITEM_ERROR_TITLE } = await import('@/components/inbox/InboxItemBoundary');

/** React reports a caught render error on window; keep it out of the run's output. */
function quietly<T>(run: () => T): T {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const swallow = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener('error', swallow);
  try {
    return run();
  } finally {
    window.removeEventListener('error', swallow);
    spy.mockRestore();
  }
}

describe('ErrorScreen', () => {
  it('names the error and offers three ways out', () => {
    quietly(() => render(<ErrorScreen error={new Error('c?.get is not a function')} retry={vi.fn()} />));
    expect(screen.getByRole('heading', { name: ERROR_SCREEN_TITLE })).toBeTruthy();
    expect(screen.getByText('c?.get is not a function')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: CLEAR_LABEL })).toBeTruthy();
    expect(screen.getByRole('link', { name: HOME_LABEL }).getAttribute('href')).toBe('/');
  });

  it('Try again calls retry', () => {
    const retry = vi.fn();
    quietly(() => render(<ErrorScreen error={new Error('x')} retry={retry} />));
    fireEvent.click(screen.getByRole('button', { name: RETRY_LABEL }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Clear saved data drops the persisted cache, then reloads', () => {
    window.localStorage.setItem(PERSIST_KEY, '{"clientState":{}}');
    const reload = vi.fn();
    quietly(() => render(<ErrorScreen error={new Error('x')} retry={vi.fn()} reload={reload} />));
    fireEvent.click(screen.getByRole('button', { name: CLEAR_LABEL }));
    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the digest of a server error and copes with no message', () => {
    expect(errorDetail(Object.assign(new Error('Server failed'), { digest: 'abc123' }))).toBe(
      'Server failed (digest abc123)',
    );
    expect(errorDetail(new Error(''))).toBe('No message.');
  });

  it('is what the (app) segment renders on an error', () => {
    quietly(() => render(<AppError error={new Error('boom')} retry={vi.fn()} />));
    expect(screen.getByRole('heading', { name: ERROR_SCREEN_TITLE })).toBeTruthy();
  });
});

describe('Inbox per-item boundary', () => {
  const sessionQuestion = makeAttentionItem({
    id: 9206,
    kind: 'stack_must_confirm',
    state: 'open',
    entity: 'bb_file',
    ref: 'session_link/5052',
    field: 'session_id',
    to_value: [82, 83],
    question: 'Which session is the firewalls file for?',
    suggested: {
      source: 'link_file_sessions',
      file_id: 5052,
      week_no: 10,
      candidates: [82, 83],
      answer_with: '{"session_id": <one of candidates>} or {"accept": "none"}',
    },
  });
  const conflict = makeAttentionItem({
    id: 9205,
    kind: 'conflict',
    state: 'open',
    entity: 'assignment',
    ref: 'ECN.304/quiz-6',
    field: 'due_at',
    from_value: '2026-10-27',
    to_value: '2026-10-31T22:08:50.461+00:00',
    question: 'bb2dash has "Quiz 6" due 2026-10-27; Blackboard says 2026-10-31 18:08.',
    suggested: { source: 'stage_assignments' },
  });

  it('draws a failing item as one short card and keeps the others', () => {
    // The 2026-11-11 crash: labels restored from the saved cache as `{}`, not a Map.
    const broken = {} as unknown as ReadonlyMap<number, string>;
    quietly(() =>
      render(
        <InboxView items={[sessionQuestion, conflict]} status={null} onResolve={vi.fn()} sessionLabels={broken} />,
      ),
    );
    expect(screen.getByText(ITEM_ERROR_TITLE, { exact: false })).toBeTruthy();
    expect(screen.getByText('(item 9206)')).toBeTruthy();
    expect(screen.getByText(/Quiz 6/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeTruthy();
  });
});
