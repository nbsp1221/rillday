import { expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';

test('Undo remains available while its notification is hovered or keyboard focused', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const capture = page.locator('#quick-add-input');
  await capture.fill('First task\nSecond task');
  await capture.press('Enter');
  const toast = page.locator('.toast');
  const undo = toast.getByRole('button', { name: 'Undo', exact: true });
  await undo.hover();
  await page.clock.fastForward(6100);
  await expect(toast).toBeVisible();
  await page.mouse.move(500, 500);
  await page.keyboard.press('F6');
  await undo.focus();
  await page.clock.fastForward(6100);
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(page.locator('.task-title')).toHaveCount(0);
  await capture.focus();
  await page.mouse.move(500, 500);
  await page.clock.fastForward(6100);
  await expect(toast).toHaveCount(0);
});

test('a replacement notification resets the six-second lifetime and dismisses independently', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const capture = page.locator('#quick-add-input');
  await capture.fill('First task\nSecond task');
  await capture.press('Enter');
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Added 2 tasks');
  await page.clock.fastForward(4000);
  await page.evaluate(() => window.dispatchEvent(new Event('rillday-close-save-error')));
  await expect(toast).toHaveCount(1);
  await expect(toast.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await page.clock.fastForward(3000);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(3100);
  await expect(toast).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('rillday-close-save-error')));
  await expect(toast).toBeVisible();
  await toast.hover();
  await toast.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator('.task-title')).toHaveCount(2);
});

for (const locale of ['en-US', 'ko-KR']) {
  test.describe(locale, () => {
    test.use({ locale });

    test('duration accepts localized grouping and preserves integer bounds and IME confirmation', async ({
      page,
    }) => {
      await page.goto('/');
      const language = locale === 'ko-KR' ? 'ko' : 'en';
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await page
        .getByRole('button', { name: language === 'ko' ? '돌아가기' : 'Back', exact: true })
        .click();
      await page.locator('.quick-date-trigger').click();
      await page.locator('.date-duration-trigger').click();
      const input = page.getByRole('textbox', {
        name: /^(Duration \(minutes\)|소요 시간 \(분\))$/,
      });
      await input.fill('1,200');
      await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
      await expect(input).toBeVisible();
      await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '30');
      await input.press('Enter');
      await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '1200');
      await page.locator('.date-duration-trigger').click();
      await input.fill('77.5');
      await input.press('Enter');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '1200');
      await input.fill('77');
      await input.press('Alt+ArrowUp');
      await input.press('Enter');
      await expect(page.locator('.date-duration-trigger')).toHaveAttribute('data-duration', '78');
    });
  });
}
