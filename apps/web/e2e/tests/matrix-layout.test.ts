import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { createTaskRecord, emptyWorkspace } from '@repo/frontend/application';
import { chooseChoice } from '../support/choice';
import { reloadSavedPage } from '../support/navigation';
import { seedWorkspace, storedWorkspace } from '../support/storage';

test('matrix drops change the task without reordering quadrants or repeating child rows', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const headings = await page.locator('.quadrant-header h2').allTextContents();
  const ids = await page
    .locator('.quadrant .task-row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-task-id')));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(page.locator('.quadrant .subtask-disclosure')).toHaveCount(0);
  const row = page
    .locator('.quadrant .task-row')
    .filter({ hasText: 'Choose three priorities for the coming week' });
  const id = await row.getAttribute('data-task-id');
  await row.dragTo(page.locator('.quadrant').nth(1));
  await expect(page.locator('.quadrant').nth(1).locator(`[data-task-id="${id}"]`)).toBeVisible();
  expect(await page.locator('.quadrant-header h2').allTextContents()).toEqual(headings);
  await page.locator('.quadrant').nth(1).locator(`[data-task-id="${id}"]`).click();
  await expect(page.getByRole('button', { name: 'Set priority', exact: true })).toHaveAttribute(
    'title',
    'Medium priority',
  );
  await page.getByLabel('Close task details', { exact: true }).click();
  const counts = await page.locator('.quadrant').evaluateAll((cards) =>
    cards.map((card) => {
      const countsElement = card.querySelector('.quadrant-count');
      if (countsElement === null) {
        throw new Error("Expected element matching '.quadrant-count'");
      }
      return {
        count: Number(countsElement.textContent),
        rows: card.querySelectorAll('.task-row').length,
      };
    }),
  );
  expect(counts.every((card) => card.count === card.rows)).toBe(true);
});

test('quadrant capture preserves rejected drafts, focuses safely and handles Korean composition', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  const first = page.locator('.quadrant').first();
  const add = first.locator('.quadrant-add-trigger');
  await add.click();
  const input = page.getByLabel('Add task to quadrant', { exact: true });
  await input.fill('#review');
  await input.press('Enter');
  await expect(input).toHaveValue('#review');
  await expect(
    page.getByRole('region', { name: 'Notifications', exact: true }).getByRole('dialog'),
  ).toContainText('Add a task title');
  await add.click();
  await expect(input).toHaveValue('#review');
  await expect(input).toBeFocused();
  await input.fill('한글 입력');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  });
  await expect(first.locator('.task-row')).toHaveCount(0);
  await expect(input).toHaveValue('한글 입력');
  await input.press('Enter');
  await expect(first.locator('.task-title')).toHaveText('한글 입력');
  await expect(input).toHaveValue('');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(add).toBeFocused();
  await page.locator('.quadrant').nth(1).locator('.quadrant-empty').click();
  await expect(input).toBeFocused();
  await input.fill('Planning task');
  await input.press('Enter');
  await expect(page.locator('.quadrant').nth(1).locator('.task-title')).toHaveText('Planning task');
});

test('matrix card edges, row spacing and header controls stay aligned across responsive layouts', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  for (const width of [1440, 1024, 600, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const geometry = await page.locator('.quadrant').evaluateAll((cards) =>
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        const headerElement = card.querySelector('.quadrant-header');
        if (headerElement === null) {
          throw new Error("Expected element matching '.quadrant-header'");
        }
        const header = headerElement.getBoundingClientRect();
        const rowElement = card.querySelector('.task-row');
        if (rowElement === null) {
          throw new Error("Expected element matching '.task-row'");
        }
        const row = rowElement.getBoundingClientRect();
        const countElement = card.querySelector('.quadrant-count');
        if (countElement === null) {
          throw new Error("Expected element matching '.quadrant-count'");
        }
        const count = countElement.getBoundingClientRect();
        const plusElement = card.querySelector('.quadrant-add-trigger');
        if (plusElement === null) {
          throw new Error("Expected element matching '.quadrant-add-trigger'");
        }
        const plus = plusElement.getBoundingClientRect();
        return {
          left: header.left - box.left,
          right: box.right - header.right,
          top: header.top - box.top,
          rowLeft: row.left - box.left,
          rowRight: box.right - row.right,
          centerError: Math.abs(count.y + count.height / 2 - plus.y - plus.height / 2),
        };
      }),
    );
    for (const card of geometry) {
      expect(card.left).toBe(16);
      expect(card.right).toBe(16);
      expect(card.top).toBe(16);
      expect(card.rowLeft).toBe(16);
      expect(card.rowRight).toBe(16);
      expect(card.centerError).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.locator('.quadrant').first().locator('.quadrant-add-trigger').click();
    const composer = await page.locator('.quadrant-add').evaluate((el) => {
      const a = el.getBoundingClientRect();
      const bElement = el.closest('.quadrant');
      if (bElement === null) {
        throw new Error("Expected element matching '.quadrant'");
      }
      const b = bElement.getBoundingClientRect();
      return [a.left - b.left, b.right - a.right];
    });
    expect(composer).toEqual([16, 16]);
    await page.getByLabel('Add task to quadrant', { exact: true }).press('Escape');
  }
});

test('importance and date mode creates tasks in their chosen quadrant and moves their actual properties', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await page.getByLabel('Matrix settings', { exact: true }).click();
  await chooseChoice(page, page.getByLabel('Grouping', { exact: true }), 'complex');
  await page.getByRole('dialog').getByRole('button', { name: 'Complete', exact: true }).click();
  for (let index = 0; index < 4; index++) {
    const card = page.locator('.quadrant').nth(index);
    await card.locator('.quadrant-add-trigger').click();
    const input = page.getByLabel('Add task to quadrant', { exact: true });
    await input.fill(`Check grouping ${index}`);
    await input.press('Enter');
    await expect(card.locator('.task-title')).toHaveText(`Check grouping ${index}`);
  }
  const source = page.locator('.quadrant').first().locator('.task-row');
  const target = page.locator('.quadrant').last();
  await source.dragTo(target);
  await expect(target.locator('.task-title')).toHaveText(['Check grouping 0', 'Check grouping 3']);
  await expect(
    target.locator('.task-row').filter({ hasText: 'Check grouping 0' }).locator('.task-check'),
  ).toHaveClass(/p1/);
  await expect(
    target.locator('.task-row').filter({ hasText: 'Check grouping 0' }).locator('.row-date'),
  ).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-rillday-quadrant', 'do');
    return transfer;
  });
  const headings = await page.locator('.quadrant-header h2').allTextContents();
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(target).not.toHaveAttribute('data-drop-active');
  expect(await page.locator('.quadrant-header h2').allTextContents()).toEqual(headings);
});

test('matrix choices preserve modal ownership, Tab order, cancellation and saved classification', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Eisenhower Matrix', exact: true }).click();
  await page.getByRole('button', { name: 'Matrix settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Matrix settings', exact: true });
  const choice = page.getByRole('combobox', { name: 'Grouping', exact: true });
  await expect(choice).toBeFocused();
  const before = await storedWorkspace(page);
  await choice.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Priority', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(choice).toBeFocused();
  expect(await storedWorkspace(page)).toEqual(before);
  await choice.press('Space');
  await expect(page.getByRole('option', { name: 'Priority', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'do color', exact: true })).toBeFocused();
  await choice.click();
  await expect(page.getByRole('option', { name: 'Priority', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'Importance + date', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(choice).toHaveAttribute('data-value', 'complex');
  await expect(choice).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Matrix settings', exact: true })).toBeFocused();
  await expect.poll(async () => (await storedWorkspace(page)).matrixMode).toBe('complex');
  await reloadSavedPage(page);
  await page.getByRole('button', { name: 'Eisenhower Matrix', exact: true }).click();
  await page.getByRole('button', { name: 'Matrix settings', exact: true }).click();
  await expect(choice).toHaveAttribute('data-value', 'complex');
});

test('matrix sorts the latest valid date before undated tasks', async ({ page }) => {
  const data = emptyWorkspace();
  for (const [title, date] of [
    ['No date', null],
    ['Distant future', '9999-01-01'],
  ] as const) {
    const task = createTaskRecord(title, data, { date, priority: 2 });
    expect(task).not.toBeNull();
    assert(task !== null, 'Missing task');
    data.tasks.push(task);
  }
  await page.goto('/');
  await expect(page.locator('#quick-add-input')).toBeVisible();
  await seedWorkspace(page, data);
  await page.reload();
  await page.getByLabel('Eisenhower Matrix', { exact: true }).click();
  await expect(page.locator('.quadrant-tasks .task-title')).toHaveText([
    'Distant future',
    'No date',
  ]);
});
