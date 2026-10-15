# Phase 22 walk and evidence (103w)

Branch `feat/styling-22`. Brief `docs/planning/sprint-2/briefs/103_PHASE22_styling.md` (frozen 2026-10-08, amended three
times the same day). Direction D, "Charcoal" (approved by Stack, DECISIONS 2026-10-09). The walk is the PM's, in the walk
box on the phase branch's build (DECISIONS 2026-10-08): every shot stays under `C:/Users/stack/.bb2dash-walk/22/<run>/`,
outside every repository, and no screenshot is committed. Preview for Stack's look: https://web-git-feat-styling-22-emstacho-sus-projects.vercel.app (behind Vercel's sign-in; the PR carries a share link).

The tree walked: 78a0deb (the PR's later commits are docs only: this record, STATUS, DECISIONS, ORCHESTRATOR) (the branch's head at the PR, with `origin/main` merged a fourth time at e820b29).
Both counted walks and the desktop look ran on that tree; the web gates and every named check of task 20 ran on it
first (STATUS, "Phase 22").

## 1. The theme control and storage (acceptance step 1)

Task 22's run 20261014T183839Z: 64 passed, 0 failed, fingerprint `ea740eb824c71dcccc17d58294fb5134` before and the same after, `requests_open` 0 at both reads. It is the repeat of run 20261014T182927Z (also 64 passed on the same tree), which does not count: three Inbox answers of Stack's own (items 6314 to 6316, his words in their notes) were resolved at 18:34:49Z to 18:34:51Z, inside that run's window, so the fingerprint moved by `resolved_n` and `resolved_last` while `requests_last` stood still and the guard recorded no write attempt; the brief says a moved fingerprint is repeated in a quiet window, so it was. The checkers judged run 20261014T182927Z's shots; the counted run's shots differ from them in live data only (a pixel comparison of all 62: the badge count, times, the today column, and the Inbox, whose queue his answers had emptied), and the PM looked at the two shots that differ most (03 inbox, both themes) on the counted run. Every `[dark]` case stored nothing under an emulated light system and
was dark all the same; every `[light]` case stored `light` once before its first load and not again on a reload, under
an emulated dark system, and the stored choice won. In every surface case `html[data-theme]` and the computed body
background were the case's theme (`THEME_BG`), and no console message matched `/hydrat|#418/` (P-76: 0 hydration
messages in 62 cases). The two `25 account-menu` cases walked the control (Dark, Light, Auto in that order; a pick
follows at once, survives a reload, and Dark removes the key), and the two `13 login` cases showed the same on a
public page.

- [x] toggle — the control's three choices, its storage and the desktop window: proven in the four cases above and seen
  once in the real window (section 5, the title bar line: Light picked with the real mouse, the three buttons followed,
  Dark picked and they followed back).

## 2. The 62 surface lines (acceptance step 2)

Task 22's run 20261014T183839Z, 31 light and 31 dark shots (Shot count `31 31 0`). Each shot was opened and judged against
its inventory row and against direction D by two independent checkers (rows 01 to 16 and rows 17 to 31), and the PM
read every line and looked again at each shot a checker marked. One tick and one note per line. The grounds measured
in the shots are D's: dark `#050505` / `#1d1d1d` / `#111111` (ground / card / panel), light `#f4f4f4` / `#ffffff` /
`#e9e9e9`; `#ff0000` is never the colour of words.

- [x] 01 home [dark] — Home whole on `#050505`: the tracker with its legend E P Q A R (exam first), each day's most urgent bar on top (Tue 20 the project `#ff6257` over three greys, Mon 19 the quiz in white), the today panel, six course cards with their week strips (meeting days filled, the rest outlined; TTh, MW, MWF and none), Undated (5) and Needs attention; no caption line under Courses, the tracker or the planner; the badge up and right of Activity, touching no icon; the bar's icons at one stroke weight
- [x] 01 home [light] — the same on `#f4f4f4`: Tue 20 the project `#a80000`, Wed 21 the exam `#ff0000`, quiz bars `#111111`; nothing left in the dark colours
- [x] 02 planner [dark] — the week of Oct 12 to 18, TODAY underlined in red, the now-line `#ff0000`, class blocks in grey with mono codes and the expanded due item inside today's IST.352 block; the hour rows around that item are taller than the others (48 px elsewhere, 84 and 120 px there), the planner's own layout as `main` has it (section 7)
- [x] 02 planner [light] — the same on the light grounds, the "+" button inverted
- [x] 03 inbox [dark] — the Inbox on its default tab, cards with their inputs on `#111111`, the "needs input" and "data gap" pills inverted, the footer with the answered count and the Apply answers pill (in the counted run the queue was empty and the page read "Nothing needs you" with "6 answered · Apply answers"; the two shots differ only in that live data)
- [x] 03 inbox [light] — the same with the pills inverted black; no red words
- [x] 04 announcements [dark] — the whole list of 31 announcements, read in eight strips: serif titles, sans body, small sans meta; nothing unreadable
- [x] 04 announcements [light] — the same on white cards over `#f4f4f4`
- [x] 05 grades [dark] — the report-card strip and the six folding class sections, read in five strips; the strip's sixth card is cut at its box edge, because the strip scrolls sideways in its own box rather than widening the page (`ReportCardStrip.module.css`, `overflow-x: auto`), as the Upcoming strip does
- [x] 05 grades [light] — the same; the same cut at the scroll box's edge
- [x] 06 materials [dark] — Materials whole, read in twelve strips: six course cards, section headers and date groups in the serif, pills and buttons inverted, "In library" and "Open" consistent; nothing in the light colours
- [x] 06 materials [light] — the same, "Open" buttons black
- [x] 07 course-stream [dark] — IST.352's Stream: the tracker (legend exam first, Sun 11 the project `#ff6257`), "New and changed materials" with its "16 earlier" fold, the week rail with the current week's box in red, the timeline to week 16 and the "No date yet" row; the sidebar's current course marked with the red left bar
- [x] 07 course-stream [light] — the same; the project bar and square `#a80000`, quiz bars black
- [x] 08 course-classwork [dark] — IST.471's Classwork: Assignments (6) and Content, the Classwork tab underlined in red, the sidebar's course marked
- [x] 08 course-classwork [light] — the same
- [x] 09 course-grades [dark] — IST.466's Grades: the figure with what is not counted, the item table, two "unsure" selects with Confirm link, the bookkeeping button
- [x] 09 course-grades [light] — the same
- [x] 10 course-info [dark] — IST.466's Info: staff, meetings, policies, syllabus, groups, the card note input on `#111111`, the Blackboard button; the Info tab underlined
- [x] 10 course-info [light] — the same, inputs and buttons on `#e9e9e9`
- [x] 11 assignment-page [dark] — Assignment 1's page: the meta grid, instructions, the Your plan form, the submission record and Stage a file; the hash in mono; the card fills the column's left part and leaves page ground to its right (T-16)
- [x] 11 assignment-page [light] — the same
- [x] 12 workspace [dark] — the Workspace: the conversation list, one question and answer with its "Sonnet · standard" pill and mono "Used:" line, the ask box; Workspace underlined in the bar
- [x] 12 workspace [light] — the same, the Ask button inverted
- [x] 13 login [dark] — the centred `#1d1d1d` card on `#050505`: the brand square and serif word, two inputs, the inverted Sign in; no bar; the system was emulated light and nothing was stored, so dark is the default (step 1)
- [x] 13 login [light] — the white card on `#f4f4f4`, inputs on grey, Sign in black; the stored `light` won under an emulated dark system (step 1)
- [x] 14 privacy [dark] — the Privacy card, body in the sans, `calendar.events` in mono
- [x] 14 privacy [light] — the same
- [x] 15 terms [dark] — the Terms card
- [x] 15 terms [light] — the same
- [x] 16 not-found [dark] — "Not found" in the serif, the sans line, the underlined "Back to Today"; no bar
- [x] 16 not-found [light] — the same
- [x] 17 assignment-popout [dark] — the popout open over IST.471's Classwork on the card ground with its one 1 px edge; its top hairline sits at y = 0 where the light shot's sits at y = 22: the dark shot's popout is scrolled 22 px (shot state, nothing clipped, the close button and one more body line visible)
- [x] 17 assignment-popout [light] — the same popout, `#d6d6d6` edge with its shadow, fields and pills right; the two selects and two date inputs keep the browser's own glyphs (D-4, section 7)
- [x] 18 session-popout [dark] — session 105's popout over the IST.466 Stream, hairline edge at y = 22, serif title, pills in sans and mono
- [x] 18 session-popout [light] — the same, `#d6d6d6` edge and shadow
- [x] 19 planner-item-popover [dark] — the popover on the day's due item (title, due line, points line, the status field, "See full details"); no "Blackboard" pill beside the link in this shot: the pill is drawn only once the course read returns, or not at all for an item without a link, and this run's item (a knowledge check, 0 points) differs from the earlier run's, which showed the outlined pill in dark; the pill's own look was judged there
- [x] 19 planner-item-popover [light] — the same popover with the 1 px `#d6d6d6` edge and shadow; the pill absent as in dark; the title in the sans by its stylesheet (T-7)
- [x] 20 planner-event-form [dark] — the event form on an empty slot: fields read as fields, the custom checkbox, Cancel as a hairline pill and Save filled
- [x] 20 planner-event-form [light] — the same with the pills inverted
- [x] 21 series-scope-dialog [dark] — "Delete repeating event" over the dimmed edit form: three custom radios (white dot, grey ring), Cancel and Delete pills, a 1 px edge; no native blue anywhere
- [x] 21 series-scope-dialog [light] — the same with black radios and the `#d6d6d6` edge; pixel-identical to the earlier run but for live data
- [x] 22 search [dark] — the field open in the bar with "syllabus" and the results popover under it, one 1 px edge; no icon label showing beside the open panel
- [x] 22 search [light] — the same, `#c6c6c6` edge and shadow
- [x] 23 bell [dark] — the announcements dropdown under the bell, the bell pressed, the unread badge up and right of Activity and touching no icon
- [x] 23 bell [light] — the same, `#c5c5c5` edge and shadow
- [x] 24 activity [dark] — the activity dropdown under its icon with its rows and times, the badge cleared on open, one 1 px edge
- [x] 24 activity [light] — the same
- [x] 25 account-menu [dark] — the account menu: signed-in address, Theme with Dark checked, Light, Auto, Sign out, rows in the sans, one hairline; the courses panel open behind it
- [x] 25 account-menu [light] — the same menu with Light checked; the courses side panel is closed in this shot (the case's fresh browser context stores only `light`, so the panel takes its default), which is shot state and not the menu's styling
- [x] 26 courses-sidebar [dark] — the drawer and its scrim at 800 px: the toggle pressed with no label sliver under it (V-16, gone since 9af3637); the drawer's left edge measures 2 px (a `#6b6b6b` rule at x 539 beside a `#585858` ring pixel at x 540), left as built and listed in section 7; the account icon cut by the window's right edge at 800 px, which is T-12
- [x] 26 courses-sidebar [light] — the same at 800 px on the light grounds: no sliver; the 2 px edge (`#d6d6d6` beside `#c3c3c3`); the account icon cut at the edge (T-12); the scrim heavier than dark's (T-14)
- [x] 27 nav-menu [dark] — the phone Menu at 390 px: Home with its red bar, Planner, Inbox, Grades, Materials, Workspace and nothing else; a 1 px bottom edge and the shadow; the bar's six controls fit the width
- [x] 27 nav-menu [light] — the same
- [x] 28 sync-toast [dark] — the one-line "Sync requested" note under the Sync pill, readable, one 1 px edge
- [x] 28 sync-toast [light] — the same, `#c0c0c0` edge and shadow
- [x] 29 error-notice [dark] — the Inbox with its red notice: the `#2d0404` field, the `#ff8f85` bar and words, the mono ERROR label; Apply answers a pill
- [x] 29 error-notice [light] — the same: `#f4e0e0` field, `#a31515` bar and words
- [x] 30 planner-wizard [dark] — the wizard at step 2 of 5, the "When" step pill current, Next switched off, a 1 px dialog edge; no native control
- [x] 30 planner-wizard [light] — the same
- [x] 31 frame-scrolled [dark] — `/grades` with the content pane scrolled to its end: the page ground below the last block, the bar's rule at y 52 with the first row sliding under it, the side panel in place
- [x] 31 frame-scrolled [light] — the same

## 3. 390 px (acceptance step 3)

Task 21's run 20261014T182418Z: 54 passed, 0 failed; `pane scrollWidth=` printed 24 times (the 12 routes inside the shell, in
both themes, each measured on the content pane as well as on the page). Fingerprint before `ea805a486cfece5ad516ed894850d495` and after
`ea805a486cfece5ad516ed894850d495` with `requests_open` 0 at both reads, so no sync, no apply and no walk write fell inside the window.
Shot count `0 0 6`; the six phone shots opened:

| Shot | What it shows |
|---|---|
| `40-phone-home.png` | The brand square, Menu, Sync as its icon alone, and the five icons (search, ☰, activity with its badge, bell, account) in one 52 px row; no horizontal scrollbar on the page; the Upcoming work strip scrolls inside its own box with its two arrows, and the day stacks, the legend and the today list fit the width |
| `41-phone-nav-menu.png` | Menu open under the bar: Home (marked, with the red bar), Planner, Inbox, Grades, Materials, Workspace, and nothing else; the page's content stays in place under it |
| `42-phone-course-grades.png` | The IST.466 Grades tab: sub-bar, the course header, the "graded so far" figure with what is not counted, and the item table; at 390 px its three columns fit inside the card, so its own scrollbar is not needed on this data (the wrapper keeps `overflow-x: auto`, pinned by `gradebook-phone-width.css.test.ts`); nothing cut at the page edge |
| `43-phone-planner.png` | The planner week cut at the board's edge (Wednesday's column half shown, the board scrolls sideways inside itself); the hour labels clipped by their gutter as on `main` (section 7); the popover's item card inside the board |
| `44-phone-bell.png` | The announcements panel with both edges inside the screen, eight rows and "See all" |
| `45-phone-activity.png` | The activity panel with both edges inside the screen, its rows and times; the badge cleared on open |

- [x] C-1 — at 390 px nothing scrolls sideways: no route of the 16, no popout, no open state; the planner week and the
  IST.466 gradebook scroll inside their own boxes (shots 42 and 43), measured on the page and on the pane in all 54
  cases of run 20261014T182418Z.

## 4. The Menu by keyboard (acceptance step 4)

Task 21's reachability cases, both themes, in run 20261014T182418Z: the first Tab stop is "Skip to content" and Enter on it
puts focus on the content pane; Tab reaches Menu, Enter opens it, Tab walks Home, Planner, Inbox, Grades, Materials
and Workspace in turn, Escape closes it with focus back on Menu; the search icon is reached by Tab in the bar and
opens the field; ☰ still opens the courses drawer; Bell and Activity open fully on screen. The account menu's arrow
keys, the focus that returns and the toast's timer are `shell-keyboard.test.tsx` and `SyncButton.toast-timer.test.tsx`
(in `npm test`, 3,453 passed); each was tried once by hand in the desktop look (section 5).

## 5. The desktop look (acceptance step 5), on the packed build

Packed from the final tree (`npm run pack`, exit 0; `desktop/dist/win-unpacked/bb2dash.exe` and its `icon.ico`
present). A second instance under its own profile folder (`%TEMP%\bb2dash-look22-*`), `BB2DASH_APP_URL` at a local
`next start` of the branch on port 3922, `BB2DASH_SYNC_DRY_RUN=1`, every write stopped at the browser (RPCs aborted
but `mark_announcements_seen`, answered locally; any non-GET to `/rest/v1` or `/storage/v1` aborted). Stack's running
app was never started, stopped or signalled, and the laptop's Windows theme was not changed. Chromium
152.0.7977.78 (Electron 44.4.1). Shots under `C:/Users/stack/.bb2dash-walk/22/desktop-look/`.

Desktop window: dark ground at open, no lighter frame first; Windows in dark mode (apps mode read from the registry). The window reported its background as `#050505` before the page painted, and the first shot (`01-at-open.png`, the login page of the fresh profile) is the `#050505` ground with the `#1d1d1d` login card; the instance's profile was its own temp folder, not the installed app's. The page that followed was dark (nothing stored). Windows' three buttons sit on the bar's surface colour (`#1d1d1d`, `DARK_OVERLAY`) with light symbols: on a page without a bar (the login page, the failed-load page) that is a 138 px block of `#1d1d1d` in the corner over the `#050505` ground (T-18).

Desktop window at its minimum width: asked for 700 by 640, the window gave 963 by 641 outer (it reports a minimum of 960 by 600, `MIN_WIDTH` from the idle bar 815 plus the buttons 138, rounded up); the page's inner width was 961 px with `document.scrollWidth` 961, so nothing scrolled sideways; with the Sync label idle and search collapsed the bar held the six links, Sync and the five icons, the last icon's right edge at 824 px, exactly the title-bar area's end (`getTitlebarAreaRect().width` 824, the three buttons 137 px of the 961), so every icon was clear of the buttons (`03-minimum-width.png`). At the opening size (1280 wide) the title-bar area was 1143 px: the three buttons take 137 px, one under `CONTROLS_WIDTH`, 138; nothing goes back to W-67.

Desktop title bar: one bar. The app's bar is the window's title bar: the window dragged by an empty part of the bar with the real mouse (moved 79 by 53 px); a bar link pressed (Planner, the route changed to `/planner`); the Account icon took a real click and its menu opened (Update desktop app, Dark, Light, Auto, Sign out), which last night's packed build failed (W-68's last fix, `app-region: no-drag` after `all: unset`); with the menu open its Light row pressed and the window did not move (0 by 0); the page turned light, its `theme-color` meta `#f4f4f4`, and the three buttons followed to the light overlay (`07-light-title-bar.png`: the bar white with the buttons in it); Dark picked and they followed back. In the second part of the look, each of the five icon buttons took a real click at its centre, sent only while the top-level window under the pointer was the instance's own: Search opened its field, the Courses toggle changed the rail's state, Activity, Announcements and Account each opened their panel (every control reads `app-region: no-drag` and is the topmost element at its centre); then the Light row was pressed with the real mouse (theme `light`, `theme-color` `#f4f4f4`, the window not moved), and Dark pressed back (the key removed). With a popout open the bar is `no-drag` and its close button sits inside the bar's strip (`18-popout-open.png`, the button's top at 34 px, inside the 52 px bar): a real click on it closed the popout.

Desktop menus: a right click in the search field popped the native menu with Cut, Copy, Paste and Select all (`chrome.spec.ts` records the four roles; in the look the menu was popped by a real right click, and `09-context-menu-in-field.png` holds the field with its results popover, the menu itself having closed before the shot was taken); on empty space nothing (`10-context-menu-empty-space.png`). Alt showed nothing: the menu bar stayed hidden (`11-after-alt.png`). Ctrl+R reloaded the page and Ctrl+Shift+I opened the developer tools; Ctrl and plus left the zoom factor at 1. The app's own menu holds View (reload, force reload, the developer tools) and Window (minimize, close): no zoom, no quit.

Desktop failed load: a second launch with `BB2DASH_APP_URL` at `http://127.0.0.1:59999` showed the failed-load page in direction D (`13-failed-load.png`): the `#050505` ground, the `#1d1d1d` card, the line "bb2dash could not reach the app, so check the connection and try again." and a Retry pill whose link is the app's address; the page holds no script and was shown from the `data:` address; the window dragged by its top strip with the real mouse (moved 67 by 67 px). Retry tries the address again (`chrome.spec.ts`, the S-2 cases: the real error, connection refused, is kept).

Desktop update prompt: the flow never shows it under the test variable and the instance had no newer build, so the page was written from the packed build's module (`node -e "…promptHtml()…" C:/Users/stack/.bb2dash-walk/22/update-prompt.html`, exit 0; the module loads outside Electron) and opened in a browser (`update-prompt.png`): the `#050505` ground, the title and the line in the system typeface (Segoe UI), "Update now" a filled ink pill (`#fafafa` on `#050505`), "Update later", "In 1 hour", "In 4 hours" and "Tomorrow" grey pills (`#262626` with `#f2f2f2` words), no blue. Its colours are pinned by `shell-pages.test.ts` as well.

Desktop icon: the square mark in greys is `desktop/build/icon.ico` and `icon.png` (the taskbar button and the window's icon), `tray-16.png` (the tray) and the byte-equal `web/src/app/favicon.ico` and `apple-icon.png` (`app-mark.test.ts` and the two `cmp` lines, task 33); the packed build carries `resources/app/build/icon.ico` (the pack smoke, exit 0), and the preview's `/login` serves the favicon from it. In the look the window's corner holds no icon of its own (the window is frameless, its title bar the app's bar, whose first mark is the brand square), and the second instance's taskbar button and tray icon sat under the terminal and in the taskbar's hidden-icons overflow when the strip was captured, so they are not in a shot; a first launch of that check without the two public settings showed the shell's own "bb2dash cannot start" dialog (the `supabaseAnonKey` setting missing from the temp profile), which Stack saw and closed, and the second launch with them started cleanly. Stack's running app shows the old ring icon until it takes this build.

Desktop scrollbars and motion: in both themes every box that scrolls showed the app's scrollbar (10 px, thumb `#969696`, the pane `overflow-y: auto` with a stable gutter), and the page's own starts under the bar (`08-grades-light-scrollbar.png`, the Grades page in light with the pane's scrollbar at the window's edge below the bar; `03-minimum-width.png` in dark). Motion with motion on (the instance did not emulate reduced motion): the account menu, the bell and the search field each arrived over 45 frames with a worst gap of 17 ms and a mean of 16 (no stutter); the account menu and the bell left with `data-leaving` seen and were gone after it (exception 7); the courses drawer under 1024 px slid in by `transform` (read mid-transition at `translate(89.7px)`, `transition-property: transform`) while its scrim faded (exception 8; `04-drawer-at-minimum.png`). The pointer on a bar link, a side panel row, a course card and the Sync pill read `pointer` in each theme, and each showed its hover and its press under the real mouse (PD-4, PD-6). Chromium 152.0.7977.78, Electron 44.4.1.

A person who picked Light sees one dark frame at each open: the window is built on the dark ground and the page
follows the stored choice after its first paint. Accepted and written down (brief, step 5); not walked.

## 6. Swept, not shot

States that need a live condition were swept with their file and not shot: the Workspace offline and problem lines;
the scheduler heartbeat and push-failure lines on Home; the Inbox tabs "Answered, not applied" and "Archived"; the
Stream's in-page session panel; the staged-upload drop zone; the desktop-only "Update desktop app" row of the account
menu (seen in the desktop look instead); the Sync toast's fallback command block and its close notice. Each is on
tokens by the audit (Baseline sum 0 over all four clusters) and in both themes by the contrast tests.

## 7. Known, not this phase

Same on `main`, or not chosen by Stack, so not built here:

* the blank gap under the wizard's title field, and its fields stopping short of the panel (row 30);
* the first hour label on the rule under the Events row of the planner, and at phone width the planner's hour labels
  clipped by their 48 px gutter (the same rule as `main`; the new code face is wider, so more of the hour is cut);
* the Inbox's empty line under a failed read (row 29);
* the browser's own caret, calendar and clock glyphs on selects and date fields (D-4);
* the disclosure triangle on "N earlier" (D-3 added no mark where no character stood);
* table columns that do not line up between course blocks on `/grades`;
* the assignment page marking Stream as the current tab;
* a browser window between 721 px and the bar's idle width scrolls sideways to the bar's end, as on `main` (freeze
  row item 3; taste call T-12);
* the planner's hour gutter at phone width (above);
* the Workspace's message column showing the browser's default scrollbar in the desktop shell on `main` is gone with
  task 38's scrollbar rules; what remains is listed under T-12.

## Taste calls for Stack

Each call names the surface and theme, what to look at, where (the preview and the shot), and the default the build
took. T-1 to T-5 were shown with tile D and are settled at their defaults (DECISIONS 2026-10-09, "tile D is
approved"); T-6 to T-12 came after the tile and were closed by the PM at the brief's defaults on Stack's word of
2026-10-09 ("The rest of the requirements should be closed out by you"), each listed here so he can overturn one.

| Call | Surface, theme | What to look at | Where | Default taken |
|---|---|---|---|---|
| T-1 | Every surface, dark | The page is dark even when the system is light and nothing is stored | https://web-git-feat-styling-22-emstacho-sus-projects.vercel.app (behind Vercel's sign-in; the PR carries a share link) in a light-mode browser; `01-home-dark.png` | Dark is the default; Light and Auto are the control's other two choices |
| T-2 | Home and the Stream's Upcoming work, both | Work types as one urgency scale (exam, project, quiz, assignment, reading), not five hues | `/`; `01-home-dark.png`, `01-home-light.png`, `07-course-stream-*.png` | The urgency scale of tile D |
| T-3 | Upcoming work, both | Exam and project bars are flat reds, not striped; without colour vision an exam bar and a reading bar are the same grey | `/`; `01-home-*.png` | Flat reds (the limit is named) |
| T-4 | The bar and every focused control, both | The brand square and the focus ring are in the ink, not red | `/`, Tab through the bar; `01-home-*.png` | Ink (`--size-focus` 2 px) |
| T-5 | Every surface, both | Source Serif 4 600 for titles, Source Sans 3 for labels, Source Code Pro for codes | any page; `01-home-*.png`, `11-assignment-page-*.png` | The type as picked |
| T-6 | The desktop window | No zoom keys in the app's menu (Ctrl and plus does nothing); Alt shows nothing; the window's minimum width is 960 px, up from 900, built from the idle bar (815) and the three buttons (138), so the bar clears them | the packed build; `03-minimum-width.png` | Default 17 of amendment 3 |
| T-7 | Inbox cards, the planner, the tracker, both | Which dates left the code face (the Inbox card's values and the two "seen" stamps) and which stayed (the planner's hours, the tracker's day numbers); the three small titles left in the serif; the planner popover's heading moved to the sans | `/inbox`, `/planner`, `/`; `03-inbox-*.png`, `02-planner-*.png`, `19-planner-item-popover-*.png` | D-2 as built |
| T-8 | Menus, popovers, the side panel, both | The motion times as built; the side panel switching with no motion on a wide window; the four panels that arrive with motion and close at once (the planner's item popover, its event form, its new-event wizard and the Inbox apply panel); `--motion-state: 0ms` if he wants less | the packed build with motion on; `05-account-menu-dark.png` | Default 18 of amendment 3 |
| T-9 | The assignment page and popout, both | The attempt status in words ("needs grading", "in progress", "completed"); the four captions kept as tooltips, not deleted | `/course/IST.471/assignment/IST.471/a1-proposal`; `11-assignment-page-*.png`, `17-assignment-popout-*.png` | Words, and tooltips kept |
| T-10 | The bar, a course card, the app icon, both | The bell and Sync as redrawn; a right arrow after a link drawn as a caret; the size of the square on the app's icon; the week strip built with a meeting day filled and a plain day outlined, the other way round from the label he chose ("Meeting days as outline") | `/`, a course card; `01-home-*.png`; the taskbar | Default 16 of amendment 3 |
| T-11 | The planner, the account menu, the bar, both | The planner's done box is 24 px tall and not 24 px wide, by design (17 by 24 px in a one-row block, 17 by 16 px in a tall one); the arrow keys are in the account menu only, and Bell's links and the phone Menu's keep Tab; Sync keeps Windows' own tooltip while the five icons beside it get the drawn label | `/planner`, the bar; `02-planner-*.png`, `25-account-menu-*.png` | Defaults 14 and 10 of amendment 3 |
| T-12 | The bar between 721 and 860 px, both | Fold the bar at 820 px instead of 720: at 800 px the Account icon is cut off and the page scrolls sideways to it, as on `main`; and the planner's hour labels at phone width, clipped more by the wider code face | the preview at 800 px wide; `26-courses-sidebar-*.png` (shot at 800 px); `43-phone-planner.png` | Kept at 720 and recorded, not fixed (freeze row item 3; §Out of scope) |
| T-13 | Every menu, popover, dialog and toast, both | The hairline edge is not one grey across surfaces (dark: dialogs `#616161`, bar dropdowns `#444444`, the account menu `#383838`, the toast `#404040`, the phone Menu's foot `#323232`; light the same spread from `#d6d6d6` to `#bcbcbc`): translucent edges over different grounds | `21-series-scope-dialog-dark.png`, `22-search-dark.png`, `25-account-menu-dark.png`, `28-sync-toast-dark.png` | As built; one opaque token would make them one grey (found by the checker, 2026-10-14) |
| T-14 | The courses drawer under 1024 px, light | The light scrim is heavier than the dark one (`#7f7f7f` over the page), so the page behind the drawer loses almost all legibility in light while it stays readable in dark | `26-courses-sidebar-light.png` against `-dark.png` | As built (found by the checker, 2026-10-14) |
| T-15 | The bar, the course sidebar, the Stream's week rail, the planner, both | "Where you are" is drawn four ways: a red underline (bar, course tabs, Today), a red left bar (the course sidebar), a filled red box with a black digit (the Stream's week rail) and a full-width red line (the planner's now-line); the filled box is the one solid red that is not an exam bar | `07-course-stream-*.png`, `02-planner-*.png`, `01-home-*.png` | As built; an outline or underline on the rail would keep solid red for exam bars alone (found by the checker, 2026-10-14) |
| T-16 | The unread badge; the assignment page, both | The badge's digits are black on `#ff0000` at about 9 px (legible, white digits or one size up would read faster); the assignment page's card fills the left part of its column and leaves the right third as page ground | `01-home-*.png` (the badge), `11-assignment-page-*.png` | As built (found by the checker, 2026-10-14) |
| T-18 | The desktop window on a page without a bar (login, failed load), dark | Windows' three buttons sit on the bar's surface colour, `#1d1d1d`, a 138 px block in the corner over the `#050505` page ground; on every page with a bar it is the bar itself | the packed build signed out; `01-at-open.png`, `13-failed-load.png` | As built (`DARK_OVERLAY` is the bar's colours; found in the desktop look, 2026-10-14) |
| T-17 | The planner week, both | The hour rows stretch around an expanded due item inside a class block (48 px an hour elsewhere, 84 and 120 px there, this day), so the time axis bends to content; the planner's geometry tests are unchanged from `main` (PD-12), so this is `main`'s layout seen under the new type | `02-planner-*.png` (today's IST.352 block) | As built; an item that overflows its block instead would keep the rows even (found by the checker, 2026-10-14) |

## Pre-delivery checklist (ui-ux-pro-max)

The 13 lines of `design-system/bb2dash/MASTER.md`, "Pre-Delivery Checklist", each with where its proof is. Every
named check below was run on the final tree on 2026-10-14 (STATUS, "Phase 22", the task-20 table).

- [x] PD-1 every colour, radius, shadow, time and curve is a token; no time or curve outside `globals.css` — Baseline
  sum `0` over all four clusters; Audit green (`token-audit.test.ts` in `npm test`, 3,453 passed); Time check over
  every stylesheet but `globals.css` printed nothing.
- [x] PD-2 no module gains a `color-mix()` or a size literal — Baseline sum `0` and Audit green; the allowlist
  `web/test/token-audit.allowlist.ts` has one commit (ce2519f, task 2) and was not edited after.
- [x] PD-3 red only as a mark, for the three things it means — Red files over `web/src` exactly nine lines; the 62
  shots judged for red (section 2): where you are, the most urgent work, what is unread, never as words.
- [x] PD-4 every control has hover, press, focus and switched-off states, in both themes — focus: Ring check
  `35 0 0`; switched off: Strength check `14 0`, Field check `5 5 5`, the `:disabled:not([aria-busy='true'])` grep six
  lines (the brief's five and the Inbox's Apply button, V-6); hover and press: `transition: var(--motion-control)` in
  18 files and `var(--color-surface-press)` in `tokens.module.css`, which every pill composes; the PM's hand on four
  controls in each theme (section 5, the scrollbars and motion line).
- [x] PD-5 one focus ring, 2 px of the ink — Ring check `35 0 0`; the Direction check (`125 0 77 0 true`) holds
  `--size-focus`.
- [x] PD-6 the pointer on what acts, `not-allowed` on what is off, `progress` on what is busy; no busy control dressed
  as off — Busy sites `24 24`; the six-line grep, whose rules hold `cursor: not-allowed`; `cursor: progress` in eight
  files (`PlannerWeek`, `Popout`, `SyncButton` and `StatusSelect` among them); the pointer the PM read in section 5.
- [x] PD-7 text 4.5:1 and marks 3:1, measured in each theme — `theme-contrast.test.ts` and
  `type-tokens.contrast.test.ts`, green in both blocks (`npm test`).
- [x] PD-8 what moves, moves by transform and opacity — `shell-motion.css.test.ts` ("nothing animates width"; the
  drawer slides by `transform` and its scrim fades).
- [x] PD-9 reduced motion stops every transition and animation and keeps the loading wait — the `motion off under
  reduced motion` case of run 20261014T183839Z; the one reduce block of `globals.css` (line 609), whose declaration that
  keeps the wait is `[data-loading] { animation: arrives 0s var(--ease-linear) var(--motion-delay) backwards !important; }`.
- [x] PD-10 every box that scrolls shows the themed scrollbar, in the real window, in both themes — section 5, the
  scrollbars and motion line; `upcoming-tracker-css.test.ts` for the Upcoming strip (task 38).
- [x] PD-11 no sideways page scroll at 390 px; wide tables scroll in their own box — run 20261014T182418Z: 54 passed and
  `pane scrollWidth=` 24 times (section 3).
- [x] PD-12 the 18 layout tokens and the planner's geometry are as they were — `theme-tokens.test.ts` (the 18 equal
  `main`'s), `planner-css.test.ts` and 0 stale A3 entries, all in `npm test`.
- [x] PD-13 no new dependency — `git diff --quiet origin/main...HEAD` over `web/package.json`,
  `web/package-lock.json`, `desktop/package.json`, `desktop/package-lock.json`, `web/vitest.config.mts` and
  `desktop/vitest.config.mts` → exit 0.
