import assert from 'node:assert/strict';
import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { selectCalendarDate, setPickerRepeat, setPickerTime } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

const panel = (page: Page) => page.locator('.date-picker-panel');

async function customRepeat(page: Page) {
  await page.locator('.date-repeat-trigger').click();
  const trigger = page.getByLabel('Custom repeat', { exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
}

test('new typed dates keep custom repeat end dates valid and creation resets schedule overrides', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Range check 2030-01-31');
  await page.locator('.quick-date-trigger').click();
  await customRepeat(page);
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await selectCalendarDate(
    page,
    '2030-03-31',
    page.locator('.schedule-picker .date-calendar'),
    true,
  );
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Escape');
  await input.fill('Range check 2031-01-31');
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-until', '2031-01-31');
  await page.keyboard.press('Escape');
  await input.press('Enter');
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-until', '2031-01-31');
  await page.keyboard.press('Escape');
  await page.getByLabel('Close task details', { exact: true }).click();
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'none');
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '30');
});

test('a picked monthly rule retains month-end dates and stops after its inclusive end date', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Month-end recurrence 2030-01-31');
  await page.locator('.quick-date-trigger').click();
  await customRepeat(page);
  await page.getByRole('radio', { name: 'Monthly', exact: true }).check();
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await selectCalendarDate(
    page,
    '2030-03-31',
    page.locator('.schedule-picker .date-calendar'),
    true,
  );
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Escape');
  await input.press('Enter');
  for (const date of ['2030-01-31', '2030-02-28', '2030-03-31']) {
    const row = page
      .locator('.task-row')
      .filter({ has: page.locator(`.row-date[datetime="${date}"]`) });
    await expect(row).toHaveCount(1);
    await row.locator('.task-check').click();
  }
  await expect(page.locator('.task-row')).toHaveCount(0);

  await expect
    .poll(async () =>
      (await storedWorkspace(page)).tasks
        .map((task) => ({ date: task.date, completed: task.completedAt !== null }))
        .sort((first, second) => {
          assert(
            first.date !== null && second.date !== null,
            'Scheduled task fixture requires dates',
          );
          return first.date.localeCompare(second.date);
        }),
    )
    .toEqual([
      { date: '2030-01-31', completed: true },
      { date: '2030-02-28', completed: true },
      { date: '2030-03-31', completed: true },
    ]);
  await reloadSavedPage(page);
  await expect(page.locator('.task-row')).toHaveCount(0);
});

test('capture duration and custom repeat survive navigation, submission and reload; date clear preserves duration', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Quarterly report');
  await page.locator('.quick-date-trigger').click();
  await selectCalendarDate(page, '2030-01-31');
  await setPickerTime(page, '09:17');
  await page.locator('.date-duration-trigger').click();
  await page.getByLabel('Duration (minutes)', { exact: true }).fill('77');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.date-duration-trigger')).toBeFocused();
  await customRepeat(page);
  await page.getByRole('radio', { name: 'Monthly', exact: true }).check();
  await page.getByLabel('Repeat interval', { exact: true }).fill('2');
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await selectCalendarDate(
    page,
    '2030-07-31',
    page.locator('.schedule-picker .date-calendar'),
    true,
  );
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(input).toHaveValue('Quarterly report');
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '77');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-until', '2030-07-31');
  await page.keyboard.press('Escape');
  await input.press('Enter');
  await expect
    .poll(async () => {
      const task = (await storedWorkspace(page)).tasks.find(
        (entry) => entry.title === 'Quarterly report',
      );
      return task && { duration: task.duration, time: task.time, repeat: task.repeat };
    })
    .toEqual({
      duration: 77,
      time: '09:17',
      repeat: { frequency: 'monthly', interval: 2, until: '2030-07-31', anchorDay: 31 },
    });
  await reloadSavedPage(page);
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '77');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-interval', '2');
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:17');
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '77');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'none');
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '');
});

test('duration validates boundaries without overwriting stored data, respects IME and cancels partial edits', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.quick-date-trigger').click();
  await page.locator('.date-duration-trigger').click();
  const input = page.getByLabel('Duration (minutes)', { exact: true });
  for (const value of ['', '4', '1441', '5.5']) {
    await input.fill(value);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  }
  await input.fill('77');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '30');
  for (const value of ['5', '1440', '77']) {
    await page.locator('.date-duration-trigger').click();
    await input.fill(value);
    await input.press('Enter');
    await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', value);
  }
  await page.locator('.date-duration-trigger').click();
  await input.fill('60');
  await page.locator('.workspace-header').click();
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '77');
  await page.locator('.date-duration-trigger').click();
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '30');
  await expect(page.locator('.quick-date-trigger')).toHaveAttribute('aria-description', 'No date');
});

test('repeat presets assign a date, manual none overrides parsed repeat, and new repeat text restores recognition', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Repeat test every day');
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'daily');
  await setPickerRepeat(page, 'none');
  await page.keyboard.press('Escape');
  await input.fill('Repeat test every week');
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'weekly');
  await setPickerRepeat(page, 'none');
  await page.keyboard.press('Escape');
  await input.press('Enter');
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'none');
  await page.keyboard.press('Escape');
  await page.getByLabel('Close task details', { exact: true }).click();
  await input.fill('Repeat without date');
  await page.locator('.quick-date-trigger').click();
  await setPickerRepeat(page, 'weekdays');
  await expect(panel(page).locator('[data-selected="true"] button')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await input.press('Enter');
  await page.locator('.task-title').filter({ hasText: 'Repeat without date' }).click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'weekdays');
});

test('custom repeat cancels atomically, validates intervals, supports keyboard radios and ordered end dates', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.quick-date-trigger').click();
  await selectCalendarDate(page, '2032-02-29');
  await customRepeat(page);
  const interval = page.getByLabel('Repeat interval', { exact: true });
  await page.getByRole('radio', { name: 'Every day', exact: true }).focus();
  await page.keyboard.press('ArrowRight', { delay: 50 });
  await expect(page.getByRole('radio', { name: 'Weekly', exact: true })).toBeChecked();
  for (const value of ['', '0', '366', '2.5']) {
    await interval.fill(value);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(interval).toHaveAttribute('aria-invalid', 'true');
  }
  await interval.fill('2');
  await page.getByLabel('Increase interval', { exact: true }).click();
  await expect(interval).toHaveValue('3');
  await page.getByLabel('Decrease interval', { exact: true }).click();
  await expect(interval).toHaveValue('2');
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await expect(page.locator('.schedule-picker button[data-date="2032-02-28"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-repeat-trigger')).toBeFocused();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'none');
  await customRepeat(page);
  await interval.fill('365');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-interval', '365');
  await customRepeat(page);
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await selectCalendarDate(
    page,
    '2032-03-10',
    page.locator('.schedule-picker .date-calendar'),
    true,
  );
  await page.getByLabel('Repeat end date', { exact: true }).click();
  await page.getByRole('button', { name: 'No end date', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.date-repeat-trigger')).not.toHaveAttribute('data-until');
});

for (const touch of [false, true]) {
  test.describe(() => {
    test.use({ hasTouch: touch, viewport: { width: 320, height: 480 } });

    test(`all schedule views fit a short viewport and return focus without clipping (${touch ? 'touch' : 'pointer'})`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.locator('.quick-date-trigger').click();
      for (const kind of ['duration', 'repeat']) {
        const trigger = page.locator(`.date-${kind}-trigger`);
        await trigger.click();
        if (kind === 'repeat') {
          await page.getByLabel('Custom repeat', { exact: true }).click();
          await page.getByLabel('Repeat end date', { exact: true }).click();
        }
        const footer = await visibleBox(panel(page).locator('.date-picker-footer'));
        await panel(page)
          .locator('.date-picker-body')
          .evaluate((el) => (el.scrollTop = el.scrollHeight));
        expect(await visibleBox(panel(page).locator('.date-picker-footer'))).toEqual(footer);
        const bounds = await visibleBox(panel(page));

        expect(bounds.x).toBeGreaterThanOrEqual(8);
        expect(bounds.y).toBeGreaterThanOrEqual(8);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        const body = await visibleBox(panel(page).locator('.date-picker-body'));

        const box = await visibleBox(trigger);

        expect(box.y).toBeGreaterThanOrEqual(body.y);
        expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height + 1);
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight > innerHeight ||
            document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    });
  });
}
