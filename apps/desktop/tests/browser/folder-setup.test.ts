import { expect, test } from '@playwright/test';

for (const locale of ['en-US', 'ko-KR']) {
  for (const colorScheme of ['dark', 'light'] as const) {
    test.describe(`${locale}/${colorScheme}`, () => {
      test.use({ locale, colorScheme });
      test('first-run screen follows the system language and appearance', async ({ page }) => {
        await page.goto('/tests/browser/');
        const korean = locale === 'ko-KR';
        await expect(
          page.getByRole('heading', {
            name: korean ? '자료를 보관할 위치를 선택하세요' : 'Choose where to keep your work',
          }),
        ).toBeVisible();
        await expect(page.getByLabel(korean ? '현재 자료 폴더' : 'Current data folder')).toHaveText(
          'C:\\Users\\Example\\AppData\\Local\\dev.rillday.workspace',
        );
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          colorScheme === 'dark' ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)',
        );
        await expect(
          page.getByRole('button', { name: korean ? '폴더 선택…' : 'Choose folder…', exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole('button', {
            name: korean ? 'Rillday 시작하기' : 'Open Rillday',
            exact: true,
          }),
        ).toBeEnabled();
      });
    });
  }
}
