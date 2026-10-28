import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { type FormEvent, type RefObject, useRef, useState } from 'react';
import { type Habit, habitAmountSchema, habitAt, habitStartDate, habitToday } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { HabitAppearancePicker } from './HabitAppearancePicker';
import { HabitSettings } from './HabitSettings';
import { useHabitDisplay } from './habit-display';

export function HabitEditor({
  initialHabit,
  close,
  onSaved,
  finalFocus,
}: {
  initialHabit: Habit;
  close: () => void;
  onSaved: (habit: Habit) => void;
  finalFocus?: RefObject<HTMLButtonElement | null>;
}) {
  const { t, formatDate } = useI18n();
  const { data, apply } = useWorkspace();
  const { preferences } = useAppPreferences();
  const { weekdayOrder, dayNames } = useHabitDisplay();
  const [editor, setEditor] = useState(() =>
    habitAt(initialHabit, initialHabit.rules?.at(-1)?.from ?? habitToday(initialHabit)),
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const pendingFrom = initialHabit.rules?.at(-1)?.from;

  function saveHabit(event: FormEvent) {
    event.preventDefault();

    if (
      !editor.name.trim() ||
      (editor.frequency === 'weekdays' && !editor.weekdays.length) ||
      (editor.kind === 'quantity' &&
        (!habitAmountSchema.safeParse(editor.goal).success ||
          !habitAmountSchema.safeParse(editor.step ?? 1).success ||
          !editor.unit.trim()))
    ) {
      return;
    }

    const saved = {
      ...editor,
      startDate: editor.startDate ?? habitStartDate(editor),
      name: editor.name.trim(),
      goal: editor.kind === 'boolean' ? 1 : editor.goal,
      step: editor.step ?? 1,
      weeklyTarget: Math.max(1, Math.min(7, Math.round(editor.weeklyTarget))),
      intervalDays: Math.max(1, Math.min(30, Math.round(editor.intervalDays || 1))),
    };
    const accepted = apply({
      type: 'habit.save',
      habit: saved,
      weekStartsOn: preferences.weekStartsOn,
    });

    if (!accepted) {
      return;
    }

    onSaved(saved);
  }

  return (
    <WorkspaceDialog
      className="habit-editor [&_fieldset]:border-0 [&_fieldset]:p-0 [&_fieldset]:m-0 [&_fieldset]:min-w-0 [&_legend]:text-sm [&_legend]:text-muted-foreground [&_legend]:p-0 [&_legend]:mb-2 [&_legend]:leading-(--text-sm--line-height)"
      title={data.habits.some((h) => h.id === editor.id) ? t('habits.edit') : t('habits.new')}
      onClose={close}
      initialFocus={nameRef}
      finalFocus={finalFocus}
      onSubmit={saveHabit}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={close}
            className={'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              !editor.name.trim() || (editor.frequency === 'weekdays' && !editor.weekdays.length)
            }
            className={
              'h-(--control-height) min-w-18 bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="habit-identity-preview flex items-center gap-3">
        <HabitAppearancePicker
          icon={editor.icon}
          color={editor.color}
          onChange={(patch) => setEditor({ ...editor, ...patch })}
        />
        <Input
          ref={nameRef}
          required
          maxLength={120}
          aria-label={t('habits.name')}
          placeholder={t('habits.namePlaceholder')}
          value={editor.name}
          onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          className={cn(
            'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm',
            'habit-name-input w-full min-w-0',
          )}
        />
      </div>
      {data.habits.some((habit) => habit.id === editor.id) && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {pendingFrom && pendingFrom > habitToday(initialHabit)
            ? t('habits.ruleEffectiveOn', { date: formatDate(pendingFrom) })
            : t('habits.ruleEffectiveDateDescription')}
        </p>
      )}
      <HabitSettings
        key={editor.id}
        value={editor}
        onChange={(patch) => setEditor({ ...editor, ...patch })}
        weekdayOrder={weekdayOrder}
        dayNames={dayNames}
      />
    </WorkspaceDialog>
  );
}
