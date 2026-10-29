import { type Locator, type Page, expect, test } from '@playwright/test';
import { appearance } from '../support/appearance';
import { chooseChoice } from '../support/choice';
import { storedWorkspace } from '../support/storage';
import { archiveFixture } from '../support/workspace-archive';

async function fits(page: Page, surface: Locator) {
  await surface.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  const box = (await surface.boundingBox())!;
  const viewport = page.viewportSize()!;
  const inset = (await surface.getAttribute('role')) === 'menu' ? 5 : 8;
  expect(box.x).toBeGreaterThanOrEqual(inset);
  expect(box.y).toBeGreaterThanOrEqual(inset);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - inset);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - inset);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
}

test('shared dialogs focus fields, keep blank-space clicks open and restore their trigger on Escape', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const row = page.locator('.sidebar-list').filter({ hasText: 'Work and projects' });
  await row.hover();
  const opener = row.locator('.entity-edit');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Edit list', exact: true });
  await expect(page.getByLabel('List name', { exact: true })).toBeFocused();
  await page
    .getByLabel('List name', { exact: true })
    .dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true });
  await expect(dialog).toBeVisible();
  await dialog.locator('.modal-body').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 10, y: 10 } });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('long habit editors use the same modal, trap focus and keep actions visible above scrolling content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/?demo=1');
  await page.getByLabel('Habit tracker', { exact: true }).click();
  const opener = page.getByRole('button', { name: 'Add habit', exact: true });
  await opener.click();
  await page.getByRole('button', { name: 'Create your own', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New habit', exact: true });
  await fits(page, dialog);
  expect(
    await dialog.locator('.modal-body').evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(false);
  await expect(page.getByLabel('Habit name', { exact: true })).toBeFocused();
  await page.getByRole('radio', { name: 'Track amount', exact: true }).click();
  const before = await dialog.locator('.modal-footer').boundingBox();
  await dialog.locator('.modal-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await dialog.locator('.modal-footer').boundingBox()).toEqual(before);
  expect(
    await dialog
      .locator('.modal-body')
      .evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0),
  ).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Close', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('modal captions activate their own control without extending over blank field space', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.sidebar-list').filter({ hasText: 'Work and projects' }).hover();
  await page.getByLabel('Edit Work and projects list', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['List name']) {
    const input = dialog.getByLabel(name, { exact: true });
    const field = input.locator('xpath=..');
    const caption = field.locator('label');
    await input.evaluate((el) => {
      el.dataset.clicks = '0';
      el.addEventListener('click', () => {
        el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
      });
    });
    const bounds = (await field.boundingBox())!;
    const labelBounds = (await caption.boundingBox())!;
    await dialog.getByLabel('Close', { exact: true }).focus();
    await page.mouse.click(bounds.x + bounds.width - 4, labelBounds.y + labelBounds.height / 2);
    await page.mouse.click(bounds.x + 4, labelBounds.y + labelBounds.height + 4);
    expect(await input.getAttribute('data-clicks')).toBe('0');
    await expect(input).not.toBeFocused();
    await caption.click();
    expect(await input.getAttribute('data-clicks')).toBe('1');
    await expect(input).toBeFocused();
    if (name === 'List name') {
      await input.fill('New name');
      await expect(input).toHaveValue('New name');
    }
  }
  const picker = dialog.getByRole('button', { name: 'List color', exact: true });
  const bounds = (await picker.locator('xpath=..').boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width - 4, bounds.y + 4);
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByLabel('List name', { exact: true })).not.toBeFocused();
  await page.keyboard.press('Escape');
});

test('detail deletion uses the shared confirmation and cancellation returns to its action trigger', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.smart-lists > button').nth(5).click();
  await page.locator('.task-title').first().click();
  const trigger = page.getByLabel('Task actions menu', { exact: true });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Delete permanently…', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete permanently', exact: true });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.task-title')).toHaveCount(1);
});

test('habit menus share keyboard navigation and cancellation never deletes a habit or its records', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Habit tracker', { exact: true }).click();
  const before = await storedWorkspace(page);
  const count = await page.locator('.habit-row').count();
  const row = page.locator('.habit-row').first();
  await row.hover();
  const trigger = row.locator('.row-menu-trigger');
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog', { name: 'Delete habit', exact: true });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(confirm).toHaveAttribute('aria-describedby', /.+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.habit-row')).toHaveCount(count);
  await expect(trigger).toBeFocused();
  const after = await storedWorkspace(page);
  expect(after.habits).toEqual(before.habits);
  expect(after.habitLogs).toEqual(before.habitLogs);
});

test('menus and form popovers share collision bounds and Escape while retaining their distinct Tab behavior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/?demo=1');
  const sort = page.getByRole('button', { name: 'Sort', exact: true });
  const group = page.getByRole('button', { name: 'Group', exact: true });
  await sort.focus();
  await sort.press('ArrowDown');
  await page.keyboard.press('End');
  await fits(page, page.getByRole('menu'));
  await expect(page.getByRole('menuitemradio').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(group).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('.task-title').first().click();
  for (const selector of [
    '.td-date-button',
    '[aria-label="Set priority"]',
    '[aria-label="Add labels"]',
    '.td-list-button',
  ]) {
    const trigger = page.locator('.task-detail').locator(selector);
    await trigger.click();
    const popup = page.locator('.td-popover,.td-date-panel');
    await fits(page, popup);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('.task-detail')).toBeVisible();
  }
  await page.getByLabel('Add labels', { exact: true }).click();
  await page.getByLabel('Labels to add', { exact: true }).press('Shift+Tab');
  await expect(page.locator('.td-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Add labels', { exact: true })).toBeFocused();
  await expect(page.locator('.td-popover')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`overlay surfaces and readable primary/secondary actions stay coherent in ${theme}`, async ({
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
    const row = page.locator('.sidebar-list').filter({ hasText: 'Work and projects' });
    await row.hover();
    await row.locator('.entity-edit').click();
    const modal = page.getByRole('dialog', { name: 'Edit list', exact: true });
    const save = modal.getByRole('button', { name: 'Save', exact: true });
    const remove = modal.getByRole('button', { name: 'Delete list', exact: true });
    const skin = await modal.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        ring: style.getPropertyValue('--tw-ring-color'),
      };
    });
    const buttons = await save.boundingBox();
    const deleteBox = await remove.boundingBox();
    expect(buttons!.width).toBeGreaterThanOrEqual(72);
    expect(deleteBox!.x + deleteBox!.width + 8).toBeLessThanOrEqual(buttons!.x);
    for (const button of [save, remove]) {
      expect((await appearance(button)).contrast).toBeGreaterThanOrEqual(4.5);
      await button.hover();
      expect((await appearance(button)).contrast).toBeGreaterThanOrEqual(4.5);
      await button.focus();
      expect((await appearance(button)).contrast).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      await save.evaluate((el) => {
        const context = document.createElement('canvas').getContext('2d')!;
        context.fillStyle = getComputedStyle(el).getPropertyValue('--button-primary-foreground');
        return context.fillStyle;
      }),
    ).toBe('#ffffff');
    expect((await appearance(save)).color).toBe('rgb(255, 255, 255)');
    await page.keyboard.press('Escape');
    await page.getByLabel('Sort', { exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu');
    expect(
      await menu.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          ring: style.getPropertyValue('--tw-ring-color'),
        };
      }),
    ).toEqual(skin);
    const focusedOption = page.getByRole('menuitemradio').first();
    await expect(focusedOption).toBeFocused();
    expect(await focusedOption.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      skin.background,
    );
    await page.keyboard.press('Escape');
    await page.getByLabel('Habit tracker', { exact: true }).click();
    await page.getByRole('button', { name: 'Add habit', exact: true }).click();
    await page.getByRole('button', { name: 'Create your own', exact: true }).click();
    const disabled = page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true });
    await expect(disabled).toBeDisabled();
    const disabledFill = await disabled.evaluate((el) => getComputedStyle(el).backgroundColor);
    const disabledBox = (await disabled.boundingBox())!;
    await page.mouse.move(
      disabledBox.x + disabledBox.width / 2,
      disabledBox.y + disabledBox.height / 2,
    );
    await expect(disabled).toHaveCSS('background-color', disabledFill);
    await page.keyboard.press('Escape');
    const habit = page.locator('.habit-row').first();
    await habit.hover();
    await habit.locator('.row-menu-trigger').click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const confirm = page.getByRole('dialog');
    const destructive = confirm.getByRole('button', { name: 'Delete', exact: true });
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    for (const state of ['rest', 'hover']) {
      if (state === 'hover') {
        await destructive.hover();
      }
      expect((await appearance(destructive)).contrast).toBeGreaterThanOrEqual(4.5);
    }
    await expect(destructive).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.keyboard.press('Escape');
  });
}

test('context menus open from the keyboard, support typeahead and activate one task action', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await chooseChoice(page, page.getByRole('combobox', { name: 'Language', exact: true }), 'en');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('#quick-add-input').fill('Keyboard context');
  await page.locator('#quick-add-input').press('Enter');
  const row = page.locator('.task-row').first();
  await row.focus();
  await row.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('d');
  await expect(menu.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.task-row')).toHaveCount(2);
  await row.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});

test('narrow habit Sheets keep their editor dialog and calendar in separate focus and Escape layers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Habit tracker', exact: true }).click();
  await page.locator('.habit-name').first().click();
  const sheet = page.locator('.habit-detail');
  const edit = sheet.getByRole('button', { name: 'Edit habit', exact: true });
  await expect(edit).toBeFocused();
  await edit.click();
  const editor = page.locator('.habit-editor');
  await expect(page.getByLabel('Habit name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(edit).toBeFocused();
  await sheet.locator('.habit-date-button').click();
  await page.getByRole('button', { name: 'Choose month and year', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendar-period-chooser')).toHaveCount(0);
  await expect(page.locator('.habit-date-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.habit-date-panel')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.habit-name').first()).toBeFocused();
});

test('portalled color controls keep localized slider names and ignore composing Escape before closing one layer', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const list = page.locator('.sidebar-list').first();
  await list.hover();
  await list.locator('.entity-edit').click();
  const dialog = page.getByRole('dialog', { name: 'Edit list', exact: true });
  const trigger = dialog.getByRole('button', { name: 'List color', exact: true });
  await trigger.click();
  await page.getByRole('button', { name: 'Custom color', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Hue', exact: true })).toBeVisible();
  const hex = page.getByRole('textbox', { name: 'HEX color', exact: true });
  expect((await page.locator('.color-picker-back').boundingBox())!.height).toBe(32);
  expect((await hex.boundingBox())!.height).toBe(36);
  await hex.focus();
  await hex.dispatchEvent('keydown', { key: 'Escape', keyCode: 229, isComposing: true });
  await expect(page.locator('.color-picker-panel')).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.color-picker-panel')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(list.locator('.entity-edit')).toBeFocused();
});

test('editing dialogs keep their draft and focus when global capture is requested, then release capture after closing', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const list = page.locator('.sidebar-list').first();
  await list.hover();
  await list.locator('.entity-edit').click();
  await page.getByLabel('List name', { exact: true }).fill('Discard this dialog draft');
  await page.keyboard.press('Control+n');
  await expect(page.locator('.modal')).toBeVisible();
  await expect(page.getByLabel('List name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('List name', { exact: true })).toHaveValue(
    'Discard this dialog draft',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+n');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('#quick-add-input')).toBeFocused();
  await expect(page.locator('.workspace-header h1')).toHaveText('Inbox');
  await expect(page.locator('.sidebar-list').first()).toContainText('Work and projects');
  await page.locator('#quick-add-input').fill('Capture after dialog');
  await page.locator('#quick-add-input').press('Enter');
  await expect(
    page.locator('.task-title').filter({ hasText: 'Capture after dialog' }),
  ).toBeVisible();
});

test('property popovers choose an axis that fits intermediate widths and viewport changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 });
  await page.goto('/?demo=1');
  await page.locator('.quick-date-trigger').click();
  const parent = page.locator('.date-picker-panel');
  await page.locator('.date-time-trigger').click();
  const child = page.locator('.date-field-popover');
  for (const width of [900, 760, 720, 700, 680, 632]) {
    await page.setViewportSize({ width, height: 480 });
    await expect
      .poll(async () => {
        const b = (await child.boundingBox())!;
        return b.x >= 7.5 && b.x + b.width <= width - 7.5 && b.y >= 7.5 && b.y + b.height <= 472.5;
      })
      .toBe(true);
    const b = (await child.boundingBox())!;
    const f = (await child.locator('.date-field-footer').boundingBox())!;
    expect(f.y + f.height).toBeLessThanOrEqual(b.y + b.height);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-time-trigger')).toBeFocused();
  await expect(parent).toBeVisible();
});

test('a search dialog owns focus above floating choices and restores the underlying editor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 640 });
  await page.goto('/?demo=1');
  await page.locator('.quick-date-trigger').click();
  await page.locator('.date-time-trigger').click();
  const input = page.getByRole('combobox', { name: 'Task time', exact: true });
  await input.fill('09:17');
  await page.keyboard.press('Control+k');
  const search = page.locator('.global-search input');
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
    }),
  ).toBe(true);
  await expect(page.locator('.date-picker-panel')).toHaveCount(1);
  await expect(page.locator('.date-field-popover')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.global-search')).toHaveCount(0);
  await expect(input).toBeFocused();
});

for (const language of ['ko', 'en']) {
  for (const theme of ['dark', 'light']) {
    test(`editor overlays share the theme and dismiss before task details in ${language}/${theme}`, async ({
      page,
    }) => {
      const en = language === 'en';

      const text = (ko: string, english: string) => (en ? english : ko);

      await page.goto('/');
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: text('화면', 'Appearance'), exact: true })
        .click();
      await page
        .getByRole('radio', {
          name: text(theme === 'dark' ? '다크' : '라이트', theme === 'dark' ? 'Dark' : 'Light'),
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: text('돌아가기', 'Back'), exact: true }).click();
      await page.locator('#quick-add-input').fill('Overlay audit');
      await page.locator('#quick-add-input').press('Enter');

      const read = () => storedWorkspace(page);

      await expect.poll(async () => (await read()).tasks.length).toBe(1);
      const data = await read();
      const source =
        '| Item | State |\n| --- | --- |\n| One | Done |\n\n```js\nconst sample = 1;\n```';
      data.tasks[0].notes = source;
      await page.getByLabel(text('설정과 백업', 'Settings and backup'), { exact: true }).click();
      await page.locator('input[type=file]').setInputFiles({
        name: 'overlay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(await archiveFixture(data, 'Asia/Seoul')),
      });
      await page
        .getByRole('dialog')
        .getByRole('button', { name: text('가져오기', 'Import'), exact: true })
        .click();
      await page.getByRole('button', { name: text('정렬', 'Sort'), exact: true }).click();
      const skin = await page.getByRole('menu').evaluate((el) => {
        const s = getComputedStyle(el);
        return [
          s.backgroundColor,
          s.borderWidth,
          s.getPropertyValue('--tw-ring-color'),
          s.borderRadius,
          s.boxShadow,
        ];
      });
      await page.keyboard.press('Escape');
      await page.locator('.task-title').click();
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 700 });
        for (const title of [
          text('열 메뉴', 'Column menu'),
          text('행 메뉴', 'Row menu'),
          text('코드 블록 언어', 'Select code block language'),
        ]) {
          const trigger =
            title === text('코드 블록 언어', 'Select code block language')
              ? page.getByRole('combobox', { name: text('언어', 'Language'), exact: true })
              : page.getByTitle(title, { exact: true }).first();
          await trigger.click();
          const popup = page.locator('.td-markdown [role="dialog"],.td-markdown [role="listbox"]');
          await expect(popup).toBeVisible();
          expect(
            await popup.evaluate((el) => {
              const s = getComputedStyle(el);
              return [
                s.backgroundColor,
                s.borderWidth,
                s.getPropertyValue('--tw-ring-color'),
                s.borderRadius,
                s.boxShadow,
              ];
            }),
          ).toEqual(skin);
          const b = (await popup.boundingBox())!;
          expect(b.x).toBeGreaterThanOrEqual(8);
          expect(b.x + b.width).toBeLessThanOrEqual(width - 8);
          if ((await popup.getAttribute('role')) === 'dialog') {
            for (const size of await popup
              .locator('button')
              .evaluateAll((els) =>
                els.map((el) => [
                  el.getBoundingClientRect().width,
                  el.getBoundingClientRect().height,
                ]),
              )) {
              expect(size).toEqual([32, 32]);
            }
          }
          await page.keyboard.press('Escape');
          await expect(popup).toHaveCount(0);
          await expect(page.locator('.task-detail')).toBeVisible();
          await expect(trigger).toBeFocused();
        }
      }
      expect((await read()).tasks[0].notes).toBe(source);
      await page
        .getByRole('button', { name: text('할 일 작업 메뉴', 'Task actions menu'), exact: true })
        .focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('.task-detail')).toHaveCount(0);
    });
  }
}

test('suggestions and detail choices retain equal insets and localized custom-color announcements', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('#quick-add-input').fill('Audit #');
  const option = page.getByRole('option').first();

  const measure = () =>
    option.evaluate((el) => {
      const s = getComputedStyle(el);
      return [el.getBoundingClientRect().height, s.paddingLeft, s.paddingRight];
    });

  expect(await measure()).toEqual([32, '8px', '8px']);
  await page.keyboard.press('Escape');
  await page.locator('#quick-add-input').fill('');
  await page.locator('.task-title').first().click();
  await page.getByRole('button', { name: 'Add labels', exact: true }).click();
  const choice = page.locator('.td-tags-popover .td-menu-item').first();
  expect(
    await choice.evaluate((el) => {
      const s = getComputedStyle(el);
      return [el.getBoundingClientRect().height, s.paddingLeft, s.paddingRight];
    }),
  ).toEqual([32, '8px', '8px']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close task details', exact: true }).click();
  const row = page.locator('.sidebar-list').filter({ hasText: 'Work and projects' });
  await row.hover();
  await row.locator('.entity-edit').click();
  await page.getByRole('button', { name: 'List color', exact: true }).click();
  await page.getByRole('button', { name: 'Custom color', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Hue', exact: true })).toBeVisible();
  const area = page.getByRole('slider', { name: /^Saturation and brightness/ }).first();
  await area.focus();
  await area.press('ArrowDown');
  await expect(area).toHaveAttribute('aria-valuetext', /^Saturation:? \d+%/);
});
