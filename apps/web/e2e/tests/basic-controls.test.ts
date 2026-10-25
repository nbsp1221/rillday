import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences } from '../support/storage';

test('completion checkboxes expose checked state, use Space and keep Enter from toggling', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Checkbox keyboard');
  await page.locator('#quick-add-input').press('Enter');
  const row = page.locator('.task-row');
  const check = row.getByRole('checkbox');
  await expect(check).not.toBeChecked();
  await check.focus();
  await check.press('Enter');
  await expect(check).not.toBeChecked();
  await check.press('Space');
  await expect(row).toHaveCount(0);
  await page.locator('.smart-lists > button').nth(4).click();
  await expect(check).toBeChecked();
  await check.focus();
  await check.press('Enter');
  await expect(check).toBeChecked();
  await check.press('Space');
  await expect(row).toHaveCount(0);
  await page.locator('.smart-lists > button').first().click();
  await expect(check).not.toBeChecked();
  await row.locator('.task-title').click();
  await expect(page.locator('.td-title-row').getByRole('checkbox')).not.toBeChecked();
});

test('shared switches keep track and thumb geometry while keyboard changes persist', async ({
  page,
}) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings and backup', exact: true });
  await settings.click();
  await page.locator('.settings-nav nav > button').nth(2).click();
  const control = page.getByRole('switch', { name: 'Expand completed tasks', exact: true });
  const initial = await control.getAttribute('aria-checked');
  const bounds = await visibleBox(control);

  expect(bounds.width).toBe(34);
  expect(bounds.height).toBe(20);
  await control.hover();
  expect(await visibleBox(control)).toEqual(bounds);
  await control.focus();
  await control.press('Space');
  await expect(control).toHaveAttribute('aria-checked', String(initial !== 'true'));
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ showCompleted: initial !== 'true' });
  await reloadSavedPage(page);
  await settings.click();
  await page.locator('.settings-nav nav > button').nth(2).click();
  await expect(control).toHaveAttribute('aria-checked', String(initial !== 'true'));
  await control.focus();
  await control.press('Enter');
  assert(initial !== null, 'Missing initial');
  await expect(control).toHaveAttribute('aria-checked', initial);
});

test('appearance choices support arrows and keep a required value', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await page.locator('.settings-nav nav > button').nth(1).click();
  const light = page.getByRole('radio', { name: 'Light', exact: true });
  const dark = page.getByRole('radio', { name: 'Dark', exact: true });
  await expect(light).toHaveCSS('cursor', 'default');
  await light.click();
  await light.press('ArrowRight', { delay: 50 });
  await expect(dark).toBeFocused();
  await expect(dark).toBeChecked();
  await dark.press('Space');
  await expect(dark).toBeChecked();
  await dark.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Density', exact: true })).toBeFocused();
});

test('shared form labels focus native inputs and plain picker buttons never submit the parent form', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.sidebar-list').first().hover();
  await page.locator('.sidebar-list').first().locator('.entity-edit').click();
  const name = page.getByRole('textbox', { name: 'List name', exact: true });
  await page.locator('.modal label').filter({ hasText: 'List name' }).click();
  await expect(name).toBeFocused();
  await name.fill('Shared controls draft');
  await page.getByRole('button', { name: 'List color', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.color-picker-panel')).toBeVisible();
  await expect(page.locator('.modal')).toBeVisible();
  const radio = page.getByRole('radio', { name: 'Green #94B781', exact: true });
  await radio.focus();
  await radio.press('Space');
  await expect(page.locator('.color-picker-panel')).toHaveCount(0);
  await expect(page.locator('.modal')).toBeVisible();
  await expect(name).toHaveValue('Shared controls draft');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-list').first()).toContainText('Work and projects');
});
