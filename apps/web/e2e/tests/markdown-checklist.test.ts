import { expect, test } from '@playwright/test';
import { storedWorkspace } from '../support/storage';

for (const theme of ['Light', 'Dark'] as const) {
  test(`Markdown checklist shows an open checkmark and retains pointer and keyboard edits in ${theme}`, async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: 'Settings and backup', exact: true }).click();
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const task = page
      .locator('.task-row')
      .filter({
        has: page.locator('.task-title', {
          hasText: 'Choose three priorities for the coming week',
        }),
      })
      .first();
    await task.locator('.task-title').click();
    const editor = page.getByLabel('Task description', { exact: true });
    const item = editor.getByRole('checkbox', { name: 'Review current projects', exact: true });
    await expect(item).toBeChecked();

    // A checkmark has two joined strokes, not the four sides of a rotated box.
    const borders = await item.evaluate((element) => {
      const glyph = getComputedStyle(element, '::after');
      return {
        top: parseFloat(glyph.borderTopWidth),
        right: parseFloat(glyph.borderRightWidth),
        bottom: parseFloat(glyph.borderBottomWidth),
        left: parseFloat(glyph.borderLeftWidth),
      };
    });
    expect(borders.top).toBe(0);
    expect(borders.left).toBe(0);
    expect(borders.right).toBeGreaterThan(0);
    expect(borders.bottom).toBe(borders.right);

    await item.click({ position: { x: 14, y: 14 } });
    await expect(item).not.toBeChecked();
    await expect
      .poll(async () => {
        const data = await storedWorkspace(page);
        return data.tasks.find(
          (value) => value.title === 'Choose three priorities for the coming week',
        )?.notes;
      })
      .toContain('- [ ] Review current projects');
    await editor.focus();
    await item.focus();
    await expect(item).toBeFocused();
    await item.press('Space');
    await expect(item).toBeChecked();
    await expect
      .poll(async () => {
        const data = await storedWorkspace(page);
        return data.tasks.find(
          (value) => value.title === 'Choose three priorities for the coming week',
        )?.notes;
      })
      .toContain('- [x] Review current projects');

    await page.reload();
    await task.locator('.task-title').click();
    await expect(item).toBeChecked();
  });
}
