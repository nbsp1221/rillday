import { type Page, expect, test } from '@playwright/test';
import { emptyWorkspace } from '@repo/frontend/application';
import { appearance } from '../support/appearance';
import { browserToday } from '../support/clock';
import { seedWorkspace, storedWorkspace } from '../support/storage';

async function fixture(page: Page) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const data = emptyWorkspace();
  const icons = ['circle', 'sparkles', 'coffee', 'sun', 'clover', 'music', 'star', 'diamond', '🧘'];
  const colors = ['#94b781', '#c77f87', '#000000', '#ffffff'];
  const today = (await browserToday(page)).toString();
  data.habits = icons.map((icon, index) => ({
    id: `habit-${index}`,
    name: `Habit ${index}`,
    icon,
    color: colors[index % colors.length],
    kind: 'boolean',
    goal: 1,
    unit: 'times',
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    weeklyTarget: 3,
    intervalDays: 1,
    step: 1,
    reminderTime: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  data.habitLogs = data.habits.map((habit) => ({
    habitId: habit.id,
    date: today,
    value: 1,
    skipped: false,
    note: 'Keep history',
  }));
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  return storedWorkspace(page);
}

test('existing icon IDs and emoji survive editing; the searchable catalogue has 64 choices', async ({
  page,
}) => {
  const before = await fixture(page);
  await expect(page.locator('.habit-name .habit-symbol svg')).toHaveCount(8);
  await expect(page.locator('.habit-custom-glyph')).toHaveText('🧘');
  await page.locator('.habit-name').first().click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page.locator('.habit-icon-grid [role=radio]')).toHaveCount(64);
  await expect(page.getByRole('radio', { name: 'Circle', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await storedWorkspace(page)).habits[0].icon).toBe('circle');
  expect((await storedWorkspace(page)).habitLogs).toEqual(before.habitLogs);
});

test('appearance changes remain a local draft until Save, and cancellation preserves history', async ({
  page,
}) => {
  const before = await fixture(page);
  await page.locator('.habit-name').first().click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Appearance', exact: true });
  await trigger.click();
  await page.getByLabel('Search icons', { exact: true }).fill('reading');
  await page.getByRole('radio', { name: 'Reading', exact: true }).click();
  await expect(trigger.locator('svg')).toHaveClass(/lucide-book-open/);
  await page.getByRole('tab', { name: 'Color', exact: true }).click();
  await page.getByRole('radio', { name: 'Purple #A398D0', exact: true }).click();
  expect(await trigger.evaluate((el) => el.style.getPropertyValue('--habit-color'))).toBe(
    '#a398d0',
  );
  expect((await storedWorkspace(page)).habits).toEqual(before.habits);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  await expect(trigger.locator('svg')).toHaveClass(/lucide-circle/);
  await trigger.click();
  await page.getByRole('radio', { name: 'Reading', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page)).habits[0].icon).toBe('book-open');
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  await expect(page.locator('.habit-name').first().locator('svg').first()).toHaveClass(
    /lucide-book-open/,
  );
});

test('appearance search, roving radio keys and layered Escape fit a narrow screen', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 320, height: 650 });
  await page.locator('.habit-name').first().click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Appearance', exact: true });
  await trigger.click();
  await page.getByRole('radio', { name: 'Circle', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Star', exact: true })).toBeFocused();
  await page.getByLabel('Search icons', { exact: true }).fill('medication');
  await expect(page.locator('.habit-icon-grid [role=radio]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Medication', exact: true }).click();
  const box = (await page.locator('.habit-appearance-panel').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(312);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.habit-editor')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.habit-editor')).toHaveCount(0);
});

for (const theme of ['Dark', 'Light']) {
  test(`completed habit dates retain readable paired colors on hover and selection in ${theme}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByLabel('Habit', { exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.locator('.habit-name').nth(i).click();
      const day = page.locator('.habit-history-grid button.done:not(:disabled)').first();
      await day.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const before = await day.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        box: {
          x: el.getBoundingClientRect().x,
          y: el.getBoundingClientRect().y,
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        },
      }));
      await day.hover();
      expect(
        await day.evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          box: {
            x: el.getBoundingClientRect().x,
            y: el.getBoundingClientRect().y,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          },
        })),
      ).toEqual(before);
      expect((await appearance(day)).contrast).toBeGreaterThanOrEqual(4.5);
      await day.click();
      await day.focus();
      expect((await appearance(day)).contrast).toBeGreaterThanOrEqual(4.5);
      await expect(day).toHaveAttribute('aria-pressed', 'true');
      await page.getByLabel('Close details', { exact: true }).click();
    }
  });
}
