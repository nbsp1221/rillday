import { resolve } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password, setupAdministrator } from '@repo/test-support';
import { appearance } from '../support/appearance';
import { reloadSavedPage } from '../support/navigation';

const fixture = createServerFixture((options) => createServer({ ...options, logger: false }));
const webDir = process.env.RILLDAY_TEST_WEB_DIR ?? resolve(import.meta.dirname, '../../dist');

async function openSync(page: Page) {
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Sync', exact: true }).click();
}

for (const failures of [1, 2]) {
  test(
    'a failed automatic server check waits for explicit retry after ' + failures + ' failures',
    async ({ page }) => {
      const server = await fixture({ label: 'setup-retry-', webDir });
      let checks = 0;
      try {
        await page.route(server.origin + '/v1/server', (route) => {
          checks++;
          return checks <= failures
            ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
            : route.continue();
        });
        await page.goto(server.origin);
        await openSync(page);
        const alert = page.locator('.sync-error');
        const retry = page.getByRole('button', { name: 'Check connection', exact: true });
        for (let attempt = 1; attempt <= failures; attempt++) {
          await expect(alert).toHaveText(
            'The server could not process the request. Try syncing again shortly.',
          );
          await expect(page.getByLabel('Server URL', { exact: true })).toHaveValue(server.origin);
          await expect(retry).toBeEnabled();
          expect(checks).toBe(attempt);
          await retry.click();
        }
        await expect(page.locator('.sync-login-form')).toBeVisible();
        await expect(page.locator('.sync-server-summary')).toContainText(server.origin);
        await expect(alert).toHaveCount(0);
        expect(checks).toBe(failures + 1);
      } finally {
        await server.dispose();
      }
    },
  );
}

test('first setup validates accessible email and password fields before sending credentials', async ({
  page,
}) => {
  const server = await fixture({ label: 'setup-fields-', webDir });
  try {
    const requests: unknown[] = [];
    page.on('request', (request) => {
      if (request.url() === server.origin + '/v1/setup') {
        requests.push(request.postDataJSON());
      }
    });
    await page.goto(server.origin);
    await openSync(page);
    const form = page.getByRole('form', { name: 'Set up administrator', exact: true });
    await expect(form).toBeVisible();
    await expect(page.locator('.sync-server-summary')).toContainText(server.origin);
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    const email = form.getByLabel('Email', { exact: true });
    const secret = form.getByLabel('Password', { exact: true });
    const submit = form.getByRole('button', { name: 'Create administrator', exact: true });
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(secret).toHaveAttribute('autocomplete', 'new-password');
    await submit.click();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', /\S+/);
    expect(
      await email.evaluate((input) =>
        input
          .getAttribute('aria-describedby')
          ?.split(/\s+/)
          .some((id) => document.getElementById(id)?.textContent?.includes('Enter a value.')),
      ),
    ).toBe(true);
    await email.fill('not-an-email');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
    await secret.fill('short');
    await submit.click();
    await expect(email).toBeFocused();
    await email.fill('setup@rillday.test');
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
    await submit.click();
    await expect(secret).toBeFocused();
    await expect(secret).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toEqual([]);
    await secret.fill(password);
    await expect(secret).not.toHaveAttribute('aria-invalid', 'true');
    const reveal = form.getByRole('button', { name: 'Show password', exact: true });
    await reveal.focus();
    await page.keyboard.press('Space');
    await expect(secret).toHaveAttribute('type', 'text');
    await expect(form.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Space');
    await expect(secret).toHaveAttribute('type', 'password');
    await secret.dispatchEvent('keydown', {
      key: 'Enter',
      keyCode: 229,
      isComposing: true,
      bubbles: true,
    });
    expect(requests).toEqual([]);
    await secret.press('Enter');
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    expect(requests).toEqual([{ email: 'setup@rillday.test', password }]);
    await expect(page.locator('.sync-identity')).toContainText('setup@rillday.test');
  } finally {
    await server.dispose();
  }
});

test('changing the confirmed server clears credentials and binds creation only to the new server', async ({
  page,
}) => {
  const first = await fixture({ label: 'setup-target-a-', webDir });
  const second = await createServerFixture((options) =>
    createServer({ ...options, clientOrigins: [first.origin], logger: false }),
  )({ label: 'setup-target-b-' });
  try {
    await page.goto(first.origin);
    await openSync(page);
    await page.getByLabel('Email', { exact: true }).fill('target@rillday.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Change server', exact: true }).click();
    await expect(page.locator('.sync-login-form')).toHaveCount(0);
    const address = page.getByLabel('Server URL', { exact: true });
    await address.fill('not-a-url');
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(address).toBeFocused();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Enter a complete HTTP or HTTPS address.', { exact: true }),
    ).toBeVisible();
    await address.fill(second.origin);
    await expect(address).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Check connection', exact: true }).click();
    await expect(page.locator('.sync-server-summary')).toContainText(second.origin);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await page.getByLabel('Email', { exact: true }).fill('target@rillday.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    await expect(page.locator('.sync-identity')).toContainText(second.origin);
    expect(await (await fetch(first.origin + '/v1/server')).json()).toMatchObject({
      setupRequired: true,
    });
    expect(await (await fetch(second.origin + '/v1/server')).json()).toMatchObject({
      setupRequired: false,
    });
  } finally {
    await second.dispose();
    await first.dispose();
  }
});

test('sign-in preserves local work until consent and administrator forms use the same account fields', async ({
  page,
}) => {
  const server = await fixture({ label: 'setup-consent-', webDir });
  try {
    await setupAdministrator(server.origin, 'admin@rillday.test');
    await page.goto(server.origin);
    await page.locator('#quick-add-input').fill('Local task before connecting');
    await page.locator('#quick-add-input').press('Enter');
    await openSync(page);
    await page.getByLabel('Email', { exact: true }).fill('admin@rillday.test');
    await page.getByLabel('Password', { exact: true }).fill('Incorrect-but-valid-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.sync-error')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const review = page.getByRole('region', { name: 'Review sync connection', exact: true });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.task-title')).toHaveText('Local task before connecting');
    await openSync(page);
    await page.getByLabel('Email', { exact: true }).fill('admin@rillday.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await review.getByRole('button', { name: 'Sync together', exact: true }).click();
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
    await page.getByRole('button', { name: 'Add user', exact: true }).click();
    const add = page.getByRole('form', { name: 'Add user', exact: true });
    await expect(add.locator('input')).toHaveCount(2);
    await add.getByLabel('Email', { exact: true }).fill('member@rillday.test');
    await add.getByLabel('Password', { exact: true }).fill(password);
    await add.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.locator('.sync-users')).toContainText('member@rillday.test');
    await expect(add.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(add.locator('[aria-invalid=true]')).toHaveCount(0);
    await expect(add.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    const change = page.getByRole('form', { name: 'Change password', exact: true });
    await change.getByLabel('Current password', { exact: true }).fill(password);
    await change.getByLabel('New password', { exact: true }).fill(password + '-changed');
    await change.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(change.getByLabel('Current password', { exact: true })).toHaveValue('');
    await expect(change.locator('[aria-invalid=true]')).toHaveCount(0);
    await expect(change.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.task-title')).toHaveText('Local task before connecting');
    await reloadSavedPage(page);
    await expect(page.locator('.task-title')).toHaveText('Local task before connecting');
    await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');
  } finally {
    await server.dispose();
  }
});

for (const width of [1440, 390]) {
  for (const locale of ['en-US', 'ko-KR']) {
    test(
      'setup alignment and themes at ' + width + 'px in ' + locale,
      async ({ browser }, info) => {
        const server = await fixture({ label: 'setup-layout-', webDir });
        const context = await browser.newContext({
          locale,
          viewport: { width, height: 900 },
          isMobile: width === 390,
          hasTouch: width === 390,
        });
        try {
          const page = await context.newPage();
          await page.goto(server.origin);
          const ko = locale === 'ko-KR';
          await page.getByLabel('Settings and backup', { exact: true }).click();
          if (ko) {
            await page.getByRole('combobox', { name: 'Language', exact: true }).click();
            await page.getByRole('option', { name: '한국어', exact: true }).click();
          }
          for (const colorScheme of ['dark', 'light'] as const) {
            await page
              .getByRole('button', { name: ko ? '화면' : 'Appearance', exact: true })
              .click();
            await page
              .getByRole('radio', {
                name: ko
                  ? colorScheme === 'dark'
                    ? '다크'
                    : '라이트'
                  : colorScheme === 'dark'
                    ? 'Dark'
                    : 'Light',
                exact: true,
              })
              .click();
            await page
              .locator('.settings-nav')
              .getByRole('button', { name: ko ? '동기화' : 'Sync', exact: true })
              .click();
            await expect(page.locator('.sync-login-form')).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
            const geometry = await page.locator('.sync-settings').evaluate((root) => {
              const email = root.querySelector<HTMLInputElement>('input[type=email]')!;
              const group = root.querySelector<HTMLElement>('[data-slot=input-group]')!;
              const fields = root.querySelector<HTMLElement>('[data-slot=field-group]')!;
              const a = email.getBoundingClientRect();
              const b = group.getBoundingClientRect();
              return {
                width: root.getBoundingClientRect().width,
                gap: getComputedStyle(root).rowGap,
                fieldGap: getComputedStyle(fields).rowGap,
                x: a.x - b.x,
                widthDelta: a.width - b.width,
                heightDelta: a.height - b.height,
                overflow: document.documentElement.scrollWidth - innerWidth,
                controlHeight: a.height,
              };
            });
            expect(geometry.width).toBeLessThanOrEqual(448);
            expect(geometry.gap).toBe('24px');
            expect(geometry.fieldGap).toBe('24px');
            expect(Math.abs(geometry.x)).toBeLessThan(1);
            expect(Math.abs(geometry.widthDelta)).toBeLessThan(1);
            expect(Math.abs(geometry.heightDelta)).toBeLessThan(1);
            expect(geometry.overflow).toBe(0);
            expect(geometry.controlHeight).toBe(width === 390 ? 44 : 36);
            const submit = page.locator('.sync-login-form button[type=submit]');
            expect((await appearance(submit)).contrast).toBeGreaterThanOrEqual(4.5);
            await submit.hover();
            expect((await appearance(submit)).contrast).toBeGreaterThanOrEqual(4.5);
            await page.screenshot({
              path: info.outputPath(colorScheme + '.png'),
              animations: 'disabled',
              fullPage: true,
            });
            await info.attach(colorScheme + '-geometry', {
              body: JSON.stringify(geometry),
              contentType: 'application/json',
            });
          }
        } finally {
          await context.close();
          await server.dispose();
        }
      },
    );
  }
}
