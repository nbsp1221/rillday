import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password, signin } from '@repo/test-support';
import { reloadSavedPage } from '../support/navigation';

const fixture = createServerFixture((options) => createServer({ ...options, logger: false }));

test('web activity renews its HttpOnly cookie and reauthentication preserves unsent edits', async ({
  context,
  page,
}) => {
  const server = await fixture({
    label: 'sync-session-',
    webDir: process.env.RILLDAY_TEST_WEB_DIR ?? resolve(import.meta.dirname, '../../dist'),
  });
  const email = 'sliding@rillday.test';
  const sync = page.locator('.rail-sync');

  const sessionCookie = async () =>
    (await context.cookies(server.origin)).find((cookie) => cookie.name.endsWith('session_token'));

  const day = 86_400_000;
  try {
    await page.clock.install();
    await page.goto(server.origin);
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await expect(sync).toHaveAttribute('data-sync-state', 'synced');
    const initial = await sessionCookie();
    assert(initial, 'Missing browser session cookie after sign-in');
    expect(initial).toMatchObject({ httpOnly: true });
    const shortExpiry = new Date(Date.now() + day).toISOString();
    await context.addCookies([{ ...initial, expires: Date.parse(shortExpiry) / 1000 }]);
    server.store.prepare('UPDATE session SET expiresAt=?').run(shortExpiry);

    const currentExpiry = () =>
      server.store.prepare<{ expiresAt: string }>('SELECT expiresAt FROM session').get()?.expiresAt;

    await page.clock.fastForward(61_000);
    expect(currentExpiry()).toBe(shortExpiry);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect
      .poll(async () => (await sessionCookie())?.expires ?? 0)
      .toBeGreaterThan((Date.now() + 29 * day) / 1000);
    const renewed = await sessionCookie();
    assert(
      renewed?.value === initial.value && renewed.httpOnly,
      'Renewal changed the cookie identity',
    );
    expect(Date.parse(currentExpiry() ?? '')).toBeGreaterThan(Date.now() + 29 * day);
    await page.reload();
    await expect(sync).toHaveAttribute('data-sync-state', 'synced');

    // A sign-in in another tab replaces the cookie while this tab still has the original token.
    const originalSession = server.store.prepare<{ id: string }>('SELECT id FROM session').get();
    assert(originalSession, 'Missing original session');
    const replacement = await context.request.post(server.origin + '/api/auth/sign-in/email', {
      headers: { origin: server.origin },
      data: { email, password },
    });
    expect(replacement.ok()).toBe(true);
    const replacementCookie = await sessionCookie();
    assert(replacementCookie?.value && replacementCookie.value !== renewed.value);
    server.store.prepare('UPDATE session SET expiresAt=?').run(shortExpiry);

    const newerExpiry = () =>
      server.store
        .prepare<{ expiresAt: string }>('SELECT expiresAt FROM session WHERE id<>?')
        .get(originalSession.id)?.expiresAt;

    await page.clock.fastForward(61_000);
    await page.keyboard.press('Shift');
    await expect.poll(() => Date.parse(newerExpiry() ?? '')).toBeGreaterThan(Date.now() + 29 * day);
    assert(
      (await sessionCookie())?.value === replacementCookie.value,
      'A stale tab replaced the cookie',
    );
    expect(
      server.store
        .prepare<{ expiresAt: string }>('SELECT expiresAt FROM session WHERE id=?')
        .get(originalSession.id)?.expiresAt,
    ).toBe(shortExpiry);

    await context.setOffline(true);
    const title = 'Keep this edit after session revocation';
    await page.locator('#quick-add-input').fill(title);
    await page.locator('#quick-add-input').press('Enter');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const other = await signin({ origin: server.origin, email });
    const newPassword = 'Synthetic-reset-only-password-2026!';
    expect(
      (
        await other.request('/api/auth/change-password', {
          currentPassword: password,
          newPassword,
          revokeOtherSessions: true,
        })
      ).status,
    ).toBe(200);
    await context.setOffline(false);
    await reloadSavedPage(page);
    await expect(sync).toHaveAttribute('data-sync-state', 'authentication-required');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await sync.click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(sync).toHaveAttribute('data-sync-state', 'synced');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await server.dispose();
  }
});
