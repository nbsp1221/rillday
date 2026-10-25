import { resolve } from 'node:path';
import { type WebSocketRoute, expect, test } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password } from '@repo/test-support';
import invariant from 'tiny-invariant';
import { reloadSavedPage } from '../support/navigation';

const fixture = createServerFixture(createServer);

test('sync failures explain the cause, preserve unsent tasks and recover without signing in again', async ({
  page,
}) => {
  const server = await fixture({
    label: 'sync-errors-',
    webDir: process.env.RILLDAY_TEST_WEB_DIR ?? resolve(import.meta.dirname, '../../dist'),
  });
  try {
    let socket: WebSocketRoute | undefined;

    await page.routeWebSocket('**/v1/workspace/*', (route) => {
      socket = route;
      route.connectToServer();
    });
    await page.goto(server.origin);
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.locator('.settings-nav').getByRole('button', { name: 'Sync', exact: true }).click();
    await page.getByLabel('Server URL', { exact: true }).fill(server.origin);
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Sync recovery');
    await page.getByLabel('Email', { exact: true }).fill('recovery@rillday.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');

    let status = 503;
    const pattern = `${server.origin}/v1/server`;
    await page.route(pattern, (route) =>
      route.fulfill({ status, contentType: 'text/html', body: '<html>Proxy response</html>' }),
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    expect(socket).toBeDefined();
    invariant(socket !== undefined, 'Missing socket');
    await socket.close();
    await page.locator('#quick-add-input').fill('Keep this unsent task');
    await page.locator('#quick-add-input').press('Enter');
    await page.locator('.rail-sync').click();
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'error');
    const alert = page.locator('.sync-error[role="alert"]');
    await expect(alert).toHaveText(
      'The server could not process the request. Try syncing again shortly.',
    );

    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(alert).toHaveText(
      'The server could not process the request. Try syncing again shortly.',
    );
    status = 429;
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(alert).toHaveText('Too many requests. Wait a moment before syncing again.');
    status = 200;
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(alert).toHaveText(
      'The server response could not be verified. Check the server status and version.',
    );
    await expect(
      page.getByRole('button', { name: 'Disconnect server', exact: true }),
    ).toBeVisible();

    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    await expect(alert).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.task-title')).toHaveText('Keep this unsent task');
    await reloadSavedPage(page);
    await expect(page.locator('.task-title')).toHaveText('Keep this unsent task');
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
  } finally {
    await server.dispose();
  }
});
