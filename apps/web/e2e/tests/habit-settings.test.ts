import { type Page, expect, test } from '@playwright/test';
import { emptyWorkspace } from '@repo/frontend/application';
import { seedWorkspace, storedWorkspace } from '../support/storage';

async function newHabit(page: Page) {
  await page.goto('/');
  await page.getByLabel('Habit', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Habit settings check');
  await expect(page.getByRole('radiogroup', { name: 'Goal', exact: true })).toBeVisible();
}

async function frequency(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Frequency', exact: true }).click();
  await page.getByRole('option', { name: new RegExp('^' + name) }).click();
}

test('historical habit controls retain the rule their click uses after the goal type changes', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-20T03:00:00Z') });
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();

  const oldRule = {
    from: '2026-10-01',
    kind: 'boolean' as const,
    goal: 1,
    unit: 'times',
    step: 1,
    frequency: 'daily' as const,
    weekdays: [],
    weeklyTarget: 7,
    intervalDays: 1,
  };
  const newRule = {
    ...oldRule,
    from: '2026-10-20',
    kind: 'quantity' as const,
    goal: 8,
    unit: 'cups',
  };
  const workspace = emptyWorkspace();
  workspace.habits.push({
    id: 'historical-habit',
    name: 'Review past entries',
    color: '#7d9cc4',
    icon: 'check',
    kind: 'quantity',
    goal: 8,
    unit: 'cups',
    step: 1,
    frequency: 'daily',
    weekdays: [],
    weeklyTarget: 7,
    intervalDays: 1,
    reminderTime: null,
    archived: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    startDate: '2026-10-01',
    zone: 'Asia/Seoul',
    rules: [oldRule, newRule],
  });
  workspace.habitLogs.push({
    habitId: 'historical-habit',
    date: '2026-10-19',
    value: 1,
    skipped: false,
    note: '',
    goal: 1,
    unit: 'times',
    ruleFrom: '2026-10-01',
  });
  await seedWorkspace(page, workspace);
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  await expect(page.locator('.habit-table-head time[datetime]')).toHaveText([
    '18',
    '19',
    '20',
    '21',
    '22',
    '23',
    '24',
  ]);
  const row = page.locator('.habit-row').filter({ hasText: 'Review past entries' });
  const historical = row.locator('.habit-day').nth(1);
  const today = row.locator('.habit-day').nth(2);
  await expect(historical).toHaveAccessibleName(/Mark incomplete$/);
  await expect(historical).toHaveAttribute('aria-pressed', 'true');
  await expect(today).toHaveAccessibleName(/Edit record$/);
  await historical.click();
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).habitLogs.find((log) => log.date === '2026-10-19')?.value,
    )
    .toBe(0);
  await expect(historical).toHaveAccessibleName(/Check in$/);
  await expect(historical).toHaveAttribute('aria-pressed', 'false');
  await row.locator('.habit-quick-add').click();
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).habitLogs.find((log) => log.date === '2026-10-20')?.value,
    )
    .toBe(1);
  await page.reload();
  const saved = await storedWorkspace(page);
  expect(saved.habitLogs.find((log) => log.date === '2026-10-19')).toMatchObject({
    value: 0,
    goal: 1,
    unit: 'times',
    ruleFrom: '2026-10-01',
  });
  expect(saved.habitLogs.find((log) => log.date === '2026-10-20')).toMatchObject({
    value: 1,
    goal: 8,
    unit: 'cups',
    ruleFrom: '2026-10-20',
  });
});

test('quantity goal, unit suggestions and fractional check-in step save exactly and survive reload', async ({
  page,
}) => {
  await newHabit(page);
  await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
  const goal = page.getByRole('textbox', { name: 'Daily target', exact: true });
  const step = page.getByRole('textbox', { name: 'Step size', exact: true });
  await goal.fill('2.5');
  await page.getByLabel('Increase goal', { exact: true }).click();
  await expect(goal).toHaveValue('3.5');
  await step.fill('0.25');
  const unit = page.getByRole('combobox', { name: 'Unit', exact: true });
  await unit.fill('');
  await unit.press('ArrowDown');
  await unit.press('ArrowDown');
  await unit.press('Enter');
  await expect(unit).toHaveValue('cups');
  await expect(unit).toBeFocused();
  await frequency(page, 'A number of days each week');
  await page.getByRole('textbox', { name: 'Weekly target (days)', exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      const h = (await storedWorkspace(page))?.habits[0];
      return (
        h && {
          goal: h.goal,
          step: h.step,
          unit: h.unit,
          frequency: h.frequency,
          weeklyTarget: h.weeklyTarget,
        }
      );
    })
    .toEqual({ goal: 3.5, step: 0.25, unit: 'cups', frequency: 'weekly', weeklyTarget: 4 });
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  await page.locator('.habit-name').first().click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  await expect(goal).toHaveValue('3.5');
  await expect(step).toHaveValue('0.25');
  await expect(unit).toHaveValue('cups');
});

test('invalid numeric drafts and blank units cannot save; min/max keyboard and buttons are coherent', async ({
  page,
}) => {
  await newHabit(page);
  await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
  const goal = page.getByRole('textbox', { name: 'Daily target', exact: true });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  for (const [value, expected] of [
    ['', ''],
    ['0', '0'],
    ['abc', '0'],
    ['Infinity', '0'],
  ]) {
    await goal.fill(value);
    await save.click();
    await expect(goal).toHaveValue(expected);
    await expect(goal).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.habit-editor')).toBeVisible();
  }
  await goal.fill('0.01');
  await goal.press('Home');
  await expect(page.getByLabel('Decrease goal', { exact: true })).toBeDisabled();
  await goal.press('ArrowUp');
  await expect(goal).toHaveValue('1.01');
  const unit = page.getByRole('combobox', { name: 'Unit', exact: true });
  await unit.fill('   ');
  await unit.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await unit.press('Escape');
  await save.click();
  await expect(unit).toHaveAttribute('aria-invalid', 'true');
  await unit.fill('custom cups');
  await unit.press('Escape');
  await frequency(page, 'At regular intervals');
  const interval = page.getByRole('textbox', { name: 'Interval (days)', exact: true });
  for (const value of ['', '0', '31', '2.5']) {
    await interval.fill(value);
    await save.click();
    await expect(interval).toHaveAttribute('aria-invalid', 'true');
  }
  await interval.press('End');
  await expect(interval).toHaveValue('30');
  await expect(page.getByLabel('Increase interval', { exact: true })).toBeDisabled();
  await interval.press('Home');
  await expect(interval).toHaveValue('1');
  await interval.fill('3');
  await save.click();
  await expect.poll(async () => (await storedWorkspace(page))?.habits[0]?.intervalDays).toBe(3);
});

test('frequency menu dismisses one layer, weekdays follow preferences and empty selections block Save', async ({
  page,
}) => {
  await newHabit(page);
  const trigger = page.getByRole('combobox', { name: 'Frequency', exact: true });
  await trigger.press('ArrowDown');
  await expect(page.getByRole('option', { selected: true })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.habit-editor')).toBeVisible();
  await frequency(page, 'On selected weekdays');
  const days = page.getByRole('group', { name: 'Practice days', exact: true });
  await expect(days.getByRole('button')).toHaveText([
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ]);
  while (await days.getByRole('button', { pressed: true }).count()) {
    await days.getByRole('button', { pressed: true }).first().click();
  }
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await days.getByRole('button', { name: 'Sun', exact: true }).click();
  await days.getByRole('button', { name: 'Sat', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await storedWorkspace(page))?.habits[0]?.weekdays).toEqual([0, 6]);
});

test('changing editor modes retains local drafts; Cancel and IME never alter existing logs', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit', { exact: true }).click();
  const before = await storedWorkspace(page);
  await page.locator('.habit-name').filter({ hasText: 'Drink enough water' }).click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  const goal = page.getByRole('textbox', { name: 'Daily target', exact: true });
  await goal.fill('');
  await goal.fill('12.');
  await expect(goal).toHaveValue('12.');
  await goal.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  });
  await expect(page.locator('.habit-editor')).toBeVisible();
  await page.getByRole('radio', { name: 'Completion', exact: true }).click();
  await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
  await expect(goal).toHaveValue('12');
  await frequency(page, 'A number of days each week');
  await page.getByRole('textbox', { name: 'Weekly target (days)', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Edit habit', { exact: true }).click();
  await expect(goal).toHaveValue('8');
  await expect(
    page
      .getByRole('combobox', { name: 'Frequency', exact: true })
      .locator('[data-slot=select-value]'),
  ).toHaveText('Every day');
  await goal.fill('12.');
  await goal.press('Escape');
  await expect(page.locator('.habit-editor')).toHaveCount(0);
  expect(await storedWorkspace(page)).toEqual(before);
});

for (const width of [320, 900]) {
  test(`all habit settings and their menus fit and align at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await newHabit(page);
    await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
    const goalChoices = await page
      .getByRole('radiogroup', { name: 'Goal', exact: true })
      .getByRole('radio')
      .evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect(),
            style = getComputedStyle(item);
          return { width: box.width, border: style.borderColor, color: style.color };
        }),
      );
    expect(Math.abs(goalChoices[0].width - goalChoices[1].width)).toBeLessThan(1);
    expect(goalChoices[1].border).toBe(goalChoices[1].color);
    expect(goalChoices[1].border).not.toBe(goalChoices[0].border);
    await frequency(page, 'At regular intervals');
    const geometry = await page.locator('.habit-editor').evaluate((el) => {
      const boxes = [
        ...el.querySelectorAll(
          '.habit-setting-row .number-stepper,.habit-setting-row .habit-unit-control',
        ),
      ].map((el) => el.getBoundingClientRect());
      return {
        axes: boxes.map((r) => ({ x: r.x, width: r.width })),
        heights: [...el.querySelectorAll('.number-stepper,.habit-unit-control')].map(
          (el) => el.getBoundingClientRect().height,
        ),
        overflow:
          el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.axes).toHaveLength(4);
    expect(geometry.heights).toHaveLength(4);
    expect(
      geometry.axes.every((r) => r.x === geometry.axes[0].x && r.width === geometry.axes[0].width),
    ).toBe(true);
    expect(geometry.heights.every((h) => h === 36)).toBe(true);
    expect(geometry.overflow).toBe(false);
    const footer = (await page.locator('.modal-footer').boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(600 - 8);
    await page.getByRole('combobox', { name: 'Frequency', exact: true }).click();
    await expect(page.locator('.choice-field-panel')).toBeVisible();
    const menu = (await page.locator('.choice-field-panel').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(8);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width - 8);
    await page.keyboard.press('Tab');
    await expect(page.locator('.choice-field-panel')).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Interval (days)', exact: true })).toBeFocused();
    await page.getByRole('combobox', { name: 'Frequency', exact: true }).click();
    await expect(page.locator('.choice-field-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.choice-field-panel')).toBeHidden();
  });
}

test.describe(() => {
  test.use({ viewport: { width: 320, height: 300 }, hasTouch: true });

  test('short touch editor retains visible actions and bounded frequency and unit popovers', async ({
    page,
  }) => {
    await newHabit(page);
    await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
    const footer = (await page.locator('.modal-footer').boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(292);
    await page.getByRole('combobox', { name: 'Unit', exact: true }).fill('custom units');
    const unit = (await page.locator('.habit-unit-panel').boundingBox())!;
    expect(unit.y).toBeGreaterThanOrEqual(8);
    expect(unit.y + unit.height).toBeLessThanOrEqual(292);
    await page.keyboard.press('Escape');
    await frequency(page, 'A number of days each week');
    await page.getByRole('textbox', { name: 'Weekly target (days)', exact: true }).fill('7');
    expect(await page.locator('.modal-footer').boundingBox()).toEqual(footer);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.habit-editor')).toHaveCount(0);
  });
});

test('quantity bounds block invalid input and accept the declared maximum', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, emptyWorkspace());
  await page.reload();
  await page.getByLabel('Habit', { exact: true }).click();
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  await page.getByLabel('Habit name', { exact: true }).fill('Check quantity boundaries');
  await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
  for (const label of ['Daily target', 'Step size']) {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await expect(
      page.locator('.number-stepper-group').filter({ has: input }).locator('input[type=number]'),
    ).toHaveAttribute('max', '1000000');
    await input.fill('1000001');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(/1,000,000/);
    expect((await storedWorkspace(page)).habits).toHaveLength(0);
    await input.fill('1000000');
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => (await storedWorkspace(page)).habits[0])
    .toMatchObject({ goal: 1000000, step: 1000000 });
});
