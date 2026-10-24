import { type Dialog, type Page, expect } from '@playwright/test';

export async function reloadSavedPage(page: Page) {
  // Workspace and preference guards remain active until their writes finish.
  await expect
    .poll(() =>
      page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))),
    )
    .toBe(true);

  const warning = Promise.withResolvers<never>();

  const rejectDialog = (dialog: Dialog) => {
    warning.reject(
      new Error(`A completed save must not require a ${dialog.type()} decision during reload`),
    );
    void dialog.dismiss().catch(() => undefined);
  };

  page.on('dialog', rejectDialog);
  try {
    await Promise.race([page.reload(), warning.promise]);
  } finally {
    page.off('dialog', rejectDialog);
  }
}
