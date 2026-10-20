# Phase 25b (two runners; the planner changes the assistant proposes): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below that section. So each section stands by itself, and these opening paragraphs never reach
the operator. This file holds no course text, no answer and no note of the owner's: this repository
is public.

How a section writes a text of the page is a rule of `acceptance/README.md`: in code marks,
exactly as the page has it. `node --test acceptance/acceptance.test.mjs` holds each such text
against the app's own strings and against `web/e2e/accept25.spec.ts`.

**What the run proves** (brief 119, "Definition of done", items D and E; the names are the frozen
contract `docs/planning/sprint-2/briefs/119b_PHASE25B_contract.md`). D: both runners beat (step 0),
and two questions sent at the same moment are taken by the two runners with overlapping claims
(step 2). E: a proposal draws its card (3); approved on the card it writes the row once and the
Inbox shows the same outcome (4); one rejected in the Inbox shows rejected on its card (5); a second
decision on either is refused (6); a decided card draws no value, an open one both (7, with 3, 5
and 8); a proposal made stale by a planner edit writes nothing (8); no proposal reaches the apply's
queue (10); the runner still holds no table grant and executes fourteen functions (11).

**The planner is left as the run found it.** The run proposes on one field of one row: the note of
the first assignment, by id, whose progress row is graded and holds no note. The host picks it at
go-live (`target-before`, saved as `target_before`: an md5 of the id, an md5 of the row without
`updated_at`, and the planner's fingerprint with that row left out); the browser test of step 3
picks it by the same rule and the proofs check it is the same row. Step 4's approval writes the
proposed note, step 8 writes another through the planner's own Notes field, and step 9 clears the
field, which stores no note: the row is as before in every column but `updated_at`, and
`planner-restored` proves it and that nothing else of the planner moved. A graded item's note is
the least visible field the assistant may propose on: the sync never writes a note, and a graded
item is past.

**Why the questions are worded as they are.** The page sends Auto, so the router
(`workspace/src/router.ts`) picks the tier from the words, and a test of the pack runs it over every
question. Each opens with a word that is neither a lookup cue nor an execution verb (`Explain`,
`Propose`): the middle tier, with a planning turn, long enough for step 2's two answers to overlap.
The three proposal questions name the run's assignment by its id, so they differ from run to run;
the proofs rebuild each from the proposal's own row id and the step's word (`one`, `two`,
`three`), and a test of the pack holds the proofs' text to the spec's.

**What the pack needs that 119b does not name.** `runner-grants` takes its facts from one view,
`v_workspace_runner_proof` (security invoker, select for `service_role` and, by 100's default
privilege, `db_test_runner`), which hands the catalog's answers out as four columns, as
`v_workspace_store_proof` does for pack 24: `definer_functions` (the SECURITY DEFINER functions of
`public` that `workspace_runner` can execute), `executes_propose`, `relations_granted` (public
tables, views, materialized views, foreign tables and sequences on which it holds any privilege, on
the relation or a column) and `relations_checked`. The PM adds it to E's migrations.

**When a run stops part way.** A run stopped after step 4 and before step 9 leaves the run's note on
the row, and one stopped before step 8 leaves the proposals' conversation in his list. The PM
clears the note through the assignment's page (its Notes field, as step 9 does; the row is named by
`target_assignment` in that run's `3.json`), rejects any of the run's proposals still open on its
card, and archives the conversation (`3.json`, `conversation_id`). Step 9 rejects any proposal of
the run still open by itself, so a later run does not find one waiting in the Inbox.

## Stage: two

The page under test is the Workspace, a chat page of the app. On the left of the page is the list
of conversations. With a conversation open, to the right of the list is the message column, which
holds the questions of one conversation, each question followed by its answer. Under the message
column is the question box, and to the right of the question box is one button, which reads `Ask`.
An answer carries a badge above its text, which names the model level that wrote the answer.

The Workspace has two services that write answers, and each takes one question at a time. This
stage has one step. Its test opens the Workspace in two browser tabs, types one question into each
tab's question box, and presses the `Ask` button of both tabs at the same moment, so each question
starts a conversation of its own. It waits until both answers are finished, takes one picture of
each tab, and then archives both conversations through the list. Archiving deletes nothing. You see
no picture of it; it is in the facts.

### Step 2: `2 two at once`

Run the title one time. The test asks two questions of the live assistant.

Pass when all of this is true:

- In `2.json`: `state` is `done`, `second_state` is `done`, `line` is null, `second_line` is null,
  `answer_chars` is 1 or more and `second_answer_chars` is 1 or more.
- In `2.json`: `badge` reads `Sonnet · standard`, and `second_badge` reads `Sonnet · standard`.
- In `2.json`: `first_request_id` and `second_request_id` are two different numbers, and
  `first_conversation_id` and `second_conversation_id` are two different ids.
- In `2.json`: `archived_ids` holds both conversation ids, and `archive_writes` is 2.
- `2-first.png` and `2-second.png` each show the Workspace with an answer in the message column:
  answer text under a badge, not an error line.
- `answer` and `second_answer` in `2.json` are each plain text that answers its question. Neither
  is an error message, neither is empty, and the last word of each is whole.

Whether the two questions were answered at the same time is not yours to judge: the host looks it up,
from the database, which service took each question and when. Two answers that look alike in
length or in time are not a fault.

If `line` or `second_line` begins `Your Claude plan's limit is used up`, the step is `blocked`.

## Stage: decide

The page under test is the Workspace, a chat page of the app, and the Inbox, another page of the
app. On the left of the Workspace is the list of conversations. With a conversation open, to the
right of the list is the message column, which holds the questions of one conversation, each
question followed by its answer. Under the message column is the question box, and to the right of
the question box is one button, which reads `Ask`. An answer carries a badge above its text, which
names the model level that wrote the answer.

In this phase the assistant may propose a change to the owner's planner; it never makes one. Each
proposal is drawn as a card under the answer that made it. The card's first line reads
`Proposed planner change`; under it is a line that names the change and the planner item. While the
proposal waits for a decision, the card is open: it shows two boxes side by side, one headed
`Planner has` with the value the planner holds now, one headed `Proposed` with the value proposed;
under them the reason; and two buttons, `Approve` and `Reject`. Once decided, the card shows the
planner item's name and one line with the outcome, and nothing else: no boxes and no button. The
same card stands in the Inbox, under the tab `Needs you` while it waits and under the tab
`Archived` once decided; there a decided card also has a link that reads `Open the answer →`.

In this stage every proposal is about one field of one planner item: the note of one past, graded
assignment, which the test picks itself. The proposed notes are made-up text that begins
`Acceptance run 25`. Changing that note is what the run is for: step 9, in a later stage, clears it.

This stage has five steps, and they continue each other. Step 3 starts one conversation; steps 4 to
7 work in it and leave it open, because a later stage asks into it. Run each title one time, in the
order of your list of titles. A title is run a second time only where the operator's rules on a
second run allow it.

If `3.json` holds no `proposal_id`, do not run `4 approve on the card`, `5 reject in the inbox`,
`6 second decision refused` or `7 decided cards draw no value`: give each the verdict `blocked`,
and say in its `saw` that it waited on step 3. If `5.json` holds no `proposal_id`, do not run
`6 second decision refused` or `7 decided cards draw no value`: give each the verdict `blocked`,
and say in its `saw` that it waited on step 5.

### Step 3: `3 proposal card`

The test picks the planner item, asks one question that asks the assistant to propose one new note
for it, waits until the answer is finished, and takes three pictures: `3-end.png`, the window as it
stood when the answer finished; `3-start.png`, the message column scrolled up to the question and
the badge; `3-card.png`, the window scrolled to the card under the answer.

Pass when all of this is true:

- In `3.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` reads
  `Sonnet · standard`.
- In `3.json`: `cards_under_answer` is 1, and `proposal_id` is a number.
- In `3.json`, `open_card`: `state` is `proposed`, `values_drawn` is 2, `outcome` is null, and
  `buttons` is 2.
- `3-start.png` shows the question and, under it, the badge.
- `3-card.png` shows one card under the answer: its first line reads `Proposed planner change`;
  a line that begins with the words Replace the note on, then the item's name; the box headed
  `Planner has`, which shows `no entry yet`; the box headed `Proposed`, which shows a made-up note
  that begins `Acceptance run 25`; a reason; and the buttons `Approve` and `Reject`.
- `answer` in `3.json` is plain text. It is not an error message and it is not empty. It may say
  that a change was proposed and waits for the owner's decision; it must not say that the planner
  was changed.

If the test failed with a message that no assignment progress row is graded and holds no note, the
run has no planner item to propose on: the step is `blocked`, and it is not the product's fault.
If the answer is finished and no card stands under it, or more than one, the step is a `fail`.

### Step 4: `4 approve on the card`

The test opens step 3's conversation and presses `Approve` on step 3's card. It takes two
pictures: `4-card.png`, the card on the answer after the decision; `4-inbox.png`, the same
proposal in the Inbox, under the tab `Archived`.

Pass when all of this is true:

- In `4.json`: `decide_status` is 200.
- In `4.json`, `card`: `state` is `applied`, `values_drawn` is 0, `buttons` is 0, and `outcome` is
  `Approved: note replaced`.
- In `4.json`, `inbox_card`: `state` is `applied`, `values_drawn` is 0, `buttons` is 0, and
  `outcome` is `Approved: note replaced`.
- `4-card.png` shows the card under the answer with the line `Approved: note replaced`, and no
  boxes and no button.
- `4-inbox.png` shows the Inbox with the tab `Archived` picked, and the same card with the line
  `Approved: note replaced` and the link `Open the answer →`, and no boxes and no button.

That the note was written once, and to the proposed value, is read by the host from the database.

### Step 5: `5 reject in the inbox`

The test asks a second question into step 3's conversation, asking for another new note on the same
item. It takes a picture of the open card under the answer (`5-open.png`), goes to the Inbox, presses
`Reject` on that proposal's card under the tab `Needs you`, opens the tab `Archived` and takes a
picture (`5-inbox.png`), then opens the conversation again and takes a picture of the card on the
answer (`5-card.png`).

Pass when all of this is true:

- In `5.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, `badge` reads
  `Sonnet · standard`, `cards_under_answer` is 1, and `proposal_id` is a number that is not step
  3's `proposal_id`.
- In `5.json`, `open_card`: `state` is `proposed`, `values_drawn` is 2 and `buttons` is 2.
- In `5.json`: `decide_status` is 200.
- In `5.json`, `inbox_card` and `card`: each has `state` `rejected`, `values_drawn` 0, `buttons` 0
  and `outcome` `Rejected`.
- `5-open.png` shows the open card: the box headed `Planner has`, the box headed `Proposed`, and the
  buttons `Approve` and `Reject`. The box headed `Planner has` shows step 4's note, which begins
  `Acceptance run 25`.
- `5-inbox.png` shows the Inbox with the tab `Archived` picked and the card with the line
  `Rejected`, the link `Open the answer →`, and no boxes and no button.
- `5-card.png` shows the card under the second answer with the line `Rejected`, and no boxes and no
  button.

### Step 6: `6 second decision refused`

The test asks for a second decision on each decided proposal, the way the cards ask for one: a
reject of step 3's approved proposal and an approve of step 5's rejected one. It then opens the
conversation and takes one picture (`6-cards.png`).

Pass when all of this is true:

- In `6.json`, `first_refusal`: `status` is a number of 400 or more, `code` is `55000`, and
  `message` holds the words already applied.
- In `6.json`, `second_refusal`: `status` is a number of 400 or more, `code` is `55000`, and
  `message` holds the words already rejected.
- In `6.json`, `first_card`: `state` `applied`, `values_drawn` 0, `buttons` 0, `outcome`
  `Approved: note replaced`. `second_card`: `state` `rejected`, `values_drawn` 0, `buttons` 0,
  `outcome` `Rejected`.
- `6-cards.png` shows a card with the line `Rejected` and no button; the card with the line
  `Approved: note replaced` may be above it, out of the picture.

### Step 7: `7 decided cards draw no value`

The test opens step 3's conversation and then the Inbox's tab `Archived`, and takes one picture in
each place: `7-workspace.png` and `7-inbox.png`. It decides nothing.

Pass when all of this is true:

- In `7.json`, `workspace_cards` and `inbox_cards` each hold two entries. The first entry has
  `state` `applied` and `outcome` `Approved: note replaced`; the second has `state` `rejected` and
  `outcome` `Rejected`. Every entry has `values_drawn` 0 and `buttons` 0.
- `7-workspace.png` shows at least one of the two cards under its answer: its outcome line, no
  boxes headed `Planner has` or `Proposed`, and no button.
- `7-inbox.png` shows the Inbox with the tab `Archived` picked and at least one of the two cards:
  its outcome line and the link `Open the answer →`, no boxes and no button.

## Stage: stale

The page under test is the Workspace, a chat page of the app, and the page of one assignment under
its course. In the Workspace, an answer carries a badge above its text, which names the model level
that wrote the answer. In this phase the assistant may propose a change to the owner's planner; it
never makes one. Each proposal is drawn as a card under the answer that made it. The card's first
line reads `Proposed planner change`. While the proposal waits, the card shows two boxes side by
side, one headed `Planner has` and one headed `Proposed`, and two buttons, `Approve` and `Reject`.
Once decided, the card shows the planner item's name and one line with the outcome, and nothing
else. The assignment's page has a block with the owner's plan for it, and in that block a text
field labelled `Notes`; leaving the field saves what it holds.

An earlier stage started one conversation and made two proposals in it, both on the note of one
past, graded assignment, and decided both. This stage has one step. It asks a third proposal into
that conversation, then changes the same note in the assignment's `Notes` field, then presses
`Approve` on the third card. Because the note changed after the proposal was made, the approval
must find the row changed, write nothing, and show the outcome `Stale: the row changed`. The step
then archives the conversation through the list. Archiving deletes nothing. The notes it writes are
made-up text that begins `Acceptance run 25`; a later stage clears the note.

If the folder handed in holds no `3.proposal_id` (the test then fails at once with a message that
names it), the step is `blocked`: say in its `saw` that it waited on step 3.

### Step 8: `8 stale after a planner edit`

Run the title one time. The test asks one question of the live assistant and takes three pictures:
`8-open.png`, the open card under the answer; `8-planner.png`, the assignment's page after the edit
was saved; `8-stale.png`, the card after `Approve` was pressed.

Pass when all of this is true:

- In `8.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, `badge` reads
  `Sonnet · standard`, `cards_under_answer` is 1, and `proposal_id` is a number.
- In `8.json`, `open_card`: `state` is `proposed`, `values_drawn` is 2 and `buttons` is 2.
- In `8.json`: `planner_write_status` is 200 or 201, `planner_writes` is 1, and
  `notes_after_edit` has `empty` false.
- In `8.json`: `decide_status` is 200; in `card`, `state` is `stale`, `values_drawn` is 0,
  `buttons` is 0 and `outcome` is `Stale: the row changed`.
- In `8.json`: `archived_ids` holds the conversation's id, and `archive_writes` is 1.
- `8-open.png` shows the open card: the box headed `Planner has`, which shows a note that begins
  `Acceptance run 25`, the box headed `Proposed`, and the buttons `Approve` and `Reject`.
- `8-planner.png` shows the assignment's page with the `Notes` field holding a note that begins
  `Acceptance run 25`, and no error line about saving.
- `8-stale.png` shows the card with the line `Stale: the row changed`, and no boxes and no button.

## Stage: restore

The page under test is the page of one assignment under its course. It has a block with the
owner's plan for the assignment, and in that block a text field labelled `Notes`; leaving the field
saves what it holds, and a field left empty stores no note.

An earlier stage wrote a made-up note, which begins `Acceptance run 25`, into that field of one
past, graded assignment, whose note was empty before the run. This stage has one step. It clears
the field, which leaves the note as the run found it. It decides nothing in the Workspace unless a
proposal of the run is still open, which happens only when an earlier step failed; then it rejects
that proposal first, so that nothing of the run waits in the Inbox.

If the folder handed in holds no `3.proposal_id` (the test then fails at once with a message that
names it), the step is `blocked`: say in its `saw` that it waited on step 3.

### Step 9: `9 planner restored`

Run the title one time. The test asks no question. It takes one picture, `9-planner.png`: the
assignment's page loaded again after the save.

Pass when all of this is true:

- In `9.json`: `planner_write_status` is 200 or 201, or it is null and `planner_writes` is 0 (the
  field was empty already, and nothing was sent). Otherwise `planner_writes` is 1.
- In `9.json`: `notes_after_reload` has `empty` true and `chars` 0.
- In `9.json`: every number in `left_open_reject_statuses` is 200 (the list is empty when no
  proposal of the run was left open, which is the usual case).
- `9-planner.png` shows the assignment's page with the `Notes` field empty, and no error line about
  saving.

That the row is now as before the run, and that nothing else of the planner moved, is read by
the host from the database.
