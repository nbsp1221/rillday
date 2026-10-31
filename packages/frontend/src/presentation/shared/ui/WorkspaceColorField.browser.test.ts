import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  for (const locale of ['en', 'ko']) {
    test(`custom color keeps input focus across deferred popup restoration in ${locale}/${theme}`, async ({
      mount,
      page,
    }) => {
      const component = await mount('Colors', { theme, locale });
      const trigger = component.getByRole('button', { name: 'Color', exact: true });
      await trigger.click();
      await expect(page.getByRole('radio').first()).toBeFocused();
      await page.clock.install({ time: new Date('2026-10-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-01T00:00:01Z'));
      await page
        .getByRole('button', {
          name: locale === 'ko' ? '사용자 지정 색상' : 'Custom color',
          exact: true,
        })
        .click();
      const hex = page.getByRole('textbox');
      await hex.focus();
      await page.clock.runFor(17);
      await expect(hex).toBeFocused();
      await hex.fill('#fff');
      await hex.press('Enter');
      await expect(trigger).toHaveText('#FFFFFF');
      await expect(component.getByLabel('Selected color')).toHaveText('#ffffff');
      await page.clock.runFor(17);
      await expect(trigger).toBeFocused();
    });
  }
}
