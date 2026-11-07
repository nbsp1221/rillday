# Import habit history

Open **Settings → Data and backups → Import habits**. Choose a source file, select the habits and review their destination, goal type and historical schedule. Importing adds the reviewed history to the current workspace. It does not replace tasks, lists or other habits.

Files are read on your device. When your workspace is connected to a server, accepted records synchronize normally. The saved result confirms local storage; server acknowledgement is shown by the regular sync status.

## TickTick Excel

In TickTick, open Habit → More → Export. Use its English `.xlsx` export. Each habit has a worksheet containing its basic information and the columns Date, Time, Status, Total check-ins, Mood and Habit Log.

Completed daily records, amounts and notes are supported by this export profile. Unknown layouts or statuses are reported rather than converted automatically. An affected habit cannot be imported until its data is corrected, converted to the CSV template or excluded from the selection. Icons, colors, quotes, reminders and mood are not imported.

The file provides the current goal rather than a complete history of past goals or schedules. Confirm the historical baseline before applying it. Without the original rule history, calculated streaks and rates may differ from the original app. The first supplied recording day is the proposed start of a new habit; it is not evidence of the original creation date. To use an existing habit's detailed historical schedule, explicitly select that habit instead.

## Rillday CSV

Download the template from the import dialog. Use UTF-8, a comma separator and these column names:

```csv
habit_key,habit_name,kind,date,value,goal,unit,skipped,recorded_at,note
reading,Read a book,quantity,2024-02-29,15,20,min,false,21:30,One chapter
```

Each row is one daily aggregate. `habit_key` groups rows for one habit. Required columns are `habit_key`, `habit_name`, `kind`, `date`, `value`, `goal` and `unit`. Kind is `boolean` or `quantity`; Boolean records use a value of 0 or 1 and a goal of 1. Amounts support up to six decimal places, with no automatic rounding or unit conversion.

Optional columns are `skipped` (`true` or `false`, default false), `recorded_at` and `note`. An omitted day has no row. A recorded zero and an explicitly skipped day remain different states. Historical per-day goals are preserved when supplied. Use the same kind and unit throughout a habit group; different units require a separate deliberate conversion.

The latest supplied day's goal is proposed as the baseline for a new CSV habit. Review that baseline before importing; the original per-day goals remain separate snapshots.

Files may contain up to 8 MiB and 20,000 data rows. Spreadsheet formulas are not evaluated. Invalid rows prevent importing the affected habit; identical duplicate rows are included once. Unsupported optional columns are disclosed for review.

## Dates and recording times

The `date` column is the habit's accounting day, formatted `YYYY-MM-DD`. It stays on that day when devices change timezone.

Recording time is separate and optional:

- `2024-02-29T21:30:00+09:00` or a `Z` suffix represents an exact instant. Details show device-local time and the original offset-bearing value.
- `2024-02-29T21:30` has no timezone. Its original date and clock fields are preserved without conversion.
- `21:30` contains only a clock time. This is the TickTick Excel profile's form. The importer does not invent a recording date, timezone or missing seconds.
- An empty value stays unknown. Import time, midnight and server receipt time are not substitutes.

Recording time identifies the source's reported entry time, not proof of when a real-world action occurred. Editing an amount or note does not automatically retime a record. This feature preserves one daily aggregate and does not reconstruct multiple events within a day.

## Duplicates and conflicts

Importing the same file again suggests its previously created habit and skips identical days. These files do not provide a verified globally unique habit identity. **For a different export or overlapping period, explicitly select the existing habit to avoid creating another one.** Names alone never identify a target.

For an existing habit/date, differing values or metadata are shown side by side. Existing data is kept by default. You can explicitly replace individual days; amounts are never automatically added together. Changing the target after review requires another review. Concurrent offline edits use the normal synchronization conflict review.

A target must have compatible goal semantics and units. Importing does not silently move an existing habit's start date or rewrite its previous rules. Choose a new habit or resolve the history deliberately if records precede its start.

## Saving and recovery

Cancelling before confirmation changes nothing. Confirmed data is accepted as one document change and the result waits for local storage. If saving fails, use the normal storage retry before another import. Do not assume that a save error removed an already accepted in-memory change. Import does not provide a separate permanent undo ledger.

**Data backups → Import** remains whole-workspace restoration. Use **Import habits** for additions from another app. Update web and desktop clients together before synchronizing the new recording-time data format; older clients cannot read newer-format documents.
