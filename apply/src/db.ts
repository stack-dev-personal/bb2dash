/**
 * The worker's database side: the five `inbox_apply_runner` functions of migration 181 the loop
 * calls, as typed calls over one query function. (The sixth, inbox_apply_begin_item, is the
 * writer's, inside its own transaction.) The connection itself is Phase 21's
 * (`workspace/src/db.ts`): built from the DSN's parts, verified against the pinned CA.
 */

import type { QueryFn } from '../../workspace/src/db.js';
import { parsePrepared, type Prepared } from './batch.js';
import { parseRunFacts, type RunFacts } from './report.js';

export interface ClaimedRequest {
  readonly id: number;
}

/** One announcement as `announcement_review_prepare` hands it over: ids and dates, never the text. */
export interface PreparedAnnouncement {
  readonly id: number;
  readonly courseId: string | null;
}

export interface PreparedAnnouncements {
  readonly announcements: readonly PreparedAnnouncement[];
  readonly runsToday: number;
}

/** The four `announcement_review_*` functions of migration 211 the loop calls (the fifth, record, is the tool's). */
export interface AnnouncementRpc {
  /** The oldest queued announcement_review request, now claimed, or null. */
  claim(): Promise<ClaimedRequest | null>;
  prepare(requestId: number): Promise<PreparedAnnouncements>;
  /** Marks one announcement refused, so a post that cannot be decided never loops. */
  skip(requestId: number, announcementId: number, why: string): Promise<void>;
  /** Closes the request; the id of the follow-up it filed, or null. */
  close(requestId: number, state: 'done' | 'failed', result: Record<string, unknown>): Promise<number | null>;
}

export interface ApplyRpc {
  /** The oldest queued request, now claimed, or null. Releases dead claims first (181). */
  claim(): Promise<ClaimedRequest | null>;
  /** Runs apply_resolutions(), then returns the queue, the day's run count and the request's params. */
  prepare(requestId: number): Promise<Prepared>;
  /** Archives one item with its record; false when it is no longer answered. */
  archive(requestId: number, itemId: number, decision: Record<string, unknown>): Promise<boolean>;
  runFacts(requestId: number): Promise<RunFacts>;
  /** Closes the request; the id of the follow-up it filed, or null. */
  close(requestId: number, state: 'done' | 'failed', result: Record<string, unknown>): Promise<number | null>;
  /** One round trip, for the heartbeat. */
  ping(): Promise<void>;
}

function rowId(value: unknown, what: string): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${what}: expected a request id, got ${JSON.stringify(value)}`);
  }
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `announcement_review_prepare`'s jsonb, validated: a malformed answer stops the pass instead of guessing. */
export function parsePreparedAnnouncements(value: unknown): PreparedAnnouncements {
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!isRecord(raw) || !Array.isArray(raw.announcements)) throw new Error('announcement_review_prepare: the answer has no announcements list');
  const runsToday = raw.runs_today;
  if (typeof runsToday !== 'number' || !Number.isSafeInteger(runsToday) || runsToday < 0) {
    throw new Error('announcement_review_prepare: runs_today is not a count');
  }
  const announcements = raw.announcements.map((row): PreparedAnnouncement => {
    if (!isRecord(row)) throw new Error('announcement_review_prepare: an announcement is not an object');
    return { id: rowId(row.id, 'announcement_review_prepare'), courseId: typeof row.course_id === 'string' ? row.course_id : null };
  });
  return { announcements, runsToday };
}

export function createAnnouncementRpc(query: QueryFn): AnnouncementRpc {
  const first = async (sql: string, params: readonly unknown[] = []): Promise<Record<string, unknown> | undefined> =>
    (await query(sql, params)).rows[0];
  return {
    async claim() {
      const row = await first('select id::text as id from public.announcement_review_claim()');
      return row ? { id: rowId(row.id, 'announcement_review_claim') } : null;
    },
    async prepare(requestId) {
      const row = await first('select public.announcement_review_prepare($1::bigint) as prepared', [requestId]);
      return parsePreparedAnnouncements(row?.prepared);
    },
    async skip(requestId, announcementId, why) {
      await query('select public.announcement_review_skip($1::bigint, $2::bigint, $3)', [requestId, announcementId, why]);
    },
    async close(requestId, state, result) {
      const row = await first('select public.announcement_review_close($1::bigint, $2, $3::jsonb)::text as follow_up', [
        requestId,
        state,
        JSON.stringify(result),
      ]);
      return row?.follow_up === null || row?.follow_up === undefined ? null : rowId(row.follow_up, 'announcement_review_close');
    },
  };
}

export function createRpc(query: QueryFn): ApplyRpc {
  const first = async (sql: string, params: readonly unknown[] = []): Promise<Record<string, unknown> | undefined> =>
    (await query(sql, params)).rows[0];

  return {
    async claim() {
      const row = await first('select id::text as id from public.inbox_apply_claim()');
      return row ? { id: rowId(row.id, 'inbox_apply_claim') } : null;
    },
    async prepare(requestId) {
      const row = await first('select public.inbox_apply_prepare($1::bigint) as prepared', [requestId]);
      return parsePrepared(row?.prepared);
    },
    async archive(requestId, itemId, decision) {
      const row = await first('select public.inbox_apply_archive($1::bigint, $2::bigint, $3::jsonb) as ok', [
        requestId,
        itemId,
        JSON.stringify(decision),
      ]);
      return row?.ok === true;
    },
    async runFacts(requestId) {
      const row = await first('select public.inbox_apply_run_facts($1::bigint) as facts', [requestId]);
      return parseRunFacts(row?.facts);
    },
    async close(requestId, state, result) {
      const row = await first('select public.inbox_apply_close($1::bigint, $2, $3::jsonb)::text as follow_up', [
        requestId,
        state,
        JSON.stringify(result),
      ]);
      return row?.follow_up === null || row?.follow_up === undefined ? null : rowId(row.follow_up, 'inbox_apply_close');
    },
    async ping() {
      await query('select 1');
    },
  };
}
