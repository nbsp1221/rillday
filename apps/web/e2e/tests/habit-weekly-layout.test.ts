import { type Page, expect, test } from '@playwright/test';
import { appearance } from '../support/appearance';

async function openWeek(page: Page, theme: string) {
  await page.clock.install({ time: new Date('2026-10-29T03:00:00Z') });
  await page.goto('/?demo=1');
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radio', { name: theme, exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel('Habit Tracker', { exact: true }).click();
}

for (const theme of ['Dark', 'Light']) {
  test(`today remains a clear current-date landmark instead of following record selection in ${theme}`, async ({
    page,
  }) => {
    await openWeek(page, theme);
    const header = page.locator('.habit-table-head');
    const today = header.locator('time[aria-current="date"]');
    await expect(today).toHaveCount(1);
    await expect(today).toHaveText('29');
    await expect(today).toHaveAttribute('datetime', '2026-10-29');
    expect((await appearance(today)).contrast).toBeGreaterThanOrEqual(4.5);
    expect(
      await header
        .locator('time')
        .evaluateAll((days) => days.map((day) => day.getBoundingClientRect().width)),
    ).toEqual(Array(7).fill(28));
    await page.locator('.habit-name').filter({ hasText: 'Drink enough water' }).click();
    await page
      .locator('.habit-history-grid button:not(:disabled):not([aria-pressed="true"])')
      .first()
      .click();
    await expect(today).toHaveAttribute('datetime', '2026-10-29');
    await page.getByLabel('Close details', { exact: true }).click();
    await page.getByLabel('Previous week', { exact: true }).click();
    await expect(today).toHaveCount(0);
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    await expect(today).toHaveCount(1);
  });

  test(`every habit shares action and date axes while completion and unlogged states stay readable in ${theme}`, async ({
    page,
  }) => {
    await openWeek(page, theme);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 1200, 1183, 900, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const rows = await page.locator('.habit-row').evaluateAll((rows) =>
        rows.map((row) => {
          const bounds = row.getBoundingClientRect();
          const menu = row.querySelector('.row-menu-trigger')!.getBoundingClientRect();
          const name = row.querySelector('.habit-name')!;
          const icon = name.querySelector('.habit-symbol')!.getBoundingClientRect();
          const title = name.querySelector('strong')!.getBoundingClientRect();
          const description = name.querySelector('small')!.getBoundingClientRect();
          const progress = name.querySelector('.habit-week-amount')?.getBoundingClientRect();
          const nameBounds = name.getBoundingClientRect();
          const actions = row.querySelector('.habit-menu-anchor')!.getBoundingClientRect();
          const center = {
            x: nameBounds.x + nameBounds.width / 2,
            y: nameBounds.y + nameBounds.height / 2,
          };
          const centerVisible =
            center.x >= 0 && center.x < innerWidth && center.y >= 0 && center.y < innerHeight;
          const nameStyle = getComputedStyle(name);
          const expectedInset =
            Number.parseFloat(getComputedStyle(row).paddingLeft) +
            Number.parseFloat(nameStyle.paddingLeft);
          const heads = [...document.querySelectorAll('.habit-table-head>div')].map((day) => {
            const box = day.getBoundingClientRect();
            return box.x + box.width / 2;
          });
          const cells = [...row.querySelectorAll('.habit-day-wrap')].map((cell, index) => {
            const box = cell.getBoundingClientRect();
            return Math.abs(box.x + box.width / 2 - heads[index]);
          });
          return {
            inset: bounds.right - menu.right,
            menuInside: menu.left >= bounds.left && menu.right <= bounds.right,
            nameAndActionsSeparate: nameBounds.right <= actions.left + 0.5,
            nameCenterReachable:
              !centerVisible || name.contains(document.elementFromPoint(center.x, center.y)),
            iconInset: icon.left - bounds.left,
            leadingInsetError: Math.abs(icon.left - bounds.left - expectedInset),
            titleGap: title.left - icon.right,
            descriptionAxisError: Math.abs(description.left - title.left),
            progressAxisError: progress ? Math.abs(progress.left - title.left) : 0,
            glyphSize: name.querySelector('.habit-symbol svg')!.getBoundingClientRect().width,
            cells,
          };
        }),
      );
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.nameAndActionsSeparate && row.nameCenterReachable)).toBe(true);
      expect(rows.every((row) => row.leadingInsetError < 0.5)).toBe(true);
      expect(rows.every((row) => Math.abs(row.titleGap - 12) < 0.5)).toBe(true);
      expect(
        rows.every((row) => row.descriptionAxisError < 0.5 && row.progressAxisError < 0.5),
      ).toBe(true);
      expect(rows.every((row) => row.glyphSize === 18)).toBe(true);
      expect(rows.every((row) => Math.abs(row.inset - 12) < 0.5 && row.menuInside)).toBe(true);
      expect(
        Math.max(...rows.map((row) => row.iconInset)) -
          Math.min(...rows.map((row) => row.iconInset)),
      ).toBeLessThan(0.5);
      expect(rows.every((row) => row.cells.every((delta) => delta < 1))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
    }
    const completed = page.locator('.habit-day[data-state="complete"]').first();
    const before = await appearance(completed);
    expect(before.contrast).toBeGreaterThanOrEqual(4.5);
    await completed.hover();
    expect((await appearance(completed)).color).toBe(before.color);
    expect((await appearance(completed)).contrast).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('.habit-day[data-state="empty"]').first()).toHaveCSS(
      'border-top-style',
      'solid',
    );
    for (const future of await page.locator('.habit-day[data-state="future"]').all()) {
      await expect(future).toBeDisabled();
    }
    await expect(
      page
        .locator('.habit-row')
        .filter({ hasText: 'Read a book' })
        .locator('.habit-day[data-state="recorded"]')
        .first(),
    ).toHaveText('15');
    await page.locator('.habit-name').filter({ hasText: 'Read a book' }).click();
    const labelWidth = await page
      .locator('.habit-detail .number-stepper-group > label')
      .evaluate((label) => label.getBoundingClientRect().width);
    expect(labelWidth).toBeGreaterThanOrEqual(80);
    const statLabelsFit = await page
      .locator('.habit-detail .habit-stats > div > span')
      .evaluateAll((labels) =>
        labels.every((label) => {
          const box = label.getBoundingClientRect();
          const cell = label.parentElement!.getBoundingClientRect();
          return box.left >= cell.left - 1 && box.right <= cell.right + 1;
        }),
      );
    expect(statLabelsFit).toBe(true);
  });

  test(`checkbox state and hover share one surface in ${theme}`, async ({ page }) => {
    await openWeek(page, theme);
    for (const width of [1183, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const state of ['complete', 'recorded', 'empty']) {
        const cell = page.locator(`.habit-day[data-state="${state}"]:not(:disabled)`).first();
        await page.mouse.move(0, 0);
        const before = await cell.boundingBox();
        expect(before!.width).toBe(28);
        expect(before!.height).toBe(28);
        const normal = await cell.evaluate((el) => {
          const s = getComputedStyle(el);
          return { background: s.backgroundColor, shadow: s.boxShadow, color: s.color };
        });
        const shape = await cell.evaluate((el) => getComputedStyle(el).borderRadius);
        expect(Number.parseFloat(shape)).toBeGreaterThanOrEqual(state === 'recorded' ? 4 : 14);
        await cell.hover();
        await cell.evaluate(async (el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const hover = await cell.evaluate((el) => {
          const s = getComputedStyle(el);
          return { background: s.backgroundColor, shadow: s.boxShadow, color: s.color };
        });
        expect(hover.background !== normal.background || hover.shadow !== normal.shadow).toBe(true);
        expect(hover.color).toBe(normal.color);
        expect(await cell.boundingBox()).toEqual(before);
        expect((await appearance(cell)).contrast).toBeGreaterThanOrEqual(4.5);
        expect(
          await cell.locator('..').evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgba(0, 0, 0, 0)');
        if (state !== 'recorded') {
          await expect(cell).toHaveRole('checkbox');
          await expect(cell).toBeChecked({ checked: state === 'complete' });
          expect(
            await cell.evaluate((el) => {
              const s = getComputedStyle(el, '::after');
              return [s.top, s.right, s.bottom, s.left];
            }),
          ).toEqual(['0px', '0px', '0px', '0px']);
        } else {
          await expect(cell).toHaveRole('button');
        }
        await cell.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(cell).toBeFocused();
        expect(await cell.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
        expect(await cell.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
      }
    }
    const quantity = page.locator('.habit-day[data-state="recorded"]:not(:disabled)').first();
    await quantity.click();
    await expect(page.locator('.habit-record-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(quantity).toBeFocused();
    const cells = page.locator('.habit-day');
    const completedIndex = await cells.evaluateAll((cells) =>
      cells.findIndex(
        (cell) => cell.getAttribute('aria-checked') === 'true' && !cell.matches(':disabled'),
      ),
    );
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    const toggle = cells.nth(completedIndex);
    const name = await toggle.getAttribute('aria-label');
    await toggle.press('Space');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAccessibleName(name!);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAccessibleName(name!);
    await page.reload();
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await expect(cells.nth(completedIndex)).toBeChecked();
  });
}
