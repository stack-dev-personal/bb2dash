# Phase 24a (the Workspace behind the page): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below that section. So each section stands by itself, and these opening paragraphs never reach
the operator. This file holds no course text and no answer: this repository is public.

How a section writes a text of the page is a rule of `acceptance/README.md`: in code marks,
exactly as the page has it. `node --test acceptance/acceptance.test.mjs` holds each such text
against the app's own strings.

**Why the questions are worded as they are** (for whoever maintains the pack). Phase 24a does not
change the page, so it has no control for a depth, a routine or an upload, and the page sends every
question as Auto. The router (`workspace/src/router.ts`) then picks the tier from the words, and a
test of the pack runs the router over every question of `web/e2e/accept24.spec.ts`:

- A lookup opens with one of the router's cue words and holds no execution verb. It goes to the
  lowest tier, which takes no planning turn. Steps 3, 4, 6, 7, 8, 9 (its second question) and 13 are
  lookups.
- A Standard-depth question opens with a word that is neither a cue word nor an execution verb
  (`Explain`). It goes to the middle tier, and the middle tier and the highest tier take a planning
  turn. Step 5 asks one, and so does the first question of step 9, worded to give a long answer so
  that Stop can be pressed while the answer is written. The pack never asks the highest tier.
- The follow-up of step 7 is short, so it keeps the conversation's tier.
- The question of step 8 is made of invented words. It has to stay nonsense: a real word of a course
  or of the synthetic file could match a passage and the retrieval would no longer be empty. Do not
  "improve" it into a real topic.

**The file of steps 11 to 15** is made in each run from a value the test draws (`nonce_id`), so its
hash is one no earlier run used. A run that stopped between steps 11 and 15 leaves a synthetic
upload in the owner's store, searched like any other, until it is removed: the PM removes it
through the page's own session, by the `document_id` in that run's `11.json`.

## Stage: walk

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. On the left
of the page is the list of conversations. With no conversation open the page is the lobby: a line
that reads `What are you working on?` over the question box. With a conversation open, to the
right of the list is the message column, which holds the questions of one conversation, each
question followed by its answer. Under the message column is the question box, with a row of chips
above it, and to the right of the question box is one button. That button reads `Ask`; while an
answer is being written, the same button reads `Stop`. A question is typed into the question box
and sent with that button. An answer carries a badge above its text, which names the model level
that wrote the answer; under a finished answer may stand a row that says how many sources the
answer used. In the list, each conversation's row has a button that reads `Archive`.

The Workspace service, the program that writes the answers, is running. This stage asks the live
assistant eight questions. Run each title one time, in the order of your list of titles. A title
is run a second time only where the operator's rules on a second run allow it, or where its step
below allows it.

Step 3 starts one conversation, and step 7 asks its question into that conversation. If `3.json`
holds no `conversation_id`, do not run `7 follow-up`: give step 7 the verdict `blocked`, and say in
its `saw` that it waited on step 3.

Each of steps 4 to 9 starts a conversation of its own and, at its end, archives it through the
list. Step 3 does not archive its conversation; step 7 does. Archiving deletes nothing. You see
no picture of it; it is in the facts.

### Step 2: `2 open workspace`

The test opens the app's home page and follows the link in the top bar that reads `Workspace`. It
asks no question.

Pass when all of this is true:

- `2-open.png` shows the Workspace page with no conversation open, which is the lobby:
  - in the top bar, the link that reads `Workspace` is drawn in a different colour from the other
    links of the top bar and has a line under it, and no other link of the top bar has a line
    under it;
  - on the left, a heading that reads `Conversations`, with the list of conversations under it;
  - a line that reads `What are you working on?`, and under it the question box, with the button
    that reads `Ask` to its right;
  - a heading that reads `Routines` with at least one routine under it;
  - no message column of a conversation, and no question or answer.
- Nowhere in `2-open.png` is there a line that reads `The Workspace service is offline.`
- In `2.json`: `path` is `/workspace`, `channel` is `joined`, `offline_line_shown` is false.

The list may hold any number of conversations, or none. That is not a fault.

### Steps 3 to 8: six questions

Each of these six tests asks one question, waits until the answer is finished and takes two
pictures. `<step>-end.png` is the window as it stood when the answer finished: the last lines of
the answer's text. `<step>-start.png` is the same window after the message column was scrolled up
to that question: the question and the badge.

For each of the six steps, pass when all of this is true:

- In `<step>.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` is
  what the list below gives for the step.
- `<step>-start.png` shows the step's question and, between that question and the answer's text,
  a badge with the same text as `badge` in `<step>.json`.
- `<step>-end.png` shows the last lines of the answer's text.
- `answer` in `<step>.json` is plain text that answers the question. It is not an error message, it
  is not empty, and its last word is whole.

What `badge` must be:

- step 3, `3 course question`: `badge` reads `Haiku · lookup`. The question asks what a course
  syllabus says about one topic.
- step 4, `4 lookup one turn`: `badge` reads `Haiku · lookup`. The question asks for a list of a
  syllabus's section headings.
- step 5, `5 standard plan`: `badge` reads `Sonnet · standard`. The question asks for an
  explanation that uses a course's slides.
- step 6, `6 planner feed`: `badge` reads `Haiku · lookup`. The question asks which assignments are
  due in the next two weeks.
- step 7, `7 follow-up`: `badge` reads `Haiku · lookup`. The question is short and asks about
  another topic of the same syllabus, in step 3's conversation.
- step 8, `8 nothing matches`: `badge` reads `Haiku · lookup`. The question is made of invented
  words.

If `badge` is not the text the list gives for the step, the step is a `fail`: which level answers
which kind of question is what these steps are for. A sources row under an answer may be there or
not; neither is a fault.

A picture in which the answer's text runs past the edge of the message column is only the scrolled
view. That is not a cut-off answer and not a fault: whether the answer is whole is judged from
`answer` in `<step>.json`.

Steps 4 to 8 also archive the conversation they started (step 7: the one step 3 started). For each
of those five steps, pass needs this too: in `<step>.json`, `archived_ids` holds the step's
conversation (`conversation_id` for steps 4, 5, 6 and 8; the `conversation_id` of step 3 for
step 7), and `archive_writes` equals the number of ids in `archived_ids`.

Step 7 has one more condition: `3.json` and `7.json` hold the same `conversation_id`.

Step 8 has one more condition: `first_line_is_the_fixed_sentence` in `8.json` is true, and the
first line of `answer` is one sentence that says no passage of the owner's course files or uploads
matched the question, so the answer comes from general knowledge. In `saw`, say that the first line
was that sentence; do not copy it. The test has already compared it, word for word, with the
sentence of the app: you judge that it stands as the first line of the answer.

### Step 9: `9 stop then answer`

The test asks a question that gets a long answer, presses the button while that button reads `Stop`
and the answer is being written, and then asks a second, short question in the same conversation.

Pass when all of this is true:

- In `9.json`, about the stopped answer: `state` is `stopped`, `line` reads `You stopped this
  answer.`, `answer_chars` is 1 or more (some of an answer was written before the stop), and
  `badge` reads `Sonnet · standard`.
- `9-stopped.png` shows answer text in the message column, and a line that reads
  `You stopped this answer.` stands under the last of that text. The button to the right of the
  question box reads `Ask`, and no button in the picture reads `Stop`.
- In `9.json`, about the second answer: `next_state` is `done`, `next_badge` reads
  `Haiku · lookup`, and `next_answer_chars` is 1 or more.
- `9-after.png` shows the second question and its answer's text, under the stopped answer, and the
  button reads `Ask`.
- In `9.json`: `request_id` and `next_request_id` are two different whole numbers, the second above
  the first; `archived_ids` holds `conversation_id`, and `archive_writes` equals the number of ids
  in `archived_ids`.

Two things about `9-stopped.png` are not faults. The button may look dimmed: the picture is taken
straight after the press, and the page dims the button while it waits for the stop to be
confirmed. A dimmed button that reads `Ask` meets the condition. And the facts in `9.json` about the
stopped answer are taken a moment before the picture, so a sources row may be in the facts and not
in the picture. In `9-after.png`, with both answers finished, the button that reads `Ask` is not
dimmed: `ask_enabled_after_stop` in `9.json` is true, which the test checked.

If the test failed and `test_error` in `9.json` begins `inconclusive:`, the answer was finished
before the button could be pressed. Run the title a second time and set `reruns` to 1. If
`test_error` of the second run also begins `inconclusive:`, the verdict is `unsure`.

## Stage: upload

The page under test is the Workspace, a chat page of the app. It has no control for putting a file
in: that control is a later phase's. So this step makes, with the page's own signed-in session, the
calls the control will make. It types nothing on the page and takes no picture.

### Step 11: `11 upload file`

The test draws a value that is new in this run, makes a small plain-text file from it, and then: it
checks that no upload row holds the file's hash, puts the file in the private bucket under a key
made from the hash, makes a signed link valid for seven days, and registers the file.

Pass when all of this is true in `11.json`:

- `nonce_id` is a uuid. `sha256` is 64 lower-case hex characters. `storage_key` is `u/` followed by
  `sha256`. `mime` is `text/plain`. `byte_size` is a whole number above 0.
- `uploaded` is true, `existing` is false, `document_state` is `stored`, and `document_id` is a
  whole number above 0.

If `test_error` begins `the page sent no signed-in read`, no session was taken from the page and
the step could not be judged: the verdict is `blocked`. Any other `test_error` that names an answer
of the database or the bucket (for example `the upload of the object answered 400`) is the
product's: the verdict is `fail`, and `saw` names the answer's number.

## Stage: find

The page under test is the Workspace, a chat page of the app. The file of step 11 has been read and
indexed by the host's ingest worker; the host waited for that before this stage began.
`carry.json` holds step 11's `nonce_id` and `document_id`.

### Step 13: `13 find upload`

The test asks one question that uses words of the file, and waits until the answer is finished. It
takes the two pictures of steps 3 to 8, and archives the conversation it started.

Pass when all of this is true:

- In `13.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` reads
  `Haiku · lookup`. `archived_ids` holds `conversation_id`, and `archive_writes` equals the number
  of ids in `archived_ids`.
- `13-start.png` shows the question and, between that question and the answer's text, the badge.
- `13-end.png` shows the last lines of the answer's text.
- `answer` in `13.json` is plain text that answers the question. It is not an error message.

Guidance, not a pass condition: the answer should speak of a lamp and its hinges or shade. The host
checks in the database that the answer drew on the file; you check that the answer is whole. Write
in `notes` whether the answer spoke of a lamp.

If `test_error` in `13.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.

### Step 14: `14 send twice`

The test sends the same file a second time, as the page will: it finds that a row already holds the
hash, uploads nothing, asks for a new signed link, and registers the file again. It takes no
picture.

Pass when all of this is true in `14.json`: `rows_before` is 1, `uploaded` is false, `existing` is
true, `rows_after` is 1, and `document_id` is a whole number above 0.

If `test_error` in `14.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.

## Stage: delete

The page under test is the Workspace, a chat page of the app. This stage deletes the file of
step 11 in the two steps the page will use. `carry.json` holds step 11's `nonce_id` and
`document_id`. The test takes no picture.

### Step 15: `15 delete upload`

The test calls the delete function with the second argument false, which cuts retrieval and leaves
the row in state `deleting`; removes the object from the bucket; and calls the delete function
again with the second argument true, which drops the row.

Pass when all of this is true in `15.json`:

- `first_call_state` is `deleting`, and `storage_key` is `u/` followed by `sha256`.
- `objects_removed` is 1.
- `second_call_state` is `deleted`, and `rows_after` is 0.

If `test_error` in `15.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.

## Stage: page

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. With no
conversation open the page is the lobby: a line that reads `What are you working on?`, under it
the question box with one button that reads `Ask`, a row of chips above the question box, a heading
that reads `Routines` with the routines under it, and, further down, recent conversations. Above
the lobby and above every conversation stands one line with today's date and its weekday. Beside
the question box is a chip for the course and a button that reads `Depth`. A question goes into the
question box and is sent with the button that reads `Ask`; while an answer is being written the
same button reads `Stop`. Under a finished answer stands a row that says how many sources the
answer used (`1 source`, `3 sources`); pressing that row opens a side panel on the right, on a tab
that reads `Sources`. The panel has three tabs, which read `Sources`, `Files` and `Memory`, and a
button that reads `Hide panel`; folded, the page shows a button that reads `Show panel`.

The Workspace service, the program that writes the answers, is running. This stage asks the live
assistant two questions. Run each title one time, in the order of your list of titles.

Step 17 leaves its conversation open on purpose: a later stage waits for the service to remember
it, and the last step of the run archives it. Do not archive it, and do not run a title a second
time unless the operator's rules on a second run allow it.

### Step 17: `17 lobby and options`

The test opens the Workspace with no conversation, picks the course `IST 323` on the course chip
and `Standard` on the depth menu, types a question and sends it with the button that reads `Ask`.
It waits until the answer is finished and takes three pictures: `17-lobby.png` before anything is
picked, then `17-end.png` and `17-start.png` as steps 3 to 8 of the walk take them.

Pass when all of this is true:

- `17-lobby.png` shows the lobby: a line that reads `What are you working on?`, the question box
  with the button that reads `Ask`, a heading that reads `Routines` with at least one routine under
  it, and one line with a date and its weekday. The message column of a conversation is not in the
  picture.
- In `17.json`: `lobby_shown` is true; `today` is a date of the form `YYYY-MM-DD`;
  `course_picked` is `IST 323`; `depth_picked` is `Standard`; `state` is `done`; `line` is null;
  `answer_chars` is 1 or more; `badge` reads `Sonnet · standard`; `depth_after_ask` is `standard`.
- `17-start.png` shows the question and, between the question and the answer's text, a badge with
  the same text as `badge` in `17.json`. Above the question box a chip names the course
  (`IST 323`).
- `17-end.png` shows the last lines of the answer's text, and under them a row that says how many
  sources the answer used.
- `answer` in `17.json` is text that answers the question. It is not an error message and it is
  not empty.

If `badge` is not `Sonnet · standard`, the step is a `fail`: the depth picked on the page decides
the level, and that is what this step is for. `17.json` holds no `archived_ids`: the conversation
stays open on purpose, and that is not a fault.

### Step 18: `18 sources and panel`

The test asks one question that a course syllabus answers, waits until the answer is finished,
notes the sources row under the answer, presses it, looks at the panel, folds the panel away with
the button that reads `Hide panel`, and archives the conversation it started. It takes three
pictures: `18-end.png` and `18-start.png` as the walk takes them, and `18-panel.png` with the panel
open.

Pass when all of this is true:

- In `18.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, `badge` reads
  `Haiku · lookup`; `sources_row` is a text of the form `N sources` or `1 source` with N above 0;
  `forbidden_elements_in_answer` is 0; `panel_open_controls` is 1 or more; `panel_folded` is true;
  `archived_ids` holds `conversation_id`, and `archive_writes` equals the number of ids in
  `archived_ids`.
- `18-end.png` shows the last lines of the answer's text and, under them, the sources row.
- `18-panel.png` shows, on the right of the page, a panel whose picked tab reads `Sources`, with at
  least one row in it, and each row has a button that reads `Open`. The answer's text is still on
  the page, to the left of the panel.
- The answer's text in `18-end.png` is laid out as text: headings, lists or paragraphs. It holds no
  picture and nothing drawn as a link.

`chips_in_answer` in `18.json` may be 0 or more: whether the answer cites a source by a numbered
chip is the model's choice, and neither count is a fault. Write the number in `notes`.

## Stage: page-upload

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. Above the
question box is a button that reads `Add`; it opens a menu, and one entry of that menu reads
`Upload from this device`. A file picked there becomes a chip above the question box, and the chip
shows the file's state in words: it reads `Waiting`, then `Reading`, then `Indexing`, then
`Indexed`. The side panel's tab that reads `Files` lists every upload with its state, a field at
the top of that tab reads `Filter by title`, and each row has a button that reads `Delete`, which
after one press reads `Press again to delete`.

The Workspace service and the ingest worker, the program that indexes uploads, are running. This
stage asks the live assistant one question (step 20). Run each title one time, in the order of
your list of titles. Step 20 works from the file step 19 made and takes its facts file; if `19.json`
holds no `nonce_id`, give step 20 the verdict `blocked` and say in `saw` that it waited on step 19.

### Step 19: `19 upload through the page`

The test draws a value that is new in this run, makes a small plain-text file from it, and hands
the file to the page through the menu entry that reads `Upload from this device`. It watches the
chip's state until the chip reads `Indexed`, then opens the panel's tab that reads `Files`, types
the file's name into the field that reads `Filter by title`, and takes two pictures: `19-chip.png`
with the chip, `19-files.png` with the Files tab.

Pass when all of this is true:

- In `19.json`: `nonce_id` is a uuid; `sha256` is 64 lower-case hex characters; `file_name` begins
  `acceptance-memo-`; `chip_last_state` is `indexed`; `chip_states` is a list whose last entry is
  `indexed`; `files_rows_matching` is 1; `files_row_state` is `indexed`.
- `19-chip.png` shows one chip above the question box with the file's name and the word
  `Indexed`.
- `19-files.png` shows the panel on the tab that reads `Files`, with one row that names the file
  and reads `Indexed`.

`chip_states` may hold fewer than four states: a small file is read in a few seconds and a state
the page did not catch is not a fault. `chip_waited_ms` is how long the chip took; write it in
`notes`.

### Step 20: `20 ask with the file attached`

The test hands the same file to the page a second time, through the same menu entry; the page
finds the row the file already has and shows the chip as `Indexed` at once. The test then types a
question about the file and sends it. It waits until the answer is finished, takes the two pictures
of the walk, and archives the conversation it started.

Pass when all of this is true:

- In `20.json`: `chip_last_state` is `indexed`; `state` is `done`; `line` is null; `answer_chars`
  is 1 or more; `badge` reads `Haiku · lookup`; `sources_row` is a text of the form `N sources` or
  `1 source` with N above 0; `archived_ids` holds `conversation_id`, and `archive_writes` equals
  the number of ids in `archived_ids`.
- `20-start.png` shows the question, the badge between the question and the answer's text, and
  above the question box a chip that names the file.
- `20-end.png` shows the last lines of the answer's text and, under them, the sources row.
- `answer` in `20.json` is text that answers the question. It is not an error message.

Guidance, not a pass condition: the answer should speak of a lamp and its hinges or shade. The
host checks in the database that the file was attached and read; you check that the answer is
whole. Write in `notes` whether the answer spoke of a lamp.

## Stage: page-delete

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. The side
panel's tab that reads `Files` lists every upload with its state, a field at the top of that tab reads
`Filter by title`, and each row has a button that reads `Delete`, which after one press reads
`Press again to delete`. The host has read in the database that the file step 19 made was attached
to step 20's question; `carry.json` holds step 19's `nonce_id`, from which the test rebuilds the
file's name.

This stage asks no question. Run the one title one time.

### Step 21: `21 delete through the files tab`

The test opens the panel's tab that reads `Files`, types the file's name into the field that reads
`Filter by title`, presses the row's button that reads `Delete` and then the same button, which
now reads `Press again to delete`, and waits until the row has left the list. It takes one
picture, `21-files.png`, after the delete.

Pass when all of this is true:

- In `21.json`: `files_rows_after` is 0, and `deleted_at` is a time.
- `21-files.png` shows the panel on the tab that reads `Files` with no row that names the file.
  The tab may read `No upload matches.` or `No uploads yet.`, or list other uploads; none of these
  is a fault.

## Stage: page-memory

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. The side
panel's tab that reads `Memory` lists what the assistant remembers of earlier conversations, one
row per remembered conversation, each with a button that reads `Delete`; a field at the top of that
tab reads `Filter by title`. The assistant remembers a conversation once it has been quiet for
fifteen minutes after its last answer. Step 17 of this run asked a question and left its
conversation open for that reason. `carry.json` holds step 17's `conversation_id`.

This stage asks no question. Run the one title one time.

### Step 22: `22 memory item shown`

The test opens step 17's conversation with the panel on the tab that reads `Memory`, types a word
of step 17's question into the field that reads `Filter by title`, and looks for a row. While no
row matches it waits half a minute and opens the page again, for up to eight and a half minutes.
It takes one picture, `22-memory.png`, when it stops.

Pass when all of this is true:

- In `22.json`: `memory_item_shown` is true; `memory_reloads` is 1 or more; `first_seen_at` is a
  time.
- `22-memory.png` shows the panel on the tab that reads `Memory` with one row, and that row has a
  button that reads `Delete`.

If `memory_item_shown` is false, the service did not remember the conversation within the wait:
the step is a `fail`. Write `memory_waited_ms` in `saw`. If `test_error` names `carry.json`, the
host handed over no conversation: the verdict is `blocked`.

## Stage: page-forget

The page under test is the Workspace, a chat page of the app, as Phase 24b built it. The side
panel's tab that reads `Memory` lists what the assistant remembers, one row per remembered
conversation, each with a button that reads `Delete`, which after one press reads
`Press again to delete`. `carry.json` holds step 17's `conversation_id`, and the host has read in
the database that the remembered item of that conversation exists.

This stage asks no question. Run the one title one time.

### Step 24: `24 memory item deleted`

The test opens step 17's conversation with the panel on the tab that reads `Memory`, types the
same word into the field that reads `Filter by title`, presses the row's button that reads
`Delete` and then the same button, which now reads `Press again to delete`, and waits until the
row has left the list. It takes one picture, `24-memory.png`, after the delete, and then archives
step 17's conversation through the list's own button that reads `Archive`.

Pass when all of this is true:

- In `24.json`: `items_before` is 1; `items_after` is 0; `deleted_at` is a time; `archived_ids`
  holds `conversation_id`, and `archive_writes` equals the number of ids in `archived_ids`.
- `24-memory.png` shows the panel on the tab that reads `Memory` with no row that matches the
  filter. The tab may read `No remembered item matches.` or `Nothing is remembered yet.`; neither
  is a fault.

If `test_error` names `carry.json`, the host handed over no conversation: the verdict is
`blocked`. If the item was not listed when the step began (`test_error` says the item step 22 saw
is no longer listed), the step is a `fail`.
