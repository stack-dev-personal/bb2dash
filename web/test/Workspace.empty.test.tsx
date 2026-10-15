/**
 * The Workspace with nothing in it (Phase 21, wave 2b; rewritten for Phase 24b,
 * brief 111, task 8, W-87).
 *
 * This file pinned the empty message column's start line ("Ask a question to
 * start a conversation.", `data-column-empty="start"`), which the lobby
 * replaces: with no conversation the page shows the lobby, whose root carries
 * `data-lobby` (brief 111, "Data attributes, final"). It now pins the lobby
 * with no rows anywhere: the greeting, an empty composer with its placeholder
 * and Ask enabled, the one line for no conversations, and no routine, example
 * or recent row invented. And on the server: no cached row is drawn before
 * hydration.
 *
 * The thread's two empty states that stay (`data-column-empty="loading"` and
 * `"missing"`, the not-found line, the 23503 case and the disabled composer on
 * an id that was not found) are the thread's, W-88's, and are held by its
 * screen tests; the composer's own `disabled` case is in
 * `Composer.chips.test.tsx`.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { db, resetDb, settle } from './composer-fake';

vi.mock('@/lib/supabase/client', async () => (await import('./composer-fake')).supabaseClientMock());

const labels = await import('@/lib/workspace-labels');
const { Lobby } = await import('@/components/workspace/Lobby');
const { conversationsOptions } = await import('@/lib/queries.workspace');
const { routinesOptions } = await import('@/lib/queries.workspace-routines');

const NOW = Date.parse('2026-10-15T16:00:00Z');

function tree(client = newQueryClient()) {
  return (
    <QueryClientProvider client={client}>
      <Lobby now={NOW} onCreated={() => undefined} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetDb();
});

describe('the lobby with no rows anywhere', () => {
  it('greets, offers an empty composer, says there are no conversations, and invents nothing', async () => {
    const { container } = render(tree());
    await screen.findByText(labels.NO_CONVERSATIONS_LINE);
    await settle();

    expect(container.querySelector('[data-lobby]')).not.toBeNull();
    expect(container.querySelector('[data-column-empty]')).toBeNull();
    expect(screen.queryByText(labels.COLUMN_START_LINE)).toBeNull();
    expect(screen.getByText(labels.GREETING_LINE)).toBeInTheDocument();

    const box = screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
    expect(box).toHaveValue('');
    expect(box).toHaveAttribute('placeholder', labels.QUESTION_PLACEHOLDER);
    expect(screen.getByRole('button', { name: labels.ASK_LABEL })).toBeEnabled();

    expect(screen.queryByText(labels.ROUTINES_HEADING)).toBeNull();
    expect(screen.queryByText(labels.EXAMPLES_HEADING)).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(db.state.rpcCalls).toEqual([]);
  });
});

describe('on the server', () => {
  it('draws the greeting and the composer, and no cached row before hydration', () => {
    const client = newQueryClient();
    client.setQueryData(conversationsOptions(false).queryKey, [
      { id: '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11', title: 'A cached title', archived: false, created_at: null, updated_at: null },
    ]);
    client.setQueryData(routinesOptions().queryKey, [
      { id: 'quiz', grp: 'study', title: 'A cached routine', description: 'd', needs: 'nothing', sort: 1, enabled: true },
    ]);
    const html = renderToString(tree(client));

    expect(html).toContain(labels.GREETING_LINE);
    expect(html).toContain(labels.QUESTION_PLACEHOLDER);
    expect(html).toContain('data-lobby');
    expect(html).not.toContain('A cached title');
    expect(html).not.toContain('A cached routine');
    expect(html).not.toContain(labels.NO_CONVERSATIONS_LINE);
  });
});
