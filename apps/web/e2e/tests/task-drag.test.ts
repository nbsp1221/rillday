import { type Locator, type Page, expect, test } from '@playwright/test';
import { type Task, emptyWorkspace } from '@repo/frontend/application';
import { visibleBox } from '@repo/test-support';
import invariant from 'tiny-invariant';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

const rows = (page: Page) => page.locator('.task-items > .task-row');
const titles = (page: Page) => rows(page).locator('.task-title');

async function seed(page: Page) {
  await page.goto('/');
  const input = page.locator('#quick-add-input');
  await input.fill('First\nSecond\nThird');
  await input.press('Enter');
  await expect(rows(page)).toHaveCount(3);
}

async function start(page: Page, row: Locator) {
  const handle = row.locator('.task-content');
  const box = await visibleBox(handle);

  await page.mouse.move(box.x + Math.min(60, box.width / 2), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(60, box.width / 2) + 8, box.y + box.height / 2, {
    steps: 2,
  });
  await expect(page.locator('.task-drag-overlay')).toBeVisible();
  await expect(row.locator('.task-content')).toHaveCSS('outline-style', 'none');
}

async function over(page: Page, row: Locator, edge: 'before' | 'after') {
  const box = await visibleBox(row);

  await page.mouse.move(box.x + 100, box.y + (edge === 'before' ? 4 : box.height - 4), {
    steps: 4,
  });
}

async function sidebarOver(page: Page, scope: string) {
  const target = page.locator(`[data-task-drop="${scope}"]`);
  const box = await visibleBox(target);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  return target;
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: '**Keep notes**',
    notesFormat: 'markdown',
    listId: 'inbox',
    tags: ['Review'],
    priority: 2,
    date: null,
    time: null,
    duration: 30,
    repeat: null,
    reminderMinutes: null,
    parentId: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    deleted: false,
    pinned: false,
    ...extra,
  };
}

async function fixture(page: Page, tasks: Task[]) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const data = emptyWorkspace();
  data.lists.push({ id: 'destination', name: 'Destination list', color: '#7d9cc4' });
  data.tasks = tasks;
  await seedWorkspace(page, data);
  await page.reload();
  await expect(rows(page).first()).toBeVisible();
}

test('manual pointer drop reaches the very last position and survives reload', async ({ page }) => {
  await seed(page);
  await start(page, rows(page).first());
  await over(page, rows(page).last(), 'after');
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['Second', 'Third', 'First']);
  await expect
    .poll(async () =>
      (await storedWorkspace(page)).tasks
        .sort((first, second) => first.order - second.order)
        .map((task) => task.title),
    )
    .toEqual(['Second', 'Third', 'First']);
  await reloadSavedPage(page);
  await expect(titles(page)).toHaveText(['Second', 'Third', 'First']);
});

test('drag preview fits a short title and truncates a long title on one line', async ({ page }) => {
  await fixture(page, [
    task('short', { title: 'Short title' }),
    task('long', { title: 'Long title '.repeat(40), order: 1 }),
  ]);
  await start(page, rows(page).first());
  expect((await visibleBox(page.locator('.task-drag-overlay'))).width).toBeLessThan(160);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await start(page, rows(page).last());
  const preview = await page.locator('.task-drag-overlay').evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
    overflow: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
  }));
  expect(preview.width).toBeLessThanOrEqual(280);
  expect(preview.height).toBe(34);
  expect(preview.overflow).toBe(true);
  expect(preview.ellipsis).toBe('ellipsis');
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('sidebar list drop moves the task while preserving its contents', async ({ page }) => {
  await seed(page);
  await page.locator('.sidebar-section-heading').first().hover();
  await page.getByRole('button', { name: 'Add task list', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('Destination list');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.smart-lists > button').first().click();
  await expect(rows(page)).toHaveCount(3);
  await start(page, rows(page).first());
  const target = page.locator('.sidebar-list').filter({ hasText: 'Destination list' });
  const box = await visibleBox(target);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['Second', 'Third']);
  await target.getByRole('button').first().click();
  await expect(titles(page)).toHaveText(['First']);
});

test('both row halves and the tail show the exact insertion edge without moving row geometry', async ({
  page,
}) => {
  await seed(page);
  const first = await visibleBox(rows(page).first());
  const last = await visibleBox(rows(page).last());
  await start(page, rows(page).first());
  await over(page, rows(page).last(), 'after');
  await expect(rows(page).last()).toHaveAttribute('data-drop-edge', 'after');
  expect(await visibleBox(rows(page).first())).toEqual(first);
  expect(await visibleBox(rows(page).last())).toEqual(last);

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-drop-edge]')).toHaveCount(0);
  await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
  await start(page, rows(page).last());
  await over(page, rows(page).first(), 'before');
  await expect(rows(page).first()).toHaveAttribute('data-drop-edge', 'before');
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['Third', 'First', 'Second']);
  await start(page, rows(page).first());
  const end = await visibleBox(rows(page).last());

  await page.mouse.move(end.x + 100, end.y + end.height + 6, { steps: 4 });
  await expect(rows(page).last()).toHaveAttribute('data-drop-edge', 'after');
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
});

test('self, adjacent no-op, outside drop and Escape never write or leave indicators', async ({
  page,
}) => {
  await seed(page);
  const before = await storedWorkspace(page);
  await start(page, rows(page).first());
  await over(page, rows(page).nth(1), 'before');
  await expect(page.locator('[data-drop-edge]')).toHaveCount(0);
  await page.mouse.up();
  await start(page, rows(page).first());
  await over(page, rows(page).first(), 'after');
  await page.mouse.up();
  await start(page, rows(page).first());
  await over(page, rows(page).last(), 'after');
  await page.mouse.move(10, 10, { steps: 4 });
  await expect(page.locator('[data-drop-edge]')).toHaveCount(0);
  await page.mouse.up();
  expect(await storedWorkspace(page)).toEqual(before);
});

test('manual order has menu and keyboard alternatives, Undo and retained focus', async ({
  page,
}) => {
  await seed(page);
  await rows(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to last', exact: true }).click();
  await expect(titles(page)).toHaveText(['Second', 'Third', 'First']);
  await expect(rows(page).last()).toBeFocused();
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
  await rows(page).last().focus();
  await page.keyboard.press('Control+Alt+Home');
  await expect(titles(page)).toHaveText(['Third', 'First', 'Second']);
  await expect(rows(page).first()).toBeFocused();
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(titles(page)).toHaveText(['First', 'Third', 'Second']);
  await page.keyboard.press('Control+Alt+End');
  await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
});

for (const scope of ['completed', 'trash']) {
  test(`sidebar ${scope} previews its action, preserves data and supports Undo`, async ({
    page,
  }) => {
    await seed(page);
    const before = (await storedWorkspace(page)).tasks.find((task) => task.title === 'First');
    invariant(before !== undefined, 'Missing before');
    await start(page, rows(page).first());
    const target = await sidebarOver(page, scope);
    await expect(page.locator('.task-drag-overlay')).toHaveText('First');
    await expect(target).toHaveAttribute(
      'aria-description',
      scope === 'trash' ? 'Drop to move to Trash' : 'Drop to complete',
    );
    const targetBox = await visibleBox(target);

    const previewBox = await visibleBox(page.locator('.task-drag-overlay'));

    expect(previewBox.x).toBeGreaterThan(targetBox.x + targetBox.width / 2);
    expect(previewBox.y).toBeGreaterThan(targetBox.y + targetBox.height / 2);

    await page.mouse.up();
    await expect(titles(page)).toHaveText(['Second', 'Third']);
    const changed = (await storedWorkspace(page)).tasks.find((task) => task.id === before.id);
    invariant(changed !== undefined, 'Missing changed');
    expect(changed.title).toBe(before.title);
    expect(changed.notes).toBe(before.notes);
    expect(changed.listId).toBe(before.listId);
    if (scope === 'trash') {
      expect(changed.deleted).toBe(true);
    } else {
      expect(changed.completedAt).not.toBeNull();
    }
    await expect(target).not.toHaveAttribute('data-drop-active');
    await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
  });
}

test('sidebar list moves a whole subtree and detaches an explicitly moved child, with Undo', async ({
  page,
}) => {
  await fixture(page, [
    task('parent'),
    task('child', { parentId: 'parent', order: 1 }),
    task('other', { order: 2 }),
  ]);
  await start(page, rows(page).first());
  await sidebarOver(page, `list:${fixtureId('destination')}`);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const data = await storedWorkspace(page);
      return data.tasks.filter((t) => t.listId === fixtureId('destination')).length;
    })
    .toBe(2);
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await rows(page).first().getByRole('button', { name: 'Expand subtasks', exact: true }).click();
  const child = page.locator(`[data-task-id="${fixtureId('child')}"]`);
  await start(page, child);
  await sidebarOver(page, `list:${fixtureId('destination')}`);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const child = (await storedWorkspace(page)).tasks.find((t) => t.id === fixtureId('child'));
      return (
        child && {
          notesFormat: child.notesFormat,
          listId: child.listId,
          parentId: child.parentId,
          notes: child.notes,
        }
      );
    })
    .toEqual({
      notesFormat: 'markdown',
      listId: fixtureId('destination'),
      parentId: null,
      notes: '**Keep notes**',
    });
});

test('same list, unsupported smart lists and canceled destructive drops are harmless', async ({
  page,
}) => {
  await seed(page);
  const before = await storedWorkspace(page);
  await start(page, rows(page).first());
  const inbox = page.locator('[data-task-drop="list:inbox"]');
  const box = await visibleBox(inbox);

  await page.mouse.move(box.x + 80, box.y + 18, { steps: 4 });
  await expect(inbox).not.toHaveAttribute('data-drop-active');
  await expect(page.locator('.task-drag-destination')).toHaveCount(0);
  await page.mouse.up();
  await start(page, rows(page).first());
  await sidebarOver(page, 'trash');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  expect(await storedWorkspace(page)).toEqual(before);
});

test('sidebar actions remain available when manual reordering is disabled by sorting and grouping', async ({
  page,
}) => {
  await fixture(page, [task('first'), task('last', { order: 1 })]);
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Title · ascending', exact: true }).click();
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Priority', exact: true }).click();
  await expect(page.locator('.task-items-reorderable')).toHaveCount(0);
  await start(page, rows(page).first());
  await sidebarOver(page, `list:${fixtureId('destination')}`);
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['last']);
  await start(page, rows(page).first());
  const unsupported = page.locator('.smart-lists>button').nth(1);
  const box = await visibleBox(unsupported);

  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 4 });
  await expect(page.locator('.task-drag-destination')).toHaveCount(0);
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['last']);
});

test('pinned tasks retain their boundary and filtered orders preserve hidden tasks', async ({
  page,
}) => {
  await fixture(page, [
    task('pinned', { pinned: true }),
    task('first', { order: 1 }),
    task('hidden', { order: 2, listId: 'destination' }),
    task('last', { order: 3 }),
  ]);
  const before = await storedWorkspace(page);
  await start(page, rows(page).last());
  await over(page, rows(page).first(), 'before');
  await expect(page.locator('[data-drop-edge]')).toHaveCount(0);
  await page.mouse.up();
  expect(await storedWorkspace(page)).toEqual(before);
  await start(page, rows(page).nth(1));
  await over(page, rows(page).last(), 'after');
  await page.mouse.up();
  await expect(titles(page)).toHaveText(['pinned', 'last', 'first']);
  const data = await storedWorkspace(page);
  const afterTask = data.tasks.find((t) => t.id === fixtureId('hidden'));
  invariant(afterTask !== undefined, 'Missing hidden task after moving');
  const { order: afterOrder, ...after } = afterTask;
  const beforeTask = before.tasks.find((t) => t.id === fixtureId('hidden'));
  invariant(beforeTask !== undefined, 'Missing hidden task before moving');
  const { order: beforeOrder, ...original } = beforeTask;
  expect(after).toEqual(original);
});

test('long list auto-scroll reaches the tail while the source stays mounted', async ({ page }) => {
  await fixture(
    page,
    Array.from({ length: 35 }, (_, i) => task(`Order ${i}`, { order: i })),
  );
  const sourceId = await rows(page).first().getAttribute('data-task-id');
  expect(sourceId).not.toBeNull();
  const source = page.locator(`.task-row[data-task-id="${sourceId}"]`);
  await start(page, source);
  const scroll = page.locator('.task-scroll');
  const box = await visibleBox(scroll);

  await page.mouse.move(box.x + 130, box.y + box.height - 8, { steps: 5 });
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop), {
      timeout: 8000,
    })
    .toBeLessThanOrEqual(2);
  await expect(source).toBeAttached();
  await over(page, rows(page).last(), 'after');
  await page.mouse.up();
  await expect(titles(page).last()).toHaveText('Order 0');
});

test('touch long-press reorders on a narrow screen and touch cancellation does not write', async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await seed(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  async function begin() {
    const box = await visibleBox(rows(page).first().locator('.task-content'));

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + 60, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(280);
  }

  const box = await visibleBox(rows(page).last());

  const point = { x: box.x + 100, y: box.y + box.height - 4 };
  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await expect(rows(page).last()).toHaveAttribute('data-drop-edge', 'after');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(titles(page)).toHaveText(['First', 'Second', 'Third']);
  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await expect(rows(page).last()).toHaveAttribute('data-drop-edge', 'after');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(titles(page)).toHaveText(['Second', 'Third', 'First']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

for (const language of ['ko', 'en']) {
  for (const theme of ['dark', 'light']) {
    test(`${language} ${theme} insertion and sidebar drop retain spacing, theme and clear destinations`, async ({
      page,
    }) => {
      await fixture(page, [
        task('Task to drag', { order: 0 }),
        task('Check alignment of a long multiline task title and metadata', { order: 1 }),
      ]);
      const en = language === 'en';
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Language', { exact: true }), language);
      await page
        .locator('.settings-nav')
        .getByRole('button', { name: en ? 'Appearance' : '화면', exact: true })
        .click();
      await page
        .getByRole('radio', {
          name: en ? (theme === 'dark' ? 'Dark' : 'Light') : theme === 'dark' ? '다크' : '라이트',
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: en ? 'Back' : '돌아가기', exact: true }).click();
      for (const width of [1440, 900]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(rows(page)).toHaveCount(2);
        const before = await visibleBox(rows(page).last());
        await start(page, rows(page).first());
        await over(page, rows(page).last(), 'after');
        await expect(rows(page).last()).toHaveAttribute('data-drop-edge', 'after');
        expect(await visibleBox(rows(page).last())).toEqual(before);
        const line = await rows(page)
          .last()
          .evaluate((el) => {
            const s = getComputedStyle(el, '::after');
            const row = getComputedStyle(el);
            return {
              height: s.height,
              left: s.left,
              right: s.right,
              control: row.getPropertyValue('--task-control-size').trim(),
              lineColor: s.backgroundColor,
            };
          });
        expect(line.height).toBe('2px');
        expect(line.left).toBe(line.control);
        expect(line.right).toBe(line.control);
        expect(line.lineColor).not.toBe('rgba(0, 0, 0, 0)');

        const target = page.locator(`[data-task-drop="list:${fixtureId('destination')}"]`);
        const box = await visibleBox(target);
        await sidebarOver(page, `list:${fixtureId('destination')}`);
        expect(await visibleBox(target)).toEqual(box);
        await expect(page.locator('.task-drag-overlay')).toHaveText('Task to drag');
        const cue = await target.evaluate((el) => ({
          shadow: getComputedStyle(el).boxShadow,
          background: getComputedStyle(el).backgroundColor,
        }));
        expect(cue.shadow).toBe('none');
        expect(cue.background).not.toBe('rgba(0, 0, 0, 0)');
        await expect(page.locator('.task-drag-destination')).toHaveCount(0);
        await expect(target).toHaveAttribute(
          'aria-description',
          language === 'en'
            ? 'Drop to move to Destination list'
            : '놓으면 Destination list 목록으로 이동',
        );
        const preview = await page.locator('.task-drag-overlay').evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            height: el.getBoundingClientRect().height,
            line: parseFloat(s.lineHeight),
            padding: s.paddingLeft,
            font: s.fontSize,
          };
        });
        expect(preview.height).toBe(preview.line + 14);
        expect(preview.padding).toBe('12px');
        expect(preview.font).toBe('14px');

        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(page.locator('[data-drop-active],[data-drop-edge]')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false,
        );
      }
    });
  }
}
