/**
 * Phase 26: Inbox rows the announcement reader raised (`suggested.source ===
 * 'announcement'`) read as such; every other row is unchanged.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeAttentionItem } from './factories';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { InboxCard } = await import('@/components/inbox/InboxCard');
const { announcementSource, sourceText, sourceChip, sourceHref, sourceLinkLabel } = await import(
  '@/components/inbox/inbox-row'
);

const SUGGESTED = {
  source: 'announcement',
  announcement_id: 'a1',
  bb_item_id: '_9_1',
  announcement_title: 'Exam moved',
  posted_at: '2026-10-18T12:00:00Z',
  quote: 'The exam is now on Friday <b>Oct 23</b>.',
};

function fromAnnouncement(overrides: Parameters<typeof makeAttentionItem>[0] = {}) {
  return makeAttentionItem({
    raised_by: null,
    course_id: 'ECN.304',
    entity: 'course',
    ref: null,
    suggested: SUGGESTED,
    ...overrides,
  });
}

describe('announcementSource', () => {
  it('parses a valid payload', () => {
    expect(announcementSource({ suggested: SUGGESTED })).toEqual({
      announcementId: 'a1',
      title: 'Exam moved',
      postedAt: '2026-10-18T12:00:00Z',
      quote: SUGGESTED.quote,
    });
  });
  it('is null for other rows and malformed jsonb', () => {
    expect(announcementSource({ suggested: null })).toBeNull();
    expect(announcementSource({ suggested: 'announcement' })).toBeNull();
    expect(announcementSource({ suggested: [SUGGESTED] })).toBeNull();
    expect(announcementSource({ suggested: { source: 'sync' } })).toBeNull();
  });
  it('never trusts field types', () => {
    const parsed = announcementSource({
      suggested: { source: 'announcement', announcement_title: 5, quote: {}, announcement_id: {} },
    });
    expect(parsed).toEqual({ announcementId: null, title: 'untitled', postedAt: null, quote: null });
  });
});

describe('announcement row helpers', () => {
  it('words the source, chip and link', () => {
    const item = fromAnnouncement();
    expect(sourceText(item)).toBe(
      'From the announcement “Exam moved” in ECN 304. Raised by the announcement reader.',
    );
    expect(sourceChip(item)).toBe('announcement');
    expect(sourceHref(item)).toBe('/announcements');
    expect(sourceLinkLabel(item)).toBe('Open the announcements →');
  });
  it('keeps the assignment link when the ref is one', () => {
    const item = fromAnnouncement({ entity: 'assignment', ref: 'ECN.304/quiz-2' });
    expect(sourceHref(item)).toContain('ECN.304');
    expect(sourceLinkLabel(item)).toBe('Open the assignment →');
  });
  it('leaves non-announcement rows alone', () => {
    const item = makeAttentionItem();
    expect(sourceText(item)).toContain('Raised by sync run #42.');
    expect(sourceChip(item)).toBe('assignment quiz-2');
  });
});

function renderCard(item: ReturnType<typeof makeAttentionItem>, onResolve = vi.fn()) {
  const view = render(<InboxCard item={item} pending={false} onResolve={onResolve} />);
  return { onResolve, container: view.container };
}

describe('InboxCard from an announcement', () => {
  it('conflict: Announcement pane, its own button, same payload', () => {
    const { onResolve } = renderCard(
      fromAnnouncement({ entity: 'assignment', ref: 'ECN.304/quiz-2' }),
    );
    expect(screen.getByRole('group', { name: 'Announcement' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Blackboard' })).toBeNull();
    expect(screen.queryByText('Accept Blackboard')).toBeNull();
    expect(screen.getByText(/replaces bb2dash’s on the next sync/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept the announcement' }));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'conflict', accept: 'blackboard' }),
    );
  });

  it('shows the quote as plain text, never markup', () => {
    const { container } = renderCard(fromAnnouncement());
    const quote = container.querySelector('blockquote');
    expect(quote?.textContent).toBe(SUGGESTED.quote);
    expect(quote?.querySelector('b')).toBeNull();
    expect(container.querySelector('details')).toBeNull();
  });

  it('deadline: the added-to-planner sentence under Dismiss', () => {
    renderCard(fromAnnouncement({ kind: 'deadline' }));
    expect(
      screen.getByText(
        'Added to your planner from this announcement. Dismiss once seen; a note asks for a change.',
      ),
    ).toBeTruthy();
  });

  it('stack_must_confirm: still asks for an answer, with the quote', () => {
    renderCard(fromAnnouncement({ kind: 'stack_must_confirm' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByText(SUGGESTED.quote)).toBeTruthy();
  });
});

describe('InboxCard from anything else', () => {
  it('conflict still says Blackboard', () => {
    renderCard(makeAttentionItem());
    expect(screen.getByRole('group', { name: 'Blackboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept Blackboard' })).toBeTruthy();
  });
});
