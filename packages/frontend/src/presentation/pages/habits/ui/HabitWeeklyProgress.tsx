import { type Habit, habitAt, habitWeekAmount } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';

export function HabitWeeklyProgress({ habit, date }: { habit: Habit; date: string }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const { preferences } = useAppPreferences();
  const progress = habitWeekAmount(habit, data.habitLogs, date, preferences.weekStartsOn);

  if (habitAt(habit, date).frequency !== 'weekly-total') {
    return null;
  }

  return (
    <span className="habit-week-amount block mt-2 min-w-0 space-y-1.5 font-normal">
      <span className="m-0 text-xs tabular-nums text-secondary-foreground">
        {t('habits.weeklyAmount', { ...progress })}
      </span>
      <span
        role="progressbar"
        aria-label={t('habits.weeklyGoal')}
        aria-valuenow={Math.min(progress.value, progress.goal)}
        aria-valuemin={0}
        aria-valuemax={progress.goal}
        aria-valuetext={t('habits.weeklyAmount', { ...progress })}
        className="block h-1 overflow-hidden rounded-full bg-habit-color/15"
      >
        <span
          className="block h-full rounded-full bg-habit-color"
          style={{ width: `${Math.min(100, (progress.value / progress.goal) * 100)}%` }}
        />
      </span>
      {progress.excluded > 0 && (
        <span className="text-xs text-secondary-foreground">
          {t('habits.excludedUnits', { count: progress.excluded })}
        </span>
      )}
    </span>
  );
}
