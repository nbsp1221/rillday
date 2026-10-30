# @repo/desktop

## 0.2.0

### Minor Changes

- fe00602: Simplify synchronization setup with email and password accounts, a focused server connection flow, and consistent accessible forms. Use the web server's address automatically and keep desktop server selection explicit. Preserve existing accounts and workspace data. Update clients together with the server before creating administrator or user accounts.
- 826ed7b: Add a Windows ZIP download alongside the installer. Both downloads share an OS-standard default and first-run data folder selection. Let users open an existing folder or choose a new one without moving or merging data. Keep development profiles, folder preferences and credentials separate from production.

### Patch Changes

- a7572e9: Keep long option labels inside their menus with readable ellipses.
- a7572e9: Commit custom colors before closing the picker when Enter is pressed.
- 947248c: Use the workspace clock consistently when validating habit check-ins.
- dc9d449: Make account and server forms validate consistently, clear completed account forms without stale errors, and show a single password visibility button in Windows.
- 6794c2b: Render completed Markdown checklist items with a clear checkmark.
- a7572e9: Preserve focus in custom color inputs and task controls when leaving the description editor. Apply keyboard panel resizing to the current window dimensions.
- a7572e9: Wait for the Windows browser runtime to release its profile before restarting after a data-folder change. Opening Rillday again now returns to the running window instead of opening another instance.
- 947248c: Keep keyboard focus on the task when switching between its menus.

## 0.1.0

- Initial release.
