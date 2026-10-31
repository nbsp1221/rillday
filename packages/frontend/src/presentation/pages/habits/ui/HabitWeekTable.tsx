import type { ReactNode } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import {
  Archive,
  Check,
  Flame,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  SkipForward,
  Sprout,
  Trash2,
} from 'lucide-react';
import { Temporal } from 'temporal-polyfill/implementation';
import {
  type Habit,
  type HabitLog,
  habitAt,
  habitDayProgress,
  habitDone,
  habitLogFor,
  habitScheduled,
  habitStats,
  habitToday,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceActions } from '#shared/ui/WorkspaceActions';
import { HabitProgressRing } from './HabitProgressRing';
import { habitColors, useHabitDisplay } from './habit-display';
import { HabitGlyph } from './habit-icons';

interface HabitWeekTableProps {
  dates: string[];
  today: string;
  showArchived: boolean;
  selectedId: string | null;
  openDetail: (habit: Habit, date: string) => void;
  toggleLog: (habit: Habit, date: string) => void;
  archive: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onCreate: () => void;
}

function HabitDay({
  habit,
  date,
  today,
  log,
  onToggle,
}: {
  habit: Habit;
  date: string;
  today: string;
  log: HabitLog | undefined;
  onToggle: () => void;
}) {
  const { t, formatDate } = useI18n();
  const done = habitDone(habit, log);
  const scheduled = habitScheduled(habit, date);
  const disabled = date > habitToday(habit) || !scheduled || habit.archived;
  let status: string;

  if (log?.skipped) {
    status = t('habits.skipped');
  } else if (done) {
    status = t('common.complete');
  } else if (!scheduled) {
    status = t('habits.notScheduled');
  } else if (habit.kind === 'quantity') {
    status = t('habits.progressValue', {
      value: log?.value || 0,
      goal: habit.goal,
      unit: habit.unit,
    });
  } else {
    status = t('habits.incomplete');
  }

  const action =
    habit.kind === 'quantity'
      ? t('habits.increaseProgress', {
          value: log?.value || 0,
          goal: habit.goal,
          unit: habit.unit,
        })
      : done
        ? t('tasks.markIncomplete')
        : t('habits.checkIn');
  let mark: ReactNode;

  if (log?.skipped) {
    mark = <SkipForward className="size-3.5 inline-block shrink-0 align-middle" />;
  } else if (done) {
    mark = <Check className="size-3.5 inline-block shrink-0 align-middle" />;
  } else if (habit.kind === 'quantity' && Boolean(log?.value)) {
    mark = <span>{log?.value}</span>;
  } else if (!scheduled) {
    mark = <Minus className="size-3 inline-block shrink-0 align-middle" />;
  } else {
    mark = <span className="habit-day-dot w-[3px] h-[3px] bg-habit-color rounded-full" />;
  }

  return (
    <div className="habit-day-wrap flex justify-center">
      <ButtonPrimitive
        disabled={disabled}
        title={t('habits.dateStatus', { date: formatDate(date), status })}
        aria-label={t('habits.dayAction', {
          name: habit.name,
          date: formatDate(date),
          action,
        })}
        aria-pressed={habit.kind === 'boolean' ? done : undefined}
        onClick={onToggle}
        className={cn(
          "habit-day w-[min(36px,_100%)] h-9 border-0 rounded-md grid place-items-center bg-transparent text-foreground p-0 text-xs leading-(--text-xs--line-height) relative isolate [&::before]:[content:''] [&::before]:absolute [&::before]:inset-1 [&::before]:rounded-full [&::before]:bg-popover [&::before]:z-[-1] [&:hover:not(:disabled)::before]:[background:color-mix(in_srgb,_var(--habit-color)_20%,_var(--popover))] [@media(max-width:_380px)]:w-[min(32px,_100%)] [@media(max-width:_380px)]:h-9",
          done
            ? 'done text-habit-on-color [&::before]:bg-habit-color [&:hover:not(:disabled)::before]:bg-habit-color [.habit-history-grid_button&]:bg-habit-color [.habit-history-grid_button&]:text-habit-on-color [.habit-history-grid_button&:hover:not(:disabled)]:bg-habit-color [.habit-history-grid_button&:hover:not(:disabled)]:text-habit-on-color [.habit-history-grid_button&:hover:not(:disabled)]:shadow-[inset_0_0_0_2px_color-mix(in_srgb,_var(--habit-on-color)_30%,_transparent)]'
            : '',
          log?.skipped
            ? 'skipped text-muted-foreground [.habit-history-grid_button&]:bg-transparent [.habit-history-grid_button&]:border-separator'
            : '',
          !scheduled ? 'not-scheduled text-muted-foreground [&::before]:bg-transparent' : '',
          date === today
            ? 'today [.habit-table-head_&_strong]:text-foreground [.habit-table-head_&_strong]:bg-popover [.habit-table-head_&_strong]:rounded-full [&:not(.done):not(:disabled)::before]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,_var(--habit-color)_50%,_transparent)]'
            : '',
        )}
      >
        {mark}
      </ButtonPrimitive>
    </div>
  );
}

export function HabitWeekTable({
  dates,
  today,
  showArchived,
  selectedId,
  openDetail,
  toggleLog,
  archive,
  onEdit,
  onDelete,
  onCreate,
}: HabitWeekTableProps) {
  const { t, formatDate } = useI18n();
  const { preferences } = useAppPreferences();
  const { data } = useWorkspace();
  const { dayNames, scheduleLabel } = useHabitDisplay();
  const habits = data.habits.filter((habit) => habit.archived === showArchived);

  return (
    <div className="habit-table [margin:0_var(--habit-inset)_24px]">
      <div className="habit-table-head grid grid-cols-[minmax(200px,_6fr)_repeat(7,_minmax(36px,_1fr))_64px] items-center min-h-22 mb-3 text-xs text-muted-foreground leading-(--text-xs--line-height) [&_>_span:first-child]:pl-4 [&_>_span:first-child]:text-sm [&_>_span:first-child]:leading-(--text-sm--line-height) [&_>_div]:flex [&_>_div]:flex-col [&_>_div]:gap-2 [&_>_div]:text-center [&_>_div]:items-center [&_strong]:font-normal [&_strong]:text-sm [&_strong]:w-6 [&_strong]:h-6 [&_strong]:flex [&_strong]:items-center [&_strong]:justify-center [&_strong]:leading-(--text-sm--line-height) [@container((max-width:_760px))]:grid-cols-[repeat(7,_minmax(0,_1fr))] [@container((max-width:_760px))]:[&_>_span:last-child]:hidden [@container((max-width:_760px))]:px-2">
        <span className="habit-column-label [align-self:end] pb-3 [@container((max-width:_760px))]:hidden">
          {showArchived ? t('habits.archiveHeading') : t('habits.myHabits')}
        </span>
        {dates.map((date) => {
          const day = Temporal.PlainDate.from(date);
          const progress = habitDayProgress(data.habits, data.habitLogs, date);

          return (
            <div
              key={date}
              className={cn(
                date === today
                  ? 'today [.habit-table-head_&_strong]:text-foreground [.habit-table-head_&_strong]:bg-popover [.habit-table-head_&_strong]:rounded-full'
                  : '',
              )}
            >
              <span>{dayNames[day.dayOfWeek % 7]}</span>
              <strong>{day.day}</strong>
              {!showArchived && (
                <HabitProgressRing
                  {...progress}
                  compact
                  label={t('habits.dateProgress', {
                    count: progress.total,
                    date: formatDate(date),
                    done: progress.completed,
                    total: progress.total,
                  })}
                />
              )}
            </div>
          );
        })}
        <span />
      </div>
      {habits.map((habit) => (
        <div
          key={habit.id}
          className={cn(
            'habit-row grid grid-cols-[minmax(200px,_6fr)_repeat(7,_minmax(36px,_1fr))_64px] items-center min-h-(--habit-row-height) mb-3 rounded-lg bg-surface-inset relative hover:bg-surface-hover [@container((max-width:_760px))]:grid-cols-[repeat(7,_minmax(0,_1fr))] [@container((max-width:_760px))]:[padding:0_8px_8px]',
            selectedId === habit.id
              ? 'selected bg-surface-selected hover:bg-surface-selected [.habit-history-grid_button&]:[outline:1px_solid_var(--ring)] [.habit-history-grid_button&]:outline-offset-[1px] [.habit-weekday-select_button&]:border-link [.habit-weekday-select_button&]:[background:color-mix(in_srgb,_var(--primary)_20%,_transparent)] [.habit-weekday-select_button&]:text-link'
              : '',
          )}
          style={habitColors(habit.color)}
        >
          <ButtonPrimitive
            onClick={() => openDetail(habit, habitToday(habit))}
            className={
              "habit-name hover:bg-transparent flex items-center gap-3 text-left border-0 bg-transparent p-4 min-w-0 [&_>_span:last-child]:min-w-0 [&_>_span:last-child]:flex [&_>_span:last-child]:flex-col [&_>_span:last-child]:gap-2 [&_strong]:text-sm [&_strong]:font-medium [&_strong]:whitespace-nowrap [&_strong]:text-ellipsis [&_strong]:overflow-hidden [&_strong]:leading-(--text-sm--line-height) [&_small]:text-xs [&_small]:text-muted-foreground [&_small]:leading-(--text-xs--line-height) [&_small]:flex [&_small]:items-center [&_small]:gap-1 [&_small]:whitespace-nowrap [&_small]:overflow-hidden [&_small]:text-ellipsis [@container((min-width:_761px))]:[:root[data-density='compact']_&]:py-2 [@container((min-width:_761px))]:[:root[data-density='compact']_&_>_span:last-child]:gap-1 [@container((max-width:_760px))]:[grid-column:1_/_-1] [@container((max-width:_760px))]:[padding:12px_56px_12px_12px]"
            }
          >
            <span
              className="habit-symbol w-9 h-9 flex items-center justify-center rounded-lg [background:color-mix(in_srgb,_var(--habit-color,_var(--primary))_14%,_transparent)] text-[color:var(--habit-color,_var(--primary))] text-2xl shrink-0 leading-(--text-2xl--line-height) [.habit-detail-title_&]:w-12 [.habit-detail-title_&]:h-12 [.habit-detail-title_&]:m-auto [.habit-detail-title_&]:text-3xl [.habit-detail-title_&]:leading-(--text-3xl--line-height)"
              aria-hidden="true"
            >
              <HabitGlyph value={habit.icon} />
            </span>
            <span>
              <strong>{habit.name}</strong>
              <small>
                <Flame className="size-3 inline-block shrink-0 align-middle" />
                {t(
                  habit.frequency === 'weekly' ? 'habits.weekStreakCount' : 'habits.dayStreakCount',
                  {
                    count: habitStats(
                      habit,
                      data.habitLogs,
                      habitToday(habit),
                      preferences.weekStartsOn,
                    ).streak,
                  },
                )}
                <span>·</span>
                {scheduleLabel(habit)}
                {habit.kind === 'quantity' ? ` · ${habit.goal}${habit.unit}` : ''}
              </small>
            </span>
          </ButtonPrimitive>
          {dates.map((date) => (
            <HabitDay
              key={date}
              habit={habitAt(habit, date)}
              date={date}
              today={today}
              log={habitLogFor(data.habitLogs, habit.id, date)}
              onToggle={() => toggleLog(habit, date)}
            />
          ))}
          <div className="habit-menu-anchor flex justify-center relative [@container((max-width:_760px))]:absolute [@container((max-width:_760px))]:right-3 [@container((max-width:_760px))]:top-3">
            <WorkspaceActions
              className="size-8"
              triggerClassName="size-8 [.habit-row:hover_&]:opacity-100 [.habit-row:focus-within_&]:opacity-100 aria-expanded:opacity-100 [@container(max-width:_760px)]:opacity-100 [@media(hover:_none)]:opacity-100"
              label={t('common.namedMenu', { name: habit.name })}
              items={[
                {
                  label: t('common.edit'),
                  icon: <Pencil className="size-3.5 inline-block shrink-0 align-middle" />,
                  action: () => onEdit(habit),
                },
                {
                  label: habit.archived ? t('common.restore') : t('common.archive'),
                  icon: habit.archived ? (
                    <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />
                  ) : (
                    <Archive className="size-3.5 inline-block shrink-0 align-middle" />
                  ),
                  action: () => archive(habit),
                },
                {
                  label: t('common.delete'),
                  icon: <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />,
                  destructive: true,
                  action: () => onDelete(habit),
                },
              ]}
            />
          </div>
        </div>
      ))}
      {!habits.length && (
        <div className="habit-empty py-16 px-4 text-center text-muted-foreground [&_>_svg]:opacity-50 [&_>_svg]:text-link [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_h2]:[margin:16px_0_8px] [&_h2]:leading-(--text-base--line-height) [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_button]:border [&_button]:border-separator [&_button]:rounded-md [&_button]:bg-popover [&_button]:py-2 [&_button]:px-3 [&_button]:inline-flex [&_button]:items-center [&_button]:gap-2 [&_button]:text-sm [&_button]:mt-3 [&_button]:text-link [&_button]:leading-(--text-sm--line-height)">
          <Sprout className="size-10 inline-block shrink-0 align-middle" />
          <h2>{showArchived ? t('habits.archiveEmpty') : t('habits.emptyHeading')}</h2>
          <p>{showArchived ? t('habits.archiveEmptyDescription') : t('habits.emptyDescription')}</p>
          {!showArchived && (
            <ButtonPrimitive onClick={onCreate}>
              <Plus className="size-3.5 inline-block shrink-0 align-middle" />
              {t('habits.createFirst')}
            </ButtonPrimitive>
          )}
        </div>
      )}
    </div>
  );
}
