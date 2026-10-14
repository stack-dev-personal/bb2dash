# Phase 24b: Workspace assistant, the page. A lobby, a composer with attachments, routines, scope and depth, formatted answers with sources, a side panel for sources, files and memory

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (the tag the PM assigns to brief 109) · Answers on record:
`109a_PHASE24_open_questions.md` · **Gate, since Stack's answers of 2026-10-14: the data layer (W-86) starts now, beside Phase 24ab; the page (W-87, W-88) starts when Phase 22 and 24a/24ab are on `main`; the PR merges after 24a is accepted (`just accept 24` green)** · Branch
`feat/workspace-page-24b` · Worktree `bb2dash-wt-24b` · Neither is cut yet · Workers W-86 to W-88
(24a uses W-76 to W-79 and W-85; W-80 to W-84 are the Phase 23 follow-ups', brief 110 at d558994,
line 13; the PM confirms the one numbering at the freeze) · No migration: the page uses 24a's
objects; 24a used the whole block 190–199, so a database change here needs a ruling and a new block · One PR in
bb2dash · Verification file
`docs/planning/sprint-2/verification/111a_PHASE24B_VERIFICATION.md`, called 111a below · Status:
**drafted with brief 109 on Stack's answers of 2026-10-08, and through the challenge round of the
same day** (brief 109, Appendix 2). It is frozen at its gate, after a re-read against Phase 22 as
merged: every token name, class name and line number of Phase 22 below is read again then.

**The design is carried out with the `ui-ux-pro-max` skill, in Phase 22's design language.** Dark by
default with a light version; black, grey and white with `#ff0000` as the one accent; pill buttons;
square bordered cards (brief 103 on `feat/styling-22` at 3d02033, lines 57-58 and 386-389). The
project's rules hold: CSS Modules and custom properties, no Tailwind, no new UI framework, no literal
where a token exists.

**Facts re-read for this brief, 2026-10-08, read-only.**

* Today's page is one text box and one button, plain-text answers, a conversation list and a thread
  (`web/src/components/workspace/Composer.tsx:85-93`, `MessageList.tsx:10-16`,
  `web/src/app/(app)/workspace/Workspace.tsx:334`). It becomes one column under 720 px
  (`Workspace.module.css:33`).
* `web/package.json:17-26` holds eight runtime packages. None renders Markdown or cleans HTML.
* The web app sends no Content-Security-Policy (a grep of `web/src` and `web/next.config.*` for the
  header name and `img-src` gives 0 hits).
* `web/e2e/accept21.spec.ts` and `accept.lib.ts` read ten data attributes: `data-turn`, `data-tier`,
  `data-answer-text`, `data-used`, `data-turn-line`, `data-column-empty`, `data-workspace-offline`,
  `data-request-id`, `data-channel`, `data-workspace-stream`.
* `web/test/Workspace.layout.test.tsx:61-68` lists six stylesheets by hand.
  `web/e2e/workspace-layout.spec.ts` loads `MessageList.module.css` by its class names (map R1).
* Phase 22's walk guard aborts the write RPCs `workspace_ask` and `workspace_cancel` and any RPC that
  is not on its read list (brief 103 at 3d02033, lines 674-675; `web/e2e/walk22.lib.ts:164` on
  `feat/styling-22-walkbox`). Its row 12 fixture answers reads of four Workspace objects (line 182).
* The reference screenshots were opened for this brief: `Replit Web 24.png`, `Replit Web 26.png` and
  the three in `Replit Web Adding a skill/`, all in his Downloads folder. They are pictures of another
  product. Their layout and features are the model. No name and no wording is copied from them.
* The two numbered pictures were opened again in the challenge round. The second shows a side panel
  with three tabs, a search field, a row of filter pills and a toggle at the top right that folds
  the panel away. The first shows a greeting that holds a person's name.
* The acceptance suite uses pack 21 as its fixture (`acceptance/acceptance.test.mjs:38, 222,
  364-667`). `acceptance/pack-check.mjs:96-99` reads the five questions from
  `web/e2e/walk21.lib.ts`. `web/e2e/accept.lib.ts:73-74`, which every pack's browser tests use,
  imports `walk21.lib` and `walk21.window`. `scripts/accept-proofs.test.mjs:631` reads
  `acceptance/21/proofs.json`. `accept.lib.ts:325, 426, 477, 514-515` read `data-used` and
  `data-column-empty`.
* The web app holds no name of his: a grep of `web/src` for `user_metadata`, `display_name`,
  `full_name`, `first_name` and `given_name` gives 0 hits outside the generated types file.

## Amendments after 24a, as built (2026-10-14)

Brief 109's 24a was built, reviewed and its database and edge functions put live on 2026-10-08 and
10-09; its walk, merge and cut-over are Phase 24ab's (brief `118_PHASE24AB_walk_and_handover.md`, which
also holds the whole road from 24a to 24b and beyond). **Where this section and a clause below differ,
this section is current.** The reference for every shape is
`workspace/test/fixtures/contract24/README.md` on `main` once 24a merges.

* **No migration number is left.** 24a used 190–199 (199 was its review round). If 24b needs a
  database change, the PM rules first and takes the next free block of ten (200–209 at the time of
  writing; check before taking it). The Seams row on 24a below is read with this.
* **Labels and source rows.** `[M<n>]` resolves by `workspace_sources.text_id`; `[U<n>]` by
  `doc_text_id` of kind `upload`; `[R<n>]` by a memory row's `document_id`; `[P]` by the row of kind
  `feed`. **An attached file is one block with no label and one source row of origin `attached` with
  no unit id**, so the Sources tab lists an attached file as one row and no chip in the answer points
  at it; the model names its page in words.
* **The calls the page makes.** `workspace_upload_register(p_sha256, p_title, p_mime, p_byte_size,
  p_signed_url, p_signed_url_expires_at, p_course_id)` with a title of 1 to 200 characters, returning
  `{id, state, existing}`; `workspace_upload_retry(p_document_id, p_signed_url, p_signed_url_expires_at)`;
  `workspace_document_delete(p_document_id, p_object_removed)` returning `{id, kind, state,
  storage_key}` (`state` is `deleting` or `deleted`); `workspace_ask_with(p_conversation_id, p_text,
  p_options)` with the six keys of `ask-options.json`, attachments numbered files first, then uploads.
  The refusals are the fixture README's.
* **What the page reads.** The ten error codes of a failed upload (`too_large`, `bad_type`,
  `bad_bytes`, `no_text`, `extract_timeout`, `extract_failed`, `too_many_units`, `link_expired`,
  `download_failed`, `embed_failed`); an upload's states (`stored`, `reading`, `text_ready`,
  `indexed`, `failed`, `deleting`); the attachment states a turn records (`read`, `cut`, `not_ready`,
  `failed`, `missing`, `no_text`); `workspace_turns.retrieval_state` (`found`, `attached_only`,
  `empty`, `failed`) and `plan_state` (`skipped`, `planned`, `fallback`); the `sources` event
  `{request_id, state, found_n}`; `v_workspace_memory` (its id column is `document_id`) and
  `v_workspace_index_status` as migrations 197 and 199 define them. The fixed sentences are
  `workspace/src/lines.ts` (`lines.txt` in the fixtures); task 3's test compares with it.
* **Memory.** The runner asks for memory jobs only when `WORKSPACE_MEMORY_JOBS` is `on`; 24a's compose
  says `off` (the rolling summary of a long conversation is on regardless). Since 199 a job's finish
  is checked against its holder and its lease. Task 13 flips the one value; task 16's check stands.
* **The acceptance pack exists.** `acceptance/24/` (sixteen steps on today's page and the host's go-live
  step), `web/e2e/accept24.spec.ts` and `accept24.lib.ts`. The upload step carries a uuid and the
  proofs derive the file's hash from it in SQL; the four store proofs read `v_workspace_store_proof`;
  the host actions `ingest.start`, `ingest.startNoBuild` and `db.proofUntil` exist in bb2dash-stack.
  Task 14 extends this pack. A browser test's title must not repeat another pack's (a suite case
  forbids it: pack 24's first test is `2 open workspace` for that reason). The pack's steps 3 to 9 use
  today's page; where 24b changes what they read (the attributes `data-used` and
  `data-column-empty="start"`), task 14 moves them to the new page with the rest.
* **Workers.** Opus, as the Workers section says (his answer 1 below). 24a's ran on Sonnet by his
  word of 2026-10-08; from 2026-10-14 Phase 24 uses Opus and every other phase keeps Sonnet.
* **What the walk of 24a showed** (2026-10-14; 109c, "Phase 24ab, the walk"). Fifteen of the sixteen
  steps and every host proof passed on the restyled page, and P-7 passed (an upload indexed in 2.4 s
  through the worker's firewall). One defect, D-1: a question of invented words scored 0.781 to 0.789
  against seven course units, above the runner's floor of 0.78, so the turn stored `found` and the fixed
  "no passage matched" line was not written. The runner's floor is now 0.81 (W-96, test first, with a
  measurement kept as `workspace/scripts/eval-floor.mjs`: the golden set reads 9 of 9 at every floor from
  0.78 to 0.82, its weakest best hit 0.837; four invented-word strings and three unrelated English
  questions all return nothing at 0.81 and one invented string still returned a hit at 0.80); the
  materials server's own default stays 0.78, and the contract fixtures keep 0.78 as the example value of
  the request's `min_similarity`. For the page: (a) a lookup's answer may open with a narration line ("I'll search for …") before
  the answer; the renderer shows the answer as written, and a prompt line against narration is 24b's to
  add only if Stack asks for it; (b) the `Used:` line names the model's own tool calls
  (`search_materials · IST.323`, `get_material_text · 733`) beside the runner's `search` and
  `planner_feed`; on the new page the Sources panel holds them and nothing is printed under the answer;
  (c) the feed is 98 rows on every turn and the prompt 13 to 15 KB; a lookup is answered in 7 to 20 s,
  the Standard question in 15 s after a 1.8 s planning turn, so the page's waiting state must read well
  at those lengths; (d) Phase 22's page needed no change to pack 24's spec, and task 14 moves the steps
  to the new page as written; (e) a hand walk of the pack reads the go-live stage's `planner-fingerprint`
  before the first question.
* **Stack's answers of 2026-10-14** to the four questions Phase 24ab put to him (his words in quotes):
  1. **Workers: Opus.** "Workers on opus for phase 24 only (keep sonnet on for the default workflow)."
     So W-86 to W-88, and any extra worker of 24b, are Opus; other phases keep Sonnet.
  2. **Memory on at 24b's cut-over: "Yes."** Tasks 13 and 16 stand as written.
  3. **The data layer starts now, beside Phase 24ab.** "I can start the data layer in parallel while
     waiting on ab to finish. ab's completion should essentially be a and ab getting merged to main."
     The section "The data layer, started early" below is how. The page's two streams (W-87, W-88)
     keep the gate: Phase 22 and 24a/24ab on `main`.
  4. **The old transcript volume** (`workspace-claude-home`): "wait until its accepted to delete old
     transcripts." It is removed after `just accept 24` is green, which is Phase 24ab's task 11.

## Why

Stack, 2026-10-08: "the Replit Web keyword png's in my downloads should serve as both ui and feature
inspiration." Phase 24a makes the assistant work behind today's page. It cannot add one control,
because Phase 22 is sweeping the page's files (ruling W-1). So after 24a he still cannot attach a
file, choose a course, a routine or a depth, read a formatted answer, open a source, or see and
delete what is remembered. This phase is those controls, on the screens his pictures show:

* a greeting over one large composer, with a plus menu, a dashed scope chip, an effort menu and a send
  button (the first numbered picture);
* a plus menu with an attachments group and a starting-points group, the second opening a searchable
  list with group headings and one-line descriptions, and the picked entry shown as a removable chip
  (the three menu pictures);
* a row of shortcuts, example prompts with a refresh, and recent work with a "view all" link (the
  first numbered picture);
* a right panel with three tabs, a search field and a collapse button (the second numbered picture).

A plan-first toggle and voice input are in the pictures and are **out of scope**, by ruling W-9.

## What 24b delivers

Each line is a check that fails on `main` after 24a.

1. `/workspace` with no conversation shows the lobby. Today it shows an empty thread
   (`thread.ts:304-309`).
2. Ask sends the chosen course, depth, routine, format and attachments through `workspace_ask_with`.
   Today's page calls `workspace_ask` (`queries.workspace.ts:684-687`).
3. Deep applies to one question, then the menu reads Auto again.
4. A routine that needs a file keeps Ask off until a file is attached, and says why in one line.
5. A formatted answer shows headings, lists and tables. For any input the rendered tree holds no
   `img`, `a`, `iframe`, `script` or `style` element and no `href` or `src`.
6. A label in an answer is a numbered chip only when that request has the source row. Otherwise it is
   plain text.
7. The Sources tab lists an answer's sources; the Files tab lists his uploads with their state; the
   Memory tab lists what is remembered, deletes any item on a second press, and edits the About me
   note.
8. A file from his device is picked or dropped, checked, stored, registered and shown with its state
   until it reads "indexed". The same file sent again uploads nothing and shows the row it already
   has. Deleting one cuts it from search at once, and a delete that did not finish stays listed with
   Try again until the file is gone from the bucket.
9. Up to three example prompts are built from his real upcoming work, by title and date. With no such
   row, the example row is absent.
10. After the page marks a turn stopped, a later piece of text for that request changes nothing.
11. At 390 px: one column, no sideways page scroll, the composer docked, and a wide table scrolls
    inside its own box.
12. With memory jobs on, a conversation that was answered after the switch and has been quiet for 15
    minutes shows one item in the Memory tab, and deleting it leaves nothing for search. A
    conversation from before the switch, or an archived one, shows none.
13. The side panel folds away and comes back by one button, and a filter field on the Files tab and
    on the Memory tab narrows the rows by title as he types, with no request sent.

## Contract

### Routes and screens

`/workspace` is the lobby. `/workspace?c=<uuid>` is the thread. NEW `?panel=sources|files|memory`
opens the side panel on a tab (`web/src/components/workspace/route.ts`).

| screen | states |
|---|---|
| Lobby | each block loading; ready; no upcoming work (the example row is absent); no conversations (one line); service offline (the line shows, Ask still queues) |
| Composer | empty; chips set; a routine needs a file (Ask off, one line); an upload is not read yet (Ask off); refused (the two frozen sentences); a request is open (the button reads Stop and Enter sends nothing, as `Composer.tsx:85-93`) |
| Turn | queued; searching (new line, from claimed until the `sources` event or the first text); streaming; done; done with nothing matched (fixed line, only for `empty`); done from an attached file alone (`attached_only`, no fixed line); done with a failed search (fixed line); failed; stopped; joined late |
| Side panel | open on a tab; folded away (the conversation takes its width); under 1024 px a sheet |
| Sources tab | no answer picked; loading; rows, cited first; nothing matched; the read failed |
| Files tab | no uploads; uploading; waiting; reading; ready; failed with its reason and Try again; removing (a delete that did not finish, with Try again); filtered; none match the filter; one index status line |
| Memory tab | About me: empty, editing, saved, failed. The list: empty, rows, filtered, none match the filter, Delete and its second press, failed |
| Material picker | loading; by course; filtered; none found; the limit of five reached |

**The shell.** `Workspace.tsx` keeps reading the rows and holding the one channel
(`Workspace.tsx:334`) and renders NEW `Lobby.tsx` or NEW `Thread.tsx`. The grid is a rail of
conversations, a column capped at 80ch, and the panel. Under 1024 px the panel is a sheet. Under
720 px, today's step, the rail is one too. Sheets and the picker reuse `PopoutShell` (focus moved in,
Esc, focus handed back: `web/src/components/popout/PopoutShell.tsx:31-37`).

**The side panel** (NEW `SidePanel.tsx`). Three tabs. One button at its top right folds it away and
brings it back, as the second picture's toggle does; folded is the route with no `panel` parameter,
so it survives a reload. The Files tab and the Memory tab each have a filter field at the top: it
narrows the rows already on the page by title, as he types, and sends nothing. The Sources tab has
none: it lists one answer's rows, 40 at most. The picture's row of filter pills is not built (Out of
scope).

**The lobby.** A greeting with no name in it, one large composer, the six routines as shortcuts, up to
three example prompts with a refresh, and recent conversations with a link to all of them. **Why no
name, though the picture has one and he asked for a personalised assistant:** the app holds no name
of his anywhere (Facts), a name typed into the code would be a literal about a person in a public
repository, and a place to keep one is a database column, which in this phase would be migration
199 and a ruling first. It is 109a's item 21, his to object to: the cheap moment for a
`display_name` on `workspace_profile` is before 24a's migration 195 is frozen.

**The composer** (`Composer.tsx`, rewritten). A text box; a row of chips; NEW `PlusMenu.tsx` with
three entries (attach from materials, upload from device, use a routine, the last opening a list with
a search field, group headings and one-line descriptions); a dashed course chip ("all courses" first,
then the classes of `v_course_display`); NEW `DepthMenu.tsx` (Auto, Quick, Standard, Deep, starting
on Auto); Ask or Stop. Menus use `usePopover` (`web/src/components/shell/usePopover.ts:29`).

* Deep applies to that question, then the menu returns to Auto (W-9). Quick and Standard stay until
  he changes them (default taken, listed in 109a).
* A routine chip and a course chip stay for the conversation. They are restored from the last
  request's row in `workspace_request_options`.
* At most five attachments a question, the limit `workspace_ask_with` enforces.

**Routines.** The page reads `workspace_routines` (id, grp, title, description, needs, sort, enabled)
and never its instructions. `needs` gates Ask on the page; the database refuses the same case (23514).

**Example prompts.** NEW pure `web/src/lib/workspace-examples.ts` over the page's own read of
`v_work_items` (the columns of `web/src/lib/queries.today.ts:123-127`): the next 14 days, up to nine
candidates, three shown, the refresh stepping through them. A prompt names a real item by title and
date. Pressing one fills the composer and sends nothing. No rows, no row: no invented example, ever.

**Attaching from materials.** NEW `MaterialPicker.tsx` over `v_bb_files_current`, grouped by course,
with a filter field. A pick becomes a chip.

**Uploading from his device.** A file input and a drop target. NEW
`web/src/lib/workspace-upload-rules.ts` checks the type and the size before anything is sent: six
types (pdf, docx, pptx, xlsx, plain text, Markdown) and 20,971,520 bytes, 24a's limits. The type is
decided from the file's extension, and the page sets the stored content type itself, because a
browser may report none for a Markdown file. The page then takes the file's SHA-256, because 24a
knows an upload by that hash (brief 109, The pgvector store, point 4; answer 17). When a row of
`workspace_documents` already holds the hash, the page uploads nothing and shows that row in the
state it is in, as it shows any upload: a chip, with Try again when the row is `failed` or
`deleting`. Otherwise the page makes the object's key from the hash, `u/` followed by it, never from
the file's own name: 24a's table refuses any other key, and the file's name is kept as the upload's
title. Then the order 24a fixes: the object into the bucket `workspace-uploads` (an object that is
already there under that key is the same bytes and is not an error), a signed URL of 7 days,
`workspace_upload_register` with the hash. The call returns the row that holds the content and says
whether it made it. The chip and the Files row read `workspace_documents` again every 5 s while a row is not `indexed` or
`failed` (the pattern of `web/src/lib/workspace-poll.ts`). A failed row keeps Remove and Try again;
Try again signs a new URL and calls `workspace_upload_retry`. He may tag an upload with a course (an
update of `course_id`).

**Deleting an upload, in 24a's two steps.** Delete calls `workspace_document_delete(id, false)`: the
file leaves search at once and its row reads "removing". The page then removes the object with the
key the call returned, and calls `workspace_document_delete(id, true)`, which drops the row. If the
tab closes or a call fails in between, the row stays in the Files tab as "removing" with Try again,
which runs the same two steps; the first is safe to repeat. The line under the Delete button says
two things in plain words: the file will no longer be searched or attached, and answers already
written keep what they quoted from it. 24a gives the browser no way to change a stored answer
(`140:196`), so the page must not promise more.

**Formatted answers, with no new dependency.**

* NEW pure `web/src/lib/answer-format.ts` turns text into blocks. NEW `AnswerBody.tsx` turns blocks
  into React elements: paragraphs, three heading levels, lists, pipe tables, code, bold, italic,
  quote.
* **No image is ever drawn and no link is fetched.** An image form or a link form renders as its
  text. There is no `img`, no `a` and no raw HTML sink. `web/test/raw-html.audit.test.ts` is not
  edited and stays green.
* The parser never throws. An unclosed form shows as text while the answer streams. Blocks are kept
  between flushes.
* `withoutBoldMarkers` goes (`thread.ts:150`) with its test (`web/test/Workspace.thread.test.ts:391`).
* The composer sends `format: "rich"`. A stored answer of a request with no options row, or with
  `plain`, is shown as plain text, as today.

**Sources.** 24a's labels carry ids: `[M<id>]`, `[U<id>]`, `[R<id>]` and `[P]`. NEW pure
`web/src/lib/workspace-citations.ts` turns a label into a numbered chip only when the request's
`workspace_sources` holds that row; the number is the row's `ord`. Anything else stays text. That
case is real and not only a guard: a passage the model found with its own search and did not open
has no source row (brief 109, step 12). 24a's format rule tells the model to name such a file in
words and not by label, so a bare bracket code should be rare; when one appears it is shown as the
text it is, never as a chip. A chip is a button, never a link: it opens the panel at its row. A row
shows its kind, its course, its title, its page, slide or sheet, and Open:

* a course file through `FileOpenAction` (`web/src/components/materials/FileOpenAction.tsx:70-76`):
  the file opens and the row names the page. It lands on the page itself only if probe Q-2 passes;
* an upload through a short-lived signed link (the call of `web/src/lib/queries.materials.ts:136`);
* a remembered item in the Memory tab;
* the planner feed as an app link to `/planner`.

The row shows no passage text: 24a stores none. The line of tool names under an answer goes.

**The fixed lines.** Nothing matched, and the search failed, are read from
`workspace_turns.retrieval_state` and worded in `web/src/lib/workspace-labels.ts`. A test holds each
equal to the runner's sentence in `workspace/src/lines.ts`, so the two cannot drift. The nothing
matched line shows for `empty` only. `attached_only` (an attached file was read and no passage
matched) shows no line. The sentence is 24a's: it speaks of his course files and uploads and never
says that nothing of his was used, so it is true under a planner answer too.

**The index status line** on the Files tab reads `v_workspace_index_status`: for course units, for
uploads and for remembered items, how many are indexed, how many wait and how many failed, and when
a course file was last indexed. The row holds the three `indexed` counts and `memory_failed` since
answer 17 (brief 109, Indexing and status). A course unit has no failed count: one that could not
be indexed still waits. No number is shown that the row does not hold.

**Stop.** After the page marks a turn stopped, a later `delta` for that request changes nothing
(`web/src/lib/use-workspace-stream.ts`, `thread.ts`).

**Memory, switched on.** This PR changes one line outside `web/`: the compose default of
`WORKSPACE_MEMORY_JOBS` becomes `on`, because the list and the delete control now exist (answer 1).

* **A restart does not bring the value.** `docker compose restart workspace` keeps the container and
  its old environment. The value arrives only when the container is made again: from bb2dash-stack,
  `docker compose up -d workspace`, alone, with no question open (the root guide names the two
  commands apart). The check reads the value inside the container, not in the file.
* **What the switch summarises.** Nothing from before it. 24a's `workspace_job_claim` stamps
  `workspace_profile.memory_since` the first time a runner asks for memory jobs and hands out only
  conversations answered after that, not archived and not opted out (brief 109, Memory). His
  existing conversations, most of them made by test scripts, are never summarised.
* **The acceptance run stays out of his memory.** Each step archives the conversation it opened in
  the last step that uses it. The one step that waits for a remembered item deletes the item and
  then archives its conversation.

**Wording.** Every string stays in `web/src/lib/workspace-labels.ts` and its test, because the pack
check reads the page's texts from that file (`acceptance/README.md:145-149`). It is PM wording, frozen
before worker branches are cut. The upload error codes it words are 24a's ten.

**Keyboard.** Enter asks and Shift+Enter breaks the line. Backspace in an empty box removes the last
chip. Arrows, Home, End and Esc work in menus and tabs, and focus returns to what opened them.

**Phone.** One column, no sideways page scroll, the composer docked, menus as sheets, tables and code
scrolling inside their own positioned box, targets of 44 px.

**Look.** Tokens only. Pill buttons, square bordered cards, the ink primary button. Red
(`--color-accent-500`) only marks where he is: the picked tab and the picked conversation (brief 103,
lines 386-389). A status is never told by red alone.

### The data it uses from 24a

The page writes through functions and reads through tables and views. **Every read is a select, never
an RPC**, so Phase 22's walk guard needs only new names on its read list.

**The page reads no unit and no vector by table.** Of the store's content tables it names
`workspace_documents` alone: the catalog rows, with an upload's title, course, state and hash. A
remembered summary comes through the view `v_workspace_memory`. No page code names
`workspace_document_text` or `workspace_text_embeddings`. The owner's session does hold select on
the first of those two, because that view is security invoker and needs it, and it holds nothing
on the second (brief 109, The pgvector store, direct touches 5 and 6). Task 5 holds the rule with
a grep.

* **Reads:** `workspace_conversations`, `workspace_messages`, `workspace_requests`,
  `v_workspace_status` (Phase 21); `v_work_items`, `v_course_display`, `v_bb_files_current`;
  and 24a's `workspace_routines`, `workspace_request_options`, `workspace_request_attachments`,
  `workspace_turns`, `workspace_sources`, `workspace_documents`, `v_workspace_memory`,
  `workspace_profile`, `v_workspace_index_status`.
* **Writes:** `workspace_ask_with`, `workspace_cancel`; the title and archived columns of a
  conversation (`140`, its column grants); `workspace_upload_register`, `workspace_upload_retry`,
  `workspace_document_delete` (called twice for an upload, once for a remembered item); the storage
  upload, signed URL and remove on `workspace-uploads`; an update of an upload's title and course;
  an update of `workspace_profile.about_me`. These three column updates are the only direct writes
  24a grants on its tables. Everything else goes through its four functions, which refuse anyone
  but the owner, and a direct insert, update or delete raises 42501.
* **Realtime:** `workspace:<conversation>` with `delta`, `done` and 24a's `sources`.
  `workspace:lobby` is held with no event, as today.
* **Refusals:** 22023 (the text's length) and 23505 (a second open request) keep today's two
  sentences. 23503 and 23514 from `workspace_ask_with` get one sentence each. 42501 from any of the
  four functions means the session is not the owner's; it gets one sentence too, and the page sends
  nothing again by itself.

### Files rewritten, kept and new

* **Rewritten:** `page.tsx` and the layout half of `Workspace.tsx`; `Composer.tsx`; `MessageList.tsx`
  (it keeps `useFollowTheEnd`); `ConversationList.tsx`; `TierBadge.tsx`; the markup of
  `ServiceStatus.tsx`; `thread.ts` where the tool-name line and the bold-marker strip go; the six CSS
  modules of the two folders.
* **Kept:** `route.ts` (one new parameter), `web/src/lib/queries.workspace.ts` (789 lines, at the cap,
  so it gains nothing), `workspace-poll.ts`, `workspace-clock.ts`, the logic of `ServiceStatus.tsx`.
* **New, `web/src/lib/`:** `queries.workspace-ask.ts`, `queries.workspace-sources.ts`,
  `queries.workspace-files.ts`, `queries.workspace-memory.ts`, `queries.workspace-routines.ts`,
  `answer-format.ts`, `workspace-citations.ts`, `workspace-examples.ts`,
  `workspace-upload-rules.ts`, each with its test.
* **New, `web/src/components/workspace/`:** `Lobby`, `ExamplePrompts`, `Thread`, `AnswerBody`,
  `PlusMenu`, `DepthMenu`, `MaterialPicker`, `SidePanel` and its three tabs, each with its module.
* **Changed elsewhere:** `web/src/lib/use-workspace-stream.ts` (the `sources` event, the stop guard);
  `web/src/lib/workspace-labels.ts` and its test; `compose.yaml` (one value); `web/e2e/accept.lib.ts`,
  `web/e2e/walk21.lib.ts` and `web/e2e/walk21.window.ts` (the lines that read `data-used` and
  `data-column-empty="start"`); `acceptance/README.md` (one line: pack 21 is the suite's fixture and
  is not run).

### Tests, and what replaces the two layout checks

Both layout checks are kept and rewritten in this PR. Each row says what it pinned and what pins it
after.

| check | pins today | after 24b |
|---|---|---|
| `web/test/Workspace.layout.test.tsx` | every box that scrolls is positioned; its hand-written list of six stylesheets equals the folder's (lines 61-68) | the same rule, with the list read from the folder, and the screen mounted twice: the lobby, and a thread with the panel open |
| `web/e2e/workspace-layout.spec.ts` | the document is as tall as the window; each label's offset parent is the column; class names `column`, `turns`, `turn`, `question`, `answer`, `text`, `used` | the same two facts. `MessageList.module.css` keeps `column`, `turns`, `turn`, `question`, `answer`, `text`. The `used` case becomes the sources row. New cases: the composer stays docked, and a wide table at 390 px scrolls inside its box |

* **Tests this phase replaces or edits**, each with an owner below: `Workspace.empty.test.tsx` (it
  pins the empty thread the lobby replaces), `Workspace.test.tsx`, `Workspace.thread.test.ts`,
  `Workspace.failures.test.tsx`, `Workspace.rereads.test.tsx`, `Workspace.service.test.tsx`, the three
  `use-workspace-stream` tests, `workspace-harness.tsx`, `workspace-labels.test.ts`.
* **Data attributes.** Eight of the ten stay. `data-used` becomes `data-sources`.
  `data-column-empty="start"` becomes `data-lobby`. New: `data-source-ref`, `data-chip`,
  `data-retrieval`, `data-upload-state`.
* **Phase 22's standing checks.** Its row 12 fixture and its phone-width cases cover `/workspace`.
  The PM extends the fixture with the new reads and keeps its counts green, or records the new count.
  The token audit stays at zero for the two Workspace folders.
* **The acceptance pack.** `acceptance/24/` and `web/e2e/accept24.spec.ts` are extended with the page's
  steps.
* **Pack 21 is no longer run, and it is not removed.** The first draft retired its files. That
  cannot pass: the acceptance suite uses pack 21 as its fixture and asserts that it is there, the
  pack check reads the five questions from `walk21.lib.ts`, the shared library `accept.lib.ts`
  imports `walk21.lib` and `walk21.window`, and the proofs test reads `acceptance/21/proofs.json`
  (Facts). So in this PR:
  * `acceptance/21/` (three files), `web/e2e/accept21.spec.ts`, `web/e2e/walk21.lib.ts` and
    `web/e2e/walk21.window.ts` stay in place. `just accept 21` is not run again, and
    `acceptance/README.md` says so in one line. Phase 21 stays accepted (DECISIONS 2026-10-08).
  * `accept.lib.ts`, `walk21.lib.ts` and `walk21.window.ts` are edited only where they read the two
    attributes that change (`data-used` at `accept.lib.ts:325, 477, 514-515`, `walk21.lib.ts:290`
    and `walk21.window.ts:206, 304`; `data-column-empty="start"`), so the helpers pack 24 shares read
    the new names.
  * The pack check holds a playbook to the page's own strings (`pack-check.mjs:461-472`), and it
    runs for every pack in the tree. If this phase's wording drops a string that pack 21's playbook
    gives after "reads", "says" or "shows", that sentence is taken out of pack 21's playbook, and
    each such edit is named in 111a. Nothing else in pack 21 changes.
  * The other `walk21*` files (`walk21.spec.ts`, `walk21.first.ts`, `walk21.desktop.ts`,
    `walk21.retake.spec.ts`) and `workspace-acceptance-helpers.spec.ts` are read at the cut. One
    that nothing imports and that cannot run against the new page may go; one that is imported
    stays.

## MVP (in plain words)

Stack opens Workspace and sees one box, his six routines and a few suggestions made from his real
upcoming work. He can pick a course, attach a file from his materials or from his laptop, pick a
routine and say how deep to think, or pick nothing. He asks. While it looks through his files the
page says so. The answer is formatted, and each numbered source opens the file it came from or shows
where it is. If nothing of his matched, one fixed line says so.

A panel at the side shows that answer's sources, the files he has uploaded and whether each has been
read yet, and what the assistant remembers. He can delete any remembered item, and he can write a
short note about himself that it reads every time.

It draws no image and follows no link. It works by keyboard and on a phone, dark or light.

## Definition of done

**SOP gates**

- [ ] `web/`: `npm run typecheck`, `npx eslint . --max-warnings 0`, `npm run build`, `npx vitest run`
      and `npm run test:coverage` all exit 0; the test count is not below `main`'s at the cut.
- [ ] `git diff --stat origin/main...HEAD -- web/package.json web/package-lock.json` prints nothing.
- [ ] The token audit and the raw-HTML audit pass with their files as Phase 22 and `main` left them.
- [ ] `/code-review main high` and `/security-review`: CRITICAL and HIGH addressed, recorded in 111a.
      The security review is required: user input, a file upload, and a renderer.
- [ ] `git diff --stat origin/main...HEAD -- db workspace mcp-server supabase sync apply desktop`
      prints nothing.

**Contract**

- [ ] Each of the 13 checks under "What 24b delivers" has a named test or proof, green.
- [ ] `node --test acceptance/acceptance.test.mjs scripts/accept-proofs.test.mjs` passes with pack 21
      still in the tree: `ls acceptance` shows `21` and `24`.
- [ ] Both layout checks pass as rewritten.

**Live**

- [ ] The PM's walk in a real browser, both themes, at 390 px and at desktop width, and in the desktop
      window, with one runner on the queue. No screenshot is committed.
- [ ] Stack has seen the preview and said OK. This phase is visual.
- [ ] After his merge word, with the Workspace container made again, alone, so memory jobs are on
      (from bb2dash-stack, `docker compose up -d workspace`, no question open; a plain restart keeps
      the old value): `docker compose exec workspace printenv WORKSPACE_MEMORY_JOBS` prints `on`.
      Then `just accept 24` is green.

**Docs, same PR**

- [ ] STATUS, DECISIONS, ORCHESTRATOR's phase table, root `CLAUDE.md`'s Workspace paragraph.

## Task list

Test file names are proposals. Order: 1, 2, 3, then (4 to 6 beside 7 and 8 beside 9 and 10), then 11
to 16.

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | Gate: Phase 22 and 24a are on `main` and 24a is accepted; this brief re-read against both and frozen; the branch cut | PM | `git merge-base --is-ancestor <Phase 22's merge commit> HEAD; echo $?` and the same for 24a's each print 0 |
| 2 | Probes Q-1 to Q-5 (below) | PM + W-86 | one pass or fail line each in 111a |
| 3 | Wording frozen in `workspace-labels.ts` and its test, before worker branches are cut | PM | `cd web && npx vitest run test/workspace-labels.test.ts` passes, and its case comparing the two fixed sentences with `workspace/src/lines.ts` passes; the line under Delete for an upload says that answers already written keep what they quoted |
| 4 | `answer-format.ts` and `AnswerBody.tsx` | W-86 | `npx vitest run test/answer-format.test.ts test/AnswerBody.test.tsx`: for generated strings the tree holds no `img`, `a`, `iframe`, `script` or `style` and no `href` or `src`; an unclosed form is text; the parser throws for no input |
| 5 | The query modules, citations, examples, upload rules | W-86 | `npx vitest run test/queries.workspace-ask.test.ts test/queries.workspace-files.test.ts test/workspace-citations.test.ts test/workspace-examples.test.ts test/workspace-upload-rules.test.ts`: a label with no row stays text; no rows give no example; a file of 20,971,521 bytes is refused before any request; a Markdown file with no reported type is taken by its extension and stored with the Markdown content type; the object's key is `u/` followed by the file's SHA-256 whatever the file's name; a file whose hash an upload row already holds is not uploaded and that row is used; the register call carries the hash; a delete makes the first call, then the storage remove, then the second call, and a failed remove makes no second call. And from the bb2dash root, `git grep -n -e "\.from(.workspace_document_text.)" -e "\.from(.workspace_text_embeddings.)" -- web/src` gives no line: the page names neither the unit table nor the vector table (brief 109, direct touches 5 and 6). On `main` today it gives no line, and the same form finds the tables the page does read |
| 6 | The stream: the `sources` event and the stop guard | W-86 | `npx vitest run test/use-workspace-stream.stop.test.tsx`: a delta after the stopped mark changes nothing; an unknown event changes nothing |
| 7 | Composer, plus menu, depth menu, material picker | W-87 | `npx vitest run test/Composer.chips.test.tsx`: Ask sends the options; Deep returns to Auto after one question; a file routine with no file keeps Ask off; Backspace in an empty box removes the last chip |
| 8 | The lobby and example prompts | W-87 | `npx vitest run test/Workspace.lobby.test.tsx`: no upcoming rows, no example row; a press fills the box and calls nothing; the greeting holds no name |
| 9 | The thread, the answer body in place, source chips, the searching line | W-88 | `npx vitest run test/Workspace.sources.test.tsx`: a chip is a button and never a link; a label with no source row is text; `empty` shows the fixed line and `attached_only` shows none; a `plain` answer renders as plain text |
| 10 | The panel: Sources, Files with upload states, Memory with delete and About me, the filter fields, the fold button | W-88 | `npx vitest run test/SidePanel.test.tsx`: each state of the table renders; Delete needs two presses; a failed upload shows its reason and Try again; a row in `deleting` reads "removing" and has Try again; typing in the filter field of Files, and of Memory, narrows the rows and makes no request; the fold button removes the `panel` parameter and the same button brings the tab back |
| 11 | Layout and phone: both checks rewritten | W-88 | `npx vitest run test/Workspace.layout.test.tsx`; `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts` exits 0 |
| 12 | Audits and Phase 22's fixture | PM | `npx vitest run test/raw-html.audit.test.ts test/audits.test.ts` and Phase 22's token audit pass; its walk's counts are green or the new count is in 111a |
| 13 | Memory on: the compose value and its test | PM | `grep -c "WORKSPACE_MEMORY_JOBS" compose.yaml` gives 1 and the line reads `on`; `node --test docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs` passes |
| 14 | The pack extended, each step archiving its conversation; pack 21 no longer run and kept in the tree; the three shared library files (`accept.lib.ts`, `walk21.lib.ts`, `walk21.window.ts`) edited where they read the two changed attributes | PM | `node --test acceptance/acceptance.test.mjs scripts/accept-proofs.test.mjs` passes; `ls acceptance` shows `21` and `24`; `cd web && npx playwright test -c e2e/accept.config.ts --list` lists pack 24's titles and exits 0, which shows `accept.lib.ts` still compiles; `git diff origin/main...HEAD -- acceptance/README.md \| grep -c "^+.*21"` gives at least 1 (the line that pack 21 is the suite's fixture and is not run) |
| 15 | Integrate, reviews, the preview for Stack, the PR. Stop at "ready when you say so" | PM | the SOP gates; `gh pr view --json state -q .state` prints `OPEN` |
| 16 | After his merge word: the Workspace container made again, alone, with no question open (from bb2dash-stack, `docker compose up -d workspace`; not `restart`), then `just accept 24` | PM | `docker compose exec workspace printenv WORKSPACE_MEMORY_JOBS` prints `on`; `select memory_since is not null from workspace_profile` gives true after the runner's first idle poll; the run's `REPORT.md` reads green |

**Probes, before anything is built on them.**

* **Q-1.** A browser upload to the private bucket under the owner's policy, at the size limit.
* **Q-2.** Whether a signed PDF link honours `#page=N` in Chromium and in the desktop window. If it
  does, Open lands on the page; if not, the row names the page.
* **Q-3.** The file dialog and a drop inside the desktop shell's window.
* **Q-4.** Parsing a 100,000-character answer again on each 250 ms flush stays under 16 ms with
  blocks kept. If not, only the stored row is formatted and streaming text stays plain.
* **Q-5.** At the cut: Phase 22's real token and class names; whether its count of files that name the
  red step is a standing test; whether a module map can be read from a folder under vitest.

## Workers

Workers are Opus (Stack, 2026-10-14: Phase 24 only), commit and push per task, never touch `project-state/`, and hand the PM a
verification section with each task's red run and green run (`111_W86_VERIFICATION.md` to
`111_W88_VERIFICATION.md`, beside 111a). A worker with an unclear point states its default and takes
it. Nobody answers a running worker by message (ruling W-S).

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-86 | data layer | `feat/workspace-page-24b-data` | `bb2dash-wt-24b-data` | the nine new files under `web/src/lib/` and their tests; `use-workspace-stream.ts` and its three tests; `AnswerBody.tsx`, its module and its test | 2, 4 to 6 |
| W-87 | composer and lobby | `feat/workspace-page-24b-composer` | `bb2dash-wt-24b-composer` | `Composer`, `PlusMenu`, `DepthMenu`, `MaterialPicker`, `Lobby`, `ExamplePrompts`, their modules and tests; `Workspace.empty.test.tsx` | 7, 8 |
| W-88 | thread and panel | `feat/workspace-page-24b-thread` | `bb2dash-wt-24b-thread` | `page.tsx`, `Workspace.tsx`, `Workspace.module.css`, `Thread`, `MessageList`, `ConversationList`, `TierBadge`, `ServiceStatus`, `SidePanel` and its tabs, `thread.ts`, `route.ts`, their modules; both layout checks; `Workspace.test.tsx`, `Workspace.thread.test.ts`, `Workspace.failures.test.tsx`, `Workspace.rereads.test.tsx`, `Workspace.service.test.tsx`, `workspace-harness.tsx` | 9 to 11 |
| PM | integration | `feat/workspace-page-24b` | `bb2dash-wt-24b` | `workspace-labels.ts` and its test; the pack and `accept24.spec.ts`; **the acceptance files pack 21 shares:** `web/e2e/accept.lib.ts`, `web/e2e/walk21.lib.ts` and `walk21.window.ts` (the lines that read the two changed attributes), `acceptance/21/playbook.md` (only a sentence the pack check would otherwise fail), `acceptance/README.md` (one line), and the other `walk21*` files with `accept21.spec.ts` and `workspace-acceptance-helpers.spec.ts` as read at the cut; Phase 22's fixture and phone cases; the token baseline if a count moves; `compose.yaml`'s one value; state docs; 111a | 1 to 3, 12 to 16 |

Not edited by anyone in this phase: `acceptance/acceptance.test.mjs`, `acceptance/pack-check.mjs`,
`acceptance/21/manifest.json`, `acceptance/21/proofs.json` and `scripts/accept-proofs.test.mjs`. They
hold pack 21 as their fixture, and that is why pack 21 stays.

W-87 and W-88 type against W-86's modules from this Contract until they are on the phase branch.

## Seams

| with | seam | rule here |
|---|---|---|
| Phase 22 | it sweeps the two Workspace folders and freezes the tokens | 24b is cut only after Phase 22 is on `main`. It is written on Phase 22's tokens alone and adds no literal. Its fixture, its phone cases and its token baseline are the PM's to extend |
| Phase 24a | the objects, the labels, the `format` option, the upload order, the error codes, `lines.ts` | none edited. If the page needs a database change, it is a ruling first and a new block of ten (24a used 190–199) |
| The live Workspace | one queue | one runner on the queue at a time during the walk, on Stack's word, as in 24a |
| The acceptance run | pack 24 grows; pack 21 is no longer run and stays in the tree as the acceptance suite's fixture | the host actions it needs are the ones 24a added to bb2dash-stack. A step that waits for a memory item uses the action that reads a proof again until it passes. Each step archives the conversation it opened, so a run leaves nothing in his memory or his list. The cut-over makes the Workspace container again; it does not restart it |
| The Phase 23 follow-ups (brief 110) | its pack 23 and its W-84 edit `acceptance/pack-check.mjs` and `OPERATOR.md` where they name the Workspace alone; its workers are W-80 to W-84 | this phase edits neither file. Its workers are W-86 to W-88. If the follow-ups' pack reads a Workspace string this phase removes, the pack check says so at integration and the PM keeps the string or edits that sentence, named in 111a |
| The desktop shell | the page runs in its window | the walk includes it: the file dialog, a drop, an opened source (Q-2, Q-3) |

## Out of scope

A plan-first toggle. Voice input. The reference's start cards and bottom mode bar. A
Content-Security-Policy header. Maths typesetting and code colouring. Passage text beside a source.
Deleting a conversation. Upload progress in percent. A switch that turns memory off. Asking again at
another depth. Removing pack 21 from the tree. Any change under `db/`, `workspace/`, `mcp-server/`,
`supabase/`, `sync/`, `apply/` or `desktop/`.

Three things the pictures show and this phase leaves out, each with its reason:

* **A name in the greeting.** The app holds no name of his, and a place to keep one is a database
  column (The lobby; 109a, item 21).
* **The panel's row of filter pills.** The pills in the picture sort a gallery of many kinds. The
  Files tab has one kind of row and shows each row's state on the row; the course is already a chip
  in the composer. The filter field covers finding a file by name.
* **A search field on the Sources tab.** It lists one answer's rows, 40 at most.

## Risks

* **Phase 22 moves before it merges.** 24b is cut after it is on `main`, and this brief is re-read
  then (task 1).
* **A leak through formatting.** The element list and the property test of task 4 hold it. No CSP
  header backs it up, so the renderer is the only guard.
* **Size.** The cut order: the example refresh, renaming a conversation, the routine search field,
  the drop target, the panel's two filter fields. Never cut: chips, sources, upload states, the two
  steps of an upload's delete, the memory delete, the About me note.
* **Pack 21 goes stale.** It is no longer run, and the README says so. It stays in the tree because
  four files hold it as their fixture; a later phase that wants it gone first moves that role to
  another pack.
* **Private text.** Fixtures are synthetic and no screenshot is committed.
* **Memory turns on at this cut-over.** From then a conversation answered after the switch and
  quiet for 15 minutes is summarised; nothing older is. He can delete any item, and a conversation
  whose item he deleted is not summarised again. If the container is restarted and not made again,
  memory stays off and check 12 fails: task 16 reads the value inside the container.
* **A delete he believes went further than it did.** Deleting an upload does not change answers
  already written. The line under the button says so.
* **Not checked:** whether an opened PDF can land on a page (Q-2); the upload and the file dialog in
  the desktop window (Q-1, Q-3); the renderer's cost while streaming (Q-4).

## The data layer, started early (Stack, 2026-10-14)

His answer 3 moves W-86's stream ahead of the gate. It can, because nothing it writes is a file Phase 22
sweeps or a file Phase 24ab changes: Phase 22's branches touch `fonts-href.ts`, `queries.grades.ts` and
`theme-preference.ts` under `web/src/lib/` and nothing else there (read 2026-10-14), and 24a's only file
under `web/src/` is the generated types file.

* **Where it runs.** Its own session (the start prompt is the next-to-last section). Phase branch
  `feat/workspace-page-24b` and worktree `C:/Users/stack/projects/bb2dash-wt-24b` are cut now **from
  `origin/feat/workspace-24`**, not from `main`, because the data layer types against 24a's objects
  (the regenerated `database.types.ts`) and its fixtures (`workspace/test/fixtures/contract24/`). W-86's
  branch `feat/workspace-page-24b-data` and worktree `bb2dash-wt-24b-data` are cut from that phase
  branch after task 3. When 24a/24ab merges, the phase branch merges `origin/main` (a merge, never a
  rebase) and goes on from there; until then it merges `origin/feat/workspace-24` whenever 24ab pushes.
* **What it builds now:** task 3 (the wording in `workspace-labels.ts`, PM) and W-86's tasks 4 to 6,
  narrowed: the nine new files under `web/src/lib/` and their tests (`answer-format.ts` is the parser
  only), `use-workspace-stream.ts` and its three tests. Probe Q-4 (the parser's cost on each flush) is
  W-86's and runs here. **Not now:** `AnswerBody.tsx` and its module, which live in
  `web/src/components/workspace/` and take Phase 22's tokens; they move to W-88's stream at the gate,
  built on W-86's parser. Q-1 to Q-3 and Q-5 wait for the gate too (they need the page, the desktop
  window or Phase 22 as merged).
* **What it freezes for the page's streams**, in the same session, before W-86 is spawned: the exported
  names and signatures of the nine modules and of the stream's `sources` handling, written into a
  short section of this brief ("The data layer's frozen exports"), so W-87 and W-88 type against them
  at the gate as the Workers section says.
* **What it may not do.** No file under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`,
  no CSS module, neither layout check (Phase 22 is sweeping them); no file outside `web/`; no database
  change; nothing live (no walk, no preview for Stack yet: there is no page to show). Phase 24ab's
  walk stops the live Workspace for a while: the data stream runs no live question, so it never needs
  the queue.
* **Its gates:** `cd web && npm run typecheck && npx eslint . --max-warnings 0 && npx vitest run`, the
  new tests' coverage at least 80 %, and `git diff --name-only origin/feat/workspace-24...HEAD` lists
  only W-86's files, the labels file and its test, this brief and `111a`. It opens no PR: 24b is one PR,
  opened at the end of the whole phase. It stops at "the data layer is on the phase branch" and says
  what the page's streams can start from.

## Session prompt for the data layer, started early

Paste into a new Claude Code window started in `C:/Users/stack/projects/bb2dash`:

> /bb2dash-pm Start Phase 24b's data layer, early, beside Phase 24ab. Read `docs/planning/sprint-2/briefs/111_PHASE24B_workspace_page.md` in full on the branch `origin/feat/workspace-24` (24a's branch: `git show origin/feat/workspace-24:<path>` or the worktree `C:/Users/stack/projects/bb2dash-wt-24`, read-only; that worktree belongs to the Phase 24ab session and you write nothing there), its "Amendments after 24a, as built" and "The data layer, started early" first, and `118_PHASE24AB_walk_and_handover.md`'s "The end goal, and the road to it". Then the fixture folder `workspace/test/fixtures/contract24/` and its README, and the web app's `web/src/lib/queries.workspace.ts`, `use-workspace-stream.ts` and `workspace-labels.ts`. The brief is approved: give me the triage line and a short report, do not enter plan mode. Cut the phase branch `feat/workspace-page-24b` as the worktree `C:/Users/stack/projects/bb2dash-wt-24b` from `origin/feat/workspace-24`, and work there by full paths. Do task 3 (the wording), write "The data layer's frozen exports" into the brief, then cut W-86's worktree and spawn W-86 on Opus for tasks 4 to 6 as that section narrows them, with probe Q-4. Touch no file under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, no CSS module and neither layout check: Phase 22 is sweeping them. Nothing live, no PR. When 24ab pushes, merge `origin/feat/workspace-24` into the phase branch; once 24a/24ab is on `main`, merge `origin/main` instead. Stop when the data layer is on the phase branch and its gates are green, and tell me what the page's streams can start from.

## Session prompt (a draft; Phase 24ab's task 12 finalises it)

Paste into a new Claude Code window started in `C:/Users/stack/projects/bb2dash`, once the gate is open
(Phase 22 and 24a on `main`, `just accept 24` green):

> `/bb2dash-pm` Start Phase 24b, the Workspace page. Its brief is `docs/planning/sprint-2/briefs/111_PHASE24B_workspace_page.md` on `main`; read it in full, its "Amendments after 24a, as built" first, and `118_PHASE24AB_walk_and_handover.md`'s "The end goal, and the road to it". Check the gate with task 1's two `git merge-base --is-ancestor` lines and the "accepted" row of Phase 24a in DECISIONS; if either fails, stop and tell me. Cut `feat/workspace-page-24b` as its own worktree `C:/Users/stack/projects/bb2dash-wt-24b` from `origin/main` and work there by full paths. Re-read Phase 22 as merged (its tokens, class names and the two Workspace folders) and freeze the brief with that re-read, my answers to its four questions, and the probes Q-1 to Q-5. Workers are as my answer to question 1 says. Anything visual goes in front of me on a preview before the merge. Stop at "ready when you say so"; the cut-over that turns memory on, and `just accept 24` after it, wait for my word.
