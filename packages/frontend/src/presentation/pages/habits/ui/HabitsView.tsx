import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Button } from '@repo/ui/components/button';
import { Toggle } from '@repo/ui/components/toggle';
import { cn } from 'cn';
import { Archive, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Temporal, Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import {
  type Habit,
  type HabitCheckinAction,
  addDays,
  createHabitDraft,
  dateKey,
  habitDayProgress,
  habitToday,
  startOfWeek,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { WorkspaceHeader } from '../../../shared/ui/WorkspaceHeader';
import { HabitDetail } from './HabitDetail';
import { HabitEditor } from './HabitEditor';
import { HabitProgressRing } from './HabitProgressRing';
import { HabitWeekTable } from './HabitWeekTable';

export function HabitsView() {
  const { t, dateLocale } = useI18n();
  const { preferences } = useAppPreferences();

  const weekStart = (date: string) => startOfWeek(date, preferences.weekStartsOn);

  const { data, apply, persistence, notify, selectTask, runOperation } = useWorkspace();
  const [anchor, setAnchor] = useState(() => dateKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [logDate, setLogDate] = useState(() => dateKey());
  const [statsMonth, setStatsMonth] = useState(() => dateKey());
  const detailRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width:899px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width:899px)');

    const change = () => {
      if (detailRef.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }

      setNarrow(media.matches);
    };

    media.addEventListener('change', change);

    return () => media.removeEventListener('change', change);
  }, []);

  function closeDetail() {
    if (detailRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }

    setSelectedId(null);
    requestAnimationFrame(() => {
      const target = openerRef.current?.isConnected
        ? openerRef.current
        : document.querySelector<HTMLButtonElement>('.workspace-actions button');
      target?.focus({ preventScroll: true });
    });
  }

  function openDetail(habit: Habit, date: string) {
    openerRef.current = document.activeElement as HTMLElement;
    setSelectedId(habit.id);
    setLogDate(date);
    setStatsMonth(date);
  }

  const today = dateKey();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const selected = data.habits.find((habit) => habit.id === selectedId) || null;
  useEffect(() => {
    selectTask(null);
  }, [selectTask]);

  function setLog(habit: Habit, date: string, action: HabitCheckinAction) {
    runOperation(() => persistence.changeHabitCheckin(habit.id, date, action));
  }

  function toggleLog(habit: Habit, date: string) {
    runOperation(() => {
      if (persistence.toggleHabit(habit.id, date) === 'quantity') {
        openDetail(habit, date);
      }
    });
  }

  function archive(habit: Habit) {
    const accepted = apply({ type: 'habit.archive', id: habit.id, archived: !habit.archived });

    if (!accepted) {
      return;
    }

    if (selectedId === habit.id) {
      closeDetail();
    }

    notify(t(habit.archived ? 'habits.restored' : 'habits.archived'), { undoable: true });
  }

  function remove(habit: Habit) {
    const accepted = apply({ type: 'habit.remove', id: habit.id });

    if (!accepted) {
      return;
    }

    setSelectedId(null);
    setDeleting(null);
  }

  const todayProgress = habitDayProgress(data.habits, data.habitLogs, today);

  return (
    <section className="habits-view [--habit-inset:var(--layout-page-inset)] relative h-full min-h-0 flex min-w-0 bg-background text-foreground [&_button]:text-inherit [&_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35 [&_button:focus-visible]:[outline:2px_solid_var(--ring)] [&_button:focus-visible]:outline-offset-2 [@media(max-width:_899px)]:[--habit-inset:var(--layout-page-inset-compact)]">
      <div
        className="habits-main flex-1 min-w-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [container-type:inline-size]"
        inert={narrow && Boolean(selected)}
      >
        <WorkspaceHeader title={t('area.habits', { ns: 'labels' })}>
          <Toggle
            pressed={showArchived}
            className={cn(showArchived ? 'active' : '')}
            title={t('habits.archivedHeading')}
            aria-label={t('habits.archivedHeading')}
            onPressedChange={(archived) => {
              setShowArchived(archived);
              setSelectedId(null);
            }}
          >
            <Archive className="size-4 inline-block shrink-0 align-middle" />
          </Toggle>
          <ButtonPrimitive
            onClick={() => setEditor(createHabitDraft(t('habits.times')))}
            className={'habits-add [.workspace-actions_>_&]:text-link'}
          >
            <Plus className="size-4 inline-block shrink-0 align-middle" />
            {t('habits.add')}
          </ButtonPrimitive>
        </WorkspaceHeader>
        <div className="habits-summary flex items-center justify-between my-(--layout-section-gap) mx-(--habit-inset) gap-6 [&_h2]:m-0 [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:leading-(--text-xl--line-height) [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:[margin:8px_0_0] [&_p]:leading-(--text-xs--line-height) [@media(max-width:_899px)]:gap-4 [@media(max-width:_380px)]:[&_h2]:text-lg [@media(max-width:_380px)]:[&_h2]:leading-(--text-lg--line-height)">
          <div>
            <h2>{showArchived ? t('habits.archivedHeading') : t('habits.todayHeading')}</h2>
            <p>
              {showArchived
                ? t('habits.restoreHint')
                : t('habits.scheduledProgress', {
                    count: todayProgress.total,
                    total: todayProgress.total,
                    done: todayProgress.completed,
                  })}
            </p>
          </div>
          {!showArchived && (
            <HabitProgressRing
              {...todayProgress}
              label={t('habits.todayProgress', {
                count: todayProgress.total,
                done: todayProgress.completed,
                total: todayProgress.total,
              })}
            />
          )}
        </div>
        <div className="habits-week-nav flex items-center gap-3 [margin:0_var(--habit-inset)_16px] justify-between text-muted-foreground text-sm leading-(--text-sm--line-height) [&_button]:w-8 [&_button]:h-8 [&_button]:p-0 [&_button]:border-0 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:grid [&_button]:place-items-center [&_button]:text-muted-foreground [&_button]:shrink-0 [&_button:hover]:bg-surface-hover [&_button:hover]:text-foreground [@media(max-width:_899px)]:gap-2 [@media(max-width:_380px)]:items-start [@media(max-width:_380px)]:flex-col [@media(max-width:_380px)]:gap-2">
          <span className="habit-week-range">
            {new TemporalIntl.DateTimeFormat(dateLocale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }).formatRange(Temporal.PlainDate.from(dates[0]), Temporal.PlainDate.from(dates[6]))}
          </span>
          <div className="habit-week-controls flex items-center gap-1 shrink-0 [@media(max-width:_380px)]:self-end">
            <ButtonPrimitive
              aria-label={t('dates.previousWeek')}
              onClick={() => setAnchor(addDays(anchor, -7))}
            >
              <ChevronLeft className="size-4 inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
            <ButtonPrimitive
              onClick={() => setAnchor(today)}
              className={
                'habits-today [.habits-week-nav_&]:w-auto [.habits-week-nav_&]:py-1 [.habits-week-nav_&]:px-2 [.habits-week-nav_&]:whitespace-nowrap'
              }
            >
              {t('dates.thisWeek')}
            </ButtonPrimitive>
            <ButtonPrimitive
              aria-label={t('dates.nextWeek')}
              onClick={() => setAnchor(addDays(anchor, 7))}
            >
              <ChevronRight className="size-4 inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
          </div>
        </div>
        <HabitWeekTable
          dates={dates}
          today={today}
          showArchived={showArchived}
          selectedId={selectedId}
          openDetail={openDetail}
          toggleLog={toggleLog}
          archive={archive}
          onEdit={(habit) => setEditor(structuredClone(habit))}
          onDelete={setDeleting}
          onCreate={() => setEditor(createHabitDraft(t('habits.times')))}
        />
      </div>
      {selected && (
        <HabitDetail
          habit={selected}
          detailRef={detailRef}
          narrow={narrow}
          logDate={logDate}
          statsMonth={statsMonth}
          closeDetail={closeDetail}
          onDateChange={setLogDate}
          onMonthChange={setStatsMonth}
          onEdit={() => setEditor(structuredClone(selected))}
          onArchive={() => archive(selected)}
          onDelete={() => setDeleting(selected)}
          onLogChange={(patch) => setLog(selected, logDate, patch)}
        />
      )}
      {deleting && (
        <WorkspaceDialog
          title={t('habits.delete')}
          description={t('habits.deleteConfirmation', { name: deleting.name })}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDeleting(null)}
                className={
                  'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'
                }
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => remove(deleting)}
                className={
                  'h-(--control-height) min-w-18 bg-button-destructive text-destructive-foreground hover:bg-button-destructive-hover'
                }
              >
                {t('common.delete')}
              </Button>
            </>
          }
        />
      )}
      {editor && (
        <HabitEditor
          key={editor.id}
          initialHabit={editor}
          close={() => setEditor(null)}
          onSaved={(saved) => {
            setSelectedId(saved.id);
            setLogDate(habitToday(saved));
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
