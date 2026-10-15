# 111 W-87: the composer and the lobby of Phase 24b (tasks 7 and 8)

Worker W-87, Opus, branch `feat/workspace-page-24b-composer` (cut from `feat/workspace-page-24b` at the
freeze commit `ebb641e`), worktree `bb2dash-wt-24b-composer`. Built test first, red then green, one commit
per task, pushed after each; task 7 was pushed before task 8 began, for W-88 to wire the Thread. The
contract is brief 111's "Frozen at the gate", "The data layer's frozen exports" and the Contract, and
`composer-contract.ts` (ruling C-1): `Composer.tsx` takes exactly `ComposerProps` and `Lobby.tsx` exactly
`LobbyProps`; neither file adds a prop. Nothing live: no database, no Supabase request (every test fakes
the client), no dev server, no browser. No file of W-88's, no file under `web/src/lib/` but the labels
file below its heading, no `project-state/`.

## Commits

| commit | what |
|---|---|
| `3868f94` | task 7: `Composer.tsx` rewritten to `ComposerProps`; `PlusMenu`, `DepthMenu`, `CourseMenu`, `RoutineList`, `MaterialPicker`, `Chip`, `ComposerParts` and their modules (`Menu.module.css` shared by the three menus); the hooks `use-composer.ts`, `use-composer-model.ts`, `use-composer-uploads.ts`, `menu-keys.ts`, `use-phone-width.ts`, `routine-request.ts`; the pure rules `composer-choices.ts`; `Composer.chips.test.tsx`, `Composer.uploads.test.tsx` and the test fake `composer-fake.tsx`; the two W-87 label additions |
| (the last commit) | task 8: `Lobby.tsx`, `ExamplePrompts.tsx`, `LobbyRecent.tsx` and their modules; `Workspace.lobby.test.tsx`; `Workspace.empty.test.tsx` rewritten; this file |

## Task 7: the composer

Red (the two test files written first, against Phase 21's composer):

    $ npx vitest run test/Composer.chips.test.tsx test/Composer.uploads.test.tsx
    Test Files  2 failed (2)
         Tests  33 failed (33)          (7 errors: the old component took none of ComposerProps)

Green (same command; two cases were added after the first green, the routine list at the phone step and
its arrow keys):

    Test Files  2 passed (2)
         Tests  35 passed (35)

The brief's task 7 check, case by case (`Composer.chips.test.tsx` unless named):

| check | test |
|---|---|
| Ask sends the options: the `workspace_ask_with` payload holds the six keys | "calls workspace_ask_with with the six keys of the chosen options, then hands the result to onAsked" (`{course, depth, routine, format: 'rich', files, uploads}`, exact) |
| Deep returns to Auto after one question; Quick stays | "applies Deep to one question, then reads Auto again; Quick stays" (`data-depth`) |
| a file routine with no file keeps Ask off and shows its line | "needing a file keeps Ask off and says why, until a file is attached" (no RPC on click or Enter; `aria-disabled="true"`; the line goes once a file is attached and the ask carries `routine` and `files`) |
| Backspace in an empty box removes the last chip | "removes the last chip, one per press, and leaves typed text alone" |
| a refusal shows under the box | "shows the sentence for 23505 / 23514 / 42501 under the box and keeps the text"; "refuses an empty question before any request, and the line goes once the text changes" |
| an error that is not a refusal reaches onAskError | "hands an error that is not a refusal to onAskError and keeps the text" |
| the button is enabled when busy is false and no ask is pending (h) | "is enabled while nothing is on its way, and disabled only by busy, a pending ask or a missing conversation" |

Around them: Enter, Shift+Enter, Enter while a request is open and Stop; the restored course and routine
(never the depth) and `optionsProblemLine`; the course menu's order and "All courses"; the depth menu's
four entries and notes, its arrows, Home, End and Esc with focus handed back; the routine list's groups,
search, no-match line, problem line, phone sheet and arrow keys; the sixth attachment refused with
`ATTACHMENTS_LIMIT_LINE`; `initialText` filling the box once. In `Composer.uploads.test.tsx` (`uploadFile`
and `retryUploadLink` stubbed, their own flow being W-86's): the file input's `accept` list equals
`WORKSPACE_UPLOAD_TYPES`; the menu entry opens the input and focus returns to Add; a refused upload says
its sentence; the chosen course reaches `uploadFile`; a registered upload's chip follows its row
(`data-upload-state`, the state's words) and keeps Ask off with `UPLOAD_NOT_READY_LINE` until indexed,
then the ask carries `uploads: [id]`; an existing failed row shows Try again, which calls
`retryUploadLink` with the row; a thrown error is worded by `uploadProblemLine`; a dropped file takes the
same flow; the material picker's loading line, groups by course code, filter, no-match line, no-files
line, problem line, and Esc handing focus back to Add.

## Task 8: the lobby

Red (both files written first; `Lobby.tsx` did not exist):

    $ npx vitest run test/Workspace.lobby.test.tsx test/Workspace.empty.test.tsx
    Test Files  2 failed (2)
         Tests  no tests            (Failed to resolve import "@/components/workspace/Lobby")

Green (same command):

    Test Files  2 passed (2)
         Tests  15 passed (15)

| check | test (`Workspace.lobby.test.tsx`) |
|---|---|
| no upcoming rows, no example row at all | "are absent, heading and all, when no upcoming row exists" |
| a press on an example fills the box and calls no rpc | "name real items by title and date; a press fills the box and calls no rpc" |
| the greeting holds no name | "says the greeting line and holds no name: the lobby reads no profile" (the `h2` is `GREETING_LINE` exactly; `workspace_profile` is never read) |
| the routines render from the rows | "render from the rows as shortcuts, and a press sets the composer's routine chip and sends nothing" |
| Recent shows the rows and View all expands them | "shows the five newest as links, and View all expands the block to every one in place" (hrefs from `conversationHref`, `relativeTime`) |

Around them: the refresh steps through the candidates; no View all at five or fewer and
`NO_CONVERSATIONS_LINE` with none; each block's problem line (routines, upcoming work, conversations); a
first question hands its id to `onCreated`; a failure is said above the composer with `askProblemLine` and
goes when the text changes; while the reads are held no row, no empty line and no spinner shows.

`Workspace.empty.test.tsx` is **rewritten, not deleted**: it pinned the start line of the empty column,
which the lobby replaces, and now pins the lobby with no rows anywhere (the greeting, an empty composer
with its placeholder and Ask enabled, the no-conversations line, no routine, example or link invented, no
`data-column-empty`) and the server render (greeting, placeholder and `data-lobby` drawn; a warmed
cache's conversation and routine not drawn before hydration). Its old thread cases (the `loading` and
`missing` columns, the not-found line and link, the 23503 case, the composer on an id that was not found)
are the thread's and go to W-88's screen tests; the composer's own `disabled` case is in
`Composer.chips.test.tsx`.

## Defaults I took (nobody answers mid-run)

1. **No compatibility shim for Workspace.tsx (ruling C-1).** `Composer.tsx` takes exactly
   `ComposerProps`. `Workspace.tsx` (W-88's, untouched) still passes Phase 21's props (`refusal`,
   `onAsk`), so on this branch alone `npm run typecheck` reports one error, `Workspace.tsx:269`, and the
   screen tests that mount `Workspace` fail (the counts are under The gates). A union prop type would have
   kept them green but broken "exactly ComposerProps" and left dead code in my file; W-88's Thread wires
   the new props when it merges this branch, which closes both.
2. **"Ask off" means Ask sends nothing, not `disabled`.** Amendment (h) and the task say the button is
   disabled only by `busy`, a pending ask or `disabled`, and nothing else dims it. A routine's unmet need
   or an upload not yet indexed makes a press and Enter send nothing, marks the button
   `aria-disabled="true"` with `aria-describedby` on the line under the box, and leaves its look alone.
3. **L-1.** View all expands the Recent block in place to every conversation that is not archived, then
   goes (the labels hold no "fewer" word); it shows only when there are more than five.
4. **L-2.** The lobby's shortcuts reach the composer's routine chip through `routine-request.ts`: the lobby
   provides `{ routineId, seq }` in a context and the composer applies each new `seq` with the same update
   its own routine list makes. No prop was added to `ComposerProps`.
5. **A test fake of my own.** `workspace-harness.tsx` is W-88's and its table fake has no `.in()`, `.gte()`
   or `.lte()`, which the composer's and the lobby's reads use. `web/test/composer-fake.tsx` (a helper, not
   a test) fakes the Supabase browser client the same way, test-locally, through `vi.mock` in each file.
6. **The routine list is a pop-down on a wide screen and a `PopoutShell` sheet at 720 px and under**,
   decided by `use-phone-width.ts` (`matchMedia('(max-width: 720px)')`, false on the server, during
   hydration and in jsdom). The menus stay pop-downs; the material picker is a `PopoutShell` dialog at
   every width.
7. **The material picker closes on each pick** (one file a press); an attached file shows pressed and
   disabled; a row with no `course_id` is left out (the picker lists by course). A sixth pick closes the
   picker and says the limit line under the box; the picker also says it while five are attached.
8. **An upload chip on its way** reads `UPLOADING_LABEL` and carries no `data-upload-state` (there is no
   row state yet). Its title is `uploadTitleOf(file.name)` until the row's title is read.
9. **Every attached upload that is not `indexed` keeps Ask off** with `UPLOAD_NOT_READY_LINE`, a `failed`
   one included (its chip says Failed and offers Try again). A `deleting` row's chip offers Remove only:
   `retryUploadLink` takes a failed row alone, and finishing a delete is the Files tab's.
10. **Which refusal goes when.** "Still answering" goes when `requestOpen` turns false; every other
    refusal and the upload problem go when the text changes; the limit line goes on the next pick, removal
    or ask.
11. **Another conversation starts from no chips** (course, routine, attachments), keeping the depth; then
    its last options row restores its own course and routine. Restoring waits for `useHydrated()`.
12. **A routine the rows no longer hold** is sent as none and shows no chip (once the routines are read).
13. **`initialText` follows its value**: pressing the same example twice does not refill the box after he
    edits it, because `ComposerProps.initialText` is a string compared by value.
14. **The composer does not dock itself.** The sticky foot at 720 px and under (amendment (f)) belongs to
    the thread's wrapper in `Workspace.module.css` (W-88's), so the lobby's composer stays in flow.
15. **One new data attribute for a test:** `data-drop-target` on the composer's root, which
    `Composer.uploads.test.tsx` uses to find the drop target. Every other one is "Data attributes, final":
    `data-chip` (course, routine, file, upload), `data-upload-state`, `data-depth`, `data-lobby`.
16. **The file input's `accept`** lists the six extensions of `WORKSPACE_UPLOAD_TYPES` (`.pdf,.docx,…`),
    not their MIME types, because a browser may report none for Markdown.
17. **The upload is tagged with the course chip's id** (`uploadFile(file, options.course)`, as the task
    says): a `v_course_display.display_id`.
18. **The menus open upwards**, as the composer sits at the foot of the column; the depth menu is anchored
    to the right edge beside Ask.
19. **Helper files share modules:** `ComposerParts.tsx` uses `Composer.module.css`; `Menu.module.css` is the
    panel and entries of the plus, course and depth menus, each of which also has its own module. The hook
    and rule files (`*.ts`) have none.
20. **Loading states render nothing** (Recent keeps its heading alone): no spinner and no loading line, as
    the app's lobby blocks have no loading words in the labels. The routines block and the example block
    are absent when they have no row.
21. **ExamplePrompts waits for both reads** (upcoming work, courses); a failed course read falls back to the
    course ids in the prompts. The window is today to today + `EXAMPLE_WINDOW_DAYS`, New York dates from
    `courseToday(new Date(now))`.
22. **No token was needed.** Every size is an existing token (`--size-44` on a phone, `--size-target`
    elsewhere, `--size-220/320/420` for panel widths); no colour is red (`--color-accent-500` appears in none
    of my files).

## Strings added to the labels files

Under "W-87 additions (for the PM to accept)" at the end of `workspace-labels.ts` and of
`workspace-labels.test.ts`, and sampled in `builtStrings()` (the one line above the heading that changed,
as the rule asks):

* `coursesProblemLine(reason)` → `Could not load your courses: <reason>` (the course menu's failed read of
  `v_course_display`).
* `examplesProblemLine(reason)` → `Could not load your upcoming work: <reason>` (the lobby's failed read of
  `v_work_items`).

## The gates

From `web/`, on the last commit:

    $ npx eslint . --max-warnings 0          exit 0 (clean)

    $ npm run typecheck                      exit 1: one error, and it is default 1's
    src/app/(app)/workspace/Workspace.tsx(269,9): error TS2322: Type '{ requestOpen: boolean; busy: boolean;
      disabled: boolean; refusal: string | null; onAsk: ...; onStop: ...; onEdit: ... }' is not assignable
      to type 'IntrinsicAttributes & ComposerProps'. Property 'refusal' does not exist on type ...

    $ npx vitest run test/token-audit.test.ts test/raw-html.audit.test.ts test/audits.test.ts \
        test/status-vocabulary.test.ts test/workspace-labels.test.ts
    Test Files  5 passed (5)
         Tests  181 passed (181)

    $ npx vitest run
    Test Files  6 failed | 199 passed (205)
         Tests  101 failed | 3672 passed (3773)

The count is 3,773, not below 3,741. The 101 failures, file by file:

| file | failed | why |
|---|---|---|
| `Workspace.layout.test.tsx` | 2 of 4 | "the list here is the folder": **the one expected failure** named at the cut (the folder holds new modules until W-88's rewrite reads them by glob); "leaves no screen-reader label of a conversation outside the column that scrolls it": it mounts `Workspace`, as below |
| `Workspace.test.tsx` | 40 of 40 | mounts `Workspace`, which passes the Phase 21 props (default 1) |
| `Workspace.failures.test.tsx` | 23 of 31 | the same |
| `use-workspace-stream.screen.test.tsx` | 19 of 19 | the same (it mounts the screen) |
| `Workspace.rereads.test.tsx` | 10 of 10 | the same |
| `Workspace.service.test.tsx` | 7 of 7 | the same |

Every one of the 100 that mount the screen fails the same way: `Workspace.tsx` hands the composer no
`requestIds`, so `useWorkspaceRequestOptions` throws `TypeError: ids is not iterable`
(`queries.workspace-ask.ts:264`, from `use-composer.ts:55`). They are W-88's files (and the stream's screen
test, which W-88's Thread changes), and they close when W-88's Thread passes `ComposerProps`; none of them
is edited here. Every test file of mine passes, and every other file of the suite passes.

From the worktree root:

    $ git diff --name-only feat/workspace-page-24b...HEAD
    docs/planning/sprint-2/verification/111_W87_VERIFICATION.md
    web/src/components/workspace/Chip.module.css
    web/src/components/workspace/Chip.tsx
    web/src/components/workspace/Composer.module.css
    web/src/components/workspace/Composer.tsx
    web/src/components/workspace/ComposerParts.tsx
    web/src/components/workspace/CourseMenu.module.css
    web/src/components/workspace/CourseMenu.tsx
    web/src/components/workspace/DepthMenu.module.css
    web/src/components/workspace/DepthMenu.tsx
    web/src/components/workspace/ExamplePrompts.module.css
    web/src/components/workspace/ExamplePrompts.tsx
    web/src/components/workspace/Lobby.module.css
    web/src/components/workspace/Lobby.tsx
    web/src/components/workspace/LobbyRecent.module.css
    web/src/components/workspace/LobbyRecent.tsx
    web/src/components/workspace/MaterialPicker.module.css
    web/src/components/workspace/MaterialPicker.tsx
    web/src/components/workspace/Menu.module.css
    web/src/components/workspace/PlusMenu.module.css
    web/src/components/workspace/PlusMenu.tsx
    web/src/components/workspace/RoutineList.module.css
    web/src/components/workspace/RoutineList.tsx
    web/src/components/workspace/composer-choices.ts
    web/src/components/workspace/menu-keys.ts
    web/src/components/workspace/routine-request.ts
    web/src/components/workspace/use-composer-model.ts
    web/src/components/workspace/use-composer-uploads.ts
    web/src/components/workspace/use-composer.ts
    web/src/components/workspace/use-phone-width.ts
    web/src/lib/workspace-labels.ts
    web/test/Composer.chips.test.tsx
    web/test/Composer.uploads.test.tsx
    web/test/Workspace.empty.test.tsx
    web/test/Workspace.lobby.test.tsx
    web/test/composer-fake.tsx
    web/test/workspace-labels.test.ts

Only my files and this record. `composer-contract.ts`, every file of W-88's, `web/src/lib/` but the labels
file (below its heading, and the one `builtStrings()` line the rule asks for), `web/e2e/`, `acceptance/`,
`compose.yaml`, `package.json`, `package-lock.json` and `project-state/` are unchanged. No new dependency.

The code rules, checked: every function of mine is under 50 lines (the longest, `useComposerModel` and
`PlusMenu`, 48); the largest file is `use-composer-model.ts` at 192 lines; no `dangerouslySetInnerHTML`,
`innerHTML`, `insertAdjacentHTML`, `console.*`, `fetch`, `window.open` or storage access in my files; every
scrolling class (`Menu.module.css .list`, `RoutineList.module.css .scroll`, `MaterialPicker.module.css
.scroll`) is `position: relative`; the `@media` widths are 720px only.

**For the PM, at integration.** When W-88's Thread renders `<Composer>` with `ComposerProps` and the page
renders `<Lobby>`, the 100 screen failures should close; W-88's layout rewrite closes the expected one.
The lobby mounted inside the page is not tested here (the page is W-88's); `Workspace.lobby.test.tsx`
mounts `Lobby` alone.
