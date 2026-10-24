import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { appearance } from '../support/appearance';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { storedPreferences } from '../support/storage';

test('Settings choices commit only on activation, retain keyboard focus through translation and persist typed values', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  const language = page.getByRole('combobox', { name: /^(언어|Language)$/ });
  const caption = page.locator('.settings-row > div > label').first();
  const labelBox = (await caption.boundingBox())!;
  await page.mouse.click(labelBox.x + labelBox.width + 16, labelBox.y + labelBox.height / 2);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(language).toHaveAccessibleDescription(
    'Menus and date labels update immediately. Your own content stays the same.',
  );
  await caption.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await chooseChoice(page, language, 'ko');
  await language.focus();
  await language.press('Enter');
  await expect(page.getByRole('option', { name: '한국어', exact: true })).toBeFocused();
  const before = await storedPreferences(page);
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  expect(await storedPreferences(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await expect(language).toHaveAttribute('data-value', 'ko');
  await language.press('ArrowUp');
  await expect(page.getByRole('option', { name: '한국어', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(language).toBeFocused();
  await language.press('Space');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const startup = page.getByRole('combobox', { name: 'Startup view', exact: true });
  await expect(startup).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await startup.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Tasks', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'Habit', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: 'Tasks', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Eisenhower Matrix', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(startup.locator('[data-slot="select-value"]')).toHaveText('Eisenhower Matrix');
  await expect(startup).toBeFocused();
  await startup.click();
  await expect(page.getByRole('option', { name: 'Eisenhower Matrix', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(startup).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(language).toBeFocused();
  const languageBox = (await language.boundingBox())!;
  await startup.click();
  await expect(page.getByRole('option', { name: 'Eisenhower Matrix', exact: true })).toBeFocused();
  await page.mouse.click(languageBox.x + 10, languageBox.y + 10);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await language.click();
  await expect(page.getByRole('listbox')).toHaveCount(1);
  await expect(page.getByRole('listbox')).toHaveAccessibleName('Language');
  await page.keyboard.press('Escape');
  await page.locator('.settings-nav nav > button').nth(1).click();
  await chooseChoice(page, page.getByRole('combobox', { name: 'Density', exact: true }), 'compact');
  await page.locator('.settings-nav nav > button').nth(3).click();
  await chooseChoice(page, page.getByRole('combobox', { name: 'Start week on', exact: true }), 1);
  await chooseChoice(page, page.getByRole('combobox', { name: 'Time format', exact: true }), '12h');
  await expect
    .poll(async () => {
      const p = await storedPreferences(page);
      return [p.language, p.startupView, p.density, p.weekStartsOn, p.timeFormat];
    })
    .toEqual(['en', 'matrix', 'compact', 1, '12h']);
  await page.reload();
  await expect(page.locator('.workspace-header h1')).toHaveText('Eisenhower Matrix');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await expect(startup).toHaveAttribute('data-value', 'matrix');
  await expect(language.locator('[data-slot="select-value"]')).toHaveText('English');
  await page.locator('.settings-nav nav > button').nth(1).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Density', exact: true })
      .locator('[data-slot="select-value"]'),
  ).toHaveText('Compact');
  await page.keyboard.press('Escape');
  await expect(page.locator('.settings-page')).toHaveCount(0);
});

test('language choices support typeahead and explicit keyboard activation', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'ko');
  const language = page.getByRole('combobox', { name: /^(언어|Language)$/ });
  await language.focus();
  await language.press('e');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await language.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  const korean = page.getByRole('option', { name: '한국어', exact: true });
  await expect(korean).toBeFocused();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('e');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await language.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(korean).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
});

for (const lang of ['ko', 'en']) {
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 1024, 900, 760, 600, 390, 320]) {
      test(`Settings navigation, form geometry and choice menus agree in ${lang}/${theme}/${width}`, async ({
        page,
      }) => {
        const en = lang === 'en';

        const text = (ko: string, english: string) => (en ? english : ko);

        await page.goto('/?demo=1');
        await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
        await chooseChoice(
          page,
          page.getByRole('combobox', { name: 'Language', exact: true }),
          lang,
        );
        await page.locator('.settings-nav nav > button').nth(1).click();
        await page
          .getByRole('radio', {
            name: text(theme === 'dark' ? '다크' : '라이트', theme === 'dark' ? 'Dark' : 'Light'),
            exact: true,
          })
          .click();
        await page.getByRole('button', { name: text('돌아가기', 'Back'), exact: true }).click();
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
        await page
          .getByRole('button', { name: text('설정과 백업', 'Settings and backup'), exact: true })
          .click();
        await expect(page.locator('.workspace-sidebar-toggle')).toHaveCount(0);

        await page.setViewportSize({ width, height: 480 });

        for (const [section, names] of [
          [text('언어', 'Language'), text('시작 화면', 'Startup view')],
          [text('화면 밀도', 'Density')],
          [],
          [text('주 시작 요일', 'Start week on'), text('시간 형식', 'Time format')],
          [],
          [],
          [],
        ].entries()) {
          await page.locator('.settings-nav nav > button').nth(section).click();
          const geometry = await page.evaluate(() => {
            const nav = document.querySelector('.settings-nav')!;
            const content = document.querySelector('.settings-content')!;
            const heading = document.querySelector('.settings-header')!;

            const box = (element: Element) => element.getBoundingClientRect();

            const items = [...nav.querySelectorAll('nav > button')].map((element) => box(element));
            const controls = [
              ...content.querySelectorAll(
                '.settings-row > .choice-field-trigger,.settings-row > input:not([aria-hidden="true"])',
              ),
            ].map((element) => box(element));
            return {
              overflow:
                document.documentElement.scrollWidth > innerWidth ||
                document.documentElement.scrollHeight > innerHeight,
              heights: items.map((item) => item.height),
              centerError: Math.abs(
                items[0].y + items[0].height / 2 - box(heading).y - box(heading).height / 2,
              ),
              inset: box(heading).left - box(content).left,
              controls: controls.map((item) => ({
                left: item.left,
                right: item.right,
                width: item.width,
                height: item.height,
              })),
            };
          });
          expect(geometry.overflow).toBe(false);
          expect(new Set(geometry.heights)).toEqual(new Set([36]));
          expect(geometry.inset).toBe(width < 900 ? 16 : 20);
          if (width > 560) {
            expect(geometry.centerError).toBeLessThan(0.5);
          }
          if (section === 1) {
            const group = page.getByRole('radiogroup', {
              name: text('테마', 'Theme'),
              exact: true,
            });
            const bounds = (await group.boundingBox())!;
            const description = group.locator('..').locator('.settings-description');
            const descriptionBounds = (await description.boundingBox())!;
            if (width > 760) {
              expect(descriptionBounds.x + descriptionBounds.width).toBeLessThanOrEqual(bounds.x);
              expect(descriptionBounds.height).toBeLessThanOrEqual(32);
            } else {
              expect(descriptionBounds.y + descriptionBounds.height).toBeLessThanOrEqual(bounds.y);
            }
            for (const option of await group.getByRole('radio').all()) {
              const optionBounds = (await option.boundingBox())!;
              expect(optionBounds.x).toBeGreaterThanOrEqual(bounds.x);
              expect(optionBounds.x + optionBounds.width).toBeLessThanOrEqual(
                bounds.x + bounds.width,
              );
              expect(optionBounds.y + optionBounds.height).toBeLessThanOrEqual(
                bounds.y + bounds.height,
              );
            }
          }
          for (const control of geometry.controls) {
            expect(control.width).toBe(200);
            expect(control.height).toBe(36);
          }
          if (section === 0) {
            expect(geometry.controls).toHaveLength(2);
            expect(geometry.controls[0].left).toBe(geometry.controls[1].left);
            expect(geometry.controls[0].right).toBe(geometry.controls[1].right);
          }

          for (const name of names) {
            const trigger = page.getByRole('combobox', { name, exact: true });
            await trigger.scrollIntoViewIfNeeded();
            const box = (await trigger.boundingBox())!;
            expect([box.width, box.height]).toEqual([200, 36]);
            await trigger.hover();
            expect(await trigger.boundingBox()).toEqual(box);
            const state = await trigger.getAttribute('data-value');
            await trigger.click();
            const menu = page.getByRole('listbox', { name, exact: true });
            const surface = page.locator('.choice-field-panel').filter({ has: menu });
            await expect(menu.getByRole('option', { selected: true })).toBeFocused();
            const bounds = (await surface.boundingBox())!;
            expect(bounds.width).toBe(200);
            expect(bounds.x).toBeGreaterThanOrEqual(8);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
            expect(bounds.y).toBeGreaterThanOrEqual(8);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
            expect(
              await surface.evaluate((el) => {
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
            for (const option of await menu.getByRole('option').all()) {
              const before = (await option.boundingBox())!;
              expect(before.height).toBe(32);
              expect(
                await option.evaluate((el) => [
                  getComputedStyle(el).paddingLeft,
                  getComputedStyle(el).paddingRight,
                ]),
              ).toEqual(['8px', '32px']);
              await option.hover();
              expect(await option.boundingBox()).toEqual(before);
              expect((await appearance(option)).contrast).toBeGreaterThanOrEqual(4.5);
            }
            await page.keyboard.press('Escape');
            await expect(trigger).toBeFocused();
            await expect(trigger).toHaveAttribute('data-value', state!);
            expect(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth > innerWidth ||
                  document.documentElement.scrollHeight > innerHeight,
              ),
            ).toBe(false);
          }
        }

        if (width <= 560) {
          expect(
            await page
              .locator('.settings-nav nav')
              .evaluate((element) => element.scrollWidth > element.clientWidth),
          ).toBe(true);
        }
      });
    }
  }
}

test.describe(() => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 600 } });

  test('touch Selects commit Settings values and remain reachable in shared matrix and habit dialogs', async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: 'Settings and backup', exact: true }).tap();
    await page.locator('.settings-nav nav > button').nth(3).tap();
    await page.getByRole('combobox', { name: 'Start week on', exact: true }).tap();
    await page.getByRole('option', { name: 'Monday', exact: true }).tap();
    await expect(
      page.getByRole('combobox', { name: 'Start week on', exact: true }),
    ).toHaveAttribute('data-value', '1');
    await expect.poll(() => storedPreferences(page)).toMatchObject({ weekStartsOn: 1 });
    await reloadSavedPage(page);
    await page.getByRole('button', { name: 'Settings and backup', exact: true }).tap();
    await page.locator('.settings-nav nav > button').nth(3).tap();
    await expect(
      page.getByRole('combobox', { name: 'Start week on', exact: true }),
    ).toHaveAttribute('data-value', '1');
    await page.getByRole('button', { name: 'Back', exact: true }).tap();
    await page.getByRole('button', { name: 'Eisenhower Matrix', exact: true }).tap();
    await page.getByRole('button', { name: 'Matrix settings', exact: true }).tap();
    await page.getByRole('combobox', { name: 'Grouping', exact: true }).tap();
    const popup = page.getByRole('listbox', { name: 'Grouping', exact: true });
    await expect(page.locator('.modal')).toBeVisible();
    const reachable = await popup
      .getByRole('option')
      .last()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.right - 2, r.y + r.height / 2);
        return el === hit || el.contains(hit);
      });
    expect(reachable).toBe(true);
    await page.getByRole('option', { name: 'Importance + date', exact: true }).tap();
    await expect(page.getByRole('combobox', { name: 'Grouping', exact: true })).toHaveAttribute(
      'data-value',
      'complex',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Habit', exact: true }).tap();
    await page.getByRole('button', { name: 'Add habit', exact: true }).tap();
    await page.getByLabel('Habit name', { exact: true }).fill('Touch frequency');
    await page.getByRole('combobox', { name: 'Frequency', exact: true }).tap();
    await page.getByRole('option', { name: /^A number of days each week/ }).tap();
    await expect(page.getByLabel('Weekly target (days)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(page.locator('.habit-editor')).toHaveCount(0);
  });
});

test('About displays the build version from package metadata', async ({ page }) => {
  const { version } = JSON.parse(
    readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  await page.goto('/');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.locator('.settings-section')).toContainText(version);
});
