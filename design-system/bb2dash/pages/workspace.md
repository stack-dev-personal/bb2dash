# Workspace Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass. **Rewritten 2026-10-15 for Phase 24b**, the page as built: the lobby, the composer with its chips and menus, formatted answers with source chips, the side panel (brief 111, "Frozen at the gate"; defaults D-F to D-J).
> **Page type:** Chat with a lobby. A rail of conversations beside one column; the column is the lobby (a greeting over the composer, the routines, example prompts, recent conversations) or one conversation's thread (questions, formatted answers with their sources, the composer docked under them); a side panel with three tabs on the right.
> **App files:** `web/src/app/(app)/workspace/` (Workspace.tsx, Workspace.module.css, page.tsx), `web/src/components/workspace/` (Composer and its parts, PlusMenu, CourseMenu, DepthMenu, RoutineList, MaterialPicker, Chip, Lobby, LobbyRecent, ExamplePrompts, ThreadView, MessageList, AnswerBody, SidePanel, SourcesTab, FilesTab, MemoryTab, ConversationList, TierBadge, ServiceStatus)

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- The screen is a grid: the conversations rail (`minmax(--size-conversations-min, --size-conversations-max)`), the column (`minmax(0, 1fr)`, capped at 80ch) and, while the side panel is open and docked, a third track `minmax(--size-280, --size-panel-max)`. The page never changes the shell's course rail: `html[data-sidebar]` is his remembered ☰ state, and the Workspace fits the pane it gets (D-F).
- The two steps are the audit's own: at 1023.98px and under the panel is a sheet, as the course rail is a drawer at that step; at 720px and under the rail is a sheet too, opened by one secondary pill that reads the rail's heading, and the composer is docked (`position: sticky; bottom: 0` on the thread's dock, on the page's ground `--color-bg`). No `@container` and no other width: `web/test/token-audit.allowlist.ts` is frozen.
- The message column keeps `position: relative` and `overflow-y: auto` and scrolls inside itself; a wide table and a code block scroll inside their own positioned boxes (`AnswerBody.module.css` `.tableBox`, `.code`). The page never scrolls sideways at 390px. `Workspace.layout.test.tsx` reads the folder's sheets by glob and holds every box that scrolls to be positioned; `e2e/workspace-layout.spec.ts` measures the dock and the table box in a browser.
- Both sheets and the material picker are `PopoutShell`: one component owns every modal surface on the page (D-J). The frame itself is not edited; a sheet's shape (from the right, or from the reading edge, full height, `min(100%, --size-panel-max)`, square) is set by structure in the page's own modules.

### Colour

- Red marks where he is, twice, and nowhere else (D-I): the picked tab's underline (`--size-underline-mark` in `--color-accent-500`, its words stay ink) and the picked conversation's bar on the reading edge of its row, over the grey fill it had. Eleven files of `web/src` name the red step after this phase; nine before it.
- A question is still set apart by a 2px rule in the ink. Chips, badges and source numbers are the outlined pill (`tagOutline`). Nothing in the composer, the lobby, the answer body or the panel's rows is red; a status is told by words, never by colour alone.
- Ask is the view's one primary button; disabled it is Phase 22's flat grey. Every other control is a quiet pill (`btnGhost`) or a secondary one (`btnSecondary`): the sources row, the panel's tabs, Hide and Show panel, Open, Try again, Delete and its second press, the routines' shortcuts, the rail's button.

### Components

- **The lobby:** a serif greeting with no name in it over the composer, then the routines as secondary pills, up to three example cards in a row (one column on a phone; a card is a button with the hover tint and no lift) and the recent conversations as hairline rows with a quiet View all. A block with no row is absent; a block still loading renders nothing. Above the lobby and above every thread stands one muted line with today's New York date and its weekday.
- **The composer:** one square card with a clear edge holding the text well, a row of chips (the dashed course chip, a routine chip, attachment chips: outlined pills with a small round Remove) and the controls; the plus, course and depth menus open upwards as large cards with the floating shadow, their entries quiet rows with the hover tint. A file dragged over the card draws the ink edge round it. A refusal is the app's one error form; why Ask sends nothing is a muted line under the box.
- **The routine list** is a search well over the routines under their kicker headings, in the plus menu's panel on a wide screen and a sheet at 720px and under. **The material picker** is a `PopoutShell` dialog: a serif title, a search well, the files under their course codes, the list scrolling inside its own positioned box.
- **An answer** is formatted, in the body face at 13.5px and line height 1.55: headings h2 to h4 in the heading face one step apart, lists, a table in a positioned box with the 1px ring, code on `--color-panel` in the mono face, a quote behind a divider rule. A cited source is a small outlined pill with its number, a button that opens the panel at its row, never a link; a label that no source row resolves stays text. Under a finished answer the sources row ("3 sources") is a quiet button. The fixed line about an empty or failed search is muted words, shown once.
- **The side panel** is a square card: its three tabs as quiet pills with the red underline on the picked one, Hide panel at the top right, a filter well at the top of the Files and Memory tabs. Rows are title over facts with a hairline under each; a source row carries its number as the chip does; the note under Delete is muted, right-aligned and capped at `--size-280`. Folded, the page shows one quiet Show panel pill at the column's top right.
- **Press areas on a phone** are 44px (`--size-44`): the sources row, the tabs, Hide and Show panel, the rows' buttons, the rail's button; a chip keeps its size in the line and presses through a centred 44px box.

### Motion

- Nothing new moves. The sheets take `PopoutShell`'s own motion; the menus open and close with the app's `--motion-control`; the column still does not animate its scroll and a new turn is there at once.
- A state that answers a press shows at once: the searching line, the stopped sentence, a chip's new state. The 240ms wait before a loading line is only for a screen's loading words, which this page's blocks do not use (a block still loading renders nothing).

---

## States

- **No conversation:** the lobby. The old empty-column line is gone; the thread's empty column keeps `loading` and `missing` (the not-found line, an alert, with the way back to the lobby under it).
- **Searching, streaming, stopped, offline, refused:** each one sentence in the muted colour or in the error notice, as the app has them; the words are `web/src/lib/workspace-labels.ts`'s and do not change.
- **An upload's states** are words on its chip and on its Files row (Waiting, Reading, Indexing, Indexed, Failed, Removing); a failed row keeps Try again and its reason.
- **Delete** needs two presses, and reads `Press again to delete` between them.

---

## Recommendations

- Answers are formatted text, never raw HTML: the parser yields a block tree and `AnswerBody` renders text nodes; no `img`, `a`, `iframe`, `script` or `style` and no `href` or `src` ever comes from an answer (`web/test/AnswerBody.test.tsx` holds it under generated strings).
- Keep the thread readable at 13.5px with line height 1.55. Density comes from the rail and the panel's rows, not from the answer.
