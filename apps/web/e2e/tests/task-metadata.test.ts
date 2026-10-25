import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import invariant from 'tiny-invariant';
import { appearance } from '../support/appearance';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

async function editLabel(page: Page, name: string) {
  const row = page.locator('.sidebar-label').filter({ hasText: name });
  await row.hover();
  await row.locator('.entity-edit').click();
}

async function color(page: Page, value: string) {
  await page.getByRole('button', { name: 'Label color', exact: true }).click();
  await page.getByRole('button', { name: 'Custom color', exact: true }).click();
  const hex = page.getByLabel('HEX color', { exact: true });
  await hex.fill(value);
  await hex.press('Enter');
}

test('label color edits propagate to neutral metadata, detail, sidebar and rename without changing row geometry', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.smart-lists>button').nth(3).click();
  const row = page
    .locator('.task-row')
    .filter({
      has: page.locator('.task-title', { hasText: 'Choose three priorities for the coming week' }),
    })
    .first();
  const height = (await visibleBox(row)).height;
  await editLabel(page, 'planning');
  await color(page, '#a855f7');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.smart-lists>button').nth(3).click();
  for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const icon = row.locator('.inline-tag').filter({ hasText: 'planning' }).locator('svg');
    await expect(icon).toHaveCSS('color', 'rgb(168, 85, 247)');
    const sidebar = page.locator('.sidebar-label').filter({ hasText: 'planning' });
    await expect(sidebar.locator('button>svg').first()).toHaveCSS('color', 'rgb(168, 85, 247)');
    const workIcon = page
      .locator('.row-list')
      .filter({ hasText: 'Work and projects' })
      .first()
      .locator('svg');
    const sidebarIcon = page
      .locator('.sidebar-list')
      .filter({ hasText: 'Work and projects' })
      .locator('button>svg')
      .first();
    expect(await workIcon.evaluate((el) => getComputedStyle(el).color)).toBe(
      await sidebarIcon.evaluate((el) => getComputedStyle(el).color),
    );
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await row.locator('.task-title').click();
      const token = page.locator('.td-tag-chips .inline-tag').filter({ hasText: 'planning' });
      await expect(token.locator('svg')).toHaveCSS('color', 'rgb(168, 85, 247)');
      expect((await appearance(token)).contrast).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.getByLabel('Close task details', { exact: true }).click();
      expect(
        (await appearance(row.locator('.inline-tag').filter({ hasText: 'planning' }))).contrast,
      ).toBeGreaterThanOrEqual(4.5);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    expect((await visibleBox(row)).height).toBe(height);
  }
  await editLabel(page, 'planning');
  await page.getByRole('dialog').getByRole('textbox', { name: 'Name', exact: true }).fill('Focus');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.sidebar-label').filter({ hasText: 'planning' })).toHaveCount(0);
  await expect(
    page.locator('.sidebar-label').filter({ hasText: 'Focus' }).locator('button>svg').first(),
  ).toHaveCSS('color', 'rgb(168, 85, 247)');
  await expect
    .poll(async () => {
      const workspace = await storedWorkspace(page);
      return {
        renamed: workspace.labels?.includes('Focus'),
        color: workspace.labelColors?.['Focus'],
        old: workspace.labels?.includes('planning'),
        taskRenamed: workspace.tasks.some((task) => task.tags.includes('Focus')),
        oldTaskTag: workspace.tasks.some((task) => task.tags.includes('planning')),
      };
    })
    .toEqual({ renamed: true, color: '#a855f7', old: false, taskRenamed: true, oldTaskTag: false });
  await reloadSavedPage(page);
  await page.locator('.task-title').first().click();
  await expect(
    page.locator('.td-tag-chips .inline-tag').filter({ hasText: 'Focus' }).locator('svg'),
  ).toHaveCSS('color', 'rgb(168, 85, 247)');
});

test('label color cancel, reset and deletion preserve tasks and Undo restores color metadata', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#quick-add-input').fill('Category color #test');
  await page.locator('#quick-add-input').press('Enter');
  await page.locator('#quick-add-input').press('Escape');
  await editLabel(page, 'test');
  await color(page, '#ef4444');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await editLabel(page, 'test');
  await expect(page.getByRole('button', { name: 'Label color', exact: true })).toHaveText(
    'Default color',
  );
  await color(page, '#22c55e');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await editLabel(page, 'test');
  await page.getByRole('button', { name: 'Label color', exact: true }).click();
  await page.getByRole('button', { name: 'Default color', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await editLabel(page, 'test');
  await expect(page.getByRole('button', { name: 'Label color', exact: true })).toHaveText(
    'Default color',
  );
  await color(page, '#22c55e');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await editLabel(page, 'test');
  await page.getByRole('button', { name: 'Delete label', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.locator('.inline-tag')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.sidebar-label svg').first()).toHaveCSS('color', 'rgb(34, 197, 94)');
});

test('labels keep hashtag capture, filtering and detail edits consistent in both languages', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Task organized with labels #work #planning');
  await input.press('Enter');
  await expect(page.locator('.task-meta .inline-tag')).toHaveText(['work', 'planning']);
  const label = page.locator('.task-sidebar .sidebar-item').filter({ hasText: /^work/ });
  await label.click();
  await expect(page.locator('.workspace-header h1')).toHaveText('work');
  await page.locator('.task-title').click();
  await page.getByLabel('Add labels', { exact: true }).click();
  await page.getByLabel('Labels to add', { exact: true }).fill('Review');
  await page.getByLabel('Add entered labels', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.td-tag-chips')).toContainText('Review');
  await page.getByLabel('Add labels', { exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Edit labels', exact: true })
    .getByRole('button', { name: 'planning', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.td-tag-chips')).not.toContainText('planning');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'en');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.locator('.sidebar-section-heading').filter({ hasText: 'Labels' }),
  ).toBeVisible();
  await expect(page.getByLabel('Add labels', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.tags)
    .toEqual(['work', 'Review']);
  await reloadSavedPage(page);
  await expect(page.locator('.task-meta .inline-tag')).toHaveText(['work', 'Review']);
});

test('empty labels survive reload and support contextual capture, rename, removal and undo', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar-section-heading').filter({ hasText: 'Labels' }).hover();
  await page.getByLabel('Create label', { exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('existing');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.workspace-header h1')).toHaveText('existing');
  await expect.poll(async () => (await storedWorkspace(page)).labels).toContain('existing');
  await reloadSavedPage(page);
  const row = page
    .locator('.sidebar-label')
    .filter({ has: page.getByLabel('Edit label existing', { exact: true }) });
  await expect(row).toBeVisible();
  await row.locator('button').first().click();
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Task added in category');
  await input.press('Enter');
  await expect(page.locator('.inline-tag')).toHaveText('existing');
  await row.hover();
  await row.getByLabel('Edit label existing', { exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('organizing');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.inline-tag')).toHaveText('organizing');
  const renamed = page.locator('.sidebar-label').filter({ hasText: /^organizing1$/ });
  await renamed.hover();
  await renamed.getByLabel('Edit label organizing', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete label', exact: true }).click();
  await expect(page.locator('.sidebar-label')).toHaveCount(0);
  await expect(page.locator('.task-title')).toHaveText('Task added in category');
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.inline-tag')).toHaveText('organizing');
  await expect
    .poll(async () => {
      const workspace = await storedWorkspace(page);
      invariant(workspace.tasks[0] !== undefined, 'Missing workspace.tasks[0]');
      return { labels: workspace.labels, tags: workspace.tasks[0].tags };
    })
    .toEqual({ labels: ['organizing'], tags: ['organizing'] });
  await reloadSavedPage(page);
  await expect(page.locator('.sidebar-label').filter({ hasText: /^organizing1$/ })).toBeVisible();
});
