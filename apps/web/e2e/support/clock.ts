import type { Page } from '@playwright/test';
import { Temporal } from 'temporal-polyfill/implementation';

export async function browserToday(page: Page): Promise<Temporal.PlainDate> {
  const { now, zone } = await page.evaluate(() => ({
    now: Date.now(),
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));

  return Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate();
}
