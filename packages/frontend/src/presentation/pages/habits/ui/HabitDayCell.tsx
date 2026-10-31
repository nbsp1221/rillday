import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { cn } from 'cn';
import { Check, Minus, SkipForward } from 'lucide-react';
import {
  type Habit,
  type HabitCheckinAction,
  type HabitLog,
  habitDone,
  habitScheduled,
  habitToday,
} from '#application';
import { useI18n } from '#shared/i18n';
import { HabitCheckin } from './HabitCheckin';
import { habitColors, useHabitAmountFormat } from './habit-display';

const stateStyles = {
  'complete':
    'border-transparent bg-habit-color text-habit-on-color enabled:hover:bg-habit-color enabled:hover:text-habit-on-color enabled:hover:shadow-[inset_0_0_0_2px_color-mix(in_srgb,_var(--habit-on-color)_30%,_transparent)] aria-expanded:bg-habit-color aria-expanded:text-habit-on-color',
  'recorded':
    'border-transparent bg-habit-color/15 text-foreground enabled:hover:bg-habit-color/25 aria-expanded:bg-habit-color/25',
  'empty':
    'border-muted-foreground bg-transparent enabled:hover:border-foreground enabled:hover:bg-muted',
  'skipped':
    'border-dashed border-muted-foreground bg-transparent text-muted-foreground enabled:hover:border-foreground enabled:hover:bg-muted',
  'future': 'border-transparent bg-transparent text-muted-foreground',
  'not-scheduled': 'border-transparent bg-transparent text-muted-foreground',
};

export function HabitDayCell({
  habit,
  date,
  today,
  log,
  onToggle,
  onLogChange,
}: {
  habit: Habit;
  date: string;
  today: string;
  log?: HabitLog;
  onToggle: () => void;
  onLogChange: (action: HabitCheckinAction) => void;
}) {
  const { t, formatDate } = useI18n();
  const formatAmount = useHabitAmountFormat();
  const done = habitDone(habit, log);
  const scheduled = habitScheduled(habit, date);
  const future = date > habitToday(habit);
  const unavailable = !scheduled && !log;
  const disabled = habit.archived || future || unavailable;
  const amount = log?.value ?? 0;
  const recorded = habit.kind === 'quantity' && amount > 0 && !log?.skipped;
  const partial = recorded && !done && habit.frequency !== 'weekly-total';
  let state: keyof typeof stateStyles = 'empty';
  if (unavailable) {
    state = 'not-scheduled';
  } else if (future) {
    state = 'future';
  } else if (log?.skipped) {
    state = 'skipped';
  } else if (done) {
    state = 'complete';
  } else if (recorded) {
    state = 'recorded';
  }
  const shape = habit.kind === 'quantity' ? 'rounded-md' : 'rounded-full';
  let status: string;
  if (unavailable) {
    status = t('habits.notScheduled');
  } else if (future) {
    status = t('habits.upcoming');
  } else if (log?.skipped) {
    status = t('habits.skipped');
  } else if (habit.frequency === 'weekly-total') {
    status = t('habits.recordedAmount', { value: amount, unit: log?.unit ?? habit.unit });
  } else if (habit.kind === 'quantity') {
    status = t('habits.progressValue', {
      value: amount,
      goal: log?.goal ?? habit.goal,
      unit: log?.unit ?? habit.unit,
    });
  } else {
    status = t(done ? 'common.complete' : 'habits.incomplete');
  }
  let mark: ReactNode = null;
  if (unavailable || future) {
    mark = <Minus size={14} />;
  } else if (log?.skipped) {
    mark = <SkipForward size={14} />;
  } else if (habit.kind === 'quantity') {
    mark = (
      <span className="block max-w-full truncate px-0.5 text-xs font-medium tabular-nums">
        {formatAmount(amount)}
      </span>
    );
  } else if (done) {
    mark = <Check size={15} strokeWidth={2.5} />;
  }

  const controlStyles = cn(
    'habit-day relative grid size-7 shrink-0 place-items-center border p-0 shadow-none transition-[background-color,border-color,box-shadow] focus-visible:ring-ring disabled:opacity-100',
    shape,
    stateStyles[state],
    date === today && 'today',
    state === 'complete' && 'done',
  );
  const quantityControl = (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      title={t('habits.dateStatus', { date: formatDate(date), status })}
      aria-label={t('habits.dayAction', {
        name: habit.name,
        date: formatDate(date),
        action: t('habits.editRecord'),
      })}
      aria-description={status}
      data-state={state}
      className={controlStyles}
    >
      {mark}
      {partial && (
        <span
          aria-hidden="true"
          className="absolute right-1 bottom-0.5 left-1 h-0.5 overflow-hidden rounded-full bg-habit-color/20"
        >
          <span
            className="block h-full rounded-full bg-habit-color"
            style={{ width: `${Math.min(100, (amount / (log?.goal ?? habit.goal)) * 100)}%` }}
          />
        </span>
      )}
    </Button>
  );

  return (
    <div className="habit-day-wrap relative grid h-9 place-items-center">
      {habit.kind === 'quantity' ? (
        <Popover.Root modal="trap-focus">
          <Popover.Trigger render={quantityControl} />
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} collisionPadding={8} className="isolate z-50">
              <Popover.Popup
                aria-label={t('habits.editRecord')}
                style={habitColors(habit.color)}
                className="habit-record-panel w-80 max-w-[calc(100vw-24px)] max-h-(--available-height) overflow-auto rounded-lg bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
              >
                <Popover.Title className="text-sm font-medium">{habit.name}</Popover.Title>
                <HabitCheckin
                  key={`${habit.id}:${date}`}
                  habit={habit}
                  log={log}
                  date={date}
                  onChange={onLogChange}
                />
                <Popover.Close render={<Button variant="ghost" className="mt-2 w-full" />}>
                  {t('common.close')}
                </Popover.Close>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <>
          <Checkbox
            render={<button type="button" />}
            nativeButton
            checked={state === 'complete'}
            onCheckedChange={onToggle}
            disabled={disabled}
            data-state={state}
            title={t('habits.dateStatus', { date: formatDate(date), status })}
            aria-label={t('habits.dayLabel', { name: habit.name, date: formatDate(date) })}
            aria-description={status}
            className={cn(
              controlStyles,
              'cursor-pointer after:inset-0 dark:bg-transparent data-checked:border-habit-color data-checked:bg-habit-color data-checked:text-habit-on-color dark:data-checked:bg-habit-color data-checked:enabled:hover:border-habit-color data-checked:enabled:hover:bg-habit-color',
            )}
          />
          {(unavailable || future || log?.skipped) && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"
            >
              {mark}
            </span>
          )}
        </>
      )}
    </div>
  );
}
