import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';

test('capture separates stable text entry from a balanced trailing add action', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  const add = page.locator('.quick-add-submit');
  await expect(add).toBeDisabled();
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    const before = await visibleBox(input);

    await input.focus();
    await input.fill('Review ordering');
    const after = await visibleBox(input);

    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    const geometry = await add.evaluate((button) => {
      const iconElement = button.querySelector('svg');
      if (iconElement === null) {
        throw new Error("Expected element matching 'svg'");
      }
      const icon = iconElement.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      const lineElement = button.closest('.quick-add-line');
      if (lineElement === null) {
        throw new Error("Expected element matching '.quick-add-line'");
      }
      const line = lineElement.getBoundingClientRect();
      const inputElement = button.closest('.quick-add-line');
      if (inputElement === null) {
        throw new Error("Expected element matching '.quick-add-line'");
      }
      const inputElement3 = inputElement.querySelector('textarea');
      if (inputElement3 === null) {
        throw new Error("Expected element matching 'textarea'");
      }
      const input = inputElement3.getBoundingClientRect();
      return {
        size: [box.width, box.height],
        center: [
          icon.x + icon.width / 2 - box.x - box.width / 2,
          icon.y + icon.height / 2 - box.y - box.height / 2,
        ],
        edges: [line.right - icon.right, icon.top - line.top, line.bottom - icon.bottom],
        trailing: box.left > input.right,
      };
    });
    expect(geometry.size).toEqual([24, 24]);
    expect(geometry.center).toEqual([0, 0]);
    expect(Math.max(...geometry.edges) - Math.min(...geometry.edges)).toBeLessThan(0.5);
    expect(geometry.trailing).toBe(true);
    await input.fill('');
    await input.press('Escape');
  }
  await input.fill('Added with button');
  await add.click();
  await expect(page.locator('.task-title')).toHaveText('Added with button');
  await expect(input).toBeFocused();
  await expect(add).toBeDisabled();
  await input.fill('Added with keyboard');
  await add.focus();
  await add.press('Space');
  await expect(page.locator('.task-title')).toHaveCount(2);
  const cdp = await page.context().newCDPSession(page);
  await input.focus();
  for (const text of ['ㅇ', '아', '안']) {
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  }
  await add.click();
  await expect(page.locator('.task-title').filter({ hasText: '안' })).toHaveText('안');
  await expect(input).toHaveValue('');
});

test('capture icons stay in a stable centered input line without an expanding toolbar', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  const before = await visibleBox(input);

  const capture = await visibleBox(page.locator('.quick-add'));

  await input.click();
  await input.fill('Check capture position #review tomorrow');
  const after = await visibleBox(input);

  expect(after.y).toBe(before.y);
  expect(after.height).toBe(before.height);
  const geometry = await page.locator('.quick-add-line').evaluate((element) => {
    const line = element.getBoundingClientRect();
    const iconElement2 = element.querySelector('svg');
    if (iconElement2 === null) {
      throw new Error("Expected element matching 'svg'");
    }
    const icon = iconElement2.getBoundingClientRect();
    const inputElement2 = element.querySelector('textarea');
    if (inputElement2 === null) {
      throw new Error("Expected element matching 'textarea'");
    }
    const input = inputElement2.getBoundingClientRect();
    return {
      icon: Math.abs(icon.y + icon.height / 2 - line.y - line.height / 2),
      input: Math.abs(input.y + input.height / 2 - line.y - line.height / 2),
    };
  });
  expect(geometry.icon).toBeLessThan(0.5);
  expect(geometry.input).toBeLessThan(0.5);
  expect((await visibleBox(page.locator('.quick-add'))).height).toBe(capture.height);
});

test('capture stays below the scrolling list with balanced workspace insets', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill(Array.from({ length: 40 }, (_, i) => `Review bottom capture ${i}`).join('\n'));
  await input.press('Enter');
  await input.press('Escape');
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 480 : 800 });
    const geometry = await page.locator('.task-view').evaluate((element) => {
      const view = element.getBoundingClientRect();
      const scrollElement = element.querySelector('.task-scroll');
      if (scrollElement === null) {
        throw new Error("Expected element matching '.task-scroll'");
      }
      const scroll = scrollElement.getBoundingClientRect();
      const footerElement = element.querySelector('.task-add-area');
      if (footerElement === null) {
        throw new Error("Expected element matching '.task-add-area'");
      }
      const footer = footerElement.getBoundingClientRect();
      const captureElement = element.querySelector('.quick-add');
      if (captureElement === null) {
        throw new Error("Expected element matching '.quick-add'");
      }
      const capture = captureElement.getBoundingClientRect();
      const entry = element.querySelector('.task-add-area');
      if (entry === null) {
        throw new Error('Missing entry');
      }
      return {
        bottom: Math.abs(view.bottom - footer.bottom),
        scrollClear: scroll.bottom <= footer.top + 0.5,
        left: capture.left - view.left,
        right: view.right - capture.right,
        inset: getComputedStyle(entry).paddingBottom,
        captureY: capture.y,
      };
    });
    expect(geometry.bottom).toBeLessThan(1);
    expect(geometry.scrollClear).toBe(true);
    expect(geometry.left).toBe(width < 900 ? 16 : 20);
    expect(geometry.right).toBe(geometry.left);
    expect(geometry.inset).toBe(`${geometry.left}px`);
    await page.locator('.task-row').last().scrollIntoViewIfNeeded();
    expect((await visibleBox(page.locator('.quick-add'))).y).toBe(geometry.captureY);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});

test('bottom capture suggestions stay above a multiline draft in a short viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill(
    Array.from({ length: 6 }, (_, i) => `Existing item ${i} #review${i}`).join('\n'),
  );
  await input.press('Enter');
  await input.fill(
    Array.from({ length: 10 }, (_, i) => `Unfinished line ${i}`).join('\n') + '\n#rev',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const tools = await page
    .locator('.quick-add-actions')
    .evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(tools.content).toBeLessThanOrEqual(tools.width);
  const suggestions = page.getByRole('listbox', { name: 'Label suggestions' });
  await expect(suggestions).toBeVisible();
  const box = await visibleBox(suggestions);

  const capture = await visibleBox(page.locator('.quick-add'));

  expect(box.y).toBeGreaterThanOrEqual(64);
  expect(box.y + box.height).toBeLessThanOrEqual(capture.y - 7);
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(312);
  expect(
    await suggestions.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      );
    }),
  ).toBe(true);
  await input.press('ArrowUp');
  const last = suggestions.getByRole('option', { name: 'review5', exact: true });
  const entry1 = await last.getAttribute('id');
  assert(entry1 !== null, 'Missing entry');
  await expect(input).toHaveAttribute('aria-activedescendant', entry1);
  await input.press('Home');
  const entry2 = await suggestions
    .getByRole('option', { name: 'review0', exact: true })
    .getAttribute('id');
  assert(entry2 !== null, 'Missing entry');
  await expect(input).toHaveAttribute('aria-activedescendant', entry2);
  await input.press('End');
  const entry3 = await last.getAttribute('id');
  assert(entry3 !== null, 'Missing entry');
  await expect(input).toHaveAttribute('aria-activedescendant', entry3);
  const selected = await visibleBox(
    suggestions.getByRole('option', { name: 'review5', exact: true }),
  );

  expect(selected.y).toBeGreaterThanOrEqual(box.y);
  expect(selected.y + selected.height).toBeLessThanOrEqual(box.y + box.height);
  await input.press('Enter');
  await expect(input).toHaveValue(/#review5 $/);
  await expect(input).toBeFocused();
  await input.fill('Unfinished #rev');
  await expect(suggestions).toBeVisible();
  await input.press('Tab');
  await expect(input).toHaveValue('Unfinished #rev');
  await expect(input).not.toBeFocused();
  await expect(suggestions).toHaveCount(0);
});
