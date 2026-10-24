import { type Page, expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';
import { setPickerTime } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

const field = (page: Page) => page.getByRole('combobox', { name: /^(할 일 시간|Task time)$/ });

async function openCapture(page: Page) {
  await page.locator('.quick-date-trigger').click();
  await page.locator('.date-time-trigger').click();
}

test('time suggestions and minute-precision entry share capture/detail state and persist', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Time picker review');
  const height = (await page.locator('.quick-add').boundingBox())!.height;
  await openCapture(page);
  await page.getByRole('option', { name: '09:30', exact: true }).click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:30');
  await setPickerTime(page, '21:17');
  await page
    .locator('.date-picker-footer')
    .getByRole('button', { name: 'Complete', exact: true })
    .click();
  expect((await page.locator('.quick-add').boundingBox())!.height).toBe(height);
  await page.locator('#quick-add-input').press('Enter');
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '21:17');
  await page.locator('.date-time-trigger').click();
  await expect(field(page)).toHaveValue('21:17');
  await page.getByRole('option', { name: '21:17', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.time).toBe('21:17');
  await reloadSavedPage(page);
  await page.locator('.task-title').click();
  await page.locator('.td-date-button').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '21:17');
});

test('invalid time cannot overwrite data; Back, outside and Escape discard only uncommitted input', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Time validation tomorrow 09:30');
  await openCapture(page);
  for (const text of ['24:00', '09:60', '13pm', 'not a time']) {
    await field(page).fill(text);
    await page
      .locator('.date-field-footer')
      .getByRole('button', { name: 'Complete', exact: true })
      .click();
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveText('Enter a valid time.');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-picker-panel')).toBeVisible();
  await expect(page.locator('.date-time-trigger')).toBeFocused();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:30');
  await page.locator('.date-time-trigger').click();
  await field(page).fill('18:17');
  await page.getByRole('button', { name: 'Close picker', exact: true }).click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:30');
  await page.locator('.date-time-trigger').click();
  await field(page).fill('18:17');
  await page.locator('.workspace-header').click();
  await expect(page.locator('.date-picker-panel')).toHaveCount(0);
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:30');
});

test('keyboard suggestions scroll into view, IME is preserved, and clearing time keeps its date', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Keyboard time tomorrow');
  await openCapture(page);
  await field(page).fill('09:00');
  const list = page.getByRole('listbox', { name: 'Choose time', exact: true });
  const initialScroll = await list.evaluate((element) => element.scrollTop);
  for (let index = 0; index < 11; index++) {
    await field(page).press('ArrowDown');
  }
  const active = await field(page).getAttribute('aria-activedescendant');
  const option = page.locator(`[id="${active}"]`);
  await expect(option).toHaveText('05:00');
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScroll);
  const optionBox = (await option.boundingBox())!;
  const listBox = (await list.boundingBox())!;
  expect(optionBox.y).toBeGreaterThanOrEqual(listBox.y);
  expect(optionBox.y + optionBox.height).toBeLessThanOrEqual(listBox.y + listBox.height);
  await field(page).dispatchEvent('compositionstart', { data: '한' });
  await field(page).dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
  await expect(field(page)).toBeVisible();
  await field(page).dispatchEvent('compositionend', { data: '한' });
  await field(page).press('Enter');
  await expect(page.locator('.date-time-trigger')).toBeFocused();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '05:00');
  await page.locator('.date-time-trigger').click();
  await page.getByRole('button', { name: 'Clear time', exact: true }).click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.quick-date-trigger')).toHaveAttribute('aria-description', 'Tomorrow');
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.row-date')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
});

for (const language of ['ko', 'en']) {
  test(`12-hour noon/midnight and exact 24-hour entry round-trip in ${language}`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
    const en = language === 'en';
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: en ? 'Calendar' : '캘린더', exact: true })
      .click();
    await chooseChoice(
      page,
      page.getByLabel(en ? 'Time format' : '시간 형식', { exact: true }),
      '12h',
    );
    await page.getByRole('button', { name: en ? 'Back' : '돌아가기', exact: true }).click();
    await openCapture(page);
    for (const [text, value] of [
      [en ? '12:00 AM' : '오전 12:00', '00:00'],
      [en ? '12:00 PM' : '오후 12:00', '12:00'],
      ['23:59', '23:59'],
    ]) {
      await field(page).fill(text);
      await field(page).press('Enter');
      await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', value);
      await page.locator('.date-time-trigger').click();
      await expect(field(page)).not.toHaveValue('');
    }
    await page.keyboard.press('Escape');
    await page
      .locator('.date-picker-footer')
      .getByRole('button', { name: en ? 'Complete' : '완료', exact: true })
      .click();
    await page.locator('#quick-add-input').fill('Midnight test');
    await page.locator('#quick-add-input').press('Enter');
    await expect(page.locator('.row-date')).toHaveAttribute('datetime', /T23:59$/);
  });
}

test('manual capture time overrides NLP, fresh typed time restores recognition, and scoped drafts reset after creation', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Manual time tomorrow 15:00');
  await page.locator('.quick-date-trigger').click();
  await setPickerTime(page, '09:17');
  await page.keyboard.press('Escape');
  await page.locator('.smart-lists > button').nth(2).click();
  await page.locator('.smart-lists > button').first().click();
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '09:17');
  await page.keyboard.press('Escape');
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.row-date')).toHaveAttribute('datetime', /T09:17$/);
  await page.locator('#quick-add-input').fill('New time tomorrow 15:00');
  await page.locator('.quick-date-trigger').click();
  await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '15:00');
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await page.locator('#quick-add-input').fill('New time tomorrow 16:00');
  await expect(page.locator('.quick-date-trigger')).toHaveAttribute('aria-description', /16:00/);
});

for (const theme of ['dark', 'light']) {
  test(`time view preserves narrow spacing and footer while list scrolls in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
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
    await openCapture(page);
    const panel = page.locator('.date-picker-panel');
    const footer = panel.locator('.date-picker-footer');
    const before = await footer.boundingBox();
    await page
      .locator('.date-field-popover .time-picker-list')
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await footer.boundingBox()).toEqual(before);
    await page.getByRole('option', { name: '23:30', exact: true }).click();
    await expect(page.locator('.date-time-trigger')).toHaveAttribute('data-time', '23:30');
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

test.describe(() => {
  test.use({ viewport: { width: 320, height: 480 }, hasTouch: true });

  test('returning from time selection reveals the entire focused action on a small touch viewport', async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.locator('.task-title').first().click();
    await page.locator('.td-date-button').click();
    await page.locator('.date-time-trigger').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.date-time-trigger')).toBeFocused();
    const visible = await page.locator('.date-time-trigger').evaluate((el) => {
      const b = el.getBoundingClientRect();
      const body = el.closest('.date-picker-body')!.getBoundingClientRect();
      return b.top >= body.top && b.bottom <= body.bottom;
    });
    expect(visible).toBe(true);
  });
});
