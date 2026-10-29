import { Button } from '@repo/ui/components/button';
import { cn } from 'cn';
import { Archive, Flame, Pencil, Plus, RotateCcw, Sprout, Trash2 } from 'lucide-react';
import { Fragment } from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import {
  type Habit,
  type HabitCheckinAction,
  habitAt,
  habitDayProgress,
  habitLogFor,
  habitScheduled,
  habitStats,
  habitToday,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceActions } from '#shared/ui/WorkspaceActions';
import { HabitDayCell } from './HabitDayCell';
import { HabitProgressRing } from './HabitProgressRing';
import { HabitWeeklyProgress } from './HabitWeeklyProgress';
import { habitColors, useHabitAmountFormat, useHabitDisplay } from './habit-display';
import { HabitGlyph } from './habit-icons';

const weekColumns =
  'grid-cols-[minmax(200px,_6fr)_repeat(7,_minmax(36px,_1fr))_136px] [@container((max-width:_760px))]:grid-cols-[repeat(7,_minmax(0,_1fr))]';

interface HabitWeekTableProps {
  dates: string[];
  today: string;
  showArchived: boolean;
  selectedId: string | null;
  openDetail: (habit: Habit, date: string) => void;
  toggleLog: (habit: Habit, date: string) => void;
  onLogChange: (habit: Habit, date: string, action: HabitCheckinAction) => void;
  archive: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onCreate: () => void;
}

export function HabitWeekTable({
  dates,
  today,
  showArchived,
  selectedId,
  openDetail,
  toggleLog,
  onLogChange,
  archive,
  onEdit,
  onDelete,
  onCreate,
}: HabitWeekTableProps) {
  const { t, formatDate } = useI18n();
  const { preferences } = useAppPreferences();
  const { data } = useWorkspace();
  const { dayNames, scheduleLabel } = useHabitDisplay();
  const formatAmount = useHabitAmountFormat();
  const habits = data.habits.filter((habit) => habit.archived === showArchived);
  const grouped = habits.some((habit) => habit.timeOfDay && habit.timeOfDay !== 'anytime');
  const groupOrder = ['morning', 'afternoon', 'evening', 'anytime'];
  const ordered = grouped
    ? habits.toSorted(
        (a, b) =>
          groupOrder.indexOf(a.timeOfDay ?? 'anytime') -
          groupOrder.indexOf(b.timeOfDay ?? 'anytime'),
      )
    : habits;
  const weeklyProgress = dates.map((date) => habitDayProgress(data.habits, data.habitLogs, date));

  return (
    <div className="habit-table [margin:0_var(--habit-inset)_24px]">
      <div
        className={cn(
          'habit-table-head mb-3 grid min-h-22 items-center text-xs text-muted-foreground [@container((max-width:_760px))]:px-2',
          weekColumns,
        )}
      >
        <span className="habit-column-label self-end pb-3 pl-4 text-sm [@container((max-width:_760px))]:hidden">
          {showArchived ? t('habits.archiveHeading') : t('habits.myHabits')}
        </span>
        {dates.map((date, index) => {
          const day = Temporal.PlainDate.from(date);
          const current = date === today;
          return (
            <div
              key={date}
              className={cn('flex flex-col items-center gap-2 text-center', current && 'today')}
            >
              <span className={cn(current && 'font-medium text-primary')}>
                {dayNames[day.dayOfWeek % 7]}
              </span>
              <time
                dateTime={date}
                aria-current={current ? 'date' : undefined}
                title={formatDate(date)}
                className={cn(
                  'grid size-7 place-items-center rounded-full text-sm tabular-nums',
                  current ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground',
                )}
              >
                {day.day}
              </time>
              {!showArchived && (
                <HabitProgressRing
                  {...weeklyProgress[index]}
                  compact
                  label={t('habits.dateProgress', {
                    count: weeklyProgress[index].total,
                    date: formatDate(date),
                    done: weeklyProgress[index].completed,
                    total: weeklyProgress[index].total,
                  })}
                />
              )}
            </div>
          );
        })}
        <span className="[@container((max-width:_760px))]:hidden" />
      </div>
      {ordered.map((habit, index) => (
        <Fragment key={habit.id}>
          {grouped &&
            (index === 0 ||
              (ordered[index - 1].timeOfDay ?? 'anytime') !== (habit.timeOfDay ?? 'anytime')) && (
              <h3 className="habit-time-group mb-3 mt-6 px-4 text-xs font-medium text-muted-foreground">
                {t(`habits.${habit.timeOfDay ?? 'anytime'}`)}
              </h3>
            )}
          <div
            className={cn(
              weekColumns,
              'habit-row grid items-center min-h-(--habit-row-height) mb-3 rounded-lg bg-surface-inset relative hover:bg-surface-hover [@container((max-width:_760px))]:[padding:0_8px_8px]',
              selectedId === habit.id
                ? 'selected bg-surface-selected hover:bg-surface-selected'
                : '',
            )}
            style={habitColors(habit.color)}
          >
            <div className="habit-row-heading contents [@container((max-width:_760px))]:col-span-full [@container((max-width:_760px))]:grid [@container((max-width:_760px))]:grid-cols-[minmax(0,1fr)_auto] [@container((max-width:_760px))]:items-center">
              <Button
                variant="ghost"
                onClick={() => openDetail(habit, habitToday(habit))}
                className="habit-name h-auto min-w-0 transition-colors border-0 bg-transparent p-4 text-left hover:bg-transparent dark:hover:bg-transparent [@container((min-width:_761px))]:[:root[data-density='compact']_&]:py-2 [@container((max-width:_760px))]:p-2"
              >
                <span className="habit-identity grid w-full min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 text-left">
                  <span
                    className="habit-symbol grid size-9 shrink-0 place-items-center rounded-lg bg-habit-color/15 text-2xl text-habit-color"
                    aria-hidden="true"
                  >
                    <HabitGlyph value={habit.icon} />
                  </span>
                  <span className="habit-copy flex min-w-0 flex-col gap-2">
                    <strong className="truncate text-sm font-medium [@container((max-width:_760px))]:whitespace-normal [@container((max-width:_760px))]:wrap-anywhere">
                      {habit.name}
                    </strong>
                    <small className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-normal text-secondary-foreground">
                      <Flame className="size-3 inline-block shrink-0 align-middle" />
                      {t(
                        habit.frequency.startsWith('weekly')
                          ? 'habits.weekStreakCount'
                          : 'habits.dayStreakCount',
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
                      {habit.kind === 'quantity' ? ` · ${habit.goal} ${habit.unit}` : ''}
                    </small>
                    {habit.frequency === 'weekly-total' && (
                      <HabitWeeklyProgress
                        habit={habit}
                        date={dates.includes(habitToday(habit)) ? habitToday(habit) : dates[6]}
                      />
                    )}
                  </span>
                </span>
              </Button>
              <div className="habit-menu-anchor grid grid-cols-[minmax(0,1fr)_32px] items-center gap-2 px-3 [@container((min-width:_761px))]:col-start-9 [@container((min-width:_761px))]:row-start-1 [@container((max-width:_760px))]:grid-flow-col [@container((max-width:_760px))]:auto-cols-max [@container((max-width:_760px))]:grid-cols-none [@container((max-width:_760px))]:px-1">
                {habit.kind === 'quantity' &&
                  !habit.archived &&
                  dates.includes(habitToday(habit)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!habitScheduled(habit, habitToday(habit))}
                      title={t('habits.quickAdd', {
                        step: habit.step ?? 1,
                        unit: habit.unit,
                        name: habit.name,
                      })}
                      aria-label={t('habits.quickAdd', {
                        step: habit.step ?? 1,
                        unit: habit.unit,
                        name: habit.name,
                      })}
                      onClick={() => toggleLog(habit, habitToday(habit))}
                      className="habit-quick-add col-start-1 [@container((max-width:_760px))]:col-auto min-w-0 max-w-full justify-self-end px-1.5 text-xs tabular-nums"
                    >
                      <Plus size={14} />
                      <span className="min-w-0 truncate">{formatAmount(habit.step ?? 1)}</span>
                    </Button>
                  )}
                <WorkspaceActions
                  className="col-start-2 size-8 [@container((max-width:_760px))]:col-auto"
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
            {dates.map((date) => (
              <HabitDayCell
                key={date}
                habit={habitAt(habit, date)}
                date={date}
                today={today}
                log={habitLogFor(data.habitLogs, habit.id, date)}
                onToggle={() => toggleLog(habit, date)}
                onLogChange={(action) => onLogChange(habit, date, action)}
              />
            ))}
          </div>
        </Fragment>
      ))}
      {!habits.length && (
        <div className="habit-empty py-16 px-4 text-center text-muted-foreground [&_>_svg]:opacity-50 [&_>_svg]:text-link [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_h2]:[margin:16px_0_8px] [&_h2]:leading-(--text-base--line-height) [&_p]:text-sm [&_p]:leading-(--text-sm--line-height)">
          <Sprout className="size-10 inline-block shrink-0 align-middle" />
          <h2>{showArchived ? t('habits.archiveEmpty') : t('habits.emptyHeading')}</h2>
          <p>{showArchived ? t('habits.archiveEmptyDescription') : t('habits.emptyDescription')}</p>
          {!showArchived && (
            <Button variant="outline" className="mt-3 text-link" onClick={onCreate}>
              <Plus className="size-3.5 inline-block shrink-0 align-middle" />
              {t('habits.createFirst')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
