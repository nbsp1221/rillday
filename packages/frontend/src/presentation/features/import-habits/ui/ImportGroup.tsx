import { Checkbox } from '@repo/ui/components/checkbox';
import { Label } from '@repo/ui/components/label';
import { useId } from 'react';
import type { Habit, HabitImportChoice, HabitImportGroup } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoice } from '#shared/ui/WorkspaceChoice';

function knownKind(group: HabitImportGroup) {
  return (
    group.kind ??
    (group.records.some((record) => record.goal !== 1 || (record.value !== 0 && record.value !== 1))
      ? 'quantity'
      : undefined)
  );
}

export function defaultImportChoice(group: HabitImportGroup): HabitImportChoice {
  return {
    key: group.key,
    targetId: null,
    kind: knownKind(group) ?? 'boolean',
    frequency: 'daily',
    weeklyTarget: 3,
    confirmed: false,
    replaceDates: [],
  };
}

export function ImportGroup({
  group,
  choice,
  habits,
  disabled,
  select,
  change,
  previousTarget,
}: {
  group: HabitImportGroup;
  choice: HabitImportChoice | undefined;
  habits: Habit[];
  disabled: boolean;
  select: (checked: boolean) => void;
  change: (patch: Partial<HabitImportChoice>) => void;
  previousTarget: string | null;
}) {
  const { t } = useI18n();
  const id = useId();
  const dates = group.records.map((r) => r.date).sort();
  const name = group.name || t('habitImport.unnamed');
  const fixedKind = knownKind(group);
  return (
    <fieldset
      aria-label={name}
      disabled={disabled}
      className="space-y-3 rounded-md border border-border p-4"
    >
      <label className="flex items-center gap-3 text-sm font-medium">
        <Checkbox
          checked={Boolean(choice)}
          disabled={disabled || Boolean(group.errors.length) || !group.records.length}
          onCheckedChange={select}
        />
        <span className="min-w-0 wrap-anywhere">{name}</span>
      </label>
      <p className="text-xs text-muted-foreground">
        {t('habitImport.records', { count: group.records.length })} ·{' '}
        {dates.length ? `${dates[0]} – ${dates.at(-1)}` : t('habitImport.noValidRecords')}
      </p>
      {group.errors.length > 0 && (
        <div role="alert" className="space-y-1 text-xs text-destructive">
          <p>
            {t('habitImport.invalidRows', {
              count: group.errors.length,
              rows: group.errors
                .slice(0, 10)
                .map((e) => e.row)
                .join(', '),
            })}
          </p>
          {group.errors.slice(0, 5).map((error) => (
            <p key={error.row + ':' + error.code}>
              {t('habitImport.rowError', {
                row: error.row,
                reason: t('habitImport.rowError.' + error.code, {
                  defaultValue: t('habitImport.rowError.invalid'),
                }),
              })}
            </p>
          ))}
        </div>
      )}
      {choice && (
        <>
          <div className="space-y-2">
            <Label htmlFor={id + '-target'}>{t('habitImport.target')}</Label>
            <WorkspaceChoice
              id={id + '-target'}
              name={t('habitImport.target')}
              value={choice.targetId ?? ''}
              options={[
                ...(!previousTarget ? [{ value: '', label: t('habitImport.newHabit') }] : []),
                ...habits.map((h) => ({ value: h.id, label: h.name })),
              ]}
              onChange={(targetId) => change({ targetId: targetId || null, confirmed: false })}
            />
          </div>
          {group.warnings.includes('source_identity_unavailable') && (
            <p className="text-xs text-muted-foreground">{t('habitImport.matchExisting')}</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              {fixedKind ? (
                <p className="text-sm font-medium">{t('habitImport.kind')}</p>
              ) : (
                <Label htmlFor={id + '-kind'}>{t('habitImport.kind')}</Label>
              )}
              {fixedKind ? (
                <p className="text-sm">
                  {t(fixedKind === 'boolean' ? 'habitImport.boolean' : 'habitImport.quantity')}
                </p>
              ) : (
                <>
                  <WorkspaceChoice
                    id={id + '-kind'}
                    name={t('habitImport.kind')}
                    value={choice.kind}
                    options={[
                      { value: 'boolean', label: t('habitImport.boolean') },
                      { value: 'quantity', label: t('habitImport.quantity') },
                    ]}
                    onChange={(kind) => change({ kind, confirmed: false })}
                  />
                </>
              )}
            </div>
            {!choice.targetId && (
              <div className="space-y-2">
                <Label htmlFor={id + '-frequency'}>{t('habitImport.baseline')}</Label>
                <WorkspaceChoice
                  id={id + '-frequency'}
                  name={t('habitImport.baseline')}
                  value={choice.frequency}
                  options={[
                    { value: 'daily', label: t('habitImport.daily') },
                    { value: 'weekly', label: t('habitImport.weekly') },
                  ]}
                  onChange={(frequency) => change({ frequency, confirmed: false })}
                />
              </div>
            )}
          </div>
          {!choice.targetId && choice.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label htmlFor={id + '-weekly'}>{t('habitImport.weeklyTarget')}</Label>
              <WorkspaceChoice
                id={id + '-weekly'}
                name={t('habitImport.weeklyTarget')}
                value={choice.weeklyTarget}
                options={[1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: String(value) }))}
                onChange={(weeklyTarget) => change({ weeklyTarget, confirmed: false })}
              />
            </div>
          )}
          <p className="text-sm tabular-nums">
            {t('habitImport.goal')}: {group.goal} {group.unit}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {group.warnings
              .filter(
                (warning) =>
                  warning === 'history_rule_review' || warning === 'historical_goals_unavailable',
              )
              .map((warning) => (
                <li key={warning}>{t('habitImport.warning.' + warning)}</li>
              ))}
          </ul>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={choice.confirmed}
              onCheckedChange={(confirmed) => change({ confirmed })}
            />
            <span>{t('habitImport.acceptBaseline')}</span>
          </label>
        </>
      )}
    </fieldset>
  );
}
