/**
 * The stop guard (Phase 24b, brief 111, task 6; "Stop").
 *
 * After the page marks a turn stopped, a later `delta`, `sources` or `done` for
 * that request changes nothing, and an event name the hook does not subscribe
 * to is never dispatched. What came before the mark stays on the view.
 * `markStopped` is stable across renders, so the page's Stop can hold it.
 *
 * The reducer is folded by hand, and the hook runs over the fake client in
 * `workspace-harness.tsx`, which records every call in order.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { joined, resetFake, wrapperFor } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);

const { initialStreamState, streamReducer, streamView, useWorkspaceStream } = await import(
  '@/lib/use-workspace-stream'
);

type StreamEvent = Parameters<typeof streamReducer>[1];
type WithoutTopic<T> = T extends unknown ? Omit<T, 'topic'> : never;

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const TOPIC_A = `workspace:${A}`;
const REQUEST = 42;

function fold(events: readonly WithoutTopic<StreamEvent>[], from = initialStreamState(TOPIC_A)) {
  return events.reduce((state, event) => streamReducer(state, { ...event, topic: TOPIC_A }), from);
}

const delta = (seq: number, text: string, requestId = REQUEST) => ({
  type: 'delta' as const,
  requestId,
  seq,
  delta: text,
});
const stopped = (requestId = REQUEST) => ({ type: 'stopped' as const, requestId });

beforeEach(() => {
  resetFake();
});

describe('the reducer: nothing moves a stopped request', () => {
  it('marks the request stopped and keeps the text that came before', () => {
    const state = fold([delta(1, 'The syllabus '), delta(2, 'says'), stopped()]);
    expect(streamView(state, TOPIC_A, REQUEST)).toMatchObject({ text: 'The syllabus says', stopped: true });
  });

  it('changes nothing for a delta after the stopped mark', () => {
    const marked = fold([delta(1, 'a'), stopped()]);
    expect(streamReducer(marked, { ...delta(2, 'b'), topic: TOPIC_A })).toBe(marked);
    expect(streamView(marked, TOPIC_A, REQUEST).text).toBe('a');
  });

  it('changes nothing for a sources event after the stopped mark', () => {
    const marked = fold([stopped()]);
    const after = streamReducer(marked, {
      type: 'sources',
      topic: TOPIC_A,
      requestId: REQUEST,
      state: 'found',
      foundN: 3,
    });
    expect(after).toBe(marked);
    expect(streamView(after, TOPIC_A, REQUEST).sources).toBeNull();
  });

  it('changes nothing for a done after the stopped mark', () => {
    const marked = fold([delta(1, 'a'), stopped()]);
    const after = streamReducer(marked, { type: 'done', topic: TOPIC_A, requestId: REQUEST });
    expect(after).toBe(marked);
    expect(streamView(after, TOPIC_A, REQUEST).done).toBe(false);
  });

  it('keeps the same state for a second mark, and stops only its own request', () => {
    const marked = fold([stopped()]);
    expect(streamReducer(marked, { ...stopped(), topic: TOPIC_A })).toBe(marked);
    const other = fold([stopped(), delta(1, 'other', 43)], marked);
    expect(streamView(other, TOPIC_A, 43)).toMatchObject({ text: 'other', stopped: false });
  });

  it('keeps sources that came before the mark', () => {
    const state = fold([{ type: 'sources', requestId: REQUEST, state: 'empty', foundN: 0 }, stopped()]);
    expect(streamView(state, TOPIC_A, REQUEST)).toMatchObject({
      sources: { requestId: REQUEST, state: 'empty', foundN: 0 },
      stopped: true,
    });
  });
});

describe('the hook: markStopped, and events it does not subscribe to', () => {
  function mount() {
    const client = newQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(
      (props: { requestId: number | null }) => useWorkspaceStream(A, props.requestId),
      { wrapper: wrapperFor(client), initialProps: { requestId: REQUEST as number | null } },
    );
    return { ...hook, invalidate };
  }

  it('changes nothing for a delta or a sources event after markStopped', async () => {
    const { result } = mount();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'half' }));

    act(() => result.current.markStopped(REQUEST));
    expect(result.current).toMatchObject({ text: 'half', stopped: true });

    act(() => {
      channel.emit('delta', { request_id: REQUEST, seq: 2, delta: ' more' });
      channel.emit('sources', { request_id: REQUEST, state: 'found', found_n: 1 });
      channel.emit('done', { request_id: REQUEST, message_id: A, state: 'cancelled' });
    });
    expect(result.current).toMatchObject({ text: 'half', sources: null, done: false, stopped: true });
  });

  it('changes nothing for an unknown event: it is never subscribed, so never dispatched', async () => {
    const { result, invalidate } = mount();
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'a' }));
    const before = result.current;

    act(() => {
      channel.emit('stopped', { request_id: REQUEST });
      channel.emit('mystery', { request_id: REQUEST, seq: 2, delta: 'b' });
    });

    expect(channel.handlers.has('broadcast:stopped')).toBe(false);
    expect(channel.handlers.has('broadcast:mystery')).toBe(false);
    expect(result.current).toBe(before);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('hands back the same markStopped on every render', async () => {
    const { result, rerender } = mount();
    const first = result.current.markStopped;
    await joined(TOPIC_A);
    rerender({ requestId: null });
    rerender({ requestId: REQUEST });
    expect(result.current.markStopped).toBe(first);
  });

  it('ignores a mark for an id that is not a request id', async () => {
    const { result } = mount();
    await joined(TOPIC_A);
    const before = result.current;
    act(() => result.current.markStopped(0));
    act(() => result.current.markStopped(Number.NaN));
    expect(result.current).toBe(before);
  });
});
