/**
 * bb2dash — the Workspace's source labels (Phase 24b, brief 111, task 5).
 *
 * 24a's answering turn writes a label beside what it took from a source:
 * `[M<n>]` for a course passage, `[U<n>]` for an upload's passage, `[R<n>]` for
 * a remembered item and `[P]` for the planner feed (the fixture README, "Labels,
 * and what a label resolves to"). This module finds those tokens in an answer's
 * text; `answer-format.ts` uses it to keep a token whole as a `label` inline.
 */

/** One whole label token, and nothing else. */
export const LABEL_TOKEN = /^\[(?:[MUR][1-9]\d{0,15}|P)\]$/;

/** The same shape, unanchored, for a scan through a text. */
const LABEL_SCAN = /\[(?:[MUR][1-9]\d{0,15}|P)\]/g;

const NO_TOKENS: ReadonlyArray<{ start: number; end: number; token: string }> = Object.freeze([]);

/**
 * Every label token in `text`, left to right, with its offsets: `start` is the
 * index of the `[`, `end` the index just past the `]`. Pure to its callers; a
 * text with no token gives an empty list.
 *
 * It runs on every text run of every flush (probe Q-4), so it is an `exec`
 * loop over one regex, reset before and after, rather than `matchAll`, which
 * copies the regex on each call; and a text with no `[` is not scanned at all.
 */
export function findLabelTokens(
  text: string,
): ReadonlyArray<{ start: number; end: number; token: string }> {
  if (!text.includes('[')) return NO_TOKENS;
  const found: Array<{ start: number; end: number; token: string }> = [];
  LABEL_SCAN.lastIndex = 0;
  for (let match = LABEL_SCAN.exec(text); match !== null; match = LABEL_SCAN.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length, token: match[0] });
  }
  LABEL_SCAN.lastIndex = 0;
  return found;
}
