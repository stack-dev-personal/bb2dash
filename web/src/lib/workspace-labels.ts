/**
 * bb2dash — the Workspace's strings (Phase 21; extended for Phase 24b).
 *
 * FROZEN. PM wording from brief 102 (Contract: "States, in words", "Frozen
 * strings", the archive labels, the tier badges) and ruling T2 (the three
 * skeleton strings): every sentence the Workspace page says about a question
 * or an answer is spelled once, here, word for word, and
 * `web/test/workspace-labels.test.ts` holds each one against the brief. None
 * of them carries a cost figure: the per-answer cap is a runner setting the
 * page cannot read, and the stored cost estimate is never shown.
 *
 * RULING U1 (2026-10-06) added the three lines of the empty message column,
 * the placeholder of the text box and the "Status" label, and kept the
 * "New conversation" link. They are PM wording too, and held the same way.
 *
 * ACCEPTED. The W-66 section holds the words the screen needs that the brief
 * does not spell: region names, the two empty lines of the list, and the
 * problem lines for a read or a write that failed. W-66 wrote them in the
 * forms the app already uses (the Inbox's "Could not load …: <reason>");
 * ruling U1 accepted them as PM wording, so the test holds them as well.
 *
 * PHASE 24b (brief 111, task 3; frozen 2026-10-14 before W-86 was cut). The
 * sections from "The fixed lines of a turn" down are the new page's words: the
 * two retrieval lines (equal, by a test, to the runner's own in
 * `workspace/src/lines.ts`), the composer's menus and chips, the three refusals
 * `workspace_ask_with` adds, the side panel's three tabs, the ten upload error
 * codes, the lobby and the material picker. Every string the page shows stays
 * in this one file because the acceptance pack check reads the page's texts
 * from it (`acceptance/README.md`, "The page's texts, as the page has them").
 * Each record keyed by a database vocabulary spells that vocabulary inline;
 * the query module that owns the type pins the two equal in its test.
 */

import type { WorkspaceErrorCode, WorkspaceTier } from './queries.workspace';

/* ---------------------------------------------------------------------------
 * Frozen: the states, in words
 * ------------------------------------------------------------------------ */

/** Under a question whose request is `queued`: no runner has claimed it yet. */
export const QUEUED_LINE = 'Waiting for the Workspace service';

/**
 * Shown in place of half-written text when a stream is joined late: the lowest
 * `seq` received is not 1 (a reload, a page opened mid-answer, a cold Realtime
 * start). The stored row replaces it.
 */
export const LATE_STREAM_LINE = 'Answering…';

/** The service line when the runner's heartbeat is null or more than 120 s old. */
export const OFFLINE_LINE = 'The Workspace service is offline.';

/**
 * One sentence per `error_code`, chosen by the request row's code. The stored
 * sign-in sentence names the command in plain words, with no backticks.
 */
export const ERROR_SENTENCES: Readonly<Record<WorkspaceErrorCode, string>> = {
  cancelled: 'You stopped this answer.',
  budget_exceeded: 'Stopped at the per-answer cost limit.',
  timeout: 'This took too long and was stopped.',
  stale_claim: 'The Workspace service stopped part-way. Ask again.',
  provider_not_configured: 'That model is not connected.',
  cli_error: 'The assistant could not finish this answer. Ask again.',
  usage_limit: "Your Claude plan's limit is used up. Try again after it resets.",
  sign_in_expired:
    "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token.",
};

/** The stopped sentence: what a `cancelled` request says, and what Stop shows at once. */
export const STOPPED_SENTENCE = ERROR_SENTENCES.cancelled;

/* ---------------------------------------------------------------------------
 * Frozen: the two refusals
 * ------------------------------------------------------------------------ */

/** A second question while one is open: SQLSTATE 23505 from `workspace_ask`. */
export const REFUSAL_STILL_ANSWERING = 'This conversation is still answering.';

/**
 * Empty or over-long text: refused by the page before any request, and by the
 * database with SQLSTATE 22023.
 */
export const REFUSAL_QUESTION_LENGTH = 'Write a question of 1 to 8000 characters.';

/* ---------------------------------------------------------------------------
 * Frozen: the controls and the badges
 * ------------------------------------------------------------------------ */

/** The composer's button. No control reads "Submit" (`web/test/audits.test.ts`). */
export const ASK_LABEL = 'Ask';

/** The same button while a request is open. */
export const STOP_LABEL = 'Stop';

export const ARCHIVE_LABEL = 'Archive';
export const UNARCHIVE_LABEL = 'Unarchive';
export const SHOW_ARCHIVED_LABEL = 'Show archived';

/** One badge per assistant message: the model level that answered, and what it is for. */
export const TIER_BADGES: Readonly<Record<WorkspaceTier, string>> = {
  low: 'Haiku · lookup',
  mid: 'Sonnet · standard',
  high: 'Opus · deep work',
};

/**
 * Starts the line that names the tools an answer used. Phase 24b's thread
 * replaces that line with the sources row (`sourcesCountLine`); the prefix
 * stays until W-88 rewrites `thread.ts`, which is the one place that reads it.
 */
export const USED_PREFIX = 'Used:';

/* ---------------------------------------------------------------------------
 * Frozen: the three skeleton strings (ruling T2)
 * ------------------------------------------------------------------------ */

/** The kicker over the page title. */
export const PAGE_KICKER = 'Assistant';

/** The Suspense fallback of the route. */
export const LOADING_FALLBACK = 'Loading the Workspace…';

/**
 * A conversation that could not be read. An id that does not exist is not this
 * line: it has its own (`COLUMN_NOT_FOUND_LINE`).
 */
export function conversationProblemLine(reason: string): string {
  return `Could not load this conversation: ${reason}`;
}

/* ---------------------------------------------------------------------------
 * Frozen: the empty message column, the placeholder, the status label and the
 * way back to an empty composer (ruling U1)
 * ------------------------------------------------------------------------ */

/** The message column with no conversation selected. */
export const COLUMN_START_LINE = 'Ask a question to start a conversation.';

/** The message column while the conversation's rows are still being read. */
export const COLUMN_LOADING_LINE = 'Loading the conversation…';

/**
 * The message column for a `?c=` id that has no rows, and for SQLSTATE 23503
 * from `workspace_ask`. The database's own sentence about the foreign key is
 * never shown.
 */
export const COLUMN_NOT_FOUND_LINE = 'This conversation was not found.';

/** The visible placeholder of the composer's text box. */
export const QUESTION_PLACEHOLDER = 'Ask about your courses or your decisions';

/**
 * What a screen reader hears before a status line that has no answer text
 * beside it (a queued question, an answer not yet begun, a failure with no
 * stored text). An answer with text keeps `ANSWER_ROLE_LABEL`.
 */
export const STATUS_ROLE_LABEL = 'Status';

/**
 * The link back to an empty composer, `/workspace` with no `?c=`: at the top of
 * the list, and beside the not-found line.
 */
export const NEW_CONVERSATION_LABEL = 'New conversation';

/* ---------------------------------------------------------------------------
 * Accepted as PM wording (ruling U1): W-66's strings, in the app's own forms
 * ------------------------------------------------------------------------ */

/** The name of the list region, and its heading. */
export const CONVERSATIONS_HEADING = 'Conversations';

/** The list once it has answered with no rows. */
export const NO_CONVERSATIONS_LINE = 'No conversations yet.';

/** The archived list once it has answered with no rows. */
export const NO_ARCHIVED_LINE = 'No archived conversations.';

/** The name of the message column, for a screen reader. */
export const MESSAGES_REGION_LABEL = 'Messages';

/** The name of the composer's text box, for a screen reader. */
export const QUESTION_FIELD_LABEL = 'Question';

/** Who wrote a turn, for a screen reader. */
export const QUESTION_ROLE_LABEL = 'You asked';
export const ANSWER_ROLE_LABEL = 'The assistant answered';

/** The conversation list could not be read. */
export function conversationsProblemLine(reason: string): string {
  return `Could not load the conversations: ${reason}`;
}

/** `v_workspace_status` could not be read, so nothing is said about the service. */
export function statusProblemLine(reason: string): string {
  return `Could not load the Workspace service status: ${reason}`;
}

/** A question that failed for a reason that is neither refusal. */
export function askProblemLine(reason: string): string {
  return `Could not send this question: ${reason}`;
}

/** A Stop that failed: the request is still open. */
export function stopProblemLine(reason: string): string {
  return `Could not stop this answer: ${reason}`;
}

/** An Archive or an Unarchive that failed. */
export function archiveProblemLine(reason: string): string {
  return `Could not change this conversation: ${reason}`;
}

/* ===========================================================================
 * Phase 24b, from here down (brief 111, task 3)
 * ======================================================================== */

/* ---------------------------------------------------------------------------
 * Frozen: the fixed lines of a turn
 * ------------------------------------------------------------------------ */

/**
 * The two lines read off `workspace_turns.retrieval_state`, keyed by the state
 * that shows them. `found` and `attached_only` show no line. Each is the
 * runner's own sentence in `workspace/src/lines.ts` (`empty`, `search_failed`),
 * held equal by the test so the two cannot drift. The empty line speaks of his
 * course files and uploads and never says that nothing of his was used, so it
 * stays true under a planner answer.
 */
export const RETRIEVAL_LINES: Readonly<Record<'empty' | 'failed', string>> = {
  empty:
    'No passage of your course files or uploads matched this question, so this answer comes from general knowledge.',
  failed:
    'I could not search your course files and uploads this time, so this answer does not draw on them.',
};

/**
 * Under a question from `claimed` until the `sources` event or the first text
 * arrives: the runner is searching before it writes.
 */
export const SEARCHING_LINE = 'Looking through your course files and uploads…';

/** The row under an answer that opens its sources: "1 source", "3 sources". */
export function sourcesCountLine(count: number): string {
  return count === 1 ? '1 source' : `${count} sources`;
}

/** The accessible name of a numbered source chip inside an answer. */
export function sourceChipLabel(ord: number): string {
  return `Source ${ord}`;
}

/* ---------------------------------------------------------------------------
 * Frozen: the refusals `workspace_ask_with` adds (brief 111, "Refusals")
 * ------------------------------------------------------------------------ */

/**
 * SQLSTATE 23503 raised by `workspace_ask_with` itself (its message starts
 * `workspace_ask_with:`): a routine, a file or an upload the question names is
 * gone. A 23503 with any other message is still the missing conversation
 * (`COLUMN_NOT_FOUND_LINE`).
 */
export const REFUSAL_REFERENCE_GONE =
  'Something this question names is no longer there. Remove it and ask again.';

/**
 * SQLSTATE 23514 from `workspace_ask_with`: a depth, a format, a course, a key,
 * the attachment count, an upload being deleted, or a routine whose need is not
 * met. The page checks each of these first, so the sentence is a fallback.
 */
export const REFUSAL_OPTIONS_REJECTED =
  'These options were not accepted. Check the course, the depth and the attachments, then ask again.';

/**
 * SQLSTATE 42501 from any of the four owner-only functions: this session is not
 * the owner's. The page says so once and sends nothing again by itself.
 */
export const NOT_OWNER_LINE = "This session is not the owner's, so the Workspace changed nothing.";

/* ---------------------------------------------------------------------------
 * Frozen: the composer (brief 111, "The composer", "Routines", "Keyboard")
 * ------------------------------------------------------------------------ */

/** The plus button's accessible name, and its two groups. */
export const ADD_MENU_LABEL = 'Add';
export const ATTACHMENTS_GROUP_HEADING = 'Attachments';
export const STARTING_POINTS_GROUP_HEADING = 'Starting points';

/** The plus menu's three entries. The first is also the material picker's title. */
export const ATTACH_FROM_MATERIALS_LABEL = 'Attach from materials';
export const UPLOAD_FROM_DEVICE_LABEL = 'Upload from this device';
export const USE_ROUTINE_LABEL = 'Use a routine';

/** The routine list: its search field, its group headings and its empty line. */
export const ROUTINE_FILTER_PLACEHOLDER = 'Find a routine';
export const ROUTINE_GROUP_HEADINGS: Readonly<Record<'study' | 'plan' | 'write', string>> = {
  study: 'Study',
  plan: 'Plan',
  write: 'Write',
};
export const NO_ROUTINE_MATCH_LINE = 'No routine matches.';

/** The dashed course chip: the menu's accessible name and its first entry. */
export const COURSE_MENU_LABEL = 'Course';
export const ALL_COURSES_LABEL = 'All courses';

/** The depth menu: its accessible name, the four entries and one short note each. */
export const DEPTH_MENU_LABEL = 'Depth';
export const DEPTH_LABELS: Readonly<Record<'auto' | 'quick' | 'standard' | 'deep', string>> = {
  auto: 'Auto',
  quick: 'Quick',
  standard: 'Standard',
  deep: 'Deep',
};
export const DEPTH_NOTES: Readonly<Record<'auto' | 'quick' | 'standard' | 'deep', string>> = {
  auto: 'Decided from the question.',
  quick: 'One pass, the fastest.',
  standard: 'Plans a search first.',
  deep: 'The most thorough, for this one question.',
};

/** The accessible names of the three kinds of chip, and the button on each. */
export function courseChipLabel(code: string): string {
  return `Course: ${code}`;
}
export function routineChipLabel(title: string): string {
  return `Routine: ${title}`;
}
export function attachmentChipLabel(title: string): string {
  return `Attached: ${title}`;
}
export const REMOVE_CHIP_LABEL = 'Remove';

/** The limit `workspace_ask_with` enforces, said when the sixth file is picked. */
export const ATTACHMENTS_LIMIT_LINE = 'Up to five files a question.';

/** Ask is off and this line says why: the routine's `needs` is not met. */
export function routineNeedsFileLine(title: string): string {
  return `${title} needs an attached file.`;
}
export function routineNeedsCourseOrFileLine(title: string): string {
  return `${title} needs a course or an attached file.`;
}

/** Ask is off while an attached upload is not yet `indexed`. */
export const UPLOAD_NOT_READY_LINE = 'An attached upload is still being read. Ask once it is indexed.';

/** The restored chips (the last request's options row) could not be read. */
export function optionsProblemLine(reason: string): string {
  return `Could not restore the last question's settings: ${reason}`;
}

/** The routines could not be read. */
export function routinesProblemLine(reason: string): string {
  return `Could not load the routines: ${reason}`;
}

/* ---------------------------------------------------------------------------
 * Frozen: the side panel and its three tabs (brief 111, "The side panel")
 * ------------------------------------------------------------------------ */

/** The panel's region name, its tabs, and the one button that folds it away. */
export const PANEL_REGION_LABEL = 'Details';
export const PANEL_TABS: Readonly<Record<'sources' | 'files' | 'memory', string>> = {
  sources: 'Sources',
  files: 'Files',
  memory: 'Memory',
};
export const HIDE_PANEL_LABEL = 'Hide panel';
export const SHOW_PANEL_LABEL = 'Show panel';

/** The filter field of the Files tab and of the Memory tab. It sends nothing. */
export const FILTER_PLACEHOLDER = 'Filter by title';

/** A sheet's close button (the panel and the menus under 1024 px). */
export const CLOSE_LABEL = 'Close';

/* Sources tab */

export const NO_ANSWER_PICKED_LINE = 'Pick an answer to see its sources.';
export const SOURCES_LOADING_LINE = 'Loading the sources…';
/** True under every answer with no source row: a planner answer has a feed row. */
export const NO_SOURCES_LINE = 'No source was used for this answer.';
export const OPEN_SOURCE_LABEL = 'Open';

/** A source row's kind, in words, keyed by `workspace_sources.kind`. */
export const SOURCE_KIND_LABELS: Readonly<Record<'material' | 'upload' | 'memory' | 'feed', string>> = {
  material: 'Course file',
  upload: 'Upload',
  memory: 'Remembered',
  feed: 'Planner',
};

/** A row of origin `attached` (a file he attached) or `tool` (a unit the model opened). */
export const ATTACHED_SOURCE_LABEL = 'Attached';
export const OPENED_SOURCE_LABEL = 'Opened by the assistant';

/**
 * Where a passage sits in its file, from the source row's `unit_kind` and
 * `unit_no`: "page 7", "slide 3", "sheet 2". A kind this map does not know is
 * shown as the database spells it.
 */
export function unitLocationLine(unitKind: string, unitNo: number): string {
  const words: Readonly<Record<string, string>> = {
    page: 'page',
    slide: 'slide',
    sheet: 'sheet',
    doc: 'part',
    chunk: 'part',
  };
  return `${words[unitKind] ?? unitKind} ${unitNo}`;
}

export function sourcesProblemLine(reason: string): string {
  return `Could not load the sources: ${reason}`;
}

/* Files tab */

export const NO_UPLOADS_LINE = 'No uploads yet.';
export const NO_UPLOAD_MATCH_LINE = 'No upload matches.';

/** The chip and the row before the upload row exists. */
export const UPLOADING_LABEL = 'Uploading';

/**
 * A document's state, in words, keyed by `workspace_documents.state`. An
 * upload and a remembered item share the vocabulary; a row in `deleting`
 * reads "Removing" and keeps Try again.
 */
export const DOCUMENT_STATE_LABELS: Readonly<
  Record<'stored' | 'reading' | 'text_ready' | 'indexed' | 'failed' | 'deleting', string>
> = {
  stored: 'Waiting',
  reading: 'Reading',
  text_ready: 'Indexing',
  indexed: 'Indexed',
  failed: 'Failed',
  deleting: 'Removing',
};

/** One sentence per `workspace_documents.error_code`: 24a's ten. */
export const UPLOAD_ERROR_SENTENCES: Readonly<
  Record<
    | 'too_large'
    | 'bad_type'
    | 'bad_bytes'
    | 'no_text'
    | 'extract_timeout'
    | 'extract_failed'
    | 'too_many_units'
    | 'link_expired'
    | 'download_failed'
    | 'embed_failed',
    string
  >
> = {
  too_large: 'The file is larger than 20 MB.',
  bad_type: 'This kind of file is not supported.',
  bad_bytes: 'The file could not be read as its type.',
  no_text: 'No text was found in the file.',
  extract_timeout: 'Reading the file took too long.',
  extract_failed: 'The file could not be read.',
  too_many_units: 'The file has too many pages or slides to index.',
  link_expired: 'The upload link expired before the file was read. Try again.',
  download_failed: 'The file could not be fetched from storage. Try again.',
  embed_failed: 'The file was read but could not be indexed. Try again.',
};

/**
 * The two refusals the page makes before anything is sent
 * (`workspace-upload-rules.ts`): the size and the six types.
 */
export const UPLOAD_REFUSALS: Readonly<Record<'too_large' | 'bad_type', string>> = {
  too_large: 'Files up to 20 MB.',
  bad_type: 'PDF, Word, PowerPoint, Excel, plain text or Markdown only.',
};

export const TRY_AGAIN_LABEL = 'Try again';
export const DELETE_LABEL = 'Delete';
/** The same button after its first press. */
export const CONFIRM_DELETE_LABEL = 'Press again to delete';

/**
 * Under Delete on an upload. 24a gives the browser no way to change a stored
 * answer, so the page promises no more than this.
 */
export const UPLOAD_DELETE_NOTE =
  'This file will no longer be searched or attached. Answers already written keep what they quoted from it.';

export function uploadProblemLine(reason: string): string {
  return `Could not upload this file: ${reason}`;
}
export function filesProblemLine(reason: string): string {
  return `Could not load your uploads: ${reason}`;
}
export function removeProblemLine(reason: string): string {
  return `Could not remove this file: ${reason}`;
}

/* The index status line, on the Files tab (`v_workspace_index_status`) */

export const INDEX_STATUS_HEADING = 'Index';
export const INDEX_KIND_LABELS: Readonly<Record<'course' | 'uploads' | 'memory', string>> = {
  course: 'Course files',
  uploads: 'Uploads',
  memory: 'Remembered',
};

/**
 * One line per kind: "Uploads: 2 indexed, 1 waiting, 1 failed". A course unit
 * has no failed count (one that could not be indexed still waits), so `failed`
 * is null there and the line ends after "waiting". No number is shown that the
 * row does not hold.
 */
export function indexCountsLine(
  kind: 'course' | 'uploads' | 'memory',
  counts: { indexed: number; waiting: number; failed: number | null },
): string {
  const tail = counts.failed === null ? '' : `, ${counts.failed} failed`;
  return `${INDEX_KIND_LABELS[kind]}: ${counts.indexed} indexed, ${counts.waiting} waiting${tail}`;
}

/** When a course file was last indexed, with the date already in words. */
export function lastIndexedLine(when: string): string {
  return `Course files last indexed ${when}.`;
}
export const NEVER_INDEXED_LINE = 'No course file has been indexed yet.';

export function indexStatusProblemLine(reason: string): string {
  return `Could not load the index status: ${reason}`;
}

/* Memory tab */

export const ABOUT_ME_HEADING = 'About me';
export const ABOUT_ME_PLACEHOLDER = 'A few lines the assistant reads with every question';
/** `workspace_profile.about_me` is checked at 2000 characters (migration 195). */
export const ABOUT_ME_LIMIT_LINE = 'Up to 2000 characters.';
export const EDIT_LABEL = 'Edit';
export const SAVE_LABEL = 'Save';
export const CANCEL_LABEL = 'Cancel';
export const SAVED_LINE = 'Saved.';

export function aboutMeProblemLine(reason: string): string {
  return `Could not save the note: ${reason}`;
}

export const NO_MEMORY_LINE = 'Nothing is remembered yet.';
export const NO_MEMORY_MATCH_LINE = 'No remembered item matches.';

/** Under Delete on a remembered item. */
export const MEMORY_DELETE_NOTE = 'This item will no longer be remembered or searched.';

export function memoryProblemLine(reason: string): string {
  return `Could not load what is remembered: ${reason}`;
}
export function forgetProblemLine(reason: string): string {
  return `Could not delete this item: ${reason}`;
}

/* ---------------------------------------------------------------------------
 * Frozen: the lobby (brief 111, "The lobby", "Example prompts")
 * ------------------------------------------------------------------------ */

/** The greeting holds no name: the app holds none of his (brief 111, "The lobby"). */
export const GREETING_LINE = 'What are you working on?';

/**
 * Today's date with its weekday, on every visit, lobby and thread (brief 111,
 * frozen at the gate, amendment (g)): the words come from
 * `workspace-examples.ts`'s `todayWords`, "Thursday, October 15, 2026".
 */
export function todayLine(words: string): string {
  return `Today is ${words}.`;
}

export const ROUTINES_HEADING = 'Routines';
export const EXAMPLES_HEADING = 'From your planner';
export const REFRESH_EXAMPLES_LABEL = 'Other examples';
export const RECENT_HEADING = 'Recent';
export const VIEW_ALL_LABEL = 'View all';

/**
 * An example prompt names a real item by title and date and is never invented
 * (`workspace-examples.ts` builds none without a row). Three forms, by what the
 * item is: an exam or a quiz, a reading, or other graded work.
 */
export function examplePromptLine(
  form: 'exam' | 'reading' | 'work',
  facts: { title: string; course: string; date: string },
): string {
  const { title, course, date } = facts;
  switch (form) {
    case 'exam':
      return `Quiz me on what ${course}'s "${title}" covers before ${date}.`;
    case 'reading':
      return `Summarise the reading "${title}" for ${course}, due ${date}.`;
    case 'work':
      return `Help me plan ${course}'s "${title}", due ${date}.`;
  }
}

/* ---------------------------------------------------------------------------
 * Frozen: the material picker (brief 111, "Attaching from materials")
 * ------------------------------------------------------------------------ */

export const MATERIAL_FILTER_PLACEHOLDER = 'Filter by file name';
export const MATERIALS_LOADING_LINE = 'Loading your materials…';
export const NO_MATERIALS_LINE = 'No files have been pulled yet.';
export const NO_MATERIAL_MATCH_LINE = 'No file matches.';

export function materialsProblemLine(reason: string): string {
  return `Could not load your materials: ${reason}`;
}

/* ===========================================================================
 * W-87 additions (for the PM to accept)
 * ======================================================================== */

/** The course menu's classes (`v_course_display`) could not be read; "All courses" still works. */
export function coursesProblemLine(reason: string): string {
  return `Could not load your courses: ${reason}`;
}

/** The lobby's example prompts: his upcoming work (`v_work_items`) could not be read. */
export function examplesProblemLine(reason: string): string {
  return `Could not load your upcoming work: ${reason}`;
}
