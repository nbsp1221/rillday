import { type Page, expect, test } from '@playwright/test';
import { selectCalendarDate } from '../support/date-picker';
import { storedWorkspace } from '../support/storage';

const input = (page: Page) => page.getByRole('textbox', { name: 'Quick add task', exact: true });

const date = (page: Page) =>
  page.getByRole('button', { name: 'Due date for new task', exact: true });

const priority = (page: Page) =>
  page.getByRole('button', { name: 'Priority for new task', exact: true });

test('date and priority popovers never expand capture or submit its draft', async ({ page }) => {
  await page.goto('/');
  const before = (await page.locator('.quick-add').boundingBox())!;
  await input(page).fill('Explicit choice tomorrow !3');
  await date(page).click();
  await selectCalendarDate(page, '2030-01-03');
  await page
    .locator('.capture-date-panel')
    .getByRole('button', { name: 'Complete', exact: true })
    .click();
  await expect(date(page)).toBeFocused();
  await expect(page.locator('.capture-date-panel')).toHaveCount(0);
  await priority(page).click();
  await page.getByRole('menuitemradio', { name: 'High priority', exact: true }).click();
  await expect(priority(page)).toBeFocused();
  await expect(priority(page)).toHaveAttribute('title', 'High priority');
  expect((await page.locator('.quick-add').boundingBox())!.height).toBe(before.height);
  await expect(page.locator('.task-title')).toHaveCount(0);
  await expect(date(page)).toHaveAttribute('title', /2030-01-03/);
  await input(page).press('Enter');
  const row = page.locator('.task-row');
  await expect(row.locator('.task-title')).toHaveText('Explicit choice');
  await expect(row.locator('.task-check')).toHaveClass(/p3/);
  await row.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-calendar [data-selected="true"] button')).toHaveAttribute(
    'data-date',
    '2030-01-03',
  );
  await page.keyboard.press('Escape');
  await expect(date(page)).toHaveAttribute('aria-description', 'No date');
  await expect(priority(page)).toHaveAttribute('title', 'No priority');
});

test('capture menus support keyboard, one Escape layer and switching without losing title focus', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await input(page).fill('Keyboard draft');
  await priority(page).focus();
  await priority(page).press('ArrowDown');
  await expect(
    page.getByRole('menuitemradio', { name: 'High priority', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: 'No priority', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(priority(page)).toHaveAttribute('title', 'No priority');
  await date(page).click();
  await page.locator('.quick-priority .row-menu-trigger').click();
  await expect(page.locator('.capture-date-panel')).toHaveCount(0);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(priority(page)).toBeFocused();
  await date(page).click();
  await page.getByRole('button', { name: 'Today', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.capture-date-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(date(page)).toBeFocused();
  await date(page).click();
  await page.keyboard.press('Escape');
  await expect(date(page)).toBeFocused();
  await expect(input(page)).toHaveValue('Keyboard draft');
});

test('clearing a recognized date removes time and repeat while a new date expression restores recognition', async ({
  page,
}) => {
  await page.goto('/');
  await input(page).fill('Undated repeat tomorrow 3pm every day');
  await expect(date(page)).not.toHaveAttribute('aria-description', 'No date');
  await date(page).click();
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await expect(date(page)).toHaveAttribute('aria-description', 'No date');
  await input(page).press('Enter');
  await page.locator('.task-title').click();
  await expect(page.locator('.td-date-button')).not.toHaveClass(/has-date/);
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'none');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await input(page).fill('Refresh recognition tomorrow');
  await date(page).click();
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await input(page).fill('Refresh recognition day after tomorrow');
  await expect(date(page)).not.toHaveAttribute('aria-description', 'No date');
});

test('narrow capture keeps draft metadata through navigation, and date IME does not close or submit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  await input(page).fill('Keep this draft');
  await date(page).click();
  const panel = page.locator('.capture-date-panel');
  await selectCalendarDate(page, '2030-02-03');
  await panel
    .locator('[data-selected="true"] button')
    .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(panel).toBeVisible();
  await expect(page.locator('.task-title')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await priority(page).click();
  await page.getByRole('menuitemradio', { name: 'Medium priority', exact: true }).click();
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(input(page)).toHaveValue('Keep this draft');
  await expect(date(page)).toHaveAttribute('title', /2030-02-03/);
  await expect(priority(page)).toHaveAttribute('title', 'Medium priority');
  const geometry = await input(page).evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth > innerWidth,
    height: document.documentElement.scrollHeight > innerHeight,
  }));
  expect(geometry.width).toBeGreaterThan(80);
  expect(geometry.overflow).toBe(false);
  expect(geometry.height).toBe(false);
});

test('capture drafts belong to their view and survive area/settings switches', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input(page).fill('Inbox draft #planning');
  await page
    .locator('.task-sidebar')
    .getByRole('button', { name: /^All tasks/ })
    .click();
  await expect(input(page)).toHaveValue('');
  await input(page).fill('All tasks draft');
  await page
    .locator('.task-sidebar')
    .getByRole('button', { name: /^Inbox/ })
    .click();
  await expect(input(page)).toHaveValue('Inbox draft #planning');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(input(page)).toHaveValue('Inbox draft #planning');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(input(page)).toHaveValue('Inbox draft #planning');
  await input(page).press('Enter');
  await expect(page.locator('.task-title')).toHaveText('Inbox draft');
  await page
    .locator('.task-sidebar')
    .getByRole('button', { name: /^All tasks/ })
    .click();
  await expect(input(page)).toHaveValue('All tasks draft');
});

test('manual metadata wins visibly and resets after capture', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input(page).fill('First item');
  await page.getByRole('button', { name: 'Priority for new task', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Low priority', exact: true }).click();
  await input(page).press('Enter');
  await input(page).fill('Next item !1');
  await input(page).press('Enter');
  await expect(input(page)).toHaveValue('');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[1]?.priority).toBe(3);
  await input(page).fill('Explicit date tomorrow');
  await page.getByRole('button', { name: 'Due date for new task', exact: true }).click();
  await selectCalendarDate(page, '2030-01-03');
  await page.keyboard.press('Escape');
  await expect(page.locator('.quick-date-trigger')).toHaveAttribute('title', /2030/);
  await input(page).press('Enter');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[2]?.date).toBe('2030-01-03');
  await input(page).fill('New default');
  await expect(page.locator('.quick-date-trigger')).toHaveAttribute('title', 'Date: No date');
  await expect(
    page.getByRole('button', { name: 'Priority for new task', exact: true }),
  ).toHaveAttribute('title', 'No priority');
});

test('tag completion follows the caret and never silently replaces a new prefix tag on Enter', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input(page).fill('Existing #businessplan');
  await input(page).press('Enter');
  await expect(input(page)).toHaveValue('');
  await input(page).fill('New tag #business');
  await input(page).press('Enter');
  await expect(input(page)).toHaveValue('');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[1]?.tags).toEqual(['business']);
  await page
    .locator('.task-title')
    .filter({ hasText: /^Existing$/ })
    .click();
  await input(page).fill('Sentence #b following text');
  await input(page).press('Control+Home');
  for (let offset = 0; offset < 'Sentence #b'.length; offset++) {
    await input(page).press('ArrowRight');
  }
  await expect(page.getByRole('listbox', { name: 'Label suggestions' })).toBeVisible();
  await input(page).press('Escape');
  await expect(input(page)).toBeFocused();
  await expect(page.locator('.task-detail')).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await input(page).press('ArrowLeft');
  await input(page).press('ArrowRight');
  await input(page).fill('Sentence #b following text');
  await input(page).press('Control+Home');
  for (let offset = 0; offset < 'Sentence #b'.length; offset++) {
    await input(page).press('ArrowRight');
  }
  // Typing a new fragment reopens suggestions after explicit dismissal.
  await input(page).press('Backspace');
  await page.keyboard.insertText('b');
  await page.getByRole('option', { name: 'businessplan', exact: true }).click();
  await expect(input(page)).toHaveValue('Sentence #businessplan following text');
  await input(page).press('Enter');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[2]?.title)
    .toBe('Sentence following text');
});

test('multiline capture remains readable and is one undo action; invalid input cannot undo unrelated work', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await input(page).fill('First line\nSecond line\nThird line');
  const geometry = await input(page).evaluate((el) => ({
    height: el.clientHeight,
    scroll: el.scrollHeight,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.line * 3);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.height + 1);
  await input(page).press('Enter');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(3);
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(0);
  await input(page).fill('Keep this task');
  await input(page).press('Enter');
  await expect(input(page)).toHaveValue('');
  await input(page).fill('#tag tomorrow');
  await input(page).press('Enter');
  await expect(page.locator('.toast')).toContainText('Add a task title');
  await expect(
    page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }),
  ).toHaveCount(0);
  expect((await storedWorkspace(page)).tasks).toHaveLength(1);
});
