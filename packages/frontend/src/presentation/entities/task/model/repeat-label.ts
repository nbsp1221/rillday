import type { TFunction } from 'i18next';
import type { RepeatRule } from '#application';

export function repeatLabel(value: RepeatRule | null, t: TFunction) {
  if (!value) {
    return t('repeat.none');
  }

  // Preset wording such as "Every day" is separate from count-based interval wording.
  if (value.interval === 1) {
    return t(`repeat.frequency.${value.frequency}`, { ns: 'labels' });
  }

  return t('repeat.interval', {
    ns: 'labels',
    context: value.frequency,
    count: value.interval,
  });
}
