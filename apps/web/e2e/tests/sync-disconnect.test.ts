import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password } from '@repo/test-support';
import { reloadSavedPage } from '../support/navigation';

const fixture = createServerFixture(createServer);

for (const keep of [true, false]) {
  test(`web disconnect ${keep ? 'retains' : 'removes'} the device copy after explicit confirmation`, async ({
    page,
  }) => {
    const server = await fixture({
      label: 'sync-disconnect-',
      webDir: process.env.RILLDAY_TEST_WEB_DIR ?? resolve(import.meta.dirname, '../../dist'),
    });
    try {
      await page.goto(server.origin);
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await page.getByRole('button', { name: 'Sync', exact: true }).click();
      await page.getByLabel('Server URL', { exact: true }).fill(server.origin);
      await page.getByRole('button', { name: 'Check connection', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('Disconnect verification');
      await page.getByLabel('Email', { exact: true }).fill('disconnect@rillday.test');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
      await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      const title = 'Preserve the chosen device-copy policy';
      await page.locator('#quick-add-input').fill(title);
      await page.locator('#quick-add-input').press('Enter');
      await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await page.getByRole('button', { name: 'Sync', exact: true }).click();
      await page.getByRole('button', { name: 'Disconnect server', exact: true }).click();
      const remove = page.getByRole('button', {
        name: 'Remove device data and disconnect',
        exact: true,
      });
      await expect(remove).toHaveClass(/bg-button-destructive/);
      await expect(remove).toBeEnabled();
      await page
        .getByRole('button', {
          name: keep ? 'Keep data and disconnect' : 'Remove device data and disconnect',
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('button', { name: 'Disconnect server', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Check connection', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.getByText(title, { exact: true })).toHaveCount(keep ? 1 : 0);
      await reloadSavedPage(page);
      await expect(page.getByText(title, { exact: true })).toHaveCount(keep ? 1 : 0);
      await expect(page.locator('.rail-sync')).toHaveCount(0);
    } finally {
      await server.dispose();
    }
  });
}
