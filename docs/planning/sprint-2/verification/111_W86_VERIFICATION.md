# 111 W-86: the data layer of Phase 24b (tasks 4, 5 and 6; probe Q-4)

Worker W-86, Opus, branch `feat/workspace-page-24b-data` (cut from `feat/workspace-page-24b` at
`0f5b609`), worktree `bb2dash-wt-24b-data`. Built test first, red then green, one commit per task, pushed
after each. The contract is brief 111's "The data layer's frozen exports"; every exported name and
signature there is built as written, and no other name is exported. Nothing visual, nothing live: no
database access, no Supabase request (every test stubs the client), no `.env` file, no browser. No file
under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, no CSS module, neither layout check.

## Commits

| commit | what |
|---|---|
| `46d5186` | task 4: `answer-format.ts` and `answer-format.test.ts`; `workspace-citations.ts` begun with `LABEL_TOKEN` and `findLabelTokens`, which the parser imports |
| `90bf939` | task 5: the eight modules and their eight tests (`workspace-citations.ts` finished) |
| (the last commit) | task 6: `use-workspace-stream.ts`, its three tests extended, `use-workspace-stream.stop.test.tsx`; this file |

## Task 4: the parser alone

Red (before `answer-format.ts` existed):

    $ npx vitest run test/answer-format.test.ts
    Test Files  1 failed (1)
         Tests  no tests            (Failed to resolve import "@/lib/answer-format")

Green:

    $ npx vitest run test/answer-format.test.ts
    Test Files  1 passed (1)
         Tests  43 passed (43)

The file holds four `fast-check` properties over generated strings (400 runs each where named): every
node is a member of the two unions with exactly its keys (no element, URL or attribute can come out); no
input throws; `blocksText(parseAnswer(s))` keeps every label token of `s` (fence lines excepted, see the
defaults); the same text gives equal blocks; and a flush that appends text leaves the blocks before the
last one unchanged. Beyond the committed runs I stress-ran the prefix property in a scratch test file
(deleted, never committed): 20,000 runs of head and tail, then 3,000 strings checked at every character
split, both green; and after the tokenizer was rewritten for Q-4, 20,000 more of the prefix property and
20,000 of the label property, green. An `AnswerBody.tsx` was not written: it is W-88's at the gate.

## Task 5: the eight other modules

Red (the eight tests written first; `workspace-citations.ts` had only its two task 4 exports):

    $ npx vitest run test/workspace-upload-rules.test.ts test/queries.workspace-ask.test.ts \
        test/queries.workspace-sources.test.ts test/workspace-citations.test.ts test/workspace-examples.test.ts \
        test/queries.workspace-routines.test.ts test/queries.workspace-memory.test.ts test/queries.workspace-files.test.ts
    Test Files  8 failed (8)
         Tests  12 failed | 3 passed (15)    (seven files could not resolve their module; the 3 are the token cases)

Green (same command):

    Test Files  8 passed (8)
         Tests  155 passed (155)

The named cases of task 5, each in `queries.workspace-files.test.ts` unless named:

| case | test |
|---|---|
| a label with no source row stays text (`citationFor` is null) | `workspace-citations.test.ts`, "keeps a label with no source row as text" |
| no rows give no example | `workspace-examples.test.ts`, "gives no example for no rows, ever" |
| a file of 20,971,521 bytes is refused before any request | "refuses a file of 20,971,521 bytes before any request" (no port is called); also `workspace-upload-rules.test.ts` |
| a Markdown file with no reported type is taken by its extension and stored with `text/markdown` | "stores a Markdown file with no reported type as text/markdown, under u/ and its hash" |
| the object key is `u/` and the SHA-256 whatever the file's name | "makes the key from the hash whatever the file is called" (three hostile names) |
| a file whose hash an upload row already holds is not uploaded and that row is used | "uploads nothing when an upload row already holds the hash" (the log is `digest` only) |
| the register call carries the hash | "sends the hash, the title from the name and the rules` type to the register call" |
| a delete makes the first call, the storage remove, then the second call | "makes the first call, then the storage remove with the key it returned, then the second call" (log `remove(false)`, `removeObject`, `remove(true)`) |
| a failed remove makes no second call | "makes no second call when the storage remove fails" (log `remove(false)` only) |

Each labels record keyed by a vocabulary is pinned to its type in the owning module's test, with a
`const _x: Record<Type, string> = LABELS` line and a key-list assertion beside it:
`DOCUMENT_STATE_LABELS` and `UPLOAD_ERROR_SENTENCES` (files), `DEPTH_LABELS` and `DEPTH_NOTES` (ask),
`SOURCE_KIND_LABELS` and `RETRIEVAL_LINES` (sources), `ROUTINE_GROUP_HEADINGS` (routines),
`UPLOAD_REFUSALS` (upload rules). `PANEL_TABS` keys no type of these modules (the panel's tabs are
W-88's route), so it is not pinned here.

## Task 6: the stream

Red (the three tests extended and the stop test added, the hook unchanged):

    $ npx vitest run test/use-workspace-stream.test.tsx test/use-workspace-stream.realtime.test.tsx \
        test/use-workspace-stream.screen.test.tsx test/use-workspace-stream.stop.test.tsx
    Test Files  3 failed | 1 passed (4)
         Tests  23 failed | 73 passed (96)

The screen file passed in the red run, as it should: its new case says a `sources` event changes nothing
on today's screen, and the old hook did not subscribe to it.

Green (same command):

    Test Files  4 passed (4)
         Tests  96 passed (96)

What each file gained: `use-workspace-stream.test.tsx` (the handler list now names `broadcast:sources`;
the view's shape now has `sources: null, stopped: false`; `parseSources` over `sources-event.json` and
six bad payloads; the reducer keeps sources per request and returns the same state for a repeat; the
hook shows the event, then invalidates the turns and that request's sources; `done` invalidates both as
well); `use-workspace-stream.realtime.test.tsx` (a pushed `sources` frame over the real supabase-js
client reaches the view); `use-workspace-stream.screen.test.tsx` (today's page keeps its text when the
event arrives); `use-workspace-stream.stop.test.tsx`, new: a delta after the stopped mark changes nothing
(the same state object), a `sources` event after it changes nothing, a `done` after it changes nothing,
an unknown event changes nothing (it is never subscribed, so never dispatched), `markStopped` is the same
function on every render, and a mark for an id that is not a request id changes nothing.

`Workspace.tsx` and `thread.ts` were not touched and still compile (`npm run typecheck` below): the
view only gained fields, and the hook returns the view with `markStopped` beside it.

## Probe Q-4: `parseAnswer` on a 100,000-character answer

A one-off vitest case outside the committed tree (its copy is at
`C:/Users/stack/AppData/Local/Temp/claude/w86-q4.probe.ts`): a section with an h2, a paragraph with bold,
italic, inline code and four labels, an ordered list with nested bullets, a three-column table of three
rows, a Python fence and a quote, repeated and cut to exactly 100,000 characters (867 blocks); 5 warm-up
parses, then 30 timed with `performance.now()`, the median of the 30. Five separate runs on this laptop
(Windows 11, Node v24.19.0, vitest 5.0.0, jsdom worker):

    Q-4 length=100000 runs=30 blocks=867 median=8.77ms min=6.77ms max=14.90ms
    Q-4 length=100000 runs=30 blocks=867 median=8.00ms min=6.86ms max=18.41ms
    Q-4 length=100000 runs=30 blocks=867 median=7.67ms min=6.88ms max=16.26ms
    Q-4 length=100000 runs=30 blocks=867 median=8.92ms min=6.92ms max=19.51ms
    Q-4 length=100000 runs=30 blocks=867 median=8.55ms min=6.92ms max=21.08ms

**Q-4: PASS, median 8.55 ms** (the middle of the five medians; every median is under 16 ms). Live text
can be formatted on each 250 ms flush. Two changes got it there, both in the committed code: the first
version measured 14.2 ms, the inline tokenizer then jumps from one special character to the next (11.4
ms), and `findLabelTokens` uses an `exec` loop with a no-bracket fast path instead of `matchAll`, which
copies its regex on every call (a CPU profile put 16 of about 50 s of samples there). The maxima reach 21
ms: a single flush can miss a frame now and then; the median is what the probe asks for.

## Defaults I took (nobody answers mid-run)

The parser (`answer-format.ts`):

1. **A line that ends the block above it must keep doing so as characters arrive**, or a later flush would
   change a finished block. This is what the prefix property found on its first run (an empty heading
   `#` turned back into text when `a` arrived). From it: a heading needs whitespace after its hashes ("#"
   alone is text); **any** line of three or more backticks or tildes opens a fence (CommonMark forbids a
   backtick in a backtick fence's info string; here the line still opens, and the language is the info
   string's first word when it matches `[A-Za-z0-9_+.#-]{1,32}`, else null); **a table starts only where a
   block starts, never inside a paragraph** (GFM lets it interrupt; a delimiter row can stop being one as
   text arrives); table rows run to a blank line or a line that starts its own block, a row with no pipe
   being a one-cell row (GFM's rule); a line that may still become a list marker ("-", "1", "12.") after a
   blank line inside a list stays in the list.
2. An unclosed fence, at the end of the answer or of its list item or quote, is one paragraph of text
   holding its lines as written (no labels, since they would be code once it closes).
3. Thematic breaks (`---`, `***`, `___`) are dropped: the union has no rule block.
4. A soft line break inside a paragraph is kept as `\n` in its text; W-88's renderer decides how to show it.
5. Quotes and lists nest at most 8 deep; deeper lines are read as paragraph text, so no input exhausts the stack.
6. An ordered item interrupts a paragraph only from 1, and an empty item never does (CommonMark); a line
   indented past its item's marker belongs to the item (lenient about 2 or 4 spaces under "1.").
7. Emphasis: runs of one or two `*` or `_`; three or more are text; an opener takes the first closer of
   its kind inside its range; `_` does not open or close inside a word. Backslash escapes of ASCII
   punctuation are read outside code.
8. Table rows shorter than the header are padded with empty cells; longer ones keep their extra cells.
9. `blocksText` joins blocks with a blank line, list items and table rows with a line break, cells with
   ` | `; a code block's language is not answer text and is left out. So the label property excludes
   fence lines (past any quote and list markers): their info string is markup.

The modules:

10. Private helpers (`oneOf`, `textOrNull`, a count reader) are repeated in the modules that need them:
    the frozen exports are a closed list and the file list allows no shared helper file.
11. `checkUploadRules` checks the type, then the size; an empty file is refused as `bad_type` (the
    reason list has no third entry, and a file of 0 bytes is no readable file of the six); a name with
    no extension is `bad_type`. The title of a name with nothing in it is the stored value `Untitled`, a
    named constant in the module (a stored title, not page wording).
12. `findUploadBySha256` reads with `limit(1)`, not `maybeSingle()`, so two rows (which the database
    should not hold) are not an error. `setUploadCourse` and `setUploadTitle` filter on `kind = 'upload'`
    as well as the id, and refuse an empty course id and a title outside 1 to 200 characters (trimmed).
13. `registerUpload` checks every argument by the database's rules before the call (a title must come
    trimmed); `uploadFile` passes the rules' title, so the check holds.
14. The browser store signs with `createSignedUrl` and reports `expiresAt` as the browser's clock plus the
    seconds; skew of minutes is nothing against 7 days. `putObject` uploads with `upsert: false` and takes
    a 409 (`status` or `statusCode`) as the object already there.
15. `removeUpload` stops after the first call when it already answered `deleted`, and throws when it
    returned no key (an upload always has one). `retryUploadLink` refuses a row that is not `failed`, or
    has no key, before any call.
16. `uploadsSettling` counts a `deleting` row as settling (the frozen rule: any row not indexed and not
    failed), so the Files tab re-reads every 5 s while a delete is unfinished.
17. The memory list is the catalog rows of kind `memory` with the view's summary beside each; a view row
    with no catalog row is not listed; newest `updated_at` first, a row with none last. `profileOptions`
    answers null when there is no row; the index status with no row reads every count 0 (the frozen rule).
    `parseAboutMe` throws a different Error for a value that is not text.
18. Example prompts: not finished means `not_started` or `in_progress` after `foldStatus` (so `planned`
    counts as open, and `submitted`, `graded`, `excused`, `missed`, `waived`, `not_applicable` do not); the
    window is inclusive at both ends; a tie on due date goes by title (`localeCompare`, `en`), then the
    order given. `examplesShown` wraps the page number and fills the last page from the start, so three
    show whenever there are three.
19. `requestOptionsOptions`'s key is the frozen one (the conversation's, without the request ids), so
    `useAskWorkspaceWith` also invalidates it on settle. `askWorkspaceWith` measures the question, then
    the options, then the conversation id, then calls. `toAskOptionsJson` also refuses an empty course or
    routine string.
20. `normalizeSource` needs an `ord` from 1 and reads `unit_no` from 0; `normalizeTurn` reads a count it
    cannot read as 0 and drops an attachment entry it cannot read.
21. The stream: a `done` after the stopped mark still invalidates the rows (the stored row is the record
    either way); `markStopped` is a `useCallback` on the topic and ignores an id that is not a request id;
    the four retrieval states are listed again privately in the hook to read the event.
22. The tests import the contract24 JSON fixtures directly (`resolveJsonModule`): under jsdom
    `import.meta.url` is not a `file:` URL, so `readFileSync(new URL(...))` fails.

23. **For the PM: `test/status-vocabulary.test.ts` and the plan state.** The first whole-suite run after
    task 5 failed one case there: "is the only file that names a retired enum value" reported
    `lib/queries.workspace-sources.ts`, because the frozen `WorkspacePlanState` holds the word `planned`
    in quotes, and `planned` is also a retired value of the planner's `progress_status` enum. The two are
    different vocabularies that share a word (the audit's own `LABEL_EXEMPT` note describes that kind of
    case). The audit is not a file W-86 may edit, so the value is written as a template literal,
    `` `planned` ``, which is the same type and the same string, with a comment saying why. **Task 5's
    commit `90bf939` carries that failure; the task 6 commit fixes it.** Suggested for the PM: exempt
    `lib/queries.workspace-sources.ts` from that one case (as `queries.grades.ts` is from the label
    case), then the quotes can come back. W-88 meets the same audit if the thread spells `planned`.

Three files pass the 400-line mark: `queries.workspace-files.ts` (516), `answer-format.ts` (596) and
`use-workspace-stream.ts` (478, from 373). All are under 800, and the fixed file list leaves no room to
split them.

## Strings added to the labels files

None. `workspace-labels.ts` and `workspace-labels.test.ts` are unchanged.

## The gates

From `web/`:

    $ npm run typecheck                      exit 0
    $ npx eslint . --max-warnings 0          exit 0
    $ npx vitest run --coverage              exit 0
     Test Files  166 passed (166)
          Tests  3176 passed (3176)
    All files    |   90.38 |    84.44 |   89.93 |   92.66 |      (statements, branches, functions, lines)

The suite before my branch (`0f5b609`): 156 files, 2,954 tests, all passed.

Coverage, lines, from the same run's table:

| file | % stmts | % branch | % funcs | % lines |
|---|---|---|---|---|
| `answer-format.ts` | 99.69 | 99.02 | 100 | 100 |
| `queries.workspace-ask.ts` | 100 | 97.59 | 100 | 100 |
| `queries.workspace-files.ts` | 96.93 | 95.93 | 97.77 | 99.24 |
| `queries.workspace-memory.ts` | 97.64 | 90 | 100 | 100 |
| `queries.workspace-routines.ts` | 100 | 95 | 100 | 100 |
| `queries.workspace-sources.ts` | 100 | 97.14 | 100 | 100 |
| `workspace-citations.ts` | 98.66 | 98.41 | 100 | 100 |
| `workspace-examples.ts` | 100 | 93.33 | 100 | 100 |
| `workspace-upload-rules.ts` | 100 | 100 | 100 | 100 |
| `use-workspace-stream.ts` | 97.33 | 93.75 | 100 | 98.4 |

The suite's text table leaves out a file covered in full, so `workspace-upload-rules.ts` is not in it;
its row comes from `npx vitest run test/workspace-upload-rules.test.ts --coverage
--coverage.include=src/lib/workspace-upload-rules.ts --coverage.reporter=json-summary`. The suite went
from 156 files and 2,954 tests to 166 files and 3,176 tests (ten new files, none dropped). An earlier
whole-suite run, before the fix in default 23, gave 165 passed and 1 failed (`status-vocabulary.test.ts`).

From the worktree root:

    $ git grep -n -e "\.from(.workspace_document_text.)" -e "\.from(.workspace_text_embeddings.)" -- web/src
    (no output, exit 1)

    $ git diff --name-only feat/workspace-page-24b...HEAD
    docs/planning/sprint-2/verification/111_W86_VERIFICATION.md
    web/src/lib/answer-format.ts
    web/src/lib/queries.workspace-ask.ts
    web/src/lib/queries.workspace-files.ts
    web/src/lib/queries.workspace-memory.ts
    web/src/lib/queries.workspace-routines.ts
    web/src/lib/queries.workspace-sources.ts
    web/src/lib/use-workspace-stream.ts
    web/src/lib/workspace-citations.ts
    web/src/lib/workspace-examples.ts
    web/src/lib/workspace-upload-rules.ts
    web/test/answer-format.test.ts
    web/test/queries.workspace-ask.test.ts
    web/test/queries.workspace-files.test.ts
    web/test/queries.workspace-memory.test.ts
    web/test/queries.workspace-routines.test.ts
    web/test/queries.workspace-sources.test.ts
    web/test/use-workspace-stream.realtime.test.tsx
    web/test/use-workspace-stream.screen.test.tsx
    web/test/use-workspace-stream.stop.test.tsx
    web/test/use-workspace-stream.test.tsx
    web/test/workspace-citations.test.ts
    web/test/workspace-examples.test.ts
    web/test/workspace-upload-rules.test.ts

The gates ran on this branch as cut from `0f5b609`. While I worked, the phase branch moved on to
`997d24d` (111a records a merge of `origin/feat/workspace-24` into it); I did not merge it in, so the
gates have not been run over the two together. That is the PM's merge to check.
