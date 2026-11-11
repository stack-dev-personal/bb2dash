/**
 * The row 12 fixture, as Phase 24b's page reads it (brief 111, "Frozen at the gate", the walk guard and
 * the row 12 fixture; task 12). Imported by `phone-width.spec.ts` and `theme-walk.spec.ts`, Phase 22's
 * two standing walks, after their four Phase 22 reads. It stands apart from `walk22.lib.ts` because
 * that file's imports from the old walk module are pinned by `test/walk22-lib.test.ts`.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only. Like the specs, it drives the built app
 * from the outside and imports nothing from `src/`.
 */

import type { BrowserContext } from '@playwright/test';
import { fulfillView } from './walk';

/**
 * The reads Phase 24b's page adds to inventory row 12: the request's options row (`rich`, so the stored
 * answer is formatted), its turn row and two source rows (so the sources row and a chip render), and the
 * store's catalog rows as empty, so no read of this case reaches a real upload, a remembered item or his
 * note. The routines, the courses, the materials and the planner's items are read live, as the other
 * rows of the walk are. Every value is synthetic.
 */
export async function fulfillWorkspacePageFixture(context: BrowserContext, requestId: number, at: string): Promise<void> {
  await fulfillView(context, 'workspace_request_options', [
    { request_id: requestId, course_display_id: null, course_ids: null, depth: 'auto', routine_id: null, format: 'rich' },
  ]);
  await fulfillView(context, 'workspace_request_attachments', []);
  await fulfillView(context, 'workspace_turns', [
    {
      request_id: requestId,
      depth: 'auto',
      tier: 'mid',
      plan_state: 'planned',
      retrieval_state: 'found',
      found_n: 2,
      passages_n: 2,
      memory_n: 0,
      feed_rows: 0,
      attachments: [],
      created_at: at,
    },
  ]);
  const source = (ord: number, textId: number, unitNo: number): Record<string, unknown> => ({
    request_id: requestId,
    ord,
    kind: 'material',
    origin: 'auto',
    file_id: 1,
    text_id: textId,
    document_id: null,
    doc_text_id: null,
    course_id: 'IST.323',
    title: 'Course syllabus (fixture)',
    unit_kind: 'page',
    unit_no: unitNo,
  });
  await fulfillView(context, 'workspace_sources', [source(1, 101, 3), source(2, 102, 4)]);
  await fulfillView(context, 'workspace_documents', []);
  await fulfillView(context, 'v_workspace_memory', []);
  await fulfillView(context, 'workspace_profile', [{ id: 1, about_me: '', memory_since: null, updated_at: at }]);
  await fulfillView(context, 'v_workspace_index_status', [
    {
      course_units_indexed: 1014,
      course_units_waiting: 0,
      course_last_embedded: at,
      course_files_text_pending: 0,
      uploads_indexed: 0,
      uploads_waiting: 0,
      uploads_failed: 0,
      upload_links_expired: 0,
      uploads_deleting: 0,
      memory_indexed: 0,
      memory_waiting: 0,
      memory_failed: 0,
      ingest_polled_age_seconds: 5,
    },
  ]);
}
