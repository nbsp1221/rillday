import { type Page, expect, test } from '@playwright/test';
import { emptyWorkspace } from '@repo/frontend/application';
import { chooseChoice } from '../support/choice';
import { seedWorkspace, storedRegistry, storedWorkspace } from '../support/storage';
import { archiveFixture } from '../support/workspace-archive';

async function changeLanguage(page: Page, language: 'ko' | 'en') {
  await page.getByLabel(/^(설정과 백업|Settings and backup)$/).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: /^(일반|General)$/ })
    .click();
  await chooseChoice(page, page.getByLabel(/^(언어|Language)$/, { exact: true }), language);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await page.getByRole('button', { name: /^(돌아가기|Back)$/, exact: true }).click();
}

for (const language of ['ko', 'en'] as const) {
  test(`area, quadrant and priority labels keep their wording and order in ${language}`, async ({
    page,
  }) => {
    const areas =
      language === 'ko'
        ? ['태스크', '아이젠하워 매트릭스', '캘린더', '습관 트래커']
        : ['Tasks', 'Eisenhower Matrix', 'Calendar', 'Habit Tracker'];
    const quadrants =
      language === 'ko'
        ? [
            '중요하고 긴급한 일',
            '중요하지만 긴급하지 않은 일',
            '긴급하지만 중요하지 않은 일',
            '중요하지도 긴급하지도 않은 일',
          ]
        : [
            'Important and urgent',
            'Important, not urgent',
            'Urgent, not important',
            'Neither important nor urgent',
          ];
    const priorities =
      language === 'ko'
        ? ['높은 우선순위', '중간 우선순위', '낮은 우선순위', '우선순위 없음']
        : ['High priority', 'Medium priority', 'Low priority', 'No priority'];

    await page.goto('/');
    await changeLanguage(page, language);
    expect(
      await page
        .locator('.rail-views button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ).toEqual(areas);

    await page.getByLabel(/^(설정과 백업|Settings and backup)$/).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: /^(일반|General)$/ })
      .click();
    await page.getByLabel(/^(시작 화면|Startup view)$/, { exact: true }).click();
    await expect(page.getByRole('option')).toHaveText(areas);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^(돌아가기|Back)$/, exact: true }).click();

    await page.getByLabel(areas[3], { exact: true }).click();
    await expect(page.locator('.workspace-title-row h1')).toHaveText(areas[3]);

    await page.getByLabel(areas[1], { exact: true }).click();
    await expect(page.locator('.quadrant-header h2')).toHaveText(quadrants);
    await page.getByLabel(areas[0], { exact: true }).click();

    for (const [index, priority] of priorities.entries()) {
      const trigger = page.getByRole('button', {
        name: /^(추가할 우선순위|Priority for new task)$/,
      });
      await trigger.click();
      await expect(page.getByRole('menuitemradio')).toHaveText(priorities);
      const colors = await page
        .getByRole('menuitemradio')
        .evaluateAll((items) =>
          items.map((item) => getComputedStyle(item.querySelector('svg')!).color),
        );
      expect(new Set(colors).size).toBe(4);
      await page.getByRole('menuitemradio', { name: priority, exact: true }).click();
      await expect(trigger).toHaveAttribute('title', priority);
      await page.locator('#quick-add-input').fill(`Save {{count}} $t(common.save) ${index}`);
      await page.locator('#quick-add-input').press('Enter');
    }

    await page.locator('.task-title').first().click();
    await page.getByRole('button', { name: /^(우선순위 설정|Set priority)$/ }).click();
    await expect(page.getByRole('menuitemradio')).toHaveText(priorities);
    await page.keyboard.press('Escape');
    await page.getByLabel(/^(할 일 상세 닫기|Close task details)$/, { exact: true }).click();
    const group = page.getByRole('button', { name: /^(그룹|Group)$/, exact: true });
    await group.focus();
    await group.press('Enter');
    await page.getByRole('menuitemradio', { name: /^(우선순위|Priority)$/, exact: true }).click();
    await expect(page.locator('.task-section-title')).toHaveText(priorities);
    expect((await storedWorkspace(page)).tasks.map((task) => task.title).sort()).toEqual(
      [0, 1, 2, 3].map((index) => `Save {{count}} $t(common.save) ${index}`),
    );
  });
  test(`repeat and habit choices preserve their labels, values and ordering in ${language}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const frequencies = ['daily', 'weekly', 'monthly', 'weekdays'];
    const labels =
      language === 'ko'
        ? ['매일', '매주', '매월', '평일마다']
        : ['Every day', 'Weekly', 'Monthly', 'Every weekday'];
    const units = language === 'ko' ? ['일', '주', '개월', '일'] : ['day', 'week', 'month', 'day'];
    const kinds = language === 'ko' ? ['달성 여부', '수량 기록'] : ['Completion', 'Track amount'];

    await page.goto('/');
    await changeLanguage(page, language);
    await page
      .locator('#quick-add-input')
      .fill('Authored text {{count}} $t(common.save) 2030-01-31');
    await page.locator('.quick-date-trigger').click();
    await page.locator('.date-repeat-trigger').click();
    await expect(page.locator('.schedule-options > button')).toHaveText([
      language === 'ko' ? '반복 안 함' : 'Does not repeat',
      ...labels,
      language === 'ko' ? '사용자 지정…' : 'Custom…',
    ]);

    for (const [index, frequency] of frequencies.entries()) {
      await page
        .locator('.schedule-options > button')
        .nth(index + 1)
        .click();
      const trigger = page.locator('.date-repeat-trigger');
      await expect(trigger.locator('.schedule-value')).toHaveText(labels[index]);

      for (const count of [1, 2, 365]) {
        await trigger.click();
        const custom = page.getByLabel(/^(사용자 지정 반복|Custom repeat)$/, { exact: true });
        if ((await custom.getAttribute('aria-expanded')) !== 'true') {
          await custom.click();
        }
        await expect(page.locator('.repeat-frequency-options').getByRole('radio')).toHaveText(
          labels,
        );
        if (count === 1) {
          const radios = page.locator('.repeat-frequency-options').getByRole('radio');
          await radios.nth((index + 1) % frequencies.length).click();
          await radios.nth(index).click();
          await expect(radios.nth(index)).toBeChecked();
        }
        const interval = page.getByRole('textbox', {
          name: /^(반복 간격|Repeat interval)$/,
          exact: true,
        });
        await interval.fill(String(count));
        const unit = units[index] + (language === 'en' && count !== 1 ? 's' : '');
        await expect(
          page.locator('.schedule-field').filter({ has: interval }).locator(':scope > span').last(),
        ).toHaveText(unit);
        await page.getByRole('button', { name: /^(적용|Apply)$/, exact: true }).click();
        const summary =
          count === 1
            ? labels[index]
            : language === 'ko'
              ? `${count}${unit}마다${frequency === 'weekdays' ? ' (평일)' : ''}`
              : `Every ${count} ${unit}${frequency === 'weekdays' ? ' (weekdays)' : ''}`;
        await expect(trigger.locator('.schedule-value')).toHaveText(summary);
        await expect(trigger).toHaveAttribute('data-frequency', frequency);
        await expect(trigger).toHaveAttribute('data-interval', String(count));
      }
      await trigger.click();
    }

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('#quick-add-input').fill('');
    await page.getByLabel(/^(습관|Habit)$/, { exact: true }).click();
    await page.getByRole('button', { name: /^(습관 추가|Add habit)$/, exact: true }).click();
    await page
      .getByRole('button', { name: /^(직접 만들기|Create your own)$/, exact: true })
      .click();
    const goal = page.getByRole('radiogroup', { name: /^(목표|Goal)$/, exact: true });
    await expect(goal.getByRole('radio')).toHaveText(kinds);
    const name = 'Save {{count}} $t(common.save)';
    const customUnit = 'u{{count}}$t(x)';
    await page.getByLabel(/^(습관 이름|Habit name)$/, { exact: true }).fill(name);
    await goal.getByRole('radio', { name: kinds[1], exact: true }).click();
    const unit = page.getByRole('combobox', { name: /^(단위|Unit)$/, exact: true });
    await unit.fill(customUnit);
    await unit.press('Tab');
    await page
      .getByRole('textbox', { name: /^(하루 목표|Daily target)$/, exact: true })
      .fill('2.5');
    await page.getByRole('button', { name: /^(저장|Save)$/, exact: true }).click();
    await expect.poll(async () => (await storedWorkspace(page)).habits[0]?.kind).toBe('quantity');
    expect((await storedWorkspace(page)).habits[0]).toMatchObject({
      kind: 'quantity',
      name,
      unit: customUnit,
      goal: 2.5,
    });
  });
}

test('only system quadrant names translate, including names identical to a default label', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  const data = emptyWorkspace();
  const literal = '👩‍💻 {{count}} $t(common.save)';
  data.quadrants[1].name = 'common.save';
  data.quadrants[2].name = 'Urgent, not important';
  data.quadrants[3].name = literal;
  await seedWorkspace(page, data);
  await page.reload();

  for (const language of ['ko', 'en', 'ko'] as const) {
    await changeLanguage(page, language);
    await page.getByLabel(/^(아이젠하워 매트릭스|Eisenhower Matrix)$/).click();
    await expect(page.locator('.quadrant-header h2')).toHaveText([
      language === 'ko' ? '중요하고 긴급한 일' : 'Important and urgent',
      'common.save',
      'Urgent, not important',
      literal,
    ]);
    await page.getByLabel(/^(매트릭스 설정|Matrix settings)$/).click();
    await expect(
      page.getByLabel(language === 'ko' ? 'plan 이름' : 'plan name', { exact: true }),
    ).toHaveValue('common.save');
    await expect(
      page.getByLabel(language === 'ko' ? 'later 이름' : 'later name', { exact: true }),
    ).toHaveValue(literal);
    await page.keyboard.press('Escape');
  }

  await page.getByLabel('매트릭스 설정', { exact: true }).click();
  await page.getByLabel('plan 이름', { exact: true }).fill('dates.today');
  await expect
    .poll(async () => (await storedWorkspace(page)).quadrants[1].name)
    .toBe('dates.today');
  await page.keyboard.press('Escape');
  await changeLanguage(page, 'en');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await expect(page.locator('.quadrant-header h2').nth(1)).toHaveText('dates.today');
  await page.reload();
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await expect(page.locator('.quadrant-header h2').nth(1)).toHaveText('dates.today');

  await page.getByLabel('Matrix settings', { exact: true }).click();
  await page.getByLabel('plan name', { exact: true }).fill('');
  await expect.poll(async () => (await storedWorkspace(page)).quadrants[1].name).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.locator('.quadrant-header h2').nth(1)).toHaveText('Important, not urgent');
});

test('language changes work offline without loading translations or losing capture drafts', async ({
  page,
  context,
}) => {
  const translationRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/locales\/|translation\.json|editor\.json/.test(request.url())) {
      translationRequests.push(request.url());
    }
  });
  await page.goto('/');
  await changeLanguage(page, 'ko');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const draft = 'Save <literal> {{count}} $t(common.save)';
  await page.locator('#quick-add-input').fill(draft);
  await context.setOffline(true);
  await changeLanguage(page, 'en');
  await expect(page.locator('#quick-add-input')).toHaveValue(draft);
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.task-title')).toHaveText(draft);
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0].title).toBe(draft);
  expect(translationRequests).toEqual([]);
  await page.reload();
  await expect(page.getByLabel('Settings and backup', { exact: true })).toBeVisible();
  await expect(page.locator('.task-title')).toHaveText(draft);
  await context.setOffline(false);
});

test('English capture feedback shows translated quantities without exposing message keys', async ({
  page,
}) => {
  await page.goto('/');
  await changeLanguage(page, 'en');
  await page.locator('#quick-add-input').fill('One task');
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.task-title')).toHaveText('One task');
  await page.locator('#quick-add-input').fill('Second task\nThird task');
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.toast')).toContainText('Added 2 tasks');
  await expect(page.locator('.task-title')).toHaveCount(3);
});

test.describe('English browser locale', () => {
  test.use({ locale: 'en-US' });

  test('one planned habit uses singular summaries and preserves its literal name', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#quick-add-input')).toBeVisible();
    const data = emptyWorkspace();
    const name = 'Save {{count}} $t(common.save)';

    data.habits.push({
      id: 'i18n-single-habit',
      name,
      color: '#7d9cc4',
      icon: 'circle',
      kind: 'boolean',
      goal: 1,
      unit: 'custom unit',
      frequency: 'weekly',
      weekdays: [1, 2, 3, 4, 5],
      weeklyTarget: 1,
      intervalDays: 1,
      step: 1,
      reminderTime: null,
      archived: false,
      startDate: '2026-10-01',
      zone: 'Asia/Seoul',
      createdAt: '2026-10-01T03:00:00.000Z',
    });
    await seedWorkspace(page, data);
    await page.reload();
    await page.clock.setFixedTime(new Date('2026-10-20T03:00:00.000Z'));
    await changeLanguage(page, 'en');
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await expect(
      page.getByText('0 of 1 habit planned for today completed.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('meter', { name: 'Today: 0 of 1 habit completed', exact: true }),
    ).toHaveCount(2);
    await expect(page.locator('.habit-name strong')).toHaveText(name);
    await page.locator('.habit-name').click();
    await expect(page.getByText('0 / 1 day completed this week', { exact: true })).toBeVisible();
  });

  test('image deletion uses the selected language and still edits the description', async ({
    page,
  }) => {
    await page.route('https://i18n-test.invalid/image.svg', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#7d9cc4"/></svg>',
      }),
    );
    await page.goto('/');
    await expect(page.locator('#quick-add-input')).toBeVisible();
    const data = emptyWorkspace();

    data.tasks.push({
      id: 'i18n-image',
      title: 'Authored image task',
      notes: '![Authored image](https://i18n-test.invalid/image.svg)',
      notesFormat: 'markdown',
      listId: 'inbox',
      tags: [],
      priority: 0,
      date: null,
      time: null,
      duration: 30,
      repeat: null,
      reminderMinutes: null,
      parentId: null,
      completedAt: null,
      createdAt: '2026-10-20T03:00:00.000Z',
      updatedAt: '2026-10-20T03:00:00.000Z',
      order: 0,
      deleted: false,
      pinned: false,
    });
    await seedWorkspace(page, data);
    await page.reload();
    await page.getByText('Authored image task', { exact: true }).click();
    const image = page.locator('.td-markdown img[alt="Authored image"]');

    await expect(image).toBeVisible();
    await changeLanguage(page, 'ko');
    await image.hover();
    await expect(page.locator('.td-markdown button[title="이미지 삭제"]')).toBeVisible();

    await changeLanguage(page, 'en');
    await image.hover();
    await page.locator('.td-markdown button[title="Delete image"]').click();
    await expect(image).toHaveCount(0);
    await page.reload();
    await page.getByText('Authored image task', { exact: true }).click();
    await expect(image).toHaveCount(0);
  });

  test('a missing browser storage capability displays a localized startup error', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    });
    await page.goto('/');
    const alert = page.getByRole('alert');

    await expect(alert).toContainText('Secure local storage is unavailable in this browser.');
    await expect(alert).not.toContainText('web_locks_required');
    await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  });

  test('an unknown startup error shows the localized fallback instead of an internal message', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(indexedDB, 'open', {
        configurable: true,
        value: () => {
          throw new Error('unknown_i18n_startup_error');
        },
      });
    });
    await page.goto('/');
    const alert = page.getByRole('alert');

    await expect(alert).toContainText('Could not open local storage.');
    await expect(alert).not.toContainText('unknown_i18n_startup_error');
  });

  test('recovery timestamps follow the app language even when the browser uses English', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#quick-add-input')).toBeVisible();
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Data and backups', exact: true })
      .click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'fixture.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await archiveFixture(emptyWorkspace())),
    });
    const confirmation = page.getByRole('dialog', { name: 'Import backup', exact: true });
    await confirmation.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    const registry = await storedRegistry(page);
    const createdAt = '2026-10-20T13:04:00.000Z';
    const name = 'Save {{count}} $t(common.save)';

    await page.evaluate(
      async ({ activeId, createdAt, name }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('rillday-workspaces');

          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(new Error('Cannot open the recovery fixture', { cause: request.error }));
        });

        try {
          const transaction = database.transaction('metadata', 'readwrite');

          const store = transaction.objectStore('metadata');
          const request = store.getAll();
          request.onsuccess = () => {
            const entries = request.result as Record<string, unknown>[];
            const entry = entries.find(
              (value) =>
                value.workspaceId === activeId &&
                value.reason === 'connection' &&
                typeof value.source === 'string',
            );
            if (!entry || typeof entry.id !== 'string') {
              transaction.abort();
              return;
            }
            store.put({ ...entry, createdAt, name }, `recovery:${activeId}:${entry.id}`);
          };
          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = transaction.onabort = () =>
              reject(new Error('Cannot save the recovery fixture', { cause: transaction.error }));
          });
        } finally {
          database.close();
        }
      },
      { activeId: registry.activeId, createdAt, name },
    );
    await page.reload();
    await changeLanguage(page, 'ko');

    for (const language of ['ko', 'en'] as const) {
      if (language === 'en') {
        await page.getByRole('button', { name: '돌아가기', exact: true }).click();
        await changeLanguage(page, 'en');
      }
      await page
        .getByLabel(language === 'ko' ? '설정과 백업' : 'Settings and backup', { exact: true })
        .click();
      if (language === 'en') {
        await page
          .locator('.settings-nav')
          .getByRole('button', { name: 'Calendar', exact: true })
          .click();
        await chooseChoice(page, page.getByLabel('Time format', { exact: true }), '12h');
      }
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: language === 'ko' ? '동기화' : 'Sync', exact: true })
        .click();
      await page
        .getByText(language === 'ko' ? '보관된 자료 복구' : 'Recover saved data', { exact: true })
        .click();
      const expected = await page.evaluate(
        ({ language, createdAt }) =>
          new Intl.DateTimeFormat(language, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            hour12: language === 'en',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date(createdAt)),
        { language, createdAt },
      );

      await expect(page.locator('.sync-backup')).toContainText(expected);
      await expect(page.locator('.sync-backup')).toContainText(name);
    }
  });
});
