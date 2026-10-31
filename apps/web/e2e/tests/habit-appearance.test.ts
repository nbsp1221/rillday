import { type Locator, type Page, expect, test } from '@playwright/test';
import { appearance } from '@repo/test-support/browser-appearance';
import { storedWorkspace } from '../support/storage';

async function newHabit(page: Page) {
  await page.getByLabel(/^(Habit Tracker|습관 트래커)$/, { exact: true }).click();
  await page.getByRole('button', { name: /^(Add habit|습관 추가)$/, exact: true }).click();
  await page.getByRole('button', { name: /^(Create your own|직접 만들기)$/, exact: true }).click();
  await page.getByRole('button', { name: /^(Appearance|모양)$/, exact: true }).click();
  return page.locator('.habit-appearance-panel');
}

async function paint(locator: Locator) {
  return locator.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const ancestors: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      ancestors.unshift(node);
    }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1, 1);
    for (const node of ancestors) {
      context.fillStyle = getComputedStyle(node).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
  });
}

for (const theme of ['Dark', 'Light']) {
  test(`appearance tabs, hover and focus remain visible in ${theme}`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const popup = await newHabit(page);
    const icon = popup.getByRole('tab', { name: 'Icon', exact: true });
    await expect(popup.getByLabel('Search icons', { exact: true })).toBeVisible();
    await expect(icon).toHaveAttribute('aria-selected', 'true');
    const indicator = await icon.evaluate((el) => {
      const style = getComputedStyle(el, '::after');
      return { height: style.height, opacity: style.opacity, color: style.backgroundColor };
    });
    expect(indicator.height).toBe('2px');
    expect(indicator.opacity).toBe('1');
    for (const tab of await popup.getByRole('tab').all()) {
      expect((await appearance(tab)).contrast).toBeGreaterThanOrEqual(4.5);
    }
    await icon.focus();
    await page.keyboard.press('ArrowRight');
    const emoji = popup.getByRole('tab', { name: 'Emoji', exact: true });
    await expect(emoji).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(emoji).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(popup.getByLabel('Search emoji', { exact: true })).toBeFocused();
    for (const name of ['No icon', 'Close']) {
      const button = popup.getByRole('button', { name, exact: true });
      await page.mouse.move(0, 0);
      const box = await button.boundingBox();
      const before = await paint(button);
      await button.hover();
      await button.evaluate(async (el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const after = await paint(button);
      // A near-identical hover fill was previously indistinguishable from the popup.
      expect(Math.max(...after.map((v, i) => Math.abs(v - before[i])))).toBeGreaterThanOrEqual(12);
      expect(await button.boundingBox()).toEqual(box);
      expect((await appearance(button)).contrast).toBeGreaterThanOrEqual(4.5);
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
      expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    }
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeFocused();
    await expect(page.locator('.habit-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByLabel('Calendar', { exact: true }).click();
    for (const date of await page
      .locator('.calendar-day.outside .calendar-day-head > button:first-child')
      .all()) {
      expect((await appearance(date)).contrast).toBeGreaterThanOrEqual(4.5);
    }
    await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Year', exact: true }).click();
    const outside = page.locator('.calendar-mini-month button.outside');
    await expect(outside.first()).toBeVisible();
    for (const date of await outside.all()) {
      expect((await appearance(date)).contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
}

for (const locale of ['en', 'ko'] as const) {
  test(`bundled ${locale} emoji search works on the first offline opening`, async ({
    page,
    context,
  }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') {
        outside.push(request.url());
      }
    });
    await page.goto('/');
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload();
    if (locale === 'ko') {
      await page.getByLabel('Settings and backup', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Language', exact: true }).click();
      await page.getByRole('option', { name: '한국어', exact: true }).click();
      await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    }
    await context.setOffline(true);
    const popup = await newHabit(page);
    await popup
      .getByRole('tab', { name: locale === 'ko' ? '이모지' : 'Emoji', exact: true })
      .click();
    const search = popup.getByLabel(locale === 'ko' ? '이모지 검색' : 'Search emoji', {
      exact: true,
    });
    await search.fill(locale === 'ko' ? '빨간 사과' : 'red apple');
    await expect(
      popup.getByRole('gridcell', {
        name: locale === 'ko' ? '빨간 사과' : 'red apple',
        exact: true,
      }),
    ).toBeVisible();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page.locator('.habit-appearance-trigger .habit-custom-glyph')).toContainText(
      /🍎|🍏/,
    );
    expect((await storedWorkspace(page)).habits).toHaveLength(0);
    await popup
      .getByRole('button', { name: locale === 'ko' ? '닫기' : 'Close', exact: true })
      .click();
    await page
      .getByLabel(locale === 'ko' ? '습관 이름' : 'Habit name', { exact: true })
      .fill('Offline emoji');
    await page
      .getByRole('button', { name: locale === 'ko' ? '저장' : 'Save', exact: true })
      .click();
    await expect.poll(async () => (await storedWorkspace(page)).habits[0]?.icon).toBe('🍎');
    await page.reload();
    await page.getByLabel(/^(Habit Tracker|습관 트래커)$/, { exact: true }).click();
    await expect(page.locator('.habit-name .habit-custom-glyph')).toHaveText('🍎');
    expect(outside).toEqual([]);
  });
}

test('a custom symbol applies to the draft without submitting the habit', async ({ page }) => {
  await page.goto('/');
  const popup = await newHabit(page);
  await popup.getByRole('tab', { name: 'Emoji', exact: true }).click();
  const symbol = popup.getByLabel('Use an emoji or symbol', { exact: true });
  await symbol.fill('✦');
  await symbol.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(page.locator('.habit-appearance-trigger')).not.toHaveText('✦');
  await symbol.press('Enter');
  await expect(page.locator('.habit-appearance-trigger')).toHaveText('✦');
  await popup.getByRole('button', { name: 'No icon', exact: true }).click();
  await expect(page.locator('.habit-appearance-trigger')).not.toHaveText('✦');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await storedWorkspace(page)).habits).toHaveLength(0);
});

test('all appearance panels retain reachable actions on a short narrow screen', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 320, height: 540 });
  const popup = await newHabit(page);
  for (const name of ['Icon', 'Emoji', 'Color']) {
    await popup.getByRole('tab', { name, exact: true }).click();
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(312);
    expect(box.y + box.height).toBeLessThanOrEqual(532);
    for (const action of ['No icon', 'Close']) {
      const button = popup.getByRole('button', { name: action, exact: true });
      await expect(button).toBeInViewport();
      await button.hover();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});
