import { resolve } from 'node:path';
import { type Page, test as base, expect } from '@playwright/test';
import { createServer } from '@repo/server/runtime';
import { createServerFixture, password } from '@repo/test-support';
import { reloadSavedPage } from '../support/navigation';
import { seedArchive, storedRegistry, storedWorkspace } from '../support/storage';
import { archiveFixture, conflictingArchive } from '../support/workspace-archive';

const fixture = createServerFixture((options) => createServer({ ...options, logger: false }));
const test = base.extend<object, { application: Awaited<ReturnType<typeof fixture>> }>({
  application: [
    async ({ browserName }, provide) => {
      const application = await fixture({
        label: `${browserName}-multi-tab-`,
        webDir: process.env.RILLDAY_TEST_WEB_DIR ?? resolve(import.meta.dirname, '../../dist'),
      });
      try {
        await provide(application);
      } finally {
        await application.dispose();
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ application }, provide) => {
    await provide(application.origin);
  },
});

const titles = (page: Page) => page.locator('.task-items > .task-row .task-title');

async function add(page: Page, title: string) {
  await page.locator('#quick-add-input').fill(title);
  await page.locator('#quick-add-input').press('Enter');
  await expect(titles(page).filter({ hasText: title })).toHaveCount(1);
}

async function editTitle(page: Page, title: string) {
  await titles(page).first().dblclick();
  const input = page.locator('.inline-title');
  await input.fill(title);
  await input.press('Enter');
}

async function second(page: Page) {
  const tab = await page.context().newPage();
  await tab.goto('/');
  await expect(tab.locator('#quick-add-input')).toBeVisible();
  return tab;
}

test('a stale label editor keeps its draft and reports deletion in another tab', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Shared label task #shared');
  await page.locator('#quick-add-input').press('Enter');
  await expect(titles(page)).toHaveText('Shared label task');
  const other = await second(page);

  const edit = async (tab: Page) => {
    const row = tab.locator('.sidebar-label').filter({ hasText: 'shared' });
    await row.hover();
    await row.getByRole('button', { name: 'Edit label shared', exact: true }).click();
  };

  await edit(page);
  const dialog = page.getByRole('dialog', { name: 'Edit labels', exact: true });
  const input = dialog.getByRole('textbox', { name: 'Name', exact: true });
  await input.fill('Renamed-draft');

  await edit(other);
  await other.getByRole('button', { name: 'Delete label', exact: true }).click();
  await expect
    .poll(async () => (await storedWorkspace(page)).labels?.includes('shared'))
    .toBe(false);
  await expect(page.locator('.sidebar-label').filter({ hasText: 'shared' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(input).toHaveValue('Renamed-draft');
  await expect(input).toHaveJSProperty(
    'validationMessage',
    'This label was deleted in another window.',
  );
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
});

test('two fresh tabs start together and share one workspace', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto('/'), b.goto('/')]);
  await expect(a.locator('#quick-add-input')).toBeVisible();
  await expect(b.locator('#quick-add-input')).toBeVisible();
  await add(a, 'Workspace open in two tabs');
  await expect(titles(b)).toHaveText(['Workspace open in two tabs']);
  const ids = await Promise.all([a, b].map(async (page) => (await storedRegistry(page)).activeId));
  expect(ids[0]).toBe(ids[1]);
});

test('committed edits update other tabs without clearing unsent input or moving focus', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Shared task');
  const tab = await second(page);
  await expect(titles(tab)).toHaveText(['Shared task']);
  const draft = tab.locator('#quick-add-input');
  await draft.fill('Unfinished input');
  await editTitle(page, 'Title from another tab');
  await expect(titles(tab)).toHaveText(['Title from another tab']);
  await expect(draft).toHaveValue('Unfinished input');
  await expect(draft).toBeFocused();

  await draft.press('Enter');
  await expect(titles(page)).toHaveCount(2);
  await tab.close();
  await add(page, 'Saved after closing the other tab');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks.map((task) => task.title).sort())
    .toEqual(
      ['Title from another tab', 'Unfinished input', 'Saved after closing the other tab'].sort(),
    );
  await reloadSavedPage(page);
  await expect(titles(page)).toHaveCount(3);
});

test('tab-owned Undo preserves another tab follow-up edit', async ({ page }) => {
  await page.goto('/');
  await add(page, 'Shared editing');
  const tab = await second(page);
  await expect(titles(tab)).toHaveText(['Shared editing']);
  await titles(tab).first().click();
  const notes = tab.getByLabel('Task description', { exact: true });
  await notes.fill('Notes from another tab');
  await tab.getByLabel('Close task details', { exact: true }).click();
  await titles(page).first().click();
  await expect(page.getByLabel('Task description', { exact: true })).toHaveText(
    'Notes from another tab',
  );
  await page.getByLabel('Close task details', { exact: true }).click();
  await page.locator('.workspace-header h1').click();
  await page.keyboard.press('Control+z');
  await expect(titles(page)).toHaveText(['Shared editing']);
  await titles(page).first().click();
  await expect(page.getByLabel('Task description', { exact: true })).toHaveText(
    'Notes from another tab',
  );
});

test('native concurrent title alternatives persist and resolve across tabs through the shared conflict UI', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Original title');
  const data = await storedWorkspace(page);
  const taskId = data.tasks[0].id;
  const conflicted = await conflictingArchive(await archiveFixture(data), [
    (workspace) => {
      workspace.tasks[taskId].title = 'First tab title';
    },
    (workspace) => {
      workspace.tasks[taskId].title = 'Second tab title';
    },
  ]);
  await seedArchive(page, conflicted);
  await page.reload();
  const tab = await second(page);
  await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'conflict');
  await expect(tab.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'conflict');
  await page.locator('.rail-sync').click();
  const conflicts = page.locator('.sync-conflicts');
  await expect(conflicts).toContainText('First tab title');
  await expect(conflicts).toContainText('Second tab title');
  await expect(conflicts.getByLabel('Option 1', { exact: true })).toHaveValue(/^Title: /u);
  await expect(conflicts.getByLabel('Option 2', { exact: true })).toHaveValue(/^Title: /u);

  await page.setViewportSize({ width: 390, height: 780 });
  const boxes = await conflicts.locator('textarea').evaluateAll((fields) =>
    fields.map((field) => {
      const rect = field.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  expect(boxes).toHaveLength(2);
  expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(1);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.locator('.rail-sync').click();
  await expect(page.locator('.sync-conflicts')).toContainText('Second tab title');
  await page
    .locator('.sync-conflict')
    .getByRole('button', { name: 'Keep option 1', exact: true })
    .click();
  await expect(page.locator('.sync-conflicts')).toHaveCount(0);
  await expect(tab.locator('.rail-sync')).toHaveCount(0);
});

test('connected tabs save independently and an isolated device receives their edits after one closes', async ({
  page,
  browser,
  application: server,
}) => {
  await page.goto('/');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.locator('.sync-server-summary')).toContainText(server.origin);
  await page.getByLabel('Email', { exact: true }).fill('multi-tab-browser@rillday.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disconnect server', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await add(page, 'After connecting');
  const tab = await second(page);
  await expect(titles(tab)).toHaveText(['After connecting']);
  await add(tab, 'Saved in secondary tab');
  await expect(page.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');

  await page.close();
  await titles(tab).filter({ hasText: 'After connecting' }).dblclick();
  await tab.locator('.inline-title').fill('Saved after closing primary tab');
  await tab.locator('.inline-title').press('Enter');
  await expect
    .poll(async () =>
      (await storedWorkspace(tab)).tasks.some(
        (task) => task.title === 'Saved after closing primary tab',
      ),
    )
    .toBe(true);
  await expect(tab.locator('.rail-sync')).toHaveAttribute('data-sync-state', 'synced');

  await reloadSavedPage(tab);
  await expect(titles(tab).filter({ hasText: 'Saved after closing primary tab' })).toHaveCount(1);
  const expectedTitles = await titles(tab).allTextContents();

  const device = await browser.newContext({ baseURL: server.origin, locale: 'en-US' });
  try {
    const observer = await device.newPage();
    await observer.goto('/');
    await observer.getByLabel('Settings and backup', { exact: true }).click();
    await observer
      .locator('.settings-nav')
      .getByRole('button', { name: 'Sync', exact: true })
      .click();
    await expect(observer.locator('.sync-server-summary')).toContainText(server.origin);
    await observer.getByLabel('Email', { exact: true }).fill('multi-tab-browser@rillday.test');
    await observer.getByLabel('Password', { exact: true }).fill(password);
    await observer.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      observer.getByRole('button', { name: 'Disconnect server', exact: true }),
    ).toBeVisible();
    await observer.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(titles(observer)).toHaveText(expectedTitles);
  } finally {
    await device.close();
  }
});

test('a workspace transition preserves unfinished capture in accessible desktop and mobile recovery', async ({
  page,
  application: server,
}) => {
  await page.goto('/');
  await add(page, 'Data before connecting');
  const tab = await second(page);
  const draft = 'Unsubmitted input ' + 'x'.repeat(1600) + '\nKeep the next line too';
  await tab.locator('#quick-add-input').fill(draft);
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Sync', exact: true }).click();
  await page.locator('.sync-login-form').waitFor();
  await expect(page.locator('.sync-server-summary')).toContainText(server.origin);
  const setup = await page.getByRole('form', { name: 'Set up administrator', exact: true }).count();
  await page.getByLabel('Email', { exact: true }).fill('multi-tab-browser@rillday.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: setup ? 'Create administrator' : 'Sign in', exact: true })
    .click();
  await page.getByRole('button', { name: 'Use server data only', exact: true }).click();
  await expect(tab.locator('.rail-sync')).toBeVisible();
  await tab.getByLabel('Settings and backup', { exact: true }).click();
  await tab.locator('.settings-nav').getByRole('button', { name: 'Sync', exact: true }).click();
  await tab.getByText('Recover saved data', { exact: true }).click();
  const trigger = tab.getByRole('button', { name: 'View unfinished inputs', exact: true }).last();
  for (const width of [1280, 390]) {
    await tab.setViewportSize({ width, height: 800 });
    await trigger.click();
    const dialog = tab.getByRole('dialog', { name: 'Saved inputs', exact: true });
    const input = dialog.getByLabel('Input 1', { exact: true });
    await expect(input).toHaveValue(draft);
    await expect(input).toHaveAttribute('readonly', '');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await tab.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await tab.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(tab.locator('#quick-add-input')).toHaveValue('');
});
