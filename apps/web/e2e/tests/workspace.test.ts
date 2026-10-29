import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type Page, expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import {
  seedWorkspace,
  storedPreferences,
  storedRegistry,
  storedWorkspace,
} from '../support/storage';
import { archiveFixture, readArchive } from '../support/workspace-archive';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
}

async function add(page: Page, input: string) {
  const field = page.getByLabel('Quick add task', { exact: true });
  await field.fill(input);
  await field.press('Enter');
  await expect(field).toHaveValue('');
}

async function calendarMode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test('pending writes warn before navigation; staying retains the edit until durable reload', async ({
  page,
  context,
}) => {
  await ready(page);
  const registry = await storedRegistry(page);
  const workspaceId = registry.accounts.find(
    (account) => account.id === registry.activeId,
  )!.contentId;
  const blocker = await context.newPage();
  await ready(blocker);
  try {
    const lease = await blocker.evaluateHandle(async (id) => {
      const acquired = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const finished = navigator.locks.request(
        `rillday-document:${JSON.stringify([id, 'workspace'])}`,
        async () => {
          acquired.resolve();
          await release.promise;
        },
      );
      await acquired.promise;
      return { release: release.resolve, finished };
    }, workspaceId);
    await add(page, 'Preserve pending save');
    expect(
      (await storedWorkspace(page)).tasks.some((task) => task.title === 'Preserve pending save'),
    ).toBe(false);

    const warning = page.waitForEvent('dialog');
    const navigation = page.evaluate(() => location.reload());
    const dialog = await warning;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await navigation;
    await expect(
      page.locator('.task-title').filter({ hasText: 'Preserve pending save' }),
    ).toBeVisible();

    await lease.evaluate(async (lock) => {
      lock.release();
      await lock.finished;
    });
    await lease.dispose();
    await expect
      .poll(async () =>
        (await storedWorkspace(page)).tasks.some((task) => task.title === 'Preserve pending save'),
      )
      .toBe(true);
    await reloadSavedPage(page);
    await expect(
      page.locator('.task-title').filter({ hasText: 'Preserve pending save' }),
    ).toBeVisible();
  } finally {
    await blocker.close();
  }
});

test('quick capture, metadata editing, checklist and reload persistence', async ({ page }) => {
  await ready(page);
  await add(page, 'Research #work #planning tomorrow 3pm !1');
  await page
    .locator('.task-title')
    .filter({ hasText: /^Research$/ })
    .click();
  await page.getByLabel('Task description', { exact: true }).fill('Organize material to review.');
  const notes = page.getByLabel('Task description', { exact: true });
  await notes.press('End');
  await notes.press('Enter');
  await notes.press('Enter');
  await notes.pressSequentially('[] Check documents');
  const check = page.locator('.td-markdown [role="checkbox"]');
  await expect(check).toHaveCount(1);
  await check.focus();
  await check.press('Space');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toContain('- [x] Check documents');
  const before = (await storedWorkspace(page)).tasks[0];
  expect(before.tags).toEqual(['work', 'planning']);
  expect(before.priority).toBe(3);
  expect(before.time).toBe('15:00');
  await page.reload();
  await page.locator('.task-title').click();
  await expect(page.locator('.td-markdown [role="checkbox"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('IME Enter does not submit until composition ends', async ({ page }) => {
  await ready(page);
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('한글 조합');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  });
  await expect(input).toHaveValue('한글 조합');
  expect((await storedWorkspace(page)).tasks).toHaveLength(0);
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  await expect(page.locator('.task-title')).toHaveText('한글 조합');
});

test('one workspace stays usable across tabs and its dialog opens connection settings', async ({
  page,
  context,
}) => {
  await ready(page);
  await add(page, 'Task in shared workspace');
  const workspaceId = (await storedRegistry(page)).activeId;
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.task-title')).toHaveText('Task in shared workspace');
  await add(second, 'Added in another tab');
  await expect(page.locator('.task-title')).toHaveCount(2);
  await page.getByLabel('Current workspace', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Current workspace', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Sync settings', exact: true }).click();
  await expect(page.locator('.sync-settings')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.task-title')).toHaveCount(2);
  expect((await storedRegistry(page)).activeId).toBe(workspaceId);
  await second.close();
});

test('matrix drag changes priority and calendar date drag updates the same task', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Task being connected !1');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  const taskId = (await storedWorkspace(page)).tasks[0].id;
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const quadrants = page.locator('.quadrant');
  await page
    .locator('.task-row')
    .filter({ hasText: 'Task being connected' })
    .dragTo(quadrants.nth(1));
  await expect
    .poll(
      async () => (await storedWorkspace(page)).tasks.find((task) => task.id === taskId)?.priority,
    )
    .toBe(2);
  await page.getByLabel('Calendar', { exact: true }).click();
  const undated = page
    .locator('.calendar-undated')
    .getByText('Task being connected', { exact: true });
  const destination = page.locator('.calendar-day').first();
  const date = await destination.getAttribute('data-date');
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await undated.dragTo(destination);
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks.find((task) => task.id === taskId)?.date)
    .toBe(date);
  await page.getByLabel('Tasks', { exact: true }).click();
  await page.locator('.task-title').click();
  await expect(page.locator('.td-date-button')).not.toContainText('Set date');
});

test('dated child is visible in today and restoring a parent restores the tree', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Parent item');
  await page.locator('.task-title').click();
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await page.getByLabel('New subtask', { exact: true }).fill('Scheduled child today');
  await page.getByLabel('New subtask', { exact: true }).press('Enter');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(2);
  const original = (await storedWorkspace(page)).tasks;
  const parent = original.find((task) => task.title === 'Parent item');
  const child = original.find((task) => task.title === 'Scheduled child');
  expect(parent).toBeDefined();
  expect(child?.parentId).toBe(parent?.id);
  const expectedTree = original
    .map(({ id, parentId }) => ({ id, parentId, deleted: false }))
    .sort((left, right) => left.id.localeCompare(right.id));
  await page
    .locator('.task-sidebar')
    .getByRole('button', { name: /^Today/ })
    .click();
  await expect(page.locator('.task-title')).toHaveText('Scheduled child');
  await page
    .locator('.task-sidebar')
    .getByRole('button', { name: /^Inbox/ })
    .click();
  await page
    .locator('.task-title')
    .filter({ hasText: /^Parent item$/ })
    .click();
  await page.getByLabel('Task actions menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
  await page.locator('.task-sidebar').getByRole('button', { name: 'Trash', exact: true }).click();
  await page
    .locator('.task-title')
    .filter({ hasText: /^Parent item$/ })
    .click();
  await page
    .locator('.td-trash-banner')
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await storedWorkspace(page)).tasks
        .map(({ id, parentId, deleted }) => ({ id, parentId, deleted }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    )
    .toEqual(expectedTree);
});

test('habit check-in persists; archive and restore retain history', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Stretching');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.habit-name').filter({ hasText: 'Stretching' }).click();
  await page
    .locator('.habit-checkin')
    .getByRole('button', { name: 'Complete', exact: true })
    .click();
  await expect.poll(async () => (await storedWorkspace(page)).habitLogs[0]?.value).toBe(1);
  await page.getByRole('button', { name: 'Archive habit', exact: true }).click();
  await page.getByLabel('Archived habits', { exact: true }).click();
  await page.locator('.habit-name').click();
  await page.getByRole('button', { name: 'Restore habit', exact: true }).click();
  await expect
    .poll(async () => {
      const stored = await storedWorkspace(page);
      const habit = stored.habits.find((entry) => entry.name === 'Stretching');
      return (
        habit && {
          archived: habit.archived,
          value: stored.habitLogs.find((log) => log.habitId === habit.id)?.value,
        }
      );
    })
    .toEqual({ archived: false, value: 1 });
  await reloadSavedPage(page);
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await page.locator('.habit-name').click();
  await expect(page.locator('.habit-finish')).toContainText('Mark incomplete');
});

test('backup export/import works and malformed imports preserve the workspace', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Task to back up');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Data and backups', exact: true })
    .click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await downloaded;
  const backup = await readArchive(await readFile(await file.path(), 'utf8'), 'Asia/Seoul');
  const exportedTask = backup.tasks[0];
  if (!exportedTask) {
    throw new Error('Export did not contain the created task');
  }
  expect(exportedTask.title).toBe('Task to back up');
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, tasks: [null] })),
  });
  await expect(page.locator('.toast')).toContainText('backup format is unsupported');
  expect((await storedWorkspace(page)).tasks[0].title).toBe('Task to back up');
  exportedTask.title = 'Restored task';
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await archiveFixture(backup)),
  });
  await page
    .getByRole('dialog', { name: 'Import backup' })
    .getByRole('button', { name: 'Import', exact: true })
    .click();
  await expect(page.locator('.task-title')).toHaveText('Restored task');
});

test('narrow layout keeps task details and all primary views reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await add(page, 'Small screen check');
  await page.locator('.task-title').click();
  await expect(page.getByLabel('Task title', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const label of ['Eisenhower Matrix', 'Calendar', 'Habit Tracker', 'Tasks']) {
    await page.getByLabel(label, { exact: true }).click();
    await expect(page.locator('.main-workspace')).toBeVisible();
  }
});

test('clearing local storage does not orphan the IndexedDB workspace', async ({ page }) => {
  await ready(page);
  await add(page, 'Persist account details too');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  const originalId = (await storedRegistry(page)).activeId;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.task-title')).toHaveText('Persist account details too');
  expect((await storedRegistry(page)).activeId).toBe(originalId);
});

test('language updates every area and task details without translating user content', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Authored title #mytag tomorrow 3pm');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'ko');
  await chooseChoice(page, page.getByLabel('언어', { exact: true }), 'en');
  await expect(page.locator('.workspace-title-row h1')).toHaveText('Settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.workspace-title-row h1')).toContainText('Inbox');
  await page.locator('.task-title').click();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Authored title');
  await expect(page.locator('.td-date-button')).toContainText('Tomorrow');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await expect(page.locator('.quadrant-header h2').first()).toHaveText('Important and urgent');
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.locator('.workspace-title-row h1')).toHaveText('Calendar');
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Day', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: 'Week', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await expect(page.locator('.workspace-title-row h1')).toHaveText('Habit Tracker');
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await expect(page.getByLabel('Habit name', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => storedPreferences(page)).toMatchObject({ language: 'en' });
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.title)
    .toBe('Authored title');
  await reloadSavedPage(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(page.locator('.task-title')).toHaveText('Authored title');
});

test('light dark and system themes persist and follow live system appearance', async ({ page }) => {
  await ready(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme))
    .toBe('light');
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'System', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await chooseChoice(page, page.getByLabel('Density', { exact: true }), 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect
    .poll(async () => {
      const preferences = await storedPreferences(page);
      return { theme: preferences.theme, density: preferences.density };
    })
    .toEqual({ theme: 'system', density: 'compact' });
  await reloadSavedPage(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});

test('recognition preferences control real task capture and persist across reload', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('switch', { name: 'Recognize dates and times', exact: true }).click();
  await page.getByRole('switch', { name: 'Keep label text in titles', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await add(page, 'Keep authored text tomorrow 3pm #work');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.title)
    .toBe('Keep authored text tomorrow 3pm #work');
  const task = (await storedWorkspace(page)).tasks[0];
  expect(task.date).toBeNull();
  expect(task.time).toBeNull();
  expect(task.tags).toEqual(['work']);
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ recognizeDates: false, keepTagText: true });
  await reloadSavedPage(page);
  await add(page, 'Second tomorrow');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[1]?.date).toBeNull();
});

test('calendar preferences retain view context and affect actual week and time coordinates', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'All-day item today');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Calendar', exact: true })
    .click();
  await chooseChoice(page, page.getByLabel('Start week on', { exact: true }), '0');
  await chooseChoice(page, page.getByLabel('Time format', { exact: true }), '12h');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.locator('.calendar-weekdays').locator('span').first()).toHaveText('Sun');
  await calendarMode(page, 'Day');
  await expect(page.locator('.calendar-hour').nth(15)).toContainText('PM');
  await page
    .locator('.calendar-all-day .calendar-task-title')
    .filter({ hasText: 'All-day item' })
    .dblclick();
  await expect(page.getByRole('dialog', { name: 'Add task', exact: true })).toHaveCount(0);
  await page.getByLabel('Tasks', { exact: true }).click();
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calendar view', exact: true })).toHaveText('Day');
  await calendarMode(page, 'Week');
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ calendarView: 'week', weekStartsOn: 0, timeFormat: '12h' });
  await expect
    .poll(async () =>
      (await storedWorkspace(page)).tasks.some(
        (task) => task.title === 'All-day item' && task.date !== null && task.time === null,
      ),
    )
    .toBe(true);
  await reloadSavedPage(page);
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calendar view', exact: true })).toHaveText('Week');
  await expect(page.locator('.calendar-time-head>button')).toHaveCount(7);
});

test('settings remain usable with keyboard and narrow layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await add(page, 'Keep task history while changing settings');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Control+z');
  expect((await storedWorkspace(page)).tasks).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.settings-page')).toHaveCount(0);
  await expect(page.getByLabel('Quick add task', { exact: true })).toBeVisible();
});

for (const language of ['ko', 'en']) {
  for (const width of [1440, 390]) {
    test(`tasks, matrix, calendar, habits, search, profiles and backup work together in ${language}/${width}`, async ({
      page,
    }) => {
      const text = (ko: string, en: string) => (language === 'ko' ? ko : en);

      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
      await chooseChoice(
        page,
        page.getByRole('combobox', { name: 'Language', exact: true }),
        language,
      );
      await page.getByRole('button', { name: text('돌아가기', 'Back'), exact: true }).click();

      const capture = page.locator('#quick-add-input');
      await capture.fill('Flow item #flow today !2');
      await capture.press('Enter');
      await page.locator('.task-title').filter({ hasText: 'Flow item' }).click();
      await page
        .getByRole('textbox', { name: text('할 일 설명', 'Task description'), exact: true })
        .fill('User notes survive every view.');
      await page
        .getByRole('button', { name: text('할 일 상세 닫기', 'Close task details'), exact: true })
        .click();

      await page
        .getByRole('button', {
          name: text('아이젠하워 매트릭스', 'Eisenhower Matrix'),
          exact: true,
        })
        .click();
      await expect(page.locator('.quadrant .task-title')).toHaveText('Flow item');
      await page
        .getByRole('button', { name: text('매트릭스 설정', 'Matrix settings'), exact: true })
        .click();
      await chooseChoice(
        page,
        page.getByRole('combobox', {
          name: text('분류 방식', 'Grouping'),
          exact: true,
        }),
        'complex',
      );
      await page
        .getByRole('dialog')
        .getByRole('button', { name: text('완료', 'Complete'), exact: true })
        .click();

      await page.getByRole('button', { name: text('캘린더', 'Calendar'), exact: true }).click();
      await expect(
        page.locator('.calendar-task-title').filter({ hasText: 'Flow item' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: text('캘린더 보기', 'Calendar view'), exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: text('일', 'Day'), exact: true }).click();
      await expect(
        page.locator('.calendar-task-title').filter({ hasText: 'Flow item' }),
      ).toBeVisible();

      await page
        .getByRole('button', { name: text('습관 트래커', 'Habit Tracker'), exact: true })
        .click();
      await page.getByRole('button', { name: text('습관 추가', 'Add habit'), exact: true }).click();
      await page
        .getByRole('button', { name: text('직접 만들기', 'Create your own'), exact: true })
        .click();
      await page.getByLabel(text('습관 이름', 'Habit name'), { exact: true }).fill('Flow habit');
      await page
        .getByRole('radio', { name: text('수량 기록', 'Track amount'), exact: true })
        .click();
      await page
        .getByRole('textbox', { name: text('하루 목표', 'Daily target'), exact: true })
        .fill('3');
      await page.getByRole('button', { name: text('저장', 'Save'), exact: true }).click();
      await page.locator('.habit-name').filter({ hasText: 'Flow habit' }).click();
      const amount = page.getByRole('textbox', {
        name: new RegExp(text('^하루 총량', '^Daily total')),
      });
      await amount.fill('2');
      await amount.press('Tab');
      await page
        .getByLabel(text('체크인 메모', 'Check-in note'), { exact: true })
        .fill('A real note.');
      await page
        .getByRole('button', { name: text('상세 닫기', 'Close details'), exact: true })
        .click();

      await page.keyboard.press('Control+k');
      await page.locator('.global-search input').fill('Flow item');
      await page.locator('.search-results button').click();
      await expect(
        page.getByRole('textbox', { name: text('할 일 설명', 'Task description'), exact: true }),
      ).toHaveText('User notes survive every view.');
      await page
        .getByRole('button', { name: text('할 일 상세 닫기', 'Close task details'), exact: true })
        .click();

      await page
        .getByRole('button', { name: text('현재 작업 공간', 'Current workspace'), exact: true })
        .click();
      const workspaceDialog = page.getByRole('dialog', {
        name: text('현재 작업 공간', 'Current workspace'),
        exact: true,
      });
      await expect(workspaceDialog).toBeVisible();
      await workspaceDialog
        .getByRole('button', { name: text('동기화 설정', 'Sync settings'), exact: true })
        .click();
      await expect(page.locator('.sync-settings')).toBeVisible();
      await page.getByRole('button', { name: text('돌아가기', 'Back'), exact: true }).click();
      await expect(page.locator('.task-title')).toHaveText('Flow item');
      const snapshot = await storedWorkspace(page);
      expect(snapshot.habitLogs.find((log) => log.habitId === snapshot.habits[0].id)?.value).toBe(
        2,
      );

      await page
        .getByRole('button', { name: text('설정과 백업', 'Settings and backup'), exact: true })
        .click();
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: text('데이터와 백업', 'Data and backups'), exact: true })
        .click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: text('내보내기', 'Export'), exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(/\.json$/);
      await page.getByRole('button', { name: text('돌아가기', 'Back'), exact: true }).click();

      await page.reload();
      await expect(page.locator('.task-title')).toHaveText('Flow item');
      await expect(page.locator('select:visible')).toHaveCount(0);
    });
  }
}

test('a downloaded backup above 10MiB restores through the file picker', async ({ page }) => {
  const data = emptyWorkspace();
  data.tasks = Array.from({ length: 11 }, (_, order) => {
    const task = createTaskRecord(`Backup review ${order}`, data, {
      order,
      notes: randomBytes(786432).toString('base64'),
    });
    expect(task).not.toBeNull();
    return task!;
  });
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloaded;
  const source = await download.path();
  expect(source).not.toBeNull();
  expect(readFileSync(source).byteLength).toBeGreaterThan(10 * 1024 * 1024);
  await page.locator('input[type=file]').first().setInputFiles(source);
  await expect(page.getByRole('dialog', { name: 'Import backup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import backup', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(11);
  await page.reload();
  const restored = (await storedWorkspace(page)).tasks;
  expect(restored).toHaveLength(11);
  expect(restored.every((task) => task.notes.length === 1048576)).toBe(true);
});

test('populated demo has isolated storage and retains edits without reseeding or touching the normal workspace', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Keep in real workspace');
  await input.press('Enter');
  await expect(page.locator('.task-title')).toHaveText('Keep in real workspace');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks.map((task) => task.title))
    .toEqual(['Keep in real workspace']);
  await page.goto('/?demo=1');
  await expect(page.locator('.task-row')).not.toHaveCount(0);
  await expect(
    page.locator('.task-title').filter({ hasText: 'Keep in real workspace' }),
  ).toHaveCount(0);
  await input.fill('Added to demo during review');
  await input.press('Enter');
  await expect(
    page.locator('.task-title').filter({ hasText: 'Added to demo during review' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await storedWorkspace(page)).tasks.some((t) => t.title === 'Added to demo during review'),
    )
    .toBe(true);
  await reloadSavedPage(page);
  await expect(
    page.locator('.task-title').filter({ hasText: 'Added to demo during review' }),
  ).toBeVisible();
  expect((await storedRegistry(page, true)).activeId).not.toBe(
    (await storedRegistry(page, false)).activeId,
  );
  await page.goto('/');
  await expect(page.locator('.task-title')).toHaveText('Keep in real workspace');
});
