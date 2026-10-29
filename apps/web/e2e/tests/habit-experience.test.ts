import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('weekly quantity targets, optional grouping and quick records share the real offline workspace', async ({
  page,
  context,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit tracker', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Make time to read', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Weekly study');
  await page.getByRole('combobox', { name: 'Time of day', exact: true }).click();
  await page.getByRole('option', { name: 'Morning', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.locator('.habit-row').filter({ hasText: 'Weekly study' });
  await expect(row).toBeVisible();
  await context.setOffline(true);
  await row.locator('.habit-quick-add').click();
  await row.locator('.habit-quick-add').click();
  await expect(page.locator('.habit-detail')).toHaveCount(0);
  await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  await row.locator('.habit-day.today').click();
  await expect(page.locator('.habit-record-panel .habit-finish')).toHaveCount(0);
  const amount = page.getByLabel('Check-in amount', { exact: true });
  await amount.fill('22.5');
  await page.getByLabel('Check-in note', { exact: true }).fill('Offline practice');
  await page.keyboard.press('Escape');
  await expect(row.locator('.habit-day.today')).toBeFocused();
  await expect
    .poll(async () => {
      const data = await storedWorkspace(page);
      const habit = data.habits.find((habit) => habit.name === 'Weekly study')!;
      const log = data.habitLogs.find((log) => log.habitId === habit.id);
      return {
        frequency: habit.frequency,
        timeOfDay: habit.timeOfDay,
        value: log?.value,
        note: log?.note,
      };
    })
    .toEqual({
      frequency: 'weekly-total',
      timeOfDay: 'morning',
      value: 22.5,
      note: 'Offline practice',
    });
  await context.setOffline(false);
  await reloadSavedPage(page);
  await page.getByLabel('Habit tracker', { exact: true }).click();
  await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '22.5');
  await expect(page.locator('.habit-time-group').first()).toHaveText('Morning');
  await row.locator('.habit-name').click();
  await expect(page.locator('.habit-history-grid .habit-record-mark')).toHaveCount(1);
  await expect(page.locator('.habit-history-grid button.done')).toHaveCount(0);
});

test('reopening a weekly habit edits its planned target without changing the active week', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-29T03:00:00Z') });
  await page.goto('/?demo=1');
  await page.getByLabel('Habit tracker', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Make time to read', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.locator('.habit-name').filter({ hasText: 'Make time to read' });
  await row.click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Weekly target', exact: true }).fill('90');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      const habit = (await storedWorkspace(page)).habits.find(
        (habit) => habit.name === 'Make time to read',
      )!;
      return { active: habit.goal, planned: habit.rules?.at(-1)?.goal };
    })
    .toEqual({ active: 60, planned: 90 });
  await page.getByLabel('Edit habit', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Weekly target', exact: true })).toHaveValue('90');
  await expect(page.locator('.habit-editor')).toContainText(
    'The planned target and schedule start on',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});
