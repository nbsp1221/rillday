# @repo/web

## 0.3.0

### Minor Changes

- ba522e8: Import habit history from TickTick Excel or a documented CSV template, with local preview, explicit conflict choices and recording-time preservation across devices.

## 0.2.0

### Minor Changes

- fe00602: Simplify synchronization setup with email and password accounts, a focused server connection flow, and consistent accessible forms. Use the web server's address automatically and keep desktop server selection explicit. Preserve existing accounts and workspace data. Update clients together with the server before creating administrator or user accounts.
- bf0b44f: Add weekly cumulative habit goals and optional time-of-day groups. Start from editable habit ideas, customize icons, emoji and colors together, and record amounts directly from the weekly list.

### Patch Changes

- a7572e9: Keep long option labels inside their menus with readable ellipses.
- a7572e9: Commit custom colors before closing the picker when Enter is pressed.
- bf0b44f: Improve the habit tracker with a prominent current date, aligned habit names and row actions, and readable markers for completed, recorded, unlogged and upcoming days.
- bf0b44f: Use accessible checkboxes for habit completion and keep hover within each control. Preserve checked colors, stable labels, keyboard toggling and quantity-record editing in both themes.
- bf0b44f: Record habit quantities from their date cells with clearly labeled daily totals and amount shortcuts. Keep quantities visible after reaching a goal and share the same editor with habit details.
- 947248c: Use the workspace clock consistently when validating habit check-ins.
- dc9d449: Make account and server forms validate consistently, clear completed account forms without stale errors, and show a single password visibility button in Windows.
- 6794c2b: Render completed Markdown checklist items with a clear checkmark.
- a7572e9: Preserve focus in custom color inputs and task controls when leaving the description editor. Apply keyboard panel resizing to the current window dimensions.
- bf0b44f: Make appearance tabs, secondary button hover and adjacent-month calendar dates readable in both themes. Search the full emoji catalogue in Korean or English, including offline, with consistent keyboard navigation and draft editing.
- 947248c: Keep keyboard focus on the task when switching between its menus.

## 0.1.0

- Initial release.
