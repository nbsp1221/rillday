import { expect, test } from '@playwright/test';

interface BrandManifest {
  name: string;
  icons: { src: string; sizes: string; purpose: string }[];
}

test('web identity assets decode at their declared sizes and remain available offline', async ({
  page,
  context,
}) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.task-title').first()).toBeVisible();
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestUrl).toBeTruthy();
  const manifest = await page.evaluate(async (url) => {
    const response = await fetch(url!);
    return (await response.json()) as BrandManifest;
  }, manifestUrl);
  expect(manifest.name).toBe('Rillday');
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  const assets = await page.evaluate(async (icons: { src: string; sizes: string }[]) => {
    const links = [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="apple-touch-icon"]',
      ),
    ];
    const urls = [...icons.map((icon) => icon.src), ...links.map((link) => link.href)];
    return Promise.all(
      urls.map(async (src) => {
        const response = await fetch(src);
        const image = new Image();
        image.src = src;
        await image.decode();
        return {
          src: new URL(src, location.href).pathname,
          status: response.status,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );
  }, manifest.icons);
  for (const icon of manifest.icons) {
    const asset = assets.find((asset) => asset.src === icon.src)!;
    expect(`${asset.width}x${asset.height}`).toBe(icon.sizes);
  }
  expect(assets.every((asset) => asset.status === 200 && asset.width > 0)).toBe(true);
  expect(assets.find((asset) => asset.src === '/apple-touch-icon.png')?.width).toBe(180);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.task-title').first()).toBeVisible();
  for (const asset of assets) {
    expect(await page.evaluate(async (src) => (await fetch(src)).ok, asset.src)).toBe(true);
  }
});

for (const [theme, label, chrome] of [
  ['dark', 'Dark', '#171717'],
  ['light', 'Light', '#ffffff'],
] as const) {
  test(`${theme} appearance updates browser chrome without changing low-priority semantics`, async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', chrome);
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        link: style.getPropertyValue('--link').trim(),
        priority: style.getPropertyValue('--priority-low').trim(),
      };
    });
    expect(colors.link).not.toBe(colors.priority);
  });
}
