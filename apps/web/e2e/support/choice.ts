import type { Locator, Page } from '@playwright/test';
import invariant from 'tiny-invariant';

export async function chooseChoice(page: Page, control: Locator, value: string | number) {
  const trigger = control.and(page.getByRole('combobox', { includeHidden: true }));
  const name = await trigger.getAttribute('aria-label');
  invariant(name !== null, 'Choice trigger must have an accessible label');
  await trigger.click();
  const popup = page.getByRole('listbox', { name, exact: true });
  await popup
    .getByRole('option')
    .and(page.locator(`[data-value="${value}"]`))
    .click();
}
