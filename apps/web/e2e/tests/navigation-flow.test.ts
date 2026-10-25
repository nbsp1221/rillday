import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { storedWorkspace } from '../support/storage';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
}

async function add(page: Page, title: string) {
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill(title);
  await input.press('Enter');
}

async function savedTasks(page: Page) {
  return (await storedWorkspace(page)).tasks;
}

test('global capture shortcut opens Inbox without inheriting a view date or label and retains the view draft', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Classified task #work today');
  await page
    .locator('.task-sidebar .sidebar-item')
    .filter({ hasText: /^work1$/ })
    .click();
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Draft in label view');
  await page.keyboard.press('Control+n');
  await expect(page.locator('.workspace-header h1')).toHaveText('Inbox');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await add(page, 'Globally captured task');
  await expect
    .poll(async () =>
      (await savedTasks(page)).find((task) => task.title === 'Globally captured task'),
    )
    .toMatchObject({ listId: 'inbox', date: null, tags: [] });
  await page
    .locator('.task-sidebar .sidebar-item')
    .filter({ hasText: /^work1$/ })
    .click();
  await expect(input).toHaveValue('Draft in label view');
  await page
    .locator('.task-sidebar .sidebar-item')
    .filter({ hasText: /^Today1$/ })
    .click();
  await page.keyboard.press('Control+n');
  await expect(page.locator('.workspace-header h1')).toHaveText('Inbox');
  await expect(input).toBeFocused();
});

test('content sidebar toggle preserves task context and edits and leaves the primary rail available', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Task retained while collapsed');
  await page.locator('.task-title').click();
  await page.getByLabel('Task description', { exact: true }).fill('Authored description');
  const contentBefore = await visibleBox(page.locator('.workspace-layout'));

  await page.getByLabel('Hide sidebar', { exact: true }).click();
  await expect(page.locator('.task-sidebar')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Main navigation', exact: true }),
  ).toBeVisible();
  expect((await visibleBox(page.locator('.workspace-layout'))).width).toBeGreaterThan(
    contentBefore.width,
  );
  await expect(page.getByLabel('Task description', { exact: true })).toHaveText(
    'Authored description',
  );
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await expect(page.locator('.workspace-sidebar-toggle')).toHaveCount(0);
  await expect(page.locator('.workspace-icon')).toHaveCount(0);
  await page.getByLabel('Tasks', { exact: true }).click();
  await page.getByLabel('Show sidebar', { exact: true }).click();
  await expect(page.locator('.task-sidebar')).toBeVisible();
  await expect(page.locator('.workspace-header h1')).toHaveText('Inbox');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await expect(page.locator('.workspace-sidebar-toggle')).toHaveCount(0);
  await expect(page.locator('.settings-nav')).toBeVisible();
});

test('narrow sidebar contains keyboard focus, dismisses safely and lets global capture focus the input', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const toggle = page.getByLabel('Show sidebar', { exact: true });
  await toggle.click();
  const sheet = page.getByRole('dialog', { name: 'Task navigation', exact: true });
  await expect(sheet).toBeVisible();
  await expect
    .poll(() =>
      sheet.evaluate((element) => {
        const railElement = document.querySelector('.app-rail');
        if (railElement === null) {
          throw new Error("Expected element matching '.app-rail'");
        }
        const rail = railElement.getBoundingClientRect().width;
        return Math.round((element.getBoundingClientRect().x - rail) * 100) / 100;
      }),
    )
    .toBe(0);
  const geometry = await sheet.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const entry = document.querySelector('.rillday-app');
    if (entry === null) {
      throw new Error('Missing entry');
    }
    const app = getComputedStyle(entry);
    const railElement2 = document.querySelector('.app-rail');
    if (railElement2 === null) {
      throw new Error("Expected element matching '.app-rail'");
    }
    const rail = railElement2.getBoundingClientRect().width;
    const saved = parseFloat(app.getPropertyValue('--sidebar-width'));
    return { x: box.x, width: box.width, rail, expected: Math.min(saved, innerWidth - rail - 16) };
  });
  expect(geometry.x).toBe(geometry.rail);
  expect(geometry.width).toBe(geometry.expected);
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => sheet.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await sheet.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.workspace-header h1')).toHaveText('Completed');
  await toggle.click();
  await page.keyboard.press('Control+n');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.workspace-header h1')).toHaveText('Inbox');
  await expect(page.getByLabel('Quick add task', { exact: true })).toBeFocused();
  await add(page, 'Capture on narrow screen');
  await expect(page.locator('.task-title')).toHaveText('Capture on narrow screen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('sidebar motion preserves content width, supports reversal and honors reduced motion', async ({
  page,
}) => {
  await ready(page);
  const sidebar = page.locator('.task-sidebar');
  const widths = await sidebar.evaluate(async (element) => {
    const full = element.getBoundingClientRect().width;
    const matchedElement = document.querySelector<HTMLButtonElement>('.workspace-sidebar-toggle');
    if (matchedElement === null) {
      throw new Error("Expected element matching '.workspace-sidebar-toggle'");
    }
    matchedElement.click();

    let transition: Animation | undefined;
    for (let frame = 0; frame < 60; frame++) {
      const matchedElement2 = document.querySelector('#workspace-sidebar-panel');
      if (matchedElement2 === null) {
        throw new Error("Expected element matching '#workspace-sidebar-panel'");
      }
      transition = matchedElement2
        .getAnimations()
        .find((animation) => animation.playState === 'running');
      if (transition) {
        break;
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
    if (!transition) {
      throw new Error('Sidebar panel did not create its layout transition');
    }

    transition.pause();
    transition.currentTime = 100;
    const widthsElement = element.querySelector('.collapsible-sidebar-inner');
    if (widthsElement === null) {
      throw new Error("Expected element matching '.collapsible-sidebar-inner'");
    }
    const widths = {
      full,
      during: element.getBoundingClientRect().width,
      inner: widthsElement.getBoundingClientRect().width,
    };
    transition.play();
    return widths;
  });
  expect(widths.during).toBeGreaterThan(0);
  expect(widths.during).toBeLessThan(widths.full);
  expect(widths.inner).toBe(widths.full);
  await expect(sidebar).toBeHidden();
  await expect(sidebar).toHaveAttribute('inert', '');
  await page.getByLabel('Show sidebar', { exact: true }).click();
  await expect.poll(async () => (await visibleBox(sidebar)).width).toBe(widths.full);
  await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('.workspace-sidebar-toggle');
    if (button === null) {
      throw new Error('Missing button');
    }
    button.click();
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    button.click();
  });
  await expect.poll(async () => (await visibleBox(sidebar)).width).toBe(widths.full);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('Hide sidebar', { exact: true }).click();
  await expect(sidebar).toBeHidden();
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.workspace-sidebar-toggle')).toHaveCount(0);
  await expect(page.locator('.settings-nav')).toBeVisible();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await expect(page.locator('.settings-header h2')).toHaveText('Appearance');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('Lists and Labels collapse independently without losing scope or drafts, and Plus supports hover and keyboard', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  const lists = page
    .locator('.sidebar-group')
    .filter({ has: page.getByRole('button', { name: 'Lists', exact: true }) });
  const labels = page
    .locator('.sidebar-group')
    .filter({ has: page.getByRole('button', { name: 'Labels', exact: true }) });
  const listToggle = lists.locator('.sidebar-section-toggle');
  const labelToggle = labels.locator('.sidebar-section-toggle');
  await page.mouse.move(600, 600);
  await page.locator('.workspace-header h1').click();
  await expect(lists.locator('.sidebar-group-add')).toHaveCSS('opacity', '0');
  await lists.locator('.sidebar-section-heading').hover();
  await expect(lists.locator('.sidebar-group-add')).toHaveCSS('opacity', '1');
  const hover = await lists.locator('.sidebar-section-heading').evaluate((heading) => {
    const hoverElement = document.querySelector('.sidebar-item');
    if (hoverElement === null) {
      throw new Error("Expected element matching '.sidebar-item'");
    }
    const entry1 = heading.querySelector('.sidebar-section-toggle');
    if (entry1 === null) {
      throw new Error('Missing entry');
    }
    return {
      fill: getComputedStyle(heading).backgroundColor,
      inner: getComputedStyle(entry1).backgroundColor,
      height: heading.getBoundingClientRect().height,
      rowHeight: hoverElement.getBoundingClientRect().height,
    };
  });
  expect(hover.fill).not.toBe('rgba(0, 0, 0, 0)');
  expect(hover.inner).toBe('rgba(0, 0, 0, 0)');
  expect(hover.height).toBeLessThan(hover.rowHeight);
  await lists.locator('.sidebar-list').first().locator('button').first().click();
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Draft retained while collapsed');
  await listToggle.click();
  await expect(lists.locator('.sidebar-group-content')).toBeHidden();
  await page.mouse.move(600, 600);
  await expect(lists.locator('.sidebar-group-add')).toHaveCSS('opacity', '0');
  await expect(labelToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(input).toHaveValue('Draft retained while collapsed');
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect(listToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('Draft retained while collapsed');
  await listToggle.focus();
  await page.keyboard.press('Space');
  await expect(listToggle).toHaveAttribute('aria-expanded', 'true');
  await labelToggle.click();
  await expect(labelToggle).toHaveAttribute('aria-expanded', 'false');
  await labelToggle.focus();
  await page.keyboard.press('Tab');
  await expect(labels.locator('.sidebar-group-add')).toBeFocused();
  await expect(labels.locator('.sidebar-group-add')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'New label', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(labelToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.workspace-header h1')).toHaveText('Work and projects');
});

test('pane drags track the pointer without easing, widen past320px and preserve usable content after resizing or cancellation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await ready(page);
  const handle = await visibleBox(page.locator('.sidebar-resize'));

  const start = handle.x + handle.width / 2;
  await page.mouse.move(start, 420);
  const sidebarLine = await page.locator('.sidebar-resize').evaluate((el) => {
    const style = getComputedStyle(el);
    const line = getComputedStyle(el, '::after');
    return {
      background: style.backgroundColor,
      cursor: style.cursor,
      width: line.width,
      right: line.right,
      color: line.backgroundColor,
      expected: style.getPropertyValue('--muted-foreground'),
    };
  });
  expect(sidebarLine.background).toBe('rgba(0, 0, 0, 0)');
  expect(sidebarLine.cursor).toMatch(/^(col|ew)-resize$/);
  expect(sidebarLine.width).toBe('1px');
  expect(sidebarLine.right).toBe('0px');
  expect(sidebarLine.color).not.toBe('rgba(0, 0, 0, 0)');
  await page.mouse.down();
  for (const delta of [40, 100, 200, 400]) {
    await page.mouse.move(start + delta, 420);
    const sample = await page.evaluate(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
      const app = document.querySelector<HTMLElement>('.rillday-app');
      if (app === null) {
        throw new Error('Missing app');
      }
      const sidebar = document.querySelector('.task-sidebar');
      if (sidebar === null) {
        throw new Error('Missing sidebar');
      }
      const actual = sidebar.getBoundingClientRect();
      const matchedElement3 = sidebar.querySelector('.collapsible-sidebar-inner');
      if (matchedElement3 === null) {
        throw new Error("Expected element matching '.collapsible-sidebar-inner'");
      }
      const matchedElement4 = document.querySelector('.workspace-layout');
      if (matchedElement4 === null) {
        throw new Error("Expected element matching '.workspace-layout'");
      }
      return {
        requested: parseFloat(app.style.getPropertyValue('--sidebar-width')),
        actual: actual.width,
        inner: matchedElement3.getBoundingClientRect().width,
        bodyStart: matchedElement4.getBoundingClientRect().left,
        edge: actual.right,
        transition: getComputedStyle(sidebar).transitionDuration,
      };
    });
    expect(Math.abs(sample.actual - sample.requested)).toBeLessThan(1);
    expect(Math.abs(sample.inner - sample.actual)).toBeLessThan(1);
    expect(sample.edge).toBe(sample.bodyStart);
    expect(sample.transition).toBe('0s');
  }
  await page.mouse.up();
  await expect(page.locator('.task-sidebar')).toHaveCSS('width', '480px');
  await expect(page.locator('.sidebar-resize')).not.toHaveAttribute('data-separator', 'active');
  await expect(page.locator('.task-sidebar')).toHaveCSS('transition-duration', '0s');
  const capture = page.getByLabel('Quick add task', { exact: true });
  await capture.fill('Check detail width');
  await capture.press('Enter');
  await page.locator('.task-title').filter({ hasText: 'Check detail width' }).click();
  const detailHandle = await visibleBox(page.locator('.detail-resize'));

  await page.mouse.move(detailHandle.x + 2, 420);
  const detailLine = await page.locator('.detail-resize').evaluate((el) => {
    const style = getComputedStyle(el);
    const line = getComputedStyle(el, '::after');
    return {
      background: style.backgroundColor,
      cursor: style.cursor,
      width: line.width,
      height: line.height,
      left: line.left,
      color: line.backgroundColor,
    };
  });
  expect(detailLine.background).toBe('rgba(0, 0, 0, 0)');
  expect(detailLine.cursor).toMatch(/^(col|ew)-resize$/);
  expect(detailLine.width).toBe('3px');
  expect(detailLine.height).toBe('32px');
  expect(detailLine.left).toBe('6px');
  expect(detailLine.color).toBe(sidebarLine.color);
  await page.mouse.down();
  await page.mouse.move(detailHandle.x - 300, 420);
  await page.mouse.up();
  await expect(page.locator('.detail-pane')).toHaveCSS('width', '540px');
  await page.setViewportSize({ width: 1024, height: 950 });
  await expect
    .poll(async () => (await visibleBox(page.locator('.main-workspace'))).width)
    .toBeGreaterThanOrEqual(300);
  const next = await visibleBox(page.locator('.sidebar-resize'));

  await page.mouse.move(next.x + 2, 420);
  await page.mouse.down();
  await page.mouse.move(next.x - 60, 420);
  await page.evaluate(() =>
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })),
  );
  await expect(page.locator('.sidebar-resize')).not.toHaveAttribute('data-separator', 'active');
  const stopped = (await visibleBox(page.locator('.task-sidebar'))).width;
  await page.mouse.move(next.x - 160, 420);
  await page.mouse.up();
  expect((await visibleBox(page.locator('.task-sidebar'))).width).toBe(stopped);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('mobile sheet moves as one box and honors reduced motion and focus restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByLabel('Show sidebar', { exact: true });
  await toggle.click();
  const sheet = page.getByRole('dialog', { name: 'Task navigation', exact: true });
  await expect(sheet).toBeVisible();
  const geometry = await sheet.evaluate(async (element) => {
    let animation: Animation | undefined;
    for (let frame = 0; frame < 30 && !animation; frame++) {
      animation = element
        .getAnimations()
        .find(
          (candidate) =>
            candidate.effect instanceof KeyframeEffect && candidate.effect.target === element,
        );
      if (!animation) {
        await new Promise(requestAnimationFrame);
      }
    }
    if (!animation) {
      throw new Error('Sheet did not create its native entry animation');
    }
    animation.pause();
    const frames = [40, 100, 160].map((time) => {
      animation.currentTime = time;
      const bounds = element.getBoundingClientRect();
      const contentElement = element.querySelector('.sidebar-scroll');
      if (contentElement === null) {
        throw new Error("Expected element matching '.sidebar-scroll'");
      }
      const content = contentElement.getBoundingClientRect();
      return { width: bounds.width, contentWidth: content.width, offset: content.x - bounds.x };
    });
    animation.play();
    return frames;
  });
  for (const frame of geometry) {
    expect(frame).toEqual(geometry[0]);
  }

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});
