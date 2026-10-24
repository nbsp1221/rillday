import { type Locator, type Page, expect } from '@playwright/test';

export async function selectCalendarDate(
  page: Page,
  value: string,
  scope: Locator = page.locator('.date-picker-panel > .date-picker-body > .date-calendar'),
  returnsToSettings = false,
) {
  const [year, month] = value.split('-').map(Number);
  await scope.getByRole('button', { name: /^(월 및 연도 선택|Choose month and year)$/ }).click();
  await scope.getByRole('button', { name: /^(연도 선택|Choose year)$/ }).click();
  await page
    .locator(`.calendar-period-grid[data-view="years"] [role="option"][data-value="${year}"]`)
    .click();
  await page
    .locator(`.calendar-period-grid[data-view="months"] [role="option"][data-value="${month}"]`)
    .click();
  await scope.locator(`button[data-date="${value}"]:not([data-outside])`).click();
  if (returnsToSettings) {
    await expect(scope).toHaveCount(0);
  } else {
    await expect(
      scope.locator(`button[data-selected-single="true"][data-date="${value}"]`),
    ).toBeVisible();
  }
}

export async function setPickerRepeat(
  page: Page,
  frequency: 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'none',
) {
  await page.locator('.date-repeat-trigger').click();
  await page
    .locator('.schedule-options > button')
    .nth(['none', 'daily', 'weekly', 'monthly', 'weekdays'].indexOf(frequency))
    .click();
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', frequency);
}

export async function setPickerTime(page: Page, value: string) {
  await page.locator('.date-time-trigger').click();
  const input = page.getByRole('combobox', { name: /^(할 일 시간|Task time)$/ });
  await input.fill(value);
  await input.press('Enter');
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', value);
}
