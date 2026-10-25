import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Sheet, SheetTitle } from '@repo/ui/components/sheet';
import { cn } from 'cn';
import { Archive, BarChart3, Check, Flame, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { type ReactElement, type RefObject, useEffect } from 'react';
import {
  type Habit,
  type HabitCheckinAction,
  habitAt,
  habitLogFor,
  habitStats,
  habitToday,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { HabitCheckin } from './HabitCheckin';
import { HabitHistory } from './HabitHistory';
import { habitColors, useHabitDisplay } from './habit-display';
import { HabitGlyph } from './habit-icons';

function HabitDetailLayer({
  narrow,
  label,
  close,
  children,
}: {
  narrow: boolean;
  label: string;
  close: () => void;
  children: ReactElement;
}) {
  return narrow ? (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Popup
          render={children}
          aria-modal="true"
          aria-label={label}
          aria-describedby={undefined}
        />
      </DialogPrimitive.Portal>
    </Sheet>
  ) : (
    children
  );
}

interface HabitDetailProps {
  habit: Habit;
  detailRef: RefObject<HTMLElement | null>;
  narrow: boolean;
  logDate: string;
  statsMonth: string;
  closeDetail: () => void;
  onDateChange: (date: string) => void;
  onMonthChange: (month: string) => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onLogChange: (action: HabitCheckinAction) => void;
}

export function HabitDetail({
  habit,
  detailRef,
  narrow,
  logDate,
  statsMonth,
  closeDetail,
  onDateChange,
  onMonthChange,
  onEdit,
  onArchive,
  onDelete,
  onLogChange,
}: HabitDetailProps) {
  const { t } = useI18n();
  const { preferences } = useAppPreferences();
  const { data } = useWorkspace();
  const { scheduleLabel } = useHabitDisplay();
  const selectedLog = habitLogFor(data.habitLogs, habit.id, logDate);
  const stats = habitStats(habit, data.habitLogs, habitToday(habit), preferences.weekStartsOn);

  useEffect(() => {
    if (narrow) {
      return;
    }

    const escape = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        event.isComposing ||
        event.keyCode === 229 ||
        (event.target instanceof Node && !detailRef.current?.contains(event.target))
      ) {
        return;
      }

      event.preventDefault();
      closeDetail();
    };

    window.addEventListener('keydown', escape);

    return () => window.removeEventListener('keydown', escape);
  }, [narrow, detailRef, closeDetail]);

  return (
    <HabitDetailLayer narrow={narrow} label={habit.name} close={closeDetail}>
      <aside
        ref={detailRef}
        className={cn(
          'habit-detail w-84 min-w-0 shrink-0 [margin:12px_12px_12px_0] border border-separator rounded-lg bg-surface-inset overflow-hidden flex flex-col box-border outline-none',
          narrow &&
            'fixed z-50 inset-[calc(var(--workspace-header-height)_+_8px)_8px_8px_calc(var(--app-rail-width)_+_8px)] w-auto m-0',
        )}
        style={habitColors(habit.color)}
        aria-label={habit.name}
      >
        <div className="habit-detail-toolbar flex justify-end gap-1 [padding:8px_12px_0] shrink-0 [&_button]:w-8 [&_button]:h-8 [&_button]:p-0 [&_button]:border-0 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:grid [&_button]:place-items-center [&_button]:text-muted-foreground [&_button]:shrink-0 [&_button:hover]:bg-surface-hover [&_button:hover]:text-foreground">
          <ButtonPrimitive aria-label={t('habits.edit')} onClick={() => onEdit()}>
            <Pencil className="size-4 inline-block shrink-0 align-middle" />
          </ButtonPrimitive>
          <ButtonPrimitive aria-label={t('panels.closeDetails')} onClick={closeDetail}>
            <X className="size-4 inline-block shrink-0 align-middle" />
          </ButtonPrimitive>
        </div>
        <div className="habit-detail-body min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover overscroll-contain [padding:12px_20px_20px]">
          <div className="habit-detail-title text-center [margin:0_0_16px] [&_h2]:text-base [&_h2]:font-medium [&_h2]:[margin:12px_0_8px] [&_h2]:wrap-anywhere [&_h2]:leading-(--text-base--line-height) [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:m-0 [&_p]:leading-(--text-xs--line-height)">
            <span
              className="habit-symbol w-9 h-9 flex items-center justify-center rounded-lg [background:color-mix(in_srgb,_var(--habit-color,_var(--primary))_14%,_transparent)] text-[color:var(--habit-color,_var(--primary))] text-2xl shrink-0 leading-(--text-2xl--line-height) [.habit-detail-title_&]:w-12 [.habit-detail-title_&]:h-12 [.habit-detail-title_&]:m-auto [.habit-detail-title_&]:text-3xl [.habit-detail-title_&]:leading-(--text-3xl--line-height)"
              aria-hidden="true"
            >
              <HabitGlyph value={habit.icon} />
            </span>
            {narrow ? <SheetTitle render={<h2 />}>{habit.name}</SheetTitle> : <h2>{habit.name}</h2>}
            <p>
              {scheduleLabel(habit)} · {habit.goal}
              {habit.unit}
            </p>
          </div>
          {habit.zone && habit.zone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
            <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
              {t('habits.timeZoneDescription', { zone: habit.zone })}
            </p>
          )}
          <div className="habit-stats grid grid-cols-[repeat(3,_1fr)] py-4 px-0 border-0 [&_>_div]:flex [&_>_div]:flex-col [&_>_div]:items-center [&_>_div]:gap-1 [&_svg]:text-muted-foreground [&_strong]:text-xl [&_strong]:font-medium [&_strong]:mt-0.5 [&_strong]:leading-(--text-xl--line-height) [&_span]:text-xs [&_span]:text-muted-foreground [&_span]:leading-(--text-xs--line-height)">
            <div>
              <Flame className="size-3.5 inline-block shrink-0 align-middle" />
              <strong>{stats.streak}</strong>
              <span>
                {habit.frequency === 'weekly' ? t('habits.weekStreak') : t('habits.streak')}
              </span>
            </div>
            <div>
              <Check className="size-3.5 inline-block shrink-0 align-middle" />
              <strong>{stats.total}</strong>
              <span>{t('habits.totalCompleted')}</span>
            </div>
            <div>
              <BarChart3 className="size-3.5 inline-block shrink-0 align-middle" />
              <strong>{stats.rate}%</strong>
              <span>{t('habits.successRate')}</span>
            </div>
          </div>
          {habit.frequency === 'weekly' && (
            <p className="habit-week-progress text-center text-muted-foreground text-xs leading-(--text-xs--line-height)">
              {t('habits.weeklyProgress', {
                count: habit.weeklyTarget,
                done: stats.week,
                target: habit.weeklyTarget,
              })}
            </p>
          )}
          <HabitCheckin
            key={habit.id}
            habit={habitAt(habit, logDate)}
            log={selectedLog}
            date={logDate}
            onDateChange={onDateChange}
            onChange={(patch) => onLogChange(patch)}
          />
          <HabitHistory
            habit={habit}
            logDate={logDate}
            onDateChange={onDateChange}
            statsMonth={statsMonth}
            onMonthChange={onMonthChange}
          />
          <div className="habit-detail-actions flex justify-between pt-4 mt-6 [border-top:1px_solid_var(--separator)] [&_button:hover]:bg-surface-hover [&_button]:bg-transparent [&_button]:border-0 [&_button]:py-1 [&_button]:px-2 [&_button]:min-h-8 [&_button]:rounded-sm [&_button]:flex [&_button]:items-center [&_button]:gap-1 [&_button]:text-sm [&_button]:text-muted-foreground [&_button]:leading-(--text-sm--line-height)">
            <ButtonPrimitive onClick={() => onArchive()}>
              {habit.archived ? (
                <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />
              ) : (
                <Archive className="size-3.5 inline-block shrink-0 align-middle" />
              )}
              {habit.archived ? t('habits.restore') : t('habits.archive')}
            </ButtonPrimitive>
            <ButtonPrimitive
              onClick={() => onDelete()}
              className={'danger [.habits-view_&]:text-danger-text text-danger-text'}
            >
              <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />
              {t('habits.delete')}
            </ButtonPrimitive>
          </div>
        </div>
      </aside>
    </HabitDetailLayer>
  );
}
