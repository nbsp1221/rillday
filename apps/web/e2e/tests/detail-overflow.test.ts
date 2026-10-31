import { type Page, expect, test } from '@playwright/test';
import { chooseChoice } from '../support/choice';
import { storedWorkspace } from '../support/storage';

async function expectViewportHeight(page: Page) {
  expect(
    await page.evaluate(() => ({
      viewport: innerHeight,
      document: document.documentElement.scrollHeight,
      body: document.body.scrollHeight,
      scrollTop: document.documentElement.scrollTop,
    })),
  ).toEqual({
    viewport: page.viewportSize()!.height,
    document: page.viewportSize()!.height,
    body: page.viewportSize()!.height,
    scrollTop: 0,
  });
}

test('detail editor portals never add page height across task scopes, matrix, calendar and navigation', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.rillday-app').waitFor();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 600 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await expectViewportHeight(page);
    // Scope selectors remain available through the narrow task navigation control.
    for (const scope of [
      'list:inbox',
      'today',
      'next',
      'all',
      'completed',
      'trash',
      'list:work',
      'tag:review',
    ]) {
      if (viewport.width < 900) {
        await chooseChoice(
          page,
          page.locator('.mobile-task-scope'),
          scope === 'list:work'
            ? `list:${(await storedWorkspace(page)).lists.find((l) => l.name === 'Work and projects')!.id}`
            : scope,
        );
      } else {
        const index = ['list:inbox', 'today', 'next', 'all', 'completed', 'trash'].indexOf(scope);
        if (index >= 0) {
          await page.locator('.smart-lists > button').nth(index).click();
        } else {
          await page
            .locator(scope === 'list:work' ? '.sidebar-list' : '.sidebar-label')
            .filter({ hasText: scope === 'list:work' ? 'Work and projects' : 'review' })
            .locator('button')
            .first()
            .click();
        }
      }
      await page.locator('.task-title').first().click();
      await page.locator('.mdxeditor-popup-container').waitFor({ state: 'attached' });
      await expectViewportHeight(page);
      const gap = await page.locator('.td-body .td-markdown').evaluate((element) => {
        const previous = element.previousElementSibling!;
        const anchor =
          previous.getBoundingClientRect().height > 0 ? previous : previous.previousElementSibling!;
        return element.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;
      });
      expect(gap).toBe(20);
      await page.getByLabel('Close task details', { exact: true }).click();
      await expect(page.locator('.mdxeditor-popup-container')).toHaveCount(0);
      await expectViewportHeight(page);
    }
    for (const area of ['Eisenhower Matrix', 'Calendar']) {
      await page.getByLabel(area, { exact: true }).click();
      await expectViewportHeight(page);
      if (area === 'Calendar') {
        await page.locator('.calendar-task-title').first().click();
      } else {
        await page.locator('.task-title').first().click();
      }
      await page.locator('.mdxeditor-popup-container').waitFor({ state: 'attached' });
      await expectViewportHeight(page);
      await page.getByLabel('Close task details', { exact: true }).click();
      await expectViewportHeight(page);
    }
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await expectViewportHeight(page);
    await expect(page.locator('.mdxeditor-popup-container')).toHaveCount(0);
    await page.getByLabel('Tasks', { exact: true }).click();
  }
});
