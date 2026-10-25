import { expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import invariant from 'tiny-invariant';
import { chooseChoice } from '../support/choice';
import { seedWorkspace } from '../support/storage';

test('English search localizes the built-in Inbox while retaining user-authored titles', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'en');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Search all', exact: true }).click();
  await page
    .getByLabel('Search all tasks', { exact: true })
    .fill('Choose three priorities for the coming week');
  const result = page.locator('.search-results button');
  await expect(result.locator('span')).toHaveText('Choose three priorities for the coming week');
  await expect(result.locator('small')).toHaveText('Inbox');
});

test('search field keeps icon and text insets inside the shared input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search all', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Search all tasks', exact: true });
  await expect(field).toBeFocused();
  const insets = await field.evaluate((input) => {
    const style = getComputedStyle(input);
    const bounds = input.getBoundingClientRect();
    const iconElement = document.querySelector('.global-search svg');
    if (iconElement === null) {
      throw new Error("Expected element matching '.global-search svg'");
    }
    const icon = iconElement.getBoundingClientRect();
    return {
      textGap: parseFloat(style.paddingLeft) - (icon.right - bounds.left),
      right: parseFloat(style.paddingRight),
      iconLeft: icon.left - bounds.left,
    };
  });
  expect(insets.textGap).toBeGreaterThanOrEqual(10);
  expect(insets.right).toBeGreaterThanOrEqual(12);
  expect(insets.iconLeft).toBeGreaterThanOrEqual(10);
  await field.fill('Keep search input');
  await expect(field).toHaveValue('Keep search input');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const language of ['ko', 'en']) {
  test(`search handles pasted whitespace and explains empty results in ${language}`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#quick-add-input').fill('Find this note');
    await page.locator('#quick-add-input').press('Enter');
    await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
    await chooseChoice(
      page,
      page.getByRole('combobox', { name: 'Language', exact: true }),
      language,
    );
    await page
      .getByRole('button', { name: language === 'ko' ? '돌아가기' : 'Back', exact: true })
      .click();
    await page.keyboard.press('Control+k');
    const input = page.locator('.global-search input');
    await input.fill('   Find this note   ');
    await expect(page.locator('.search-results button')).toHaveCount(1);
    await input.fill('No matching entry 983475');
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(
      language === 'ko' ? '검색 결과가 없어요' : 'No results found',
    );
    await input.fill('   ');
    await expect(page.locator('.search-results')).toHaveText(
      language === 'ko' ? '모든 목록에서 찾아요.' : 'Search across all lists.',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.task-title')).toHaveText('Find this note');
  });
}

test('global search exposes every match and resets pagination for another query', async ({
  page,
}) => {
  const data = emptyWorkspace();
  data.tasks = Array.from({ length: 101 }, (_, order) => {
    const task = createTaskRecord(`Search review ${order}`, data, { order });
    expect(task).not.toBeNull();
    invariant(task !== null, 'Task fixture must have a title');
    return task;
  });
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByRole('button', { name: 'Search all', exact: true }).click();
  const input = page.getByLabel('Search all tasks');
  const results = page.locator('.search-results').getByRole('button', { name: /^Search review/ });
  await input.fill('Search review');
  await expect(results).toHaveCount(100);
  await page.getByRole('button', { name: 'Show more (100/101)', exact: true }).click();
  await expect(results).toHaveCount(101);
  await input.fill('review');
  await expect(results).toHaveCount(100);
  await page.getByRole('button', { name: 'Show more (100/101)', exact: true }).click();
  await page.getByRole('button', { name: 'Search review 100 Inbox', exact: true }).click();
  await expect(page.locator('.td-title')).toHaveValue('Search review 100');
});
