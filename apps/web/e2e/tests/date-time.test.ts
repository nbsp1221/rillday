import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

for (const { zone, date } of [
  { zone: 'Asia/Seoul', date: '2026-10-20' },
  { zone: 'America/New_York', date: '2026-10-19' },
]) {
  test.describe(`browser accounting date in ${zone}`, () => {
    test.use({ timezoneId: zone });

    test('capture uses the browser clock and zone', async ({ page }) => {
      await page.goto('/');
      const input = page.locator('#quick-add-input');

      await expect(input).toBeVisible();
      await page.clock.setFixedTime(new Date('2026-10-19T22:30:00Z'));
      await input.fill('Check time zone today');
      await input.press('Enter');

      await expect(page.locator('.row-date')).toHaveAttribute('datetime', date);
    });
  });
}

test.describe('all-day calendars in a zone with a skipped civil day', () => {
  test.use({ timezoneId: 'Pacific/Apia' });

  test('capture, calendar selection and reopen retain the skipped civil date', async ({ page }) => {
    await page.goto('/');

    // Playwright's fake Date drops subclass prototypes if installed before UTCDate loads.
    await page.locator('#quick-add-input').waitFor();
    await page.clock.setFixedTime(new Date('2011-12-29T12:00:00Z'));

    const input = page.locator('#quick-add-input');

    await input.fill('Delivery tomorrow');
    await page.locator('.quick-date-trigger').click();

    const calendar = page.locator('.date-picker-panel .date-calendar');
    const dates = await calendar
      .locator('[data-date]')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-date')));

    expect(dates).toHaveLength(42);
    expect(new Set(dates).size).toBe(42);
    await calendar.locator('[data-date="2011-12-30"]').click();
    await page.keyboard.press('Escape');
    await input.press('Enter');

    await expect(page.locator('.row-date')).toHaveAttribute('datetime', '2011-12-30');
    await reloadSavedPage(page);
    await expect(page.locator('.row-date')).toHaveAttribute('datetime', '2011-12-30');
    expect((await storedWorkspace(page)).tasks[0]).toMatchObject({
      title: 'Delivery',
      date: '2011-12-30',
      time: null,
    });
  });

  test('calendar navigation does not reinterpret ISO years below 100', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('#quick-add-input');

    await input.fill('Historical record 0099-01-15');
    await page.locator('.quick-date-trigger').click();

    const calendar = page.locator('.date-picker-panel .date-calendar');

    await expect(calendar.locator('.calendar-caption')).toHaveAttribute('data-month', '0099-01');
    await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(calendar.locator('.calendar-caption')).toHaveAttribute('data-month', '0099-02');
    await calendar.locator('[data-date="0099-02-15"]').click();
    await page.keyboard.press('Escape');
    await input.press('Enter');
    await reloadSavedPage(page);

    expect((await storedWorkspace(page)).tasks[0]?.date).toBe('0099-02-15');
  });
});

test.describe('recurring local time across daylight saving changes', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('completion keeps nine oclock after the DST transition and reload', async ({ page }) => {
    await page.goto('/');

    await page.locator('#quick-add-input').waitFor();
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));

    const input = page.locator('#quick-add-input');

    await input.fill('Daily check 2026-10-31 09:00 every day');
    await input.press('Enter');

    for (const date of ['2026-10-31', '2026-11-01']) {
      const row = page
        .locator('.task-row')
        .filter({ has: page.locator(`.row-date[datetime="${date}T09:00"]`) });

      await expect(row).toHaveCount(1);
      await row.locator('.task-check').click();
    }

    await reloadSavedPage(page);

    const task = (await storedWorkspace(page)).tasks.find((entry) => !entry.completedAt);

    expect(task).toMatchObject({ date: '2026-11-02', time: '09:00' });
  });
});
