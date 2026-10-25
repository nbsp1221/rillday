import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { chooseChoice } from '../support/choice';
import { storedWorkspace } from '../support/storage';

async function scope(page: Page, value: string) {
  if ((page.viewportSize()?.width ?? 0) < 900) {
    const actual =
      value === 'list:work'
        ? `list:${(await storedWorkspace(page)).lists.find((l) => l.name === 'Work and projects')?.id}`
        : value;
    await chooseChoice(
      page,
      page.getByRole('combobox', { name: 'Choose a list', exact: true }),
      actual,
    );
    return;
  }
  const smartLabels: Record<string, RegExp> = {
    'list:inbox': /^Inbox/,
    'today': /^Today/,
    'next': /^Next 7 days/,
    'all': /^All tasks/,
    'completed': /^Complete/,
    'trash': /^Trash/,
  };
  const smart = smartLabels[value];

  if (smart) {
    await page.locator('.smart-lists').getByRole('button', { name: smart }).click();
  } else {
    await page
      .locator(
        value === 'list:work' ? '.sidebar-entity.sidebar-list' : '.sidebar-entity.sidebar-label',
      )
      .filter({ hasText: value === 'list:work' ? 'Work and projects' : 'work' })
      .locator('button')
      .first()
      .click();
  }
}

test('all task scopes share balanced content, row and capture bounds with and without scrolling', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=1');
  await page
    .locator('#quick-add-input')
    .fill(Array.from({ length: 30 }, (_, i) => `Long list review ${i}`).join('\n'));
  await page.locator('#quick-add-input').press('Enter');
  await page.locator('#quick-add-input').press('Escape');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    for (const value of [
      'list:inbox',
      'today',
      'next',
      'all',
      'list:work',
      'tag:work',
      'completed',
      'trash',
    ]) {
      await scope(page, value);
      const geometry = await page.locator('.task-scroll').evaluate((el) => {
        const scroll = el.getBoundingClientRect();
        const stackElement = el.querySelector('.task-content-stack');
        if (stackElement === null) {
          throw new Error("Expected element matching '.task-content-stack'");
        }
        const stack = stackElement.getBoundingClientRect();
        const rowElement = el.querySelector('.task-items > .task-row');
        if (rowElement === null) {
          throw new Error("Expected element matching '.task-items > .task-row'");
        }
        const row = rowElement.getBoundingClientRect();
        const capture = document.querySelector('.quick-add')?.getBoundingClientRect();
        return {
          left: stack.x - scroll.x,
          right: scroll.right - stack.right,
          top: stack.y - scroll.y,
          rowLeft: row.x - stack.x,
          rowRight: stack.right - row.right,
          captureLeft: capture ? capture.x - scroll.x : null,
          captureRight: capture ? scroll.right - capture.right : null,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.left).toBe(width < 900 ? 16 : 20);
      expect(geometry.right).toBe(geometry.left);
      expect(geometry.top).toBe(geometry.left);
      expect(geometry.rowLeft).toBe(0);
      expect(geometry.rowRight).toBe(0);
      expect(geometry.overflow).toBe(false);
      if (geometry.captureLeft !== null) {
        expect(geometry.captureLeft).toBe(geometry.left);
        expect(geometry.captureRight).toBe(geometry.right);
      }
      if (value === 'completed' || value === 'trash') {
        await expect(page.locator('.task-section-heading')).toHaveCount(0);
      }
    }
  }
});

test('date and completed sections use one accessible disclosure and preserve task operations', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await scope(page, 'next');
  const section = page.locator('.task-section').first();
  const toggle = section.locator('.task-section-toggle');
  const panel = section.locator('.task-section-body');
  const alignment = await toggle.evaluate((el) => {
    const box = el.getBoundingClientRect();

    const center = (selector: string) => {
      const rElement = el.querySelector(selector);
      if (rElement === null) {
        throw new Error('Expected element matching selector');
      }
      const r = rElement.getBoundingClientRect();
      return Math.abs(r.y + r.height / 2 - box.y - box.height / 2);
    };

    const entry = el.querySelector('.task-section-title');
    if (entry === null) {
      throw new Error('Missing entry');
    }
    const title = getComputedStyle(entry);
    const entry1 = el.querySelector('.task-section-count');
    if (entry1 === null) {
      throw new Error('Missing entry');
    }
    const count = getComputedStyle(entry1);
    const entry2 = document.querySelector('.sidebar-entity .entity-count');
    if (entry2 === null) {
      throw new Error('Missing entry');
    }
    const sidebar = getComputedStyle(entry2);

    return {
      titleError: center('.task-section-title'),
      countError: center('.task-section-count'),
      iconError: center('svg'),
      smallerCount: parseFloat(count.fontSize) < parseFloat(title.fontSize),
      matchesSidebar:
        count.fontSize === sidebar.fontSize && count.lineHeight === sidebar.lineHeight,
    };
  });
  expect(alignment.titleError).toBeLessThan(1);
  expect(alignment.countError).toBeLessThan(1);
  expect(alignment.iconError).toBeLessThan(1);
  expect(alignment.smallerCount).toBe(true);
  expect(alignment.matchesSidebar).toBe(true);
  await expect(toggle).toHaveAttribute('aria-controls', (await panel.getAttribute('id')) ?? '');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const title = await section.locator('.task-title').first().innerText();
  await toggle.focus();
  await toggle.press('Space');
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await expect(panel).toBeVisible();
  await expect(section.locator('.task-title').first()).toHaveText(title);
  await scope(page, 'all');
  const complete = page.locator('.task-section-toggle').filter({ hasText: 'Complete' });
  await expect(complete).toHaveAttribute('aria-expanded', 'false');
  await complete.click();
  await expect(complete).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.task-section .task-row.completed').first()).toBeVisible();
  await scope(page, 'trash');
  await expect(
    page.locator('.workspace-header').getByRole('button', { name: 'Empty trash', exact: true }),
  ).toBeVisible();
  await page.locator('.task-row').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toContainText('Trash is empty');
  await expect(page.getByRole('button', { name: 'Empty trash', exact: true })).toHaveCount(0);
});

test('row More stays absent while balanced spacing, dates and context access remain unchanged', async ({
  page,
  browser,
}) => {
  await page.goto('/?demo=1');
  const row = page
    .locator('.task-row')
    .filter({
      has: page.locator('.task-title', { hasText: 'Choose three priorities for the coming week' }),
    })
    .first();
  const date = await visibleBox(row.locator('.row-date'));
  await row.hover();
  await expect(row.locator('.row-menu-trigger')).toHaveCount(0);
  expect(await visibleBox(row.locator('.row-date'))).toEqual(date);
  const edges = await row.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const leftElement = el.querySelector('.subtask-disclosure');
    if (leftElement === null) {
      throw new Error("Expected element matching '.subtask-disclosure'");
    }
    const left = leftElement.getBoundingClientRect();
    const circleElement = el.querySelector('.task-check');
    if (circleElement === null) {
      throw new Error("Expected element matching '.task-check'");
    }
    const circle = circleElement.getBoundingClientRect();
    const entry3 = el.querySelector('.task-check');
    if (entry3 === null) {
      throw new Error('Missing entry');
    }
    const ink = getComputedStyle(entry3, '::before');
    const dateElement = el.querySelector('.row-date');
    if (dateElement === null) {
      throw new Error("Expected element matching '.row-date'");
    }
    const date = dateElement.getBoundingClientRect();
    return {
      left: left.x - box.x,
      size: left.width,
      paddingRight: getComputedStyle(el).paddingRight,
      inkLeft: circle.x - box.x + parseFloat(ink.left),
      dateRight: box.right - date.right,
    };
  });
  expect(edges.left).toBe(0);
  expect(edges.size).toBe(24);
  expect(edges.paddingRight).toBe('24px');
  expect(edges.dateRight).toBe(28);
  expect(edges.inkLeft).toBe(edges.dateRight);
  await row.click({ button: 'right' });
  await expect(page.locator('[data-rillday-menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await row.press('Shift+F10');
  await expect(page.locator('[data-rillday-menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 700 } });
  const touchPage = await touch.newPage();
  try {
    await touchPage.goto('/?demo=1');
    await expect(touchPage.locator('.task-row .row-menu-trigger')).toHaveCount(0);
    await expect(touchPage.locator('.task-row').first()).toHaveCSS('padding-right', '28px');
  } finally {
    await touch.close();
  }
});
