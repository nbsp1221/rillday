import { type Locator, type Page, expect } from '@playwright/test';

export async function expectNonvisualAnnouncement(page: Page, announcement: Locator) {
  await expect(announcement).toHaveAttribute('aria-live', 'polite');
  await expect(announcement).toMatchAriaSnapshot('- status: /.+/');
  // Hiding an already nonvisual announcement must not change the rendered page.
  const visible = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  const previous = await announcement.evaluate((element: HTMLElement) => {
    const previous = element.style.visibility;
    element.style.visibility = 'hidden';
    return previous;
  });
  try {
    expect(await page.screenshot({ animations: 'disabled', caret: 'hide' })).toEqual(visible);
  } finally {
    await announcement.evaluate((element: HTMLElement, previous) => {
      element.style.visibility = previous;
    }, previous);
  }
}
