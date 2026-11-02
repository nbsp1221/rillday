import { type Page, expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences } from '../support/storage';

async function openSettings(page: Page) {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
}

test('stale settings tabs preserve disjoint language and theme writes after reload', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await openSettings(page);
  await openSettings(other);
  await chooseChoice(page, page.getByRole('combobox', { name: 'Language', exact: true }), 'ko');
  await expect.poll(() => storedPreferences(page)).toMatchObject({ language: 'ko' });
  await other.getByRole('button', { name: 'Appearance', exact: true }).click();
  await other.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect
    .poll(() => storedPreferences(other))
    .toMatchObject({ language: 'ko', theme: 'light' });
  await reloadSavedPage(page);
  await reloadSavedPage(other);
  for (const tab of [page, other]) {
    await expect(tab.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(tab.locator('html')).toHaveAttribute('data-theme', 'light');
  }
});

test('separate task view scopes survive stale tabs and a later update to an existing scope', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto('/?demo=1');
  await other.goto('/?demo=1');
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Priority · highest first', exact: true }).click();
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ taskViews: { 'list:inbox': { sort: 'priority' } } });
  await other.locator('.smart-lists > button').nth(1).click();
  await other.getByRole('button', { name: 'Group', exact: true }).click();
  await other.getByRole('menuitemradio', { name: 'Priority', exact: true }).click();
  await expect
    .poll(() => storedPreferences(other))
    .toMatchObject({
      taskViews: {
        'list:inbox': { sort: 'priority' },
        'today': { group: 'priority' },
      },
    });
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Title · ascending', exact: true }).click();
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({
      taskViews: {
        'list:inbox': { sort: 'title' },
        'today': { group: 'priority' },
      },
    });
  await reloadSavedPage(other);
  await other.locator('.smart-lists > button').nth(1).click();
  await expect(other.getByRole('button', { name: 'Group', exact: true })).toHaveAttribute(
    'title',
    'Group: Priority',
  );
});

test('retry saves only failed preference changes after another tab commits a different field', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await openSettings(page);
  await openSettings(other);
  await page.evaluate(() => {
    const descriptor: TypedPropertyDescriptor<IDBObjectStore['put']> | undefined =
      Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put');
    const original = descriptor?.value;
    if (!original) {
      throw new Error('IndexedDB put method is unavailable');
    }
    Reflect.set(window, 'failPreferenceWrite', true);
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.name === 'metadata' &&
        key === 'preferences' &&
        Reflect.get(window, 'failPreferenceWrite')
      ) {
        throw new DOMException('Synthetic preference failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await chooseChoice(page, page.getByRole('combobox', { name: 'Language', exact: true }), 'ko');
  await expect(page.locator('.settings-status[role="alert"]')).toBeVisible();
  await other.getByRole('button', { name: 'Appearance', exact: true }).click();
  await other.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect.poll(() => storedPreferences(other)).toMatchObject({ theme: 'light' });
  await page.evaluate(() => Reflect.set(window, 'failPreferenceWrite', false));
  await page.getByRole('button', { name: '설정 저장 실패 · 다시 시도', exact: true }).click();
  await expect(page.locator('.settings-status')).toHaveCount(0);
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ language: 'ko', theme: 'light' });
  await reloadSavedPage(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
