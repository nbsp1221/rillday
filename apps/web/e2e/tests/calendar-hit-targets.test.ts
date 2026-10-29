import { type Locator, type Page, expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

async function calendar(page: Page, duration = 120, date = '2026-10-31') {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const data = emptyWorkspace();
  data.tasks = [
    createTaskRecord('Move the full event body', data, {
      id: 'calendar-body',
      date,
      time: '09:00',
      duration,
      notes: 'Keep details',
      priority: 2,
      order: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })!,
  ];
  await seedWorkspace(page, data);
  await page.reload();
  await page.locator('.quick-add').waitFor();
  await page.clock.setFixedTime(new Date(`${date}T03:00:00Z`));
  await page.getByLabel('Calendar', { exact: true }).click();
  await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Week', exact: true }).click();
  await page
    .locator(`.calendar-hour-cell[data-date="${date}"][data-hour="9"]`)
    .scrollIntoViewIfNeeded();
  const card = page.locator(`.calendar-task.timed[data-task-id="${fixtureId('calendar-body')}"]`);
  await expect(card).toBeVisible();
  return { card, date };
}

async function saved(page: Page) {
  return (await storedWorkspace(page)).tasks.find(
    (task) => task.id === fixtureId('calendar-body'),
  )!;
}

async function centerCard(card: Locator) {
  await card.evaluate((element) => {
    const scroller = element.closest('.calendar-time-scroll')!;
    const viewport = scroller.getBoundingClientRect();
    scroller.scrollTop += element.getBoundingClientRect().top - viewport.top - viewport.height / 3;
  });
}

async function grabBody(page: Page, card: Locator, fraction: number) {
  await centerCard(card);
  const box = (await card.boundingBox())!;
  const point = { x: box.x + box.width * 0.6, y: box.y + box.height * fraction };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 8, point.y, { steps: 2 });
  await expect(page.locator('.calendar-view')).toHaveAttribute('data-dragging', 'true');
  return point;
}

for (const date of ['2026-10-01', '2026-10-31']) {
  test(`empty event body moves across days without jumping its time and Escape cancels on ${date}`, async ({
    page,
  }) => {
    const { card } = await calendar(page, 120, date);
    const original = await saved(page);
    const target = page
      .locator('.calendar-hour-cell[data-hour="9"]')
      .filter({ hasNot: card })
      .last();
    const targetDate = (await target.getAttribute('data-date'))!;
    expect(targetDate).not.toBe(date);
    for (const fraction of [0.45, 0.8]) {
      const point = await grabBody(page, card, fraction);
      const bounds = (await target.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, point.y, { steps: 4 });
      const preview = page.locator('.calendar-time-preview');
      await expect(preview).toHaveAttribute('data-date', targetDate);
      await expect(preview).toHaveAttribute('data-time', '09:00');
      expect(await saved(page)).toEqual(original);
      if (fraction === 0.45) {
        await page.keyboard.press('Escape');
        await page.mouse.up();
        expect(await saved(page)).toEqual(original);
      } else {
        await page.mouse.up();
        await expect.poll(async () => (await saved(page)).date).toBe(targetDate);
        expect(await saved(page)).toMatchObject({
          time: '09:00',
          duration: 120,
          notes: original.notes,
        });
        await expect(page.locator('.task-detail')).toHaveCount(0);
      }
    }
  });
}

test('a resized event can be moved from its newly extended lower body', async ({ page }) => {
  const { card } = await calendar(page, 30);
  await centerCard(card);
  const edge = (await card.locator('[data-calendar-resize="end"]').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2 + 96, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).duration).toBe(120);
  const point = await grabBody(page, card, 0.8);
  await page.mouse.move(point.x, point.y + 64, { steps: 4 });
  await expect(page.locator('.calendar-time-preview')).toHaveAttribute('data-time', '10:00');
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).time).toBe('10:00');
  expect((await saved(page)).duration).toBe(120);
  await expect(page.locator('.task-detail')).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
});

test('blank body opens details while checkbox and resize edges keep their own actions', async ({
  page,
}) => {
  const { card } = await calendar(page);
  await card.click({ position: { x: 40, y: 75 } });
  await expect(page.locator('.task-detail')).toBeVisible();
  await page.getByLabel('Close task details', { exact: true }).click();
  const checkbox = card.getByRole('checkbox');
  await checkbox.click();
  await expect.poll(async () => Boolean((await saved(page)).completedAt)).toBe(true);
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging');
  await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).click();
  await checkbox.focus();
  await checkbox.press('Space');
  await expect.poll(async () => Boolean((await saved(page)).completedAt)).toBe(true);
  await expect(page.locator('.calendar-view')).not.toHaveAttribute('data-dragging');
});

for (const duration of [15, 30, 45]) {
  test(`narrow ${duration}-minute events show complete text lines and edges have no decorative bars`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    const { card } = await calendar(page, duration);
    await card.hover();
    expect(
      await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          document.elementFromPoint(bounds.right - 7, bounds.top + 8)?.closest('.calendar-task') ===
          element
        );
      }),
    ).toBe(true);
    const title = card.locator('.calendar-task-title');
    await expect(title).toHaveCSS('-webkit-line-clamp', duration < 45 ? '1' : '2');
    const boxes = await card.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      titleHeight: element.querySelector('.calendar-task-title')!.getBoundingClientRect().height,
    }));
    expect(boxes.titleHeight).toBeLessThanOrEqual(boxes.height - (duration < 30 ? 0 : 8));
    await expect(title.locator('[data-calendar-time]')).toHaveCSS(
      'line-height',
      duration < 30 ? '14px' : '15px',
    );
    for (const edge of ['start', 'end']) {
      const handle = card.locator(`[data-calendar-resize="${edge}"]`);
      expect(await handle.evaluate((element) => getComputedStyle(element, '::after').content)).toBe(
        'none',
      );
      await expect(handle).toHaveCSS('cursor', 'ns-resize');
    }
  });
}
