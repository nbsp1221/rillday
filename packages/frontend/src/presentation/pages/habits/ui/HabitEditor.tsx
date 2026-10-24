import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { type FormEvent, useState } from 'react';
import { type Habit, habitAmountSchema, habitStartDate } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceColorField } from '#shared/ui/WorkspaceColorField';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { HabitIconPicker } from './HabitIconPicker';
import { HabitSettings } from './HabitSettings';
import { habitColors, useHabitDisplay } from './habit-display';
import { HabitGlyph } from './habit-icons';

export function HabitEditor({
  initialHabit,
  close,
  onSaved,
}: {
  initialHabit: Habit;
  close: () => void;
  onSaved: (habit: Habit) => void;
}) {
  const { t } = useI18n();
  const { data, apply } = useWorkspace();
  const { preferences } = useAppPreferences();
  const { weekdayOrder, dayNames } = useHabitDisplay();
  const [editor, setEditor] = useState(initialHabit);

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
      <div
        className="habit-identity-preview flex items-center gap-3"
        style={habitColors(editor.color)}
      >
        <span
          className="habit-symbol w-9 h-9 flex items-center justify-center rounded-lg [background:color-mix(in_srgb,_var(--habit-color,_var(--primary))_14%,_transparent)] text-[color:var(--habit-color,_var(--primary))] text-2xl shrink-0 leading-(--text-2xl--line-height) [.habit-detail-title_&]:w-12 [.habit-detail-title_&]:h-12 [.habit-detail-title_&]:m-auto [.habit-detail-title_&]:text-3xl [.habit-detail-title_&]:leading-(--text-3xl--line-height)"
          aria-hidden="true"
        >
          <HabitGlyph value={editor.icon} />
        </span>
        <Input
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
      <div className="habit-appearance-fields grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-3">
        <HabitIconPicker value={editor.icon} onChange={(icon) => setEditor({ ...editor, icon })} />
        <WorkspaceColorField
          className="w-full min-w-0"
          label={t('common.color')}
          value={editor.color}
          onChange={(color) => {
            if (color) {
              setEditor({ ...editor, color });
            }
          }}
        />
      </div>
      <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
        {t('habits.ruleEffectiveDateDescription')}
      </p>
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
