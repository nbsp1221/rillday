import { expect, test } from '@playwright/test';
import { appearance } from '../support/appearance';
import { chooseChoice } from '../support/choice';
import { selectCalendarDate, setPickerTime } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('capture and details share leap-day selection and retain it after reload', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Leap-year event');
  const before = (await page.locator('.quick-add').boundingBox())!;
  await page.locator('.quick-date-trigger').click();
  const panel = page.locator('.date-picker-panel');
  await expect(panel.locator('button[data-date]')).toHaveCount(42);
  await selectCalendarDate(page, '2032-02-29');
  await panel.getByRole('button', { name: 'Complete', exact: true }).click();
  expect((await page.locator('.quick-add').boundingBox())!.height).toBe(before.height);
  await input.press('Enter');
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(panel.locator('[data-selected="true"] button')).toHaveAttribute(
    'data-date',
    '2032-02-29',
  );
  expect((await panel.boundingBox())!.width).toBe(304);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.date).toBe('2032-02-29');
  await reloadSavedPage(page);
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(panel.locator('[data-selected="true"] button')).toHaveAttribute(
    'data-date',
    '2032-02-29',
  );
});

test('calendar keyboard crosses a year, preserves IME and keeps submission in the title editor', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Year-end event 2026-12-31');
  await page.locator('.quick-date-trigger').click();
  const selected = page.locator('.date-calendar [data-selected="true"] button');
  await expect(selected).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('button[data-date="2027-01-01"]:not([data-outside])')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(selected).toHaveAttribute('data-date', '2027-01-01');
  await expect(page.locator('.date-picker-panel')).toBeVisible();
  await expect(page.locator('.task-title')).toHaveCount(0);
  await page.keyboard.press('PageDown');
  await expect(page.locator('button[data-date="2027-02-01"]:not([data-outside])')).toBeFocused();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(selected).toHaveAttribute('data-date', '2026-12-31');
  await page.keyboard.press('Escape');
  await expect(page.locator('.quick-date-trigger')).toBeFocused();
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.task-title')).toHaveText('Year-end event');
});

test('detail time duration repeat interval and calendar end date persist; clearing is one undo step', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Recurring event');
  await page.locator('#quick-add-input').press('Enter');
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await selectCalendarDate(page, '2028-02-29');
  await setPickerTime(page, '15:30');
  await page.locator('.date-duration-trigger').click();
  await page.getByRole('button', { name: '45m', exact: true }).click();
  await page.locator('.date-repeat-trigger').click();
  await page.getByLabel('Custom repeat', { exact: true }).click();
  await page.getByRole('radio', { name: 'Weekly', exact: true }).check();
  await page.getByLabel('Repeat interval', { exact: true }).fill('2');
  await page.getByLabel('Repeat end date', { exact: true }).click();
  const end = page.locator('.schedule-picker .date-calendar');
  await expect(end.locator('button[data-date="2028-02-28"]')).toBeDisabled();
  await selectCalendarDate(page, '2028-03-14', end, true);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await selectCalendarDate(page, '2028-03-20');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-until', '2028-03-20');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => {
      const task = (await storedWorkspace(page)).tasks[0];
      return { date: task.date, time: task.time, duration: task.duration, repeat: task.repeat };
    })
    .toEqual({
      date: '2028-03-20',
      time: '15:30',
      duration: 45,
      repeat: { frequency: 'weekly', interval: 2, until: '2028-03-20' },
    });
  await reloadSavedPage(page);
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '15:30');
  await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '45');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'weekly');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-interval', '2');
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await expect(page.locator('.td-date-button')).not.toHaveClass(/has-date/);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.td-date-button')).toHaveClass(/has-date/);
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '15:30');
  await expect(page.locator('.date-repeat-trigger')).toHaveAttribute('data-frequency', 'weekly');
});

test('calendar honors week-start preferences and localized period heading', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Calendar', exact: true })
    .click();
  await chooseChoice(page, page.getByLabel('Start week on', { exact: true }), '0');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('.quick-date-trigger').click();
  await expect(
    page.locator('.date-calendar').getByRole('columnheader', { includeHidden: true }).first(),
  ).toHaveText('Su');
  await expect(page.getByLabel('Choose month and year', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'ko');
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await page.locator('.quick-date-trigger').click();
  await expect(
    page.locator('.date-calendar').getByRole('columnheader', { includeHidden: true }).first(),
  ).toHaveText('일');
  await expect(page.getByLabel('월 및 연도 선택', { exact: true })).toBeVisible();
});

for (const timezoneId of ['Asia/Seoul', 'America/Los_Angeles']) {
  test.describe(() => {
    test.use({ timezoneId, locale: 'en-US' });

    test(`DST boundary dates stay local in ${timezoneId}`, async ({ page }) => {
      await page.goto('/');
      await page.locator('#quick-add-input').fill('Local day');
      await page.locator('.quick-date-trigger').click();
      await selectCalendarDate(page, '2026-03-08');
      await page.keyboard.press('Escape');
      await expect(page.locator('.date-picker-panel')).toBeHidden();
      await expect(page.locator('.quick-date-trigger')).toBeFocused();
      await page.locator('#quick-add-input').press('Enter');
      await expect
        .poll(
          async () =>
            (await storedWorkspace(page)).tasks.find((task) => task.title === 'Local day')?.date,
        )
        .toBe('2026-03-08');
      await reloadSavedPage(page);
      await expect(page.locator('.row-date')).toHaveAttribute('datetime', /^2026-03-08/);
    });
  });
}

for (const theme of ['dark', 'light']) {
  test(`narrow calendar keeps a visible footer, aligned cells and readable selection in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
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
    await page.locator('.task-title').first().click();
    await page.locator('.td-date-button').click();
    const panel = page.locator('.date-picker-panel');
    const footer = panel.locator('.date-picker-footer');
    const before = await footer.boundingBox();
    await panel.locator('.date-picker-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await footer.boundingBox()).toEqual(before);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
    const selected = panel
      .locator('.date-calendar')
      .first()
      .locator('[data-selected="true"] button');
    expect((await appearance(selected)).contrast).toBeGreaterThanOrEqual(4.5);
    await panel.locator('.date-picker-body').evaluate((el) => (el.scrollTop = 0));
    await expect(selected).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.task-detail')).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

for (const language of ['ko', 'en']) {
  for (const theme of ['dark', 'light']) {
    test(`picker text axes, hover padding and action language agree in ${language}/${theme}`, async ({
      page,
    }) => {
      await page.goto('/');
      const en = language === 'en';
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: en ? 'Appearance' : '화면', exact: true })
        .click();
      await page
        .getByRole('radio', {
          name: en ? (theme === 'dark' ? 'Dark' : 'Light') : theme === 'dark' ? '다크' : '라이트',
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: en ? 'Back' : '돌아가기', exact: true }).click();
      await page.locator('.quick-date-trigger').click();
      await setPickerTime(page, '09:30');
      const rows = await page
        .locator('.date-schedule-properties .date-property-trigger')
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            const icons = el.querySelectorAll(':scope > svg');
            const left = icons[0].getBoundingClientRect();
            const right = icons[icons.length - 1].getBoundingClientRect();
            return {
              left: left.left - r.left,
              right: r.right - right.right,
              sizes: [left.width, left.height, right.width, right.height],
              height: r.height,
            };
          }),
        );
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.left).toBe(8);
        expect(row.right).toBe(8);
        expect(row.sizes).toEqual([16, 16, 16, 16]);
        expect(row.height).toBe(36);
      }
      await page.locator('.date-repeat-trigger').click();
      const popup = page.locator('.date-field-popover');
      await expect(popup.locator('.date-field-footer > button').last()).toHaveText(
        en ? 'Apply' : '적용',
      );
      await popup.getByLabel(en ? 'Custom repeat' : '사용자 지정 반복', { exact: true }).hover();
      const axes = await popup.evaluate((el) => {
        const title = el.querySelector('.date-field-header > strong')!.getBoundingClientRect();
        const buttons = Array.from(el.querySelectorAll('.schedule-options > button'));
        const action = el.querySelector('.date-field-footer > button')!;
        const range = document.createRange();
        range.selectNodeContents(action);
        return {
          title: title.x,
          options: buttons.map((button) => ({
            x: button.querySelector('span')!.getBoundingClientRect().x,
            height: button.getBoundingClientRect().height,
            radius: getComputedStyle(button).borderRadius,
          })),
          action: range.getBoundingClientRect().x,
          actionBox: action.getBoundingClientRect().x,
          padding: parseFloat(getComputedStyle(action).paddingLeft),
          border: parseFloat(getComputedStyle(action).borderLeftWidth),
        };
      });
      expect(axes.actionBox).toBe(axes.title);
      expect(axes.padding).toBeGreaterThanOrEqual(8);
      expect(axes.action - axes.actionBox).toBe(axes.padding + axes.border);
      for (const option of axes.options) {
        expect(option.x).toBe(axes.title);
        expect(option.height).toBe(36);
        expect(option.radius).toBe(axes.options[0].radius);
      }
      await popup.getByLabel(en ? 'Custom repeat' : '사용자 지정 반복', { exact: true }).click();
      await expect(popup.locator('.repeat-frequencies > legend')).toBeVisible();
      // Expansion can reposition the popup; compare gutters in the same layout state.
      const customAxes = await popup.evaluate((el) => ({
        title: el.querySelector('.date-field-header > strong')!.getBoundingClientRect().x,
        legend: el.querySelector('.repeat-frequencies > legend')!.getBoundingClientRect().x,
        field: Array.from(el.querySelectorAll('.repeat-custom-fields > .schedule-field'))
          .at(-1)!
          .querySelector(':scope > span')!
          .getBoundingClientRect().x,
      }));
      expect(customAxes.legend).toBe(customAxes.title);
      expect(customAxes.field).toBe(customAxes.title);
      if (en) {
        expect(await popup.innerText()).not.toMatch(/[가-힣]/);
      }
    });
  }
}

for (const kind of ['capture', 'detail']) {
  test(`${kind} preserves its date while anchored choices switch and dismiss independently`, async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    if (kind === 'capture') {
      await page.locator('.quick-date-trigger').click();
    } else {
      await page.locator('.task-title').first().click();
      await page.locator('.td-date-button').click();
    }
    await selectCalendarDate(page, '2032-02-29');
    const parent = page.locator('.date-picker-panel');
    await page.locator('.date-time-trigger').scrollIntoViewIfNeeded();
    const before = await parent.boundingBox();
    await page.locator('.date-time-trigger').press('ArrowDown');
    const child = page.locator('.date-field-popover');
    await expect(child).toHaveAttribute('aria-label', 'Time');
    await expect(page.getByRole('combobox', { name: 'Task time', exact: true })).toBeFocused();
    expect(await parent.boundingBox()).toEqual(before);
    const rootBox = (await parent.boundingBox())!;
    const childBox = (await child.boundingBox())!;
    expect(
      Math.max(childBox.x - rootBox.x - rootBox.width, rootBox.x - childBox.x - childBox.width),
    ).toBe(8);
    await page.getByRole('combobox', { name: 'Task time', exact: true }).fill('18:17');
    await page.locator('.date-duration-trigger').click();
    await expect(child).toHaveAttribute('aria-label', 'Duration');
    await expect(page.locator('.date-time-trigger')).toHaveAttribute('aria-expanded', 'false');
    await child.getByRole('button', { name: '45m', exact: true }).click();
    await expect(child).toHaveCount(0);
    await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '45');
    await expect(page.locator('.date-duration-trigger')).toBeFocused();
    await page.locator('.date-time-trigger').click();
    await page.getByRole('option', { name: '09:30', exact: true }).click();
    await expect(child).toHaveCount(0);
    await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:30');
    await page.locator('.date-time-trigger').click();
    await page.keyboard.press('Escape');
    await expect(child).toHaveCount(0);
    await expect(parent).toBeVisible();
    await expect(parent.locator('[data-selected="true"] button')).toHaveAttribute(
      'data-date',
      '2032-02-29',
    );
    await page.locator('.date-duration-trigger').click();
    await parent.locator('button[data-date="2032-02-15"]:not([data-outside])').click();
    await expect(child).toHaveCount(0);
    await expect(parent.locator('[data-selected="true"] button')).toHaveAttribute(
      'data-date',
      '2032-02-15',
    );
    await page.locator('.date-time-trigger').click();
    await child.getByRole('button', { name: 'Complete', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(child).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.date-time-trigger')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.date-duration-trigger')).toBeFocused();
    await expect(parent).toBeVisible();
    await expect(child).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(parent).toHaveCount(0);
  });
}

for (const height of [480, 300]) {
  test.describe(() => {
    test.use({ hasTouch: true, viewport: { width: 320, height } });

    test(`touch property choices fit ${height}px without enlarging the date panel`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.locator('.rillday-app').waitFor();
      const baseline = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.locator('.quick-date-trigger').click();
      const parent = page.locator('.date-picker-panel');
      for (const kind of ['time', 'duration', 'repeat']) {
        await page.locator(`.date-${kind}-trigger`).click();
        const child = page.locator('.date-field-popover');
        if (kind === 'repeat') {
          await page.getByLabel('Custom repeat', { exact: true }).click();
          await page.getByLabel('Repeat end date', { exact: true }).click();
        }
        const b = (await child.boundingBox())!;
        const footer = (await child.locator('.date-field-footer').boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(8);
        expect(b.y).toBeGreaterThanOrEqual(8);
        expect(b.y + b.height).toBeLessThanOrEqual(height - 8);
        expect(footer.y + footer.height).toBeLessThanOrEqual(b.y + b.height);
        const hit = await child.locator('.date-field-header > button').evaluate((el) => {
          const b = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
        });
        expect(hit).toBe(true);
        await page.keyboard.press('Escape');
        await expect(child).toHaveCount(0);
        await expect(parent).toBeVisible();
        await expect(page.locator(`.date-${kind}-trigger`)).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(baseline);
      }
    });
  });
}
