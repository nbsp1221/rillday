import assert from 'node:assert/strict';
import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { chooseChoice } from '../support/choice';
import { selectCalendarDate } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences, storedWorkspace } from '../support/storage';

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

test('calendar keeps five ordered views in one accessible menu and exposes independent display options', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Calendar', { exact: true }).click();
  const view = page.getByRole('button', { name: 'Calendar view', exact: true });
  await view.press('ArrowDown');
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'Day',
    'Week',
    'Month',
    'Year',
    'Agenda',
  ]);
  await expect(page.getByRole('menuitemradio', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  for (const name of ['Year', 'Week', 'Day', 'Agenda', 'Month']) {
    await mode(page, name);
    await expect(view).toBeFocused();
    await expect(view).toHaveAttribute('aria-expanded', 'false');
  }
  const options = page.getByRole('button', { name: 'Calendar display options', exact: true });
  await options.click();
  await page.getByRole('menuitemcheckbox', { name: 'Show completed', exact: true }).click();
  await options.click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Show completed', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => storedPreferences(page))
    .toMatchObject({ calendarView: 'month', calendarShowCompleted: true });
  await reloadSavedPage(page);
  await page.getByLabel('Calendar', { exact: true }).click();
  await options.click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Show completed', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('narrow calendar keeps display controls reachable and undated tasks usable without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/?demo=1');
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.locator('.calendar-undated')).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendar display options', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show undated tasks', exact: true }).click();
  await expect(page.locator('.calendar-undated')).toBeVisible();
  await expect(page.getByLabel('Add an undated task', { exact: true })).toBeVisible();
  for (const name of ['Month', 'Week', 'Day', 'Year', 'Agenda']) {
    await mode(page, name);
    const geometry = await page.locator('.calendar-toolbar').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const buttonElement = el.querySelector('.calendar-options-menu button');
      if (buttonElement === null) {
        throw new Error("Expected element matching '.calendar-options-menu button'");
      }
      const button = buttonElement.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        inset: box.right - button.right,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.inset).toBe(16);
  }
});

test('calendar composer traps keyboard focus, retains invalid text and supports IME submission', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.locator('.calendar-day-add').first().click();
  const dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
  const input = dialog.getByRole('textbox');
  await expect(input).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
  }
  await input.fill('#review');
  await input.press('Enter');
  await expect(input).toHaveValue('#review');
  await input.fill('Schedule entry');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  });
  await expect(dialog).toBeVisible();
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.calendar-task-title')).toContainText(['Schedule entry']);
  await page.locator('.calendar-day-add').first().click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const language of ['ko', 'en']) {
  test(`one period heading opens localized month and year grids in ${language}`, async ({
    page,
  }) => {
    await page.goto('/');
    const en = language === 'en';
    if (!en) {
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'ko');
      await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    }
    await page.locator('.quick-date-trigger').click();
    const calendar = page.locator('.date-picker-body > .date-calendar');
    const heading = calendar.getByRole('button', {
      name: en ? 'Choose month and year' : '월 및 연도 선택',
      exact: true,
    });
    const parent = page.locator('.date-picker-panel');
    const before = await visibleBox(parent);
    await heading.click();
    await expect(
      page.locator('.calendar-period-grid[data-view="months"] [role="option"]'),
    ).toHaveCount(12);
    await calendar
      .getByRole('button', { name: en ? 'Choose year' : '연도 선택', exact: true })
      .click();
    await page.keyboard.type('2032');
    await expect(page.locator('.calendar-period-grid [role="option"]:focus')).toHaveText('2032');
    await page.keyboard.press('Enter');
    await expect(page.locator('.calendar-period-grid[data-view="months"]')).toBeVisible();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(calendar.locator('.calendar-caption')).toHaveAttribute('data-month', '2032-02');
    await expect(heading).toBeFocused();
    expect(await visibleBox(parent)).toEqual(before);
    await calendar.locator('button[data-date="2032-02-29"]').click();
    await expect(calendar.locator('button[data-selected-single="true"]')).toHaveAttribute(
      'data-date',
      '2032-02-29',
    );
    await heading.click();
    await calendar
      .getByRole('button', { name: en ? 'Choose year' : '연도 선택', exact: true })
      .click();
    await page.keyboard.type('2040');
    await page.keyboard.press('Escape');
    await expect(calendar.locator('.calendar-caption')).toHaveAttribute('data-month', '2032-02');
    await expect(parent).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('.calendar-period-chooser')).toHaveCount(0);
    await heading.click();
    await page
      .locator('.calendar-period-grid [role="option"]:focus')
      .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(page.locator('.calendar-period-chooser')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(parent).toHaveCount(0);
  });
}

for (const height of [480, 300]) {
  test.describe(() => {
    test.use({ viewport: { width: 320, height }, hasTouch: true });

    test(`period grids keep the date panel stable in a ${height}px touch viewport including repeat end dates`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.locator('.quick-date-trigger').click();
      await selectCalendarDate(page, '2032-02-29');
      await page.locator('.date-repeat-trigger').click();
      await page.getByLabel('Custom repeat', { exact: true }).click();
      await page.getByLabel('Repeat end date', { exact: true }).click();
      const calendar = page.locator('.repeat-end-calendar .date-calendar');
      await calendar.getByRole('button', { name: 'Choose month and year', exact: true }).click();
      await calendar.getByRole('button', { name: 'Choose year', exact: true }).click();
      const grid = page.locator('.calendar-period-grid');
      const active = grid.locator('[role=option]:focus');
      expect(
        await active.evaluate((el) => {
          const a = el.getBoundingClientRect();
          if (el.parentElement === null) {
            throw new Error('Missing el.parentElement');
          }
          const b = el.parentElement.getBoundingClientRect();
          return a.top >= b.top && a.bottom <= b.bottom;
        }),
      ).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('.calendar-period-chooser')).toHaveCount(0);
      await expect(page.locator('.date-field-popover')).toBeVisible();
      await expect(page.locator('.date-picker-panel')).toBeVisible();
      await selectCalendarDate(page, '2032-03-10', calendar, true);
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(page.locator('.date-repeat-trigger')).toHaveAttribute(
        'data-until',
        '2032-03-10',
      );
    });
  });
}

test('calendar capture has a real submit action, validates, preserves drafts and supports continuous entry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Calendar', { exact: true }).click();
  const form = page.locator('.calendar-task-capture');
  const input = form.getByRole('textbox');
  const submit = form.getByRole('button', { name: 'Add', exact: true });
  await expect(submit).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', 'New task');
  await input.fill('   ');
  await expect(submit).toBeDisabled();
  await input.fill('#Labels');
  await input.press('Enter');
  await expect(input).toHaveValue('#Labels');
  await input.fill('한글 조합');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  });
  await expect(page.locator('.calendar-undated .calendar-task')).toHaveCount(0);
  await input.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue('한글 조합');
  await page.getByLabel('Habit', { exact: true }).click();
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(input).toHaveValue('한글 조합');
  await submit.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.locator('.calendar-undated .calendar-task')).toHaveCount(1);
  await input.fill('Second task');
  await input.press('Enter');
  await expect(page.locator('.calendar-undated .calendar-task')).toHaveCount(2);
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks.map((task) => task.title).sort())
    .toEqual(['Second task', '한글 조합']);
  await reloadSavedPage(page);
  await page.getByLabel('Calendar', { exact: true }).click();
  await expect(page.locator('.calendar-undated .calendar-task')).toHaveCount(2);
});

test('capture field keeps equal inset, stable bounds and centered icon across widths and input focus', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Calendar', { exact: true }).click();
  for (const width of [1440, 900, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const form = page.locator('.calendar-task-capture');
    const input = form.getByRole('textbox');
    await form.scrollIntoViewIfNeeded();
    const rest = await visibleBox(form);
    await input.fill('A very long task title '.repeat(12));
    await input.focus();
    expect(await visibleBox(form)).toEqual(rest);
    const g = await form.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const bElement = el.querySelector('button');
      if (bElement === null) {
        throw new Error("Expected element matching 'button'");
      }
      const b = bElement.getBoundingClientRect();
      const iconElement = el.querySelector('svg');
      if (iconElement === null) {
        throw new Error("Expected element matching 'svg'");
      }
      const icon = iconElement.getBoundingClientRect();
      const pane = el.closest('aside');
      if (pane === null) {
        throw new Error('Missing pane');
      }
      const box = pane.getBoundingClientRect();
      return {
        insets: [
          r.left - box.left - pane.clientLeft,
          box.left + pane.clientLeft + pane.clientWidth - r.right,
        ],
        size: [b.width, b.height],
        center: [
          icon.x + icon.width / 2 - b.x - b.width / 2,
          icon.y + icon.height / 2 - b.y - b.height / 2,
        ],
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert(g.insets[1] !== undefined, 'Missing g.insets[1]');
    assert(g.insets[0] !== undefined, 'Missing g.insets[0]');
    expect(Math.abs(g.insets[0] - g.insets[1])).toBeLessThanOrEqual(1);
    expect(g.size).toEqual([32, 32]);
    expect(g.center).toEqual([0, 0]);
    expect(g.overflow).toBe(false);
  }
});
