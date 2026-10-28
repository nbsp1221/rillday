import { expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences, storedWorkspace } from '../support/storage';

test('a rejected list save keeps its name and destination until corrected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lists', exact: true }).hover();
  await page.getByRole('button', { name: 'Add task list', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New list', exact: true });
  const input = dialog.getByLabel('List name', { exact: true });
  // Exercise command rejection even when a caller bypasses the input's length guard.
  await input.evaluate((element) => element.removeAttribute('maxlength'));
  const invalidName = 'l'.repeat(81);
  await input.fill(invalidName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue(invalidName);
  await expect(page.locator('.toast')).toContainText('The change is invalid');
  expect((await storedWorkspace(page)).lists).toHaveLength(1);

  await input.fill('Corrected list');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Corrected list', exact: true })).toBeVisible();
  await expect
    .poll(async () => (await storedWorkspace(page)).lists.map((list) => list.name))
    .toContain('Corrected list');
});

test('a rejected label save retains its draft and leaves the current list selected', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Labels', exact: true }).hover();
  await page.getByRole('button', { name: 'Create label', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New label', exact: true });
  const input = dialog.getByRole('textbox', { name: 'Name', exact: true });
  await input.evaluate((element) => element.removeAttribute('maxlength'));
  const invalidName = 'la'.repeat(81);
  await input.fill(invalidName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue(invalidName);
  await expect(page.locator('.toast')).toContainText('The change is invalid');
  expect((await storedWorkspace(page)).labels ?? []).toHaveLength(0);
  await expect(
    page.getByRole('heading', { name: 'Inbox', exact: true, includeHidden: true }),
  ).toBeVisible();

  await input.fill('correctedlabel');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await storedWorkspace(page)).labels).toContain('correctedlabel');
});

test('a rejected habit save retains its editor and can be corrected without a duplicate', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Habit', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New habit', exact: true });
  const input = dialog.getByLabel('Habit name', { exact: true });
  await input.evaluate((element) => element.removeAttribute('maxlength'));
  const invalidName = 'ha'.repeat(121);
  await input.fill(invalidName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue(invalidName);
  await expect(page.locator('.toast')).toContainText('The change is invalid');
  expect((await storedWorkspace(page)).habits).toHaveLength(0);

  await input.fill('Corrected habit');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await storedWorkspace(page)).habits.map((habit) => habit.name))
    .toStrictEqual(['Corrected habit']);
});

test('a new habit check-in invalidates the Undo action from an older list deletion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Habit', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Daily note');
  await page
    .getByRole('dialog', { name: 'New habit', exact: true })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  await page.getByLabel('Tasks', { exact: true }).click();
  await page.getByRole('button', { name: 'New list', exact: true }).click();
  await page.getByLabel('List name', { exact: true }).fill('List to delete');
  await page
    .getByRole('dialog', { name: 'New list', exact: true })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await page.locator('.sidebar-list').filter({ hasText: 'List to delete' }).hover();
  await page.getByLabel('Edit List to delete list', { exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Edit list', exact: true })
    .getByRole('button', { name: 'Delete list', exact: true })
    .click();
  const toast = page.locator('.toast');
  await expect(toast.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();

  await page.getByLabel('Habit', { exact: true }).click();
  await page.locator('.habit-row .habit-day.today').click();
  await expect(page.locator('.habit-row .habit-day.today')).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toContainText('List deleted');
  await expect(toast.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  expect((await storedWorkspace(page)).habitLogs).toHaveLength(1);
});

test('quiet save UI still reports failures and retries task and preference writes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put') as
      | TypedPropertyDescriptor<IDBObjectStore['put']>
      | undefined;
    const original = descriptor?.value;
    if (!original) {
      throw new Error('IndexedDB put method is unavailable');
    }
    Object.assign(window, { failTaskSave: true, failPreferenceSave: false });
    IDBObjectStore.prototype.put = function (value, key) {
      const flags = window as unknown as { failTaskSave: boolean; failPreferenceSave: boolean };
      if (
        (this.name === 'documents' && flags.failTaskSave) ||
        (this.name === 'metadata' && key === 'preferences' && flags.failPreferenceSave)
      ) {
        throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
      }
      return original.call(this, value, key!);
    };
  });
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Input retained after failure');
  await input.press('Enter');
  await expect(page.locator('.save-error')).toBeVisible();
  await expect(page.locator('.task-title')).toHaveText('Input retained after failure');
  await page.evaluate(() => Object.assign(window, { failTaskSave: false }));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.locator('.save-error')).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { failPreferenceSave: true }));
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Startup view', { exact: true }), 'matrix');
  await expect(page.locator('.settings-status[role="alert"]')).toBeVisible();
  await page.evaluate(() => Object.assign(window, { failPreferenceSave: false }));
  await page.getByRole('button', { name: 'Preferences not saved · Retry', exact: true }).click();
  await expect(page.locator('.settings-status')).toHaveCount(0);
  await expect.poll(() => storedPreferences(page)).toMatchObject({ startupView: 'matrix' });
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.title)
    .toBe('Input retained after failure');
  await reloadSavedPage(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.workspace-header h1')).toHaveText('Eisenhower Matrix');
  await expect(page.locator('.task-title')).toHaveText('Input retained after failure');
});
