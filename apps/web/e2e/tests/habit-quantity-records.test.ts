import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

for (const width of [1183, 320]) {
  test(`dated quantity recording retains above-goal totals and offline edits at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date('2026-10-29T03:00:00Z') });
    await page.goto('/?demo=1');
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    const row = page.locator('.habit-row').filter({ hasText: 'Drink enough water' });
    await expect(row.locator('.habit-menu-anchor button')).toHaveCount(1);
    const today = row.locator('.habit-day.today');
    await expect(today).toHaveText('5');
    await today.focus();
    await today.press('Enter');
    const panel = page.locator('.habit-record-panel');
    await expect(panel.locator('.habit-checkin-date')).toContainText('Today');
    const total = panel.getByRole('textbox', { name: 'Daily total (cups)', exact: true });
    await context.setOffline(true);
    await total.fill('7');
    const add = panel.getByRole('button', { name: 'Add 1 cups', exact: true });
    // Clicking the shortcut must commit the typed total before adding to it.
    await add.click();
    await expect(total).toHaveValue('8');
    await expect(today).toHaveText('8');
    await expect(today).toHaveAttribute('data-state', 'complete');
    await add.press('Space');
    await expect(total).toHaveValue('9');
    await expect(today).toHaveText('9');
    await panel.getByRole('button', { name: 'Subtract 1 cups', exact: true }).click();
    await expect(total).toHaveValue('8');
    await panel.getByLabel('Check-in note', { exact: true }).fill('Recorded offline');
    await page.keyboard.press('Escape');
    await expect(today).toBeFocused();
    const past = row.locator('.habit-day').nth(1);
    await past.click();
    const previous = Number(await total.inputValue());
    await add.click();
    await expect(total).toHaveValue(String(previous + 1));
    await expect(today).toHaveText('8');
    await page.keyboard.press('Escape');
    await expect(past).toBeFocused();
    for (const future of await row.locator('.habit-day[data-state="future"]').all()) {
      await expect(future).toBeDisabled();
    }
    await expect
      .poll(async () => {
        const data = await storedWorkspace(page);
        const habit = data.habits.find((habit) => habit.name === 'Drink enough water')!;
        const log = data.habitLogs.find(
          (log) => log.habitId === habit.id && log.date === '2026-10-29',
        );
        return { value: log?.value, note: log?.note };
      })
      .toEqual({ value: 8, note: 'Recorded offline' });
    await context.setOffline(false);
    await reloadSavedPage(page);
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await expect(today).toHaveText('8');
    await today.click();
    await panel.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(total).toHaveValue('0');
    await expect(today).toHaveAttribute('data-state', 'skipped');
    await add.click();
    await expect(today).toHaveText('1');
    await panel.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(today).toHaveText('0');
    await expect(panel.getByLabel('Check-in note', { exact: true })).toHaveValue('');
    const maximum = await panel.locator('input[type="number"]').getAttribute('max');
    expect(maximum).not.toBeNull();
    await total.fill(maximum!);
    await total.press('Tab');
    await expect(add).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });
}
