import { type Locator, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';

async function width(panel: Locator) {
  return (await visibleBox(panel)).width;
}

test('navigation restores preferred sidebar pixels after a hidden viewport change', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sidebar = page.locator('.task-sidebar');
  await expect.poll(() => width(sidebar)).toBe(222);
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect.poll(() => width(sidebar)).toBe(222);

  const separator = page.getByRole('separator', { name: 'Content sidebar width', exact: true });
  await separator.focus();
  await separator.press('ArrowRight');
  await expect.poll(() => width(sidebar)).toBeGreaterThan(222);
  await expect
    .poll(() =>
      page
        .locator('.workspace-panels')
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length,
        ),
    )
    .toBe(0);
  const preferred = await width(sidebar);
  await page.getByLabel('Habit', { exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByLabel('Tasks', { exact: true }).click();
  await expect.poll(async () => Math.abs((await width(sidebar)) - preferred)).toBeLessThan(1);
});

test('pointer resize preference survives viewport constraints and reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Restore panel pointer width');
  await input.press('Enter');
  await page.locator('.task-title').click();
  const sidebar = page.locator('.task-sidebar');
  const separator = page.getByRole('separator', { name: 'Content sidebar width', exact: true });
  const bounds = await visibleBox(separator);

  await page.mouse.move(bounds.x, 420);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 258, 420, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => width(sidebar)).toBe(480);
  await page.setViewportSize({ width: 900, height: 950 });
  await expect.poll(() => width(sidebar)).toBeLessThan(480);
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect.poll(() => width(sidebar)).toBe(480);
  await page.getByLabel('Hide sidebar', { exact: true }).click();
  await expect(sidebar).toBeHidden();
  await page.getByLabel('Show sidebar', { exact: true }).click();
  await expect.poll(() => width(sidebar)).toBe(480);
});

test('sidebar resizing shares space proportionally and restores expanded preferences', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 950 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Proportional panels');
  await input.press('Enter');
  await page.locator('.task-title').click();
  const sidebar = page.locator('.task-sidebar');
  const main = page.locator('.main-workspace');
  const detail = page.locator('.detail-pane');
  await expect.poll(() => width(sidebar)).toBe(222);
  await expect.poll(() => width(detail)).toBe(360);
  const originalRatio = (await width(main)) / (await width(detail));
  const separator = page.getByRole('separator', { name: 'Content sidebar width', exact: true });
  const bounds = await visibleBox(separator);

  await page.mouse.move(bounds.x, 420);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 40, 420);
  await expect.poll(async () => Math.abs((await width(sidebar)) - 262)).toBeLessThan(1);
  await expect.poll(() => width(detail)).toBeLessThan(360);
  expect((await width(main)) / (await width(detail))).toBeCloseTo(originalRatio, 2);
  await page.mouse.move(bounds.x + 400, 420);
  await page.mouse.up();
  await expect.poll(() => width(sidebar)).toBe(367);
  await expect.poll(() => width(main)).toBe(300);
  await expect.poll(() => width(detail)).toBe(300);

  await page.setViewportSize({ width: 1440, height: 950 });
  await separator.press('End');
  await expect.poll(() => width(sidebar)).toBe(480);
  await page.getByRole('separator', { name: 'Main content width', exact: true }).press('Home');
  await expect.poll(() => width(detail)).toBe(540);
  await page.setViewportSize({ width: 1024, height: 950 });
  await expect.poll(() => width(sidebar)).toBe(367);
  await expect.poll(() => width(detail)).toBe(300);
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect.poll(() => width(sidebar)).toBe(480);
  await expect.poll(() => width(detail)).toBe(540);
});

test('each sidebar toggle animates the workspace, including repeated cycles', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('.task-sidebar');
  await expect(sidebar).toBeVisible();

  for (let cycle = 0; cycle < 2; cycle++) {
    for (const expanded of [false, true]) {
      const animated = await sidebar.evaluate(async () => {
        const matchedElement = document.querySelector<HTMLButtonElement>(
          '.workspace-sidebar-toggle',
        );
        if (matchedElement === null) {
          throw new Error("Expected element matching '.workspace-sidebar-toggle'");
        }
        matchedElement.click();
        const panel = document.querySelector('#workspace-sidebar-panel');
        if (panel === null) {
          throw new Error('Missing panel');
        }
        for (let frame = 0; frame < 60; frame++) {
          if (panel.getAnimations().some((animation) => animation.playState === 'running')) {
            return true;
          }
          await new Promise(requestAnimationFrame);
        }
        return false;
      });
      expect(animated).toBe(true);
      await expect.poll(() => width(sidebar)).toBe(expanded ? 222 : 0);
      await expect(page.locator('.workspace-panels')).not.toHaveAttribute(
        'data-sidebar-transition',
      );
    }
  }
});

test('panel separators expose keyboard controls, bounds and retained widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Panel accessibility');
  await input.press('Enter');
  await page.locator('.task-title').click();

  const sidebar = page.locator('.task-sidebar');
  const detail = page.locator('.detail-pane');
  await expect.poll(() => width(sidebar)).toBe(222);
  await expect.poll(() => width(detail)).toBe(360);

  for (const [name, panel, minimum, maximum, minimumKey, maximumKey, controls] of [
    ['Content sidebar width', sidebar, 180, 480, 'Home', 'End', 'workspace-sidebar-panel'],
    ['Main content width', detail, 300, 540, 'End', 'Home', 'workspace-main-panel'],
  ] as const) {
    const separator = page.getByRole('separator', { name, exact: true });
    await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    await expect(separator).toHaveAttribute('aria-controls', controls);
    await expect(separator).toHaveAttribute('aria-valuemin', /\d/);
    await expect(separator).toHaveAttribute('aria-valuemax', /\d/);
    await separator.focus();
    await expect(separator).toBeFocused();
    await separator.press(minimumKey);
    await expect.poll(() => width(panel)).toBe(minimum);
    const value = Number(await separator.getAttribute('aria-valuenow'));
    await separator.press(maximumKey);
    await expect.poll(() => width(panel)).toBe(maximum);
    expect(Number(await separator.getAttribute('aria-valuenow'))).not.toBe(value);
    await separator.press('ArrowLeft');
    await separator.press(maximumKey);
    await expect.poll(() => width(panel)).toBe(maximum);
  }

  await page.getByLabel('Hide sidebar', { exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(
    page.getByRole('separator', { name: 'Content sidebar width', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Show sidebar', { exact: true }).click();
  await expect.poll(() => width(sidebar)).toBe(480);
  await page.getByLabel('Close task details', { exact: true }).click();
  await page.locator('.task-title').click();
  await expect.poll(() => width(detail)).toBe(540);
});

test('pointer cancellation, blur and touch release preserve drafts and stop resizing', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Unfinished draft');
  await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(1, 4));
  const sidebar = page.locator('.task-sidebar');
  const separator = page.getByRole('separator', { name: 'Content sidebar width', exact: true });

  for (const end of ['cancel', 'blur'] as const) {
    const bounds = await visibleBox(separator);

    await page.mouse.move(bounds.x, 420);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 35, 420);
    await expect(separator).toHaveAttribute('data-separator', 'active');
    await page.evaluate((end) => {
      if (end === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else {
        document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
      }
    }, end);
    await expect(separator).not.toHaveAttribute('data-separator', 'active');
    const stopped = await width(sidebar);
    await page.mouse.move(bounds.x + 100, 420);
    await page.mouse.up();
    expect(await width(sidebar)).toBe(stopped);
  }

  await expect(input).toBeFocused();
  const bounds = await visibleBox(separator);

  const start = await width(sidebar);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: bounds.x, y: 420 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: bounds.x + 40, y: 420 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => width(sidebar)).toBeGreaterThan(start);
  await expect(separator).not.toHaveAttribute('data-separator', 'active');
  await expect(input).toHaveValue('Unfinished draft');
  expect(
    await input.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([1, 4]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('separator')).toHaveCount(0);
  await page.getByLabel('Show sidebar', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task navigation', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('sidebar contents and workspace edge stay aligned during opening and rapid reversal', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sidebar = page.locator('.task-sidebar');
  const separator = page.getByRole('separator', { name: 'Content sidebar width', exact: true });

  for (const target of [222, 480]) {
    if (target === 480) {
      await separator.press('End');
    }
    await expect.poll(async () => (await visibleBox(sidebar)).width).toBe(target);
    for (const reverse of [false, true]) {
      await page.getByLabel('Hide sidebar', { exact: true }).click();
      await expect.poll(async () => (await visibleBox(sidebar)).width).toBe(0);
      const frames = await sidebar.evaluate(async (element, reverse) => {
        const panel = document.querySelector('#workspace-sidebar-panel');
        if (panel === null) {
          throw new Error('Missing panel');
        }
        const content = document.querySelector('#workspace-content-panel');
        if (content === null) {
          throw new Error('Missing content');
        }
        const inner = element.querySelector('.collapsible-sidebar-inner');
        if (inner === null) {
          throw new Error('Missing inner');
        }
        const toggle = document.querySelector<HTMLButtonElement>('.workspace-sidebar-toggle');
        if (toggle === null) {
          throw new Error('Missing toggle');
        }
        toggle.click();
        const frames = [];
        for (let frame = 0; frame < 40; frame++) {
          await new Promise(requestAnimationFrame);
          if (reverse && (frame === 2 || frame === 4)) {
            toggle.click();
          }
          const bounds = panel.getBoundingClientRect();
          frames.push({
            panel: bounds.width,
            sidebar: element.getBoundingClientRect().width,
            inner: inner.getBoundingClientRect().width,
            workspaceGap: content.getBoundingClientRect().x - bounds.right,
          });
        }
        return frames;
      }, reverse);
      await info.attach(`width-${target}-reverse-${reverse}`, {
        body: JSON.stringify(frames),
        contentType: 'application/json',
      });
      expect(
        Math.max(...frames.map((frame) => Math.abs(frame.panel - frame.sidebar))),
      ).toBeLessThan(1);
      expect(Math.max(...frames.map((frame) => Math.abs(frame.inner - target)))).toBeLessThan(1);
      expect(Math.max(...frames.map((frame) => Math.abs(frame.workspaceGap)))).toBeLessThan(1);
      await expect
        .poll(async () => Math.abs((await visibleBox(sidebar)).width - target))
        .toBeLessThan(1);
    }
  }
});

test('both resize boundaries show the native resize cursor throughout the hit target and release it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Resize cursor check');
  await input.press('Enter');
  await page.locator('.task-title').click();

  for (const name of ['Content sidebar width', 'Main content width']) {
    const separator = page.getByRole('separator', { name, exact: true });
    const box = await visibleBox(separator);

    const center = box.x + box.width / 2;
    for (const offset of [-4, 0, 4]) {
      const point = { x: center + offset, y: 420 };
      await page.mouse.move(point.x, point.y);
      await expect
        .poll(() =>
          page.evaluate(({ x, y }) => {
            const target = document.elementFromPoint(x, y);
            if (target === null) {
              throw new Error('Missing resize target');
            }
            return getComputedStyle(target).cursor;
          }, point),
        )
        .toMatch(/^(col|ew)-resize$/);
    }
    await page.mouse.move(center, 420);
    await page.mouse.down();
    await page.mouse.move(center + 24, 420);
    await expect(separator).toHaveAttribute('data-separator', 'active');
    await page.mouse.up();
    await page.mouse.move(700, 200);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const target = document.elementFromPoint(700, 200);
          if (target === null) {
            throw new Error('Missing resize target');
          }
          return getComputedStyle(target).cursor;
        }),
      )
      .not.toMatch(/^(col|ew)-resize$/);
    await expect(separator).not.toHaveAttribute('data-separator', 'active');
  }
});

test('detail card fills its panel throughout opening, resizing and repeated closing', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Detail panel check');
  await input.press('Enter');
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.locator('.task-title').click();
    const card = page.locator('.task-detail');
    await expect(card).toBeVisible();
    const gaps = await card.evaluate(async (element) => {
      const parent = element.parentElement;
      if (parent === null) {
        throw new Error('Missing parent');
      }
      const gaps = [];
      for (let frame = 0; frame < 20; frame++) {
        await new Promise(requestAnimationFrame);
        const inset = getComputedStyle(parent);
        gaps.push(
          Math.abs(
            parent.getBoundingClientRect().width -
              parseFloat(inset.paddingLeft) -
              parseFloat(inset.paddingRight) -
              element.getBoundingClientRect().width,
          ),
        );
      }
      return gaps;
    });
    expect(Math.max(...gaps)).toBeLessThan(1);
    const separator = page.getByRole('separator', { name: 'Main content width', exact: true });
    await separator.press('ArrowLeft');
    await expect(card).toBeVisible();
    await page.getByLabel('Close task details', { exact: true }).click();
    await expect(card).toHaveCount(0);
  }
});
