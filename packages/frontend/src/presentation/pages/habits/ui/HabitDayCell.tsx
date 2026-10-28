import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
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

const markerStyles = {
  'complete': 'rounded-full bg-habit-color text-habit-on-color',
  'recorded': 'rounded-md bg-habit-color/15 text-foreground',
  'empty': 'rounded-full border-muted-foreground',
  'skipped': 'rounded-full border-dashed border-muted-foreground text-muted-foreground',
  'future': 'text-muted-foreground',
  'not-scheduled': 'text-muted-foreground',
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
  let state: keyof typeof markerStyles = 'empty';
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
  const action =
    habit.kind === 'quantity'
      ? t('habits.editRecord')
      : done
        ? t('tasks.markIncomplete')
        : t('habits.checkIn');
  let mark: ReactNode = null;
  if (unavailable || future) {
    mark = <Minus size={14} />;
  } else if (log?.skipped) {
    mark = <SkipForward size={14} />;
  } else if (done) {
    mark = <Check size={15} strokeWidth={2.5} />;
  } else if (recorded) {
    mark = (
      <span className="block max-w-full truncate px-0.5 text-xs font-medium tabular-nums">
        {formatAmount(amount)}
      </span>
    );
  }

  const control = (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      title={t('habits.dateStatus', { date: formatDate(date), status })}
      aria-label={t('habits.dayAction', { name: habit.name, date: formatDate(date), action })}
      aria-description={status}
      aria-pressed={habit.kind === 'boolean' ? done : undefined}
      onClick={habit.kind === 'quantity' ? undefined : onToggle}
      data-state={state}
      className={cn(
        'habit-day relative grid h-9 w-[min(36px,100%)] place-items-center rounded-md border-0 bg-transparent p-0 disabled:opacity-100',
        date === today && 'today',
        done && 'done',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'habit-day-mark relative grid size-7 place-items-center overflow-hidden border border-transparent',
          markerStyles[state],
        )}
      >
        {mark}
        {partial && (
          <span className="absolute right-1 bottom-0.5 left-1 h-0.5 overflow-hidden rounded-full bg-habit-color/20">
            <span
              className="block h-full rounded-full bg-habit-color"
              style={{ width: `${Math.min(100, (amount / (log?.goal ?? habit.goal)) * 100)}%` }}
            />
          </span>
        )}
      </span>
    </Button>
  );

  return (
    <div className="habit-day-wrap flex justify-center">
      {habit.kind === 'quantity' ? (
        <Popover.Root modal="trap-focus">
          <Popover.Trigger render={control} />
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
        control
      )}
    </div>
  );
}
