# 111 W-88: the thread, the answer body, the side panel and the layout of Phase 24b (tasks 9, 10 and 11)

Worker W-88, Opus, branch `feat/workspace-page-24b-thread` (cut from `feat/workspace-page-24b` at the
frozen commit `ebb641e`), worktree `bb2dash-wt-24b-thread`. Built against brief 111's "Frozen at the
gate", "The data layer's frozen exports" and `composer-contract.ts` (ruling C-1). Committed and pushed
after each step; never rebased or force-pushed. Nothing live: no database, no Supabase request (every
test runs over `workspace-harness.tsx`'s fake client), no dev server; the one browser run is the static
layout spec. No file under `web/src/lib/` but the labels file (under its W-88 heading), no file of
W-87's, nothing under `project-state/`, `acceptance/` or `compose.yaml`.

## Commits

| commit | what |
|---|---|
| `98293df` | task 9, part 1: `thread.ts` (the turn row, the format, the searching line, the fixed line, `emptyColumnOf` less `start`; `withoutBoldMarkers` and `usedLine` gone), `AnswerBody.tsx` and module, `MessageList.tsx` (the sources row in place of `Used:`), `route.ts` (`?panel=`); `Workspace.thread.test.ts`, `AnswerBody.test.tsx` |
| `bef8ffe` | task 10, part 1: `SidePanel.tsx`, `SourcesTab.tsx`, `FilesTab.tsx`, `MemoryTab.tsx`, `SidePanel.module.css`; `SidePanel.test.tsx`; the harness's 24b fakes; `openProblemLine` under the W-88 heading |
| `5bf3f63` | tasks 9 and 10 wired: `Workspace.tsx` (lobby or thread, the date line, the panel docked or a sheet, the rail sheet), `ThreadView.tsx` and module (the thread, moved out), the red bar on the picked conversation; `Workspace.sources.test.tsx` and the screen suites moved to the stand-in composer |
| `5ceb60b` | task 11: `Workspace.layout.test.tsx` and `e2e/workspace-layout.spec.ts` rewritten; the screen's column is `.pageColumn` |
| `d495f32` | merge of `origin/feat/workspace-page-24b-composer` (W-87's `3868f94` and `0e5ece0`) |
| `a54e652` | 44 px press areas under 720 px; the thread's empty-column cases W-87 handed over |
| `ed85d82` | the layout check mounts W-87's real lobby and composer; the harness's reads gain `.neq/.is/.gte/.lte/.gt/.lt` |
| (the last commit) | this record |

## Task 9: the thread

Red, before `thread.ts` changed (the new cases written first):

    $ npx vitest run test/Workspace.thread.test.ts
    Test Files  1 failed (1)
         Tests  17 failed | 40 passed (57)

    $ npx vitest run test/AnswerBody.test.tsx
    Test Files  1 failed (1)
         Tests  no tests            (Failed to resolve import "@/components/workspace/AnswerBody")

Green: `Workspace.thread.test.ts` 57 passed (58 after the begun-row case of default 8); `AnswerBody.test.tsx`
12 passed (the `fast-check` property: 150 runs of generated text mixed with hostile fragments, no `img`,
`a`, `iframe`, `script`, `style`, `object`, `embed`, `link`, `form` or `input` and no `href`, `src`,
`srcset`, `style`, `onerror` or `onclick`; a link form and an image form as text; raw HTML as text; h2 to
h4; nested lists; the table in its `data-table-box`; `pre > code` with `data-language`; strong, em, inline
code, quote; chips only for a resolved label; a label in code stays text).

The deterministic check, `Workspace.sources.test.tsx`, was written after the wiring. Run against the
screen before the wiring (`Workspace.tsx` of `bef8ffe`, restored after the run):

    $ npx vitest run test/Workspace.sources.test.tsx
    Test Files  1 failed (1)
         Tests  13 failed | 4 passed (17)

Green, with the wiring:

    $ cd web && npx vitest run test/Workspace.sources.test.tsx
    Test Files  1 passed (1)
         Tests  17 passed (17)

It holds: a chip is a button and never a link, and a press opens `?panel=sources` with the row listed; a
label with no source row stays text; the sources row counts the rows and is absent with none; a `rich`
answer is formatted, a `plain` one and one with no options row are plain text; `empty` and `failed` show
their fixed line, not twice when the answer opens with it (R-1); `attached_only` and `found` show none,
`data-retrieval` set either way; the searching line for claimed with no sources and no text, gone on the
sources event and on the first delta; a delta after Stop changes nothing; the date line on both screens.
The (h) case is in `Workspace.failures.test.tsx` ("the composer after a Stop (amendment (h))"): Stop, the
cancel settles, a second question is asked and its row stored, and the composer receives `busy: false`,
`requestOpen: false`, `disabled: false`; its stand-in's Ask is enabled with no `aria-busy`. A second case
holds `busy` false after a cancel that failed.

## Task 10: the side panel

The four panel files were written before their test (a deviation from test first, said here). The first
run of the component cases:

    $ npx vitest run test/SidePanel.test.tsx
    Test Files  1 failed (1)
         Tests  2 failed | 30 passed (32)     (a fixture whose title was the kind's own label, "Planner")

Green, with the four cases on the mounted screen (the fold, a tab through the route, the sheet under
1024 px closed by Esc, Close and the scrim, the panel in the lobby):

    $ cd web && npx vitest run test/SidePanel.test.tsx
    Test Files  1 passed (1)
         Tests  36 passed (36)

It holds every row of the Contract's table for the three tabs: Sources (no answer picked, loading, rows
cited first with kind, course, location and origin, nothing matched, the read failed, Open for a course
file, an upload through a signed link in a tab opened inside the press, a remembered item, the planner
link, an upload's link that failed); Files (no uploads, each state in words with `data-upload-state`, a
failure's reason with Try again that signs and retries, `deleting` read "Removing" with Try again that runs
the delete again, Delete in two presses with the note under it, a failed removal left "Removing" with its
reason, the filter narrowing with no read and no call, none matching, the uploads' and the index status's
failed reads, the index lines from the row with "last indexed 1 hr ago"); Memory (About me shown, edited,
saved with "Saved.", empty with its placeholder, Cancel, the 2000-character limit sending nothing, a
failed save keeping the text; the items newest first with state, summary and when; Delete in two presses;
a failed delete; the filter; nothing remembered; a failed read). The fold removes `panel` and the same
Show panel button brings the same tab back.

## Task 11: layout and phone

`Workspace.layout.test.tsx` was rewritten and green on its first run (7 passed). To show it bites, a
scratch edit took `position: relative` off `.tableBox` (then `git checkout`):

    $ npx vitest run test/Workspace.layout.test.tsx
    Test Files  1 failed (1)
         Tests  2 failed | 5 passed (7)

Green:

    $ cd web && npx vitest run test/Workspace.layout.test.tsx
    Test Files  1 passed (1)
         Tests  7 passed (7)

It reads the folder's sheets by `import.meta.glob('../src/components/workspace/*.module.css', { eager:
true })` with `Workspace.module.css` and `globals.css`, holds the glob equal to `readdirSync`'s listing,
holds every box that scrolls positioned (the column, `.tableBox`, `.code`), the dock sticky at the bottom on
`--color-bg`, the only `@media` widths 1023.98 px and 720 px in my sheets, and mounts the screen twice:
the real lobby (W-87's, merged) and a thread with the panel open, a wide table and a chip in it.

The Playwright spec, five cases, green; a scratch edit (`.dock` static, `.tableBox` without
`overflow-x`) failed the two new ones (2 failed, 3 passed), then `git checkout`:

    $ cd web && npx playwright test -c e2e/playwright.config.ts workspace-layout
      5 passed (4.2s)

The cases: the document no taller than its window; each label's offset parent is the column; the sources
row is the column's and scrolls with it; at 390 px the dock's bottom edge sits at the pane's bottom at the
top, after the column is scrolled and after the pane is scrolled, with the page no wider than 390; at 390
px a wide table's box has `scrollWidth > clientWidth`, `position: relative`, `overflow-x: auto`, and the
document's `scrollWidth` is at most 390. The walk box (`scripts/walk-box.mjs`) is the PM's at integration.

## Defaults I took

1. **R-1.** The page's fixed line shows under an `empty` or `failed` answer only when the answer's first
   non-empty line is not already that sentence, and only once the turn is no longer queued or streaming
   (so it does not flicker in before the runner's first line). `data-retrieval` is on the turn either way.
2. **R-2.** With nothing picked the Sources tab lists the newest request whose turn row is known
   (`newestKnownRequestOf`); a chip or a sources row picks; the pick goes when the conversation changes.
3. **R-3.** `useFileRoutes(fileId)` inside `SourcesTab.tsx` finds the row of `useCurrentFiles()`; Open is
   `FileOpenAction` with `btnSecondary` and `OPEN_SOURCE_LABEL`, shown once the row is found, nothing while
   the files are read. The row names the page ("slide 3"); Q-2 is the PM's at the walk.
4. **R-4.** An upload opens the way `OpenStoredButton` opens a stored course file: `window.open('about:blank')`
   inside the press, then `tab.location.href = await createSignedUploadUrl(storage_key)`, the blank tab
   closed on a failure, said with `openProblemLine`. The key comes from `useWorkspaceUploads()` by id.
5. **R-5.** "Course files last indexed" takes `relativeTime(course_last_embedded, now)`; no row value, no
   date (`NEVER_INDEXED_LINE` through `indexStatusLines`).
6. **R-6.** A turn's source rows are read once it is done, failed or stopped; chips resolve then.
7. **`Thread.tsx` is `ThreadView.tsx`.** Beside the pure `thread.ts`, `@/components/workspace/Thread`
   resolves to `thread.ts` on a disk that ignores case (tsc: TS1149 and "no exported member 'Thread'").
   The component file is `ThreadView.tsx` (and `ThreadView.module.css`) and exports `Thread`.
8. **Searching ends on any sign the search is over:** the `sources` event, the turn row, or the begun
   assistant row (`workspace_begin()` comes after the search). A claimed request with a begun row and no
   text reads "Answering…", as before; this keeps W-86's `use-workspace-stream.screen.test.tsx` green.
9. **Stop marks the stream at the press** (`markStopped`), before the cancel answers. If the cancel then
   fails, the turn reads open again and Stop comes back, but its live text no longer moves (the guard is
   one-way); the stored row still lands at `done`.
10. **A failed read of the turn rows or the options rows** is said with `conversationProblemLine`; the
    format falls back to plain meanwhile. No new string.
11. **Docked or a sheet** is decided by `matchMedia('(max-width: 1023.98px)')` through
    `useSyncExternalStore` (the server and jsdom read wide, so the server's render is docked); the grid's
    third track is set by a `data-panel-docked` attribute, since an `@media (min-width: 1024px)` is not on
    the audit's frozen list.
12. **`PopoutShell` is not edited.** The sheets' look (the panel from the right, the rail from the
    reading edge, full height, `min(100%, var(--size-panel-max))`, square) is set by structure in my
    modules (`.sheet > div > [role='dialog']`).
13. **The rail's sheet** closes on any route change (a conversation picked), on Esc, its Close or the
    scrim. Its button reads `CONVERSATIONS_HEADING` and shows only under 720 px.
14. **Show panel** brings back the last tab of this visit (Sources on a first visit or after a reload).
    The panel may be open in the lobby; its Sources tab then says `NO_ANSWER_PICKED_LINE`.
15. **The stream area wraps the column's content** (the lobby or the thread), so the lobby carries
    `data-workspace-stream` and `data-topic="workspace:lobby"`; its `data-request-id` is the open request
    unless the stream was marked stopped.
16. **A chip shows its number** (`ord`), named `sourceChipLabel(ord)`; the answer body's text therefore
    holds the number in place of the token. A paragraph's trailing space is not kept (the parser trims a
    paragraph), so `Workspace.rereads.test.tsx` now reads "Week one:" for a live "Week one: ".
17. **Phone press areas:** 44 px (`--size-44`) under 720 px for the sources row, the tabs, Hide and Show
    panel, the rows' buttons, the rail's button; a chip keeps its size in the line and presses through a
    centred 44 px box.
18. **Cut, by the brief's order:** an upload's title edit and course tag (`setUploadTitle`,
    `setUploadCourse`) are not built. The filter fields are built.
19. **The Files tab's "uploading" state** of the Contract's table is the composer's chip before a row
    exists (W-87's default 8); the tab lists rows only.
20. **Class names apart for the static spec:** the screen's column is `.pageColumn` and its panel track
    `.panelTrack`, so the spec can set `Workspace.module.css` beside `MessageList.module.css`'s `.column` as
    written.
21. **The screen suites stand the composer and the lobby in** (`composerMock()`, `lobbyMock()` in the
    harness, built to `composer-contract.ts`, asking through the frozen `askWorkspaceWith`): the composer's
    own keys, refusals and waiting state are W-87's tests, and the Phase 21 composer cases of
    `Workspace.test.tsx` and `Workspace.failures.test.tsx` that pinned them were dropped (Enter and
    Shift+Enter, the empty-question refusal, "still answering" and its lapse, the held Enter). The layout
    check mounts W-87's real lobby and composer.
22. **No token was needed.** The note under Delete is capped at `--size-280`; nothing else wanted a size
    the tokens lack.

## Strings added

Under "W-88 additions (for the PM to accept)" at the end of `workspace-labels.ts` and of its test, after
W-87's section: `openProblemLine(reason)` → "Could not open this file: <reason>" (Open on a source row
whose signed link could not be made). It joins `builtStrings()`, one line, after W-87's two.

## The W-87 merge

`origin/feat/workspace-page-24b-composer` was merged at `d495f32` (W-87's `3868f94`, task 7, and `0e5ece0`,
task 8). The only conflicts were the two labels files' appended sections; both kept, W-87's first. Before
the merge, with the wiring in place, `npm run typecheck` reported the render-site errors the cut expected:
`ThreadView.tsx(175,11): TS2322` (Phase 21's `ComposerProps` has no `conversationId`) and `ThreadView.tsx(180,21):
TS7006`, and `Workspace.tsx: TS2307 Cannot find module '@/components/workspace/Lobby'` (an untracked local
stub stood in for the run of the tests and was deleted, never committed). After the merge none is left.
Vitest cannot mock a module whose file does not exist (Vite's import analysis fails first), which the
cut's plan assumed; it did not matter, since W-87 pushed before the record.

## The gates

From `web/`:

    $ npm run typecheck                                    clean
    $ npx eslint . --max-warnings 0                        clean
    $ npx vitest run                                       Test Files 208 passed (208); Tests 3834 passed (3834)
    $ npx vitest run test/token-audit.test.ts test/raw-html.audit.test.ts test/audits.test.ts test/status-vocabulary.test.ts
                                                           Test Files 4 passed (4); Tests 107 passed (107)
    $ npx playwright test -c e2e/playwright.config.ts workspace-layout
                                                           5 passed, exit 0

The token audit reads 0 for every file of mine (`screens-b`, no baseline entry). `git grep -l
"var(--color-accent-500)" -- web/src` lists eleven files: Phase 22's nine, `SidePanel.module.css` (the
picked tab's underline) and `ConversationList.module.css` (the picked conversation's bar). No
`dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or `console.*` in my files.

From the repo root, `git diff --name-only feat/workspace-page-24b...HEAD` lists my files, this record,
W-87's files and record (from the merge), and the two labels files (both workers' sections).

**For the PM at integration.** Nothing of mine is left open. W-87's Composer, Lobby and the stream's
screen test all pass with the wiring (the 100 screen failures W-87 recorded are closed). The walk box of
the layout spec, Q-2 (whether an opened PDF lands on the page), and the column's width at 1280 px with the
course rail open (D-F) are the PM's at the walk.

## Round 2

The items of brief 111's "Round 2" under "W-88", on the same branch, from `de4a194`; the phase branch's
own round-2 docs were not merged in (none of my files moved there). One commit per item, pushed after
each. Each red below is the new case run before the fix; each green is the same file after it.

| item | commit | red | green |
|---|---|---|---|
| R2-2a: the options and turn rows keep their previous rows | `5af7ad6` | `queries.workspace-ask`, `queries.workspace-sources`, `Workspace.sources`: 3 failed, 66 passed (69) | 69 passed (69) |
| R2-2b: the stream is marked stopped only on a cancel that answers true | `5586582` | `Workspace.failures` + `Workspace.sources`: 2 failed, 47 passed (49) | 96 passed over four screen files |
| R2-4: a failed options read is not said twice | `9af5e99` | `Workspace.failures`: 1 failed, 32 passed (33) | 33 passed (33) |
| R2-5: a chip opens the Sources tab at its row | `44ea332` | `Workspace.sources -t R2-5`: 1 failed ("no row 2 yet") | 95 passed over four files |
| R2-6: a plain answer loses its bold pairs (Stack, 2026-10-07) | `83ec8f7` | `Workspace.thread`: 15 failed, 59 passed (74) | 159 passed over five files |
| R2-8: one `workspace_sources` read for the conversation | `60b9157` | `queries.workspace-sources` + `Workspace.sources`: 5 failed, 35 passed (40) | 153 passed over six files |
| R2-9: each answer parsed when its text or format changes | `861dea4` | `Workspace.sources -t R2-9`: 1 failed (the finished "# One" re-parsed) | 55 passed over two files |
| W-1: the rail's button hidden above 720 px through a slot | `8ada26e` | `Workspace.layout`: 2 failed, 6 passed (8) | 97 passed with the token audit |
| W-3: the panel docks by the content pane's width | `110ba68` | `SidePanel`: 2 failed, 44 passed (46) over it and `Workspace.layout` | 124 passed over five files |
| S-1: the upload's tab loses its opener first | `4f1aeb2` | `SidePanel`: 1 failed, 39 passed (40) | 40 passed (40) |

What each holds:

* **R2-2a.** `placeholderData: keepPreviousData` on `requestOptionsOptions` and `turnsOptions` (the PM's
  permission; one case each in their tests). The screen case holds the options and turn reads of the new
  id list open while a question is asked: the earlier rich answer keeps its `h2`, no `**`, its
  `data-retrieval` and its fixed line. **Default R2-a:** the screen keeps only the rows of the
  conversation's own requests (`ofRequests` in `Workspace.tsx`), because a disabled read (the lobby) or a
  read held across a change of conversation also keeps the last rows; the harness gained per-table read
  gates (`fake.state.tableGates`).
* **R2-2b.** `markStopped` is called in the cancel's `onSuccess` when it answers true. Three cases in
  `Workspace.failures.test.tsx`: true (a later delta changes nothing), a failed cancel and a cancel that
  answers false (the later delta arrives). `Workspace.sources.test.tsx`'s Stop case now emits its delta
  after the cancel has answered. This retires my round-1 default 9.
* **R2-4.** `readError` holds the requests', the messages' and the turn rows' failures; the options rows'
  is the composer's alone. A turn rows' failure is still said once, above the column.
* **R2-5.** `onOpenSources(requestId, ord)`: a chip passes its ord, the sources row passes null (the
  answer picked as a whole, the mark cleared). The Sources tab's row carries `data-source-ref`,
  `aria-current="true"` and the active fill (never red), and is scrolled into view (`block: 'nearest'`).
* **R2-6.** `withoutBoldMarkers` is back in `thread.ts` with its eleven-case test, and `answerBlocks` runs
  it before `plainBlocks` for `plain` and for a request with no options row; `rich` is parsed as before.
  `Workspace.sources`' plain case now reads "# Plan Quiz 2 on Friday".
* **R2-8.** Added to `queries.workspace-sources.ts` beside the frozen exports: `sourcesForRequestsOptions`,
  `useWorkspaceSourcesFor`, `sourcesByRequest`. **Default R2-b:** the key is
  `[...workspaceSourceKeys.turns(c), 'sources', sortedIds]`, under the turns' prefix, so the stream's
  existing invalidation of a conversation's turns (on `sources` and `done`) reaches it and
  `invalidateWorkspaceProvenance` and its pinned keys stay as they are; it keeps its previous rows; 40 rows
  a request at most. The thread says a failed read once (`sourcesProblemLine`, above the column); the
  panel keeps `sourcesOptions(requestId)`. Three turns make one select.
* **R2-9.** `useMemo` on `[turn.text, turn.format]` inside `Answer`; a spy on the real `parseAnswer`
  counts one call, the live text, for a delta beside a finished rich answer.
* **W-1.** `.railSlot` composes nothing and is `display: none`, `display: block` at 720 px; `.railButton`
  sets no display. The layout test reads the rule as written and finds the button in its slot.
* **W-3.** `use-workspace-panel.ts` (new, split out of `Workspace.tsx`, which is 354 lines now):
  `PANEL_DOCK_MIN_WIDTH = 1024`, `panelDocks(width)`, `usePaneWidth(root)` (a `ResizeObserver` on the
  shell's `main`, else the root's parent, through `useSyncExternalStore`), and the panel's state.
  **Default R2-c:** an unmeasured pane (the server, hydration, no `ResizeObserver`) reads as docked, as the
  server drew it, so a page loaded with the course rail open at 1280 px shows the panel docked for the
  frame before it is measured. The `matchMedia` store is gone, so code review 12's two stores are one
  (W-87's `usePhoneWidth`). The 1023.98 px `@media` step stays as a floor (a window that narrow has a
  pane that narrow). Tests: the decision as a pure function; a pane resized from 1440 to 1020 and to 1180
  (docked, sheet, docked); the sheet's Esc, Close and scrim; the layout test's mounts in a 1440 px pane.
* **S-1.** `tab.opener = null` before `tab.location.href`; the fallback keeps `noopener,noreferrer`. Two
  cases: the opener is null when the address is set, and the blocked-tab fallback's arguments.

### Round 2 gates

From `web/`, after `4f1aeb2`:

    $ npm run typecheck                                    clean
    $ npx eslint . --max-warnings 0                        clean
    $ npx playwright test -c e2e/playwright.config.ts workspace-layout
                                                           5 passed, exit 0
    $ npx vitest run                                       Test Files 208 passed (208); Tests 3870 passed (3870)
    $ npx vitest run test/token-audit.test.ts test/raw-html.audit.test.ts test/audits.test.ts test/status-vocabulary.test.ts
                                                           Test Files 4 passed (4); Tests 107 passed (107)

The red token still names eleven files. No string was added in round 2. The PM may permit the two lib
modules' changes as written: `placeholderData` on the two frozen options, and three exports added beside
the frozen ones in `queries.workspace-sources.ts`; no frozen name or signature changed.
