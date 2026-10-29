import { expect, test } from '@playwright/test';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';

test('completion feedback follows the circle while its larger hit target stays invisible', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('Check completion control !2');
  await input.press('Enter');
  await input.press('Escape');
  const row = page.locator('.task-row');
  const check = row.locator('.task-check');

  const inspect = () =>
    check.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const circle = getComputedStyle(el, '::before');
      return {
        target: box.width,
        visual:
          parseFloat(circle.width) +
          (circle.boxSizing === 'border-box'
            ? 0
            : parseFloat(circle.borderLeftWidth) + parseFloat(circle.borderRightWidth)),
        background: style.backgroundColor,
        outline: style.outlineStyle,
        circleOutline: circle.outlineStyle,
        circleRadius: circle.borderRadius,
        circleFill: circle.backgroundColor,
      };
    });

  const rest = await inspect();
  await check.hover();
  const hover = await inspect();
  expect(hover.target).toBe(24);
  expect(hover.visual).toBe(16);
  expect(hover.background).toBe('rgba(0, 0, 0, 0)');
  expect(hover.circleFill).not.toBe(rest.circleFill);
  expect(parseFloat(hover.circleRadius)).toBeGreaterThanOrEqual(hover.visual / 2);
  await page.keyboard.press('Tab');
  await check.focus();
  await expect(check).toBeFocused();
  const focused = await inspect();
  expect(focused.outline).toBe('none');
  expect(focused.circleOutline).toBe('solid');
  await check.click({ position: { x: 1, y: 1 } });
  await expect(row).toHaveCount(0);
  await page
    .locator('.smart-lists')
    .getByRole('button', { name: 'Completed', exact: true })
    .click();
  await expect(check).toHaveAttribute('aria-checked', 'true');
  await check.hover();
  expect((await inspect()).background).toBe('rgba(0, 0, 0, 0)');
  await check.focus();
  await check.press('Space');
  await expect(row).toHaveCount(0);
  await page.locator('.smart-lists > button').first().click();
  await row.locator('.task-title').click();
  const detail = page.locator('.td-complete').first();
  await detail.hover();
  expect(await detail.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await page.keyboard.press('Tab');
  await detail.focus();
  expect(
    await detail.evaluate((el) => ({
      button: getComputedStyle(el).outlineStyle,
      circle: getComputedStyle(el, '::before').outlineStyle,
    })),
  ).toEqual({ button: 'none', circle: 'solid' });
});

test('detail text editors keep caret focus without form rings or layout shifts', async ({
  page,
}) => {
  await page.goto('/');
  const capture = page.getByLabel('Quick add task', { exact: true });
  await capture.fill('Edit this title directly');
  await capture.press('Enter');
  await page.locator('.task-title').click();
  const title = page.getByLabel('Task title', { exact: true });
  const notes = page.getByLabel('Task description', { exact: true });
  await notes.fill('Edit the body text directly.\nThe second paragraph behaves the same way.');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 700 });
    for (const editor of [title, notes]) {
      await page.locator('.td-header').click({ position: { x: 4, y: 4 } });
      const before = await editor.boundingBox();
      await editor.click();
      await expect(editor).toBeFocused();
      const appearance = await editor.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow,
          outline: style.outlineStyle,
          border: style.borderTopWidth,
          caret: style.caretColor,
          text: style.color,
          background: style.backgroundColor,
        };
      });
      expect(appearance.shadow).toMatch(
        /^(none|rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)*)$/,
      );
      expect(appearance.outline).toBe('none');
      expect(appearance.border).toBe('0px');
      expect(appearance.caret).toBe(appearance.text);
      expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
      expect(await editor.boundingBox()).toEqual(before);
    }
    await page.locator('.td-date-button').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByLabel('Close task details', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.td-date-button')).toBeFocused();
    expect(
      await page
        .locator('.td-date-button')
        .evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe('solid');
  }
  await title.fill('Updated title');
  await notes.fill('Updated body');
  await page.getByLabel('Close task details', { exact: true }).click();
  await expect
    .poll(async () => {
      const task = (await storedWorkspace(page)).tasks.find(
        (task) => task.title === 'Updated title',
      );
      return task?.notes;
    })
    .toBe('Updated body');
  await reloadSavedPage(page);
  await page.locator('.task-title').filter({ hasText: 'Updated title' }).click();
  await expect(notes).toHaveText('Updated body');
});

test('detail cards occupy space only after selection and preserve editing when reopened', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  await input.fill('Detail card check');
  await input.press('Enter');
  await input.press('Escape');
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(page.locator('.detail-pane')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sidebar =
            document.querySelector('.task-sidebar') ?? document.querySelector('.app-rail')!;
          return (
            document.querySelector('.workspace-layout')!.getBoundingClientRect().left -
            sidebar.getBoundingClientRect().right
          );
        }),
      )
      .toBeLessThan(0.5);
    await expect
      .poll(async () => {
        const main = (await page.locator('.main-workspace').boundingBox())!;
        const container = (await page.locator('.workspace-body').boundingBox())!;
        return main.width - container.width;
      })
      .toBe(0);
    const available = (await page.locator('.main-workspace').boundingBox())!.width;
    await page.locator('.task-title').filter({ hasText: 'Detail card check' }).click();
    const geometry = await page.locator('.task-detail').evaluate((card) => {
      const pane = card.parentElement!;
      const outer = pane.getBoundingClientRect();
      const inner = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const header = card.querySelector('.td-header')!;
      const body = card.querySelector('.td-body')!;
      return {
        insets: [
          inner.top - outer.top,
          outer.right - inner.right,
          outer.bottom - inner.bottom,
          inner.left - outer.left,
        ],
        internal: [
          style.paddingTop,
          getComputedStyle(header).paddingRight,
          style.paddingBottom,
          getComputedStyle(body).paddingLeft,
        ],
        radius: style.borderRadius,
        border: style.borderTopWidth,
        background: style.backgroundColor,
        overflow:
          card.scrollWidth > card.clientWidth || document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.insets).toEqual(Array(4).fill(width < 900 ? 8 : 12));
    if (width >= 900) {
      const gaps = await page.locator('.task-content-stack').evaluate((el) => {
        const row = el.getBoundingClientRect();
        const view = document.querySelector('.task-scroll')!.getBoundingClientRect();
        const card = document.querySelector('.task-detail')!.getBoundingClientRect();
        const handle = document.querySelector('.detail-resize')!.getBoundingClientRect();
        return {
          left: row.left - view.left,
          right: card.left - row.right,
          gripCenter: handle.x + handle.width / 2,
          gapCenter: (view.right + card.left) / 2,
        };
      });
      expect(gaps.left).toBe(20);
      expect(gaps.right).toBe(gaps.left);
      expect(gaps.gripCenter).toBe(gaps.gapCenter);
    }
    expect(geometry.internal).toEqual(Array(4).fill('20px'));
    expect(geometry.radius).toBe('10px');
    expect(geometry.border).toBe('1px');
    expect(geometry.overflow).toBe(false);
    if (width >= 900) {
      expect((await page.locator('.main-workspace').boundingBox())!.width).toBeLessThan(available);
    }
    await page.getByLabel('Task description', { exact: true }).fill(`Width ${width} edit`);
    await page.getByLabel('Close task details', { exact: true }).click();
    await expect(page.locator('.detail-pane')).toHaveCount(0);
    await expect
      .poll(async () => (await page.locator('.main-workspace').boundingBox())!.width)
      .toBe(available);
    await page.locator('.task-title').filter({ hasText: 'Detail card check' }).click();
    await expect(page.getByLabel('Task description', { exact: true })).toHaveText(
      `Width ${width} edit`,
    );
    await page.getByLabel('Close task details', { exact: true }).click();
  }
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toBe('Width 320 edit');
  await reloadSavedPage(page);
  await expect(page.locator('.detail-pane')).toHaveCount(0);
  await page.locator('.task-title').click();
  await expect(page.getByLabel('Task description', { exact: true })).toHaveText('Width 320 edit');
});

test('open cards hide the list scrollbar without losing scrolling or balanced list and capture insets', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page
    .locator('#quick-add-input')
    .fill(Array.from({ length: 35 }, (_, i) => `Scroll check ${i}`).join('\n'));
  await page.locator('#quick-add-input').press('Enter');
  await page.locator('#quick-add-input').press('Escape');
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page
      .locator('.task-title')
      .filter({ hasText: 'Choose three priorities for the coming week' })
      .click();
    const geometry = await page.locator('.task-scroll').evaluate((el) => {
      const scroll = el.getBoundingClientRect();
      const row = el.querySelector('.task-content-stack')!.getBoundingClientRect();
      const card = document.querySelector('.task-detail')!.getBoundingClientRect();
      const capture = document.querySelector('.quick-add')!.getBoundingClientRect();
      const grip = document.querySelector('.detail-resize')!.getBoundingClientRect();
      return {
        scrolls: el.scrollHeight > el.clientHeight,
        clearance: card.left - scroll.right,
        left: row.left - scroll.left,
        right: card.left - row.right,
        captureLeft: capture.left - scroll.left,
        captureRight: card.left - capture.right,
        gripStart: grip.left - scroll.right,
        gripEnd: card.left - grip.right,
        hit: document
          .elementFromPoint(grip.x + grip.width / 2, scroll.y + scroll.height / 2)
          ?.classList.contains('detail-resize'),
      };
    });
    expect(geometry.scrolls).toBe(true);
    expect(geometry.clearance).toBe(12);
    expect(geometry.left).toBe(20);
    expect(geometry.right).toBe(20);
    expect(geometry.captureLeft).toBe(20);
    expect(geometry.captureRight).toBe(20);
    expect(geometry.gripStart).toBe(0);
    expect(geometry.gripEnd).toBe(0);
    expect(geometry.hit).toBe(true);
    await expect(page.locator('.task-scroll')).toHaveCSS('scrollbar-width', 'none');
    await page.locator('.task-scroll').hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => page.locator('.task-scroll').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.locator('.task-row').last().scrollIntoViewIfNeeded();
    await page.locator('.task-row').last().focus();
    await page.keyboard.press('PageUp');
    await page.getByLabel('Close task details', { exact: true }).click();
    await expect(page.locator('.task-scroll')).not.toHaveCSS('scrollbar-width', 'none');
    await page.locator('.task-scroll').evaluate((el) => {
      el.scrollTop = 0;
    });
    const closed = await page.locator('.task-scroll').evaluate((el) => {
      const scroll = el.getBoundingClientRect();
      const row = el.querySelector('.task-content-stack')!.getBoundingClientRect();
      return [row.left - scroll.left, scroll.right - row.right];
    });
    expect(closed).toEqual([20, 20]);
  }
});

test('short task variants center controls while tall content keeps its first-line anchor', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add task', { exact: true });
  const longTitle = 'Review the task title and content across multiple lines '.repeat(12).trim();
  await input.fill(`Plain alignment\nMetadata alignment #review tomorrow\n${longTitle} #review`);
  await input.press('Enter');
  const rows = page.locator('.task-row');
  await expect(rows.last()).toHaveClass(/tall/);
  const geometry = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      const check = element.querySelector('.task-check')!.getBoundingClientRect();
      const content = element.querySelector('.task-content')!;
      const bounds = content.getBoundingClientRect();
      const style = getComputedStyle(content);
      const date = element.querySelector('.row-date')?.getBoundingClientRect();
      const expected = element.classList.contains('tall')
        ? bounds.y + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2
        : box.y + box.height / 2;
      return {
        height: box.height,
        titleInset: bounds.x + parseFloat(style.paddingLeft) - box.x,
        checkError: Math.abs(check.y + check.height / 2 - expected),
        menuPresent: Boolean(element.querySelector('.row-menu-trigger')),
        dateError: date ? Math.abs(date.y + date.height / 2 - expected) : 0,
        dateRightInset: date ? box.right - date.right : 28,
      };
    }),
  );
  expect(geometry[0].height).toBe(40);
  expect(geometry[1].height).toBe(56);
  for (const row of geometry) {
    expect(row.titleInset).toBe(56);
    expect(row.checkError).toBeLessThan(1);
    expect(row.menuPresent).toBe(false);
    expect(row.dateError).toBeLessThan(1);
    expect(row.dateRightInset).toBe(28);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(rows.first()).not.toHaveClass(/tall/);
});

test('populated Markdown checks retain square visuals and label glyphs', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.locator('.task-title').filter({ hasText: 'Review the weekend shopping list' }).click();
  await expect(page.locator('.td-markdown [role="checkbox"]')).toHaveCount(2);
  const state = await page.locator('.task-detail').evaluate((element) => {
    const checks = [...element.querySelectorAll('.td-markdown [role="checkbox"]')].map((check) => {
      const style = getComputedStyle(check, '::before');
      return {
        width: parseFloat(style.width) - parseFloat(style.borderLeftWidth) * 2,
        height: parseFloat(style.height) - parseFloat(style.borderTopWidth) * 2,
        target: style.width,
        radius: parseFloat(style.borderRadius) - parseFloat(style.borderLeftWidth),
      };
    });
    const icon = element.querySelector('.td-tag-chips svg')!;
    return {
      checks,
      label: {
        width: icon.getBoundingClientRect().width,
        height: icon.getBoundingClientRect().height,
        padding: getComputedStyle(icon).padding,
      },
    };
  });
  expect(state.checks).toEqual(Array(2).fill({ width: 16, height: 16, target: '28px', radius: 3 }));
  expect(state.label).toEqual({ width: 12, height: 12, padding: '0px' });
});

test('task rows preserve dates and show list origin only where context is missing', async ({
  page,
}) => {
  await page.goto('/?demo=1');

  const parent = () =>
    page
      .locator('.task-row')
      .filter({
        has: page.locator('.task-title', {
          hasText: 'Choose three priorities for the coming week',
        }),
      })
      .first();

  await expect(parent().locator('.row-list')).toHaveCount(0);
  await expect(parent().locator('.task-meta')).toHaveText('planningpersonal');
  const date = parent().locator('.row-date');
  const before = (await date.boundingBox())!;
  await parent().hover();
  await expect(date).toBeVisible();
  expect((await date.boundingBox())!.x).toBe(before.x);
  await expect(parent().locator('.row-menu-trigger')).toHaveCount(0);
  await parent().click({ button: 'right' });
  const menu = page.locator('[data-rillday-menu]');
  await expect(menu).not.toContainText('Date');
  await expect(menu).not.toContainText('Priority');
  await expect(menu).not.toContainText('Move to tomorrow');
  await page.keyboard.press('Escape');
  await page.locator('.smart-lists > button').nth(3).click();
  await expect(parent().locator('.row-list')).toHaveText('Inbox');
  await parent().getByLabel('Expand subtasks', { exact: true }).click();
  const children = page.locator(
    `#${await parent().getByLabel('Collapse subtasks', { exact: true }).getAttribute('aria-controls')}`,
  );
  await expect(children.locator('.task-row')).toHaveCount(2);
  await expect(children.locator('.row-list')).toHaveCount(0);
  const controls = await parent().evaluate((element) => {
    const a = element.querySelector('.subtask-disclosure')!.getBoundingClientRect();
    const b = element.querySelector('.task-check')!.getBoundingClientRect();
    const visual = getComputedStyle(element.querySelector('.task-check')!, '::before');
    return {
      separated: a.right <= b.left,
      centers: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
      target: [a.width, a.height, b.width, b.height],
      visual:
        parseFloat(visual.width) +
        (visual.boxSizing === 'border-box'
          ? 0
          : parseFloat(visual.borderLeftWidth) + parseFloat(visual.borderRightWidth)),
    };
  });
  expect(controls.separated).toBe(true);
  expect(controls.centers).toBe(0);
  expect(controls.target.every((size) => size >= 24)).toBe(true);
  expect(controls.visual).toBe(16);
  const disclosure = parent().getByLabel('Collapse subtasks', { exact: true });
  await disclosure.hover();
  expect(
    await disclosure.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const row = element.closest('.task-row')!.getBoundingClientRect();
      return (
        button.left >= row.left &&
        button.right <= row.right &&
        getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)'
      );
    }),
  ).toBe(true);
  await page
    .locator('.sidebar-entity.sidebar-list')
    .filter({ hasText: 'Work and projects' })
    .locator('button')
    .first()
    .click();
  await expect(page.locator('.task-row .row-list')).toHaveCount(0);
});

test('detail keeps direct property editing and reveals content sections only when needed', async ({
  page,
}) => {
  await page.goto('/');
  const quick = page.getByLabel('Quick add task', { exact: true });
  await quick.fill('Simple task');
  await quick.press('Enter');
  await page.locator('.task-title').click();
  const detail = page.getByLabel('Task details', { exact: true });
  await expect(detail.locator('.td-section')).toHaveCount(0);
  expect(
    (await page.getByLabel('Task description', { exact: true }).boundingBox())!.height,
  ).toBeLessThan(40);
  for (const name of ['Move to list', 'Set priority', 'Add labels']) {
    await expect(detail.getByLabel(name, { exact: true })).toBeVisible();
  }
  await detail.getByRole('button', { name: 'Set priority', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'High priority', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Set priority', exact: true })).toBeFocused();
  await detail.getByLabel('Add labels', { exact: true }).click();
  await page.getByLabel('Labels to add', { exact: true }).fill('review');
  await page.getByLabel('Add entered labels', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(detail.locator('.td-tag-chips')).toHaveText('review');
  await detail.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await page.getByLabel('New subtask', { exact: true }).fill('Book accommodation');
  await page.getByLabel('New subtask', { exact: true }).press('Enter');
  await expect(detail.locator('.td-section')).toHaveCount(1);
  await detail.locator('.td-child-title').click();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Book accommodation');
  await expect(detail.locator('.td-section')).toHaveCount(0);
  await detail.getByLabel('Back to parent task', { exact: true }).click();
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Simple task');
});

test('detail popovers escape the scroll region and fit a short narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  const quick = page.getByLabel('Quick add task', { exact: true });
  await quick.fill('Edit on small screen');
  await quick.press('Enter');
  await page.locator('.task-title').click();
  const detail = page.getByLabel('Task details', { exact: true });
  for (const selector of [
    '.td-date-button',
    '[aria-label="Set priority"]',
    '[aria-label="Add labels"]',
  ]) {
    const trigger = detail.locator(selector);
    await trigger.click();
    const popup = page.locator('.td-popover,.td-date-panel');
    await expect(popup).toBeVisible();
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(312);
    expect(box.y + box.height).toBeLessThanOrEqual(472);
    expect(
      await popup.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('detail editing keeps keyboard flow between title, notes, menus and checklist items', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.rillday-app')).toBeVisible();
  await page.getByLabel('Quick add task', { exact: true }).fill('Edit details');
  await page.getByLabel('Quick add task', { exact: true }).press('Enter');
  await expect(page.getByLabel('Quick add task', { exact: true })).toHaveValue('');
  await page.locator('.task-title').click();
  await page.getByLabel('Task title', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Task description', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Set priority', exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Set priority', exact: true })).toBeFocused();
  const notes = page.getByLabel('Task description', { exact: true });
  await notes.focus();
  await notes.pressSequentially('[] Check documents');
  await notes.press('Enter');
  await notes.pressSequentially('Next item');
  await expect(page.locator('.td-markdown [role="checkbox"]')).toHaveCount(2);
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0].notes)
    .toContain('- [ ] Next item');
});
