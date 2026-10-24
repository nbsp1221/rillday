import { Radio as OptionRadio } from '@base-ui/react/radio';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@repo/ui/components/toggle-group';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { type Habit, habitAmountSchema } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoiceField } from '#shared/ui/WorkspaceChoice';
import { WorkspaceNumberField } from '#shared/ui/WorkspaceNumberField';
import { HabitUnitField } from './HabitUnitField';

export function HabitSettings({
  value,
  onChange,
  weekdayOrder,
  dayNames,
}: {
  value: Habit;
  onChange: (patch: Partial<Habit>) => void;
  weekdayOrder: number[];
  dayNames: string[];
}) {
  const { t, dateLocale } = useI18n();
  const minimum = habitAmountSchema.minValue!;
  const maximum = habitAmountSchema.maxValue!;
  const amountError = t('controls.numberRange', {
    minimum: minimum.toLocaleString(dateLocale),
    maximum: maximum.toLocaleString(dateLocale),
  });
  const [goal, setGoal] = useState<number | null>(value.goal);
  const [step, setStep] = useState<number | null>(value.step ?? 1);
  const [weekly, setWeekly] = useState<number | null>(value.weeklyTarget);
  const [interval, setInterval] = useState<number | null>(value.intervalDays ?? 1);

  const numeric = (
    amount: number | null,
    change: (amount: number | null) => void,
    key: 'goal' | 'step' | 'weeklyTarget' | 'intervalDays',
    min: number,
    max?: number,
  ) => {
    change(amount);

    if (amount !== null && amount >= min && (max === undefined || amount <= max)) {
      onChange({ [key]: amount });
    }
  };

  const frequencies = [
    {
      value: 'daily',
      label: t('dates.everyDay'),
      description: t('habits.frequencyDailyDescription'),
    },
    {
      value: 'weekdays',
      label: t('habits.frequencyWeekdays'),
      description: t('habits.frequencyWeekdaysDescription'),
    },
    {
      value: 'weekly',
      label: t('habits.frequencyWeekly'),
      description: t('habits.frequencyWeeklyDescription'),
    },
    {
      value: 'interval',
      label: t('habits.frequencyInterval'),
      description: t('habits.frequencyIntervalDescription'),
    },
  ] as const;
  let summary: string;

  switch (value.frequency) {
    case 'weekly':
      summary = t('habits.weeklyDays', { count: value.weeklyTarget });
      break;
    case 'interval':
      summary = t('habits.everyDays', { count: value.intervalDays ?? 1 });
      break;
    case 'weekdays':
      summary =
        weekdayOrder
          .filter((day) => value.weekdays.includes(day))
          .map((day) => dayNames[day])
          .join(' · ') || t('habits.chooseWeekdays');
      break;
    case 'daily':
    default:
      summary = t('dates.everyDay');
  }

  return (
    <>
      <fieldset className="habit-goal-settings">
        <legend>{t('habits.goal')}</legend>
        <RadioGroup
          required
          aria-label={t('habits.goal')}
          className="duration-presets grid gap-2 [&_>_button]:flex [&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:gap-1 [&_>_button]:min-h-(--control-height) [&_>_button]:py-1 [&_>_button]:px-1 [&_>_button]:border [&_>_button]:border-control-border [&_>_button]:rounded-sm [&_>_button[aria-checked='true']]:border-link [&_>_button[aria-checked='true']]:text-link [&_>_button[aria-checked='true']]:bg-overlay-hover [&_>_button[aria-pressed='true']]:border-link [&_>_button[aria-pressed='true']]:text-link [&_>_button[aria-pressed='true']]:bg-overlay-hover [&_>_button:hover]:bg-overlay-hover habit-goal-modes grid-cols-[repeat(2,_minmax(0,_1fr))]"
          value={value.kind}
          onValueChange={(kind) => {
            if (kind) {
              onChange({ kind: kind as typeof value.kind });
            }
          }}
        >
          {(['boolean', 'quantity'] as const).map((kind) => (
            <OptionRadio.Root
              render={<button type="button" />}
              nativeButton
              key={kind}
              value={kind}
            >
              {t(`habit.kind.${kind}`, { ns: 'labels' })}
              {value.kind === kind && (
                <Check className="size-3.5 inline-block shrink-0 align-middle" />
              )}
            </OptionRadio.Root>
          ))}
        </RadioGroup>
        {value.kind === 'quantity' ? (
          <div className="habit-settings-fields flex flex-col gap-3 mt-3">
            <WorkspaceNumberField
              visibleLabel
              className={cn(
                'form-field flex min-w-0 flex-col gap-(--layout-field-gap)',
                'habit-setting-row grid grid-cols-[minmax(0,_1fr)_minmax(0,_156px)] items-center gap-2 min-h-9 [&_>_label]:self-center',
              )}
              label={t('habits.goal')}
              value={goal}
              step="any"
              onValueChange={(text) => numeric(text, setGoal, 'goal', minimum, maximum)}
              min={minimum}
              max={maximum}
              decrease={t('habits.decreaseGoal')}
              increase={t('habits.increaseGoal')}
              error={amountError}
            />
            <HabitUnitField value={value.unit} onChange={(unit) => onChange({ unit })} />
            <WorkspaceNumberField
              visibleLabel
              className={cn(
                'form-field flex min-w-0 flex-col gap-(--layout-field-gap)',
                'habit-setting-row grid grid-cols-[minmax(0,_1fr)_minmax(0,_156px)] items-center gap-2 min-h-9 [&_>_label]:self-center',
              )}
              label={t('habits.stepSize')}
              value={step}
              step="any"
              onValueChange={(text) => numeric(text, setStep, 'step', minimum, maximum)}
              min={minimum}
              max={maximum}
              decrease={t('habits.decreaseStep')}
              increase={t('habits.increaseStep')}
              error={amountError}
            />
            <p className="habit-setting-hint m-0 text-muted-foreground text-xs leading-(--text-xs--line-height) [.habit-goal-settings_>_&]:mt-2">
              {t('habits.stepDescription')}
            </p>
          </div>
        ) : (
          <p className="habit-setting-hint m-0 text-muted-foreground text-xs leading-(--text-xs--line-height) [.habit-goal-settings_>_&]:mt-2">
            {t('habits.booleanGoalDescription')}
          </p>
        )}
      </fieldset>
      <div className="habit-frequency-settings flex flex-col gap-3">
        <WorkspaceChoiceField
          label={t('habits.frequency')}
          value={value.frequency}
          summary={summary}
          options={frequencies}
          onChange={(frequency) => onChange({ frequency })}
        />
        {value.frequency === 'weekdays' && (
          <>
            <ToggleGroup
              multiple
              className="habit-weekday-select grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 m-0 [&_button]:w-full [&_button]:max-w-9 [&_button]:[justify-self:center] [&_button]:h-8 [&_button]:border [&_button]:border-separator [&_button]:rounded-full [&_button]:bg-transparent [&_button]:text-xs [&_button]:text-muted-foreground [&_button]:leading-(--text-xs--line-height) [&_small]:[grid-column:1_/_-1] [&_small]:w-full [&_small]:text-xs [&_small]:text-danger-text [&_small]:leading-(--text-xs--line-height)"
              aria-label={t('habits.practiceDays')}
              value={value.weekdays.map(String)}
              onValueChange={(weekdays) => onChange({ weekdays: weekdays.map(Number) })}
            >
              {weekdayOrder.map((day) => (
                <ToggleGroupItem
                  key={day}
                  value={String(day)}
                  className={cn(
                    value.weekdays.includes(day)
                      ? 'selected [.habit-history-grid_button&]:[outline:1px_solid_var(--ring)] [.habit-history-grid_button&]:outline-offset-[1px] [.habit-weekday-select_button&]:border-link [.habit-weekday-select_button&]:[background:color-mix(in_srgb,_var(--primary)_20%,_transparent)] [.habit-weekday-select_button&]:text-link'
                      : '',
                  )}
                >
                  {dayNames[day]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {!value.weekdays.length && (
              <p
                className="number-stepper-error mt-1 text-danger-text text-xs leading-(--text-xs--line-height)"
                role="alert"
              >
                {t('habits.weekdayRequired')}
              </p>
            )}
          </>
        )}
        {value.frequency === 'weekly' && (
          <>
            <WorkspaceNumberField
              visibleLabel
              className={cn(
                'form-field flex min-w-0 flex-col gap-(--layout-field-gap)',
                'habit-setting-row grid grid-cols-[minmax(0,_1fr)_minmax(0,_156px)] items-center gap-2 min-h-9 [&_>_label]:self-center',
              )}
              label={t('habits.weeklyTargetDays')}
              value={weekly}
              onValueChange={(text) => numeric(text, setWeekly, 'weeklyTarget', 1, 7)}
              min={1}
              max={7}
              step={1}
              decrease={t('habits.decreaseWeeklyTarget')}
              increase={t('habits.increaseWeeklyTarget')}
              error={t('habits.weeklyTargetRange')}
            />
            <p className="habit-setting-hint m-0 text-muted-foreground text-xs leading-(--text-xs--line-height) [.habit-goal-settings_>_&]:mt-2">
              {t('habits.weeklyTargetDescription')}
            </p>
          </>
        )}
        {value.frequency === 'interval' && (
          <>
            <WorkspaceNumberField
              visibleLabel
              className={cn(
                'form-field flex min-w-0 flex-col gap-(--layout-field-gap)',
                'habit-setting-row grid grid-cols-[minmax(0,_1fr)_minmax(0,_156px)] items-center gap-2 min-h-9 [&_>_label]:self-center',
              )}
              label={t('habits.intervalDays')}
              value={interval}
              onValueChange={(text) => numeric(text, setInterval, 'intervalDays', 1, 30)}
              min={1}
              max={30}
              step={1}
              decrease={t('repeat.decreaseInterval')}
              increase={t('repeat.increaseInterval')}
              error={t('habits.intervalRange')}
            />
            <p className="habit-setting-hint m-0 text-muted-foreground text-xs leading-(--text-xs--line-height) [.habit-goal-settings_>_&]:mt-2">
              {t('habits.intervalDescription')}
            </p>
          </>
        )}
      </div>
    </>
  );
}
