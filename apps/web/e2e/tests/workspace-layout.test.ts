import { expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';
import { storedWorkspace } from '../support/storage';
import { archiveFixture } from '../support/workspace-archive';

test('task destinations keep the requested order without a brand row or duplicate status links', async ({
  page,
}) => {
  await page.goto('/');
  const destinations = ['list:inbox', 'today', 'next', 'all', 'completed', 'trash'];
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'ko');
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  for (const language of ['ko', 'en']) {
    const names =
      language === 'ko'
        ? ['수집함', '오늘', '다음 7일', '모든 할 일', '완료', '휴지통']
        : ['Inbox', 'Today', 'Next 7 days', 'All tasks', 'Completed', 'Trash'];
    await expect(page.locator('.smart-lists button > span')).toHaveText(names);
    await expect(page.locator('.sidebar-header, .profile-title')).toHaveCount(0);
    for (const name of names) {
      const button = page.locator('.task-sidebar').getByRole('button', { name, exact: true });
      await expect(button).toHaveCount(1);
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.workspace-header h1')).toHaveText(name);
    }
    const alignment = await page
      .locator('.smart-lists button')
      .first()
      .evaluate((button) => {
        const row = button.getBoundingClientRect();
        const header = document.querySelector('.workspace-header')!.getBoundingClientRect();
        return Math.abs(row.y + row.height / 2 - header.y - header.height / 2);
      });
    expect(alignment).toBeLessThan(1);
    await page.setViewportSize({ width: 390, height: 844 });
    const select = page.locator('.mobile-task-scope');
    await select.click();
    await expect
      .poll(() =>
        page
          .getByRole('option')
          .evaluateAll((options) => options.map((option) => option.getAttribute('data-value'))),
      )
      .toEqual(destinations);
    await page.keyboard.press('Escape');
    for (let index = 0; index < destinations.length; index++) {
      await chooseChoice(page, select, destinations[index]);
      await expect(page.locator('.workspace-header h1')).toHaveText(names[index]);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    if (language === 'ko') {
      await page.getByLabel('설정과 백업', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('언어', { exact: true }), 'en');
      await page.getByRole('button', { name: 'Back', exact: true }).click();
    }
  }
  await page.getByLabel('Current workspace', { exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('primary navigation and task context remain separate across view changes', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Task preserving context #work today');
  await input.press('Enter');
  await page.locator('.task-sidebar .sidebar-item').filter({ hasText: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  for (const area of ['Eisenhower Matrix', 'Calendar', 'Habit tracker']) {
    await page.getByLabel(area, { exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.task-sidebar')).toHaveCount(0);
    await expect(page.locator('.workspace-header')).toBeVisible();
  }
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(page.locator('.task-sidebar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.task-title')).toHaveText('Task preserving context');
});

test('narrow task context selector reaches tags, completion and trash without hiding primary navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Task to find on mobile #work');
  await input.press('Enter');
  const scope = page.getByRole('combobox', { name: 'Choose a list', exact: true });
  await chooseChoice(page, scope, 'tag:work');
  await expect(page.locator('.task-title')).toHaveText('Task to find on mobile');
  await page.locator('.task-title').click();
  await page.getByLabel('Complete task', { exact: true }).click();
  await page.getByLabel('Close task details', { exact: true }).click();
  await chooseChoice(page, scope, 'completed');
  await expect(page.locator('.task-title')).toHaveText('Task to find on mobile');
  await chooseChoice(page, scope, 'trash');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(scope).toHaveAttribute('data-value', 'trash');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('empty Lists and Labels use the same aligned creation action and keyboard behavior', async ({
  page,
}) => {
  await page.goto('/');
  const list = page.getByRole('button', { name: 'New list', exact: true });
  const label = page.getByRole('button', { name: 'New label', exact: true });
  await expect(list).toBeVisible();
  await expect(label).toBeVisible();
  const geometry = await page.locator('.sidebar-add').evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const icon = element.querySelector('svg')!.getBoundingClientRect();
      return {
        x: bounds.x,
        width: bounds.width,
        height: bounds.height,
        padding: style.padding,
        font: style.font,
        color: style.color,
        iconX: icon.x,
      };
    }),
  );
  expect(geometry).toHaveLength(2);
  expect(geometry[0]).toEqual(geometry[1]);

  for (const action of [label, list]) {
    await action.focus();
    await action.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(action).toBeFocused();
  }
});

test('a long grouped mobile scope menu opens with the selected item visible and keeps drafts and row geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/?demo=1');
  const data = await storedWorkspace(page);
  const labels = Array.from({ length: 60 }, (_, i) => `Label${String(i).padStart(2, '0')}`);
  const last = 'z' + 'long'.repeat(15);
  data.labels = [...labels, last];
  await page.locator('input[type=file]').setInputFiles({
    name: 'choices.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await archiveFixture(data, 'Asia/Seoul')),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  const trigger = page.getByRole('combobox', { name: 'Choose a list', exact: true });
  await chooseChoice(page, trigger, `tag:${last}`);
  await page.locator('#quick-add-input').fill('Keep this draft');
  const header = await page.locator('.workspace-header').boundingBox();
  const triggerBox = (await trigger.boundingBox())!;
  const actions = (await page.locator('.workspace-actions').boundingBox())!;
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(actions.x - 3.5);
  await trigger.hover();
  expect(await trigger.boundingBox()).toEqual(triggerBox);
  await trigger.click();
  const menu = page.getByRole('listbox', { name: 'Choose a list', exact: true });
  const selected = menu.getByRole('option', { selected: true });
  await expect(selected).toBeFocused();
  const m = (await menu.boundingBox())!;
  const s = (await selected.boundingBox())!;
  expect(s.y).toBeGreaterThanOrEqual(m.y);
  expect(s.y + s.height).toBeLessThanOrEqual(m.y + m.height);
  expect(s.height).toBe(32);
  await expect(menu.getByRole('group', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(menu.getByRole('group', { name: 'Lists', exact: true })).toBeVisible();
  await expect(menu.getByRole('group', { name: 'Labels', exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('option').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(selected).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.locator('.workspace-header').boundingBox()).toEqual(header);
  await chooseChoice(page, trigger, 'all');
  await chooseChoice(page, trigger, `tag:${last}`);
  await expect(page.locator('#quick-add-input')).toHaveValue('Keep this draft');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('a responsive scope popup dismisses when its header trigger disappears', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/?demo=1');
  await page.getByRole('combobox', { name: 'Choose a list', exact: true }).click();
  await expect(page.getByRole('listbox', { name: 'Choose a list', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('listbox', { name: 'Choose a list', exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-header h1')).toBeVisible();
});

test('rail controls share alignment, hit areas and edge spacing across viewport sizes', async ({
  page,
}) => {
  await page.goto('/');
  for (const viewport of [
    { width: 1440, height: 950 },
    { width: 390, height: 844 },
    { width: 1024, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('.app-rail').evaluate((rail) => {
      const bounds = rail.getBoundingClientRect();
      const buttons = [...rail.querySelectorAll('button')].map((button) =>
        button.getBoundingClientRect(),
      );
      const top = buttons.slice(0, 4);
      const bottom = buttons.slice(4);
      return {
        centers: buttons.map((button) => button.x + button.width / 2),
        sizes: buttons.map((button) => [button.width, button.height]),
        insetTop: top[0].top - bounds.top,
        insetBottom: bounds.bottom - bottom.at(-1)!.bottom,
        insetLeft: top[0].left - bounds.left,
        insetRight:
          bounds.right - top[0].right - parseFloat(getComputedStyle(rail).borderRightWidth),
        gaps: [top, bottom].flatMap((group) =>
          group.slice(1).map((button, index) => button.top - group[index].bottom),
        ),
      };
    });
    expect(new Set(geometry.centers).size).toBe(1);
    expect(new Set(geometry.sizes.map((size) => size.join(':'))).size).toBe(1);
    expect(new Set(geometry.gaps).size).toBe(1);
    expect(geometry.insetTop).toBe(geometry.insetBottom);
    expect(geometry.insetLeft).toBe(geometry.insetRight);
    expect(geometry.insetTop).toBe(geometry.insetLeft);
    for (const area of ['Tasks', 'Eisenhower Matrix', 'Calendar', 'Habit tracker']) {
      await page.getByLabel(area, { exact: true }).click();
      await expect(page.getByLabel(area, { exact: true })).toHaveAttribute('aria-current', 'page');
    }
    await page.getByLabel('Tasks', { exact: true }).click();
  }
});

test.describe(() => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('touch rail keeps generous targets for every destination including profiles', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.app-rail button')).toHaveCount(7);
    const sizes = await page.locator('.app-rail button').evaluateAll((buttons) =>
      buttons.map((button) => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      })),
    );
    expect(sizes).toHaveLength(7);
    expect(sizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
    await page.getByLabel('Settings and backup', { exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('.rail-label:visible')).toHaveCount(0);
    await page.getByLabel('Current workspace', { exact: true }).tap();
    await expect(
      page.getByRole('dialog', { name: 'Current workspace', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });
});

test('rail labels appear beside icons for hover and keyboard, without native titles or a duplicate brand', async ({
  page,
}) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(rail.getByRole('button')).toHaveCount(7);
  expect(await rail.locator('button[title]').count()).toBe(0);
  const tasks = rail.getByRole('button', { name: 'Tasks', exact: true });
  const label = page.locator('.rail-label');
  await expect(label).toBeHidden();
  await tasks.hover();
  await expect(label).toBeVisible();
  const buttonBox = (await tasks.boundingBox())!;
  const labelBox = (await label.boundingBox())!;
  expect(labelBox.x).toBeGreaterThan(buttonBox.x + buttonBox.width);
  expect(
    Math.abs(labelBox.y + labelBox.height / 2 - buttonBox.y - buttonBox.height / 2),
  ).toBeLessThan(1);
  await page.keyboard.press('Escape');
  await expect(label).toBeHidden();
  await page.mouse.move(500, 500);
  await page.keyboard.press('Tab');
  const focused = rail.locator('button:focus-visible');
  await expect(label).toBeVisible();
  await expect(label).toContainText((await focused.getAttribute('aria-label'))!);
  await focused.press('Escape');
  await expect(label).toBeHidden();
  const matrix = rail.getByRole('button', { name: 'Eisenhower Matrix', exact: true });
  await matrix.hover();
  await expect(label).toBeVisible();
  await expect(label).toHaveText('Eisenhower Matrix');
  await matrix.click();
  await expect(label).toBeHidden();
});

test('task typography retains its role on narrow screens and icon geometry stays consistent across areas', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Research to read #work tomorrow');
  await input.press('Enter');
  await page.locator('.task-title').click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.task-title')).toHaveCSS('font-size', '14px');
    await expect(page.locator('.task-meta')).toHaveCSS('font-size', '12px');
    await expect(page.getByLabel('Task title', { exact: true })).toHaveCSS('font-size', '16px');
    await expect(page.getByLabel('Task description', { exact: true })).toHaveCSS(
      'font-size',
      '14px',
    );
  }
  await page.getByLabel('Close task details', { exact: true }).click();
  for (const area of [
    'Tasks',
    'Eisenhower Matrix',
    'Calendar',
    'Habit tracker',
    'Settings and backup',
  ]) {
    await page.getByLabel(area, { exact: true }).click();
    await expect(page.locator('.workspace-header h1')).toHaveCSS('font-size', '20px');
    await expect(page.locator('.workspace-caption, .workspace-count, .save-indicator')).toHaveCount(
      0,
    );
    const icons = await page.locator('svg.lucide').evaluateAll((nodes) =>
      nodes.map((node) => ({
        size: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        stroke: getComputedStyle(node).strokeWidth,
      })),
    );
    expect(icons.length).toBeGreaterThan(7);
    expect(icons.every((icon) => icon.stroke === '2px')).toBe(true);
    expect(
      icons.every(
        (icon) => [12, 14, 16, 18, 24, 40].includes(icon.size) && icon.height === icon.size,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});

test('bundled Pretendard actually renders Korean and Latin and primary area labels match their headers', async ({
  page,
  context,
}) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('.woff2')) {
      fontRequests.push(request.url());
    }
  });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('한글과 English 012345');
  await input.press('Enter');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.task-title')).toHaveCSS('font-size', '14px');
  const client = await context.newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const domDocument = await client.send('DOM.getDocument');
  const node = await client.send('DOM.querySelector', {
    nodeId: domDocument.root.nodeId,
    selector: '.task-title',
  });
  const result = await client.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId });
  expect(result.fonts.length).toBeGreaterThan(0);
  expect(
    result.fonts.every((font) => font.isCustomFont && font.familyName.includes('Pretendard')),
  ).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(
    true,
  );
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Language', { exact: true }), 'en');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  for (const title of ['Eisenhower Matrix', 'Calendar', 'Habit tracker']) {
    await page.getByLabel(title, { exact: true }).click();
    await expect(page.locator('.workspace-header h1')).toHaveText(title);
    await page.mouse.move(500, 500);
    await page.getByLabel(title, { exact: true }).hover();
    await expect(page.locator('.rail-label:visible')).toHaveText(title);
  }
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(page.locator('.task-title')).toHaveText('한글과 English 012345');
});

test('custom list hover paints one row while keeping the edit action inside its bounds', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const row = page.locator('.sidebar-list').first();
    await row.hover();
    await expect(row.locator('.entity-edit')).toHaveCSS('opacity', '1');
    await expect(row.locator('.entity-count')).toHaveCSS('opacity', '0');
    const state = await row.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const action = element.querySelector('.entity-edit')!.getBoundingClientRect();
      return {
        parentFill: getComputedStyle(element).backgroundColor,
        childFill: getComputedStyle(element.querySelector('button')!).backgroundColor,
        actionInside:
          action.left >= box.left &&
          action.right <= box.right &&
          action.top >= box.top &&
          action.bottom <= box.bottom,
      };
    });
    expect(state.parentFill).not.toBe('rgba(0, 0, 0, 0)');
    expect(state.childFill).toBe('rgba(0, 0, 0, 0)');
    expect(state.actionInside).toBe(true);
    await row.locator('button').first().click();
    await row.hover();
    await expect(row).toHaveClass(/active/);
    await expect(row.locator('button').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await row.locator('.entity-edit').click();
    await expect(page.getByLabel('List name', { exact: true })).toHaveValue('Work and projects');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.move(600, 600);
    await page.locator('.workspace-header h1').click();
    await expect(row.locator('.entity-count')).toHaveCSS('opacity', '1');
    const counts = await page
      .locator('.sidebar-entity .entity-count')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right));
    expect(new Set(counts).size).toBe(1);
    const alignment = await page.locator('.task-sidebar').evaluate((sidebar) => {
      const center = (element: Element) => {
        const box = element.getBoundingClientRect();
        return box.x + box.width / 2;
      };

      const controls = [
        ...sidebar.querySelectorAll(
          '.sidebar-section-heading .icon-button svg, .sidebar-item small, .entity-edit svg',
        ),
      ].map(center);
      const gaps = [...sidebar.querySelectorAll('.sidebar-items')].flatMap((group) => {
        const rows = [...group.querySelectorAll('.sidebar-item')];
        return rows
          .slice(1)
          .flatMap((row, index) =>
            rows[index].nextElementSibling === row
              ? [row.getBoundingClientRect().top - rows[index].getBoundingClientRect().bottom]
              : [],
          );
      });
      return { axisSpread: Math.max(...controls) - Math.min(...controls), gaps };
    });
    expect(alignment.axisSpread).toBeLessThan(1);
    expect(new Set(alignment.gaps).size).toBe(1);
  }
});
