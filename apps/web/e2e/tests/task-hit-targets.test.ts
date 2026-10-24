import { type Locator, type Page, expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { browserToday } from '../support/clock';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

type Area = 'tasks' | 'matrix';

async function fixture(page: Page, area: Area) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const data = emptyWorkspace();
  const date = (await browserToday(page)).toString();
  data.tasks = [
    createTaskRecord('Drag the body and its padding', data, {
      id: 'body-source',
      date,
      time: '09:30',
      priority: 3,
      notes: 'Keep notes',
    })!,
    createTaskRecord('Next task', data, { id: 'body-next', priority: 3 })!,
    createTaskRecord('Subtasks', data, {
      id: 'body-child',
      parentId: 'body-source',
      priority: 3,
    })!,
  ];
  await seedWorkspace(page, data);
  await page.reload();
  if (area === 'matrix') {
    await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  }
  const row = page.locator(`.task-row[data-task-id="${fixtureId('body-source')}"]`);
  await expect(row).toBeVisible();
  return row;
}

async function begin(page: Page, row: Locator, region: 'top' | 'end' | 'date') {
  const box = (await (region === 'date' ? row.locator('.row-date') : row).boundingBox())!;
  const point =
    region === 'top'
      ? { x: box.x + box.width / 2, y: box.y + 3 }
      : region === 'end'
        ? { x: box.x + box.width - 5, y: box.y + box.height / 2 }
        : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 8, point.y, { steps: 2 });
  await expect(page.locator('.task-drag-overlay')).toBeVisible();
  await expect(page.locator('.task-detail')).toBeHidden();
}

async function cancel(page: Page) {
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.task-drag-overlay')).toBeHidden();
}

for (const area of ['tasks', 'matrix'] as const) {
  for (const region of ['top', 'end', 'date'] as const) {
    test(`${area}: ${region} of the visible row can be grabbed without changing data on cancel`, async ({
      page,
    }) => {
      const row = await fixture(page, area);
      const before = await storedWorkspace(page);
      await expect(row).toHaveCSS('cursor', 'grab');
      await begin(page, row, region);
      await expect(row).toHaveCSS('cursor', 'grabbing');
      await cancel(page);
      expect(await storedWorkspace(page)).toEqual(before);
    });
  }

  test(`${area}: Tab reaches the drag handle and Space never completes the task`, async ({
    page,
  }) => {
    const row = await fixture(page, area);
    const handle = row.locator('.task-content');
    await row.locator('.task-check').focus();
    await page.keyboard.press('Tab');
    await expect(handle).toBeFocused();
    await expect(handle).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(page.locator('.task-drag-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(handle).toBeFocused();
    expect(
      (await storedWorkspace(page)).tasks.find((task) => task.id === fixtureId('body-source'))!
        .completedAt,
    ).toBeNull();
  });

  test(`${area}: completion and inline editing stay independent from dragging`, async ({
    page,
  }) => {
    const row = await fixture(page, area);
    await row.focus();
    await page.keyboard.press('F2');
    const input = row.getByRole('textbox');
    await expect(input).toBeFocused();
    await input.fill('Title being edited');
    const box = (await input.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
    await input.press('Escape');
    await expect(row.locator('.task-title')).toHaveText('Drag the body and its padding');
    await row.locator('.task-check').press('Space');
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
    await expect
      .poll(async () =>
        Boolean(
          (await storedWorkspace(page)).tasks.find((task) => task.id === fixtureId('body-source'))!
            .completedAt,
        ),
      )
      .toBe(true);
  });

  test(`${area}: clicking row padding opens details and checkbox hover retains its control cursor`, async ({
    page,
  }) => {
    const row = await fixture(page, area);
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2);
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
    await expect(page.locator('.task-detail .td-title')).toHaveValue(
      'Drag the body and its padding',
    );
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
    await expect(row.locator('.task-check')).not.toHaveCSS('cursor', 'grab');
  });

  test(`${area}: pressing the completion control cannot start a pointer drag`, async ({ page }) => {
    const row = await fixture(page, area);
    const box = (await row.locator('.task-check').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
    await page.mouse.up();
    expect(
      (await storedWorkspace(page)).tasks.find((task) => task.id === fixtureId('body-source'))!
        .completedAt,
    ).toBeNull();
  });

  test(`${area}: Enter opens details from the keyboard drag handle`, async ({ page }) => {
    const row = await fixture(page, area);
    await row.locator('.task-check').focus();
    await page.keyboard.press('Tab');
    await expect(row.locator('.task-content')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.task-detail .td-title')).toHaveValue(
      'Drag the body and its padding',
    );
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
  });
}

test('matrix keyboard drop retains focus on the moved task', async ({ page }) => {
  const row = await fixture(page, 'matrix');
  const target = page.locator('.quadrant').nth(1);
  await row.locator('.task-check').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.locator('.task-drag-overlay')).toBeVisible();
  for (let step = 0; step < 24 && !(await target.getAttribute('data-drop-active')); step++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await page.keyboard.press('Space');
  await expect(
    target.locator(`[data-task-id="${fixtureId('body-source')}"] .task-content`),
  ).toBeFocused();
});

test('resizing during repeated keyboard transfers cancels without changing task properties', async ({
  page,
}) => {
  const row = await fixture(page, 'matrix');
  const before = await storedWorkspace(page);
  for (let iteration = 0; iteration < 5; iteration++) {
    await row.locator('.task-content').press('Space');
    await expect(page.locator('.task-drag-overlay')).toBeVisible();
    const target = page.locator('.quadrant').nth(1);
    for (let step = 0; step < 24 && !(await target.getAttribute('data-drop-active')); step++) {
      await row.locator('.task-content').press('Shift+ArrowRight');
    }
    await expect(target).toHaveAttribute('data-drop-active', 'true');
    await page.setViewportSize({ width: 1158, height: iteration % 2 ? 1244 : 650 });
    await expect(page.locator('.task-drag-overlay')).toBeHidden();
    await expect(row.locator('.task-content')).toBeFocused();
    await row.locator('.task-content').press('Escape');
    expect(await storedWorkspace(page)).toEqual(before);
  }
});

test('list padding drag reaches the final insertion position and disclosure is independent', async ({
  page,
}) => {
  const row = await fixture(page, 'tasks');
  const disclosure = row.getByRole('button', { name: 'Expand subtasks', exact: true });
  await disclosure.click();
  await expect(page.locator('.task-children .task-row')).toBeVisible();
  await expect(page.locator('.task-drag-overlay')).toBeHidden();
  await row.getByRole('button', { name: 'Collapse subtasks', exact: true }).click();
  await begin(page, row, 'end');
  const next = page.locator(`.task-row[data-task-id="${fixtureId('body-next')}"]`);
  const box = (await next.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, { steps: 5 });
  await expect(next).toHaveAttribute('data-drop-edge', 'after');

  await page.mouse.up();
  await expect(page.locator('.task-items-reorderable > .task-row .task-title')).toHaveText([
    'Next task',
    'Drag the body and its padding',
  ]);
});

test('matrix padding drag uses only the destination highlight and preserves task contents', async ({
  page,
}) => {
  const row = await fixture(page, 'matrix');
  const target = page.locator('.quadrant').nth(1);
  const before = (await storedWorkspace(page)).tasks.find(
    (task) => task.id === fixtureId('body-source'),
  )!;
  await begin(page, row, 'end');
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 5 });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await expect(page.locator('.quadrant[data-drop-active]')).toHaveCount(1);

  await page.mouse.up();
  await expect(target.locator(`[data-task-id="${before.id}"]`)).toBeVisible();
  const after = (await storedWorkspace(page)).tasks.find((task) => task.id === before.id)!;
  expect(after.priority).toBe(2);
  expect({ title: after.title, date: after.date, time: after.time, notes: after.notes }).toEqual({
    title: before.title,
    date: before.date,
    time: before.time,
    notes: before.notes,
  });
});
