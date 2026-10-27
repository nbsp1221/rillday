import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
const require = createRequire(import.meta.url);

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`landing fits ${width}px in ${colorScheme} with real product imagery`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      const requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Your day,in a clearer light.',
      );
      await expect(page.locator('html')).toHaveClass(
        colorScheme === 'dark' ? /dark/ : /scheme-light/,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const brand = (await page
        .getByRole('link', { name: 'Rillday home', exact: true })
        .boundingBox())!;
      const navigation = (await page
        .getByRole('navigation', { name: 'Main navigation' })
        .boundingBox())!;
      expect(navigation.x - brand.x - brand.width).toBeGreaterThanOrEqual(15);
      const screenshot = page.locator('figure img:visible');
      await expect(screenshot).toHaveCount(1);
      await expect(screenshot).toHaveJSProperty('complete', true);
      expect(await screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(
        width < 640 ? 720 : 2880,
      );
      const imageBox = (await screenshot.boundingBox())!;
      expect(imageBox.y).toBeLessThan(650);
      expect(await screenshot.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain(
        width < 640 ? 'tasks-mobile-' : 'tasks-',
      );
      const actions = page.locator('#intro-title').locator('..').getByRole('link');
      for (const action of await actions.all()) {
        expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width < 640) {
        const [primary, secondary] = await actions.all();
        const primaryBox = (await primary.boundingBox())!;
        const secondaryBox = (await secondary.boundingBox())!;
        expect(primaryBox.x).toBe(secondaryBox.x);
        expect(primaryBox.width).toBe(secondaryBox.width);
      }
      if (width >= 768) {
        const setupButtons = await page.locator('#get-started article > a').all();
        const first = (await setupButtons[0].boundingBox())!;
        const second = (await setupButtons[1].boundingBox())!;
        expect(first.y).toBe(second.y);
        expect(first.height).toBe(second.height);
      }
      for (const link of await page
        .getByRole('navigation', { name: 'Footer navigation' })
        .getByRole('link')
        .all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      for (const href of await page
        .locator('a[href^="#"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')!))) {
        await expect(page.locator(href)).toHaveCount(1);
      }
      const origin = new URL(page.url()).origin;
      expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('theme, native FAQ keyboard interaction and all primary destinations work', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const question = page.locator('summary').filter({ hasText: 'Do I need an account or a server?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(question.locator('..')).toHaveAttribute('open', '');
  await expect(page.getByRole('link', { name: /^Try the demo/ }).first()).toHaveAttribute(
    'href',
    'https://rillday-demo.retn0.dev/',
  );
  await expect(
    page.getByRole('link', { name: 'Download for Windows', exact: true }).first(),
  ).toHaveAttribute(
    'href',
    'https://github.com/nbsp1221/rillday/releases/latest/download/Rillday_windows_x64_setup.exe',
  );
  await expect(page.getByRole('link', { name: /^Set up your server/ })).toHaveAttribute(
    'href',
    'https://github.com/nbsp1221/rillday/blob/main/docs/self-hosting.md',
  );
  await expect(page.getByRole('link', { name: 'Portable ZIP', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/nbsp1221/rillday/releases/latest/download/Rillday_windows_x64_portable.zip',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://rillday.retn0.dev/',
  );
  expect((await page.request.get('/social-preview.png')).ok()).toBe(true);
  expect((await page.request.get('/LICENSE')).ok()).toBe(true);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`landing page has no automated accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.evaluate(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
    const violations = await page.evaluate(async () => {
      const axe = (
        window as typeof window & { axe: { run: () => Promise<{ violations: { id: string }[] }> } }
      ).axe;
      return (await axe.run()).violations.map((violation) => violation.id);
    });
    expect(violations).toEqual([]);
  });
}
