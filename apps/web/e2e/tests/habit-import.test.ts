import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

async function openImport(page: Page) {
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Data and backups', exact: true })
    .click();
  await page.getByRole('button', { name: 'Import habits', exact: true }).click();
  return page.getByRole('dialog', { name: 'Import habits', exact: true });
}

test('TickTick Excel import is additive, durable, private and idempotent through the actual worker', async ({
  page,
  context,
}, info) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      requests.push(request.url());
    }
  });
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Keep existing task');
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.getByText('Keep existing task', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  let dialog = await openImport(page);
  await dialog
    .getByLabel('Habit export file')
    .setInputFiles(resolve(import.meta.dirname, '../fixtures/habits.xlsx'));
  await expect(dialog.getByText('Imported reading', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Review import', exact: true })).toBeDisabled();
  await dialog
    .getByRole('checkbox', {
      name: 'I reviewed the target, goal type, historical schedule and limitations above.',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: '2. Review changes', exact: true }),
  ).toBeFocused();
  await expect.poll(() => dialog.locator('.modal-body').evaluate((body) => body.scrollTop)).toBe(0);
  await expect(dialog.getByRole('region', { name: 'Review import' })).toContainText(
    'New habits: 1 · Add: 2',
  );
  await expect(
    dialog.getByText('Original time only, recording date and timezone unknown').first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('import-review-dark.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Import 2 records', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Records saved on this device: 2');
  await dialog.locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
  await reloadSavedPage(page);
  const state = await storedWorkspace(page);
  expect(state.tasks.some((task) => task.title === 'Keep existing task')).toBe(true);
  expect(state.habits.filter((habit) => habit.name === 'Imported reading')).toHaveLength(1);
  expect(state.habitLogs).toHaveLength(2);
  expect(state.habitLogs.find((log) => log.date === '2024-02-29')).toMatchObject({
    value: 20,
    recordedAt: { kind: 'time', value: '21:30' },
  });
  dialog = await openImport(page);
  await dialog
    .getByLabel('Habit export file')
    .setInputFiles(resolve(import.meta.dirname, '../fixtures/habits.xlsx'));
  await dialog
    .getByRole('checkbox', {
      name: 'I reviewed the target, goal type, historical schedule and limitations above.',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Review import' })).toContainText(
    'New habits: 0 · Add: 0 · Duplicates: 2',
  );
  await page.keyboard.press('Escape');
  expect(requests).toEqual([]);
});

test('CSV preview works on a light mobile screen and Escape cancels without writes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const dialog = await openImport(page);
  await dialog.getByRole('combobox', { name: 'Import source' }).click();
  await page.getByRole('option', { name: 'Rillday CSV', exact: true }).click();
  await dialog.getByLabel('Habit export file').setInputFiles({
    name: 'history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'habit_key,habit_name,kind,date,value,goal,unit,skipped,recorded_at,note\nr,Read,quantity,2024-02-29,0,20,min,true,,Rest\n',
    ),
  });
  await expect(dialog.getByText('Read', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('import-mobile-light.png'), fullPage: true });
  const bounds = await dialog.boundingBox();
  assert(bounds !== null);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('combobox', { name: 'Import source' }).click();
  await page.getByRole('option', { name: 'TickTick Excel', exact: true }).click();
  await expect(dialog.getByLabel('Habit export file')).toHaveValue('');
  await dialog.getByRole('combobox', { name: 'Import source' }).click();
  await page.getByRole('option', { name: 'Rillday CSV', exact: true }).click();
  const longName = 'R'.repeat(120);
  await dialog.getByLabel('Habit export file').setInputFiles({
    name: 'long-name.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'habit_key,habit_name,kind,date,value,goal,unit\nr,' +
        longName +
        ',quantity,2024-02-29,15,20,min\n',
    ),
  });
  await expect(dialog.getByText(longName, { exact: true })).toBeVisible();
  await dialog
    .getByRole('checkbox', {
      name: 'I reviewed the target, goal type, historical schedule and limitations above.',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  expect(
    await dialog.locator('.modal-body').evaluate((body) => body.scrollWidth - body.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect((await storedWorkspace(page)).habitLogs).toEqual([]);
});

test('an accepted import retries a real storage failure without creating duplicate history', async ({
  page,
}) => {
  await page.goto('/');
  const dialog = await openImport(page);
  await dialog
    .getByLabel('Habit export file')
    .setInputFiles(resolve(import.meta.dirname, '../fixtures/habits.xlsx'));
  await dialog
    .getByRole('checkbox', {
      name: 'I reviewed the target, goal type, historical schedule and limitations above.',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put') as
      | TypedPropertyDescriptor<IDBObjectStore['put']>
      | undefined;
    const original = descriptor?.value;
    if (!original) {
      throw new Error('IndexedDB put method is unavailable');
    }
    const flags = Object.assign(window, { failImportSave: true });
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'documents' && flags.failImportSave) {
        throw new DOMException('Synthetic import storage failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await dialog.getByRole('button', { name: 'Import 2 records', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('accepted changes are still pending');
  await page.evaluate(() => Object.assign(window, { failImportSave: false }));
  await dialog.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Records saved on this device: 2');
  await page.keyboard.press('Escape');
  await reloadSavedPage(page);
  const state = await storedWorkspace(page);
  expect(state.habits).toHaveLength(1);
  expect(state.habitLogs).toHaveLength(2);
});

test('Korean review keeps translated controls, visible focus and keyboard navigation', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '한국어', exact: true }).click();
  await page.getByRole('button', { name: '데이터와 백업', exact: true }).click();
  await page.getByRole('button', { name: '습관 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '습관 가져오기', exact: true });
  await dialog
    .getByLabel('습관 내보내기 파일')
    .setInputFiles(resolve(import.meta.dirname, '../fixtures/habits.xlsx'));
  const confirmation = dialog.getByRole('checkbox', {
    name: '추가할 습관, 목표 유형, 과거 반복 기준과 위 제한 사항을 확인했습니다.',
    exact: true,
  });
  await confirmation.focus();
  await page.keyboard.press('Space');
  await expect(confirmation).toBeChecked();
  await dialog.getByRole('button', { name: '가져오기 검토', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: '2. 변경 사항 확인', exact: true }),
  ).toBeFocused();
  await expect(dialog.getByRole('button', { name: '2개 기록 추가', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('import-review-ko.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '습관 가져오기', exact: true })).toBeFocused();
  expect((await storedWorkspace(page)).habitLogs).toEqual([]);
});
