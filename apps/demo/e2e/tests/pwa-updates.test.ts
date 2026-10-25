import assert from 'node:assert/strict';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { removeOwned, tempDir } from '@repo/test-support';
import { buildBrowserReleases } from '@repo/test-support/browser-releases';
import { preview } from 'vite';

const source = resolve(import.meta.dirname, '../..');
const test = base.extend<
  { release: { origin: string; publish: () => Promise<void> } },
  { releases: Awaited<ReturnType<typeof buildBrowserReleases>> }
>({
  releases: [
    async ({}, run) => {
      const directory = tempDir('demo-pwa-builds-');
      try {
        await run(await buildBrowserReleases(source, directory));
      } finally {
        removeOwned(directory);
      }
    },
    { scope: 'worker', timeout: 120000 },
  ],
  release: async ({ releases }, run) => {
    const directory = tempDir('demo-pwa-release-');
    let server: Awaited<ReturnType<typeof preview>> | undefined;
    try {
      await cp(releases.one, directory, { recursive: true });
      server = await preview({
        root: source,
        configFile: resolve(source, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir: directory },
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing demo release address');
      }
      await run({
        origin: `http://127.0.0.1:${address.port}`,
        publish: () => cp(releases.two, directory, { recursive: true }),
      });
    } finally {
      try {
        if (server) {
          await new Promise<void>((done, reject) => {
            assert(server !== undefined, 'Missing server');
            server.httpServer.close((error) => (error ? reject(error) : done()));
          });
        }
      } finally {
        removeOwned(directory);
      }
    }
  },
});

test('a static demo accepts a genuine release update and retains browser-only edits offline', async ({
  page,
  context,
  release,
}) => {
  const serverRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/|\/api\/|^wss?:/.test(request.url())) {
      serverRequests.push(request.url());
    }
  });
  await page.goto(release.origin);
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toBeVisible();
  const script = await page.locator('script[type="module"][src]').getAttribute('src');
  const input = page.locator('#quick-add-input');
  await input.fill('Keep this demo edit through an update');
  await input.press('Enter');
  const task = page
    .locator('.task-title')
    .filter({ hasText: 'Keep this demo edit through an update' });
  await expect(task).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await release.publish();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const notice = page.getByRole('status', { name: 'App update' });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'one');
  await notice.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  assert(script !== null, 'Missing script');
  await expect(page.locator('script[type="module"][src]')).not.toHaveAttribute('src', script);
  await expect(task).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(task).toBeVisible();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  expect(serverRequests).toEqual([]);
});
