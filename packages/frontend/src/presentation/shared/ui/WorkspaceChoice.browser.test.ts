import { type Locator, expect, test } from '@playwright/test';
import { appearance } from '@repo/test-support/browser-appearance';

async function optionAppearance(option: Locator) {
  const box = (await option.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(32);
  const label = option.locator('.choice-option-label');
  const labelBox = await label.boundingBox();

  const padding = () =>
    option.evaluate((element) => [
      getComputedStyle(element).paddingLeft,
      getComputedStyle(element).paddingRight,
    ]);

  expect(await padding()).toEqual(['8px', '32px']);
  expect((await appearance(option)).contrast).toBeGreaterThanOrEqual(4.5);
  await option.hover();
  expect(await option.boundingBox()).toEqual(box);
  expect(await label.boundingBox()).toEqual(labelBox);
  expect(await padding()).toEqual(['8px', '32px']);
  expect((await appearance(option)).contrast).toBeGreaterThanOrEqual(4.5);
}

for (const theme of ['dark', 'light']) {
  for (const locale of ['en', 'ko']) {
    for (const width of [1440, 900, 320]) {
      test(`choice geometry, contrast and keyboard contract in ${locale}/${theme}/${width}`, async ({
        mount,
        page,
      }) => {
        await page.setViewportSize({ width, height: 480 });
        const component = await mount('Choices', { theme, locale });
        const name = locale === 'ko' ? '언어' : 'Language';
        const trigger = component.getByRole('combobox', { name, exact: true });
        const box = (await trigger.boundingBox())!;
        expect([box.width, box.height]).toEqual([200, 36]);
        await trigger.hover();
        expect(await trigger.boundingBox()).toEqual(box);
        await trigger.focus();
        await trigger.press('ArrowDown');
        await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
        const menu = page.getByRole('listbox', { name, exact: true });
        const surface = page.locator('.choice-field-panel').filter({ has: menu });
        const bounds = (await surface.boundingBox())!;
        expect(bounds.width).toBe(200);
        expect(bounds.x).toBeGreaterThanOrEqual(8);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
        expect(bounds.y).toBeGreaterThanOrEqual(8);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
        for (const option of await menu.getByRole('option').all()) {
          expect((await option.boundingBox())!.height).toBe(32);
          await optionAppearance(option);
        }
        const longLabel = menu.getByRole('option').last().locator('.choice-option-label');
        expect(
          await longLabel.evaluate((element) => element.scrollWidth > element.clientWidth),
        ).toBe(true);
        await expect(longLabel).toHaveCSS('text-overflow', 'ellipsis');
        await expect(longLabel).toHaveCSS('overflow-x', 'hidden');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute('data-value', 'en');
        await expect(component.getByLabel('Changes')).toHaveText('0');
        await trigger.press('ArrowDown');
        await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused();
        await page.keyboard.press('Home');
        await expect(page.getByRole('option', { name: '한국어', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute('data-value', 'ko');
        await expect(component.getByLabel('Selected value')).toHaveText('ko');
        await expect(component.getByLabel('Changes')).toHaveText('1');
      });
    }
  }
}

for (const theme of ['dark', 'light']) {
  test(`grouped choices preserve zero and numeric values and fit near the viewport edge in ${theme}`, async ({
    mount,
    page,
  }) => {
    const component = await mount('NumericChoices', { theme });
    const trigger = component.getByRole('combobox', { name: 'Frequency', exact: true });
    await expect(trigger).toHaveAttribute('data-value', '0');
    await trigger.click();
    await expect(page.getByRole('group', { name: 'Weekly', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Monthly', exact: true })).toBeVisible();
    const surface = page.locator('.choice-field-panel');
    const box = (await surface.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.y + box.height).toBeLessThanOrEqual(472);
    for (const option of await page.getByRole('option').all()) {
      await optionAppearance(option);
    }
    await page.getByRole('option', { name: /Two sessions/ }).click();
    await expect(component.getByLabel('Selected value')).toHaveText('2');
    await expect(component.getByLabel('Value kind')).toHaveText('number');
  });
}
