import { type Locator, type Page, expect, test } from '@playwright/test';
import { type Task, emptyWorkspace } from '@repo/frontend/application';
import { browserToday } from '../support/clock';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

async function seed(page: Page, scheduled = false, recurring = false) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const today = (await browserToday(page)).toString();

  const task = (
    id: string,
    title: string,
    date: string | null,
    time: string | null,
    duration: number,
  ): Task => ({
    id,
    title,
    date,
    time,
    duration,
    notes: '**Keep notes**',
    notesFormat: 'markdown',
    listId: 'inbox',
    tags: ['Review'],
    priority: 3,
    repeat: null,
    reminderMinutes: 10,
    parentId: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    deleted: false,
    pinned: true,
  });

  const fixture = emptyWorkspace();
  fixture.tasks = [
    task('source', 'Drag source', scheduled ? today : null, scheduled ? '09:30' : null, 45),
    task('block', 'Long event', today, '09:00', 120),
  ];
  if (recurring) {
    fixture.tasks[0].repeat = { frequency: 'daily', interval: 1 };
  }
  await seedWorkspace(page, fixture);
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).click();
  return today;
}

async function sourceRecord(page: Page) {
  return (await storedWorkspace(page)).tasks.find((t) => t.id === fixtureId('source'))!;
}

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

async function start(page: Page, source: Locator) {
  await page.mouse.up();
  const handle = source.locator('.calendar-task-title');
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, { steps: 2 });
  await expect(page.locator('.calendar-view')).toHaveAttribute('data-dragging', 'true');
}

async function over(page: Page, target: Locator, point?: { clientX: number; clientY: number }) {
  if (!point) {
    await target.scrollIntoViewIfNeeded();
  }
  const box = (await target.boundingBox())!;
  await page.mouse.move(
    point?.clientX ?? box.x + box.width / 2,
    point?.clientY ?? box.y + Math.min(40, box.height / 2),
    { steps: 3 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
}

async function drop(page: Page, target: Locator, point?: { clientX: number; clientY: number }) {
  await over(page, target, point);
  await page.mouse.up();
}

test('late events retain their wall-clock position and clip at midnight after reload', async ({
  page,
}) => {
  await seed(page, true);
  const data = await storedWorkspace(page);
  const task = data.tasks.find((item) => item.id === fixtureId('source'))!;

  task.time = '23:30';
  task.duration = 90;
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).click();
  await mode(page, 'Day');

  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await page.getByLabel('Calendar', { exact: true }).click();
    }

    await page.locator('.calendar-time-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const event = page.locator(`.calendar-task.timed[data-task-id="${fixtureId('source')}"]`);

    await expect(event).toBeVisible();
    expect(
      await event.evaluate((element) => ({
        top: element.style.top,
        height: element.style.height,
        hour: element.closest<HTMLElement>('[data-hour]')?.dataset.hour,
      })),
    ).toEqual({ top: '32px', height: '32px', hour: '23' });
    expect(await sourceRecord(page)).toMatchObject({ time: '23:30', duration: 90 });
  }
});

test('pointer month drag previews the destination before saving and supports Undo', async ({
  page,
}) => {
  await seed(page);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  const cell = page.locator('.calendar-day').nth(10);
  const date = (await cell.getAttribute('data-date'))!;
  const before = await sourceRecord(page);
  const a = (await source.boundingBox())!;
  const b = (await cell.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2, b.y + 45);
  await expect(cell).toHaveAttribute('data-drop-active', 'true');
  await expect(cell.locator('.calendar-drop-preview')).toHaveText('Drag source');
  await expect(page.locator('.calendar-drag-status')).toContainText('Drop');
  expect(await sourceRecord(page)).toEqual(before);
  await page.mouse.up();
  await expect.poll(async () => (await sourceRecord(page)).date).toBe(date);
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging');
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  await over(page, page.locator('.calendar-day').nth(11));
  const status = page.locator('.calendar-drag-status');
  await expect(status).toHaveClass(/task-drag-announcement/);
  await expect(status).toHaveCSS('clip-path', 'inset(50%)');
  await expect(status).toHaveCSS('width', '1px');
  await expect(status).toHaveCSS('height', '1px');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => sourceRecord(page))
    .toMatchObject({ ...before, updatedAt: expect.any(String) });
});

for (const view of ['Day', 'Week']) {
  test(`${view} preview and drop use the pointer time over a spanning event, not its starting-hour parent`, async ({
    page,
  }) => {
    const today = await seed(page);
    await mode(page, view);
    await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop = 8 * 64));
    const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
    const block = page.locator(`[data-task-id="${fixtureId('block')}"]`);
    const cell = page.locator(`.calendar-hour-cell[data-date="${today}"][data-hour="10"]`);
    const box = (await cell.boundingBox())!;
    const x = box.x + 20;
    const y = box.y + 33;
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId,
        { x, y },
      ),
    ).toBe(fixtureId('block'));
    const before = await sourceRecord(page);
    await start(page, source);
    await over(page, block, { clientX: x, clientY: y });
    const preview = page.locator('.calendar-time-preview');
    await expect(preview).toHaveAttribute('data-time', '10:30');
    await expect(preview).toHaveAttribute('data-date', today);
    expect(await sourceRecord(page)).toEqual(before);
    expect(
      await preview.evaluate((el) => ({
        top: parseFloat(el.style.top),
        height: parseFloat(el.style.height),
        pointer: getComputedStyle(el).pointerEvents,
      })),
    ).toEqual({ top: 672, height: 46, pointer: 'none' });
    await drop(page, block, { clientX: x, clientY: y });
    await expect
      .poll(async () => {
        const record = await sourceRecord(page);
        return { ...record, updatedAt: before.updatedAt };
      })
      .toEqual({
        ...before,
        date: today,
        time: '10:30',
        zone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      });
    await expect(preview).toHaveCount(0);
    await page.reload();
    await page.getByLabel('Calendar', { exact: true }).click();
    await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop = 8 * 64));
    await expect(
      page.locator(`.calendar-task.timed[data-task-id="${fixtureId('source')}"]`),
    ).toBeAttached();
  });
}

test('all-day clears time and undated announces removal; existing metadata is preserved', async ({
  page,
}) => {
  const today = await seed(page, true);
  await mode(page, 'Week');
  const before = await sourceRecord(page);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  const allDay = page.locator(`.calendar-all-day > [data-date="${today}"]`);
  await start(page, source);
  await over(page, allDay);
  await expect(page.locator('.calendar-drag-status')).toContainText('All day');
  await drop(page, allDay);
  await expect.poll(async () => (await sourceRecord(page)).time).toBeNull();
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  const undated = page.locator('.calendar-undated');
  await over(page, undated);
  await expect(page.locator('.calendar-drag-status')).toContainText('remove date and time');
  await drop(page, undated);
  await expect
    .poll(async () => {
      const record = await sourceRecord(page);
      return { ...record, updatedAt: before.updatedAt };
    })
    .toEqual({ ...before, date: null, time: null, zone: null });
});

test('Escape, outside targets and foreign drags never mutate or leave a destination behind', async ({
  page,
}) => {
  await seed(page);
  const before = await sourceRecord(page);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  const cell = page.locator('.calendar-day').nth(10);
  await start(page, source);
  await over(page, cell);
  await expect(cell).toHaveAttribute('data-drop-active', 'true');
  await page.keyboard.press('Escape');
  await drop(page, cell);
  expect(await sourceRecord(page)).toEqual(before);
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  await start(page, source);
  await over(page, cell);
  await over(page, page.locator('.calendar-toolbar'));
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  await drop(page, page.locator('.calendar-toolbar'));
  expect(await sourceRecord(page)).toEqual(before);
  const foreign = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'source');
    return data;
  });
  await cell.dispatchEvent('dragover', { dataTransfer: foreign });
  await cell.dispatchEvent('drop', { dataTransfer: foreign });
  expect(await sourceRecord(page)).toEqual(before);
});

for (const view of ['Year', 'Agenda']) {
  test(`${view} identifies exactly one date destination and commits that preview`, async ({
    page,
  }) => {
    await seed(page);
    await mode(page, view);
    const target = page.locator('[data-calendar-drop="date"]').nth(view === 'Year' ? 35 : 10);
    const date = (await target.getAttribute('data-date'))!;
    await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
    await over(page, target);
    await expect(page.locator('[data-drop-active="true"]')).toHaveCount(1);
    await expect(target).toHaveAttribute('data-drop-active', 'true');
    await expect(page.locator('.calendar-drag-status')).not.toBeEmpty();
    await drop(page, target);
    await expect.poll(async () => (await sourceRecord(page)).date).toBe(date);
  });
}

test('same-position drop is a no-op, and scrolling updates a pending time without extending the document', async ({
  page,
}) => {
  const today = await seed(page, true);
  const before = await sourceRecord(page);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  const same = page.locator(`.calendar-day[data-date="${today}"]`);
  await start(page, source);
  await over(page, same);
  await drop(page, same);
  expect(await sourceRecord(page)).toEqual(before);
  await expect(page.locator('.toast')).toHaveCount(0);
  await mode(page, 'Day');
  await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop = 8 * 64));
  const cell = page.locator(`.calendar-hour-cell[data-date="${today}"][data-hour="10"]`);
  const r = (await cell.boundingBox())!;
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  await over(page, cell, { clientX: r.x + 30, clientY: r.y + 33 });
  // Timed events preserve the original grab offset when moving and scrolling.
  await expect(page.locator('.calendar-time-preview')).toHaveAttribute('data-time', '10:15');
  await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop += 64));
  await expect(page.locator('.calendar-time-preview')).toHaveAttribute('data-time', '11:15');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop = 8 * 64));
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  await page.locator('.calendar-time-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = page.locator(`.calendar-hour-cell[data-date="${today}"][data-hour="23"]`);
  const end = (await last.boundingBox())!;
  await over(page, last, { clientX: end.x + 30, clientY: end.y + 49 });
  await expect(page.locator('.calendar-time-preview')).toHaveAttribute('data-time', '23:30');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.keyboard.press('Escape');
  expect(await sourceRecord(page)).toEqual(before);
});

test('removing a recurring schedule previews date, time and repeat removal and Undo restores all three', async ({
  page,
}) => {
  await seed(page, true, true);
  const before = await sourceRecord(page);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  const target = page.locator('.calendar-undated');
  await start(page, source);
  await over(page, target);
  await expect(page.locator('.calendar-drag-status')).toContainText('remove date, time and repeat');
  expect(await sourceRecord(page)).toEqual(before);
  await drop(page, target);
  await expect.poll(async () => (await sourceRecord(page)).repeat).toBeNull();
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => sourceRecord(page))
    .toMatchObject({ ...before, updatedAt: expect.any(String) });
});

test('week headers, all-day destinations and time columns align with long titles and horizontal scrolling', async ({
  page,
}) => {
  await seed(page);
  await mode(page, 'Week');
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  await drop(page, page.locator('.calendar-all-day>[data-calendar-drop]').first());
  for (const width of [1440, 900, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .locator('.calendar-all-day .calendar-task-title')
      .evaluate((el) => (el.textContent = 'A long all-day destination '.repeat(12)));
    for (const scrollLeft of [0, 200]) {
      await page
        .locator('.calendar-timeline')
        .evaluate((el, left) => (el.scrollLeft = left), scrollLeft);
      const axes = await page.evaluate(() => {
        const boxes = (selector: string) =>
          [...document.querySelectorAll(selector)].map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, width: r.width };
          });

        return {
          head: boxes('.calendar-time-head>button'),
          all: boxes('.calendar-all-day>[data-calendar-drop]'),
          time: boxes('.calendar-time-row:first-child .calendar-hour-cell'),
        };
      });
      expect(axes.all).toEqual(axes.head);
      expect(axes.time).toEqual(axes.head);
    }
  }
});

for (const view of ['Month', 'Agenda', 'Day']) {
  test(`${view} pending task occupies the same top-down stack position as the committed task`, async ({
    page,
  }) => {
    const today = await seed(page);
    await mode(page, view);
    const target = page.locator(
      view === 'Month'
        ? `.calendar-day[data-date="${today}"]`
        : view === 'Agenda'
          ? `.calendar-agenda-day[data-date="${today}"]`
          : `.calendar-all-day>[data-date="${today}"]`,
    );
    await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
    await over(page, target);
    const preview = target.locator('.calendar-drop-preview');
    const before = (await preview.boundingBox())!;
    if (view === 'Month') {
      const head = (await target.locator('.calendar-day-head').boundingBox())!;
      const existing = (await target
        .locator(`[data-task-id="${fixtureId('block')}"]`)
        .boundingBox())!;
      expect(before.y).toBe(head.y + head.height + 4);
      expect(before.y + before.height).toBeLessThan(existing.y);
    }
    await drop(page, target);
    await expect.poll(async () => (await sourceRecord(page)).date).toBe(today);
    expect(await target.locator(`[data-task-id="${fixtureId('source')}"]`).boundingBox()).toEqual(
      before,
    );
  });
}

test('empty month and undated previews follow their content headers instead of the panel bottom', async ({
  page,
}) => {
  await seed(page);
  const empty = page.locator('.calendar-day').nth(10);
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  await over(page, empty);
  const head = (await empty.locator('.calendar-day-head').boundingBox())!;
  const preview = (await empty.locator('.calendar-drop-preview').boundingBox())!;
  expect(preview.y).toBe(head.y + head.height + 4);
  await page.keyboard.press('Escape');
  await start(page, page.locator(`[data-task-id="${fixtureId('block')}"]`));
  const target = page.locator('.calendar-undated');
  await over(page, target);
  const pending = (await target.locator('.calendar-drop-preview').boundingBox())!;
  const existing = (await target.locator(`[data-task-id="${fixtureId('source')}"]`).boundingBox())!;
  const input = (await target.locator('.calendar-task-capture').boundingBox())!;
  expect(pending.y).toBeGreaterThanOrEqual(existing.y + existing.height);
  expect(pending.y + pending.height).toBeLessThanOrEqual(input.y);
  await drop(page, target);
  expect(await target.locator(`[data-task-id="${fixtureId('block')}"]`).boundingBox()).toEqual(
    pending,
  );
});

test('calendar drop feedback follows pointer changes and cancellation preserves data', async ({
  page,
}) => {
  await seed(page);
  const source = (await page.locator(`[data-task-id="${fixtureId('source')}"]`).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  try {
    for (const index of [8, 9, 10, 11, 12, 19, 18, 17, 16, 15, 22, 23, 24, 25, 26]) {
      const cell = page.locator('.calendar-day').nth(index);
      const r = (await cell.boundingBox())!;
      await page.mouse.move(r.x + r.width / 2, r.y + 45, { steps: 2 });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          }),
      );
      expect(await cell.getAttribute('data-drop-active')).toBe('true');
    }
  } finally {
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  expect((await sourceRecord(page)).date).toBeNull();
});

test('keyboard movement uses the same destinations and Escape preserves the source', async ({
  page,
}) => {
  await seed(page);
  const handle = page.locator(`[data-task-id="${fixtureId('source')}"] .calendar-task-title`);
  const before = await sourceRecord(page);
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.calendar-view')).toHaveAttribute('data-dragging', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.calendar-drag-status')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging');
  expect(await sourceRecord(page)).toEqual(before);
  await handle.focus();
  await page.keyboard.press('Space');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowLeft');
  }
  await expect(page.locator('.calendar-drag-status')).toContainText('Drop on');
  const target = page.locator('.calendar-day[data-drop-active="true"]');
  await expect(target).toHaveCount(1);
  const expectedDate = await target.getAttribute('data-date');
  expect(expectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const record = await sourceRecord(page);
      return { date: record.date, time: record.time };
    })
    .toEqual({ date: expectedDate, time: null });
});

test('edge auto-scroll refreshes the pending time under a stationary pointer', async ({ page }) => {
  await seed(page);
  await mode(page, 'Day');
  const scroll = page.locator('.calendar-time-scroll');
  await scroll.evaluate((el) => (el.scrollTop = 8 * 64));
  await start(page, page.locator(`[data-task-id="${fixtureId('source')}"]`));
  const box = (await scroll.boundingBox())!;
  const before = await scroll.evaluate((el) => el.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 4 });
  await expect(page.locator('.calendar-time-preview')).toHaveCount(1);
  const preview = page.locator('.calendar-time-preview');
  const initialTime = await preview.getAttribute('data-time');
  expect(initialTime).toMatch(/^\d{2}:\d{2}$/);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 64);
  await expect.poll(() => preview.getAttribute('data-time')).not.toBe(initialTime);
  expect(await preview.getAttribute('data-time')).toMatch(/^\d{2}:\d{2}$/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await sourceRecord(page)).date).toBeNull();
});

test('touch long-press supports a real drop and touch cancellation never writes', async ({
  page,
}) => {
  await seed(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  const begin = async () => {
    const box = (await page
      .locator(`[data-task-id="${fixtureId('source')}"] .calendar-task-title`)
      .boundingBox())!;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(280);
  };

  const target = page.locator('.calendar-day').nth(10);
  const box = (await target.boundingBox())!;
  const date = await target.getAttribute('data-date');
  const point = { x: box.x + box.width / 2, y: box.y + 40 };
  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging');
  expect((await sourceRecord(page)).date).toBeNull();
  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await sourceRecord(page)).date).toBe(date);
});

test('dense month virtualization keeps every task reachable and retains the dragged source while scrolling', async ({
  page,
}) => {
  const today = await seed(page);
  const dense = await storedWorkspace(page);
  const original = dense.tasks.find((task) => task.id === fixtureId('source'))!;
  original.date = today;
  dense.tasks.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      ...original,
      id: fixtureId(`dense-${i}`),
      title: `Dense ${i}`,
    })),
  );
  await seedWorkspace(page, dense);
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).click();
  const cell = page.locator(`.calendar-day[data-date="${today}"]`);
  const source = page.locator(`[data-task-id="${fixtureId('source')}"]`);
  await expect(source).toBeVisible();
  expect(await cell.locator('.calendar-task').count()).toBeLessThan(25);
  await expect(page.locator(`[data-task-id="${fixtureId('dense-99')}"]`)).toHaveCount(0);
  await start(page, source);
  await cell.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator(`[data-task-id="${fixtureId('dense-99')}"]`)).toBeVisible();
  await expect(source).toBeAttached();
  await expect(page.locator('.calendar-view')).toHaveAttribute('data-dragging', 'true');
  const target = page.locator('.calendar-day').nth(10);
  const date = await target.getAttribute('data-date');
  await drop(page, target);
  await expect.poll(async () => (await sourceRecord(page)).date).toBe(date);
  await cell.evaluate((el) => (el.scrollTop = 0));
  await expect(page.locator(`[data-task-id="${fixtureId('dense-0')}"]`)).toBeVisible();
});
