import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { invoke } from '@tauri-apps/api/core';
import { type Page, type TestInfo, expect } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password } from '@repo/test-support';
import { z } from 'zod';

declare global {
  interface Window {
    __TAURI_INTERNALS__: { invoke: typeof invoke };
  }
}

const fixture = createServerFixture((options) => createServer({ ...options, logger: false }));

export async function verifyNativeSync(page: Page, info: TestInfo) {
  const server = await fixture({ label: 'native-sync-' });
  const email = 'desktop@rillday.test';
  let credentialKey: string | undefined;
  try {
    await page.getByLabel(/^(Settings and backup|설정과 백업)$/).click();
    await page.getByRole('button', { name: /^(General|일반)$/, exact: true }).click();
    await page.getByRole('combobox', { name: /^(Language|언어)$/, exact: true }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    const address = page.getByLabel('Server URL', { exact: true });
    await expect(address).toHaveValue('');
    await expect(page.locator('.sync-login-form')).toHaveCount(0);
    await address.fill(server.origin);
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.locator('.sync-server-summary')).toContainText(server.origin);
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.screenshot({ path: info.outputPath('sync-setup.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Review sync connection', exact: true }),
    ).toBeVisible();
    const metadata = z
      .object({ serverId: z.string() })
      .parse(await (await fetch(server.origin + '/v1/server')).json());
    const user = server.store
      .prepare<{ id: string }>('SELECT id FROM user WHERE email=?')
      .get(email);
    assert(user !== undefined, 'Missing synthetic native sync user');
    credentialKey = createHash('sha256')
      .update(server.origin + '|' + metadata.serverId + '|' + user.id)
      .digest('hex');
    await page.getByRole('button', { name: 'Sync together', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    await page.screenshot({ path: info.outputPath('sync-connected.png'), animations: 'disabled' });
    await page.reload();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    await page.getByRole('button', { name: 'Disconnect server', exact: true }).click();
    await page.getByRole('button', { name: 'Keep data and disconnect', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.task-title')).not.toHaveCount(0);
  } finally {
    try {
      if (credentialKey) {
        await page.evaluate(async (key) => {
          const bridge = window.__TAURI_INTERNALS__;
          await bridge.invoke('credential_remove', { key });
          const value = await bridge.invoke('credential_read', { key });
          if (value !== null) {
            throw new Error('Synthetic credential was not removed');
          }
        }, credentialKey);
      }
    } finally {
      await server.dispose();
    }
  }
}
