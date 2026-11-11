import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { invoke } from '@tauri-apps/api/core';
import { type Page, type TestInfo, expect } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { ApiClient, createServerFixture, password, signin } from '@repo/test-support';
import { z } from 'zod';
import { verifyNativeHabitImport } from './habit-import';

declare global {
  interface Window {
    __TAURI_INTERNALS__: { invoke: typeof invoke };
  }
}

const fixture = createServerFixture((options) => createServer({ ...options, logger: false }));

export type NativeSync = (page: Page) => Promise<void>;

export async function nativeSyncFixture(
  { application }: { application: { currentPage: () => Page | undefined } },
  provide: (verify: NativeSync) => Promise<void>,
  info: TestInfo,
) {
  const server = await fixture({ label: 'native-sync-' });
  const email = 'desktop@rillday.test';
  let credentialKey: string | undefined;
  try {
    await provide(async (page) => {
      await page.clock.install();
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
      const session = server.store.prepare<{ token: string; expiresAt: string }>(
        'SELECT token,expiresAt FROM session WHERE userId=?',
      );
      const token = session.get(user.id)?.token;
      assert(token, 'Missing synthetic native session');
      const nearExpiry = new Date(Date.now() + 86_400_000).toISOString();
      server.store.prepare('UPDATE session SET expiresAt=? WHERE token=?').run(nearExpiry, token);
      await page.clock.fastForward(61_000);
      expect(session.get(user.id)?.expiresAt).toBe(nearExpiry);
      await page.keyboard.press('Shift');
      await expect
        .poll(() => Date.parse(session.get(user.id)?.expiresAt ?? ''))
        .toBeGreaterThan(Date.now() + 29 * 86_400_000);
      assert(session.get(user.id)?.token === token, 'Renewal changed the keyring-backed token');
      await page.screenshot({
        path: info.outputPath('sync-connected.png'),
        animations: 'disabled',
      });
      await page.reload();
      await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
      await verifyNativeHabitImport(page, info);
      await page.getByLabel('Tasks', { exact: true }).click();

      const offlineTitle = 'Keep this Windows edit after session revocation';
      const other = await signin({ origin: server.origin, email });
      const newPassword = 'Synthetic-native-reset-only-2026!';
      await page.context().setOffline(true);
      try {
        const task = page.locator('#quick-add-input');
        await task.fill(offlineTitle);
        await task.press('Enter');
        await expect(page.getByText(offlineTitle, { exact: true })).toBeVisible();
        const changed = await other.request('/api/auth/change-password', {
          currentPassword: password,
          newPassword,
          revokeOtherSessions: true,
        });
        expect(changed.status).toBe(200);
      } finally {
        await page.context().setOffline(false);
      }
      const revoked = new ApiClient(server.origin, token);
      expect((await revoked.request('/v1/account')).status).toBe(401);
      await page.reload();
      await expect(page.locator('.rail-sync')).toHaveAttribute(
        'data-sync-state',
        'authentication-required',
      );
      await expect(page.getByText(offlineTitle, { exact: true })).toBeVisible();
      await page.locator('.rail-sync').click();
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
      await page.getByLabel('Password', { exact: true }).fill(newPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
      const activeToken = await page.evaluate(async (key) => {
        const bridge = window.__TAURI_INTERNALS__;
        return bridge.invoke<string | null>('credential_read', { key });
      }, credentialKey);
      assert(
        activeToken && activeToken !== token,
        'Missing renewed sign-in in the Windows keyring',
      );
      const loggedOut = new ApiClient(server.origin, activeToken);
      expect((await loggedOut.request('/v1/account')).status).toBe(200);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.getByText(offlineTitle, { exact: true })).toBeVisible();

      await page.getByLabel('Settings and backup', { exact: true }).click();
      await page.getByRole('button', { name: 'Sync', exact: true }).click();
      await page.getByRole('button', { name: 'Disconnect server', exact: true }).click();
      await page.getByRole('button', { name: 'Keep data and disconnect', exact: true }).click();
      await expect(page.locator('.rail-sync')).toHaveCount(0);
      await expect.poll(async () => (await loggedOut.request('/v1/account')).status).toBe(401);
      const removed = await page.evaluate(async (key) => {
        const bridge = window.__TAURI_INTERNALS__;
        return (await bridge.invoke('credential_read', { key })) === null;
      }, credentialKey);
      expect(removed).toBe(true);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.locator('.task-title')).not.toHaveCount(0);
    });
  } finally {
    try {
      if (credentialKey) {
        const page = application.currentPage();
        assert(
          page !== undefined && !page.isClosed(),
          'Native credential cleanup requires its application',
        );
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
