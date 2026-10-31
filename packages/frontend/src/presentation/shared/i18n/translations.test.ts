import { expect, test } from 'vitest';
import { createTranslations } from './index';

test('bundled languages cover the same messages and fall back to English', () => {
  const instance = createTranslations('en');
  const resources = instance.options.resources;
  expect.assert(resources !== undefined);
  expect(instance.options.fallbackLng).toEqual(['en']);

  expect.assert(resources.en !== undefined);
  for (const namespace of Object.keys(resources.en)) {
    const keys = (language: string) => {
      const messages = resources[language]?.[namespace];
      expect.assert(messages !== undefined);
      return Object.keys(messages);
    };

    const logicalKeys = (language: string) =>
      [
        ...new Set(keys(language).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, ''))),
      ].sort();

    expect(logicalKeys('ko')).toEqual(logicalKeys('en'));
  }
});

test('platform error codes resolve at presentation time in the selected language', () => {
  for (const language of ['en', 'ko'] as const) {
    const instance = createTranslations(language);
    for (const key of [
      'startup.closeGuardUnavailable',
      'startup.databaseBlocked',
      'profiles.detailsUnreadable',
      'startup.storageUnavailable',
    ]) {
      const result = instance.t(key, { returnDetails: true });
      expect(result.usedLng).toBe(language);
      expect(result.res).not.toBe(key);
    }
  }
});

test('bundled catalogs are ready on first use and preserve action and status contexts', () => {
  const ko = createTranslations('ko');
  const en = createTranslations('en');

  expect(ko.t('common.save')).toBe('저장');
  expect(en.t('common.save')).toBe('Save');
  expect(en.t('common.complete')).toBe('Complete');
  expect(en.t('common.complete', { context: 'status' })).toBe('Completed');
  expect(ko.t('common.complete', { context: 'status' })).toBe('완료');
  expect(en.t('profiles.renameFailed')).toBe('Could not save the profile name.');
});

test('quantity messages use English singular and plural forms without changing Korean copy', () => {
  const en = createTranslations('en');
  const ko = createTranslations('ko');

  for (const [count, unit] of [
    [1, 'task'],
    [2, 'tasks'],
    [0, 'tasks'],
  ] as const) {
    expect(en.t('tasks.addedCount', { count })).toBe(`Added ${count} ${unit}`);
    expect(ko.t('tasks.addedCount', { count })).toBe(`추가한 할 일 ${count}개`);
  }
  expect(en.t('repeat.unit', { ns: 'labels', context: 'daily', count: 1 })).toBe('day');
  expect(en.t('repeat.unit', { ns: 'labels', context: 'daily', count: 2 })).toBe('days');
  expect(en.t('repeat.unit', { ns: 'labels', context: 'monthly', count: 1 })).toBe('month');
  expect(en.t('tasks.subtaskCount', { count: 1 })).toBe('1 subtask');
});

test('backup and connection summaries pluralize independent quantities through resources', () => {
  const en = createTranslations('en');

  expect(en.t('backup.taskHabitSummary', { tasks: 1, habits: 2 })).toBe('1 task · 2 habits');
  expect(
    en.t('backup.otherContentsSummary', {
      lists: 2,
      labels: 1,
      logs: 0,
    }),
  ).toBe('2 lists · 1 label · 0 habit entries');
});

test('interpolated user content remains literal, including interpolation and nesting syntax', () => {
  const en = createTranslations('en');
  const name = 'Save <b>literal</b> {{count}} $t(common.save)';

  expect(en.t('common.namedMenu', { name })).toBe(`${name} menu`);
});

test.for([0, 1, 2])(
  'habit summaries select singular and plural by their total or target: %i',
  (count) => {
    const en = createTranslations('en');
    const ko = createTranslations('ko');
    const options = { count, done: 0, total: count, target: count, date: 'Today' };
    const unit = count === 1 ? 'habit' : 'habits';

    expect(en.t('habits.weeklyProgress', options)).toBe(
      `0 / ${count} ${count === 1 ? 'day' : 'days'} completed this week`,
    );
    expect(en.t('habits.scheduledProgress', options)).toBe(
      `0 of ${count} ${unit} planned for today completed.`,
    );
    expect(en.t('habits.todayProgress', options)).toBe(`Today: 0 of ${count} ${unit} completed`);
    expect(en.t('habits.dateProgress', options)).toBe(`Today: 0 of ${count} ${unit} completed`);
    expect(ko.t('habits.weeklyProgress', options)).toBe(`이번 주 0 / ${count}일 달성`);
    expect(ko.t('habits.scheduledProgress', options)).toBe(
      `오늘 예정된 ${count}개 중 0개를 실천했어요.`,
    );
  },
);

test('field and sync messages retain their screen-specific wording', () => {
  const en = createTranslations('en');
  const ko = createTranslations('ko');

  expect(en.t('weekdays', { ns: 'fields' })).toBe('Weekdays');
  expect(ko.t('weekdays', { ns: 'fields' })).toBe('요일');
  expect(en.t('title', { ns: 'fields' })).toBe('Title');
  expect(ko.t('local', { ns: 'sync' })).toBe('이 기기에 저장');
  expect(ko.t('local', { ns: 'sync', context: 'rail' })).toBe('동기화 완료');
  expect(ko.t('conflict', { ns: 'sync' })).toBe('충돌한 변경을 확인해 주세요');
  expect(ko.t('conflict', { ns: 'sync', context: 'rail' })).toBe('충돌한 변경을 확인해 주세요.');
  expect(ko.t('imageEditor.deleteImage', { ns: 'editor' })).toBe('이미지 삭제');
});

test('backup timestamps follow the selected language rather than the machine default', () => {
  const createdAt = new Date('2026-10-20T13:04:00Z');
  const format = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  } as const;

  for (const language of ['ko', 'en'] as const) {
    const { t } = createTranslations(language);

    expect(t('backup.createdAt', { createdAt, formatParams: { createdAt: format } })).toBe(
      new Intl.DateTimeFormat(language, format).format(createdAt),
    );
  }
});

test('complete accessibility sentences preserve literal authored text', () => {
  const { t } = createTranslations('en');
  const name = 'Save {{count}} $t(common.save) <b>text</b>';

  expect(t('tasks.completeNamed', { title: name })).toBe(`Complete: ${name}`);
  expect(t('tasks.markIncompleteNamed', { title: name })).toBe(`Mark incomplete: ${name}`);
  expect(t('common.fieldValue', { field: t('title', { ns: 'fields' }), value: name })).toBe(
    `Title: ${name}`,
  );
});

test('repeat and habit labels resolve by ID while keeping everyday copy separate from interval copy', () => {
  const ko = createTranslations('ko');
  const en = createTranslations('en');

  expect(ko.t('repeat.frequency.daily', { ns: 'labels' })).toBe('매일');
  expect(en.t('repeat.frequency.daily', { ns: 'labels' })).toBe('Every day');
  expect(ko.t('repeat.interval', { ns: 'labels', context: 'daily', count: 1 })).toBe('1일마다');
  expect(en.t('repeat.interval', { ns: 'labels', context: 'weekly', count: 2 })).toBe(
    'Every 2 weeks',
  );
  expect(ko.t('repeat.interval', { ns: 'labels', context: 'weekdays', count: 2 })).toBe(
    '2일마다 (평일)',
  );
  expect(en.t('repeat.unit', { ns: 'labels', context: 'weekdays', count: 2 })).toBe('days');
  expect(ko.t('habit.kind.boolean', { ns: 'labels' })).toBe('달성 여부');
  expect(en.t('habit.kind.boolean', { ns: 'labels' })).toBe('Completion');
  expect(ko.t('habit.kind.quantity', { ns: 'labels' })).toBe('수량 기록');
  expect(en.t('habit.kind.quantity', { ns: 'labels' })).toBe('Track amount');
});

test('conflict system labels resolve independently of authored strings and task/habit frequency meanings', () => {
  for (const language of ['ko', 'en'] as const) {
    const { t } = createTranslations(language);
    for (const key of [
      'inbox',
      'pending-edit',
      'backup-import',
      'habit.frequency.daily',
      'habit.frequency.weekdays',
      'habit.frequency.weekly',
      'habit.frequency.interval',
    ]) {
      expect(t(key, { ns: 'labels', returnDetails: true }).usedLng).toBe(language);
    }
    expect(t('repeat.frequency.weekly', { ns: 'labels' })).not.toBe(
      t('habit.frequency.weekly', { ns: 'labels' }),
    );
  }
  expect(createTranslations('en').t('inbox', { ns: 'labels' })).toBe('Inbox');
  expect(createTranslations('en').t('backup-import', { ns: 'labels' })).toBe('Import backup');
});
