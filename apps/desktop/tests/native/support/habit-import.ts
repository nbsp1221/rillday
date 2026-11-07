import { type Page, type TestInfo, expect } from '@playwright/test';

export async function verifyNativeHabitImport(page: Page, info: TestInfo) {
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
  await page.getByRole('button', { name: 'Import habits', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import habits', exact: true });
  await dialog.getByRole('combobox', { name: 'Import source' }).click();
  await page.getByRole('option', { name: 'Rillday CSV', exact: true }).click();
  await dialog.getByLabel('Habit export file').setInputFiles({
    name: 'native-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'habit_key,habit_name,kind,date,value,goal,unit,skipped,recorded_at,note\nreading,Imported native reading,quantity,2024-02-29,15,20,min,false,21:30,Synthetic history\n',
    ),
  });
  await expect(dialog.getByText('Imported native reading', { exact: true })).toBeVisible();
  await dialog
    .getByRole('checkbox', {
      name: 'I reviewed the target, goal type, historical schedule and limitations above.',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Review import' })).toContainText(
    'New habits: 1 · Add: 1',
  );
  await expect(dialog.getByText('21:30', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('habit-import-review.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Import 1 record', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Records saved on this device: 1');
  await dialog.locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
  await page.reload();
  await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await expect(page.getByText('Imported native reading', { exact: true })).toBeVisible();
}
