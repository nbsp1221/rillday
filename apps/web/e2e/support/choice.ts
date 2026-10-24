import type { Locator, Page } from '@playwright/test';

export async function chooseChoice(page: Page, control: Locator, value: string | number) {
  const trigger = control.and(page.getByRole('combobox', { includeHidden: true }));
  const name = (await trigger.getAttribute('aria-label'))!;
  await trigger.click();
  const popup = page.getByRole('listbox', { name, exact: true });
  await popup
    .getByRole('option')
    .and(page.locator(`[data-value="${value}"]`))
    .click();
}
