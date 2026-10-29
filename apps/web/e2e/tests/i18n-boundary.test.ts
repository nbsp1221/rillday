import { expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { seedArchive, storedPreferences } from '../support/storage';
import { archiveFixture, conflictingArchive } from '../support/workspace-archive';

for (const language of ['ko', 'en'] as const) {
  test(`conflict presentation keeps system semantics and authored strings in ${language}`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#quick-add-input')).toBeVisible();
    const data = emptyWorkspace();
    const first = createTaskRecord('lists.inbox', data);
    const second = createTaskRecord('backup.import', data);
    if (!first || !second) {
      throw new Error('Task fixture creation failed');
    }
    data.tasks.push(first, second);
    data.lists.push({ id: crypto.randomUUID(), name: 'lists.inbox', color: '#7d9cc4' });
    data.habits.push({
      id: crypto.randomUUID(),
      name: 'weekly',
      color: '#7d9cc4',
      icon: 'circle',
      kind: 'quantity',
      goal: 2,
      unit: 'daily{{count}}$t(x)',
      step: 1,
      frequency: 'weekly',
      weekdays: [1],
      weeklyTarget: 2,
      intervalDays: 1,
      reminderTime: null,
      archived: false,
      startDate: '2026-10-01',
      zone: 'Asia/Seoul',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    const originalList = { id: crypto.randomUUID(), name: 'Original list', color: '#7d9cc4' };
    data.lists.push(originalList);
    second.listId = originalList.id;
    const source = await archiveFixture(data);
    const conflicted = await conflictingArchive(source, [
      (workspace) => {
        const task = workspace.tasks[first.id];
        task.priority = 1;
        task.schedule = {
          date: '2030-01-31',
          time: null,
          zone: null,
          durationMinutes: 30,
          repeat: { frequency: 'daily', interval: 1, until: null, anchorDay: null },
          reminderMinutes: null,
        };
        workspace.tasks[second.id].location = {
          listId: Object.values(workspace.lists).find((list) => list.system === 'inbox')!.id,
          parentId: null,
        };
        workspace.habits[data.habits[0].id].rules[0].goal = 3;
      },
      (workspace) => {
        const task = workspace.tasks[first.id];
        task.priority = 3;
        task.schedule = {
          date: '2030-01-31',
          time: null,
          zone: null,
          durationMinutes: 30,
          repeat: { frequency: 'weekly', interval: 2, until: null, anchorDay: null },
          reminderMinutes: null,
        };
        workspace.tasks[second.id].location = { listId: data.lists[1].id, parentId: null };
        workspace.habits[data.habits[0].id].rules[0].goal = 4;
      },
    ]);
    await seedArchive(page, conflicted);
    await page.reload();
    await page.getByLabel('Settings and backup', { exact: true }).click();
    if (language === 'ko') {
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: 'General', exact: true })
        .click();
      await page.getByRole('combobox', { name: 'Language', exact: true }).click();
      await page.getByRole('option', { name: '한국어', exact: true }).click();
    }
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: language === 'ko' ? '동기화' : 'Sync', exact: true })
      .click();
    const cards = page.locator('.sync-conflict');
    await expect(cards).toHaveCount(4);
    const taskCards = cards.filter({
      has: page.locator('strong').filter({ hasText: /^lists\.inbox$/ }),
    });
    const habitCard = cards.filter({ has: page.locator('strong').filter({ hasText: /^weekly$/ }) });
    const locationCard = cards.filter({
      has: page.locator('strong').filter({ hasText: /^backup\.import$/ }),
    });
    await expect(taskCards).toHaveCount(2);
    await expect(habitCard).toHaveCount(1);
    await expect(locationCard).toHaveCount(1);

    const values = async (locator: typeof cards) =>
      (
        await locator
          .locator('textarea')
          .evaluateAll((fields) => fields.map((field) => (field as HTMLTextAreaElement).value))
      ).join('\n');

    const taskValue = await values(taskCards);
    expect(taskValue).toContain(
      language === 'ko' ? '우선순위: 높은 우선순위' : 'Priority: High priority',
    );
    expect(taskValue).toContain(language === 'ko' ? '빈도: 매주' : 'Frequency: Weekly');
    const habitValue = await values(habitCard);
    expect(habitValue).toContain(
      language === 'ko' ? '빈도: 일주일에 며칠' : 'Frequency: A number of days each week',
    );
    expect(habitValue).toContain(
      language === 'ko' ? '기록 방식: 수량 기록' : 'Tracking type: Track amount',
    );
    expect(habitValue).toContain('daily{{count}}$t(x)');
    expect(habitValue).toContain(language === 'ko' ? '요일: 월' : 'Weekdays: Mon');
    const locationValue = await values(locationCard);
    expect(locationValue).toContain(language === 'ko' ? '목록: 수집함' : 'Lists: Inbox');
    expect(locationValue).toContain(language === 'ko' ? '목록: lists.inbox' : 'Lists: lists.inbox');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await cards.first().scrollIntoViewIfNeeded();
    }
  });
}

for (const failure of ['known', 'unknown'] as const) {
  test(`startup ${failure} errors retain the saved application language`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'General', exact: true })
      .click();
    await page.getByRole('combobox', { name: 'Language', exact: true }).click();
    await page.getByRole('option', { name: '한국어', exact: true }).click();
    await expect.poll(async () => (await storedPreferences(page)).language).toBe('ko');
    await page.addInitScript((failure) => {
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value:
          failure === 'known'
            ? undefined
            : { request: () => Promise.reject(new Error('unknown_i18n_startup_error')) },
      });
    }, failure);
    await page.reload();
    const alert = page.getByRole('alert');
    await expect(alert.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible();
    await expect(alert).toHaveAttribute('lang', 'ko');
    await expect(alert).not.toContainText('unknown_i18n_startup_error');
    await expect(alert).not.toContainText('web_locks_required');
    await expect(alert).toContainText(
      failure === 'known'
        ? '이 브라우저에서 안전한 저장 기능을 사용할 수 없어요.'
        : '저장소를 열 수 없어요.',
    );
  });
}

for (const language of ['ko', 'en'] as const) {
  test(`calendar and habit vendor controls expose localized accessible names in ${language}`, async ({
    page,
  }) => {
    await page.goto('/');
    if (language === 'ko') {
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: 'General', exact: true })
        .click();
      await page.getByRole('combobox', { name: 'Language', exact: true }).click();
      await page.getByRole('option', { name: '한국어', exact: true }).click();
      await page.getByRole('button', { name: /^(돌아가기|Back)$/, exact: true }).click();
    }
    await page.getByLabel(language === 'ko' ? '캘린더' : 'Calendar', { exact: true }).click();
    await page
      .getByRole('button', {
        name: language === 'ko' ? '캘린더 보기' : 'Calendar view',
        exact: true,
      })
      .click();
    await expect(page.getByRole('menuitemradio')).toHaveText(
      language === 'ko'
        ? ['일', '주', '월', '연', '일정']
        : ['Day', 'Week', 'Month', 'Year', 'Agenda'],
    );
    await page.keyboard.press('Escape');
    await page
      .getByLabel(language === 'ko' ? '습관 트래커' : 'Habit Tracker', { exact: true })
      .click();
    await page
      .getByRole('button', { name: language === 'ko' ? '습관 추가' : 'Add habit', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: language === 'ko' ? '직접 만들기' : 'Create your own',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: language === 'ko' ? '모양' : 'Appearance', exact: true })
      .click();
    await expect(page.locator('.habit-icon-grid').getByRole('radio')).toHaveCount(64);
    await expect(
      page.getByRole('radio', { name: language === 'ko' ? '원' : 'Circle', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('tab', { name: language === 'ko' ? '색상' : 'Color', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: language === 'ko' ? '사용자 지정 색상' : 'Custom color',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('slider', { name: language === 'ko' ? '색조' : 'Hue', exact: true }),
    ).toBeVisible();
    const areas = page.getByRole('slider', {
      name: language === 'ko' ? /^채도 및 밝기/ : /^Saturation and brightness/,
    });
    const area = areas.first();
    await expect(area).toHaveAttribute('aria-valuetext', language === 'ko' ? /채도/ : /Saturation/);
    expect(
      await areas.evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('aria-valuetext')).join(' '),
      ),
    ).toMatch(language === 'ko' ? /명도/ : /Brightness/);
    await area.press('ArrowRight');
    await expect(area).toHaveAttribute('aria-valuetext', language === 'ko' ? /채도/ : /Saturation/);
  });
}
