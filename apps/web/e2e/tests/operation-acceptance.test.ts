import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('101 task capture rejects the entire input and a corrected retry has one Undo/Redo group', async ({
  page,
}) => {
  const count = 101;
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  const lines = Array.from({ length: count }, (_, index) => `Review item ${index}`);
  const invalid = [...lines.slice(0, -1), 'a'.repeat(100001)].join('\n');
  await input.fill(invalid);
  await input.press('Enter');

  await expect(page.locator('.toast')).toContainText('The change is invalid');
  await expect(input).toHaveValue(invalid);
  await expect(input).toBeFocused();
  await expect(page.locator('.task-title')).toHaveCount(0);
  expect((await storedWorkspace(page)).tasks).toHaveLength(0);

  await input.fill(lines.join('\n'));
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(count);
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(0);

  const inbox = page.locator('.task-sidebar').getByRole('button', { name: /^Inbox/ });
  await inbox.focus();
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(count);

  await reloadSavedPage(page);
  const tasks = (await storedWorkspace(page)).tasks;
  expect(tasks).toHaveLength(count);
  expect(new Set(tasks.map((task) => task.title)).size).toBe(count);
  expect(tasks.map((task) => task.title).sort()).toEqual([...lines].sort());
});
