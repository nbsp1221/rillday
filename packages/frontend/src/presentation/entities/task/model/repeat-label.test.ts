import { expect, test } from 'vitest';
import { createTranslations } from '#shared/i18n';
import { repeatLabel } from './repeat-label';

test.for([
  { language: 'en', frequency: 'daily', interval: 1, summary: 'Every day', unit: 'day' },
  { language: 'en', frequency: 'daily', interval: 2, summary: 'Every 2 days', unit: 'days' },
  { language: 'en', frequency: 'daily', interval: 365, summary: 'Every 365 days', unit: 'days' },
  { language: 'en', frequency: 'weekly', interval: 1, summary: 'Weekly', unit: 'week' },
  { language: 'en', frequency: 'weekly', interval: 2, summary: 'Every 2 weeks', unit: 'weeks' },
  { language: 'en', frequency: 'weekly', interval: 365, summary: 'Every 365 weeks', unit: 'weeks' },
  { language: 'en', frequency: 'monthly', interval: 1, summary: 'Monthly', unit: 'month' },
  { language: 'en', frequency: 'monthly', interval: 2, summary: 'Every 2 months', unit: 'months' },
  {
    language: 'en',
    frequency: 'monthly',
    interval: 365,
    summary: 'Every 365 months',
    unit: 'months',
  },
  { language: 'en', frequency: 'weekdays', interval: 1, summary: 'Every weekday', unit: 'day' },
  {
    language: 'en',
    frequency: 'weekdays',
    interval: 2,
    summary: 'Every 2 days (weekdays)',
    unit: 'days',
  },
  {
    language: 'en',
    frequency: 'weekdays',
    interval: 365,
    summary: 'Every 365 days (weekdays)',
    unit: 'days',
  },
  { language: 'ko', frequency: 'daily', interval: 1, summary: '매일', unit: '일' },
  { language: 'ko', frequency: 'daily', interval: 2, summary: '2일마다', unit: '일' },
  { language: 'ko', frequency: 'daily', interval: 365, summary: '365일마다', unit: '일' },
  { language: 'ko', frequency: 'weekly', interval: 1, summary: '매주', unit: '주' },
  { language: 'ko', frequency: 'weekly', interval: 2, summary: '2주마다', unit: '주' },
  { language: 'ko', frequency: 'weekly', interval: 365, summary: '365주마다', unit: '주' },
  { language: 'ko', frequency: 'monthly', interval: 1, summary: '매월', unit: '개월' },
  { language: 'ko', frequency: 'monthly', interval: 2, summary: '2개월마다', unit: '개월' },
  { language: 'ko', frequency: 'monthly', interval: 365, summary: '365개월마다', unit: '개월' },
  { language: 'ko', frequency: 'weekdays', interval: 1, summary: '평일마다', unit: '일' },
  { language: 'ko', frequency: 'weekdays', interval: 2, summary: '2일마다 (평일)', unit: '일' },
  { language: 'ko', frequency: 'weekdays', interval: 365, summary: '365일마다 (평일)', unit: '일' },
] as const)(
  '$language $frequency/$interval keeps the product summary and interval unit',
  ({ language, frequency, interval, summary, unit }) => {
    const { t } = createTranslations(language);
    expect(repeatLabel({ frequency, interval }, t)).toBe(summary);
    expect(t('repeat.unit', { ns: 'labels', context: frequency, count: interval })).toBe(unit);
  },
);

test('no repeat and custom daily interval wording remain distinct from the daily preset', () => {
  const ko = createTranslations('ko');
  const en = createTranslations('en');
  expect(repeatLabel(null, ko.t)).toBe('반복 안 함');
  expect(repeatLabel(null, en.t)).toBe('Does not repeat');
  expect(ko.t('repeat.interval', { ns: 'labels', context: 'daily', count: 1 })).toBe('1일마다');
  expect(en.t('repeat.interval', { ns: 'labels', context: 'daily', count: 1 })).toBe('Every 1 day');
});
