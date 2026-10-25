import { expect, test } from '@playwright/test';
import invariant from 'tiny-invariant';
import { appearance } from '../support/appearance';
import { chooseChoice } from '../support/choice';
import { browserToday } from '../support/clock';
import { selectCalendarDate, setPickerRepeat, setPickerTime } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('task dates share semantic colors in both palettes and languages without hover or selection fading', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Date color check !1');
  await input.press('Enter');
  await input.press('Escape');
  const today = await browserToday(page);
  const dates = [...[-1, 0, 1, 14].map((days) => today.add({ days }).toString()), ''];
  for (const language of ['ko', 'en']) {
    for (const theme of ['dark', 'light']) {
      await page.getByLabel(/^(설정과 백업|Settings and backup)$/).click();
      await chooseChoice(page, page.getByLabel(/^(언어|Language)$/), language);
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: language === 'ko' ? '화면' : 'Appearance', exact: true })
        .click();
      await page
        .getByRole('radio', {
          name:
            language === 'ko'
              ? theme === 'dark'
                ? '다크'
                : '라이트'
              : theme === 'dark'
                ? 'Dark'
                : 'Light',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: language === 'ko' ? '돌아가기' : 'Back', exact: true })
        .click();
      for (const [index, date] of dates.entries()) {
        const row = page.locator('.task-row');
        await row.locator('.task-title').click();
        const control = page.locator('.td-date-button');
        await control.click();
        if (date) {
          await selectCalendarDate(page, date);
        } else {
          await page
            .getByRole('button', {
              name: language === 'ko' ? '날짜 지우기' : 'Clear date',
              exact: true,
            })
            .click();
        }
        if (index === 1) {
          await setPickerTime(page, '09:30');
          await setPickerRepeat(page, 'daily');
        }
        if (await page.locator('.date-picker-panel').count()) {
          await page.keyboard.press('Escape');
        }
        const tone = index === 0 ? 'overdue' : index === 1 ? 'today' : date ? 'neutral' : 'unset';
        await expect(control).toHaveAttribute('data-date-tone', tone);
        const detail = await appearance(control);
        expect(detail.contrast).toBeGreaterThanOrEqual(4.5);
        expect(detail.opacity.every((value) => value === '1')).toBe(true);
        await control.hover();
        expect((await appearance(control)).color).toBe(detail.color);
        if (date) {
          const text = row.locator('.row-date');
          await expect(text).toHaveAttribute('data-date-tone', tone);
          expect((await appearance(text)).color).toBe(detail.color);
          if (index === 0) {
            await expect(text).toHaveAttribute(
              'aria-description',
              language === 'ko' ? '기한이 지남' : 'Overdue',
            );
          }
          await expect(text).toHaveAttribute('datetime', new RegExp(`^${date}`));
          expect((await appearance(text)).contrast).toBeGreaterThanOrEqual(4.5);
        } else {
          await expect(row.locator('.row-date')).toHaveCount(0);
        }
        await page
          .getByLabel(language === 'ko' ? '할 일 상세 닫기' : 'Close task details', { exact: true })
          .click();
        if (date) {
          await row.hover();
          const hover = await appearance(row.locator('.row-date'));
          expect(hover.color).toBe(detail.color);
          expect(hover.contrast).toBeGreaterThanOrEqual(4.5);
          await page.locator('.workspace-header').hover();
          expect((await appearance(row.locator('.row-date'))).contrast).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const row = page.locator('.task-row');
  await row.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  invariant(dates[1] !== undefined, 'Missing dates[1]');
  await selectCalendarDate(page, dates[1]);
  await page.keyboard.press('Escape');
  await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'today');
  expect((await appearance(row.locator('.row-date'))).color).toBe(
    (await appearance(page.locator('.td-date-button'))).color,
  );
});

for (const theme of ['dark', 'light']) {
  test(`completion and deletion override date urgency and restore the active tone in ${theme}`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const input = page.locator('#quick-add-input');
    await input.fill('Status date today');
    await input.press('Enter');
    await input.press('Escape');
    const row = page.locator('.task-row');
    await row.locator('.task-title').click();
    const todayColor = (await appearance(row.locator('.row-date'))).color;
    await page.locator('.td-complete').first().click();
    await page.locator('.smart-lists > button').nth(4).click();
    await row.locator('.task-title').click();
    await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'neutral');
    await expect(page.locator('.td-date-button')).toHaveAttribute('data-date-tone', 'neutral');
    expect((await appearance(row.locator('.row-date'))).contrast).toBeGreaterThanOrEqual(4.5);
    await page.locator('.td-complete').first().click();
    await page.locator('.smart-lists > button').first().click();
    await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'today');
    expect((await appearance(row.locator('.row-date'))).color).toBe(todayColor);
    await row.locator('.task-title').click();
    await page.locator('.td-date-button').click();
    const past = (await browserToday(page)).subtract({ days: 1 }).toString();
    await selectCalendarDate(page, past);
    await page.keyboard.press('Escape');
    await page.getByLabel('Task actions menu', { exact: true }).click();
    await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
    await page.locator('.smart-lists > button').nth(5).click();
    await row.locator('.task-title').click();
    await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'neutral');
    await expect(page.locator('.td-date-button')).toHaveAttribute('data-date-tone', 'neutral');
    const disabled = await appearance(page.locator('.td-date-button'));
    expect(disabled.contrast).toBeGreaterThanOrEqual(4.5);
    expect(disabled.opacity.every((value) => value === '1')).toBe(true);
    await page
      .locator('.td-trash-banner')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.locator('.smart-lists > button').first().click();
    await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'overdue');
    await expect
      .poll(async () => {
        const task = (await storedWorkspace(page)).tasks[0];
        invariant(task !== undefined, 'Missing task');
        return { date: task.date, deleted: task.deleted, completedAt: task.completedAt };
      })
      .toEqual({ date: past, deleted: false, completedAt: null });
    await reloadSavedPage(page);
    await expect(row.locator('.row-date')).toHaveAttribute('data-date-tone', 'overdue');
  });
}
