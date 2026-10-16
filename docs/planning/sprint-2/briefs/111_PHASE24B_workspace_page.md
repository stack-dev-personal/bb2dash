# Phase 24b: Workspace assistant, the page. A lobby, a composer with attachments, routines, scope and depth, formatted answers with sources, a side panel for sources, files and memory

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (the tag the PM assigns to brief 109) · Answers on record:
`109a_PHASE24_open_questions.md` · **Gate, since Stack's answers of 2026-10-14: the data layer (W-86) starts now, beside Phase 24ab; the page (W-87, W-88) starts when Phase 22 and 24a/24ab are on `main`; the PR merges after 24a is accepted (`just accept 24` green)** · Branch
`feat/workspace-page-24b` · Worktree `bb2dash-wt-24b` · Neither is cut yet · Workers W-86 to W-88
(24a uses W-76 to W-79 and W-85; W-80 to W-84 are the Phase 23 follow-ups', brief 110 at d558994,
line 13; the PM confirms the one numbering at the freeze) · No migration: the page uses 24a's
objects; 24a used the whole block 190–199, so a database change here needs a ruling and a new block · One PR in
bb2dash · Verification file
`docs/planning/sprint-2/verification/111a_PHASE24B_VERIFICATION.md`, called 111a below · Status: **MERGED 2026-10-15 as PR #109 (`aa4f702`), cut over 21:52Z (memory on), ACCEPTED
2026-10-16 by acceptance run `20261016T041410Z`, green from `main` at `7590d54`** (111a "Part 2"; the desktop half of
the walk waits for his sign-in); before that,
**FROZEN 2026-10-15 at the gate** (the section "Frozen at the gate" below: Phase 22 as merged read
again, token by token and class by class, every cited line number checked, probe Q-5 run, and
amendments (f) to (h) folded into the Contract; W-87 and W-88 are cut from the freeze commit, whose
hash 111a records). Before that: drafted with brief 109 on Stack's answers of 2026-10-08, and through
the challenge round of the same day (brief 109, Appendix 2). **Where "Frozen at the gate" and any
line above it differ, "Frozen at the gate" is current.**

**The design is carried out with the `ui-ux-pro-max` skill, in Phase 22's design language.** Dark by
default with a light version; black, grey and white with `#ff0000` as the one accent; pill buttons;
square bordered cards (brief 103 on `feat/styling-22` at 3d02033, lines 57-58 and 386-389; as merged
the rules stand in `design-system/bb2dash/MASTER.md` lines 49, 96 and 171, read again at the freeze). The
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
  before the first question. From the acceptance run of 2026-10-15 (`20261015T141817Z`, green, Phase 24a accepted; 109c):
  (f) the operator saw the Courses side panel open on the right in every picture from step 3 on and not in step
  2's, the ☰ state the page keeps; the new page decides what the panel does beside the chat; (g) step 6's answer
  named weekdays that do not match their dates (October 16, 2026 called a Wednesday; it is a Friday): the feed
  carries dates and the model worked the day names out itself, so the feed should carry the weekday, or the page
  should, and the prompt should state today's date; (h) after a Stop and a second finished answer, the Ask button
  looked a shade dim in the picture with both answers done: the composer's state after a Stop is W-88's to get
  right.
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
  **Amended in round 2 (R2-6, 2026-10-15):** it goes for `rich` answers, which the parser formats; a `plain`
  answer and a stored answer with no options row (every conversation before 24b) keep Stack's ruling of
  2026-10-07, the closed bold pairs stripped before `plainBlocks`.
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
| W-86 | data layer (**done**: merged to `main` as PR #108, 022812c, 2026-10-15) | `feat/workspace-page-24b-data` | `bb2dash-wt-24b-data` | the nine new files under `web/src/lib/` and their tests; `use-workspace-stream.ts` and its three tests (since 2026-10-14 `AnswerBody.tsx`, its module and its test are W-88's: "The data layer's frozen exports") | 2 (Q-4), 4 to 6 |
| W-87 | composer and lobby (**done**: merged at 8a02fb2; rounds 2 and 3 at 7947566 and aa16c0e) | `feat/workspace-page-24b-composer` | `bb2dash-wt-24b-composer` | `Composer`, `PlusMenu`, `DepthMenu`, `MaterialPicker`, `Lobby`, `ExamplePrompts`, their modules and tests; `Workspace.empty.test.tsx` | 7, 8 |
| W-88 | thread and panel (**done**: merged at 8a02fb2; rounds 2 and 3 at 05e942b and 27b099e) | `feat/workspace-page-24b-thread` | `bb2dash-wt-24b-thread` | `page.tsx`, `Workspace.tsx`, `Workspace.module.css`, `Thread`, `MessageList`, `ConversationList`, `TierBadge`, `ServiceStatus`, `SidePanel` and its tabs, `thread.ts`, `route.ts`, their modules; both layout checks; `Workspace.test.tsx`, `Workspace.thread.test.ts`, `Workspace.failures.test.tsx`, `Workspace.rereads.test.tsx`, `Workspace.service.test.tsx`, `workspace-harness.tsx` | 9 to 11 |
| PM | integration | `feat/workspace-page-24b` | `bb2dash-wt-24b` | `workspace-labels.ts` and its test; `workspace-examples.ts`'s `todayWords` (added at the freeze); the pack and `accept24.spec.ts` with `accept24.lib.ts`; **the acceptance files pack 21 shares:** `web/e2e/accept.lib.ts`, `web/e2e/walk21.lib.ts` and `walk21.window.ts` (the lines that read the two changed attributes), `acceptance/21/playbook.md` (only a sentence the pack check would otherwise fail), `acceptance/README.md` (one line), and the other `walk21*` files with `accept21.spec.ts` and `workspace-acceptance-helpers.spec.ts` as read at the cut; Phase 22's fixture and phone cases (`web/e2e/phone-width.spec.ts`, `web/e2e/theme-walk.spec.ts`); the token baseline if a count moves; `design-system/bb2dash/pages/workspace.md` (rewritten to this page); `compose.yaml`'s one value; state docs and root `CLAUDE.md`'s Workspace paragraph; 111a | 1 to 3, 12 to 16 |

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
  opened at the end of the whole phase (amended 2026-10-15: on Stack's word "merge to main" the data layer went to
  `main` on its own as PR #108, 24b's part 1, the one exception to one PR per phase, DECISIONS 2026-10-15; the page is
  part 2, from the same branch). It stops at "the data layer is on the phase branch" and says
  what the page's streams can start from.

## The data layer's frozen exports (PM, 2026-10-14, before W-86 was cut)

What W-86 builds now, and what W-87 and W-88 type against at the gate. The names and signatures below
are frozen; a body, a private helper or a test is the worker's. Where this section and the Workers
table or a Contract paragraph differ, this section is current. Conventions are `queries.workspace.ts`'s:
a key object, an `xOptions()` returning `queryOptions`, a `useX()` hook, throw on error, every row
through a pure normaliser, nothing fabricated. 24a's objects are in the regenerated `database.types.ts`
on this branch, so a module may use the typed client or `untypedClient()`; either way every row and
every `Json` return goes through its normaliser. No module imports from `web/src/components/`, and no
module reads `workspace_document_text` or `workspace_text_embeddings` (task 5's grep). The wording a
module needs is imported from `workspace-labels.ts`, frozen by task 3 (commit f20843c): each record
there keyed by a database vocabulary (`DOCUMENT_STATE_LABELS`, `UPLOAD_ERROR_SENTENCES`, `DEPTH_LABELS`,
`SOURCE_KIND_LABELS`, `ROUTINE_GROUP_HEADINGS`, `PANEL_TABS`, `RETRIEVAL_LINES`) spells the vocabulary
inline, and the module that owns the type pins the two equal in its test
(`const _: Record<WorkspaceDocumentState, string> = DOCUMENT_STATE_LABELS`).

**What W-86 does now** (his answer 3): tasks 4, 5 and 6 as narrowed here, and probe Q-4. Task 4 is the
parser alone: `answer-format.ts` and its test. `AnswerBody.tsx`, its module and its test are W-88's
at the gate, built on this parser. Tasks 5 and 6 are whole. The worker's record is
`verification/111_W86_VERIFICATION.md` (a red run and a green run per task, Q-4's line, every default
taken). The worker may add a string the page turns out to need to `workspace-labels.ts` and its test
only in a section headed "W-86 additions (for the PM to accept)" at the end of each file; nothing above
that heading changes. It touches no other file outside the list below.

### `queries.workspace-ask.ts` (task 5): `workspace_ask_with` and the options rows

```ts
export type WorkspaceDepth = 'auto' | 'quick' | 'standard' | 'deep';
export const WORKSPACE_DEPTHS: readonly WorkspaceDepth[];           // in that order
export type WorkspaceFormat = 'plain' | 'rich';
export const WORKSPACE_ATTACHMENTS_MAX = 5;
export interface WorkspaceAskOptions {
  course: string | null;      // a `v_course_display.display_id`, or null for all courses
  depth: WorkspaceDepth;
  routine: string | null;     // a `workspace_routines.id`
  format: WorkspaceFormat;    // the composer always sends 'rich'
  files: readonly number[];   // `bb_files.id`, in chip order
  uploads: readonly number[]; // `workspace_documents.id`, in chip order
}
export const DEFAULT_ASK_OPTIONS: WorkspaceAskOptions;              // all courses, auto, no routine, rich, none
export function toAskOptionsJson(options: WorkspaceAskOptions): Record<string, unknown>;
  // the six keys of ask-options.json, nulls kept, arrays as given; throws
  // WorkspaceOptionsRefusal('options_rejected') for a depth or format outside the lists, an id that is
  // not a positive safe integer, or more than five attachments in all (the database's own rules, first)
export interface AskWorkspaceWithInput { conversationId: string | null; text: string; options: WorkspaceAskOptions }
export function askWorkspaceWith(input: AskWorkspaceWithInput): Promise<WorkspaceAskResult>;
  // parseQuestion first (22023's rule), then rpc workspace_ask_with(p_conversation_id, p_text, p_options);
  // on error: throw askWithRefusalFor(error) ?? error
export type WorkspaceOptionsRefusalReason = 'reference_gone' | 'options_rejected' | 'not_owner';
export class WorkspaceOptionsRefusal extends Error { readonly reason: WorkspaceOptionsRefusalReason }
  // message = REFUSAL_REFERENCE_GONE | REFUSAL_OPTIONS_REJECTED | NOT_OWNER_LINE
export function askWithRefusalFor(error: unknown): WorkspaceRefusal | WorkspaceOptionsRefusal | null;
  // 22023, 23505 → refusalFor(); 23514 → options_rejected; 42501 → not_owner; 23503 whose message starts
  // with "workspace_ask_with:" → reference_gone; any other 23503 → null (isMissingConversation stays the
  // caller's: the conversation was not found)
export function useAskWorkspaceWith();                              // useMutation; onSettled invalidates as useAskWorkspace
export interface WorkspaceRequestOptions {
  request_id: number; depth: WorkspaceDepth; format: WorkspaceFormat;
  routine_id: string | null; course_display_id: string | null; course_ids: string[] | null;
}
export function normalizeRequestOptions(row: unknown): WorkspaceRequestOptions | null;
export const workspaceAskKeys = { options: (conversationId: string) => ['workspace', 'request-options', conversationId] as const };
export function requestOptionsOptions(conversationId: string | null, requestIds: readonly number[]);
  // select from workspace_request_options where request_id in (requestIds); enabled when the id is a
  // uuid and the list is not empty; the ids are the conversation's requests as the page has them;
  // (R2-1, 2026-10-14) a sorted copy of the ids is the key's suffix, so a new request is a new key and
  // a prefix invalidation of options(conversationId) still reaches it
export function useWorkspaceRequestOptions(conversationId: string | null, requestIds: readonly number[]);
export function lastRequestOptionsOf(rows: readonly WorkspaceRequestOptions[]): WorkspaceRequestOptions | null;
  // the highest request_id: the row the composer restores its routine and course chips from
```

### `queries.workspace-sources.ts` (task 5): one answer's provenance

```ts
export type WorkspaceRetrievalState = 'found' | 'attached_only' | 'empty' | 'failed';
export type WorkspacePlanState = 'skipped' | 'planned' | 'fallback';
export type WorkspaceAttachmentState = 'read' | 'cut' | 'not_ready' | 'failed' | 'missing' | 'no_text';
export type WorkspaceSourceKind = 'material' | 'upload' | 'memory' | 'feed';
export type WorkspaceSourceOrigin = 'auto' | 'attached' | 'tool';
export interface WorkspaceTurnAttachment { kind: 'file' | 'upload'; id: number; state: WorkspaceAttachmentState }
export interface WorkspaceTurn {
  request_id: number; depth: WorkspaceDepth; tier: WorkspaceTier; plan_state: WorkspacePlanState;
  retrieval_state: WorkspaceRetrievalState; found_n: number; passages_n: number; memory_n: number;
  feed_rows: number; attachments: WorkspaceTurnAttachment[]; created_at: string | null;
}   // never plan_cost_usd, prompt_bytes, plan_ms or retrieval_ms: costs and timings are not shown
export interface WorkspaceSource {
  request_id: number; ord: number; kind: WorkspaceSourceKind; origin: WorkspaceSourceOrigin;
  file_id: number | null; text_id: number | null; document_id: number | null; doc_text_id: number | null;
  course_id: string | null; title: string | null; unit_kind: string | null; unit_no: number | null;
}   // never similarity: a score is not shown
export const WORKSPACE_SOURCES_MAX = 40;
export function normalizeTurn(row: unknown): WorkspaceTurn | null;
export function normalizeSource(row: unknown): WorkspaceSource | null;
export const workspaceSourceKeys = {
  turns: (conversationId: string) => ['workspace', 'turns', conversationId] as const,
  sources: (requestId: number) => ['workspace', 'sources', requestId] as const,
};
export function turnsOptions(conversationId: string | null, requestIds: readonly number[]);  // workspace_turns, request_id in (...); the sorted ids are the key's suffix (R2-1)
export function sourcesOptions(requestId: number | null);   // workspace_sources where request_id = …, order ord asc, limit 40
export function useWorkspaceTurns(conversationId: string | null, requestIds: readonly number[]);
export function useWorkspaceSources(requestId: number | null);
export function turnOf(turns: readonly WorkspaceTurn[] | undefined, requestId: number): WorkspaceTurn | null;
export function retrievalLineOf(turn: WorkspaceTurn | null): string | null;
  // RETRIEVAL_LINES.empty for `empty`, RETRIEVAL_LINES.failed for `failed`, null otherwise (found, attached_only, no row)
export function invalidateWorkspaceProvenance(queryClient: QueryClient, conversationId: string | null, requestId: number | null): void;
  // turns(conversationId) and sources(requestId); the stream calls it on `sources` and on `done`
```

### `queries.workspace-files.ts` (task 5): uploads, the bucket, the two-step delete

```ts
export const WORKSPACE_UPLOADS_BUCKET = 'workspace-uploads';
export const WORKSPACE_UPLOAD_LINK_SECONDS = 604_800;        // 7 days, the registered link
export const WORKSPACE_UPLOAD_OPEN_LINK_SECONDS = 3_600;     // Open on a source row
export const WORKSPACE_UPLOADS_REFETCH_MS = 5_000;
export type WorkspaceDocumentKind = 'upload' | 'memory';
export type WorkspaceDocumentState = 'stored' | 'reading' | 'text_ready' | 'indexed' | 'failed' | 'deleting';
export type WorkspaceUploadErrorCode = 'too_large' | 'bad_type' | 'bad_bytes' | 'no_text' | 'extract_timeout'
  | 'extract_failed' | 'too_many_units' | 'link_expired' | 'download_failed' | 'embed_failed';
export const WORKSPACE_DOCUMENT_STATES: readonly WorkspaceDocumentState[];
export const WORKSPACE_UPLOAD_ERROR_CODES: readonly WorkspaceUploadErrorCode[];
export interface WorkspaceDocument {
  id: number; kind: WorkspaceDocumentKind; title: string; state: WorkspaceDocumentState;
  error_code: WorkspaceUploadErrorCode | null; mime: string | null; byte_size: number | null;
  sha256: string | null; storage_key: string | null; course_id: string | null;
  conversation_id: string | null; attempts: number; created_at: string | null; updated_at: string | null;
}   // never signed_url or signed_url_expires_at: the select list names its columns
export function normalizeDocument(row: unknown): WorkspaceDocument | null;
export const workspaceFileKeys = { uploads: () => ['workspace', 'uploads'] as const };
export function uploadsOptions();   // workspace_documents where kind = 'upload', newest first; refetchInterval 5 s while uploadsSettling()
export function uploadsSettling(rows: readonly WorkspaceDocument[] | undefined): boolean;  // any row not indexed and not failed
export function useWorkspaceUploads();
export function filterByTitle<T extends { title: string }>(rows: readonly T[], filter: string): T[];
  // pure; case-insensitive substring; '' or blank gives every row (the Files tab and the Memory tab)
export function findUploadBySha256(sha256: string): Promise<WorkspaceDocument | null>;   // any state
export interface RegisterUploadInput { sha256: string; title: string; mime: string; byteSize: number; signedUrl: string; signedUrlExpiresAt: string; courseId: string | null }
export interface RegisterUploadResult { id: number; state: WorkspaceDocumentState; existing: boolean }
export function registerUpload(input: RegisterUploadInput): Promise<RegisterUploadResult>;     // rpc workspace_upload_register
export function retryUpload(input: { documentId: number; signedUrl: string; signedUrlExpiresAt: string }): Promise<{ id: number; state: WorkspaceDocumentState }>;
export interface DeleteDocumentResult { id: number; kind: WorkspaceDocumentKind; state: 'deleting' | 'deleted'; storageKey: string | null }
export function deleteDocument(documentId: number, objectRemoved: boolean): Promise<DeleteDocumentResult>;  // rpc workspace_document_delete
export function setUploadCourse(documentId: number, courseId: string | null): Promise<void>;   // update course_id
export function setUploadTitle(documentId: number, title: string): Promise<void>;              // update title, 1–200 characters
export function refusalForDocumentCall(error: unknown): WorkspaceOptionsRefusal | null;         // 42501 → not_owner
export function sha256Hex(blob: Blob, subtle?: SubtleCrypto): Promise<string>;                 // 64 lower-case hex
export interface UploadStore {
  putObject(key: string, blob: Blob, contentType: string): Promise<void>;   // an object already there under the key is not an error
  signUrl(key: string, seconds: number): Promise<{ url: string; expiresAt: string }>;
  removeObject(key: string): Promise<void>;
}
export function browserUploadStore(): UploadStore;   // supabase.storage.from(WORKSPACE_UPLOADS_BUCKET)
export interface UploadFlowPorts {
  store: UploadStore; digest: (blob: Blob) => Promise<string>;
  findBySha256: typeof findUploadBySha256; register: typeof registerUpload; retry: typeof retryUpload;
  remove: typeof deleteDocument;
}
export function browserUploadPorts(): UploadFlowPorts;
export type UploadOutcome =
  | { kind: 'refused'; reason: 'too_large' | 'bad_type'; sentence: string }
  | { kind: 'existing'; document: WorkspaceDocument }          // the row that already holds the hash, in any state
  | { kind: 'registered'; id: number; state: WorkspaceDocumentState };
export function uploadFile(file: File, courseId: string | null, ports?: UploadFlowPorts): Promise<UploadOutcome>;
  // checkUploadRules → digest → findBySha256 (a hit uploads nothing) → putObject(storageKeyFor(sha), file, mime)
  // → signUrl(key, 7 days) → register; the content type is the rules' mime, never the browser's
export function retryUploadLink(document: WorkspaceDocument, ports?: UploadFlowPorts): Promise<{ id: number; state: WorkspaceDocumentState }>;
  // signUrl(storage_key, 7 days) → retry; only a `failed` row
export function removeUpload(document: WorkspaceDocument, ports?: UploadFlowPorts): Promise<DeleteDocumentResult>;
  // remove(id, false) → store.removeObject(storageKey) → remove(id, true); a failed removeObject throws and
  // makes no second call, so the row stays `deleting` with Try again, which runs the same three steps
export function createSignedUploadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;   // Open on an upload source
```

### `queries.workspace-memory.ts` (task 5): what is remembered, the About me note, the index status

```ts
export interface WorkspaceMemoryItem {
  document_id: number; conversation_id: string | null; title: string; state: WorkspaceDocumentState;
  summary: string | null; created_at: string | null; updated_at: string | null;
}
export interface WorkspaceProfile { id: number; about_me: string; memory_since: string | null; updated_at: string | null }
export interface WorkspaceIndexStatus {
  course_units_indexed: number; course_units_waiting: number; course_last_embedded: string | null;
  course_files_text_pending: number; uploads_indexed: number; uploads_waiting: number; uploads_failed: number;
  upload_links_expired: number; uploads_deleting: number; memory_indexed: number; memory_waiting: number;
  memory_failed: number; ingest_polled_age_seconds: number | null;
}   // a count the row does not hold reads 0 and is not invented elsewhere
export const WORKSPACE_ABOUT_ME_MAX = 2_000;
export const WORKSPACE_INDEX_STATUS_REFETCH_MS = 30_000;
export const workspaceMemoryKeys = {
  memory: () => ['workspace', 'memory'] as const,
  profile: () => ['workspace', 'profile'] as const,
  indexStatus: () => ['workspace', 'index-status'] as const,
};
export function memoryOptions();
  // two reads merged by document_id: workspace_documents where kind = 'memory' (title, state, conversation_id,
  // created_at, updated_at) and v_workspace_memory (summary); newest updated_at first
export function profileOptions();       // workspace_profile, the one row (id = 1)
export function indexStatusOptions();   // v_workspace_index_status, maybeSingle, refetch 30 s
export function useWorkspaceMemory(); export function useWorkspaceProfile(); export function useWorkspaceIndexStatus();
export function parseAboutMe(text: unknown): string;   // trimmed; throws an Error whose message is ABOUT_ME_LIMIT_LINE past 2000 characters (char_length's count)
export function setAboutMe(profileId: number, text: string): Promise<void>;   // update workspace_profile.about_me where id
export function forgetMemoryItem(documentId: number): Promise<DeleteDocumentResult>;   // deleteDocument(id, false): a memory item goes whole, state 'deleted'
export function indexStatusLines(status: WorkspaceIndexStatus, lastIndexedWords: string | null): readonly string[];
  // indexCountsLine('course', {…, failed: null}), ('uploads', …), ('memory', …), then lastIndexedLine(words) or NEVER_INDEXED_LINE
```

### `queries.workspace-routines.ts` (task 5)

```ts
export type WorkspaceRoutineNeeds = 'nothing' | 'file' | 'course_or_file';
export type WorkspaceRoutineGroup = 'study' | 'plan' | 'write';
export interface WorkspaceRoutine { id: string; grp: WorkspaceRoutineGroup; title: string; description: string; needs: WorkspaceRoutineNeeds; sort: number; enabled: boolean }
export const ROUTINE_COLUMNS = 'id, grp, title, description, needs, sort, enabled';   // never instructions
export const workspaceRoutineKeys = { routines: () => ['workspace', 'routines'] as const };
export function normalizeRoutine(row: unknown): WorkspaceRoutine | null;
export function routinesOptions();        // enabled = true, order sort asc
export function useWorkspaceRoutines();
export function routineNeedsMet(needs: WorkspaceRoutineNeeds, chosen: { attachments: number; course: string | null }): boolean;
export function routineNeedLine(routine: WorkspaceRoutine, chosen: { attachments: number; course: string | null }): string | null;
  // routineNeedsFileLine / routineNeedsCourseOrFileLine when not met, else null
export function routinesByGroup(rows: readonly WorkspaceRoutine[]): ReadonlyArray<{ group: WorkspaceRoutineGroup; heading: string; routines: WorkspaceRoutine[] }>;
  // study, plan, write, in that order; an empty group is left out; headings from ROUTINE_GROUP_HEADINGS
export function filterRoutines(rows: readonly WorkspaceRoutine[], filter: string): WorkspaceRoutine[];   // title or description, case-insensitive
```

### `answer-format.ts` (task 4, the parser alone)

```ts
export type AnswerInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: readonly AnswerInline[] }
  | { type: 'em'; children: readonly AnswerInline[] }
  | { type: 'code'; text: string }                 // an inline code span, verbatim; a label inside it is text
  | { type: 'label'; token: string };              // "[M12]", "[U3]", "[R7]" or "[P]", kept whole for workspace-citations
export type AnswerBlock =
  | { type: 'paragraph'; children: readonly AnswerInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: readonly AnswerInline[] }   // #### and deeper are level 3
  | { type: 'list'; ordered: boolean; items: ReadonlyArray<readonly AnswerBlock[]> }   // an item holds blocks: its text, and a nested list when indented
  | { type: 'table'; header: ReadonlyArray<readonly AnswerInline[]>; rows: ReadonlyArray<ReadonlyArray<readonly AnswerInline[]>> }
  | { type: 'code'; language: string | null; text: string }
  | { type: 'quote'; children: readonly AnswerBlock[] };
export function parseAnswer(text: string): readonly AnswerBlock[];
  // for every string: returns blocks and never throws; pure and deterministic over the text, so a flush that
  // appends text leaves the finished blocks before it unchanged; an unclosed fence, table or emphasis at the
  // end is a paragraph of text; a link form and an image form are not forms (their characters are text);
  // raw HTML is text; nothing here yields an element, a URL or an attribute
export function plainBlocks(text: string): readonly AnswerBlock[];
  // format 'plain' and a stored answer with no options row: paragraphs split on blank lines, inlines are
  // text and label tokens only, no markup read
export function inlineText(inlines: readonly AnswerInline[]): string;   // the plain text of a run
export function blocksText(blocks: readonly AnswerBlock[]): string;    // the plain text of the answer (data-answer-text)
```

### `workspace-citations.ts` (task 5)

```ts
export type SourceLabel =
  | { kind: 'material'; textId: number } | { kind: 'upload'; docTextId: number }
  | { kind: 'memory'; documentId: number } | { kind: 'feed' };
export const LABEL_TOKEN: RegExp;   // one whole token: ^\[(?:[MUR][1-9]\d{0,15}|P)\]$
export function findLabelTokens(text: string): ReadonlyArray<{ start: number; end: number; token: string }>;   // answer-format uses it
export function parseLabel(token: string): SourceLabel | null;
export function resolveLabel(label: SourceLabel, sources: readonly WorkspaceSource[]): WorkspaceSource | null;
  // M: kind material and text_id; U: kind upload and doc_text_id; R: kind memory and document_id; P: kind feed;
  // the first match by ord; null when the request has no such row (the token stays text)
export interface Citation { token: string; source: WorkspaceSource; ord: number }   // ord is the chip's number
export function citationFor(token: string, sources: readonly WorkspaceSource[]): Citation | null;
export function citedOrdsOf(blocks: readonly AnswerBlock[], sources: readonly WorkspaceSource[]): readonly number[];   // in answer order, each once
export function sourcesForPanel(sources: readonly WorkspaceSource[], citedOrds: readonly number[]): readonly WorkspaceSource[];
  // the cited rows first, in cited order, then the rest by ord
export type SourceTarget =
  | { kind: 'file'; fileId: number }          // FileOpenAction; the row names the page unless Q-2 passes
  | { kind: 'upload'; documentId: number }    // a short signed link, by the upload row's storage_key
  | { kind: 'memory'; documentId: number }    // the Memory tab
  | { kind: 'planner' };                      // /planner
export function sourceTarget(source: WorkspaceSource): SourceTarget | null;   // null for a row with no id to open
export function sourceLocationLine(source: WorkspaceSource): string | null;   // unitLocationLine(unit_kind, unit_no), or null
```

### `workspace-examples.ts` (task 5)

```ts
export const EXAMPLE_WINDOW_DAYS = 14; export const EXAMPLE_CANDIDATES_MAX = 9; export const EXAMPLES_SHOWN = 3;
export type ExampleForm = 'exam' | 'reading' | 'work';
export interface ExamplePrompt { key: string; form: ExampleForm; text: string; itemKind: 'assignment' | 'reading'; itemId: string; courseId: string; dueOn: string }
export interface ExampleInput { items: readonly WorkItem[]; courses: readonly CourseDisplay[]; today: string }
  // WorkItem and CourseDisplay from queries.today.ts; today is the New York date, YYYY-MM-DD
export function exampleCandidates(input: ExampleInput): readonly ExamplePrompt[];
  // dated items due in [today, today + 14 days], not in a finished status (progress-status.ts says which),
  // by due date then title, the first nine; form: category exam or quiz → 'exam', reading → 'reading', else
  // 'work'; text = examplePromptLine(form, { title, course: courseCodeOf(...), date: dateWords(...) });
  // no rows → an empty list, never an invented example
export function courseCodeOf(courseId: string, courses: readonly CourseDisplay[]): string;   // the display whose display_id or shell_ids holds it, else the id itself
export function dateWords(dueOn: string): string;   // "Tue Oct 21": en-US, weekday short, month short, day, America/New_York
export function examplePages(candidates: readonly ExamplePrompt[]): number;             // ceil(n / 3); 0 for none
export function examplesShown(candidates: readonly ExamplePrompt[], page: number): readonly ExamplePrompt[];   // the page's three, wrapping
```

### `workspace-upload-rules.ts` (task 5)

```ts
export const WORKSPACE_UPLOAD_MAX_BYTES = 20_971_520;
export const WORKSPACE_UPLOAD_TITLE_MAX = 200;
export const WORKSPACE_UPLOAD_TYPES: ReadonlyArray<{ extension: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt' | 'md'; mime: string }>;   // the six of migration 190
export type UploadRefusalReason = 'too_large' | 'bad_type';
export type UploadRuleResult =
  | { ok: true; mime: string; extension: string; title: string }
  | { ok: false; reason: UploadRefusalReason; sentence: string };   // UPLOAD_REFUSALS[reason]
export function checkUploadRules(file: { name: string; size: number }): UploadRuleResult;
  // size 1 to the limit; the extension, case-insensitive, decides the type (a browser may report none for
  // Markdown); 20,971,521 bytes is refused before any request
export function mimeForExtension(extension: string): string | null;
export function uploadTitleOf(fileName: string): string;   // trimmed, cut to 200 characters as char_length counts, "Untitled" when empty
export function storageKeyFor(sha256: string): string;      // 'u/' + sha256; throws for a hash that is not 64 lower-case hex
```

### `use-workspace-stream.ts` (task 6): the `sources` event and the stop guard

```ts
export interface StreamSources { requestId: number; state: WorkspaceRetrievalState; foundN: number }
export function parseSources(payload: unknown): StreamSources | null;   // {request_id, state, found_n}; unknown keys ignored
export type StreamEvent = …
  | { type: 'sources'; topic: string; requestId: number; state: WorkspaceRetrievalState; foundN: number }
  | { type: 'stopped'; topic: string; requestId: number };
// RequestStream gains `sources: StreamSources | null` and `stopped: boolean`. After `stopped`, a delta, a
// sources event or a done for that request changes nothing. An event name the hook does not subscribe to
// is never dispatched, so it changes nothing.
export interface WorkspaceStreamView { …as today…; sources: StreamSources | null; stopped: boolean }
export interface WorkspaceStreamControls { markStopped(requestId: number): void }   // stable; the page's Stop calls it
export function useWorkspaceStream(conversationId: string | null, requestId: number | null): WorkspaceStreamView & WorkspaceStreamControls;
// on `sources`: dispatch, then invalidateWorkspaceProvenance(queryClient, id, requestId)
// on `done`: invalidateWorkspaceConversation (today) and invalidateWorkspaceProvenance
// Today's callers keep working: every field they read is unchanged.
```

The searching line is derived by the thread (W-88): a request in `claimed` whose stream has no `sources`
and no text shows `SEARCHING_LINE`; once the `sources` event or the first delta arrives it goes.

### Tests, probe, gates for this stream

* Tests, one file per module under `web/test/`: `answer-format.test.ts` (task 4's property test with
  `fast-check`: for generated strings the blocks hold no element, URL or attribute, which here means no
  inline or block type outside the unions above and no `href`/`src` text taken as markup; an unclosed form
  is text; no input throws), `queries.workspace-ask.test.ts`, `queries.workspace-sources.test.ts`,
  `queries.workspace-files.test.ts` (task 5's call-order cases through fake ports), `queries.workspace-memory.test.ts`,
  `queries.workspace-routines.test.ts`, `workspace-citations.test.ts`, `workspace-examples.test.ts`,
  `workspace-upload-rules.test.ts`; the three `use-workspace-stream*` tests extended and
  `use-workspace-stream.stop.test.tsx` new (task 6). Each vocabulary record in the labels file is pinned to
  its type in the owning module's test. Supabase is stubbed as the existing `queries.workspace.test.ts` does.
* **Probe Q-4**, W-86's, recorded in `111_W86_VERIFICATION.md`: `parseAnswer` over a 100,000-character
  answer (headings, lists, a table, a fence, labels) at least 20 times, the median under 16 ms on this laptop
  (`node --test`-free: a vitest case that prints the figure, or a one-off script in the worktree's
  scratch, not committed). PASS: the stream formats live text on each flush. FAIL: only the stored row is
  formatted and streaming text stays plain; the worker says so in the record and `parseAnswer` is unchanged.
* **Gates** for W-86's branch, before the PM merges it: from `web/`, `npm run typecheck`,
  `npx eslint . --max-warnings 0`, `npx vitest run`; `npx vitest run --coverage` with every new module at
  80 % lines or more; from the repo root,
  `git grep -n -e "\.from(.workspace_document_text.)" -e "\.from(.workspace_text_embeddings.)" -- web/src` gives
  no line; `git diff --name-only feat/workspace-page-24b...HEAD` lists only the nine modules, their tests,
  `use-workspace-stream.ts` and its four tests, the two labels files (only below the "W-86 additions"
  heading) and `docs/planning/sprint-2/verification/111_W86_VERIFICATION.md`.

### What the page's streams start from, at the gate

W-87 (composer, lobby) imports `WorkspaceAskOptions`, `DEFAULT_ASK_OPTIONS`, `useAskWorkspaceWith`,
`askWithRefusalFor`, `useWorkspaceRequestOptions`, `lastRequestOptionsOf`, `useWorkspaceRoutines`,
`routinesByGroup`, `filterRoutines`, `routineNeedLine`, `checkUploadRules`, `uploadFile`,
`useWorkspaceUploads`, `exampleCandidates`, `examplesShown`, `examplePages` and the labels. W-88 (thread,
panel) imports `parseAnswer`, `plainBlocks`, `blocksText`, `citationFor`, `citedOrdsOf`,
`sourcesForPanel`, `sourceTarget`, `sourceLocationLine`, `useWorkspaceTurns`, `turnOf`,
`retrievalLineOf`, `useWorkspaceSources`, `useWorkspaceUploads`, `removeUpload`, `retryUploadLink`,
`createSignedUploadUrl`, `filterByTitle`, `useWorkspaceMemory`, `forgetMemoryItem`, `useWorkspaceProfile`,
`parseAboutMe`, `setAboutMe`, `useWorkspaceIndexStatus`, `indexStatusLines`, the stream's `sources`,
`stopped` and `markStopped`, and the labels. `AnswerBody.tsx` is W-88's, over `parseAnswer`'s blocks.

## Frozen at the gate (PM, 2026-10-15)

The gate opened on 2026-10-15 (Phase 22 at `dff1e05`, 24a at `2b7c388` and 24ab on `main`; `just accept 24`
green, run `20261015T141817Z`; the data layer on `main` as PR #108). This section is what the PM read and
ruled at the freeze. It binds W-87 and W-88 together with the Contract and "The data layer's frozen
exports"; where it and any earlier line differ, this section is current. The freeze commit's hash is in
111a ("Part 2").

### The gate and the branch, checked

* `git merge-base --is-ancestor dff1e05 origin/main` → 0 (Phase 22); `git merge-base --is-ancestor 2b7c388
  origin/main` → 0 (24a, PR #97); DECISIONS holds the row "Phase 24a accepted" (2026-10-15).
* `origin/main` is `022812c` (PR #108) and is an ancestor of the phase branch's HEAD (exit 0): nothing to
  merge. Since the branch's last green gates (7e71eb7, 111a) it holds docs (3c237ed) and the freeze's two
  commits, so the gates are not re-run before the cut; they run again at integration (task 15).

### Phase 22 as merged, read again

**The two folders are Phase 21's with one Phase 22 line.** `web/src/app/(app)/workspace/`: `page.tsx` (34
lines), `Workspace.tsx` (380), `Workspace.module.css` (37). `web/src/components/workspace/`: `Composer.tsx`
(128) and its module (33), `ConversationList.tsx` (221) and module (106), `MessageList.tsx` (216) and module
(93), `ServiceStatus.tsx` (112) and module (16), `TierBadge.tsx` (20) and module (6), `route.ts` (19),
`thread.ts` (332). Phase 22's sweep of screens B (`18dd4ce`, then `9d85a10`) changed one declaration in them,
`Workspace.module.css:8`, `minmax(14rem, 18rem)` → `minmax(var(--size-conversations-min),
var(--size-conversations-max))`, and left every other line as Phase 21 merged it on 2026-10-07 and amended it
(W-1 `392c35f`, W-2 `bff1c24`, R3-5 `012e93d`, W-3 `3d9ebb1`, CR-9 `69cd76a`). The six module headers still
read "Existing tokens only; Phase 22 restyles": the rewrite drops that line. Today's class names, which the
Tests table keeps or renames: `Workspace.module.css` `.workspace`, `.thread`, `.problem`;
`MessageList.module.css` `.column`, `.turns`, `.turn`, `.question`, `.answer`, `.text`, `.used`, `.line`,
`.empty`, `.emptyLink`; `Composer.module.css` `.composer`, `.row`, `.box`, `.button`, `.refusal`;
`ConversationList.module.css` `.list`, `.head`, `.heading`, `.new`, `.rows`, `.row`, `.rowLink`, `.rowTitle`,
`.rowWhen`, `.rowAction`, `.toggle`, `.empty`, `.problem`; `ServiceStatus.module.css` `.offline`, `.problem`;
`TierBadge.module.css` `.badge`. Every one composes from or reads tokens only; `.question` draws its rule with
`2px solid var(--color-accent)` (the ink, not red), and `.column` is `position: relative; overflow-y: auto;
max-height: 62dvh`.

**Tokens (`web/src/app/globals.css`, 622 lines: the dark `:root` 28–301, the light
`:root[data-theme='light']` 303–443, every colour and shadow name declared in both).** Roles 30–39:
`--color-bg`, `--color-panel`, `--color-surface`, `--color-surface-press`, `--color-text`, `--color-accent`
(the ink, = `--color-neutral-100`), `--color-on-accent`, `--color-accent-2`, `--color-divider`,
`--color-muted`. Ramps 42–68: `--color-neutral-100` to `-900`; `--color-accent-100` to `-900`, of which only
`--color-accent-500: #ff0000` is red (every other step points at the neutral of the same number);
`--color-accent-2-100` to `-900`. Chrome 71–76: `--color-danger`, `--color-danger-bg`, `--color-hover`,
`--color-active`, `--color-scrollbar`, `--color-scrollbar-hover`. Type 79–107: `--font-heading` (Source
Serif 4), `--font-heading-weight`, `--font-body` (Source Sans 3), `--font-mono` (Source Code Pro),
`--font-weight-regular/medium/semibold/bold`, `--text-xs/sm/base/md/lg/xl/2xl` (11, 12.5, 13.5, 15, 17, 20,
28 px) and the fixed steps `--text-3xs/2xs/10-5/11-5/12/13/14/19`. Space 110–116: `--space-1/2/3/4/6/8/12`
(2.8 to 33.6 px). Radii 119–129: `--radius-xs/sm/md/lg` (1, 3, 4, 6 px), `--radius-control` and
`--radius-chip` (999 px: the pill), `--radius-bar`, `--radius-day`, `--radius-3`. Shadows 132–136:
`--shadow-sm` (the 1 px ring, a card at rest), `--shadow-hover`, `--shadow-md`, `--shadow-lg`,
`--shadow-mark`. Sizes 139–152: `--size-underline`, `--size-underline-mark`, `--size-underline-offset`,
`--size-notice-bar`, `--size-focus`, `--size-focus-gap`, `--size-scrollbar`, `--size-check`, `--size-target`
(24 px, a press area), `--size-window-controls`. Layout 155–163: `--nav-height` (52 px), `--content-max`,
`--sidebar-side`, `--sidebar-width` (260 px). Motion 209–228: `--motion-press/state/enter/enter-lg/delay/
shift/spin/exit/exit-lg`, `--ease-out/linear/in`, `--motion-control`. The fixed sizes 231–294: `--size-3` to
`--size-760` (among them `--size-44`, the phone target; `--size-280`; `--size-panel-max` 360 px at 283;
`--size-conversations-min` 14rem and `--size-conversations-max` 18rem at 289–290; `--size-panel-gutter`,
`--size-toast-top`, `--size-toast-width`, `--size-search-popover-max`). The mixes 295–317: `--color-scrim`,
`--color-scrim-popout`, `--color-text-45/30/78`, the `--color-mix-*` names and `--color-accent-tint-6/7/12`.
Global rules: `.sr-only` (478–488), the focus ring (492–498: `:focus-visible` outside a dialog takes
`--size-focus` of the ink), `[data-loading]` with `@keyframes arrives` and the reduced-motion block (596–621).
**No worker adds a token.** A size or colour this page needs that no token names is the PM's to add to
`globals.css` (a colour in both blocks) and to record in 111a; a worker writes its need in its record and
uses the nearest token meanwhile.

**Shared classes (`web/src/styles/tokens.module.css`, 323 lines)**, composed as the six modules do today
(`composes: btnPrimary from '@/styles/tokens.module.css'`): `.card` 23, `.cardLg` 33, `.elevSm/Md/Lg`
39–41, `.rule` 44, `.kicker` 52, `.mono` 60, `.muted` 66, `.tag` 69 (the pill: `--radius-chip`),
`.tagAccent` 81 (filled ink), `.tagNeutral` 87, `.tagOutline` 94 (the badge's), `.btn` 103 (a pill,
`--radius-control`, `scale(0.98)` on press), `.btnPrimary` 130 (the ink; disabled is a flat grey pill at
opacity 1, 145–150), `.btnSecondary` 152, `.btnGhost` 164 (the quiet, underlined button), `.field` 177,
`.input` 186 (the well: `--color-bg` inside a `--color-neutral-600` edge, `--radius-md`), `.glyph*`
222–251, `.errorNotice` 264 (the app's one error form), `.tip` 283.

**The design system (`design-system/bb2dash/MASTER.md`).** Red is opt-in: a rule is red only when it names
`--color-accent-500`, and red marks three things, where you are, what is most urgent and what is unread,
never text (line 49). The top bar is square; buttons are pills; cards are square with a clear edge (96).
One primary button per view, no red button, nothing lifts on hover (171). The radii table is 85–91.
`pages/workspace.md` was written on 2026-10-08 for Phase 21's page and says "no module is added" and
"answers are plain text": both are superseded by this brief, and the PM rewrites that page in this PR.

**The frame.** `web/src/app/(app)/layout.tsx`: `TopNav`, then `.body` (a flex row in `--sidebar-side`)
holding `CourseSidebar` and `ContentPane` (`.main`, `Shell.module.css:53–66`: `position: relative;
overflow-y: auto; scrollbar-gutter: stable`, padding `--space-8 --space-12 --space-12`, at ≤720 px
`--space-6 --space-4 --space-8`; its children `flex-shrink: 0`). The course rail is 260 px in flow at
≥1024 px and a fixed drawer at ≤1023.98 px (`CourseSidebar.module.css:147–`), open or closed by
`html[data-sidebar]`, his remembered ☰ state. The page header pattern is `Shell.module.css` `.header`,
`.headerText`, `.kicker`, `.title` (76–98), as `page.tsx` uses it with `PAGE_KICKER`.

**The breakpoints the audit allows.** `web/test/token-audit.allowlist.ts` is FROZEN at Phase 22's task 2 and
is never edited. An `@media` width condition may hold only `480px`, `620px`, `640px`, `720px`, `760px`,
`820px`, `900px` or `1023.98px` (A1); one `@container` width exists (`CourseTimeline.module.css`, 600 px)
and any other fails. **So this page folds on `@media (max-width: 1023.98px)` and `@media (max-width:
720px)` and writes no container query.** `1px` and `2px` pass (A2); every other size is a token;
`color-mix()` counts; a TSX `style=` key that is not a custom property counts; a `var(--name)` declared
nowhere fails.

**The token audit's clusters (`web/test/token-audit.test.ts:97–140`).** Both Workspace folders are
`screens-b` by prefix, so every new file lands there with a baseline of 0 (`token-audit.baseline/
screens-b.json` lists `Workspace.module.css: 0`; a file not listed is 0). One literal fails `npm test`.

**Red files.** `git grep -l "var(--color-accent-500)" -- web/src` lists nine files today (`CourseSubBar`,
`Inbox`, `AnnouncementsList`, `CourseTimeline`, `PlannerWeek`, `Bell`, `CourseSidebar`, `TopNav`,
`UpcomingTracker`), none in the Workspace; Phase 22's walk recorded "exactly nine lines" (`WALK.md`
PD-3). This page names `--color-accent-500` in two modules only, for the picked tab (`SidePanel.module.css`)
and the picked conversation (`ConversationList.module.css`): eleven after; 111a records the count at
integration. Nothing else on the page is red, and no status is told by red alone.

**The walk guard and the row 12 fixture.** `web/e2e/walk22.lib.ts:164` `rpcVerdict`: an RPC not in
`READ_RPCS` is aborted; a table read passes; a storage POST passes only when it signs a read. The fixture
for `/workspace?c=<fixture>` fulfils four reads, `workspace_conversations`, `workspace_messages`,
`workspace_requests` and `v_workspace_status` (`phone-width.spec.ts:118–166`, `theme-walk.spec.ts:142–`).
The new page also reads, every one a select, `workspace_turns`, `workspace_sources`,
`workspace_request_options`, `workspace_request_attachments`, `workspace_routines`, `workspace_documents`,
`v_workspace_memory`, `workspace_profile`, `v_workspace_index_status`, `v_work_items`, `v_course_display` and
`v_bb_files_current`; the PM extends both fixtures (task 12).

### Line numbers the brief cites, read again

| cited above | as merged |
|---|---|
| `Composer.tsx:85-93` (Enter) | 85–93 (`onKeyDown`; `if (requestOpen) return;` at 92) |
| `MessageList.tsx:10-16` (plain text) | 10–16 |
| `Workspace.tsx:334` (`useWorkspaceStream`) | 353 |
| `Workspace.module.css:33` (the 720 px step) | 32–36 |
| `thread.ts:304-309` (`emptyColumnOf`), `:150` (`withoutBoldMarkers`) | 304; 150; `usedLine` 324 |
| `queries.workspace.ts:684-687` (`workspace_ask`) | 684; `workspace_cancel` 698; the file is 789 lines, at the cap |
| `PopoutShell.tsx:31-37` | the export at 23, its props 24–37 |
| `usePopover.ts:29` | 29 |
| `FileOpenAction.tsx:70-76` | the export at 72 |
| `queries.materials.ts:136` (`createSignedFileUrl`) | 132 |
| `queries.today.ts:123-127` (`WORK_ITEM_COLUMNS`) | 123–127 |
| `Workspace.layout.test.tsx:61-68` (`SCREEN_SHEETS`) | 61–68 |
| `Workspace.thread.test.ts:391` | 391 |
| `walk22.lib.ts:164`; brief 103 "line 182" | 164; the fixture is brief 103's inventory row 12 (its line 409) |
| brief 103 lines 57-58 and 386-389 | drifted; the rules are `MASTER.md` 49, 96 and 171 |
| `140:196` (no browser path to a stored answer) | unchanged, migration 140 |

### Probe Q-5

* **(1)** Phase 22's real token and class names: above.
* **(2)** The count of files that name the red step is not a standing test. It is `git grep -l
  "var(--color-accent-500)"` run at the walk (brief 103 line 2083; `WALK.md` PD-3, nine). No vitest case
  pins the number (`theme-tokens.test.ts` and `type-tokens.contrast.test.ts` read the step's value only).
* **(3) PASS.** A scratch vitest case read `import.meta.glob('../src/components/workspace/*.module.css',
  { eager: true })` and got a map of the folder's modules, each a class-name map (1 passed, 2.8 s; the file
  was removed, nothing committed). So `Workspace.layout.test.tsx` may read the folder's sheets by glob and
  drop its hand-written list, as the Tests table asks; `readdirSync` stays for the folder listing.

### Amendments (f) to (h), folded into the Contract

**(f) The course rail beside the chat.** The page never changes the shell's rail: `html[data-sidebar]` is
his remembered ☰ state and the same on every page. The Workspace lays itself out in the pane it gets:

* **≥1024 px.** The grid is the conversations rail `minmax(var(--size-conversations-min),
  var(--size-conversations-max))`, the column `minmax(0, 1fr)` with its 80ch cap, and, while the panel is
  open, the panel `minmax(var(--size-280), var(--size-panel-max))`; folded (no `panel` parameter), two
  tracks, as today. With the course rail open at 1024 to 1279 px the column is narrow; the walk records the
  column's width at 1280 px with the rail open and closed (default D-F below, Stack's to judge).
* **≤1023.98 px.** The panel is a sheet over the page, through `PopoutShell` (the scrim, Esc, focus moved in
  and handed back): opened by `?panel=<tab>` and the Show panel button, closed by Hide panel, Esc or the
  scrim, each of which drops the parameter. It is a sheet from the right, as wide as `min(100%,
  var(--size-panel-max))`.
* **≤720 px.** The conversations rail is a sheet too, through `PopoutShell`, opened by one button at the top
  of the column that reads `CONVERSATIONS_HEADING` and closed the same three ways. The composer is docked:
  `position: sticky; bottom: 0` inside the pane, on the pane's ground (`--color-bg`), so a long thread
  never pushes it off screen. The message column keeps scrolling inside itself.

**(g) The weekday and today's date.** The page states today's New York date with its weekday on every
visit, lobby and thread: one line at the top of the Workspace's column (`Workspace.tsx`, W-88), rendered
once hydrated from `useNow` through `courseToday()` (`web/src/lib/course-dimension.ts:179`),
`todayLine(todayWords(date))` → `Today is Thursday, October 15, 2026.`, the element carrying
`data-today="YYYY-MM-DD"`. The example prompts already name a weekday (`dateWords`). The runner's side (a
weekday in the feed's rows, today's date in the prompt) is `workspace/`'s and out of this phase; it is put
to Stack in 111a as a follow-up that needs his word and no migration. The page cannot correct a model's
wrong weekday; it shows the true one beside the answer.

**(h) The composer after a Stop.** The button is disabled only while a question or a Stop is on its way
(`busy`) or the conversation was not found (`disabled`). After Stop, the moment the cancel settles, in
success or failure, `busy` is false again; when a later question's answer is stored the button reads Ask,
is enabled and carries no `aria-busy`. W-88 owns the state (`Thread` in `Workspace.tsx` derives `busy` from
`ask.isPending || stopper.pending` and nothing else, and `stopper.pending` is `cancel.isPending`, false once
settled); W-87 owns the rendering (`disabled={busy || disabled}`, and nothing else dims the button; the
disabled look is `.btnPrimary:disabled`, Phase 22's flat grey). W-88 adds the case to
`Workspace.failures.test.tsx`: Stop, the cancel settles, a second question is asked and its row stored, and
the button reads Ask, `toBeEnabled()`, no `aria-busy`.

### Added by the PM at the freeze (commit 9bcbae8)

* `web/src/lib/workspace-examples.ts`: `export function todayWords(today: string): string`,
  "Thursday, October 15, 2026" (en-US, weekday long, month long, day, year, America/New_York; throws for a
  string that is not a YYYY-MM-DD date, as `dateWords`). Four cases in `workspace-examples.test.ts`.
* `web/src/lib/workspace-labels.ts`: `export function todayLine(words: string): string` → `Today is
  ${words}.`, in the lobby section; sampled in `workspace-labels.test.ts`'s builder list and asserted.
* The labels file is otherwise as task 3 froze it (f20843c) with W-86's additions accepted at #108. A worker
  that needs a string it does not hold adds it under a heading "W-87 additions (for the PM to accept)" or
  "W-88 additions (for the PM to accept)" at the end of the file and of its test, as W-86's rule was, and
  names it in its record; nothing above the heading changes.

### Data attributes, final

Eight stay: `data-turn`, `data-tier`, `data-answer-text`, `data-turn-line`, `data-workspace-offline`,
`data-request-id`, `data-channel`, `data-workspace-stream`. Renamed: `data-used` becomes `data-sources` (the
row under an answer, text `sourcesCountLine(n)`, a button that opens the panel at its rows);
`data-column-empty="start"` becomes `data-lobby` on the lobby's root, while `data-column-empty="loading"`
and `="missing"` stay on the thread's empty column. New: `data-source-ref="<ord>"` on a chip in an answer;
`data-chip="course|routine|file|upload"` on a composer chip; `data-retrieval="<retrieval_state>"` on a turn
whose row is known; `data-upload-state="<state>"` on a Files row and on an attachment chip;
`data-panel="sources|files|memory"` on the open panel's root; `data-depth="<depth>"` on the depth menu's
button; `data-today="YYYY-MM-DD"` on the date line. `accept24.spec.ts` and the shared helpers read these
(task 14).

### Workers at the gate

W-86 is done (PR #108). W-87 and W-88 are cut from the freeze commit on `feat/workspace-page-24b`, in
`bb2dash-wt-24b-composer` and `bb2dash-wt-24b-thread`, on Opus. Each types against "The data layer's frozen
exports" and imports what "What the page's streams start from, at the gate" lists; W-88 also imports
`todayWords` and `todayLine`. W-87 imports `web/test/workspace-harness.tsx` and does not edit it (it is
W-88's); a gap goes in W-87's record as a default. Both use `courseToday()` for the New York date,
`usePopover` for a menu, `PopoutShell` for a sheet and the picker, `FileOpenAction` for a course file,
`useHydrated()` before any cached row renders. The PM owns everything in the Workers table's PM row and
nothing a worker owns.

### Defaults taken at the freeze, each Stack's to overturn

* **D-F** The course rail stays his; the Workspace fits the pane it gets; the panel's docked minimum is
  `--size-280`. If the column at 1280 px with the rail open reads too narrow at the walk, the PM proposes a
  rule and does not build one.
* **D-G** The date line is on the page, both screens; the runner's feed and prompt change is a follow-up
  for his word.
* **D-H** As (h) above.
* **D-I** Red marks the picked tab and the picked conversation (where you are), per this brief's "Look",
  which overrides `pages/workspace.md`'s 2026-10-08 line that the current conversation gets no red bar.
* **D-J** The conversations rail under 720 px and the panel under 1024 px are `PopoutShell` sheets, so one
  component owns every modal surface on the page.

## Round 2 (PM, 2026-10-15, after `/code-review main high`, `/security-review` and the PM's browser walk of the preview)

The integrated branch (8a02fb2 and after) passed every SOP gate: typecheck, eslint, build, 3,834 tests in 208 files,
93.79 % lines, the acceptance suite 103, the table grep empty. `/security-review` found nothing at its bar and one
hardening note (S-1). `/code-review main high` found thirteen things; the walk of the preview in a headed browser
(both themes, 1280 and 390 px) found three more. Each goes back to its stream below, numbered; the HIGH ones and
the walk's are must-fix, the rest should-fix unless the fix costs a frozen export. Every fix: test first, the
record extended ("Round 2"), commit and push per item, the gates green on the branch, a report under 300 words.
Nobody answers a running worker.

### W-87 (composer, lobby), on `feat/workspace-page-24b-composer`

* **R2-1 (HIGH, code review 1 and 11).** The depth picked in the lobby is lost on the hop to the thread: the
  Lobby and the Thread are different components, so the Composer remounts with `START_CHOICES` and reads Auto,
  though the brief says Quick and Standard stay until he changes them (Deep alone returns to Auto); acceptance
  step 17 asserts `data-depth="standard"` after its answer. `useConversationReset` can never fire for the same
  reason and is dead. Fix inside the composer's own files: keep the depth in a page-lifetime store of W-87's
  (`useSyncExternalStore` over a module-level value, as `routine-request.ts` keeps its seq; no prop joins
  `ComposerProps`), read on mount, written on each pick and by the Deep-returns-to-Auto rule; remove the dead
  hook. Test: pick Standard, remount the composer with another `conversationId`, the menu reads Standard; Deep,
  ask, remount, Auto.
* **R2-3 (MEDIUM, code review 4).** In the phone sheet `RoutineList` focuses its search field in a mount effect
  before `PopoutShell`'s own open effect runs, so the shell finds focus already inside the panel, records no
  opener and then focuses the panel: the field loses focus and Close hands focus to nothing. Fix: autofocus the
  field only in the pop-down form, or in the sheet focus it after the shell's effect (a `requestAnimationFrame`
  or a `setTimeout(0)` after mount), so the opener is recorded and focus returns to Add on Close.
* **R2-7 (MEDIUM, code review 8).** `uploadOne` adds the chip through `withAttachment`, which silently returns
  the same choices when five are attached, and then still runs `uploadFile`: a sixth file dropped before React
  re-rendered is hashed, stored and registered with no chip and no limit line. Fix: decide fullness against the
  choices the add returned (or make `withAttachment` report refusal) and skip `uploadFile`, saying
  `ATTACHMENTS_LIMIT_LINE`.
* **W-2 (walk).** The plus menu, the depth menu and the routine list open upwards (your default 18) because the
  composer sits at the foot of a thread; in the lobby it sits at the top, and the routine list's first rows and
  the menus' tops run past the window's top edge (clipped at 1280 by 900: "Quiz me" was above the viewport).
  Fix: open by the room there is, down when the control is in the upper half of the pane (or when the space
  below is the larger), up otherwise; measured at open time with `getBoundingClientRect` and `innerHeight`,
  nothing new in CSS beyond a second placement class. Test the rule as a pure function.
* **W-4 (walk, and the PM's reading of your default 2).** "Ask off" for an unmet routine need or an upload not
  yet indexed is `aria-disabled` with the look unchanged. Amendment (h) was about the button after a Stop, not
  about these; brief 111's Contract says "Ask off, one line" and check 4 "keeps Ask off". Fix: the button takes
  the disabled look (`disabled`, Phase 22's flat grey pill) while a need is unmet or an attached upload is not
  `indexed`; the line under the box stays and is still associated (`aria-describedby` may stay on the wrapper or
  the line may simply be visible); after a Stop and after an answer the button is enabled, as (h) says. Adjust
  `Composer.chips.test.tsx` accordingly.

### W-88 (thread, panel, layout), on `feat/workspace-page-24b-thread`

* **R2-2a (HIGH, code review 2).** Each new request changes the query keys of the options and the turn rows
  (the sorted ids are the key's suffix, ruling R2-1 of part 1) and neither query keeps its previous data, so on
  every ask `formats` collapses to empty and `turnRows` to undefined until the refetch lands: every earlier rich
  answer re-renders as plain text for a few hundred milliseconds (raw `##`, `**`, `|` visible), the fixed lines
  and `data-retrieval` blink off, and the Sources tab reads "Pick an answer". Fix at the query: `placeholderData:
  keepPreviousData` on `requestOptionsOptions` and `turnsOptions` (as `queries.search.ts` does), which the PM
  permits you to add inside `web/src/lib/queries.workspace-ask.ts` and `queries.workspace-sources.ts` with a
  case each in their tests; no frozen signature changes. Test on the screen: after a new request id arrives the
  rich answers stay formatted through the refetch.
* **R2-2b (MEDIUM, code review 3).** `markStopped` is dispatched at the press, before the cancel answers, and the
  reducer's `stopped` is terminal; when the cancel fails the turn and the button revert but the live text stays
  frozen while the runner keeps answering (your default 9). Fix: mark the stream only when `workspace_cancel`
  answers `true` (the page already shows the stopped sentence at the press through `stoppedRequestIds`); a
  failed cancel marks nothing. Test the two paths in `Workspace.failures.test.tsx`.
* **R2-4 (LOW, code review 5).** A failed read of `workspace_request_options` is said twice: folded into
  `readError` ("Could not load this conversation") above the column and worded again under the box by the
  composer. Fix: do not fold the options error (nor the turns error, if the thread words it elsewhere) into
  `readError`; the thread keeps the turn rows' problem line where the brief puts it, once.
* **R2-5 (MEDIUM, code review 6).** A chip's `ord` is discarded: `AnswerBody` calls `onCite(ord)` but the thread
  opens the Sources tab at the answer only, while the brief says a chip opens the panel at its row. Fix: carry
  the ord to `openSources(requestId, ord)`; the Sources tab scrolls that row into view and marks it (an
  `aria-current="true"` or a focused row with `data-source-ref`), the picked row cleared on the next pick.
* **R2-6 (MEDIUM, code review 7).** Removing `withoutBoldMarkers` drops Stack's ruling of 2026-10-07 for every
  answer that is not `rich`: a request with no options row (every conversation before 24b) and a `plain` one go
  through `plainBlocks`, which keeps `**…**` as literal asterisks on the page (W-3 comes back). Brief 111 said the
  helper goes; Stack's ruling outranks that line, so: keep a bold-pair strip for the plain path only (in
  `thread.ts`, before `plainBlocks`), with its test restored; rich answers are parsed as now. The PM amends the
  brief.
* **R2-8 (MEDIUM, code review 9).** Each finished turn issues its own `workspace_sources` select
  (`useWorkspaceSources(requestId)` inside `Answer`): a 40-turn conversation fires 40 reads on open, and a
  transient failure prints the sources problem line under every answer. Fix: one read for the conversation's
  requests, `sourcesForRequestsOptions(conversationId, requestIds)` keyed like `turnsOptions` (the sorted ids as
  the key's suffix, `keepPreviousData`), which the PM permits you to add to `queries.workspace-sources.ts` beside
  the frozen exports (an addition, nothing renamed) with its test and its normaliser; the turns take their rows
  by `request_id`; the panel keeps `sourcesOptions(requestId)` or reads the same map.
* **R2-9 (MEDIUM, code review 10).** `answerBlocks(turn.text, turn.format)` runs for every turn on every render
  of `Turns`, and `Turns` re-renders on each delta and each clock tick, so one flush re-parses the whole thread.
  Fix: memoise per turn (`useMemo` on `[text, format]` inside `Answer`, or `React.memo(Answer)`), so only the
  live turn pays. Test: a spy on the parser counts one call per changed text.
* **W-1 (walk).** The rail's button (`CONVERSATIONS_HEADING`, your default 13) shows at every width: at 1280 px
  it stands at the column's top beside the date line while the rail is visible on the left. `.railButton`
  composes `btnSecondary`, whose `display: inline-flex` wins over the module's `display: none` by stylesheet
  order in the built app. Fix: hide it through a wrapper that composes nothing (`.railSlot { display: none }`,
  shown at ≤720 px), or any rule the composition order cannot undo; `Workspace.layout.test.tsx` gains a case
  that reads the rule as written (the wrapper hidden above 720 px).
* **W-3 (walk; D-F ruled by the PM).** With the course rail open at 1280 px and the panel docked, the column
  measured 250 px; the date line wrapped and the thread was a narrow strip. The allowlist still refuses a
  container query, but your docked-or-sheet decision is already script (`usePanelIsSheet` over `matchMedia`), so
  decide by the pane: the panel docks when the content pane (`main`) is at least 1024 px wide (a
  `ResizeObserver` on the pane, `useSyncExternalStore`), else it is a sheet; the rail open at 1280 px then gives
  a sheet and at 1440 px and wider it docks. The 720 px rail rule stays `@media`. Test the decision as a pure
  function of the pane's width; `Workspace.layout.test.tsx`'s mounted cases pass a wide pane.
* **S-1 (LOW, security review).** In `SourcesTab.tsx` the tab an upload opens in is made with
  `window.open('about:blank', '_blank')` and keeps `window.opener`. Set `tab.opener = null` before assigning
  its address (and keep `noopener,noreferrer` on the fallback). The existing materials button is outside this
  phase and stays as it is.
* **Noted, no change asked:** code review 12 (two `matchMedia` stores: `usePanelIsSheet` and W-87's
  `usePhoneWidth`) is recorded; a shared `useMediaQuery` is a later cleanup across the two streams.

### PM

* Code review 13: `USED_PREFIX` and `COLUMN_START_LINE` in `workspace-labels.ts` are no screen's any more; the
  PM marks them retired in the file (kept, since the labels test pins every string and pack 21's playbook quotes
  the latter).
* The pack's helpers (`accept24.lib.ts`): the course chip is named `Course: All courses` and the depth button
  `Depth Auto`, so `pickCourse` and `pickDepth` match by prefix (done, 2026-10-15).
* Brief 111's Contract line "`withoutBoldMarkers` goes" is amended by R2-6: it goes for rich answers and stays
  for plain ones.

## Session prompt for the data layer, started early

Paste into a new Claude Code window started in `C:/Users/stack/projects/bb2dash`:

> /bb2dash-pm Start Phase 24b's data layer, early, beside Phase 24ab. Read `docs/planning/sprint-2/briefs/111_PHASE24B_workspace_page.md` in full on the branch `origin/feat/workspace-24` (24a's branch: `git show origin/feat/workspace-24:<path>` or the worktree `C:/Users/stack/projects/bb2dash-wt-24`, read-only; that worktree belongs to the Phase 24ab session and you write nothing there), its "Amendments after 24a, as built" and "The data layer, started early" first, and `118_PHASE24AB_walk_and_handover.md`'s "The end goal, and the road to it". Then the fixture folder `workspace/test/fixtures/contract24/` and its README, and the web app's `web/src/lib/queries.workspace.ts`, `use-workspace-stream.ts` and `workspace-labels.ts`. The brief is approved: give me the triage line and a short report, do not enter plan mode. Cut the phase branch `feat/workspace-page-24b` as the worktree `C:/Users/stack/projects/bb2dash-wt-24b` from `origin/feat/workspace-24`, and work there by full paths. Do task 3 (the wording), write "The data layer's frozen exports" into the brief, then cut W-86's worktree and spawn W-86 on Opus for tasks 4 to 6 as that section narrows them, with probe Q-4. Touch no file under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, no CSS module and neither layout check: Phase 22 is sweeping them. Nothing live, no PR. When 24ab pushes, merge `origin/feat/workspace-24` into the phase branch; once 24a/24ab is on `main`, merge `origin/main` instead. Stop when the data layer is on the phase branch and its gates are green, and tell me what the page's streams can start from.

## Session prompt for the page (final; Phase 24ab's task 12, 2026-10-14)

Paste into a new Claude Code window started in `C:/Users/stack/projects/bb2dash` once the gate is open:
Phase 22 on `main` (`dff1e05`, 2026-10-14), 24a and 24ab on `main` (the two PRs of `feat/workspace-24`
merged) and `just accept 24` green (the "Phase 24a accepted" row in DECISIONS). It may be the data layer's
session continuing: the branch and worktree already exist.

> `/bb2dash-pm` Start Phase 24b, the Workspace page. Work in the worktree `C:/Users/stack/projects/bb2dash-wt-24b` (branch `feat/workspace-page-24b`, which already holds the data layer and brief 111's "The data layer's frozen exports"), by full paths: a relative path from where you start lands in the shared checkout, which stays on `main`. Read `docs/planning/sprint-2/briefs/111_PHASE24B_workspace_page.md` in full there, its "Amendments after 24a, as built" first (my four answers and what 24a's walk showed are in it), then `118_PHASE24AB_walk_and_handover.md`'s "The end goal, and the road to it" and 109c's "Phase 24ab, the walk". The brief is approved: give me the triage line and a short report, do not enter plan mode. The first three things, in order: (1) check the gate: `git merge-base --is-ancestor dff1e05 origin/main` and the same for 24a's merge commit (STATUS "Phase 24a" names it) each print 0, and DECISIONS holds the "Phase 24a accepted" row; if any fails, stop and tell me. (2) Merge `origin/main` into `feat/workspace-page-24b` (a merge, never a rebase), keep both sets of rows in the state files, and re-run the data layer's gates (`cd web && npm run typecheck && npx eslint . --max-warnings 0 && npx vitest run`). (3) Re-read Phase 22 as merged (its tokens in `web/src/app/globals.css`, the class names, the two Workspace folders) and freeze the brief with that re-read, the walk's amendments and probes Q-1 to Q-5; then cut W-87 and W-88 on Opus from the frozen commit. Workers are Opus (my answer 1). Memory is switched on at this phase's cut-over (my answer 2), the compose value changed last, after the page is walked. Anything visual goes in front of me on a Vercel preview before the merge. Stop at "ready when you say so"; the merge, the cut-over that turns memory on, and `just accept 24` after it each wait for my word.
