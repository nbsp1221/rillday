import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { type Page, expect, test } from '@playwright/test';
import { settleAnimations } from '@repo/test-support/browser-appearance';
const require = createRequire(import.meta.url);

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toBeVisible();
}

async function resetExamples(page: Page) {
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset examples', exact: true }).click();
}

async function add(page: Page, title: string) {
  await page.locator('#quick-add-input').fill(title);
  await page.locator('#quick-add-input').press('Enter');
  await expect(page.locator('.task-row').filter({ hasText: title })).toBeVisible();
}

async function reloadSaved(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))),
    )
    .toBe(true);
  await page.reload();
}

test('root starts with examples, every product area opens and no account or server UI is offered', async ({
  page,
}) => {
  const requests: string[] = [];
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') {
      external.push(request.url());
    }
    if (/\/v1\/|\/api\/|^wss?:/.test(request.url())) {
      requests.push(request.url());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  expect(await page.locator('.task-row').count()).toBeGreaterThan(3);
  for (const name of ['Calendar', 'Eisenhower Matrix', 'Habit', 'Tasks']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.main-workspace')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await expect(
    page.locator('#settings-categories').getByRole('button', { name: /sync/i }),
  ).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /server|password|email/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Current workspace', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync settings', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/settings/sync?demo=0');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /server|password|email/i })).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('edits survive reload and work offline after static assets are cached', async ({
  page,
  context,
}) => {
  await ready(page);
  await add(page, 'A change that stays in this browser');
  await reloadSaved(page);
  await expect(
    page.locator('.task-row').filter({ hasText: 'A change that stays in this browser' }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.locator('.task-row').filter({ hasText: 'A change that stays in this browser' }),
  ).toBeVisible();
  await add(page, 'Added offline in the demo');
  await context.setOffline(false);
  await reloadSaved(page);
  await expect(
    page.locator('.task-row').filter({ hasText: 'Added offline in the demo' }),
  ).toBeVisible();
});

test('confirmed reset updates another open tab and preserves unrelated browser storage', async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    localStorage.setItem('rillday-normal-sentinel', 'keep');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('rillday-workspaces', 2);
      request.onupgradeneeded = () => request.result.createObjectStore('metadata');
      request.onerror = () =>
        reject(request.error ?? new Error('Could not create the fixture database'));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('metadata', 'readwrite');
        tx.objectStore('metadata').put('keep', 'normal-workspace-sentinel');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await add(page, 'An edit before resetting examples');
  const second = await context.newPage();
  await ready(second);
  await expect(
    second.locator('.task-row').filter({ hasText: 'An edit before resetting examples' }),
  ).toBeVisible();
  await resetExamples(page);
  await expect(page.getByRole('dialog', { name: 'Reset examples?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.locator('.task-row').filter({ hasText: 'An edit before resetting examples' }),
  ).toBeVisible();
  await resetExamples(page);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reset examples', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('.task-row').filter({ hasText: 'An edit before resetting examples' }),
  ).toHaveCount(0);
  await expect(
    second.locator('.task-row').filter({ hasText: 'An edit before resetting examples' }),
  ).toHaveCount(0);
  await add(second, 'Both tabs still work after reset');
  await expect(
    page.locator('.task-row').filter({ hasText: 'Both tabs still work after reset' }),
  ).toBeVisible();
  await reloadSaved(page);
  await expect(
    page.locator('.task-row').filter({ hasText: 'Both tabs still work after reset' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('rillday-normal-sentinel'))).toBe('keep');
  expect(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.open('rillday-workspaces', 2);
          request.onsuccess = () => {
            const db = request.result;
            const get = db
              .transaction('metadata')
              .objectStore('metadata')
              .get('normal-workspace-sentinel');
            get.onsuccess = () => {
              db.close();
              resolve(get.result);
            };
          };
        }),
    ),
  ).toBe('keep');
  await second.close();
});

test('demo navigation and actions fit narrow screens and follow the selected language and theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bottom = await page
    .locator('.rillday-app')
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(845);
  await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '한국어', exact: true }).click();
  await expect(page.getByRole('button', { name: '데모', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '화면', exact: true }).click();
  await page.getByRole('radio', { name: '라이트', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '데모', exact: true }).click();
  await page.getByRole('menuitem', { name: '예제 초기화', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '예제를 초기화할까요?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '데모', exact: true })).toBeFocused();
});

test('demo menu uses standard keyboard navigation and restores focus after confirmation', async ({
  page,
}) => {
  await ready(page);
  const trigger = page.getByRole('button', { name: 'Demo', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Demo workspace' });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Clearing browser data removes your changes.');
  const reset = menu.getByRole('menuitem', { name: 'Reset examples' });
  const product = menu.getByRole('menuitem', { name: 'About Rillday' });
  await expect(reset).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(product).toBeFocused();
  await expect(product).toHaveAttribute('href', 'https://rillday.retn0.dev/');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expect(reset).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Reset examples?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(reset).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset examples', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('demo navigation keeps the full-height product layout and consistent rail geometry', async ({
  page,
}) => {
  await ready(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = page.getByRole('button', { name: 'Demo', exact: true });
    const search = page.getByRole('button', { name: 'Search all', exact: true });
    const demoBox = (await trigger.boundingBox())!;
    const searchBox = (await search.boundingBox())!;
    expect(demoBox.x).toBe(searchBox.x);
    expect(demoBox.width).toBe(searchBox.width);
    expect(demoBox.height).toBe(searchBox.height);
    for (const area of ['Calendar', 'Eisenhower Matrix', 'Habit', 'Tasks']) {
      await page.getByRole('button', { name: area, exact: true }).click();
      const bounds = (await page.locator('.rillday-app').boundingBox())!;
      expect(bounds.y).toBe(0);
      expect(bounds.height).toBe(844);
      await trigger.click();
      const menu = page.getByRole('menu', { name: 'Demo workspace' });
      await settleAnimations(menu);
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('demo menu and reset dialog have no automated accessibility violations', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await settleAnimations(page.getByRole('menu', { name: 'Demo workspace' }));
  await page.evaluate(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));

  const check = () =>
    page.evaluate(async () => {
      const axe = (
        window as typeof window & {
          axe: { run: (context: unknown) => Promise<{ violations: { id: string }[] }> };
        }
      ).axe;
      return (
        await axe.run({ include: [['.app-rail'], ['[role="menu"]'], ['[role="dialog"]']] })
      ).violations.map((violation) => violation.id);
    });

  expect(await check()).toEqual([]);
  await page.getByRole('menuitem', { name: 'Reset examples', exact: true }).click();
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
  expect(await check()).toEqual([]);
});
