import assert from 'node:assert/strict';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { type Task, createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { visibleBox } from '@repo/test-support';
import { browserToday } from '../support/clock';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

async function seed(page: Page, time = '09:00', duration = 60) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const task: Task = {
    id: 'resize-event',
    title: 'Adjust time',
    date: (await browserToday(page)).toString(),
    time,
    duration,
    notes: 'Keep notes',
    notesFormat: 'markdown',
    listId: 'inbox',
    tags: [],
    priority: 2,
    repeat: { frequency: 'daily', interval: 1 },
    reminderMinutes: 10,
    parentId: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    deleted: false,
    pinned: false,
  };
  const data = emptyWorkspace();
  data.tasks = [task];
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Day', exact: true }).click();
  await page
    .locator(`.calendar-hour-cell[data-hour="${Number(time.slice(0, 2))}"]`)
    .scrollIntoViewIfNeeded();
  return page.locator(`.calendar-task.timed[data-task-id="${fixtureId(task.id)}"]`);
}

async function saved(page: Page) {
  const task = (await storedWorkspace(page)).tasks.find(
    (task) => task.id === fixtureId('resize-event'),
  );
  assert(task !== undefined, 'Expected a saved fixture value');
  return task;
}

async function resize(page: Page, card: Locator, edge: 'start' | 'end', minutes: number) {
  await card.scrollIntoViewIfNeeded();
  await card.evaluate((element) => {
    const scroller = element.closest('.calendar-time-scroll');
    if (scroller === null) {
      throw new Error('Missing scroller');
    }
    const card = element.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    scroller.scrollTop += card.top - viewport.top - viewport.height / 3;
  });
  const handle = card.locator(`[data-calendar-resize="${edge}"]`);
  await expect(handle).toHaveCount(1);
  const box = await visibleBox(handle);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(handle).toHaveCSS('cursor', 'ns-resize');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (minutes * 64) / 60, {
    steps: 4,
  });
  await expect(card).toHaveAttribute('data-resizing', '');
}

test('time edges preview immediately and persist both ends without moving the event', async ({
  page,
}) => {
  const card = await seed(page);
  const original = await saved(page);

  await resize(page, card, 'end', 30);
  await expect(card.locator('[data-calendar-time]')).toContainText('10:30');
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging', 'true');
  expect((await saved(page)).duration).toBe(60);
  await expect.poll(async () => (await visibleBox(card)).height).toBe(94);

  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).duration).toBe(90);
  await resize(page, card, 'start', -15);
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).time).toBe('08:45');
  const updated = await saved(page);

  expect(updated.duration).toBe(105);
  for (const key of [
    'date',
    'notes',
    'notesFormat',
    'priority',
    'tags',
    'repeat',
    'reminderMinutes',
    'listId',
  ] as const) {
    expect(updated[key]).toEqual(original[key]);
  }
  await page.reload();
  await expect.poll(async () => (await saved(page)).duration).toBe(105);
});

test('native edge autoscroll keeps the event mounted and cancellation restores its duration', async ({
  page,
}) => {
  const card = await seed(page);
  await resize(page, card, 'end', 15);
  const scroller = page.locator('.calendar-time-scroll');
  const viewport = await visibleBox(scroller);

  const originalScroll = await scroller.evaluate((element) => element.scrollTop);
  const box = await visibleBox(card);

  await page.mouse.move(box.x + box.width / 2, viewport.y + viewport.height - 10);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(originalScroll + 60);
  await expect(card).toHaveAttribute('data-resizing', '');
  expect((await saved(page)).duration).toBe(60);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(card).not.toHaveAttribute('data-resizing');
  expect((await saved(page)).duration).toBe(60);
});

test('pointer resizing clamps to midnight and a fifteen-minute minimum', async ({ page }) => {
  const card = await seed(page, '23:00', 60);
  await resize(page, card, 'end', 60);
  await page.mouse.up();
  expect((await saved(page)).duration).toBe(60);
  await resize(page, card, 'start', 120);
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).time).toBe('23:45');
  expect((await saved(page)).duration).toBe(15);
});

test('Escape, pointer cancellation and blur roll back the preview without saving', async ({
  page,
}) => {
  const card = await seed(page);
  const original = await saved(page);
  const height = (await visibleBox(card)).height;
  for (const reason of ['escape', 'pointercancel', 'blur']) {
    await resize(page, card, 'end', 30);
    if (reason === 'escape') {
      await page.keyboard.press('Escape');
    } else {
      await page.evaluate((reason) => {
        if (reason === 'blur') {
          window.dispatchEvent(new Event('blur'));
        } else {
          const matchedElement = document.querySelector('.calendar-time-scroll');
          if (matchedElement === null) {
            throw new Error("Expected element matching '.calendar-time-scroll'");
          }
          matchedElement.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
        }
      }, reason);
    }
    await page.mouse.up();
    await expect(card).not.toHaveAttribute('data-resizing');
    expect((await visibleBox(card)).height).toBe(height);
    expect(await saved(page)).toEqual(original);
  }
});

test('keyboard edges retain focus across hour rows and enforce fifteen minutes and midnight', async ({
  page,
}) => {
  const card = await seed(page, '09:45', 60);
  const start = card.getByRole('slider', { name: 'Adjust start time', exact: true });
  await start.focus();
  await start.press('ArrowUp');
  await expect.poll(async () => (await saved(page)).time).toBe('10:00');
  await expect(start).toBeFocused();
  expect((await saved(page)).duration).toBe(45);
  await start.press('Home');
  await expect.poll(async () => (await saved(page)).time).toBe('00:00');
  await expect(start).toBeFocused();
  const end = card.getByRole('slider', { name: 'Adjust end time', exact: true });
  await end.press('Home');
  await expect.poll(async () => (await saved(page)).duration).toBe(15);
  await end.press('ArrowDown');
  expect((await saved(page)).duration).toBe(15);
  await end.press('End');
  await expect.poll(async () => (await saved(page)).duration).toBe(1440);
  await end.press('ArrowUp');
  expect((await saved(page)).duration).toBe(1440);
});

test('the final calendar quarter hour fits inside midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T03:00:00Z') });
  const data = emptyWorkspace();
  const task = createTaskRecord('Check midnight boundary', data, {
    date: '2026-10-20',
    time: '23:45',
  });
  expect(task).not.toBeNull();
  assert(task !== null, 'Missing task');
  data.tasks.push(task);
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Day', exact: true }).click();
  await page.locator('.calendar-time-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const event = page.locator('.calendar-task.timed');
  await expect(event).toBeVisible();
  const geometry = await event.evaluate((element) => {
    const cell = element.closest<HTMLElement>('[data-hour]');
    if (cell === null) {
      throw new Error('Missing cell');
    }
    return {
      height: element.style.height,
      overflow: element.getBoundingClientRect().bottom - cell.getBoundingClientRect().bottom,
    };
  });
  expect(geometry).toEqual({ height: '16px', overflow: 0 });
});
