import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('a rejected capture retains the draft and focus, reports its real error and can be corrected', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  const invalidTitle = 'a'.repeat(100001);
  await input.fill(invalidTitle);
  await input.press('Enter');

  await expect(input).toHaveValue(invalidTitle);
  await expect(input).toBeFocused();
  await expect(page.locator('.toast')).toContainText('The change is invalid');
  await expect(page.locator('.task-title')).toHaveCount(0);
  expect((await storedWorkspace(page)).tasks).toHaveLength(0);

  await input.fill('Updated task');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('.task-title')).toHaveText('Updated task');
});

test('a rejected inline rename keeps the editor and selection available for correction', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Task to review');
  await input.press('Enter');
  const row = page.locator('.task-row');
  await row.focus();
  await row.press('F2');
  const title = page.getByLabel('Edit title in list', { exact: true });
  const invalidTitle = 'b'.repeat(100001);
  await title.fill(invalidTitle);
  await title.press('Enter');

  await expect(title).toHaveValue(invalidTitle);
  await expect(title).toBeFocused();
  await expect(page.locator('.toast')).toContainText('The change is invalid');
  expect((await storedWorkspace(page)).tasks[0].title).toBe('Task to review');

  await title.fill('Corrected title');
  await title.press('Enter');
  await expect(page.locator('.task-title')).toHaveText('Corrected title');
});

test('trash restoration and permanent deletion share reliable Undo and Redo across detail and row actions', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('History review');
  await input.press('Enter');
  await page.locator('.task-title').click();
  await page.getByLabel('Task actions menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
  await page.locator('.task-sidebar').getByRole('button', { name: 'Trash', exact: true }).click();
  await page.locator('.task-title').click();
  await page
    .locator('.td-trash-banner')
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.deleted).toBe(false);

  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.deleted).toBe(true);
  await page.locator('.task-row').focus();
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.deleted).toBe(false);

  await page.getByLabel('Task actions menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
  await page.locator('.task-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete permanently…', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete permanently', exact: true })
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(0);

  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.deleted).toBe(true);
  await page.locator('.task-row').focus();
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(0);

  await reloadSavedPage(page);
  expect((await storedWorkspace(page)).tasks).toHaveLength(0);
});

test('row menus fit the viewport, close after action and support contextual trash actions', async ({
  page,
}) => {
  const input = page.getByLabel('Quick add task', { exact: true });

  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input.fill(Array.from({ length: 28 }, (_, i) => `List item ${i}`).join('\n'));
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(28);
  const before = (await storedWorkspace(page)).tasks;
  expect(before).toHaveLength(28);
  const target = before.find((task) => task.title === 'List item 27');
  expect(target).toBeDefined();
  const row = page.locator(`.task-row[data-task-id="${target!.id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click({ button: 'right' });
  const menu = page.locator('[data-rillday-menu]');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(792);
  await menu.getByRole('menuitem', { name: 'Pin to top', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await row.click({ button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
  await page.locator('.task-sidebar').getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.locator('.task-check')).toBeDisabled();
  await page.locator('.task-row').click({ button: 'right' });
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await expect(menu).not.toContainText('Move to tomorrow');
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).tasks.find((task) => task.id === target!.id)?.deleted,
    )
    .toBe(true);
  await menu.getByRole('menuitem', { name: 'Restore', exact: true }).click();
  await expect
    .poll(async () => {
      const tasks = (await storedWorkspace(page)).tasks;
      const restored = tasks.find((task) => task.id === target!.id);
      return {
        ids: tasks.map((task) => task.id).sort((left, right) => left.localeCompare(right)),
        deletedIds: tasks.filter((task) => task.deleted).map((task) => task.id),
        restored: restored && { id: restored.id, title: restored.title, deleted: restored.deleted },
      };
    })
    .toEqual({
      ids: before.map((task) => task.id).sort((left, right) => left.localeCompare(right)),
      deletedIds: [],
      restored: { id: target!.id, title: target!.title, deleted: false },
    });
});

test('keyboard row navigation opens details, cancels inline edits and continues after completion', async ({
  page,
}) => {
  const input = page.getByLabel('Quick add task', { exact: true });

  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input.fill('Keyboard one\nKeyboard two\nKeyboard three');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  const rows = page.locator('.task-row');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Keyboard two');
  await page.keyboard.press('F2');
  await page.getByLabel('Edit title in list', { exact: true }).fill('Cancelled title');
  await page.keyboard.press('Escape');
  await expect(rows.nth(1)).toBeFocused();
  expect((await storedWorkspace(page)).tasks[1].title).toBe('Keyboard two');
  const selectedId = await rows.nth(1).getAttribute('data-task-id');
  expect(selectedId).not.toBeNull();
  await page.keyboard.press('Space');
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).tasks.find((task) => task.id === selectedId)?.completedAt,
    )
    .toMatch(/^\d{4}-\d{2}-\d{2}T/);
  await expect(page.locator('.task-row:focus')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Task title', { exact: true })).toBeFocused();
});

test('duplication retains the child tree and undo restores the original workspace', async ({
  page,
}) => {
  const input = page.getByLabel('Quick add task', { exact: true });

  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input.fill('Parent to duplicate');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await page.locator('.task-title').click();
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await page.getByLabel('New subtask', { exact: true }).fill('Child to duplicate');
  await page.getByLabel('New subtask', { exact: true }).press('Enter');
  await page.getByLabel('Task actions menu', { exact: true }).click();
  await page
    .getByRole('menu', { name: 'Task actions', exact: true })
    .getByRole('menuitem', { name: 'Duplicate', exact: true })
    .click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(4);
  const state = await storedWorkspace(page);
  const copy = state.tasks.find((task) => task.title === 'Parent to duplicate (copy)')!;
  expect(
    state.tasks.some((task) => task.parentId === copy.id && task.title === 'Child to duplicate'),
  ).toBe(true);
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(2);
});
