import { type Page, expect, test } from '@playwright/test';
import { appearance } from '@repo/test-support/browser-appearance';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

async function editList(page: Page) {
  const row = page.locator('.sidebar-list').filter({ hasText: 'Work and projects' });
  await row.hover();
  await row.locator('.entity-edit').click();
  return page.getByRole('dialog', { name: 'Edit list', exact: true });
}

async function custom(page: Page, hex?: string, label = 'List color') {
  const trigger = page.getByRole('button', { name: label, exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  await page.getByRole('button', { name: 'Custom color', exact: true }).click();
  if (hex) {
    const input = page.getByLabel('HEX color', { exact: true });
    await input.fill(hex);
    await input.press('Enter');
  }
}

async function matrix(page: Page) {
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.getByLabel('Matrix settings', { exact: true }).click();
  return page.getByRole('dialog', { name: 'Matrix settings', exact: true });
}

test('compact color fields open preset options, support arrows and preserve draft cancellation', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const dialog = await editList(page);
  const trigger = dialog.getByRole('button', { name: 'List color', exact: true });
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await trigger.click();
  const group = page.getByRole('radiogroup', { name: 'List color', exact: true });
  await expect(group.getByRole('radio')).toHaveCount(11);
  await expect(group.getByRole('radio', { name: 'Blue #7D9CC4', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight', { delay: 50 });
  await expect(trigger).toHaveText('Indigo');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await editList(page);
  await expect(trigger).toHaveText('Blue');
  await trigger.click();
  await group.getByRole('radio', { name: 'Green #94B781', exact: true }).click();
  await expect(trigger).toHaveText('Green');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .locator('.sidebar-list')
      .filter({ hasText: 'Work and projects' })
      .locator('button > svg')
      .first(),
  ).toHaveCSS('color', 'rgb(148, 183, 129)');
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).lists.find((list) => list.name === 'Work and projects')
          ?.color,
    )
    .toBe('#94b781');
  await reloadSavedPage(page);
  await editList(page);
  await expect(trigger).toHaveText('Green');
});

test('custom popovers validate HEX and provide keyboard color-area and hue controls without a second save', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const dialog = await editList(page);
  const trigger = dialog.getByRole('button', { name: 'List color', exact: true });
  await custom(page);
  const colorArea = page.locator('.color-controls');
  const editorBox = await page.locator('.color-custom-editor').boundingBox();
  const areaBox = await colorArea.boundingBox();
  expect(areaBox?.width).toBeCloseTo(editorBox!.width, 1);
  expect(areaBox?.height).toBe(176);
  await expect(colorArea.locator('.color-thumb').first()).toHaveCSS('width', '18px');
  const hex = page.getByLabel('HEX color', { exact: true });
  await hex.fill('oops');
  await expect(hex).toHaveValue('#7D9CC4');
  await expect(dialog).toBeVisible();
  expect(await hex.evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(true);
  await hex.fill('#abc');
  await hex.dispatchEvent('compositionstart');
  await hex.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await hex.dispatchEvent('compositionend', { data: '#abc' });
  await hex.press('Enter');
  await expect(trigger).toHaveText('#AABBCC');
  await custom(page);
  const hue = page.getByRole('slider', { name: 'Hue', exact: true });
  await hue.focus();
  await hue.press('ArrowRight', { delay: 50 });
  await expect(trigger).not.toHaveText('#AABBCC');
  const before = await trigger.textContent();
  const area = page.getByRole('slider', {
    name: /^Saturation and brightness/,
  });
  await area.focus();
  await area.press('ArrowDown');
  expect(await trigger.textContent()).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(hex).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await custom(page, '#000000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).lists.find((list) => list.name === 'Work and projects')
          ?.color,
    )
    .toBe('#000000');
  await reloadSavedPage(page);
  await editList(page);
  await expect(trigger).toHaveText('#000000');
  await custom(page, '#fff');
  await expect(trigger).toHaveText('#FFFFFF');
});

test('matrix color popovers contain Tab and Escape inside their modal and retain valid custom edits', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const dialog = await matrix(page);
  const trigger = dialog.locator('.color-picker-trigger').first();
  const label = (await trigger.getAttribute('aria-label'))!;
  await trigger.click();
  const picker = page.locator('.color-picker-panel');
  await expect(picker).toBeVisible();
  await custom(page, undefined, label);
  await page.getByLabel('HEX color', { exact: true }).fill('#12');
  await page.getByLabel('HEX color', { exact: true }).press('Tab');
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await custom(page, '#123456', label);
  await expect(picker).toHaveCount(0);
  await expect(trigger.locator('span')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).quadrants.find((quadrant) => quadrant.id === 'do')?.color,
    )
    .toBe('#123456');
  await reloadSavedPage(page);
  await matrix(page);
  await expect(trigger.locator('span')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
});

test('a continuous custom-color drag commits one matrix undo step', async ({ page }) => {
  await page.goto('/?demo=1');
  const dialog = await matrix(page);
  const trigger = dialog.locator('.color-picker-trigger').first();
  const initial = await trigger
    .locator('span')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await custom(page, undefined, (await trigger.getAttribute('aria-label'))!);
  const area = (await page.locator('.color-area').boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.2, area.y + area.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.8, area.y + area.height * 0.6, { steps: 12 });
  await page.mouse.up();
  expect(
    await trigger.locator('span').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(initial);
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Complete', exact: true }).click();
  await page.keyboard.press('Control+z');
  await matrix(page);
  await expect(trigger.locator('span')).toHaveCSS('background-color', initial);
});

test('habit editor shares the color field and persists custom colors', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Shared color habit');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('tab', { name: 'Color', exact: true }).click();
  await page.getByRole('button', { name: 'Custom color', exact: true }).click();
  await page.getByLabel('HEX color', { exact: true }).fill('#234567');
  await page.getByLabel('HEX color', { exact: true }).press('Tab');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.locator('.habit-row').filter({ hasText: 'Shared color habit' });
  await expect(row.locator('.habit-symbol')).toHaveCSS('color', 'rgb(35, 69, 103)');
  await expect
    .poll(async () =>
      (await storedWorkspace(page)).habits
        .filter((habit) => habit.name === 'Shared color habit')
        .map((habit) => habit.color),
    )
    .toEqual(['#234567']);
  await reloadSavedPage(page);
  await page.getByLabel('Habit Tracker', { exact: true }).click();
  await expect(row.locator('.habit-symbol')).toHaveCSS('color', 'rgb(35, 69, 103)');
});

for (const theme of ['dark', 'light']) {
  test(`color popovers fit narrow layouts without changing form geometry in ${theme}`, async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByLabel('Show sidebar', { exact: true }).click();
    const dialog = await editList(page);
    const before = await dialog.boundingBox();
    const footer = await dialog.locator('.modal-footer').boundingBox();
    await page.getByRole('button', { name: 'List color', exact: true }).click();
    const checked = page.locator('.color-picker-panel .color-choice[aria-checked="true"] > span');
    expect((await appearance(checked)).contrast).toBeGreaterThanOrEqual(4.5);
    await custom(page);
    const picker = page.locator('.color-picker-panel');
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(312);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
    expect(await picker.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
    expect(await dialog.boundingBox()).toEqual(before);
    expect(await dialog.locator('.modal-footer').boundingBox()).toEqual(footer);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(480);
  });
}
