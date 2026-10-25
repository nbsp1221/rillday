import assert from 'node:assert/strict';
import { type Page, expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences } from '../support/storage';

async function choose(page: Page, control: 'Sort' | 'Group', option: string) {
  await page.getByRole('button', { name: control, exact: true }).click();
  await page.getByRole('menuitemradio', { name: option, exact: true }).click();
  await expect(page.getByRole('button', { name: control, exact: true })).toBeFocused();
}

const titles = (page: Page) => page.locator('.task-items > .task-row > .task-content .task-title');

test('sorting handles both directions, times, undated tasks, priorities and numeric titles', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Task 2 tomorrow 9am !1\nTask 10 tomorrow 3pm !2\nTask 1 !4');
  await input.press('Enter');
  for (const [option, expected] of [
    ['Date · earliest first', ['Task 2', 'Task 10', 'Task 1']],
    ['Date · latest first', ['Task 10', 'Task 2', 'Task 1']],
    ['Priority · highest first', ['Task 2', 'Task 10', 'Task 1']],
    ['Priority · lowest first', ['Task 1', 'Task 10', 'Task 2']],
    ['Title · ascending', ['Task 1', 'Task 2', 'Task 10']],
    ['Title · descending', ['Task 10', 'Task 2', 'Task 1']],
  ] as const) {
    await choose(page, 'Sort', option);
    await expect(titles(page)).toHaveText([...expected]);
  }
  await page
    .locator('.task-row')
    .filter({ hasText: 'Task 1' })
    .filter({ has: page.getByText('Task 1', { exact: true }) })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin to top', exact: true }).click();
  await choose(page, 'Sort', 'Date · earliest first');
  await expect(titles(page).first()).toHaveText('Task 1');
  await page.getByRole('button', { name: 'Sort', exact: true }).press('ArrowDown');
  await expect(
    page.getByRole('menuitemradio', { name: 'Date · earliest first', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
});

test('grouping reuses collapsible sections, sorts within them and remembers options per scope after reload', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.smart-lists > button').nth(3).click();
  const original = await titles(page).allTextContents();
  await choose(page, 'Group', 'Lists');
  await expect(page.locator('.task-section-title').first()).toHaveText('Inbox');
  expect((await titles(page).allTextContents()).sort()).toEqual([...original].sort());
  await expect(page.locator('.task-items > .task-row .row-list')).toHaveCount(0);
  await choose(page, 'Sort', 'Title · ascending');
  const first = page.locator('.task-section').first();
  const toggle = first.locator('.task-section-toggle');
  await toggle.click();
  await expect(first.locator('.task-section-body')).toBeHidden();
  await toggle.press('Enter');
  await page.locator('.smart-lists > button').nth(1).click();
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toHaveAttribute(
    'title',
    'Group: Date',
  );
  await page.locator('.smart-lists > button').nth(3).click();
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toHaveAttribute(
    'title',
    'Group: Lists',
  );
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ taskViews: { all: { group: 'list', sort: 'title' } } });
  await reloadSavedPage(page);
  await page.locator('.smart-lists > button').nth(3).click();
  await expect(page.getByRole('button', { name: 'Sort', exact: true })).toHaveAttribute(
    'title',
    'Sort: Title · ascending',
  );
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toHaveAttribute(
    'title',
    'Group: Lists',
  );
  await choose(page, 'Group', 'Priority');
  await expect(page.locator('.task-section-title').first()).toHaveText('High priority');
  await choose(page, 'Group', 'Date');
  await expect(page.locator('.task-section-title').first()).toHaveText('Overdue');
  await expect(page.locator('.task-section-title').last()).toHaveText('Completed');
  await choose(page, 'Group', 'No grouping');
  await expect(page.locator('.task-section-title')).toHaveText(['Completed']);
});

test('manual reordering is disabled by grouping or sorting, and list scopes omit redundant list grouping', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Alpha\nBravo\nCharlie');
  await input.press('Enter');
  await choose(page, 'Sort', 'Title · ascending');
  await page.locator('.task-row').last().dragTo(page.locator('.task-row').first());
  await expect(titles(page)).toHaveText(['Alpha', 'Bravo', 'Charlie']);
  await choose(page, 'Sort', 'Manual');
  await choose(page, 'Group', 'Priority');
  const before = await titles(page).allTextContents();
  await page.locator('.task-row').last().dragTo(page.locator('.task-row').first());
  await expect(titles(page)).toHaveText(before);
  await choose(page, 'Group', 'No grouping');
  await page
    .locator('.task-row')
    .last()
    .dragTo(page.locator('.task-row').first(), { targetPosition: { x: 100, y: 4 } });
  const entry = before.at(-1);
  assert(entry !== undefined, 'Missing entry');
  await expect(titles(page).first()).toHaveText(entry);
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Lists', exact: true })).toHaveCount(0);
});

test('Trash exposes its global action in the header, confirms deletion and stays balanced on narrow screens', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.smart-lists > button').nth(5).click();
  const empty = page
    .locator('.workspace-header')
    .getByRole('button', { name: 'Empty trash', exact: true });
  await expect(empty).toBeVisible();
  await expect(
    page.locator('.task-scroll').getByRole('button', { name: 'Empty trash', exact: true }),
  ).toHaveCount(0);
  await choose(page, 'Group', 'Lists');
  await expect(page.locator('.task-section-title')).toHaveText(['Inbox']);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(empty).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await empty.click();
  const dialog = page.getByRole('dialog', { name: 'Empty trash', exact: true });
  await expect(dialog).toContainText('cannot be undone');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await empty.click();
  await dialog.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(empty).toHaveCount(0);
  await expect(page.locator('.empty-state')).toBeVisible();
});

test('compact sorting remains keyboard accessible and actually reorders the list', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  for (const title of ['First task !1', 'Later task !4']) {
    await input.fill(title);
    await input.press('Enter');
  }
  const sort = page.getByRole('button', { name: 'Sort', exact: true });
  await sort.focus();
  await expect(sort).toBeFocused();
  await sort.press('ArrowDown');
  await page.getByRole('menuitemradio', { name: 'Priority · highest first', exact: true }).click();
  await expect(sort).toBeFocused();
  await expect(page.locator('.task-title')).toHaveText(['First task', 'Later task']);
  await sort.click();
  await page.getByRole('menuitemradio', { name: 'Manual', exact: true }).click();
  await expect(page.locator('.task-title')).toHaveText(['Later task', 'First task']);
});
