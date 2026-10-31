import { expect, test } from '@playwright/test';
import { emptyWorkspace } from '@repo/frontend/application';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { seedWorkspace, storedPreferences, storedWorkspace } from '../support/storage';

for (const language of ['ko', 'en']) {
  test(`Sunday default and saved Monday preference agree across calendars in ${language}`, async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    const en = language === 'en';
    const names = en
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['일', '월', '화', '수', '목', '금', '토'];
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: en ? 'Calendar' : '캘린더', exact: true })
      .click();
    await expect(
      page.getByLabel(en ? 'Start week on' : '주 시작 요일', { exact: true }),
    ).toHaveAttribute('data-value', '0');
    await page.getByRole('button', { name: en ? 'Back' : '돌아가기', exact: true }).click();
    for (const start of [0, 1]) {
      if (start === 1) {
        await page.getByLabel(en ? 'Settings and backup' : '설정과 백업', { exact: true }).click();
        await page
          .locator('.settings-nav')
          .getByRole('button', { name: en ? 'Calendar' : '캘린더', exact: true })
          .click();
        await chooseChoice(
          page,
          page.getByLabel(en ? 'Start week on' : '주 시작 요일', { exact: true }),
          '1',
        );
        await page.getByRole('button', { name: en ? 'Back' : '돌아가기', exact: true }).click();
        await expect
          .poll(() => storedPreferences(page))
          .toMatchObject({ language, weekStartsOn: 1 });
        await reloadSavedPage(page);
      }
      const expected = names.slice(start).concat(names.slice(0, start));
      const compact = en ? expected.map((name) => name.slice(0, 2)) : expected;
      await page.locator('.quick-date-trigger').click();
      await expect(
        page
          .locator('.date-picker-body > .date-calendar')
          .getByRole('columnheader', { includeHidden: true }),
      ).toHaveText(compact);
      await page.locator('.date-repeat-trigger').click();
      const custom = page.getByLabel(en ? 'Custom repeat' : '사용자 지정 반복', { exact: true });
      if ((await custom.getAttribute('aria-expanded')) !== 'true') {
        await custom.click();
      }
      await page.getByLabel(en ? 'Repeat end date' : '반복 종료일', { exact: true }).click();
      await expect(
        page.locator('.repeat-end-calendar').getByRole('columnheader', { includeHidden: true }),
      ).toHaveText(compact);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.locator('.task-title').first().click();
      await page.locator('.td-date-button').click();
      await expect(
        page
          .locator('.date-picker-body > .date-calendar')
          .getByRole('columnheader', { includeHidden: true }),
      ).toHaveText(compact);
      await page.keyboard.press('Escape');
      await page.getByLabel(en ? 'Close task details' : '할 일 상세 닫기', { exact: true }).click();
      await page.getByLabel(en ? 'Calendar' : '캘린더', { exact: true }).click();
      await expect(page.locator('.calendar-weekdays > span')).toHaveText(expected);
      await page
        .getByRole('button', { name: en ? 'Calendar view' : '캘린더 보기', exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: en ? 'Year' : '연', exact: true }).click();
      await expect(
        page.locator('.calendar-mini-month').first().locator(':scope > div > span'),
      ).toHaveText(expected);
      await page
        .getByRole('button', { name: en ? 'Calendar view' : '캘린더 보기', exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: en ? 'Week' : '주', exact: true }).click();
      await expect(page.locator('.calendar-time-head > button > span')).toHaveText(expected);
      await page
        .getByRole('button', { name: en ? 'Calendar view' : '캘린더 보기', exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: en ? 'Month' : '월', exact: true }).click();
      await page.getByLabel(en ? 'Habit' : '습관', { exact: true }).click();
      await expect(page.locator('.habit-table-head > div > span:first-child')).toHaveText(expected);
      await page.locator('.habit-name').first().click();
      await expect(page.locator('.habit-history-grid > span')).toHaveText(expected);
      await page.getByLabel(en ? 'Tasks' : '태스크', { exact: true }).click();
    }
  });
}

test('week start regroups persisted habit statistics when the setting changes', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-18T03:00:00Z') });
  const data = emptyWorkspace();
  data.habits.push({
    id: 'week-start-habit',
    name: 'Weekly summary check',
    color: '#7d9cc4',
    icon: 'check',
    kind: 'boolean',
    goal: 1,
    unit: 'times',
    frequency: 'weekly',
    weekdays: [],
    weeklyTarget: 2,
    reminderTime: null,
    archived: false,
    createdAt: '2026-10-12T00:00:00Z',
    startDate: '2026-10-12',
  });
  data.habitLogs = ['2026-10-12', '2026-10-18'].map((date) => ({
    habitId: 'week-start-habit',
    date,
    value: 1,
    skipped: false,
    note: '',
  }));
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  await page.locator('.habit-name').first().click();
  await expect(page.locator('.habit-week-progress')).toHaveText('1 / 2 days completed this week');
  await expect(page.locator('.habit-stats strong').last()).toHaveText('50%');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Calendar', exact: true })
    .click();
  await chooseChoice(page, page.getByLabel('Start week on', { exact: true }), '1');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Habit', { exact: true }).click();
  await page.locator('.habit-name').first().click();
  await expect(page.locator('.habit-week-progress')).toHaveText('2 / 2 days completed this week');
  await expect(page.locator('.habit-stats strong').last()).toHaveText('100%');
  await expect(page.locator('.habit-stats strong').first()).toHaveText('1');

  await page.getByLabel('Edit habit', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Weekly target (days)', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => (await storedWorkspace(page)).habits[0]?.rules?.at(-1))
    .toMatchObject({
      from: '2026-10-19',
      weeklyTarget: 3,
    });
});
