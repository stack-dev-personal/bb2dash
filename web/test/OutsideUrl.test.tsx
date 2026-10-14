/**
 * Migration 164: a Blackboard file whose link redirects to another site carries that site's URL in
 * `bb_files.outside_url`. Materials reads "Outside link" and opens THAT url in a new tab, but only when
 * it is a plain http(s) link; anything else is ignored and the row reads as it did before.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { FileOpenAction } = await import('@/components/materials/FileOpenAction');
const { fileHonesty, fileLocation, outsideUrl, resolveReadingRoute, safeHttpUrl } = await import(
  '@/lib/queries.materials'
);

const BLACKBOARD = 'https://blackboard.syracuse.edu/bbcswebdav/pid-1-dt-content-rid-2_1/xid-2_1';
const CBO = 'https://www.cbo.gov/system/files/2024/report.pdf?x=1#p2';

describe('safeHttpUrl', () => {
  it('accepts plain http and https links and nothing else', () => {
    expect(safeHttpUrl(CBO)).toBe(CBO);
    expect(safeHttpUrl('http://newyorkfed.org/x')).toBe('http://newyorkfed.org/x');
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'ftp://example.com/x',
      '//example.com/x',
      'www.example.com',
      'https://',
      'https://example.com/a b',
      'https://example.com/a\tb',
      'https://example.com/a\nb',
      'https://example.com/a\u0000b',
      ' https://example.com/x',
      `https://example.com/${'a'.repeat(2049)}`,
      '',
      null,
      undefined,
      42,
    ]) {
      expect(safeHttpUrl(bad), String(bad).slice(0, 40)).toBeNull();
    }
  });

  it('takes 2048 characters and not one more', () => {
    const base = 'https://example.com/';
    expect(safeHttpUrl(base + 'a'.repeat(2048 - base.length))).not.toBeNull();
    expect(safeHttpUrl(base + 'a'.repeat(2049 - base.length))).toBeNull();
  });
});

describe('a file with an outside_url', () => {
  const linked = { storage_path: null, local_path: null, source_url: BLACKBOARD, outside_url: CBO };

  it('is an outside link, openable, whatever its Blackboard source_url says', () => {
    expect(outsideUrl(linked)).toBe(CBO);
    expect(fileLocation(linked)).toBe('source');
    expect(fileHonesty(linked)).toEqual({ location: 'source', label: 'Outside link', openable: true });
  });

  it('without one it reads as it did: a Blackboard source link', () => {
    for (const outside_url of [null, undefined, '']) {
      expect(fileHonesty({ ...linked, outside_url }).label).toBe('Source link');
    }
  });

  it('ignores an outside_url that is not a plain http(s) link', () => {
    for (const outside_url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com/x', 'https://a b.example/x']) {
      expect(outsideUrl({ ...linked, outside_url }), outside_url).toBeNull();
      expect(fileHonesty({ ...linked, outside_url }).label, outside_url).toBe('Source link');
    }
  });

  it('stored bytes still win: a file in the library is in the library', () => {
    expect(fileHonesty({ ...linked, storage_path: 'IST.323/a.pdf' })).toEqual({
      location: 'library',
      label: 'In library',
      openable: true,
    });
  });

  it('does not change a caller that cannot see the column', () => {
    expect(fileLocation({ storage_path: null, local_path: null, source_url: null })).toBe('none');
    expect(fileLocation({ storage_path: null, local_path: null, source_url: BLACKBOARD })).toBe('source');
  });
});

describe('FileOpenAction on an outside link', () => {
  it('opens outside_url, not the Blackboard URL, in a new tab with noopener noreferrer', () => {
    render(
      <FileOpenAction
        showLabel
        routes={{ storage_path: null, local_path: null, source_url: BLACKBOARD, outside_url: CBO }}
      />,
    );
    expect(screen.getByText('Outside link')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open ↗' });
    expect(link).toHaveAttribute('href', CBO);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/\bnoopener\b/);
    expect(link.getAttribute('rel')).toMatch(/\bnoreferrer\b/);
  });

  it('never puts a javascript: outside_url in an href; the row falls back to its source link', () => {
    render(
      <FileOpenAction
        showLabel
        routes={{ storage_path: null, local_path: null, source_url: BLACKBOARD, outside_url: 'javascript:alert(1)' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Open ↗' });
    expect(link).toHaveAttribute('href', BLACKBOARD);
    expect(screen.getByText('Source link')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('javascript:');
  });

  it('keeps the old rel for a plain source link', () => {
    render(
      <FileOpenAction routes={{ storage_path: null, local_path: null, source_url: 'https://example.edu/a.pdf' }} />,
    );
    expect(screen.getByRole('link', { name: 'Open ↗' })).toHaveAttribute('rel', 'noreferrer');
  });
});

describe('a reading linked to a file with an outside_url', () => {
  const reading = { url: null, on_blackboard: true, citation: 'Week 3 reading' };

  it('opens the outside link as an external reading', () => {
    const file = { id: 9, storage_path: null, local_path: null, source_url: BLACKBOARD, outside_url: CBO } as never;
    const route = resolveReadingRoute(reading, file, null);
    expect(route.kind).toBe('external');
    expect(route.href).toBe(CBO);
  });

  it('ignores a bad outside_url and keeps the Blackboard source link', () => {
    const file = { id: 9, storage_path: null, local_path: null, source_url: BLACKBOARD, outside_url: 'javascript:x' } as never;
    expect(resolveReadingRoute(reading, file, null).href).toBe(BLACKBOARD);
  });
});
