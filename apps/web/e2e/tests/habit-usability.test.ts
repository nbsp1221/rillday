import { expect, test } from '@playwright/test';
import { browserToday } from '../support/clock';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('quantity drafts can be cleared, validated and committed; Escape saves notes and restores the opener', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  const opener = page.locator('.habit-name').filter({ hasText: 'Drink enough water' });
  await opener.click();
  const amount = page.getByLabel('Check-in amount', { exact: true });
  await amount.fill('');
  await expect(amount).toHaveValue('');
  await page.getByLabel('Check-in note', { exact: true }).click();
  await expect(amount).toHaveValue('');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await amount.fill('-3');
  await amount.press('Enter');
  await expect(amount).toHaveValue('-3');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await amount.fill('3.5');
  await amount.press('Tab');
  await expect(amount).toHaveValue('3.5');
  const note = page.getByLabel('Check-in note', { exact: true });
  await note.fill('Note after updating quantity');
  await note.press('Escape');
  await expect(page.locator('.habit-detail')).toHaveCount(0);
  await expect(opener).toBeFocused();
  const today = (await browserToday(page)).toString();
  await expect
    .poll(async () => {
      const workspace = await storedWorkspace(page);
      const habit = workspace.habits.find((habit) => habit.name === 'Drink enough water')!;
      const log = workspace.habitLogs.find((log) => log.habitId === habit.id && log.date === today);
      return { value: log?.value, note: log?.note };
    })
    .toEqual({ value: 3.5, note: 'Note after updating quantity' });
  await reloadSavedPage(page);
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await opener.click();
  await expect(amount).toHaveValue('3.5');
  await expect(note).toHaveValue('Note after updating quantity');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(amount).toHaveValue('0');
  await expect(note).toHaveValue('');
});

test('narrow habit details contain focus and the shared date calendar dismisses one layer at a time', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await page.locator('.habit-name').first().click();
  const detail = page.locator('.habit-detail');
  await expect(detail).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByLabel('Edit habit', { exact: true })).toBeFocused();
  await detail.getByRole('button', { name: 'Delete habit', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Edit habit', { exact: true })).toBeFocused();
  await page.locator('.habit-date-button').click();
  const calendar = page.locator('.habit-date-panel');
  await expect(calendar).toBeVisible();
  const boundaries = await calendar.locator('[data-date]').evaluateAll((buttons) =>
    buttons.map((button) => ({
      date: button.getAttribute('data-date')!,
      disabled: (button as HTMLButtonElement).disabled,
    })),
  );
  const today = (await browserToday(page)).toString();
  expect(boundaries.some((item) => item.date > today)).toBe(true);
  expect(boundaries.filter((item) => item.date > today).every((item) => item.disabled)).toBe(true);
  await calendar.getByLabel('Choose month and year', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(calendar).toBeVisible();
  await expect(page.locator('.calendar-period-chooser')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(page.locator('.habit-date-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
});

test('habit day axes and menu targets fit both the full page and the space remaining beside details', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  for (const width of [1440, 1200, 1024, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const opened of [false, true]) {
      if (opened) {
        await page.locator('.habit-name').first().click();
      }
      if (!opened || width >= 900) {
        const bounds = await page
          .locator('.habit-row')
          .first()
          .evaluate((row) => {
            const box = row.getBoundingClientRect();
            const menu = row.querySelector('.row-menu-trigger')!.getBoundingClientRect();
            const days = [...row.querySelectorAll('.habit-day-wrap')].map((el) => {
              const r = el.getBoundingClientRect();
              return r.x + r.width / 2;
            });
            const heads = [...document.querySelectorAll('.habit-table-head>div')].map((el) => {
              const r = el.getBoundingClientRect();
              return r.x + r.width / 2;
            });
            const cells = [...row.querySelectorAll('.habit-day')].map((el) => {
              const r = el.getBoundingClientRect();
              const wrap = el.parentElement!.getBoundingClientRect();
              return {
                width: r.width,
                fits: r.left >= wrap.left - 0.1 && r.right <= wrap.right + 0.1,
              };
            });
            return {
              cells,
              dayCount: days.length,
              headCount: heads.length,
              right: box.right - menu.right,
              size: [menu.width, menu.height],
              axes: days.map((x, i) => Math.abs(x - heads[i])),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
        expect(bounds.cells).toHaveLength(7);
        expect(bounds.dayCount).toBe(7);
        expect(bounds.headCount).toBe(7);
        expect(bounds.axes).toHaveLength(7);
        expect(bounds.cells.every((cell) => cell.width >= 24 && cell.fits)).toBe(true);
        expect(bounds.size).toEqual([32, 32]);
        expect(bounds.right).toBeGreaterThanOrEqual(12);
        expect(bounds.axes.every((value) => value < 1)).toBe(true);
        expect(bounds.overflow).toBe(false);
      }
      if (opened) {
        await page.getByLabel('Close details', { exact: true }).click();
      }
    }
  }
});

test('archiving closes details, keeps records read-only and supports undo', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  const habit = page.locator('.habit-name').filter({ hasText: 'Drink enough water' });
  await habit.click();
  await page.getByRole('button', { name: 'Archive habit', exact: true }).click();
  await expect(page.locator('.habit-detail')).toHaveCount(0);
  await expect(habit).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(habit).toBeVisible();
  await habit.click();
  await expect(page.getByLabel('Check-in amount', { exact: true })).toHaveValue('5');
  await page.getByRole('button', { name: 'Archive habit', exact: true }).click();
  await page.getByLabel('Archived habits', { exact: true }).click();
  await habit.click();
  await expect(page.getByLabel('Check-in amount', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Check-in note', { exact: true })).toBeDisabled();
  await expect(page.locator('.habit-finish')).toBeDisabled();
  await page.getByRole('button', { name: 'Restore habit', exact: true }).click();
  await page.getByLabel('Archived habits', { exact: true }).click();
  await habit.click();
  await expect(page.getByLabel('Check-in amount', { exact: true })).toHaveValue('5');
});

test('habit cards update quantity progress and retain it after reload', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  const progress = page.locator('.habits-summary').getByRole('meter');
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(progress).toHaveAttribute('aria-valuemax', '3');
  const water = page.locator('.habit-row').filter({ hasText: 'Drink enough water' });
  const today = (await browserToday(page)).toString();
  for (let count = 0; count < 3; count++) {
    await water.locator('.habit-quick-add').click();
  }
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(page.locator('.habit-detail')).toHaveCount(0);
  await expect
    .poll(async () => {
      const workspace = await storedWorkspace(page);
      const habit = workspace.habits.find((habit) => habit.name === 'Drink enough water')!;
      return workspace.habitLogs.find((log) => log.habitId === habit.id && log.date === today)
        ?.value;
    })
    .toBe(8);
  await reloadSavedPage(page);
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
});
