/**
 * The Workspace's frozen strings (Phase 21, task 16; Phase 24b, task 3).
 *
 * Brief 102's Contract freezes the sentences the Workspace page says ("Frozen
 * strings"; the three archive labels; the tier badges) and ruling T2 adds the
 * three skeleton strings. Ruling U1 (2026-10-06) adds the three lines of the
 * empty message column, the placeholder and the "Status" label, and accepts
 * W-66's own ten strings as PM wording. Brief 111 (Phase 24b, task 3) adds the
 * new page's words: the two retrieval lines, the composer's menus, the three
 * refusals of `workspace_ask_with`, the side panel's tabs, the ten upload
 * error codes, the lobby and the material picker. Each is asserted here word
 * for word, against the text of the briefs and the rulings, so a reworded
 * sentence fails this file and not a walk.
 *
 * The two retrieval lines are the runner's own (`workspace/src/lines.ts`), and
 * one case holds the two files equal so they cannot drift.
 *
 * None of them may carry a cost figure: the per-answer cap is a runner setting
 * the page cannot read, and the cost estimate is never shown.
 */

import { describe, expect, it } from 'vitest';
import * as labels from '@/lib/workspace-labels';
import { WORKSPACE_ERROR_CODES, WORKSPACE_PROMPT_MAX } from '@/lib/queries.workspace';
import { LINES } from '../../workspace/src/lines';

/** Every constant string the module exports: its own, and its records' values. */
function constantStrings(): string[] {
  const out: string[] = [];
  for (const value of Object.values(labels)) {
    if (typeof value === 'string') out.push(value);
    else if (value !== null && typeof value === 'object') {
      for (const inner of Object.values(value)) if (typeof inner === 'string') out.push(inner);
    }
  }
  return out;
}

/** Every builder the module exports, called once with a sample of each argument. */
function builtStrings(): string[] {
  const reason = 'the reason';
  return [
    labels.conversationProblemLine(reason),
    labels.conversationsProblemLine(reason),
    labels.statusProblemLine(reason),
    labels.askProblemLine(reason),
    labels.stopProblemLine(reason),
    labels.archiveProblemLine(reason),
    labels.sourcesCountLine(3),
    labels.sourceChipLabel(2),
    labels.courseChipLabel('IST 323'),
    labels.routineChipLabel('Quiz me'),
    labels.attachmentChipLabel('Week 5 slides.pptx'),
    labels.routineNeedsFileLine('Explain this file'),
    labels.routineNeedsCourseOrFileLine('Quiz me'),
    labels.optionsProblemLine(reason),
    labels.routinesProblemLine(reason),
    labels.unitLocationLine('slide', 7),
    labels.sourcesProblemLine(reason),
    labels.uploadProblemLine(reason),
    labels.filesProblemLine(reason),
    labels.removeProblemLine(reason),
    labels.indexCountsLine('uploads', { indexed: 2, waiting: 1, failed: 1 }),
    labels.lastIndexedLine('Tue Oct 14'),
    labels.indexStatusProblemLine(reason),
    labels.aboutMeProblemLine(reason),
    labels.memoryProblemLine(reason),
    labels.forgetProblemLine(reason),
    labels.examplePromptLine('exam', { title: 'Quiz 3', course: 'IST 323', date: 'Tue Oct 21' }),
    labels.todayLine('Thursday, October 15, 2026'),
    labels.materialsProblemLine(reason),
    // W-87 additions (for the PM to accept)
    labels.coursesProblemLine(reason),
    labels.examplesProblemLine(reason),
    labels.uploadFailedAttachedLine('The file could not be read.'),
    // W-88 addition (for the PM to accept): see the heading at the end of this file.
    labels.openProblemLine(reason),
  ];
}

/** The builders above are every function the module exports: a new one is added to the list. */
function exportedBuilderCount(): number {
  return Object.values(labels).filter((value) => typeof value === 'function').length;
}

describe('the states, in words', () => {
  it('says a queued question is waiting for the service', () => {
    expect(labels.QUEUED_LINE).toBe('Waiting for the Workspace service');
  });

  it('says only "Answering…" for a stream joined late', () => {
    expect(labels.LATE_STREAM_LINE).toBe('Answering…');
  });

  it('says the service is offline', () => {
    expect(labels.OFFLINE_LINE).toBe('The Workspace service is offline.');
  });

  it.each([
    ['cancelled', 'You stopped this answer.'],
    ['budget_exceeded', 'Stopped at the per-answer cost limit.'],
    ['timeout', 'This took too long and was stopped.'],
    ['stale_claim', 'The Workspace service stopped part-way. Ask again.'],
    ['provider_not_configured', 'That model is not connected.'],
    ['cli_error', 'The assistant could not finish this answer. Ask again.'],
    ['usage_limit', "Your Claude plan's limit is used up. Try again after it resets."],
    [
      'sign_in_expired',
      "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token.",
    ],
  ] as const)('has the one sentence for %s, word for word', (code, sentence) => {
    expect(labels.ERROR_SENTENCES[code]).toBe(sentence);
  });

  it('has one sentence for each of the eight codes, and no two alike', () => {
    expect(Object.keys(labels.ERROR_SENTENCES).sort()).toEqual([...WORKSPACE_ERROR_CODES].sort());
    expect(new Set(Object.values(labels.ERROR_SENTENCES)).size).toBe(8);
  });

  it('stores the sign-in sentence without backticks', () => {
    expect(labels.ERROR_SENTENCES.sign_in_expired).not.toContain('`');
  });

  it('names the stopped sentence: the one for cancelled', () => {
    expect(labels.STOPPED_SENTENCE).toBe('You stopped this answer.');
    expect(labels.STOPPED_SENTENCE).toBe(labels.ERROR_SENTENCES.cancelled);
  });
});

describe('the two refusals', () => {
  it('has one sentence for a second question while one is open (23505)', () => {
    expect(labels.REFUSAL_STILL_ANSWERING).toBe('This conversation is still answering.');
  });

  it('has one sentence for empty or over-long text (22023), and it keeps its "1 to 8000"', () => {
    expect(labels.REFUSAL_QUESTION_LENGTH).toBe('Write a question of 1 to 8000 characters.');
    expect(labels.REFUSAL_QUESTION_LENGTH).toContain(`1 to ${WORKSPACE_PROMPT_MAX}`);
  });
});

describe('the controls and the badges', () => {
  it('reads Ask and Stop', () => {
    expect(labels.ASK_LABEL).toBe('Ask');
    expect(labels.STOP_LABEL).toBe('Stop');
  });

  it('has the three archive labels, word for word', () => {
    expect(labels.ARCHIVE_LABEL).toBe('Archive');
    expect(labels.UNARCHIVE_LABEL).toBe('Unarchive');
    expect(labels.SHOW_ARCHIVED_LABEL).toBe('Show archived');
  });

  it('names each tier on its badge', () => {
    expect(labels.TIER_BADGES).toEqual({
      low: 'Haiku · lookup',
      mid: 'Sonnet · standard',
      high: 'Opus · deep work',
    });
  });

  it('starts the tools line with "Used:" until the thread is rewritten', () => {
    expect(labels.USED_PREFIX).toBe('Used:');
  });
});

describe('the three skeleton strings the PM accepted (ruling T2)', () => {
  it('has the kicker, the fallback and the problem line', () => {
    expect(labels.PAGE_KICKER).toBe('Assistant');
    expect(labels.LOADING_FALLBACK).toBe('Loading the Workspace…');
    expect(labels.conversationProblemLine('no such table')).toBe(
      'Could not load this conversation: no such table',
    );
  });
});

describe('the strings ruling U1 added (PM wording, 2026-10-06)', () => {
  it('has one line for each state of the empty message column', () => {
    expect(labels.COLUMN_START_LINE).toBe('Ask a question to start a conversation.');
    expect(labels.COLUMN_LOADING_LINE).toBe('Loading the conversation…');
    expect(labels.COLUMN_NOT_FOUND_LINE).toBe('This conversation was not found.');
  });

  it('has the visible placeholder of the text box, with no closing stop', () => {
    expect(labels.QUESTION_PLACEHOLDER).toBe('Ask about your courses or your decisions');
  });

  it('labels a status line with no answer text "Status" for a screen reader', () => {
    expect(labels.STATUS_ROLE_LABEL).toBe('Status');
    expect(labels.STATUS_ROLE_LABEL).not.toBe(labels.ANSWER_ROLE_LABEL);
  });

  it('keeps the "New conversation" link, word for word', () => {
    expect(labels.NEW_CONVERSATION_LABEL).toBe('New conversation');
  });
});

describe('the ten strings of W-66 that ruling U1 accepted as PM wording', () => {
  it('names the list, its two empty lines, the column and the text box', () => {
    expect(labels.CONVERSATIONS_HEADING).toBe('Conversations');
    expect(labels.NO_CONVERSATIONS_LINE).toBe('No conversations yet.');
    expect(labels.NO_ARCHIVED_LINE).toBe('No archived conversations.');
    expect(labels.MESSAGES_REGION_LABEL).toBe('Messages');
    expect(labels.QUESTION_FIELD_LABEL).toBe('Question');
  });

  it('says who wrote a turn, for a screen reader', () => {
    expect(labels.QUESTION_ROLE_LABEL).toBe('You asked');
    expect(labels.ANSWER_ROLE_LABEL).toBe('The assistant answered');
  });

  it('has one problem line for each read or write that can fail', () => {
    expect(labels.conversationsProblemLine('x')).toBe('Could not load the conversations: x');
    expect(labels.statusProblemLine('x')).toBe('Could not load the Workspace service status: x');
    expect(labels.askProblemLine('x')).toBe('Could not send this question: x');
    expect(labels.stopProblemLine('x')).toBe('Could not stop this answer: x');
    expect(labels.archiveProblemLine('x')).toBe('Could not change this conversation: x');
  });
});

/* ===========================================================================
 * Phase 24b (brief 111, task 3)
 * ======================================================================== */

describe('the fixed lines of a turn (brief 111, "The fixed lines")', () => {
  it('holds the runner\'s own sentence for `empty` and for `failed`, equal to workspace/src/lines.ts', () => {
    expect(labels.RETRIEVAL_LINES.empty).toBe(LINES.empty);
    expect(labels.RETRIEVAL_LINES.failed).toBe(LINES.search_failed);
  });

  it('has a line for exactly the two retrieval states that show one', () => {
    expect(Object.keys(labels.RETRIEVAL_LINES).sort()).toEqual(['empty', 'failed']);
  });

  it('never says that nothing of his was used: the empty line names his files and uploads', () => {
    expect(labels.RETRIEVAL_LINES.empty).toContain('your course files or uploads');
    expect(labels.RETRIEVAL_LINES.empty).not.toMatch(/nothing of yours/i);
  });

  it('has the searching line, ending with the one ellipsis character', () => {
    expect(labels.SEARCHING_LINE).toBe('Looking through your course files and uploads…');
  });

  it('counts sources in the row under an answer, singular and plural', () => {
    expect(labels.sourcesCountLine(1)).toBe('1 source');
    expect(labels.sourcesCountLine(3)).toBe('3 sources');
    expect(labels.sourcesCountLine(0)).toBe('0 sources');
  });

  it('names a source chip by its row order', () => {
    expect(labels.sourceChipLabel(2)).toBe('Source 2');
  });
});

describe('the refusals workspace_ask_with adds (brief 111, "Refusals")', () => {
  it('has one sentence for 23503 raised by the function (a reference that is gone)', () => {
    expect(labels.REFUSAL_REFERENCE_GONE).toBe(
      'Something this question names is no longer there. Remove it and ask again.',
    );
  });

  it('has one sentence for 23514 (options the database would not take)', () => {
    expect(labels.REFUSAL_OPTIONS_REJECTED).toBe(
      'These options were not accepted. Check the course, the depth and the attachments, then ask again.',
    );
  });

  it('has one sentence for 42501 (not the owner), and it says nothing was changed', () => {
    expect(labels.NOT_OWNER_LINE).toBe(
      "This session is not the owner's, so the Workspace changed nothing.",
    );
  });

  it('keeps the four refusal sentences apart from each other', () => {
    const four = [
      labels.REFUSAL_STILL_ANSWERING,
      labels.REFUSAL_QUESTION_LENGTH,
      labels.REFUSAL_REFERENCE_GONE,
      labels.REFUSAL_OPTIONS_REJECTED,
    ];
    expect(new Set(four).size).toBe(4);
  });
});

describe('the composer (brief 111, "The composer", "Routines")', () => {
  it('names the plus menu, its two groups and its three entries', () => {
    expect(labels.ADD_MENU_LABEL).toBe('Add');
    expect(labels.ATTACHMENTS_GROUP_HEADING).toBe('Attachments');
    expect(labels.STARTING_POINTS_GROUP_HEADING).toBe('Starting points');
    expect(labels.ATTACH_FROM_MATERIALS_LABEL).toBe('Attach from materials');
    expect(labels.UPLOAD_FROM_DEVICE_LABEL).toBe('Upload from this device');
    expect(labels.USE_ROUTINE_LABEL).toBe('Use a routine');
  });

  it('has the routine list\'s search field, the three group headings and its empty line', () => {
    expect(labels.ROUTINE_FILTER_PLACEHOLDER).toBe('Find a routine');
    expect(labels.ROUTINE_GROUP_HEADINGS).toEqual({ study: 'Study', plan: 'Plan', write: 'Write' });
    expect(labels.NO_ROUTINE_MATCH_LINE).toBe('No routine matches.');
  });

  it('has the course chip\'s menu name and its first entry', () => {
    expect(labels.COURSE_MENU_LABEL).toBe('Course');
    expect(labels.ALL_COURSES_LABEL).toBe('All courses');
  });

  it('has the depth menu with its four entries, Auto first, each with a note', () => {
    expect(labels.DEPTH_MENU_LABEL).toBe('Depth');
    expect(Object.keys(labels.DEPTH_LABELS)).toEqual(['auto', 'quick', 'standard', 'deep']);
    expect(labels.DEPTH_LABELS).toEqual({ auto: 'Auto', quick: 'Quick', standard: 'Standard', deep: 'Deep' });
    expect(Object.keys(labels.DEPTH_NOTES)).toEqual(Object.keys(labels.DEPTH_LABELS));
    expect(labels.DEPTH_NOTES.deep).toBe('The most thorough, for this one question.');
  });

  it('names each chip for a screen reader and gives every chip the same Remove', () => {
    expect(labels.courseChipLabel('IST 323')).toBe('Course: IST 323');
    expect(labels.routineChipLabel('Quiz me')).toBe('Routine: Quiz me');
    expect(labels.attachmentChipLabel('lab-notes.pdf')).toBe('Attached: lab-notes.pdf');
    expect(labels.REMOVE_CHIP_LABEL).toBe('Remove');
  });

  it('says why Ask is off: the limit, a routine\'s need, an upload not read yet', () => {
    expect(labels.ATTACHMENTS_LIMIT_LINE).toBe('Up to five files a question.');
    expect(labels.routineNeedsFileLine('Explain this file')).toBe(
      'Explain this file needs an attached file.',
    );
    expect(labels.routineNeedsCourseOrFileLine('Quiz me')).toBe(
      'Quiz me needs a course or an attached file.',
    );
    expect(labels.UPLOAD_NOT_READY_LINE).toBe(
      'An attached upload is still being read. Ask once it is indexed.',
    );
  });

  it('has a problem line for the restored settings and for the routines', () => {
    expect(labels.optionsProblemLine('x')).toBe("Could not restore the last question's settings: x");
    expect(labels.routinesProblemLine('x')).toBe('Could not load the routines: x');
  });
});

describe('the side panel (brief 111, "The side panel")', () => {
  it('names the region, the three tabs in order, and the one fold button\'s two states', () => {
    expect(labels.PANEL_REGION_LABEL).toBe('Details');
    expect(Object.keys(labels.PANEL_TABS)).toEqual(['sources', 'files', 'memory']);
    expect(labels.PANEL_TABS).toEqual({ sources: 'Sources', files: 'Files', memory: 'Memory' });
    expect(labels.HIDE_PANEL_LABEL).toBe('Hide panel');
    expect(labels.SHOW_PANEL_LABEL).toBe('Show panel');
  });

  it('has one filter placeholder for the Files tab and the Memory tab, and a Close for a sheet', () => {
    expect(labels.FILTER_PLACEHOLDER).toBe('Filter by title');
    expect(labels.CLOSE_LABEL).toBe('Close');
  });
});

describe('the Sources tab', () => {
  it('has its four states in words', () => {
    expect(labels.NO_ANSWER_PICKED_LINE).toBe('Pick an answer to see its sources.');
    expect(labels.SOURCES_LOADING_LINE).toBe('Loading the sources…');
    expect(labels.NO_SOURCES_LINE).toBe('No source was used for this answer.');
    expect(labels.sourcesProblemLine('x')).toBe('Could not load the sources: x');
  });

  it('names the four source kinds, the two other origins and the Open button', () => {
    expect(labels.SOURCE_KIND_LABELS).toEqual({
      material: 'Course file',
      upload: 'Upload',
      memory: 'Remembered',
      feed: 'Planner',
    });
    expect(labels.ATTACHED_SOURCE_LABEL).toBe('Attached');
    expect(labels.OPENED_SOURCE_LABEL).toBe('Opened by the assistant');
    expect(labels.OPEN_SOURCE_LABEL).toBe('Open');
  });

  it('places a passage by its unit, and passes an unknown kind through as spelled', () => {
    expect(labels.unitLocationLine('page', 7)).toBe('page 7');
    expect(labels.unitLocationLine('slide', 3)).toBe('slide 3');
    expect(labels.unitLocationLine('sheet', 2)).toBe('sheet 2');
    expect(labels.unitLocationLine('doc', 1)).toBe('part 1');
    expect(labels.unitLocationLine('chunk', 4)).toBe('part 4');
    expect(labels.unitLocationLine('verse', 9)).toBe('verse 9');
  });
});

describe('the Files tab', () => {
  it('has its empty lines and the uploading label', () => {
    expect(labels.NO_UPLOADS_LINE).toBe('No uploads yet.');
    expect(labels.NO_UPLOAD_MATCH_LINE).toBe('No upload matches.');
    expect(labels.UPLOADING_LABEL).toBe('Uploading');
  });

  it('words each of the six document states, no two alike, and a row in deleting reads Removing', () => {
    expect(Object.keys(labels.DOCUMENT_STATE_LABELS).sort()).toEqual(
      ['deleting', 'failed', 'indexed', 'reading', 'stored', 'text_ready'],
    );
    expect(new Set(Object.values(labels.DOCUMENT_STATE_LABELS)).size).toBe(6);
    expect(labels.DOCUMENT_STATE_LABELS.deleting).toBe('Removing');
    expect(labels.DOCUMENT_STATE_LABELS.indexed).toBe('Indexed');
  });

  it('has one sentence for each of the ten upload error codes, no two alike', () => {
    expect(Object.keys(labels.UPLOAD_ERROR_SENTENCES).sort()).toEqual([
      'bad_bytes',
      'bad_type',
      'download_failed',
      'embed_failed',
      'extract_failed',
      'extract_timeout',
      'link_expired',
      'no_text',
      'too_large',
      'too_many_units',
    ]);
    expect(new Set(Object.values(labels.UPLOAD_ERROR_SENTENCES)).size).toBe(10);
    expect(labels.UPLOAD_ERROR_SENTENCES.too_large).toBe('The file is larger than 20 MB.');
    expect(labels.UPLOAD_ERROR_SENTENCES.link_expired).toBe(
      'The upload link expired before the file was read. Try again.',
    );
  });

  it('has the two refusals the page makes before anything is sent', () => {
    expect(labels.UPLOAD_REFUSALS).toEqual({
      too_large: 'Files up to 20 MB.',
      bad_type: 'PDF, Word, PowerPoint, Excel, plain text or Markdown only.',
    });
  });

  it('has Try again, Delete and its second press', () => {
    expect(labels.TRY_AGAIN_LABEL).toBe('Try again');
    expect(labels.DELETE_LABEL).toBe('Delete');
    expect(labels.CONFIRM_DELETE_LABEL).toBe('Press again to delete');
  });

  it('says under Delete that answers already written keep what they quoted (task 3)', () => {
    expect(labels.UPLOAD_DELETE_NOTE).toBe(
      'This file will no longer be searched or attached. Answers already written keep what they quoted from it.',
    );
    expect(labels.UPLOAD_DELETE_NOTE).toContain('Answers already written keep what they quoted');
  });

  it('has a problem line for the upload, the list and the remove', () => {
    expect(labels.uploadProblemLine('x')).toBe('Could not upload this file: x');
    expect(labels.filesProblemLine('x')).toBe('Could not load your uploads: x');
    expect(labels.removeProblemLine('x')).toBe('Could not remove this file: x');
  });
});

describe('the index status line', () => {
  it('names the heading and the three kinds', () => {
    expect(labels.INDEX_STATUS_HEADING).toBe('Index');
    expect(labels.INDEX_KIND_LABELS).toEqual({
      course: 'Course files',
      uploads: 'Uploads',
      memory: 'Remembered',
    });
  });

  it('shows a failed count only when the row holds one', () => {
    expect(labels.indexCountsLine('uploads', { indexed: 2, waiting: 1, failed: 1 })).toBe(
      'Uploads: 2 indexed, 1 waiting, 1 failed',
    );
    expect(labels.indexCountsLine('course', { indexed: 120, waiting: 3, failed: null })).toBe(
      'Course files: 120 indexed, 3 waiting',
    );
    expect(labels.indexCountsLine('memory', { indexed: 0, waiting: 0, failed: 0 })).toBe(
      'Remembered: 0 indexed, 0 waiting, 0 failed',
    );
  });

  it('says when a course file was last indexed, or that none has been', () => {
    expect(labels.lastIndexedLine('Tue Oct 14')).toBe('Course files last indexed Tue Oct 14.');
    expect(labels.NEVER_INDEXED_LINE).toBe('No course file has been indexed yet.');
    expect(labels.indexStatusProblemLine('x')).toBe('Could not load the index status: x');
  });
});

describe('the Memory tab', () => {
  it('has the About me note\'s heading, placeholder, limit and controls', () => {
    expect(labels.ABOUT_ME_HEADING).toBe('About me');
    expect(labels.ABOUT_ME_PLACEHOLDER).toBe('A few lines the assistant reads with every question');
    expect(labels.ABOUT_ME_LIMIT_LINE).toBe('Up to 2000 characters.');
    expect(labels.EDIT_LABEL).toBe('Edit');
    expect(labels.SAVE_LABEL).toBe('Save');
    expect(labels.CANCEL_LABEL).toBe('Cancel');
    expect(labels.SAVED_LINE).toBe('Saved.');
    expect(labels.aboutMeProblemLine('x')).toBe('Could not save the note: x');
  });

  it('has the list\'s empty lines, the note under Delete and its problem lines', () => {
    expect(labels.NO_MEMORY_LINE).toBe('Nothing is remembered yet.');
    expect(labels.NO_MEMORY_MATCH_LINE).toBe('No remembered item matches.');
    expect(labels.MEMORY_DELETE_NOTE).toBe('This item will no longer be remembered or searched.');
    expect(labels.memoryProblemLine('x')).toBe('Could not load what is remembered: x');
    expect(labels.forgetProblemLine('x')).toBe('Could not delete this item: x');
  });
});

describe('the lobby (brief 111, "The lobby")', () => {
  it('greets with no name in it', () => {
    expect(labels.GREETING_LINE).toBe('What are you working on?');
    expect(labels.GREETING_LINE).not.toMatch(/stack/i);
  });

  it("states today's weekday and date from the words it is given (amendment (g))", () => {
    expect(labels.todayLine('Thursday, October 15, 2026')).toBe('Today is Thursday, October 15, 2026.');
  });

  it('has the four headings and the two links', () => {
    expect(labels.ROUTINES_HEADING).toBe('Routines');
    expect(labels.EXAMPLES_HEADING).toBe('From your planner');
    expect(labels.REFRESH_EXAMPLES_LABEL).toBe('Other examples');
    expect(labels.RECENT_HEADING).toBe('Recent');
    expect(labels.VIEW_ALL_LABEL).toBe('View all');
  });

  it('builds an example prompt in one of three forms, each naming the item and its date', () => {
    const facts = { title: 'Quiz 3', course: 'IST 323', date: 'Tue Oct 21' };
    expect(labels.examplePromptLine('exam', facts)).toBe(
      'Quiz me on what IST 323\'s "Quiz 3" covers before Tue Oct 21.',
    );
    expect(labels.examplePromptLine('reading', facts)).toBe(
      'Summarise the reading "Quiz 3" for IST 323, due Tue Oct 21.',
    );
    expect(labels.examplePromptLine('work', facts)).toBe(
      'Help me plan IST 323\'s "Quiz 3", due Tue Oct 21.',
    );
    for (const form of ['exam', 'reading', 'work'] as const) {
      const line = labels.examplePromptLine(form, facts);
      expect(line).toContain(facts.title);
      expect(line).toContain(facts.date);
    }
  });
});

describe('the material picker (brief 111, "Attaching from materials")', () => {
  it('has its filter field, its loading line, its two empty lines and its problem line', () => {
    expect(labels.MATERIAL_FILTER_PLACEHOLDER).toBe('Filter by file name');
    expect(labels.MATERIALS_LOADING_LINE).toBe('Loading your materials…');
    expect(labels.NO_MATERIALS_LINE).toBe('No files have been pulled yet.');
    expect(labels.NO_MATERIAL_MATCH_LINE).toBe('No file matches.');
    expect(labels.materialsProblemLine('x')).toBe('Could not load your materials: x');
  });
});

describe('rules every string keeps', () => {
  it('samples every builder the module exports', () => {
    expect(builtStrings().length).toBe(exportedBuilderCount());
  });

  it('has no dollar sign and no amount of money in any string', () => {
    const strings = [...constantStrings(), ...builtStrings()];
    expect(strings.length).toBeGreaterThan(100);
    for (const text of strings) {
      expect(text, text).not.toContain('$');
      expect(text, text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:usd|dollars?|cents?)\b/i);
      expect(text, text).not.toMatch(/\b(?:usd|dollars?|cents?)\b/i);
    }
  });

  it('has a number in no constant but the four that state a limit', () => {
    const numbered = constantStrings().filter((text) => /\d/.test(text));
    expect(numbered.sort()).toEqual(
      [
        labels.REFUSAL_QUESTION_LENGTH,
        labels.UPLOAD_REFUSALS.too_large,
        labels.UPLOAD_ERROR_SENTENCES.too_large,
        labels.ABOUT_ME_LIMIT_LINE,
      ].sort(),
    );
  });

  it('ends a waiting line with the one ellipsis character, never three stops', () => {
    for (const text of constantStrings()) {
      expect(text, text).not.toContain('...');
    }
    const waiting = constantStrings().filter((text) => text.endsWith('…'));
    expect(waiting.length).toBeGreaterThanOrEqual(5);
  });

  it('has no control that reads Submit', () => {
    for (const text of constantStrings()) expect(text, text).not.toMatch(/\bSubmit\b/);
  });

  it('holds every constant once: no two exported constants spell the same sentence', () => {
    const own = Object.entries(labels)
      .filter(([, value]) => typeof value === 'string')
      // `STOPPED_SENTENCE` is `ERROR_SENTENCES.cancelled` by design; it is the one alias.
      .filter(([name]) => name !== 'STOPPED_SENTENCE')
      .map(([, value]) => value as string);
    expect(new Set(own).size).toBe(own.length);
  });
});

/* ===========================================================================
 * W-87 additions (for the PM to accept)
 * ======================================================================== */

describe('W-87 additions: the two problem lines the composer and the lobby need', () => {
  it('words a failed read of the courses and of the upcoming work in the app form', () => {
    expect(labels.coursesProblemLine('x')).toBe('Could not load your courses: x');
    expect(labels.examplesProblemLine('x')).toBe('Could not load your upcoming work: x');
  });
});

describe('W-87 additions: the line for an attached upload that failed (Round 3, W-6)', () => {
  it('names the failure with the row\'s reason, and stands without one', () => {
    expect(labels.uploadFailedAttachedLine(labels.UPLOAD_ERROR_SENTENCES.too_many_units)).toBe(
      'An attached upload failed: The file has too many pages or slides to index. Try again or remove it.',
    );
    expect(labels.uploadFailedAttachedLine(null)).toBe('An attached upload failed. Try again or remove it.');
  });
});

/* ===========================================================================
 * W-88 additions (for the PM to accept)
 * ======================================================================== */

describe('W-88 additions (for the PM to accept)', () => {
  it('says an Open that failed in the app`s own form, with its reason', () => {
    expect(labels.openProblemLine('x')).toBe('Could not open this file: x');
  });
});
