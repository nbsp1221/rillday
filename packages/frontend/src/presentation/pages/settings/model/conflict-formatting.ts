import type { TFunction } from 'i18next';
import invariant from 'tiny-invariant';
import type { WorkspaceChange, WorkspaceLabel } from '#application';

const changeFields = new Set([
  'title',
  'notes',
  'name',
  'color',
  'priority',
  'schedule',
  'date',
  'time',
  'zone',
  'durationMinutes',
  'repeat',
  'interval',
  'until',
  'weekdays',
  'rules',
  'goal',
  'kind',
  'unit',
  'frequency',
  'from',
  'value',
  'skipped',
  'note',
  'pinned',
  'location',
  'list',
  'parent',
  'labels',
  'completed',
  'amount',
  'position',
  'before',
  'after',
  'deleted',
  'matrixMode',
]);

export function formatLabel(
  value: string | WorkspaceLabel,
  t: TFunction,
  weekdays: string[],
): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value.system === 'weekday') {
    const name = weekdays[value.value];
    invariant(name !== undefined, 'Conflict weekday must have a localized name');
    return name;
  }
  const key = 'value' in value ? `${value.system}.${value.value}` : value.system;
  return t(key, { ns: 'labels' });
}

export function formatChange(
  value: WorkspaceChange | undefined,
  t: TFunction,
  weekdays: string[],
): string {
  if (!value) {
    return t('common.noContent');
  }
  if (value.type === 'system') {
    return formatLabel(value.label, t, weekdays);
  }
  if (value.type === 'literal') {
    if (value.value === null) {
      return t('common.noContent');
    }
    return typeof value.value === 'boolean'
      ? t(value.value ? 'common.yes' : 'common.no')
      : String(value.value);
  }
  if (value.type === 'list') {
    return value.items.map((entry) => formatChange(entry, t, weekdays)).join(', ');
  }
  return (
    Object.entries(value.fields)
      .filter(([key]) => changeFields.has(key))
      .map(([key, v]) =>
        t('common.fieldValue', {
          field: t(key, { ns: 'fields' }),
          value: formatChange(v, t, weekdays),
        }),
      )
      .join('\n') || t('conflicts.settingsChanged')
  );
}
