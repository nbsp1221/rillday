import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, removeOwned, tempDir } from '@repo/test-support';
import { buildBrowserReleases } from '@repo/test-support/browser-releases';
import { chooseChoice } from '../support/choice';
import { storedWorkspace } from '../support/storage';

const serverFixture = createServerFixture((options) => createServer({ ...options, logger: false }));

const test = base.extend<
  { release: { origin: string; publish: (revision: 'one' | 'two') => Promise<void> } },
  { releases: Awaited<ReturnType<typeof buildBrowserReleases>> }
>({
  releases: [
    async ({}, run) => {
      const directory = tempDir('pwa-builds-');
      try {
        await run(await buildBrowserReleases(resolve(import.meta.dirname, '../..'), directory));
      } finally {
        removeOwned(directory);
      }
    },
    { scope: 'worker', timeout: 120000 },
  ],
  release: async ({ releases }, run) => {
    const directory = tempDir('pwa-release-');
    try {
      const webDir = resolve(directory, 'web');

      async function publish(revision: 'one' | 'two') {
        // Keep old hashed assets available to tabs that have not accepted the update.
        await cp(releases[revision], webDir, { recursive: true });
      }

      await publish('one');
      const server = await serverFixture({ label: 'pwa-server-', webDir });
      try {
        await run({ origin: server.origin, publish });
      } finally {
        await server.dispose();
      }
    } finally {
      removeOwned(directory);
    }
  },
});

test('a live release preserves edits in every tab and updates without restarting or clearing data', async ({
  page,
  context,
  release,
}) => {
  await page.goto(release.origin);
  const originalScript = await page.locator('script[type="module"][src]').getAttribute('src');
  const input = page.getByRole('textbox', { name: 'Quick add task', exact: true });
  await input.fill('Keep this saved task');
  await input.press('Enter');
  await expect(page.locator('.task-title')).toHaveText('Keep this saved task');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  const other = await context.newPage();
  await other.goto(release.origin);
  const otherInput = other.getByRole('textbox', { name: 'Quick add task', exact: true });
  await otherInput.fill('Another tab unfinished text');
  await input.fill('Current tab unfinished text');

  await release.publish('two');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const notice = page.getByRole('status', { name: 'App update' });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await expect(other.getByRole('status', { name: 'App update' })).toBeVisible();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'one');
  await expect(input).toHaveValue('Current tab unfinished text');
  await expect(otherInput).toHaveValue('Another tab unfinished text');
  // The old version must still load its lazy editor while the update waits.
  await page.getByRole('button', { name: 'Keep this saved task', exact: true }).click();
  await expect(page.locator('.mdxeditor [contenteditable="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Close task details', exact: true }).click();

  await notice.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(input).toHaveValue('Current tab unfinished text');
  await page.getByRole('button', { name: 'Due date for new task', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('Current tab unfinished text');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(notice).toBeVisible();

  await input.press('Enter');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(2);
  await otherInput.press('Enter');
  await expect.poll(async () => (await storedWorkspace(other)).tasks.length).toBe(3);
  await notice.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(page.locator('script[type="module"][src]')).not.toHaveAttribute(
    'src',
    originalScript!,
  );
  await expect(page.locator('.task-title')).toHaveCount(3);
  await expect(other.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(page.locator('.task-title')).toHaveCount(3);
});

test('hourly discovery offers a translated keyboard update within a narrow layout', async ({
  page,
  release,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.install();
  await page.goto(release.origin);
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await chooseChoice(page, page.getByRole('combobox', { name: 'Language', exact: true }), 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await release.publish('two');
  await page.clock.fastForward(60 * 60 * 1000);
  const notice = page.getByRole('status', { name: 'App update' });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await expect(notice).toContainText('Finish your edits in all tabs before updating.');
  const bounds = (await notice.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);

  const update = notice.getByRole('button', { name: 'Update', exact: true });
  await update.focus();
  await update.press('Enter');
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('an open offline tab detects a release on reconnect and keeps its stored tasks', async ({
  page,
  context,
  release,
}) => {
  await page.goto(release.origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  const input = page.getByRole('textbox', { name: 'Quick add task', exact: true });
  await input.fill('Written without a network');
  await input.press('Enter');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  await release.publish('two');
  await expect(page.getByRole('status', { name: 'App update' })).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByRole('status', { name: 'App update' })).toBeVisible({ timeout: 20000 });
  await page
    .getByRole('status', { name: 'App update' })
    .getByRole('button', { name: 'Update', exact: true })
    .click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(page.locator('.task-title')).toHaveText('Written without a network');
});
