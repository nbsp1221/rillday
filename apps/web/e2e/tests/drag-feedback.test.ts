import type { CalendarViewMode } from '@repo/frontend/application';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { type Task, emptyWorkspace } from '@repo/frontend/application';
import { chooseChoice } from '../support/choice';
import { browserToday } from '../support/clock';
import { reloadSavedPage } from '../support/navigation';
import { fixtureId, seedWorkspace, storedWorkspace } from '../support/storage';

function calendarTarget(page: Page, view: CalendarViewMode, date: string): Locator {
  switch (view) {
    case 'month':
      return page.locator('.calendar-day').nth(10);
    case 'year':
      return page.locator('.calendar-mini-month').first().locator('[data-calendar-drop]').nth(10);
    case 'agenda':
      return page.locator('.calendar-agenda-day').nth(10);
    case 'day':
    case 'week':
      return page.locator(`.calendar-hour-cell[data-date="${date}"][data-hour="10"]`);
  }
}

async function fixture(page: Page) {
  await page.goto('/');
  await page.locator('.quick-add').waitFor();
  const today = (await browserToday(page)).toString();

  const make = (
    id: string,
    priority: Task['priority'],
    date: string | null = null,
    time: string | null = null,
  ): Task => ({
    notesFormat: 'markdown',
    id,
    title:
      id === 'source' ? 'Organize research' : id === 'loose' ? 'Read a book' : 'Plan the next step',
    priority,
    date,
    time,
    duration: 45,
    notes: 'Keep notes',
    listId: 'inbox',
    tags: [],
    repeat: null,
    reminderMinutes: null,
    parentId: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: '2026-01-01T00:00:00.000Z',
    order: priority,
    deleted: false,
    pinned: false,
  });

  const data = emptyWorkspace();
  data.tasks = [make('source', 3, today, '09:30'), make('other', 2), make('loose', 1)];
  await seedWorkspace(page, data);
  await page.reload();
  return today;
}

async function start(page: Page, row: Locator, calendar = false) {
  const handle = row.locator(calendar ? '.calendar-task-title' : '.task-content');
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + Math.min(45, box.width / 2), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(45, box.width / 2) + 8, box.y + box.height / 2, {
    steps: 2,
  });
  await expect(page.locator('.task-drag-overlay')).toBeVisible();
}

async function over(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2), { steps: 4 });
}

async function cancel(page: Page) {
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-drop-active],.calendar-drop-preview')).toHaveCount(0);
}

const source = (page: Page) => page.locator(`.quadrant [data-task-id="${fixtureId('source')}"]`);

test('matrix ignores its current quadrant and outside pointer positions without writing', async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const before = await storedWorkspace(page);
  await start(page, source(page));
  await expect(page.locator('.quadrant.drop-hover,.quadrant[data-drop-active]')).toHaveCount(0);
  const target = page.locator('.quadrant').nth(1);
  await over(page, target);
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await page.mouse.move(100, 25, { steps: 4 });
  await expect(page.locator('.quadrant.drop-hover,.quadrant[data-drop-active]')).toHaveCount(0);
  await page.mouse.up();
  expect(await storedWorkspace(page)).toEqual(before);
  await start(page, source(page));
  await over(page, target);
  await cancel(page);
  expect(await storedWorkspace(page)).toEqual(before);
});

for (const complex of [false, true]) {
  test(`matrix ${complex ? 'importance/date' : 'priority'} target is the only cue and matches the saved properties`, async ({
    page,
  }) => {
    await fixture(page);
    await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
    if (complex) {
      await page.getByLabel('Matrix settings', { exact: true }).click();
      await chooseChoice(page, page.getByLabel('Grouping', { exact: true }), 'complex');
      await page.getByRole('dialog').getByRole('button', { name: 'Complete', exact: true }).click();
    }
    const before = (await storedWorkspace(page)).tasks.find(
      (task) => task.id === fixtureId('source'),
    )!;
    const target = page.locator('.quadrant').last();
    const box = await target.boundingBox();
    await start(page, source(page));
    await over(page, target);
    await expect(page.locator('.quadrant[data-drop-active]')).toHaveCount(1);
    expect(await target.boundingBox()).toEqual(box);
    await expect(target).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.task-drag-overlay')).toHaveText('Organize research');
    await expect(page.locator('.task-drag-announcement[aria-live]')).toContainText(
      (await target.getAttribute('aria-label')) ?? '',
    );
    await page.mouse.up();
    await expect(target.locator(`[data-task-id="${fixtureId('source')}"]`)).toBeVisible();
    await expect
      .poll(async () => {
        const task = (await storedWorkspace(page)).tasks.find((task) => task.id === before.id)!;
        return {
          priority: task.priority,
          dateChangedAsExpected: complex ? task.date! > before.date! : task.date === before.date,
          notes: task.notes,
          time: task.time,
        };
      })
      .toEqual({
        priority: complex ? 1 : 0,
        dateChangedAsExpected: true,
        notes: before.notes,
        time: before.time,
      });
    const after = (await storedWorkspace(page)).tasks.find((task) => task.id === before.id)!;
    expect(after.notes).toBe(before.notes);
    expect(after.time).toBe(before.time);
    expect(after.priority).toBe(complex ? 1 : 0);
    if (complex) {
      expect(after.date! > before.date!).toBe(true);
    } else {
      expect(after.date).toBe(before.date);
    }
    await reloadSavedPage(page);
    await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
    await expect(
      page
        .locator('.quadrant')
        .last()
        .locator(`[data-task-id="${fixtureId('source')}"]`),
    ).toBeVisible();
  });
}

test('matrix touch cancellation and long-press drop share the pointer destination', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 760, height: 800 });
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const before = await storedWorkspace(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const target = page.locator('.quadrant').nth(1);
  const box = (await target.boundingBox())!;
  const to = { x: box.x + box.width / 2, y: box.y + 70 };

  async function begin() {
    const from = (await source(page).locator('.task-content').boundingBox())!;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x + 40, y: from.y + from.height / 2 }],
    });
    await page.waitForTimeout(280);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
    await expect(target).toHaveAttribute('data-drop-active', 'true');
  }

  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await storedWorkspace(page)).toEqual(before);
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  await begin();
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(target.locator(`[data-task-id="${fixtureId('source')}"]`)).toBeVisible();
});

test('matrix keyboard drag cancels safely and commits only its highlighted quadrant', async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const before = await storedWorkspace(page);
  const target = page.locator('.quadrant').nth(1);

  async function begin() {
    await source(page).locator('.task-content').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.task-drag-overlay')).toBeVisible();
    for (let i = 0; i < 24 && !(await target.getAttribute('data-drop-active')); i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await expect(target).toHaveAttribute('data-drop-active', 'true');
  }

  await begin();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-drop-active]')).toHaveCount(0);
  expect(await storedWorkspace(page)).toEqual(before);
  await begin();
  await page.keyboard.press('Space');
  await expect(target.locator(`[data-task-id="${fixtureId('source')}"]`)).toBeVisible();
});

for (const language of ['ko', 'en']) {
  for (const theme of ['dark', 'light']) {
    test(`${language} ${theme} calendar and matrix feedback stays contextual at desktop and narrow widths`, async ({
      page,
    }) => {
      const today = await fixture(page);
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

      await page.getByLabel(en ? 'Calendar' : '캘린더', { exact: true }).click();
      const before = await storedWorkspace(page);
      const modes = {
        month: en ? 'Month' : '월',
        day: en ? 'Day' : '일',
        week: en ? 'Week' : '주',
        year: en ? 'Year' : '연',
        agenda: en ? 'Agenda' : '일정',
      };
      for (const width of [1440, 900]) {
        for (const view of ['month', 'day', 'week', 'year', 'agenda'] as const) {
          await page.setViewportSize({ width, height: 800 });
          await page
            .getByRole('button', { name: en ? 'Calendar view' : '캘린더 보기', exact: true })
            .click();
          await page.getByRole('menuitemradio', { name: modes[view], exact: true }).click();
          const target = calendarTarget(page, view, today);
          const root = await page.locator('.calendar-view').boundingBox();
          await start(
            page,
            page.locator(`.calendar-undated [data-task-id="${fixtureId('loose')}"]`),
            true,
          );
          await over(page, target);
          const preview = page.locator(
            view === 'day' || view === 'week' ? '.calendar-time-preview' : '.calendar-drop-preview',
          );
          if (view !== 'year') {
            await expect(preview).toHaveCount(1);
          }
          if (view !== 'day' && view !== 'week') {
            await expect(target).toHaveAttribute('data-drop-active', 'true');
            await expect(target).toHaveCSS('box-shadow', 'none');
          }
          const live = page.locator('.calendar-drag-status');
          await expect(live).not.toBeEmpty();
          await expect(live).toHaveCSS('clip-path', 'inset(50%)');
          await expect(live).toHaveCSS('width', '1px');
          await expect(page.locator('.task-drag-overlay')).toHaveText('Read a book');
          expect(await page.locator('.calendar-view').boundingBox()).toEqual(root);

          await cancel(page);
        }
      }

      await page.setViewportSize({ width: 360, height: 800 });
      await page
        .getByRole('button', { name: en ? 'Calendar view' : '캘린더 보기', exact: true })
        .click();
      await page.getByRole('menuitemradio', { name: modes.day, exact: true }).click();
      const timedTask = page.locator(`.calendar-task.timed[data-task-id="${fixtureId('source')}"]`);
      const narrowTargets = {
        'time': {
          row: page.locator(`.calendar-undated [data-task-id="${fixtureId('loose')}"]`),
          target: calendarTarget(page, 'day', today),
        },
        'all-day': {
          row: timedTask,
          target: page.locator(`.calendar-all-day>[data-date="${today}"]`),
        },
        'undated': { row: timedTask, target: page.locator('.calendar-undated') },
      };
      for (const [kind, { row, target }] of Object.entries(narrowTargets)) {
        await start(page, row, true);
        await over(page, target);
        if (kind === 'time') {
          await expect(page.locator('.calendar-time-preview')).toBeVisible();
        } else {
          await expect(target).toHaveAttribute('data-drop-active', 'true');
          await expect(target).toHaveCSS('box-shadow', 'none');
        }
        await expect(page.locator('.calendar-drag-status')).toHaveCSS('clip-path', 'inset(50%)');

        await cancel(page);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth > innerWidth ||
              document.documentElement.scrollHeight > innerHeight,
          ),
        ).toBe(false);
      }

      for (const width of [1440, 900, 360]) {
        await page.setViewportSize({ width, height: 800 });
        await page
          .getByLabel(en ? 'Eisenhower Matrix' : '아이젠하워 매트릭스', { exact: true })
          .click();
        const target = page.locator('.quadrant').nth(1);
        const box = await target.boundingBox();
        await start(page, source(page));
        await over(page, target);
        await expect(target).toHaveAttribute('data-drop-active', 'true');
        await expect(target).toHaveCSS('box-shadow', 'none');
        expect(await target.boundingBox()).toEqual(box);
        await expect(page.locator('.quadrant-empty').first()).toBeHidden();
        await expect(page.locator('.task-drag-overlay')).toHaveText('Organize research');

        await cancel(page);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth > innerWidth ||
              document.documentElement.scrollHeight > innerHeight,
          ),
        ).toBe(false);
      }
      expect(await storedWorkspace(page)).toEqual(before);
    });
  }
}
